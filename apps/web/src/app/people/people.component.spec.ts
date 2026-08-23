import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { PeopleStore } from './people-api';
import { PeopleComponent } from './people.component';
import type {
  DeletePeopleResult,
  PeopleListState,
  Person,
  PersonListResponse,
} from './people.models';

describe('PeopleComponent', () => {
  const activeState = signal<PeopleListState>({ kind: 'loading' });
  const waitingState = signal<PeopleListState>({ kind: 'loading' });
  const peopleStore = {
    activeState,
    waitingState,
    loadAll: vi.fn(),
    load: vi.fn(),
    activate: vi.fn(),
    deleteMany: vi.fn(),
  };

  beforeEach(async () => {
    activeState.set({
      kind: 'ready',
      items: [person('active-1', 'ACTIVE', 'Ana'), person('active-2', 'ACTIVE', 'Carlos')],
      total: 2,
    });
    waitingState.set({
      kind: 'ready',
      items: [person('waiting-1', 'WAITING_LIST', 'Elena')],
      total: 1,
    });
    peopleStore.loadAll.mockReset();
    peopleStore.load.mockReset();
    peopleStore.activate.mockReset();
    peopleStore.deleteMany.mockReset();

    await TestBed.configureTestingModule({
      imports: [PeopleComponent],
      providers: [provideRouter([]), { provide: PeopleStore, useValue: peopleStore }],
    }).compileComponents();
  });

  it('loads both lists and initially renders active students', () => {
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(peopleStore.loadAll).toHaveBeenCalledOnce();
    expect(element.querySelector('h1')?.textContent).toContain('Alumnos y lista de espera');
    expect(element.textContent).toContain('Ana Ruiz');
    expect(element.textContent).toContain('Carlos Ruiz');
    expect(element.textContent).not.toContain('Elena Ruiz');
    expect(element.textContent).toContain('Matemáticas · 3 h');
    expect(element.textContent).toContain('1.º Bachillerato');
  });

  it('preserves independent selections when switching tabs', () => {
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.togglePerson('active-1', true);
    component.selectTab('WAITING_LIST');
    component.togglePerson('waiting-1', true);
    component.selectTab('ACTIVE');

    expect(component.currentSelection()).toEqual(new Set(['active-1']));
    component.selectTab('WAITING_LIST');
    expect(component.currentSelection()).toEqual(new Set(['waiting-1']));
  });

  it('confirms and performs one atomic activation request', () => {
    const activation = new Subject<PersonListResponse>();
    peopleStore.activate.mockReturnValue(activation);
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectTab('WAITING_LIST');
    component.toggleAll(true);

    component.requestActivation(new Event('click'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Esta acción no puede deshacerse');
    component.confirmOperation();

    expect(component.operationPending()).toBe(true);
    expect(peopleStore.activate).toHaveBeenCalledWith(['waiting-1']);
    activation.next({ items: [], total: 0 });
    activation.complete();

    expect(component.operationPending()).toBe(false);
    expect(component.waitingSelection()).toEqual(new Set());
    expect(component.notice()?.tone).toBe('success');
    expect(peopleStore.loadAll).toHaveBeenCalledTimes(2);
  });

  it('keeps keyboard focus inside an open confirmation dialog', async () => {
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectTab('WAITING_LIST');
    component.toggleAll(true);
    component.requestActivation(new Event('click'));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));

    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('button');
    expect(document.activeElement).toBe(buttons[0]);

    buttons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('retains failed people after a partial multiple deletion', () => {
    const deletion: DeletePeopleResult = {
      deletedIds: ['active-1'],
      failures: [
        {
          personId: 'active-2',
          message: 'La persona está incluida en un horario.',
        },
      ],
    };
    peopleStore.deleteMany.mockReturnValue(of(deletion));
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.toggleAll(true);

    component.requestDeletion(new Event('click'));
    component.confirmOperation();

    expect(peopleStore.deleteMany).toHaveBeenCalledWith(['active-1', 'active-2']);
    expect(component.activeSelection()).toEqual(new Set(['active-2']));
    expect(component.notice()).toMatchObject({
      tone: 'warning',
      message: expect.stringContaining('1 eliminadas; 1 no se han podido eliminar'),
    });
  });

  it('shows empty and error states and retries only the current list', () => {
    activeState.set({ kind: 'ready', items: [], total: 0 });
    waitingState.set({ kind: 'error', message: 'Fallo controlado' });
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(fixture.nativeElement.textContent).toContain('Todavía no hay alumnos activos');
    component.selectTab('WAITING_LIST');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Fallo controlado');

    component.retry();
    expect(peopleStore.load).toHaveBeenCalledWith('WAITING_LIST');
  });

  it('keeps notices across tabs and disables actions outside a ready state', () => {
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.notice.set({ tone: 'success', message: 'Aviso persistente' });
    component.togglePerson('active-1', true);
    activeState.set({ kind: 'loading' });

    expect(component.actionsDisabled()).toBe(true);
    component.selectTab('WAITING_LIST');
    expect(component.notice()?.message).toBe('Aviso persistente');
  });
});

function person(id: string, status: Person['status'], firstName: string): Person {
  return {
    id,
    firstName,
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
