import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PeopleActivationConflictError,
  type PersonAggregate,
  type PersonSubjectInput,
  PeopleRepository,
} from '../database/repositories/people.repository';
import type { PersonRow } from '../database/schema';
import { ProblemDetailsException } from '../http/problem-details.exception';
import type {
  ActivatePeopleDto,
  CreatePersonDto,
  UpdatePersonDto,
} from './people.dto';

export interface PersonResponse {
  id: string;
  firstName: string;
  firstSurname: string;
  secondSurname: string | null;
  courseCode: PersonRow['courseCode'];
  subjectHours: PersonSubjectInput[];
  weeklyHoursTotal: number;
  schoolName: string | null;
  unavailableSlotIds: string[];
  relatedPersonIds: string[];
  primaryPhone: string;
  secondaryPhone: string | null;
  isTutored: boolean;
  tutorFullName: string | null;
  comments: string | null;
  status: PersonRow['status'];
  createdAt: string;
  updatedAt: string;
}

export interface PersonListResponse {
  items: PersonResponse[];
  total: number;
}

@Injectable()
export class PeopleService {
  constructor(private readonly peopleRepository: PeopleRepository) {}

  async list(status?: PersonRow['status']): Promise<PersonListResponse> {
    return listResponse(await this.peopleRepository.listAggregates(status));
  }

  async get(personId: string): Promise<PersonResponse> {
    return toResponse(await this.requirePerson(personId));
  }

  async create(input: CreatePersonDto): Promise<PersonResponse> {
    const unavailableSlotIds = input.unavailableSlotIds ?? [];
    const relatedPersonIds = input.relatedPersonIds ?? [];
    const id = randomUUID();
    validateRequiredText(input);
    validateHours(input.subjectHours, input.weeklyHoursTotal);
    validateTutor(input.isTutored, input.tutorFullName);
    await this.validateReferences(id, unavailableSlotIds, relatedPersonIds);

    const now = new Date().toISOString();
    await this.peopleRepository.insert({
      person: {
        id,
        firstName: input.firstName.trim(),
        firstSurname: input.firstSurname.trim(),
        secondSurname: input.secondSurname ?? null,
        courseCode: input.courseCode,
        weeklyHoursTotal: input.weeklyHoursTotal,
        schoolName: input.schoolName ?? null,
        primaryPhone: input.primaryPhone.trim(),
        secondaryPhone: input.secondaryPhone ?? null,
        isTutored: input.isTutored,
        tutorFullName: input.tutorFullName ?? null,
        comments: input.comments ?? null,
        status: input.status,
        createdAt: now,
        updatedAt: now,
      },
      subjects: input.subjectHours,
      unavailableSlotIds,
      relatedPersonIds,
    });
    return this.get(id);
  }

  async update(
    personId: string,
    input: UpdatePersonDto,
  ): Promise<PersonResponse> {
    if (Object.keys(input).length === 0) {
      throw invalidRequest('Debe indicarse al menos un campo para actualizar.');
    }
    const current = await this.requirePerson(personId);
    const subjects = input.subjectHours ?? current.subjects;
    const weeklyHoursTotal =
      input.weeklyHoursTotal ?? current.person.weeklyHoursTotal;
    const isTutored = input.isTutored ?? current.person.isTutored;
    const tutorFullName =
      input.tutorFullName === undefined
        ? current.person.tutorFullName
        : input.tutorFullName;

    validateRequiredText({
      firstName: input.firstName ?? current.person.firstName,
      firstSurname: input.firstSurname ?? current.person.firstSurname,
      primaryPhone: input.primaryPhone ?? current.person.primaryPhone,
    });
    validateHours(subjects, weeklyHoursTotal);
    validateTutor(isTutored, tutorFullName);
    await this.validateReferences(
      personId,
      input.unavailableSlotIds ?? current.unavailableSlotIds,
      input.relatedPersonIds ?? current.relatedPersonIds,
    );

    const personChanges: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    for (const field of [
      'firstName',
      'firstSurname',
      'secondSurname',
      'courseCode',
      'weeklyHoursTotal',
      'schoolName',
      'primaryPhone',
      'secondaryPhone',
      'isTutored',
      'tutorFullName',
      'comments',
    ] as const) {
      if (input[field] !== undefined) {
        personChanges[field] =
          field === 'firstName' ||
          field === 'firstSurname' ||
          field === 'primaryPhone'
            ? input[field].trim()
            : input[field];
      }
    }

    await this.peopleRepository.update({
      personId,
      person: personChanges,
      ...(input.subjectHours === undefined
        ? {}
        : { subjects: input.subjectHours }),
      ...(input.unavailableSlotIds === undefined
        ? {}
        : { unavailableSlotIds: input.unavailableSlotIds }),
      ...(input.relatedPersonIds === undefined
        ? {}
        : { relatedPersonIds: input.relatedPersonIds }),
    });
    return this.get(personId);
  }

  async activate(input: ActivatePeopleDto): Promise<PersonListResponse> {
    try {
      await this.peopleRepository.activate(
        input.personIds,
        new Date().toISOString(),
      );
    } catch (error) {
      if (error instanceof PeopleActivationConflictError) {
        throw new ProblemDetailsException({
          status: 409,
          code: 'PEOPLE_ACTIVATION_CONFLICT',
          title: 'No se pueden activar las personas seleccionadas',
          detail:
            'Todas deben existir y pertenecer actualmente a la lista de espera.',
        });
      }
      throw error;
    }
    const activated = await Promise.all(
      input.personIds.map((personId) => this.requirePerson(personId)),
    );
    return listResponse(activated);
  }

  async delete(personId: string): Promise<void> {
    await this.requirePerson(personId);
    if (await this.peopleRepository.hasScheduleReferences(personId)) {
      throw personReferenced();
    }
    try {
      const deleted = await this.peopleRepository.deleteById(personId);
      if (!deleted) {
        throw personNotFound(personId);
      }
    } catch (error) {
      if (isForeignKeyConstraint(error)) {
        throw personReferenced();
      }
      throw error;
    }
  }

  private async requirePerson(personId: string): Promise<PersonAggregate> {
    const person = await this.peopleRepository.findAggregateById(personId);
    if (!person) {
      throw personNotFound(personId);
    }
    return person;
  }

  private async validateReferences(
    personId: string,
    slotIds: string[],
    relatedPersonIds: string[],
  ): Promise<void> {
    if (new Set(slotIds).size !== slotIds.length) {
      throw invalidRequest('Las franjas no disponibles no pueden repetirse.');
    }
    if (new Set(relatedPersonIds).size !== relatedPersonIds.length) {
      throw invalidRequest('Las personas relacionadas no pueden repetirse.');
    }
    if (relatedPersonIds.includes(personId)) {
      throw invalidRequest(
        'Una persona no puede estar relacionada consigo misma.',
      );
    }
    const [existingSlots, existingPeople] = await Promise.all([
      this.peopleRepository.existingSlotIds(slotIds),
      this.peopleRepository.existingPersonIds(relatedPersonIds),
    ]);
    if (existingSlots.length !== slotIds.length) {
      throw invalidRequest('Alguna franja no disponible no existe.');
    }
    if (existingPeople.length !== relatedPersonIds.length) {
      throw invalidRequest('Alguna persona relacionada no existe.');
    }
  }
}

export function validateHours(
  subjectHours: PersonSubjectInput[],
  weeklyHoursTotal: number,
): void {
  const codes = subjectHours.map(({ subjectCode }) => subjectCode);
  if (new Set(codes).size !== codes.length) {
    throw invalidRequest('Una asignatura no puede aparecer más de una vez.');
  }
  if (
    subjectHours.length === 0 ||
    subjectHours.some(
      ({ weeklyHours }) => !Number.isInteger(weeklyHours) || weeklyHours < 1,
    )
  ) {
    throw invalidRequest(
      'Cada asignatura debe tener al menos una hora semanal entera.',
    );
  }
  const assigned = subjectHours.reduce(
    (total, subject) => total + subject.weeklyHours,
    0,
  );
  if (assigned !== weeklyHoursTotal) {
    throw invalidRequest(
      'La suma de horas por asignatura debe coincidir exactamente con las horas semanales contratadas.',
    );
  }
}

function validateRequiredText(input: {
  firstName: string;
  firstSurname: string;
  primaryPhone: string;
}): void {
  if (
    !input.firstName.trim() ||
    !input.firstSurname.trim() ||
    !input.primaryPhone.trim()
  ) {
    throw invalidRequest(
      'El nombre, el primer apellido y el teléfono principal no pueden estar vacíos.',
    );
  }
}

function validateTutor(
  isTutored: boolean,
  tutorFullName: string | null | undefined,
): void {
  if (isTutored && !tutorFullName?.trim()) {
    throw invalidRequest(
      'Debe indicarse el nombre completo del tutor cuando el alumno está tutorizado.',
    );
  }
}

function toResponse({
  person,
  subjects,
  unavailableSlotIds,
  relatedPersonIds,
}: PersonAggregate): PersonResponse {
  return {
    id: person.id,
    firstName: person.firstName,
    firstSurname: person.firstSurname,
    secondSurname: person.secondSurname,
    courseCode: person.courseCode,
    subjectHours: subjects,
    weeklyHoursTotal: person.weeklyHoursTotal,
    schoolName: person.schoolName,
    unavailableSlotIds,
    relatedPersonIds,
    primaryPhone: person.primaryPhone,
    secondaryPhone: person.secondaryPhone,
    isTutored: person.isTutored,
    tutorFullName: person.tutorFullName,
    comments: person.comments,
    status: person.status,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}

function listResponse(people: PersonAggregate[]): PersonListResponse {
  const items = people.map(toResponse);
  return { items, total: items.length };
}

function invalidRequest(detail: string): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 400,
    code: 'INVALID_PERSON',
    title: 'Datos de persona no válidos',
    detail,
  });
}

function personNotFound(personId: string): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 404,
    code: 'PERSON_NOT_FOUND',
    title: 'Persona no encontrada',
    detail: `No existe ninguna persona con identificador ${personId}.`,
  });
}

function personReferenced(): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 409,
    code: 'PERSON_REFERENCED_BY_SCHEDULE',
    title: 'No se puede eliminar la persona',
    detail:
      'La persona está incluida en un horario borrador o confirmado y sus asignaciones deben conservarse.',
  });
}

function isForeignKeyConstraint(error: unknown): boolean {
  return (
    error instanceof Error && /foreign key constraint/i.test(error.message)
  );
}
