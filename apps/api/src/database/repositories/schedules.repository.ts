import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DatabaseConnection } from '../database.connection';
import { type NewScheduleRow, type ScheduleRow, schedules } from '../schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class SchedulesRepository extends BaseRepository {
  constructor(connection: DatabaseConnection) {
    super(connection);
  }

  async insert(schedule: NewScheduleRow): Promise<ScheduleRow> {
    const [created] = await this.db
      .insert(schedules)
      .values(schedule)
      .returning();
    return created;
  }

  async findById(id: string): Promise<ScheduleRow | undefined> {
    return this.db.query.schedules.findFirst({ where: eq(schedules.id, id) });
  }

  async findCurrent(): Promise<ScheduleRow | undefined> {
    return this.db.query.schedules.findFirst({
      where: eq(schedules.isCurrent, true),
    });
  }

  async list(): Promise<ScheduleRow[]> {
    return this.db.select().from(schedules).orderBy(desc(schedules.createdAt));
  }
}
