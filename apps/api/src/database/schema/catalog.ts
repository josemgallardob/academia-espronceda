export const courseCodes = [
  'ESO_1',
  'ESO_2',
  'ESO_3',
  'ESO_4',
  'BACH_1',
  'BACH_2',
  'OTHER',
] as const;

export const subjectCodes = [
  'MATHEMATICS',
  'SOCIAL_SCIENCES_MATHEMATICS',
  'PHYSICS',
  'CHEMISTRY',
  'BIOLOGY',
  'SPANISH_LANGUAGE',
  'ENGLISH',
] as const;

export const personStatuses = ['ACTIVE', 'WAITING_LIST'] as const;

export const teacherProfiles = [
  'SENIOR_SCIENCES',
  'GENERAL_SCIENCES',
  'LANGUAGES',
] as const;

export const daysOfWeek = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;

export const scheduleStates = ['DRAFT', 'CONFIRMED'] as const;

export const evaluationOutcomes = [
  'IDEAL',
  'VALID_WITH_RECOMMENDATIONS',
  'HAS_RELAXABLE_CONFLICTS',
  'BLOCKED',
] as const;

export const ruleEnforcements = ['HARD', 'RELAXABLE', 'PREFERENCE'] as const;

export const findingSeverities = ['ERROR', 'WARNING', 'INFO'] as const;

export type CourseCode = (typeof courseCodes)[number];
export type SubjectCode = (typeof subjectCodes)[number];
export type PersonStatus = (typeof personStatuses)[number];
export type TeacherProfile = (typeof teacherProfiles)[number];
export type DayOfWeek = (typeof daysOfWeek)[number];
export type ScheduleState = (typeof scheduleStates)[number];
export type EvaluationOutcome = (typeof evaluationOutcomes)[number];
export type RuleEnforcement = (typeof ruleEnforcements)[number];
export type FindingSeverity = (typeof findingSeverities)[number];
