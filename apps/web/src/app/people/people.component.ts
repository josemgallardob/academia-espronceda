import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  untracked,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import { finalize } from 'rxjs';
import { PeopleStore, problemMessage } from './people-api';
import type {
  CourseCode,
  PeopleListState,
  Person,
  PersonStatus,
  SubjectCode,
} from './people.models';

type Confirmation =
  { kind: 'activate'; personIds: string[] } | { kind: 'delete'; personIds: string[] };

interface Notice {
  tone: 'success' | 'error' | 'warning';
  message: string;
}

const courseLabels: Record<CourseCode, string> = {
  ESO_1: '1.º ESO',
  ESO_2: '2.º ESO',
  ESO_3: '3.º ESO',
  ESO_4: '4.º ESO',
  BACH_1: '1.º Bachillerato',
  BACH_2: '2.º Bachillerato',
  OTHER: 'Otro',
};

const subjectLabels: Record<SubjectCode, string> = {
  MATHEMATICS: 'Matemáticas',
  SOCIAL_SCIENCES_MATHEMATICS: 'Matemáticas CC. SS.',
  PHYSICS: 'Física',
  CHEMISTRY: 'Química',
  BIOLOGY: 'Biología',
  SPANISH_LANGUAGE: 'Lengua',
  ENGLISH: 'Inglés',
};

@Component({
  selector: 'app-people',
  templateUrl: './people.component.html',
  styleUrl: './people.component.scss',
})
export class PeopleComponent implements OnInit {
  readonly store = inject(PeopleStore);
  readonly activeTab = signal<PersonStatus>('ACTIVE');
  readonly activeSelection = signal<ReadonlySet<string>>(new Set());
  readonly waitingSelection = signal<ReadonlySet<string>>(new Set());
  readonly operationPending = signal(false);
  readonly notice = signal<Notice | null>(null);
  readonly confirmation = signal<Confirmation | null>(null);
  readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  readonly currentState = computed(() => this.stateFor(this.activeTab()));
  readonly currentSelection = computed(() => this.selectionFor(this.activeTab())());
  readonly selectedCount = computed(() => this.currentSelection().size);
  readonly actionsDisabled = computed(
    () =>
      this.currentState().kind !== 'ready' || this.selectedCount() === 0 || this.operationPending(),
  );
  readonly currentItems = computed(() => {
    const state = this.currentState();
    return state.kind === 'ready' ? state.items : [];
  });
  readonly currentErrorMessage = computed(() => {
    const state = this.currentState();
    return state.kind === 'error' ? state.message : '';
  });
  readonly allSelected = computed(
    () =>
      this.currentItems().length > 0 &&
      this.currentItems().every(({ id }) => this.currentSelection().has(id)),
  );
  readonly someSelected = computed(() => this.selectedCount() > 0 && !this.allSelected());

  private returnFocusTo: HTMLElement | null = null;

  constructor() {
    effect(() => {
      this.reconcileSelection('ACTIVE', this.store.activeState());
      this.reconcileSelection('WAITING_LIST', this.store.waitingState());
    });
  }

  ngOnInit(): void {
    this.store.loadAll();
  }

  selectTab(status: PersonStatus): void {
    this.activeTab.set(status);
  }

  retry(): void {
    this.notice.set(null);
    this.store.load(this.activeTab());
  }

  togglePerson(personId: string, checked: boolean): void {
    const selection = new Set(this.currentSelection());
    if (checked) {
      selection.add(personId);
    } else {
      selection.delete(personId);
    }
    this.selectionFor(this.activeTab()).set(selection);
  }

  handlePersonSelection(personId: string, event: Event): void {
    this.togglePerson(personId, checkboxValue(event));
  }

  toggleAll(checked: boolean): void {
    this.selectionFor(this.activeTab()).set(
      checked ? new Set(this.currentItems().map(({ id }) => id)) : new Set(),
    );
  }

  handleToggleAll(event: Event): void {
    this.toggleAll(checkboxValue(event));
  }

  requestActivation(trigger: Event): void {
    const personIds = [...this.waitingSelection()];
    if (personIds.length > 0 && !this.operationPending()) {
      this.openConfirmation({ kind: 'activate', personIds }, trigger);
    }
  }

  requestDeletion(trigger: Event): void {
    const personIds = [...this.currentSelection()];
    if (personIds.length > 0 && !this.operationPending()) {
      this.openConfirmation({ kind: 'delete', personIds }, trigger);
    }
  }

  cancelConfirmation(): void {
    this.confirmation.set(null);
    this.restoreFocus();
  }

  handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelConfirmation();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const first = this.cancelButton()?.nativeElement;
    const last = this.confirmButton()?.nativeElement;
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  confirmOperation(): void {
    const confirmation = this.confirmation();
    if (!confirmation || this.operationPending()) {
      return;
    }
    this.confirmation.set(null);
    this.notice.set(null);
    this.operationPending.set(true);
    if (confirmation.kind === 'activate') {
      this.activate(confirmation.personIds);
    } else {
      this.deletePeople(confirmation.personIds);
    }
  }

  closeNotice(): void {
    this.notice.set(null);
  }

  fullName(person: Person): string {
    return [person.firstName, person.firstSurname, person.secondSurname].filter(Boolean).join(' ');
  }

  courseLabel(code: CourseCode): string {
    return courseLabels[code];
  }

  subjectLabel(code: SubjectCode): string {
    return subjectLabels[code];
  }

  tabTotal(status: PersonStatus): number | null {
    const state = this.stateFor(status);
    return state.kind === 'ready' ? state.total : null;
  }

  selectionLabel(): string {
    const count = this.selectedCount();
    return `${count} ${count === 1 ? 'persona seleccionada' : 'personas seleccionadas'}`;
  }

  confirmationTitle(): string {
    return this.confirmation()?.kind === 'activate'
      ? 'Activar personas seleccionadas'
      : 'Eliminar personas seleccionadas';
  }

  confirmationMessage(): string {
    const confirmation = this.confirmation();
    if (!confirmation) {
      return '';
    }
    const count = confirmation.personIds.length;
    if (confirmation.kind === 'activate') {
      return `Se ${count === 1 ? 'moverá' : 'moverán'} ${count} ${count === 1 ? 'persona' : 'personas'} a alumnos activos. Esta acción no puede deshacerse desde la interfaz.`;
    }
    return `Se intentará eliminar ${count} ${count === 1 ? 'persona' : 'personas'}. Las que estén incluidas en algún horario se conservarán.`;
  }

  confirmationAction(): string {
    return this.confirmation()?.kind === 'activate' ? 'Activar' : 'Eliminar';
  }

  private activate(personIds: string[]): void {
    this.store
      .activate(personIds)
      .pipe(finalize(() => this.operationPending.set(false)))
      .subscribe({
        next: () => {
          this.waitingSelection.set(new Set());
          this.notice.set({
            tone: 'success',
            message: `${personIds.length === 1 ? 'La persona se ha activado' : `${personIds.length} personas se han activado`} correctamente.`,
          });
          this.store.loadAll();
          this.restoreFocus();
        },
        error: (error: unknown) => {
          this.notice.set({
            tone: 'error',
            message: problemMessage(
              error,
              'No se ha podido completar la activación. No se ha movido ninguna persona.',
            ),
          });
          this.restoreFocus();
        },
      });
  }

  private deletePeople(personIds: string[]): void {
    this.store
      .deleteMany(personIds)
      .pipe(finalize(() => this.operationPending.set(false)))
      .subscribe(({ deletedIds, failures }) => {
        this.selectionFor(this.activeTab()).set(new Set(failures.map(({ personId }) => personId)));
        if (failures.length === 0) {
          this.notice.set({
            tone: 'success',
            message: `${deletedIds.length === 1 ? 'La persona se ha eliminado' : `${deletedIds.length} personas se han eliminado`} correctamente.`,
          });
        } else {
          const reasons = [...new Set(failures.map(({ message }) => message))];
          this.notice.set({
            tone: deletedIds.length > 0 ? 'warning' : 'error',
            message: `${deletedIds.length} eliminadas; ${failures.length} no se han podido eliminar. ${reasons.join(' ')}`,
          });
        }
        this.restoreFocus();
      });
  }

  private openConfirmation(confirmation: Confirmation, trigger: Event): void {
    this.returnFocusTo = trigger.currentTarget as HTMLElement | null;
    this.confirmation.set(confirmation);
    setTimeout(() => this.cancelButton()?.nativeElement.focus());
  }

  private restoreFocus(): void {
    setTimeout(() => this.returnFocusTo?.focus());
  }

  private stateFor(status: PersonStatus): PeopleListState {
    return status === 'ACTIVE' ? this.store.activeState() : this.store.waitingState();
  }

  private selectionFor(status: PersonStatus): WritableSignal<ReadonlySet<string>> {
    return status === 'ACTIVE' ? this.activeSelection : this.waitingSelection;
  }

  private reconcileSelection(status: PersonStatus, state: PeopleListState): void {
    if (state.kind !== 'ready') {
      return;
    }
    const current = untracked(() => this.selectionFor(status)());
    const available = new Set(state.items.map(({ id }) => id));
    const reconciled = new Set([...current].filter((id) => available.has(id)));
    if (reconciled.size !== current.size) {
      this.selectionFor(status).set(reconciled);
    }
  }
}

function checkboxValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}
