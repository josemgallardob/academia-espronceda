import { CommonModule } from '@angular/common';
import { Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { PeopleStore, problemMessage } from '../people-api';
import type {
  CourseCode,
  DayOfWeek,
  Person,
  PersonStatus,
  SchedulingConfiguration,
  SubjectCode,
  UpdatePersonRequest,
  WeeklySlot,
} from '../people.models';

type SubjectDraft = Partial<Record<SubjectCode, number | null>>;
type ConfirmationKind = 'discard' | 'tutor';

const dayOrder: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const dayLabels: Record<DayOfWeek, string> = {
  MONDAY: 'Lunes',
  TUESDAY: 'Martes',
  WEDNESDAY: 'Miércoles',
  THURSDAY: 'Jueves',
  FRIDAY: 'Viernes',
};

@Component({
  selector: 'app-person-form',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './person-form.component.html',
  styleUrl: './person-form.component.scss',
})
export class PersonFormComponent implements OnInit {
  private readonly store = inject(PeopleStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private confirmationResolver: ((accepted: boolean) => void) | null = null;

  readonly personId = this.route.snapshot.paramMap.get('personId');
  readonly editing = this.personId !== null;
  readonly sourceStatus: PersonStatus =
    this.route.snapshot.queryParamMap.get('fromStatus') === 'WAITING_LIST'
      ? 'WAITING_LIST'
      : 'ACTIVE';
  readonly fromSchedule = this.route.snapshot.queryParamMap.get('from') === 'horario';
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');
  readonly configuration = signal<SchedulingConfiguration | null>(null);
  readonly relationPeople = signal<Person[]>([]);
  readonly loadedPerson = signal<Person | null>(null);
  readonly relationQuery = signal('');
  readonly confirmation = signal<ConfirmationKind | null>(null);

  readonly form = new FormGroup(
    {
      firstName: new FormControl('', { nonNullable: true, validators: [requiredTrimmed] }),
      firstSurname: new FormControl('', { nonNullable: true, validators: [requiredTrimmed] }),
      secondSurname: new FormControl('', { nonNullable: true }),
      courseCode: new FormControl<CourseCode | null>(null, Validators.required),
      subjectHours: new FormControl<SubjectDraft>({}, { nonNullable: true }),
      weeklyHoursTotal: new FormControl<number | null>(null, [
        Validators.required,
        Validators.min(1),
        integerValidator,
      ]),
      schoolName: new FormControl('', { nonNullable: true }),
      unavailableSlotIds: new FormControl<string[]>([], { nonNullable: true }),
      relatedPersonIds: new FormControl<string[]>([], { nonNullable: true }),
      primaryPhone: new FormControl('', { nonNullable: true, validators: [requiredTrimmed] }),
      secondaryPhone: new FormControl('', { nonNullable: true }),
      isTutored: new FormControl<boolean | null>(null, Validators.required),
      tutorFullName: new FormControl('', { nonNullable: true }),
      comments: new FormControl('', { nonNullable: true }),
      status: new FormControl<PersonStatus>(this.sourceStatus, { nonNullable: true }),
    },
    { validators: personFormValidator },
  );

  readonly allocatedHours = signal(0);
  hoursDifference(): number | null {
    const total = this.form.controls.weeklyHoursTotal.value;
    return total === null ? null : total - this.allocatedHours();
  }
  readonly filteredRelationPeople = computed(() => {
    const query = normalize(this.relationQuery());
    const selected = new Set(this.form.controls.relatedPersonIds.value);
    return this.relationPeople()
      .filter(({ id }) => !selected.has(id))
      .filter((person) =>
        normalize(`${this.fullName(person)} ${this.courseLabel(person.courseCode)}`).includes(
          query,
        ),
      )
      .slice(0, 8);
  });

  ngOnInit(): void {
    this.load();
    this.form.controls.subjectHours.valueChanges.subscribe(() => this.recalculateHours());
  }

  @HostListener('window:beforeunload', ['$event'])
  protectBrowserExit(event: BeforeUnloadEvent): void {
    if (this.form.dirty && !this.saving()) {
      event.preventDefault();
    }
  }

  canDeactivate(): boolean | Promise<boolean> {
    return !this.form.dirty || this.saving() ? true : this.askForConfirmation('discard');
  }

  retry(): void {
    this.load();
  }

  courseEntries(): Array<[CourseCode, string]> {
    return Object.entries(this.configuration()?.courseLabels ?? {}) as Array<[CourseCode, string]>;
  }

  subjectEntries(): Array<[SubjectCode, string]> {
    return Object.entries(this.configuration()?.subjectLabels ?? {}) as Array<
      [SubjectCode, string]
    >;
  }

  slotsForDay(day: DayOfWeek): WeeklySlot[] {
    return this.configuration()?.slots.filter((slot) => slot.dayOfWeek === day) ?? [];
  }

  readonly days = dayOrder;

  dayLabel(day: DayOfWeek): string {
    return dayLabels[day];
  }

  isSubjectSelected(code: SubjectCode): boolean {
    return Object.hasOwn(this.form.controls.subjectHours.value, code);
  }

  subjectHours(code: SubjectCode): number | null {
    return this.form.controls.subjectHours.value[code] ?? null;
  }

  toggleSubject(code: SubjectCode, selected: boolean): void {
    const draft = { ...this.form.controls.subjectHours.value };
    if (selected) {
      draft[code] = null;
    } else {
      delete draft[code];
    }
    this.form.controls.subjectHours.setValue(draft);
    this.form.controls.subjectHours.markAsDirty();
    this.form.controls.subjectHours.markAsTouched();
  }

  updateSubjectHours(code: SubjectCode, value: string): void {
    const draft = { ...this.form.controls.subjectHours.value };
    draft[code] = value === '' ? null : Number(value);
    this.form.controls.subjectHours.setValue(draft);
    this.form.controls.subjectHours.markAsDirty();
  }

  toggleUnavailable(slotId: string, unavailable: boolean): void {
    const ids = new Set(this.form.controls.unavailableSlotIds.value);
    if (unavailable) {
      ids.add(slotId);
    } else {
      ids.delete(slotId);
    }
    this.form.controls.unavailableSlotIds.setValue([...ids]);
    this.form.controls.unavailableSlotIds.markAsDirty();
  }

  isUnavailable(slotId: string): boolean {
    return this.form.controls.unavailableSlotIds.value.includes(slotId);
  }

  async changeTutored(isTutored: boolean, event?: Event): Promise<void> {
    event?.preventDefault();
    const tutorName = this.form.controls.tutorFullName.value.trim();
    if (!isTutored && this.form.controls.isTutored.value === true && tutorName) {
      if (!(await this.askForConfirmation('tutor'))) {
        return;
      }
      this.form.controls.tutorFullName.setValue('');
    }
    this.form.controls.isTutored.setValue(isTutored);
    this.form.controls.isTutored.markAsDirty();
  }

  addRelated(personId: string): void {
    const control = this.form.controls.relatedPersonIds;
    control.setValue([...control.value, personId]);
    control.markAsDirty();
    this.relationQuery.set('');
  }

  removeRelated(personId: string): void {
    const control = this.form.controls.relatedPersonIds;
    control.setValue(control.value.filter((id) => id !== personId));
    control.markAsDirty();
  }

  relatedPerson(personId: string): Person | undefined {
    return this.relationPeople().find(({ id }) => id === personId);
  }

  fullName(person: Person): string {
    return [person.firstName, person.firstSurname, person.secondSurname].filter(Boolean).join(' ');
  }

  courseLabel(code: CourseCode): string {
    return this.configuration()?.courseLabels[code] ?? code;
  }

  statusLabel(status: PersonStatus): string {
    return status === 'ACTIVE' ? 'Alumno activo' : 'Lista de espera';
  }

  cancel(): void {
    void this.router.navigate(this.returnTarget(), { queryParams: this.returnQueryParams() });
  }

  save(): void {
    this.saveError.set('');
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();
    if (this.form.invalid || this.saving()) {
      return;
    }
    const input = this.requestBody();
    this.saving.set(true);
    this.form.disable({ emitEvent: false });
    const request = this.editing
      ? this.store.updatePerson(this.personId!, input)
      : this.store.createPerson({ ...input, status: this.form.controls.status.value });
    request
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.form.enable({ emitEvent: false });
        }),
      )
      .subscribe({
        next: (person) => {
          this.form.markAsPristine();
          void this.router.navigate(['/personas', person.id], {
            queryParams: {
              fromStatus: person.status,
              saved: this.editing ? 'updated' : 'created',
              ...(this.fromSchedule ? { from: 'horario' } : {}),
            },
          });
        },
        error: (error: unknown) =>
          this.saveError.set(
            problemMessage(
              error,
              'No se han podido guardar los cambios. Revisa los datos e inténtalo de nuevo.',
            ),
          ),
      });
  }

  confirmationTitle(): string {
    return this.confirmation() === 'tutor' ? 'Descartar el nombre del tutor' : 'Descartar cambios';
  }

  confirmationMessage(): string {
    return this.confirmation() === 'tutor'
      ? 'Al indicar que no recibe tutoría se eliminará el nombre introducido.'
      : 'Hay cambios sin guardar. Si sales ahora, se perderán.';
  }

  answerConfirmation(accepted: boolean): void {
    this.confirmation.set(null);
    this.confirmationResolver?.(accepted);
    this.confirmationResolver = null;
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set('');
    const common = {
      configuration: this.store.getSchedulingConfiguration(),
      people: this.store.listPeople(),
    };
    const request = this.editing
      ? forkJoin({ ...common, person: this.store.getPerson(this.personId!) })
      : forkJoin(common);
    request.subscribe({
      next: (result) => {
        this.configuration.set(result.configuration);
        this.relationPeople.set(result.people.items.filter(({ id }) => id !== this.personId));
        if ('person' in result) {
          const person = result.person as Person;
          this.loadedPerson.set(person);
          this.patchPerson(person);
        }
        this.recalculateHours();
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(
          problemMessage(
            error,
            this.editing
              ? 'No se ha podido cargar la persona y los datos necesarios.'
              : 'No se han podido cargar los datos necesarios para crear la persona.',
          ),
        );
        this.loading.set(false);
      },
    });
  }

  private patchPerson(person: Person): void {
    this.form.patchValue(
      {
        firstName: person.firstName,
        firstSurname: person.firstSurname,
        secondSurname: person.secondSurname ?? '',
        courseCode: person.courseCode,
        subjectHours: Object.fromEntries(
          person.subjectHours.map(({ subjectCode, weeklyHours }) => [subjectCode, weeklyHours]),
        ),
        weeklyHoursTotal: person.weeklyHoursTotal,
        schoolName: person.schoolName ?? '',
        unavailableSlotIds: person.unavailableSlotIds,
        relatedPersonIds: person.relatedPersonIds,
        primaryPhone: person.primaryPhone,
        secondaryPhone: person.secondaryPhone ?? '',
        isTutored: person.isTutored,
        tutorFullName: person.tutorFullName ?? '',
        comments: person.comments ?? '',
        status: person.status,
      },
      { emitEvent: false },
    );
  }

  private requestBody(): UpdatePersonRequest {
    const value = this.form.getRawValue();
    return {
      firstName: value.firstName.trim(),
      firstSurname: value.firstSurname.trim(),
      secondSurname: nullable(value.secondSurname),
      courseCode: value.courseCode!,
      subjectHours: Object.entries(value.subjectHours).map(([subjectCode, weeklyHours]) => ({
        subjectCode: subjectCode as SubjectCode,
        weeklyHours: weeklyHours!,
      })),
      weeklyHoursTotal: value.weeklyHoursTotal!,
      schoolName: nullable(value.schoolName),
      unavailableSlotIds: value.unavailableSlotIds,
      relatedPersonIds: value.relatedPersonIds,
      primaryPhone: value.primaryPhone.trim(),
      secondaryPhone: nullable(value.secondaryPhone),
      isTutored: value.isTutored!,
      tutorFullName: value.isTutored ? nullable(value.tutorFullName) : null,
      comments: nullable(value.comments),
    };
  }

  private recalculateHours(): void {
    this.allocatedHours.set(
      Object.values(this.form.controls.subjectHours.value).reduce<number>(
        (sum, hours) => sum + (typeof hours === 'number' && Number.isFinite(hours) ? hours : 0),
        0,
      ),
    );
  }

  private askForConfirmation(kind: ConfirmationKind): Promise<boolean> {
    this.confirmation.set(kind);
    return new Promise((resolve) => {
      this.confirmationResolver = resolve;
    });
  }

  returnTarget(): string[] {
    return this.editing ? ['/personas', this.personId!] : ['/personas'];
  }

  returnQueryParams(): Record<string, string> {
    if (!this.editing) {
      return { status: this.sourceStatus };
    }
    return {
      fromStatus: this.loadedPerson()?.status ?? this.sourceStatus,
      ...(this.fromSchedule ? { from: 'horario' } : {}),
    };
  }
}

function requiredTrimmed(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}

function integerValidator(control: AbstractControl<number | null>): ValidationErrors | null {
  return control.value === null || Number.isInteger(control.value) ? null : { integer: true };
}

function personFormValidator(control: AbstractControl): ValidationErrors | null {
  const group = control as PersonFormComponent['form'];
  const subjects = Object.values(group.controls.subjectHours.value);
  const validSubjects =
    subjects.length > 0 &&
    subjects.every((hours) => typeof hours === 'number' && Number.isInteger(hours) && hours >= 1);
  const total = group.controls.weeklyHoursTotal.value;
  const allocated = subjects.reduce<number>(
    (sum, hours) => sum + (typeof hours === 'number' ? hours : 0),
    0,
  );
  const tutorValid =
    group.controls.isTutored.value !== true || Boolean(group.controls.tutorFullName.value.trim());
  const errors: ValidationErrors = {
    ...(!validSubjects ? { subjects: true } : {}),
    ...(total !== null && allocated !== total ? { hoursMismatch: true } : {}),
    ...(!tutorValid ? { tutorName: true } : {}),
  };
  return Object.keys(errors).length > 0 ? errors : null;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim();
}
