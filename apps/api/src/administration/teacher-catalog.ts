import { DatabaseConnection } from '../database/database.connection';
import { TeachersRepository } from '../database/repositories/teachers.repository';
import { WeeklySlotsRepository } from '../database/repositories/weekly-slots.repository';
import type {
  CourseCode,
  DayOfWeek,
  SubjectCode,
  TeacherProfile,
} from '../database/schema/catalog';
import { AdministrativeUserError } from './administrative-users.service';

export interface CatalogTeacher {
  id: string;
  profile: TeacherProfile;
  subjectCodes: SubjectCode[];
  courseCodes: CourseCode[];
  windows: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }[];
}

export const DEFAULT_TEACHER_DISPLAY_NAMES: Record<TeacherProfile, string> = {
  SENIOR_SCIENCES: 'Profesor 1',
  GENERAL_SCIENCES: 'Profesor 2',
  LANGUAGES: 'Profesor 3',
};

export const CATALOG_TEACHERS: CatalogTeacher[] = [
  {
    id: 'teacher-senior-sciences',
    profile: 'SENIOR_SCIENCES',
    subjectCodes: [
      'MATHEMATICS',
      'SOCIAL_SCIENCES_MATHEMATICS',
      'PHYSICS',
      'CHEMISTRY',
    ],
    courseCodes: ['BACH_2', 'BACH_1'],
    windows: [
      { dayOfWeek: 'MONDAY', startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 'TUESDAY', startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 'WEDNESDAY', startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 'THURSDAY', startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 'FRIDAY', startTime: '16:00', endTime: '19:00' },
    ],
  },
  {
    id: 'teacher-general-sciences',
    profile: 'GENERAL_SCIENCES',
    subjectCodes: [
      'MATHEMATICS',
      'SOCIAL_SCIENCES_MATHEMATICS',
      'PHYSICS',
      'CHEMISTRY',
      'BIOLOGY',
    ],
    courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1'],
    windows: [
      { dayOfWeek: 'MONDAY', startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 'TUESDAY', startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 'WEDNESDAY', startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 'THURSDAY', startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 'FRIDAY', startTime: '16:00', endTime: '19:00' },
    ],
  },
  {
    id: 'teacher-languages',
    profile: 'LANGUAGES',
    subjectCodes: ['SPANISH_LANGUAGE', 'ENGLISH'],
    courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1', 'BACH_2'],
    windows: [
      { dayOfWeek: 'MONDAY', startTime: '16:00', endTime: '20:00' },
      { dayOfWeek: 'TUESDAY', startTime: '16:00', endTime: '20:00' },
      { dayOfWeek: 'WEDNESDAY', startTime: '16:00', endTime: '20:00' },
      { dayOfWeek: 'THURSDAY', startTime: '16:00', endTime: '20:00' },
      { dayOfWeek: 'FRIDAY', startTime: '16:00', endTime: '19:00' },
    ],
  },
];

export function resolveTeacherDisplayNames(
  source: NodeJS.ProcessEnv = process.env,
): Record<TeacherProfile, string> {
  return {
    SENIOR_SCIENCES:
      source.TEACHER_1_DISPLAY_NAME?.trim() ||
      DEFAULT_TEACHER_DISPLAY_NAMES.SENIOR_SCIENCES,
    GENERAL_SCIENCES:
      source.TEACHER_2_DISPLAY_NAME?.trim() ||
      DEFAULT_TEACHER_DISPLAY_NAMES.GENERAL_SCIENCES,
    LANGUAGES:
      source.TEACHER_3_DISPLAY_NAME?.trim() ||
      DEFAULT_TEACHER_DISPLAY_NAMES.LANGUAGES,
  };
}

export async function seedTeacherCatalog(
  connection: DatabaseConnection,
  source: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const teachers = new TeachersRepository(connection);
  const weeklySlots = new WeeklySlotsRepository(connection);
  const slots = await weeklySlots.listActive();
  if (slots.length === 0) {
    throw new AdministrativeUserError(
      'No hay franjas semanales. Ejecuta primero npm run db:migrate.',
    );
  }

  const displayNames = resolveTeacherDisplayNames(source);
  const ids: string[] = [];
  for (const teacher of CATALOG_TEACHERS) {
    const displayName = displayNames[teacher.profile];
    const current = await teachers.findById(teacher.id);
    if (!current) {
      await teachers.insert({
        id: teacher.id,
        displayName,
        profile: teacher.profile,
      });
    } else {
      if (current.displayName !== displayName) {
        await teachers.syncDisplayName(teacher.id, displayName);
      }
      if (!current.isActive) {
        await teachers.setActive(teacher.id, true);
      }
    }
    await teachers.replaceCapabilities(teacher.id, {
      subjectCodes: teacher.subjectCodes,
      courseCodes: teacher.courseCodes,
      availableSlotIds: slots
        .filter((slot) =>
          teacher.windows.some(
            (window) =>
              slot.dayOfWeek === window.dayOfWeek &&
              slot.startTime >= window.startTime &&
              slot.endTime <= window.endTime,
          ),
        )
        .map((slot) => slot.id),
    });
    ids.push(teacher.id);
  }
  await teachers.deactivateExcept(ids);
  return ids;
}
