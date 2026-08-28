import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ScheduleStore } from './schedule-api';
import type { Person, PersonListResponse } from '../people/people.models';
import type {
  Schedule,
  ScheduleEvaluation,
  ScheduleListResponse,
  TeacherOption,
} from './schedule.models';

describe('ScheduleStore', () => {
  let store: ScheduleStore;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(ScheduleStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads teachers, active students and the working draft', () => {
    store.load();
    httpTesting.expectOne('/api/v1/teachers').flush([teacher()]);
    httpTesting
      .expectOne(
        (request) => request.url === '/api/v1/people' && request.params.get('status') === 'ACTIVE',
      )
      .flush(peopleResponse([person()]));
    httpTesting.expectOne('/api/v1/schedules').flush(listResponse([schedule()]));
    httpTesting.expectOne('/api/v1/schedules/schedule-1').flush(schedule());

    expect(store.workspace()).toMatchObject({ kind: 'ready' });
    expect(store.selectedTeacherId()).toBe('teacher-1');
    expect(store.teacherSlots().map((slot) => slot.id)).toEqual(['slot-monday-1600']);
    expect(
      store.weekHourRows().map((row) => row.cells.map((slot) => slot?.id ?? null)),
    ).toEqual([['slot-monday-1600', null, null, null, null]]);
    expect(store.studentHours()).toHaveLength(1);
    expect(store.studentHours()[0].remainingHours).toBe(2);
  });

  it('hides 20:00–21:00 when the selected teacher is not available that day', () => {
    store.load();
    httpTesting.expectOne('/api/v1/teachers').flush([
      {
        id: 'teacher-1',
        displayName: 'Profesor Uno',
        availableSlotIds: ['slot-monday-1600'],
      },
    ]);
    httpTesting
      .expectOne(
        (request) => request.url === '/api/v1/people' && request.params.get('status') === 'ACTIVE',
      )
      .flush(peopleResponse([person()]));
    httpTesting.expectOne('/api/v1/schedules').flush(listResponse([schedule()]));
    httpTesting.expectOne('/api/v1/schedules/schedule-1').flush(
      schedule({
        slots: [
          {
            id: 'slot-monday-1600',
            dayOfWeek: 'MONDAY',
            startTime: '16:00',
            endTime: '17:00',
          },
          {
            id: 'slot-monday-2000',
            dayOfWeek: 'MONDAY',
            startTime: '20:00',
            endTime: '21:00',
          },
          {
            id: 'slot-tuesday-2000',
            dayOfWeek: 'TUESDAY',
            startTime: '20:00',
            endTime: '21:00',
          },
        ],
      }),
    );

    expect(store.teacherSlots().map((slot) => slot.id)).toEqual(['slot-monday-1600']);
    expect(store.weekHourRows().flatMap((row) => row.cells.map((slot) => slot?.id ?? null))).toEqual(
      ['slot-monday-1600', null, null, null, null],
    );
  });

  it('shows 20:00–21:00 only on days the selected teacher works', () => {
    store.load();
    httpTesting.expectOne('/api/v1/teachers').flush([
      {
        id: 'teacher-1',
        displayName: 'Profesor Uno',
        availableSlotIds: ['slot-monday-1600', 'slot-tuesday-2000'],
      },
    ]);
    httpTesting
      .expectOne(
        (request) => request.url === '/api/v1/people' && request.params.get('status') === 'ACTIVE',
      )
      .flush(peopleResponse([person()]));
    httpTesting.expectOne('/api/v1/schedules').flush(listResponse([schedule()]));
    httpTesting.expectOne('/api/v1/schedules/schedule-1').flush(
      schedule({
        slots: [
          {
            id: 'slot-monday-1600',
            dayOfWeek: 'MONDAY',
            startTime: '16:00',
            endTime: '17:00',
          },
          {
            id: 'slot-monday-2000',
            dayOfWeek: 'MONDAY',
            startTime: '20:00',
            endTime: '21:00',
          },
          {
            id: 'slot-tuesday-2000',
            dayOfWeek: 'TUESDAY',
            startTime: '20:00',
            endTime: '21:00',
          },
        ],
      }),
    );

    expect(store.teacherSlots().map((slot) => slot.id)).toEqual([
      'slot-monday-1600',
      'slot-tuesday-2000',
    ]);
    expect(
      store.weekHourRows().map((row) => row.cells.map((slot) => slot?.id ?? null)),
    ).toEqual([
      ['slot-monday-1600', null, null, null, null],
      [null, 'slot-tuesday-2000', null, null, null],
    ]);
  });

  it('keeps the weekly schedule in memory when the teacher filter changes', () => {
    store.load();
    flushWorkspace();
    store.selectTeacher('teacher-1');
    expect(store.schedule()?.id).toBe('schedule-1');
    expect(store.teacherSlots()).toHaveLength(1);
  });

  it('surfaces a load error without leaving a partial workspace', () => {
    store.load();
    httpTesting.expectOne('/api/v1/teachers').flush([teacher()]);
    httpTesting.expectOne('/api/v1/schedules').flush(listResponse([]));
    httpTesting
      .expectOne((request) => request.url === '/api/v1/people')
      .flush({}, { status: 500, statusText: 'error' });

    expect(store.workspace()).toEqual({
      kind: 'error',
      message: 'No se ha podido cargar el horario. Inténtalo de nuevo.',
    });
  });

  it('creates an empty draft when none exists', () => {
    store.createEmptyDraft().subscribe();
    const request = httpTesting.expectOne('/api/v1/schedules/drafts');
    expect(request.request.method).toBe('POST');
    request.flush(schedule());
    expect(store.workspace()).toMatchObject({ kind: 'ready' });
  });

  it('posts a new assignment and refreshes the workspace', () => {
    store.load();
    flushWorkspace();
    store.addAssignment('student-1', 'teacher-1', 'slot-monday-1600').subscribe();
    const request = httpTesting.expectOne('/api/v1/schedules/schedule-1/assignments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      expectedRevision: 1,
      studentId: 'student-1',
      teacherId: 'teacher-1',
      slotId: 'slot-monday-1600',
    });
    request.flush({ schedule: schedule({ revision: 2 }) });
    expect(store.workspace()).toMatchObject({
      kind: 'ready',
      schedule: { revision: 2 },
    });
  });

  it('deletes an assignment by id', () => {
    store.load();
    flushWorkspace();
    store.removeAssignment('assignment-1').subscribe();
    const request = httpTesting.expectOne(
      (candidate) =>
        candidate.url === '/api/v1/schedules/schedule-1/assignments/assignment-1' &&
        candidate.method === 'DELETE',
    );
    expect(request.request.params.get('expectedRevision')).toBe('1');
    request.flush({ schedule: schedule({ revision: 2 }) });
    expect(store.workspace()).toMatchObject({
      kind: 'ready',
      schedule: { revision: 2 },
    });
  });

  it('validates the working draft and stores the confirmation evaluation', () => {
    store.load();
    flushWorkspace();
    store.validate().subscribe();
    const request = httpTesting.expectOne('/api/v1/schedules/schedule-1/validate');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ expectedRevision: 1 });
    const evaluation = evaluationFixture({
      outcome: 'HAS_RELAXABLE_CONFLICTS',
      canConfirm: true,
    });
    request.flush(evaluation);
    expect(store.schedule()?.evaluation).toEqual(evaluation);
  });

  it('confirms the draft with explicit acceptance of relaxable conflicts', () => {
    store.load();
    flushWorkspace();
    store.confirm(true).subscribe();
    const request = httpTesting.expectOne('/api/v1/schedules/schedule-1/confirm');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      expectedRevision: 1,
      validationFingerprint: schedule().evaluation?.validationFingerprint,
      acceptRelaxableConflicts: true,
    });
    request.flush(schedule({ state: 'CONFIRMED', isCurrent: true }));
    expect(store.workspace()).toMatchObject({
      kind: 'ready',
      schedule: { state: 'CONFIRMED', isCurrent: true },
    });
  });

  function flushWorkspace(): void {
    httpTesting.expectOne('/api/v1/teachers').flush([teacher()]);
    httpTesting
      .expectOne(
        (request) => request.url === '/api/v1/people' && request.params.get('status') === 'ACTIVE',
      )
      .flush(peopleResponse([person()]));
    httpTesting.expectOne('/api/v1/schedules').flush(listResponse([schedule()]));
    httpTesting.expectOne('/api/v1/schedules/schedule-1').flush(schedule());
  }
});

function teacher(): TeacherOption {
  return { id: 'teacher-1', displayName: 'Profesor Uno' };
}

function person(): Person {
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
  };
}

function peopleResponse(items: Person[]): PersonListResponse {
  return { items, total: items.length };
}

function listResponse(items: Schedule[]): ScheduleListResponse {
  return {
    items: items.map((item) => ({
      id: item.id,
      state: item.state,
      revision: item.revision,
      isCurrent: item.isCurrent,
      createdAt: item.createdAt,
      confirmedAt: item.confirmedAt,
    })),
    total: items.length,
  };
}

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'schedule-1',
    state: 'DRAFT',
    revision: 1,
    isCurrent: false,
    sourceScheduleId: null,
    ruleCatalogVersion: '1.0.0',
    createdAt: '2026-08-27T10:00:00.000Z',
    confirmedAt: null,
    confirmedByUserId: null,
    teachers: [teacher()],
    slots: [
      {
        id: 'slot-monday-1600',
        dayOfWeek: 'MONDAY',
        startTime: '16:00',
        endTime: '17:00',
      },
    ],
    classes: [
      {
        id: 'class-1',
        teacherId: 'teacher-1',
        slotId: 'slot-monday-1600',
        findingFingerprints: [],
        assignments: [
          { id: 'assignment-1', studentId: 'student-1', studentDisplayName: 'Ana Ruiz' },
        ],
      },
    ],
    subjectTeacherAllocations: [],
    evaluation: {
      validationFingerprint: `sha256:${'a'.repeat(64)}`,
      scheduleId: 'schedule-1',
      scheduleRevision: 1,
      ruleCatalogVersion: '1.0.0',
      evaluatedAt: '2026-08-27T10:00:00.000Z',
      outcome: 'HAS_RELAXABLE_CONFLICTS',
      canConfirm: true,
      counts: { blockingErrors: 0, relaxableErrors: 1, warnings: 1, information: 0 },
      findings: [],
    },
    acceptedFindingFingerprints: [],
    ...overrides,
  };
}

function evaluationFixture(overrides: Partial<ScheduleEvaluation> = {}): ScheduleEvaluation {
  return {
    validationFingerprint: `sha256:${'c'.repeat(64)}`,
    scheduleId: 'schedule-1',
    scheduleRevision: 1,
    ruleCatalogVersion: '1.0.0',
    evaluatedAt: '2026-08-27T10:00:00.000Z',
    outcome: 'IDEAL',
    canConfirm: true,
    counts: { blockingErrors: 0, relaxableErrors: 0, warnings: 0, information: 0 },
    findings: [],
    ...overrides,
  };
}
