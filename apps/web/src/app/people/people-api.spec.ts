import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PeopleStore } from './people-api';
import type { Person, PersonListResponse } from './people.models';

describe('PeopleStore', () => {
  let store: PeopleStore;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(PeopleStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads active people and the waiting list independently', () => {
    store.loadAll();

    const activeRequest = httpTesting.expectOne(
      (request) => request.url === '/api/v1/people' && request.params.get('status') === 'ACTIVE',
    );
    const waitingRequest = httpTesting.expectOne(
      (request) =>
        request.url === '/api/v1/people' && request.params.get('status') === 'WAITING_LIST',
    );
    activeRequest.flush(listResponse([person('active-1', 'ACTIVE')]));
    waitingRequest.flush(listResponse([]));

    expect(store.activeState()).toMatchObject({ kind: 'ready', total: 1 });
    expect(store.waitingState()).toEqual({ kind: 'ready', items: [], total: 0 });
  });

  it('keeps a failed list separate and exposes a safe retry message', () => {
    store.load('WAITING_LIST');
    httpTesting
      .expectOne(
        (request) =>
          request.url === '/api/v1/people' && request.params.get('status') === 'WAITING_LIST',
      )
      .flush({}, { status: 500, statusText: 'Server error' });

    expect(store.waitingState()).toEqual({
      kind: 'error',
      message: 'No se ha podido cargar el listado. Inténtalo de nuevo.',
    });
    expect(store.activeState()).toEqual({ kind: 'loading' });
  });

  it('activates all selected identifiers in one request', () => {
    store.activate(['waiting-1', 'waiting-2']).subscribe();
    const request = httpTesting.expectOne('/api/v1/people/activate');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      personIds: ['waiting-1', 'waiting-2'],
    });
    request.flush(listResponse([]));
  });

  it('reports partial deletion failures and refreshes both lists', () => {
    let result: unknown;
    store.deleteMany(['person-1', 'person-2']).subscribe((value) => (result = value));

    httpTesting.expectOne('/api/v1/people/person-1').flush(null);
    httpTesting
      .expectOne('/api/v1/people/person-2')
      .flush(
        { detail: 'La persona está incluida en un horario.' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(result).toEqual({
      deletedIds: ['person-1'],
      failures: [
        {
          personId: 'person-2',
          message: 'La persona está incluida en un horario.',
        },
      ],
    });

    httpTesting
      .expectOne(
        (request) => request.url === '/api/v1/people' && request.params.get('status') === 'ACTIVE',
      )
      .flush(listResponse([]));
    httpTesting
      .expectOne(
        (request) =>
          request.url === '/api/v1/people' && request.params.get('status') === 'WAITING_LIST',
      )
      .flush(listResponse([]));
  });
});

function listResponse(items: Person[]): PersonListResponse {
  return { items, total: items.length };
}

function person(id: string, status: Person['status']): Person {
  return {
    id,
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
    status,
    createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
  };
}
