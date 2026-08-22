import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DatabaseConnection } from '../database.connection';
import {
  type NewPersonRow,
  type PersonRow,
  people,
  personSubjects,
  personUnavailableSlots,
} from '../schema';
import type { PersonStatus, SubjectCode } from '../schema/catalog';
import { BaseRepository } from './base.repository';

export interface PersonSubjectInput {
  subjectCode: SubjectCode;
  weeklyHours: number;
}

export interface InsertPersonInput {
  person: NewPersonRow;
  subjects: PersonSubjectInput[];
  unavailableSlotIds?: string[];
}

@Injectable()
export class PeopleRepository extends BaseRepository {
  constructor(connection: DatabaseConnection) {
    super(connection);
  }

  async insert(input: InsertPersonInput): Promise<PersonRow> {
    if (input.subjects.length === 0) {
      throw new Error('A person must have at least one contracted subject');
    }

    const allocatedHours = input.subjects.reduce(
      (total, subject) => total + subject.weeklyHours,
      0,
    );
    if (allocatedHours !== input.person.weeklyHoursTotal) {
      throw new Error(
        'Subject hours must equal the contracted weekly hours total',
      );
    }

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

      return created;
    });
  }

  async findById(id: string): Promise<PersonRow | undefined> {
    return this.db.query.people.findFirst({ where: eq(people.id, id) });
  }

  async listByStatus(status: PersonStatus): Promise<PersonRow[]> {
    return this.db
      .select()
      .from(people)
      .where(eq(people.status, status))
      .orderBy(asc(people.firstSurname), asc(people.firstName));
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(people)
      .where(eq(people.id, id))
      .returning({ id: people.id });
    return deleted.length > 0;
  }
}
