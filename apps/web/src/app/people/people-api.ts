import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  DeletePeopleResult,
  CreatePersonRequest,
  PeopleListState,
  Person,
  PersonListResponse,
  PersonStatus,
  SchedulingConfiguration,
  UpdatePersonRequest,
} from './people.models';

const peopleUrl = `${environment.apiBaseUrl.replace(/\/$/u, '')}/v1/people`;
const schedulingConfigurationUrl = `${environment.apiBaseUrl.replace(/\/$/u, '')}/v1/scheduling/configuration`;

@Injectable({ providedIn: 'root' })
export class PeopleStore {
  private readonly http = inject(HttpClient);
  private readonly activeStateSignal = signal<PeopleListState>({ kind: 'loading' });
  private readonly waitingStateSignal = signal<PeopleListState>({ kind: 'loading' });

  readonly activeState = this.activeStateSignal.asReadonly();
  readonly waitingState = this.waitingStateSignal.asReadonly();

  loadAll(): void {
    this.load('ACTIVE');
    this.load('WAITING_LIST');
  }

  load(status: PersonStatus): void {
    const state = this.stateSignal(status);
    state.set({ kind: 'loading' });
    this.http.get<PersonListResponse>(peopleUrl, { params: { status } }).subscribe({
      next: ({ items, total }) => state.set({ kind: 'ready', items, total }),
      error: (error: unknown) =>
        state.set({
          kind: 'error',
          message: problemMessage(error, 'No se ha podido cargar el listado. Inténtalo de nuevo.'),
        }),
    });
  }

  activate(personIds: string[]): Observable<PersonListResponse> {
    return this.http.post<PersonListResponse>(`${peopleUrl}/activate`, {
      personIds,
    });
  }

  listPeople(): Observable<PersonListResponse> {
    return this.http.get<PersonListResponse>(peopleUrl);
  }

  getPerson(personId: string): Observable<Person> {
    return this.http.get<Person>(`${peopleUrl}/${encodeURIComponent(personId)}`);
  }

  createPerson(input: CreatePersonRequest): Observable<Person> {
    return this.http.post<Person>(peopleUrl, input);
  }

  updatePerson(personId: string, input: UpdatePersonRequest): Observable<Person> {
    return this.http.patch<Person>(`${peopleUrl}/${encodeURIComponent(personId)}`, input);
  }

  getSchedulingConfiguration(): Observable<SchedulingConfiguration> {
    return this.http.get<SchedulingConfiguration>(schedulingConfigurationUrl);
  }

  deleteMany(personIds: string[]): Observable<DeletePeopleResult> {
    if (personIds.length === 0) {
      return of({ deletedIds: [], failures: [] });
    }
    return forkJoin(
      personIds.map((personId) =>
        this.http.delete<void>(`${peopleUrl}/${encodeURIComponent(personId)}`).pipe(
          map(() => ({ personId, deleted: true as const })),
          catchError((error: unknown) =>
            of({
              personId,
              deleted: false as const,
              message: problemMessage(error, 'No se ha podido eliminar esta persona.'),
            }),
          ),
        ),
      ),
    ).pipe(
      map((results) => ({
        deletedIds: results.filter((result) => result.deleted).map(({ personId }) => personId),
        failures: results
          .filter(
            (result): result is { personId: string; deleted: false; message: string } =>
              !result.deleted,
          )
          .map(({ personId, message }) => ({ personId, message })),
      })),
      tap(() => this.loadAll()),
    );
  }

  private stateSignal(status: PersonStatus) {
    return status === 'ACTIVE' ? this.activeStateSignal : this.waitingStateSignal;
  }
}

export function problemMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  const body: unknown = error.error;
  if (
    typeof body === 'object' &&
    body !== null &&
    'detail' in body &&
    typeof body.detail === 'string' &&
    body.detail.trim()
  ) {
    return body.detail;
  }
  return fallback;
}
