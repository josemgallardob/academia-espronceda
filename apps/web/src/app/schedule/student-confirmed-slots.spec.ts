import type { Person } from '../people/people.models';
import type { Schedule, TeacherOption } from './schedule.models';
import { studentConfirmedSlots } from './student-confirmed-slots';

describe('studentConfirmedSlots', () => {
  it('returns the student classes ordered by day and start time', () => {
    const rows = studentConfirmedSlots(
      schedule({
        classes: [
          classOn('class-friday', 'teacher-3', 'slot-friday-1800', 'student-1'),
          classOn('class-monday', 'teacher-2', 'slot-monday-1600', 'student-1'),
          classOn('class-other', 'teacher-2', 'slot-wednesday-1700', 'student-2'),
        ],
      }),
      student(),
      [profesor2(), profesor3()],
    );

    expect(rows.map((row) => row.slotId)).toEqual(['slot-monday-1600', 'slot-friday-1800']);
    expect(rows[0]).toMatchObject({
      dayOfWeek: 'MONDAY',
      startTime: '16:00',
      endTime: '17:00',
      teacherDisplayName: 'Profesor 2',
    });
  });

  it('prefers explicit subject-teacher allocations for that slot teacher', () => {
    const rows = studentConfirmedSlots(
      schedule({
        subjectTeacherAllocations: [
          {
            studentId: 'student-1',
            teacherId: 'teacher-2',
            totalHours: 2,
            subjectHours: [
              { subjectCode: 'PHYSICS', weeklyHours: 1 },
              { subjectCode: 'CHEMISTRY', weeklyHours: 1 },
            ],
          },
          {
            studentId: 'student-1',
            teacherId: 'teacher-3',
            totalHours: 1,
            subjectHours: [{ subjectCode: 'ENGLISH', weeklyHours: 1 }],
          },
        ],
        classes: [
          classOn('class-monday', 'teacher-2', 'slot-monday-1600', 'student-1'),
          classOn('class-friday', 'teacher-3', 'slot-friday-1800', 'student-1'),
        ],
      }),
      student({
        subjectHours: [
          { subjectCode: 'PHYSICS', weeklyHours: 1 },
          { subjectCode: 'CHEMISTRY', weeklyHours: 1 },
          { subjectCode: 'ENGLISH', weeklyHours: 1 },
        ],
      }),
    );

    expect(rows[0].subjectCodes).toEqual(['PHYSICS', 'CHEMISTRY']);
    expect(rows[1].subjectCodes).toEqual(['ENGLISH']);
  });

  it('falls back to the intersection of student and teacher subjects', () => {
    const rows = studentConfirmedSlots(
      schedule({
        classes: [classOn('class-friday', 'teacher-3', 'slot-friday-1800', 'student-1')],
      }),
      student({
        subjectHours: [
          { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
          { subjectCode: 'ENGLISH', weeklyHours: 1 },
        ],
      }),
      [profesor3()],
    );

    expect(rows[0].subjectCodes).toEqual(['ENGLISH']);
  });
});

function classOn(
  id: string,
  teacherId: string,
  slotId: string,
  studentId: string,
): Schedule['classes'][number] {
  return {
    id,
    teacherId,
    slotId,
    findingFingerprints: [],
    assignments: [{ id: `${id}-assignment`, studentId, studentDisplayName: 'Ana Ruiz' }],
  };
}

function student(overrides: Partial<Person> = {}): Person {
  return {
    id: 'student-1',
    firstName: 'Ana',
    firstSurname: 'Ruiz',
    secondSurname: null,
    courseCode: 'BACH_1',
    subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 3 }],
    weeklyHoursTotal: 3,
    schoolName: null,
    unavailableSlotIds: [],
    relatedPersonIds: [],
    primaryPhone: '600000000',
    secondaryPhone: null,
    isTutored: false,
    tutorFullName: null,
    comments: null,
    status: 'ACTIVE',
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: '2026-08-27T10:00:00.000Z',
    ...overrides,
  };
}

function profesor2(): TeacherOption {
  return {
    id: 'teacher-2',
    displayName: 'Profesor 2',
    subjectCodes: ['MATHEMATICS', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY'],
    courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1', 'BACH_2'],
  };
}

function profesor3(): TeacherOption {
  return {
    id: 'teacher-3',
    displayName: 'Profesor 3',
    subjectCodes: ['SPANISH_LANGUAGE', 'ENGLISH'],
    courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1', 'BACH_2'],
  };
}

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'schedule-1',
    state: 'CONFIRMED',
    revision: 1,
    isCurrent: true,
    sourceScheduleId: null,
    ruleCatalogVersion: '1.0.0',
    createdAt: '2026-08-27T10:00:00.000Z',
    confirmedAt: '2026-08-27T11:00:00.000Z',
    confirmedByUserId: 'user-1',
    teachers: [
      { id: 'teacher-2', displayName: 'Profesor 2' },
      { id: 'teacher-3', displayName: 'Profesor 3' },
    ],
    slots: [
      { id: 'slot-monday-1600', dayOfWeek: 'MONDAY', startTime: '16:00', endTime: '17:00' },
      { id: 'slot-wednesday-1700', dayOfWeek: 'WEDNESDAY', startTime: '17:00', endTime: '18:00' },
      { id: 'slot-friday-1800', dayOfWeek: 'FRIDAY', startTime: '18:00', endTime: '19:00' },
    ],
    classes: [],
    subjectTeacherAllocations: [],
    evaluation: null,
    acceptedFindingFingerprints: [],
    ...overrides,
  };
}
