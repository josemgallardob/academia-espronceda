import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, forkJoin, map, Observable, of, switchMap, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { problemMessage } from '../people/people-api';
import type { Person, PersonListResponse } from '../people/people.models';
import type { DayOfWeek } from '../people/people.models';
import type {
  Schedule,
  ScheduleEvaluation,
  ScheduleListResponse,
  ScheduleMutationResponse,
  ScheduleWorkspaceState,
  StudentHours,
  TeacherOption,
  WeeklyClass,
  WeeklySlot,
} from './schedule.models';
import { WEEK_DAYS } from './schedule.models';

const apiRoot = environment.apiBaseUrl.replace(/\/$/u, '');
const schedulesUrl = `${apiRoot}/v1/schedules`;
const teachersUrl = `${apiRoot}/v1/teachers`;
const peopleUrl = `${apiRoot}/v1/people`;

@Injectable({ providedIn: 'root' })
export class ScheduleStore {
  private readonly http = inject(HttpClient);
  private readonly workspaceSignal = signal<ScheduleWorkspaceState>({ kind: 'loading' });
  private readonly teachersSignal = signal<TeacherOption[]>([]);
  private readonly studentsSignal = signal<Person[]>([]);
  private readonly selectedTeacherIdSignal = signal<string | null>(null);
  private readonly selectedDaySignal = signal<DayOfWeek>('MONDAY');
  private readonly pendingSignal = signal(false);

  readonly workspace = this.workspaceSignal.asReadonly();
  readonly teachers = this.teachersSignal.asReadonly();
  readonly students = this.studentsSignal.asReadonly();
  readonly selectedTeacherId = this.selectedTeacherIdSignal.asReadonly();
  readonly selectedDay = this.selectedDaySignal.asReadonly();
  readonly pending = this.pendingSignal.asReadonly();

  readonly schedule = computed(() => {
    const workspace = this.workspaceSignal();
    return workspace.kind === 'ready' ? workspace.schedule : null;
  });

  readonly selectedTeacher = computed(() => {
    const teacherId = this.selectedTeacherIdSignal();
    return this.teachersSignal().find((teacher) => teacher.id === teacherId) ?? null;
  });

  readonly daySlots = computed(() => {
    const schedule = this.schedule();
    const day = this.selectedDaySignal();
    return (schedule?.slots ?? []).filter((slot) => slot.dayOfWeek === day);
  });

  readonly studentHours = computed((): StudentHours[] => {
    const schedule = this.schedule();
    return this.studentsSignal().map((person) => {
      const assignedHours = schedule ? countAssignments(schedule, person.id) : 0;
      return {
        person,
        assignedHours,
        remainingHours: person.weeklyHoursTotal - assignedHours,
      };
    });
  });

  load(): void {
    this.workspaceSignal.set({ kind: 'loading' });
    forkJoin({
      teachers: this.http.get<TeacherOption[]>(teachersUrl),
      people: this.http.get<PersonListResponse>(peopleUrl, { params: { status: 'ACTIVE' } }),
      schedule: this.loadWorkingSchedule(),
    }).subscribe({
      next: ({ teachers, people, schedule }) => {
        this.teachersSignal.set(teachers);
        this.studentsSignal.set(people.items);
        if (!this.selectedTeacherIdSignal()) {
          this.selectedTeacherIdSignal.set(teachers[0]?.id ?? schedule?.teachers[0]?.id ?? null);
        }
        this.workspaceSignal.set(schedule ? { kind: 'ready', schedule } : { kind: 'empty' });
      },
      error: (error: unknown) =>
        this.workspaceSignal.set({
          kind: 'error',
          message: problemMessage(error, 'No se ha podido cargar el horario. Inténtalo de nuevo.'),
        }),
    });
  }

  selectTeacher(teacherId: string): void {
    this.selectedTeacherIdSignal.set(teacherId);
  }

  selectDay(day: DayOfWeek): void {
    this.selectedDaySignal.set(day);
  }

  goToAdjacentDay(offset: number): void {
    const index = WEEK_DAYS.indexOf(this.selectedDaySignal());
    const next = WEEK_DAYS[index + offset];
    if (next) {
      this.selectedDaySignal.set(next);
    }
  }

  classForSlot(slotId: string): WeeklyClass | undefined {
    const schedule = this.schedule();
    const teacherId = this.selectedTeacherIdSignal();
    if (!schedule || !teacherId) {
      return undefined;
    }
    return schedule.classes.find(
      (weeklyClass) => weeklyClass.teacherId === teacherId && weeklyClass.slotId === slotId,
    );
  }

  createEmptyDraft(): Observable<Schedule> {
    this.pendingSignal.set(true);
    return this.http.post<Schedule>(`${schedulesUrl}/drafts`, {}).pipe(
      tap((schedule) => {
        this.workspaceSignal.set({ kind: 'ready', schedule });
        if (!this.selectedTeacherIdSignal() && schedule.teachers[0]) {
          this.selectedTeacherIdSignal.set(schedule.teachers[0].id);
        }
      }),
      finalize(() => this.pendingSignal.set(false)),
    );
  }

  addAssignment(studentId: string, teacherId: string, slotId: string): Observable<Schedule> {
    return this.mutate((schedule) =>
      this.http
        .post<ScheduleMutationResponse>(`${schedulesUrl}/${schedule.id}/assignments`, {
          expectedRevision: schedule.revision,
          studentId,
          teacherId,
          slotId,
        })
        .pipe(map((response) => response.schedule)),
    );
  }

  removeAssignment(assignmentId: string): Observable<Schedule> {
    return this.mutate((schedule) =>
      this.http
        .delete<ScheduleMutationResponse>(
          `${schedulesUrl}/${schedule.id}/assignments/${encodeURIComponent(assignmentId)}`,
          { params: { expectedRevision: schedule.revision } },
        )
        .pipe(map((response) => response.schedule)),
    );
  }

  validate(): Observable<ScheduleEvaluation> {
    const schedule = this.requireSchedule();
    this.pendingSignal.set(true);
    return this.http
      .post<ScheduleEvaluation>(`${schedulesUrl}/${schedule.id}/validate`, {
        expectedRevision: schedule.revision,
      })
      .pipe(
        tap((evaluation) => {
          const current = this.requireSchedule();
          this.workspaceSignal.set({
            kind: 'ready',
            schedule: { ...current, evaluation },
          });
        }),
        finalize(() => this.pendingSignal.set(false)),
      );
  }

  confirm(acceptRelaxableConflicts: boolean): Observable<Schedule> {
    const schedule = this.requireSchedule();
    const fingerprint = schedule.evaluation?.validationFingerprint;
    if (!fingerprint) {
      return this.validate().pipe(switchMap(() => this.confirm(acceptRelaxableConflicts)));
    }
    this.pendingSignal.set(true);
    return this.http
      .post<Schedule>(`${schedulesUrl}/${schedule.id}/confirm`, {
        expectedRevision: schedule.revision,
        validationFingerprint: fingerprint,
        acceptRelaxableConflicts,
      })
      .pipe(
        tap((confirmed) => this.workspaceSignal.set({ kind: 'ready', schedule: confirmed })),
        finalize(() => this.pendingSignal.set(false)),
      );
  }

  createRevision(): Observable<Schedule> {
    const schedule = this.requireSchedule();
    this.pendingSignal.set(true);
    return this.http.post<Schedule>(`${schedulesUrl}/${schedule.id}/revisions`, {}).pipe(
      tap((draft) => this.workspaceSignal.set({ kind: 'ready', schedule: draft })),
      finalize(() => this.pendingSignal.set(false)),
    );
  }

  private mutate(operation: (schedule: Schedule) => Observable<Schedule>): Observable<Schedule> {
    const schedule = this.requireSchedule();
    this.pendingSignal.set(true);
    return operation(schedule).pipe(
      tap((next) => this.workspaceSignal.set({ kind: 'ready', schedule: next })),
      finalize(() => this.pendingSignal.set(false)),
    );
  }

  private loadWorkingSchedule(): Observable<Schedule | null> {
    return this.http.get<ScheduleListResponse>(schedulesUrl).pipe(
      switchMap((list) => {
        const draft = list.items.find((item) => item.state === 'DRAFT');
        const current = list.items.find((item) => item.isCurrent);
        const id = draft?.id ?? current?.id;
        return id ? this.http.get<Schedule>(`${schedulesUrl}/${id}`) : of(null);
      }),
    );
  }

  private requireSchedule(): Schedule {
    const schedule = this.schedule();
    if (!schedule) {
      throw new Error('No hay un horario cargado');
    }
    return schedule;
  }
}

export function countAssignments(schedule: Schedule, studentId: string): number {
  return schedule.classes.reduce(
    (total, weeklyClass) =>
      total +
      weeklyClass.assignments.filter((assignment) => assignment.studentId === studentId).length,
    0,
  );
}

export function slotLabel(slot: WeeklySlot): string {
  return `${slot.startTime} – ${slot.endTime}`;
}
