import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DatabaseConnection } from '../database.connection';
import { type NewTeacherRow, type TeacherRow, teachers } from '../schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class TeachersRepository extends BaseRepository {
  constructor(connection: DatabaseConnection) {
    super(connection);
  }

  async insert(teacher: NewTeacherRow): Promise<TeacherRow> {
    const [created] = await this.db
      .insert(teachers)
      .values(teacher)
      .returning();
    return created;
  }

  async findById(id: string): Promise<TeacherRow | undefined> {
    return this.db.query.teachers.findFirst({ where: eq(teachers.id, id) });
  }

  async listActive(): Promise<TeacherRow[]> {
    return this.db
      .select()
      .from(teachers)
      .where(eq(teachers.isActive, true))
      .orderBy(asc(teachers.displayName));
  }
}
