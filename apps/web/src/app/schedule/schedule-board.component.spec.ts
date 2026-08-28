import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ScheduleStore } from './schedule-api';
import { ScheduleBoardComponent } from './schedule-board.component';
import type {
  Schedule,
  ScheduleWorkspaceState,
  StudentHours,
  TeacherOption,
  WeekHourRow,
  WeeklySlot,
} from './schedule.models';
import type { Person } from '../people/people.models';

describe('ScheduleBoardComponent', () => {
  const workspace = signal<ScheduleWorkspaceState>({ kind: 'loading' });
  const teachers = signal<TeacherOption[]>([]);
  const selectedTeacherId = signal<string | null>(null);
  const pending = signal(false);
  const schedule = signal<Schedule | null>(null);
  const weekHourRows = signal<WeekHourRow[]>([]);
  const studentHours = signal<StudentHours[]>([]);
  const students = signal<Person[]>([]);
  const store = {
    workspace,
    teachers,
    students,
    selectedTeacherId,
    pending,
    schedule,
    studentHours,
    weekHourRows,
    selectedTeacher: signal<TeacherOption | null>(null),
    load: vi.fn(),
    createEmptyDraft: vi.fn(),
    createRevision: vi.fn(),
    addAssignment: vi.fn(),
    removeAssignment: vi.fn(),
    validate: vi.fn(),
    confirm: vi.fn(),
    selectTeacher: vi.fn((id: string) => selectedTeacherId.set(id)),
    classForSlot: vi.fn((slotId: string) =>
      schedule()?.classes.find((weeklyClass) => weeklyClass.slotId === slotId),
    ),
  };

  beforeEach(async () => {
    workspace.set({ kind: 'ready', schedule: scheduleFixture() });
    teachers.set([{ id: 'teacher-1', displayName: 'Profesor Uno' }]);
    selectedTeacherId.set('teacher-1');
    schedule.set(scheduleFixture());
    weekHourRows.set(weekHourRowsFromSlots(scheduleFixture().slots));
    studentHours.set([
      {
        person: personFixture(),
        assignedHours: 1,
        remainingHours: 2,
      },
    ]);
    students.set([personFixture()]);
    store.selectedTeacher = signal(teachers()[0]);
    store.load.mockReset();
    store.createEmptyDraft.mockReset();
    store.createRevision.mockReset();
    store.addAssignment.mockReset();
    store.removeAssignment.mockReset();
    store.validate.mockReset();
    store.confirm.mockReset();
    store.validate.mockReturnValue(of(scheduleFixture().evaluation));
    store.confirm.mockReturnValue(of(scheduleFixture()));

    await TestBed.configureTestingModule({
      imports: [ScheduleBoardComponent],
      providers: [{ provide: ScheduleStore, useValue: store }],
    }).compileComponents();
  });

  it('renders the weekly teacher quadrant and student roster', () => {
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(store.load).toHaveBeenCalledOnce();
    expect(text).toContain('Cuadrante semanal');
    expect(text).toContain('Profesor Uno');
    expect(text).toContain('Ana Ruiz');
    expect(text).toContain('16:00');
    expect(text).toContain('Lunes');
    expect(text).toContain('Martes');
    expect(text).toContain('Miércoles');
    expect(text).toContain('Jueves');
    expect(text).toContain('Viernes');
    expect(text).not.toContain('Anterior');
    expect(text).not.toContain('Siguiente');
    expect(fixture.nativeElement.querySelector('[aria-label="Día anterior"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Día siguiente"]')).toBeNull();
  });

  it('does not render a droppable card for hours the teacher does not work', () => {
    weekHourRows.set(
      weekHourRowsFromSlots([
        {
          id: 'slot-monday-1600',
          dayOfWeek: 'MONDAY',
          startTime: '16:00',
          endTime: '17:00',
        },
        {
          id: 'slot-tuesday-2000',
          dayOfWeek: 'TUESDAY',
          startTime: '20:00',
          endTime: '21:00',
        },
      ]),
    );
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    const cards = [...fixture.nativeElement.querySelectorAll('.slot-card')] as HTMLElement[];
    expect(cards).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.slot-empty').length).toBeGreaterThan(0);
    expect(cards.map((card) => card.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('16:00'), expect.stringContaining('20:00')]),
    );
  });

  it('explains when active students exist but none are compatible with the teacher', () => {
    studentHours.set([]);
    students.set([personFixture()]);
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    const roster = fixture.nativeElement.querySelector('.roster') as HTMLElement;
    expect(roster.textContent).toContain('No hay alumnos compatibles con este profesor.');
    expect(roster.textContent).not.toContain('Ana Ruiz');
  });

  it('changes the teacher filter without reloading the weekly schedule', () => {
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'teacher-1';
    select.dispatchEvent(new Event('change'));
    expect(store.selectTeacher).toHaveBeenCalledWith('teacher-1');
    expect(store.load).toHaveBeenCalledOnce();
  });

  it('shows the empty state and can create a draft', () => {
    workspace.set({ kind: 'empty' });
    schedule.set(null);
    store.createEmptyDraft.mockReturnValue(of(scheduleFixture()));
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((item) =>
      (item as HTMLButtonElement).textContent?.includes('Crear borrador'),
    ) as HTMLButtonElement;
    button.click();
    expect(store.createEmptyDraft).toHaveBeenCalledOnce();
  });

  it('shows a recoverable error state', () => {
    workspace.set({ kind: 'error', message: 'fallo de red' });
    schedule.set(null);
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('fallo de red');
    const retry = [...fixture.nativeElement.querySelectorAll('button')].find((item) =>
      (item as HTMLButtonElement).textContent?.includes('Reintentar'),
    ) as HTMLButtonElement;
    retry.click();
    expect(store.load).toHaveBeenCalledTimes(2);
  });

  it('assigns by drop without a keep-or-cancel dialog when the class has findings', () => {
    const assigned = scheduleFixture();
    assigned.evaluation = {
      ...assigned.evaluation!,
      findings: [
        {
          fingerprint: `sha256:${'c'.repeat(64)}`,
          ruleId: 'CLASS_CAPACITY_MINIMUM',
          enforcement: 'RELAXABLE',
          severity: 'ERROR',
          blocksConfirmation: false,
          entityRefs: [
            { type: 'CLASS', id: 'class-1' },
            { type: 'STUDENT', id: 'student-2' },
          ],
          slotIds: ['slot-monday-1600'],
          parameters: {},
          message: 'La clase tiene pocos alumnos.',
        },
      ],
    };
    assigned.classes[0].assignments.push({
      id: 'assignment-2',
      studentId: 'student-2',
      studentDisplayName: 'Luis Ruiz',
    });
    assigned.classes[0].findingFingerprints = [`sha256:${'c'.repeat(64)}`];
    store.addAssignment.mockImplementation(() => {
      schedule.set(assigned);
      workspace.set({ kind: 'ready', schedule: assigned });
      return of(assigned);
    });
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    fixture.componentInstance.onDrop(scheduleFixture().slots[0], dragEvent('student-2'));
    fixture.detectChanges();
    expect(store.addAssignment).toHaveBeenCalledWith('student-2', 'teacher-1', 'slot-monday-1600');
    expect(store.removeAssignment).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('¿Mantener');
    expect(fixture.nativeElement.textContent).not.toContain('Conflicto de asignación');
    const warningsTab = [...fixture.nativeElement.querySelectorAll('[role="tab"]')].find((item) =>
      (item as HTMLButtonElement).textContent?.includes('Avisos'),
    ) as HTMLButtonElement;
    warningsTab.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Avisos del horario semanal global');
    expect(fixture.nativeElement.textContent).toContain('La clase tiene pocos alumnos.');
  });

  it('opens the confirmation dialog with the global incidence summary', () => {
    store.validate.mockReturnValue(of(scheduleFixture().evaluation));
    store.confirm.mockReturnValue(of(scheduleFixture()));
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    const confirmButton = [...fixture.nativeElement.querySelectorAll('button')].find((item) =>
      (item as HTMLButtonElement).textContent?.includes('Confirmar horario'),
    ) as HTMLButtonElement;
    confirmButton.click();
    fixture.detectChanges();
    expect(store.validate).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Confirmar horario con incidencias');
  });

  it('highlights conflicted classes and lists global findings in Avisos', () => {
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.slot-card.conflict')).not.toBeNull();
    const warningsTab = [...fixture.nativeElement.querySelectorAll('[role="tab"]')].find((item) =>
      (item as HTMLButtonElement).textContent?.includes('Avisos'),
    ) as HTMLButtonElement;
    warningsTab.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Avisos del horario semanal global');
    expect(fixture.nativeElement.textContent).toContain('La clase tiene pocos alumnos.');
    expect(fixture.nativeElement.textContent).toContain('Incidencia');
  });

  it('blocks confirmation when the evaluation is BLOCKED', () => {
    const blocked = scheduleFixture();
    blocked.evaluation = {
      ...blocked.evaluation!,
      outcome: 'BLOCKED',
      canConfirm: false,
      counts: { blockingErrors: 1, relaxableErrors: 0, warnings: 0, information: 0 },
    };
    workspace.set({ kind: 'ready', schedule: blocked });
    schedule.set(blocked);
    store.validate.mockReturnValue(of(blocked.evaluation));
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    const confirmButton = [...fixture.nativeElement.querySelectorAll('button')].find((item) =>
      (item as HTMLButtonElement).textContent?.includes('Confirmar horario'),
    ) as HTMLButtonElement;
    confirmButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se puede confirmar el horario');
    const dialogConfirm = [...fixture.nativeElement.querySelectorAll('dialog button')].find(
      (item) => (item as HTMLButtonElement).textContent?.trim() === 'Confirmar',
    );
    expect(dialogConfirm).toBeUndefined();
  });

  it('removes a student from a class without opening a dialog', () => {
    store.removeAssignment.mockImplementation(() => of(scheduleFixture()));
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    const removeButton = fixture.nativeElement.querySelector('button.remove') as HTMLButtonElement;
    removeButton.click();
    fixture.detectChanges();
    expect(store.removeAssignment).toHaveBeenCalledWith('assignment-1');
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
  });

  it('shows assignment errors from the API', () => {
    store.addAssignment.mockReturnValue(
      throwError(() => ({ error: { detail: 'Horas excedidas' } })),
    );
    const fixture = TestBed.createComponent(ScheduleBoardComponent);
    fixture.detectChanges();
    fixture.componentInstance.onDrop(scheduleFixture().slots[0], dragEvent('student-1'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se ha podido asignar al alumno.');
  });
});

function dragEvent(studentId: string): DragEvent {
  return {
    preventDefault(): void {},
    dataTransfer: {
      getData: () => studentId,
    },
  } as unknown as DragEvent;
}

function weekHourRowsFromSlots(slots: WeeklySlot[]): WeekHourRow[] {
  const hours = [...new Map(slots.map((slot) => [slot.startTime, slot.endTime] as const))];
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;
  return hours.map(([startTime, endTime]) => ({
    startTime,
    endTime,
    cells: days.map(
      (day) => slots.find((slot) => slot.dayOfWeek === day && slot.startTime === startTime) ?? null,
    ),
  }));
}

function personFixture(): Person {
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

function scheduleFixture(): Schedule {
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
    teachers: [{ id: 'teacher-1', displayName: 'Profesor Uno' }],
    slots: [{ id: 'slot-monday-1600', dayOfWeek: 'MONDAY', startTime: '16:00', endTime: '17:00' }],
    classes: [
      {
        id: 'class-1',
        teacherId: 'teacher-1',
        slotId: 'slot-monday-1600',
        findingFingerprints: [`sha256:${'b'.repeat(64)}`],
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
      findings: [
        {
          fingerprint: `sha256:${'b'.repeat(64)}`,
          ruleId: 'CLASS_CAPACITY_MINIMUM',
          enforcement: 'RELAXABLE',
          severity: 'ERROR',
          blocksConfirmation: false,
          entityRefs: [{ type: 'CLASS', id: 'class-1' }],
          slotIds: ['slot-monday-1600'],
          parameters: {},
          message: 'La clase tiene pocos alumnos.',
        },
      ],
    },
    acceptedFindingFingerprints: [],
  };
}
