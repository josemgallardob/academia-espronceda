import { Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DatabaseConnection } from '../database.connection';
import { weeklySlots } from '../schema';
import { BaseRepository } from './base.repository';

export interface WeeklySlotOption {
  id: string;
  dayOfWeek: (typeof weeklySlots.$inferSelect)['dayOfWeek'];
  startTime: string;
  endTime: string;
}

@Injectable()
export class WeeklySlotsRepository extends BaseRepository {
  constructor(connection: DatabaseConnection) {
    super(connection);
  }

  async listActive(): Promise<WeeklySlotOption[]> {
    return this.db
      .select({
        id: weeklySlots.id,
        dayOfWeek: weeklySlots.dayOfWeek,
        startTime: weeklySlots.startTime,
        endTime: weeklySlots.endTime,
      })
      .from(weeklySlots)
      .where(eq(weeklySlots.isActive, true))
      .orderBy(
        sql`case ${weeklySlots.dayOfWeek}
          when 'MONDAY' then 1
          when 'TUESDAY' then 2
          when 'WEDNESDAY' then 3
          when 'THURSDAY' then 4
          when 'FRIDAY' then 5
        end`,
        asc(weeklySlots.startTime),
      );
  }
}
