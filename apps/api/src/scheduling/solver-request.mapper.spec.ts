import { ProblemDetailsException } from '../http/problem-details.exception';
import {
  defaultSlots,
  generalSciences,
  languages,
  student,
} from './schedule-validator.fixtures';
import { toSolveScheduleRequest } from './solver-request.mapper';
import type { ValidationTeacher } from './validation-context';

describe('toSolveScheduleRequest', () => {
  const unavailableTeacher: ValidationTeacher = {
    ...languages,
    id: 'teacher-unavailable',
    availableSlotIds: [],
  };
  const teacherWithUnknownSlots: ValidationTeacher = {
    ...generalSciences,
    availableSlotIds: [...generalSciences.availableSlotIds, 'slot-missing'],
  };

  it('maps live domain data and drops ineligible teachers, waiting-list students and unknown slots', () => {
    const waiting = student({
      id: 'student-waiting',
      status: 'WAITING_LIST',
      relatedPersonIds: ['student-active'],
    });
    const active = student({
      id: 'student-active',
      relatedPersonIds: ['student-waiting', 'student-friend', 'student-active'],
      unavailableSlotIds: ['slot-monday-1600', 'slot-missing'],
    });
    const friend = student({
      id: 'student-friend',
      relatedPersonIds: ['student-active'],
    });

    const request = toSolveScheduleRequest({
      requestId: 'request-1',
      slots: defaultSlots,
      teachers: [teacherWithUnknownSlots, unavailableTeacher],
      students: [waiting, active, friend],
      timeLimitSeconds: 8,
      randomSeed: 99,
    });

    expect(request).toMatchObject({
      contractVersion: '1.0.0',
      ruleCatalogVersion: '1.0.0',
      requestId: 'request-1',
      timezone: 'Europe/Madrid',
      options: { timeLimitSeconds: 8, randomSeed: 99 },
    });
    expect(request.teachers.map((teacher) => teacher.id)).toEqual([
      'teacher-general',
    ]);
    expect(request.teachers[0].availableSlotIds).toEqual(
      defaultSlots.map((slot) => slot.id).sort(),
    );
    expect(request.students.map((item) => item.id)).toEqual([
      'student-active',
      'student-friend',
    ]);
    expect(request.students[0].unavailableSlotIds).toEqual([
      'slot-monday-1600',
    ]);
    expect(request.relationships).toEqual([
      { studentIds: ['student-active', 'student-friend'] },
    ]);
  });

  it('rejects a catalog that cannot be sent to the solver', () => {
    try {
      toSolveScheduleRequest({
        requestId: 'request-empty',
        slots: defaultSlots,
        teachers: [unavailableTeacher],
        students: [student({ id: 'student-1' })],
      });
      throw new Error('Expected the mapper to reject the catalog');
    } catch (error) {
      expect(error).toBeInstanceOf(ProblemDetailsException);
      expect((error as ProblemDetailsException).problem).toMatchObject({
        status: 409,
        code: 'GENERATION_INFEASIBLE',
      });
    }
  });
});
