import type {
  CourseCode,
  SubjectCode,
  TeacherProfile,
} from '../database/schema/catalog';

export type ValidationPurpose = 'DRAFT_VALIDATION' | 'CONFIRMATION';

export interface ValidationStudent {
  id: string;
  displayName: string;
  status: 'ACTIVE' | 'WAITING_LIST';
  courseCode: CourseCode;
  subjectHours: Array<{ subjectCode: SubjectCode; weeklyHours: number }>;
  weeklyHoursTotal: number;
  unavailableSlotIds: string[];
  relatedPersonIds: string[];
}

export interface ValidationTeacher {
  id: string;
  displayName: string;
  profile: TeacherProfile;
  subjectCodes: SubjectCode[];
  courseCodes: CourseCode[];
  availableSlotIds: string[];
}

export interface ValidationContext {
  students: ValidationStudent[];
  teachers: ValidationTeacher[];
}

export const SCIENCE_SUBJECT_CODES: ReadonlySet<SubjectCode> = new Set([
  'MATHEMATICS',
  'SOCIAL_SCIENCES_MATHEMATICS',
  'PHYSICS',
  'CHEMISTRY',
  'BIOLOGY',
]);

export const RULE_DEFINITIONS = {
  ACTIVE_STUDENTS_ONLY: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  CLASS_SLOT_VALID: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  TEACHER_SINGLE_CLASS_PER_SLOT: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  STUDENT_UNIQUE_IN_CLASS: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  STUDENT_TIME_OVERLAP: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  TEACHER_SUBJECT_COMPATIBILITY: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  TEACHER_COURSE_COMPATIBILITY: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  TEACHER_AVAILABILITY: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  STUDENT_AVAILABILITY: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  STUDENT_WEEKLY_HOURS_EXACT: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  STUDENT_SUBJECT_HOURS_EXACT: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  SUBJECT_SINGLE_TEACHER: {
    enforcement: 'HARD',
    severity: 'ERROR',
    priority: null,
  },
  CLASS_CAPACITY_MAXIMUM: {
    enforcement: 'RELAXABLE',
    severity: 'ERROR',
    priority: 1,
    maximumCapacity: 5,
  },
  CLASS_CAPACITY_MINIMUM: {
    enforcement: 'RELAXABLE',
    severity: 'ERROR',
    priority: 2,
    minimumCapacity: 3,
  },
  CLASS_CAPACITY_IDEAL: {
    enforcement: 'PREFERENCE',
    severity: 'WARNING',
    priority: 3,
    idealCapacity: 4,
    belowIdealPenaltyPerStudent: 1,
    aboveIdealPenaltyPerStudent: 2,
  },
  STUDENT_TEACHER_CONTINUITY: {
    enforcement: 'PREFERENCE',
    severity: 'WARNING',
    priority: 4,
  },
  RELATED_STUDENTS_TOGETHER: {
    enforcement: 'PREFERENCE',
    severity: 'WARNING',
    priority: 5,
  },
  PREFERRED_TEACHER_BACH1_SCIENCES: {
    enforcement: 'PREFERENCE',
    severity: 'WARNING',
    priority: 6,
  },
  PREFERRED_TEACHER_OTHER_SCIENCES: {
    enforcement: 'PREFERENCE',
    severity: 'WARNING',
    priority: 6,
  },
} as const;

export const SCORE_PRIORITY_ORDER = [1, 2, 3, 4, 5, 6] as const;
