import { Injectable } from '@nestjs/common';
import { eq, inArray, notInArray } from 'drizzle-orm';
import { DatabaseConnection } from '../database.connection';
import {
  type NewTeacherRow,
  type TeacherRow,
  scheduleTeachers,
  teacherAvailableSlots,
  teacherCourses,
  teacherSubjects,
  teachers,
} from '../schema';
import {
  type CourseCode,
  type SubjectCode,
  type TeacherProfile,
  teacherProfileSortIndex,
} from '../schema/catalog';
import { BaseRepository } from './base.repository';

export interface TeacherCapability {
  id: string;
  displayName: string;
  profile: TeacherProfile;
  isActive: boolean;
  subjectCodes: SubjectCode[];
  courseCodes: CourseCode[];
  availableSlotIds: string[];
}

export interface TeacherCapabilityInput {
  subjectCodes: SubjectCode[];
  courseCodes: CourseCode[];
  availableSlotIds: string[];
}

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

  async syncDisplayName(id: string, displayName: string): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.db.transaction(async (transaction) => {
      await transaction
        .update(teachers)
        .set({ displayName, updatedAt })
        .where(eq(teachers.id, id));
      await transaction
        .update(scheduleTeachers)
        .set({ displayName })
        .where(eq(scheduleTeachers.teacherId, id));
    });
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db
      .update(teachers)
      .set({ isActive, updatedAt: new Date().toISOString() })
      .where(eq(teachers.id, id));
  }

  async deactivateExcept(keepIds: string[]): Promise<void> {
    if (keepIds.length === 0) {
      return;
    }
    await this.db
      .update(teachers)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(notInArray(teachers.id, keepIds));
  }

  async findById(id: string): Promise<TeacherRow | undefined> {
    return this.db.query.teachers.findFirst({ where: eq(teachers.id, id) });
  }

  async listActive(): Promise<TeacherRow[]> {
    const rows = await this.db
      .select()
      .from(teachers)
      .where(eq(teachers.isActive, true));
    return rows.sort(compareTeachersByProfile);
  }

  async listCapabilities(ids?: string[]): Promise<TeacherCapability[]> {
    const rows =
      ids && ids.length > 0
        ? await this.db.select().from(teachers).where(inArray(teachers.id, ids))
        : await this.db.select().from(teachers);
    if (rows.length === 0) {
      return [];
    }
    const teacherIds = rows.map((row) => row.id);
    const [subjectRows, courseRows, slotRows] = await Promise.all([
      this.db
        .select()
        .from(teacherSubjects)
        .where(inArray(teacherSubjects.teacherId, teacherIds)),
      this.db
        .select()
        .from(teacherCourses)
        .where(inArray(teacherCourses.teacherId, teacherIds)),
      this.db
        .select()
        .from(teacherAvailableSlots)
        .where(inArray(teacherAvailableSlots.teacherId, teacherIds)),
    ]);

    return rows.sort(compareTeachersByProfile).map((row) => ({
      id: row.id,
      displayName: row.displayName,
      profile: row.profile,
      isActive: row.isActive,
      subjectCodes: subjectRows
        .filter((item) => item.teacherId === row.id)
        .map((item) => item.subjectCode)
        .sort(),
      courseCodes: courseRows
        .filter((item) => item.teacherId === row.id)
        .map((item) => item.courseCode)
        .sort(),
      availableSlotIds: slotRows
        .filter((item) => item.teacherId === row.id)
        .map((item) => item.slotId)
        .sort(),
    }));
  }

  async replaceCapabilities(
    teacherId: string,
    input: TeacherCapabilityInput,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction
        .delete(teacherSubjects)
        .where(eq(teacherSubjects.teacherId, teacherId));
      await transaction
        .delete(teacherCourses)
        .where(eq(teacherCourses.teacherId, teacherId));
      await transaction
        .delete(teacherAvailableSlots)
        .where(eq(teacherAvailableSlots.teacherId, teacherId));
      if (input.subjectCodes.length > 0) {
        await transaction.insert(teacherSubjects).values(
          input.subjectCodes.map((subjectCode) => ({
            teacherId,
            subjectCode,
          })),
        );
      }
      if (input.courseCodes.length > 0) {
        await transaction
          .insert(teacherCourses)
          .values(
            input.courseCodes.map((courseCode) => ({ teacherId, courseCode })),
          );
      }
      if (input.availableSlotIds.length > 0) {
        await transaction
          .insert(teacherAvailableSlots)
          .values(
            input.availableSlotIds.map((slotId) => ({ teacherId, slotId })),
          );
      }
    });
  }
}

function compareTeachersByProfile(
  left: { id: string; profile: TeacherProfile },
  right: { id: string; profile: TeacherProfile },
): number {
  const byProfile =
    teacherProfileSortIndex[left.profile] -
    teacherProfileSortIndex[right.profile];
  return byProfile !== 0 ? byProfile : left.id.localeCompare(right.id);
}
