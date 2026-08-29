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
    expect(store.weekHourRows().map((row) => row.cells.map((slot) => slot?.id ?? null))).toEqual([
      ['slot-monday-1600', null, null, null, null],
    ]);
    expect(store.studentHours()).toHaveLength(1);
    expect(store.studentHours()[0].remainingHours).toBe(2);
  });

  it('shows only students compatible with the selected teacher and updates immediately', () => {
    store.load();
    httpTesting.expectOne('/api/v1/teachers').flush([profesor1(), profesor2(), profesor3()]);
    httpTesting
      .expectOne(
        (request) => request.url === '/api/v1/people' && request.params.get('status') === 'ACTIVE',
      )
      .flush(
        peopleResponse([
          person({ id: 'bach2-maths', firstName: 'Luis', courseCode: 'BACH_2' }),
          person({
            id: 'eso-english',
            firstName: 'Marta',
            courseCode: 'ESO_3',
            subjectHours: [{ subjectCode: 'ENGLISH', weeklyHours: 1 }],
            weeklyHoursTotal: 1,
          }),
          person({
            id: 'bach1-mixed',
            firstName: 'Pablo',
            subjectHours: [
              { subjectCode: 'PHYSICS', weeklyHours: 2 },
              { subjectCode: 'ENGLISH', weeklyHours: 1 },
            ],
          }),
          person({
            id: 'bach1-complete',
            firstName: 'Nerea',
            weeklyHoursTotal: 3,
          }),
        ]),
      );
    httpTesting.expectOne('/api/v1/schedules').flush(listResponse([schedule()]));
    httpTesting.expectOne('/api/v1/schedules/schedule-1').flush(
      schedule({
        classes: [
          {
            id: 'class-1',
            teacherId: 'teacher-1',
            slotId: 'slot-monday-1600',
            findingFingerprints: [],
            assignments: [
              {
                id: 'assignment-complete',
                studentId: 'bach1-complete',
                studentDisplayName: 'Nerea Ruiz',
              },
              {
                id: 'assignment-complete-2',
                studentId: 'bach1-complete',
                studentDisplayName: 'Nerea Ruiz',
              },
              {
                id: 'assignment-complete-3',
                studentId: 'bach1-complete',
                studentDisplayName: 'Nerea Ruiz',
              },
            ],
          },
        ],
      }),
    );

    expect(store.studentHours().map((item) => item.person.id)).toEqual([
      'bach2-maths',
      'bach1-mixed',
      'bach1-complete',
    ]);
    expect(
      store.studentHours().find((item) => item.person.id === 'bach1-complete')?.remainingHours,
    ).toBe(0);

    store.selectTeacher('teacher-3');
    expect(store.studentHours().map((item) => item.person.id)).toEqual([
      'eso-english',
      'bach1-mixed',
    ]);

    store.selectTeacher('teacher-2');
    expect(store.studentHours().map((item) => item.person.id)).toEqual([
      'bach1-mixed',
      'bach1-complete',
    ]);
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
    expect(
      store.weekHourRows().flatMap((row) => row.cells.map((slot) => slot?.id ?? null)),
    ).toEqual(['slot-monday-1600', null, null, null, null]);
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
    expect(store.weekHourRows().map((row) => row.cells.map((slot) => slot?.id ?? null))).toEqual([
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

  it('posts automatic generation and keeps the running state until the solver returns', () => {
    const generated = schedule({
      id: 'schedule-generated',
      evaluation: evaluationFixture({ outcome: 'IDEAL' }),
    });
    store.generateDraft().subscribe();
    expect(store.generating()).toBe(true);
    expect(store.pending()).toBe(true);
    const request = httpTesting.expectOne('/api/v1/schedules/generate');
    expect(request.request.method).toBe('POST');
    request.flush(generated);
    expect(store.generating()).toBe(false);
    expect(store.pending()).toBe(false);
    expect(store.workspace()).toMatchObject({
      kind: 'ready',
      schedule: { id: 'schedule-generated' },
    });
    expect(store.selectedTeacherId()).toBe('teacher-1');
  });

  it('keeps the current workspace when generation fails', () => {
    store.load();
    flushWorkspace();
    store.generateDraft().subscribe({ error: () => undefined });
    httpTesting
      .expectOne('/api/v1/schedules/generate')
      .flush(
        { detail: 'El generador no encontró una solución válida para los datos actuales.' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(store.generating()).toBe(false);
    expect(store.workspace()).toMatchObject({
      kind: 'ready',
      schedule: { id: 'schedule-1' },
    });
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

  it('loads the current confirmed schedule', () => {
    let result: Schedule | null | undefined;
    store.getCurrentConfirmedSchedule().subscribe((schedule) => {
      result = schedule;
    });
    const request = httpTesting.expectOne('/api/v1/schedules/current');
    expect(request.request.method).toBe('GET');
    request.flush(schedule({ state: 'CONFIRMED', isCurrent: true }));
    expect(result).toMatchObject({ id: 'schedule-1', state: 'CONFIRMED', isCurrent: true });
  });

  it('returns null when there is no current confirmed schedule', () => {
    let result: Schedule | null | undefined = schedule();
    store.getCurrentConfirmedSchedule().subscribe((current) => {
      result = current;
    });
    httpTesting
      .expectOne('/api/v1/schedules/current')
      .flush({ title: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    expect(result).toBeNull();
  });

  it('lists teachers independently of the workspace', () => {
    let result: TeacherOption[] = [];
    store.listTeachers().subscribe((teachers) => {
      result = teachers;
    });
    httpTesting.expectOne('/api/v1/teachers').flush([teacher()]);
    expect(result).toEqual([teacher()]);
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
  return profesor2({ id: 'teacher-1', displayName: 'Profesor Uno' });
}

function profesor1(overrides: Partial<TeacherOption> = {}): TeacherOption {
  return {
    id: 'teacher-1',
    displayName: 'Profesor 1',
    subjectCodes: ['MATHEMATICS', 'SOCIAL_SCIENCES_MATHEMATICS', 'PHYSICS', 'CHEMISTRY'],
    courseCodes: ['BACH_2', 'BACH_1'],
    ...overrides,
  };
}

function profesor2(overrides: Partial<TeacherOption> = {}): TeacherOption {
  return {
    id: 'teacher-2',
    displayName: 'Profesor 2',
    subjectCodes: ['MATHEMATICS', 'SOCIAL_SCIENCES_MATHEMATICS', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY'],
    courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1'],
    ...overrides,
  };
}

function profesor3(overrides: Partial<TeacherOption> = {}): TeacherOption {
  return {
    id: 'teacher-3',
    displayName: 'Profesor 3',
    subjectCodes: ['SPANISH_LANGUAGE', 'ENGLISH'],
    courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1', 'BACH_2'],
    ...overrides,
  };
}

function person(overrides: Partial<Person> = {}): Person {
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
