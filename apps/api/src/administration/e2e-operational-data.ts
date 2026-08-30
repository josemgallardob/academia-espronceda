import type { Database } from '../database/database.connection';
import {
  people,
  personRelationships,
  personSubjects,
  personUnavailableSlots,
  scheduleAcceptedFindings,
  scheduleAssignments,
  scheduleClasses,
  scheduleConfirmations,
  scheduleSlots,
  scheduleTeachers,
  scheduleValidationFindings,
  scheduleValidations,
  schedules,
  subjectTeacherAllocations,
} from '../database/schema';

export async function resetE2eOperationalData(db: Database): Promise<void> {
  await db.delete(scheduleAcceptedFindings);
  await db.delete(scheduleConfirmations);
  await db.delete(scheduleValidationFindings);
  await db.delete(scheduleValidations);
  await db.delete(subjectTeacherAllocations);
  await db.delete(scheduleAssignments);
  await db.delete(scheduleClasses);
  await db.delete(scheduleSlots);
  await db.delete(scheduleTeachers);
  await db.update(schedules).set({ sourceScheduleId: null });
  await db.delete(schedules);
  await db.delete(personRelationships);
  await db.delete(personUnavailableSlots);
  await db.delete(personSubjects);
  await db.delete(people);
}
