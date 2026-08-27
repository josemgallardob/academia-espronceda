import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ScheduleStore } from './schedule-api';
import type { Person, PersonListResponse } from '../people/people.models';
import type { Schedule, ScheduleListResponse, TeacherOption } from './schedule.models';

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
    expect(store.daySlots().map((slot) => slot.id)).toEqual(['slot-monday-1600']);
    expect(store.studentHours()[0].remainingHours).toBe(2);
  });

  it('keeps the weekly schedule in memory when the day filter changes', () => {
    store.load();
    flushWorkspace();
    store.selectDay('TUESDAY');
    expect(store.schedule()?.id).toBe('schedule-1');
    expect(store.daySlots()).toEqual([]);
    store.selectDay('MONDAY');
    expect(store.daySlots()).toHaveLength(1);
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

function schedule(): Schedule {
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
  };
}
