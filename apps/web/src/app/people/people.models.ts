export type PersonStatus = 'ACTIVE' | 'WAITING_LIST';

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';

export type CourseCode = 'ESO_1' | 'ESO_2' | 'ESO_3' | 'ESO_4' | 'BACH_1' | 'BACH_2' | 'OTHER';

export type SubjectCode =
  | 'MATHEMATICS'
  | 'SOCIAL_SCIENCES_MATHEMATICS'
  | 'PHYSICS'
  | 'CHEMISTRY'
  | 'BIOLOGY'
  | 'SPANISH_LANGUAGE'
  | 'ENGLISH';

export interface SubjectHours {
  subjectCode: SubjectCode;
  weeklyHours: number;
}

export interface Person {
  id: string;
  firstName: string;
  firstSurname: string;
  secondSurname: string | null;
  courseCode: CourseCode;
  subjectHours: SubjectHours[];
  weeklyHoursTotal: number;
  schoolName: string | null;
  unavailableSlotIds: string[];
  relatedPersonIds: string[];
  primaryPhone: string;
  secondaryPhone: string | null;
  isTutored: boolean;
  tutorFullName: string | null;
  comments: string | null;
  status: PersonStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PersonListResponse {
  items: Person[];
  total: number;
}

export interface WeeklySlot {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface SchedulingConfiguration {
  timezone: 'Europe/Madrid';
  slots: WeeklySlot[];
  courseLabels: Record<CourseCode, string>;
  subjectLabels: Record<SubjectCode, string>;
}

export interface CreatePersonRequest {
  firstName: string;
  firstSurname: string;
  secondSurname: string | null;
  courseCode: CourseCode;
  subjectHours: SubjectHours[];
  weeklyHoursTotal: number;
  schoolName: string | null;
  unavailableSlotIds: string[];
  relatedPersonIds: string[];
  primaryPhone: string;
  secondaryPhone: string | null;
  isTutored: boolean;
  tutorFullName: string | null;
  comments: string | null;
  status: PersonStatus;
}

export type UpdatePersonRequest = Omit<CreatePersonRequest, 'status'>;

export type PeopleListState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: Person[]; total: number }
  | { kind: 'error'; message: string };

export interface DeletePeopleResult {
  deletedIds: string[];
  failures: Array<{ personId: string; message: string }>;
}
