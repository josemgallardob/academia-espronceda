import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { DatabaseConnection } from '../database.connection';
import {
  type NewPersonRow,
  type PersonRow,
  people,
  personRelationships,
  personSubjects,
  personUnavailableSlots,
  scheduleAssignments,
  subjectTeacherAllocations,
  weeklySlots,
} from '../schema';
import type { PersonStatus, SubjectCode } from '../schema/catalog';
import { BaseRepository } from './base.repository';

export interface PersonSubjectInput {
  subjectCode: SubjectCode;
  weeklyHours: number;
}

export interface PersonAggregate {
  person: PersonRow;
  subjects: PersonSubjectInput[];
  unavailableSlotIds: string[];
  relatedPersonIds: string[];
}

export interface InsertPersonInput {
  person: NewPersonRow;
  subjects: PersonSubjectInput[];
  unavailableSlotIds?: string[];
  relatedPersonIds?: string[];
}

export interface UpdatePersonInput {
  personId: string;
  person: Partial<Omit<PersonRow, 'id' | 'createdAt' | 'status'>>;
  subjects?: PersonSubjectInput[];
  unavailableSlotIds?: string[];
  relatedPersonIds?: string[];
}

export class PeopleActivationConflictError extends Error {}

@Injectable()
export class PeopleRepository extends BaseRepository {
  constructor(connection: DatabaseConnection) {
    super(connection);
  }

  async insert(input: InsertPersonInput): Promise<PersonRow> {
    assertHoursMatch(input.subjects, input.person.weeklyHoursTotal);

    return this.db.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(people)
        .values(input.person)
        .returning();

      await transaction.insert(personSubjects).values(
        input.subjects.map((subject) => ({
          personId: created.id,
          ...subject,
        })),
      );

      if (input.unavailableSlotIds?.length) {
        await transaction.insert(personUnavailableSlots).values(
          input.unavailableSlotIds.map((slotId) => ({
            personId: created.id,
            slotId,
          })),
        );
      }

      if (input.relatedPersonIds?.length) {
        await transaction
          .insert(personRelationships)
          .values(
            input.relatedPersonIds.map((relatedPersonId) =>
              canonicalRelationship(created.id, relatedPersonId),
            ),
          );
      }

      return created;
    });
  }

  async update(input: UpdatePersonInput): Promise<boolean> {
    return this.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ weeklyHoursTotal: people.weeklyHoursTotal })
        .from(people)
        .where(eq(people.id, input.personId))
        .limit(1);
      if (!current) {
        return false;
      }
      const currentSubjects = input.subjects
        ? input.subjects
        : await transaction
            .select({
              subjectCode: personSubjects.subjectCode,
              weeklyHours: personSubjects.weeklyHours,
            })
            .from(personSubjects)
            .where(eq(personSubjects.personId, input.personId));
      assertHoursMatch(
        currentSubjects,
        input.person.weeklyHoursTotal ?? current.weeklyHoursTotal,
      );

      await transaction
        .update(people)
        .set(input.person)
        .where(eq(people.id, input.personId));
      if (input.subjects) {
        await transaction
          .delete(personSubjects)
          .where(eq(personSubjects.personId, input.personId));
        await transaction.insert(personSubjects).values(
          input.subjects.map((subject) => ({
            personId: input.personId,
            ...subject,
          })),
        );
      }

      if (input.unavailableSlotIds) {
        await transaction
          .delete(personUnavailableSlots)
          .where(eq(personUnavailableSlots.personId, input.personId));
        if (input.unavailableSlotIds.length > 0) {
          await transaction.insert(personUnavailableSlots).values(
            input.unavailableSlotIds.map((slotId) => ({
              personId: input.personId,
              slotId,
            })),
          );
        }
      }

      if (input.relatedPersonIds) {
        await transaction
          .delete(personRelationships)
          .where(
            or(
              eq(personRelationships.firstPersonId, input.personId),
              eq(personRelationships.secondPersonId, input.personId),
            ),
          );
        if (input.relatedPersonIds.length > 0) {
          await transaction
            .insert(personRelationships)
            .values(
              input.relatedPersonIds.map((relatedPersonId) =>
                canonicalRelationship(input.personId, relatedPersonId),
              ),
            );
        }
      }

      return true;
    });
  }

  async findById(id: string): Promise<PersonRow | undefined> {
    return this.db.query.people.findFirst({ where: eq(people.id, id) });
  }

  async findAggregateById(id: string): Promise<PersonAggregate | undefined> {
    const person = await this.findById(id);
    if (!person) {
      return undefined;
    }
    return (await this.loadAggregates([person]))[0];
  }

  async listAggregates(status?: PersonStatus): Promise<PersonAggregate[]> {
    const rows = await this.db
      .select()
      .from(people)
      .where(status ? eq(people.status, status) : undefined)
      .orderBy(asc(people.firstSurname), asc(people.firstName), asc(people.id));
    return this.loadAggregates(rows);
  }

  async listByStatus(status: PersonStatus): Promise<PersonRow[]> {
    return this.db
      .select()
      .from(people)
      .where(eq(people.status, status))
      .orderBy(asc(people.firstSurname), asc(people.firstName));
  }

  async existingPersonIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ id: people.id })
      .from(people)
      .where(inArray(people.id, ids));
    return rows.map(({ id }) => id);
  }

  async existingSlotIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ id: weeklySlots.id })
      .from(weeklySlots)
      .where(inArray(weeklySlots.id, ids));
    return rows.map(({ id }) => id);
  }

  async activate(personIds: string[], updatedAt: string): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const candidates = await transaction
        .select({ id: people.id, status: people.status })
        .from(people)
        .where(inArray(people.id, personIds));
      if (
        candidates.length !== personIds.length ||
        candidates.some(({ status }) => status !== 'WAITING_LIST')
      ) {
        throw new PeopleActivationConflictError(
          'Every selected person must exist in the waiting list',
        );
      }

      await transaction
        .update(people)
        .set({ status: 'ACTIVE', updatedAt })
        .where(
          and(inArray(people.id, personIds), eq(people.status, 'WAITING_LIST')),
        );
    });
  }

  async hasScheduleReferences(id: string): Promise<boolean> {
    const assignment = await this.db
      .select({ id: scheduleAssignments.id })
      .from(scheduleAssignments)
      .where(eq(scheduleAssignments.personId, id))
      .limit(1);
    if (assignment.length > 0) {
      return true;
    }
    const allocation = await this.db
      .select({ personId: subjectTeacherAllocations.personId })
      .from(subjectTeacherAllocations)
      .where(eq(subjectTeacherAllocations.personId, id))
      .limit(1);
    return allocation.length > 0;
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(people)
      .where(eq(people.id, id))
      .returning({ id: people.id });
    return deleted.length > 0;
  }

  private async loadAggregates(rows: PersonRow[]): Promise<PersonAggregate[]> {
    if (rows.length === 0) {
      return [];
    }
    const personIds = rows.map(({ id }) => id);
    const [subjectRows, unavailableRows, relationshipRows] = await Promise.all([
      this.db
        .select({
          personId: personSubjects.personId,
          subjectCode: personSubjects.subjectCode,
          weeklyHours: personSubjects.weeklyHours,
        })
        .from(personSubjects)
        .where(inArray(personSubjects.personId, personIds))
        .orderBy(asc(personSubjects.subjectCode)),
      this.db
        .select()
        .from(personUnavailableSlots)
        .where(inArray(personUnavailableSlots.personId, personIds))
        .orderBy(asc(personUnavailableSlots.slotId)),
      this.db
        .select()
        .from(personRelationships)
        .where(
          or(
            inArray(personRelationships.firstPersonId, personIds),
            inArray(personRelationships.secondPersonId, personIds),
          ),
        ),
    ]);

    return rows.map((person) => ({
      person,
      subjects: subjectRows
        .filter(({ personId }) => personId === person.id)
        .map(({ subjectCode, weeklyHours }) => ({
          subjectCode,
          weeklyHours,
        })),
      unavailableSlotIds: unavailableRows
        .filter(({ personId }) => personId === person.id)
        .map(({ slotId }) => slotId),
      relatedPersonIds: relationshipRows
        .filter(
          ({ firstPersonId, secondPersonId }) =>
            firstPersonId === person.id || secondPersonId === person.id,
        )
        .map(({ firstPersonId, secondPersonId }) =>
          firstPersonId === person.id ? secondPersonId : firstPersonId,
        )
        .sort(),
    }));
  }
}

function canonicalRelationship(firstPersonId: string, secondPersonId: string) {
  const [first, second] = [firstPersonId, secondPersonId].sort();
  return { firstPersonId: first, secondPersonId: second };
}

function assertHoursMatch(
  subjects: PersonSubjectInput[],
  weeklyHoursTotal: number,
): void {
  if (subjects.length === 0) {
    throw new Error('A person must have at least one contracted subject');
  }
  const allocatedHours = subjects.reduce(
    (total, subject) => total + subject.weeklyHours,
    0,
  );
  if (allocatedHours !== weeklyHoursTotal) {
    throw new Error(
      'Subject hours must equal the contracted weekly hours total',
    );
  }
}
