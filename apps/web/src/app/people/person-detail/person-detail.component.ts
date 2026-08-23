import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PeopleStore, problemMessage } from '../people-api';
import type {
  CourseCode,
  DayOfWeek,
  Person,
  PersonStatus,
  SchedulingConfiguration,
  SubjectCode,
  WeeklySlot,
} from '../people.models';

const dayOrder: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const dayLabels: Record<DayOfWeek, string> = {
  MONDAY: 'Lunes',
  TUESDAY: 'Martes',
  WEDNESDAY: 'Miércoles',
  THURSDAY: 'Jueves',
  FRIDAY: 'Viernes',
};

@Component({
  selector: 'app-person-detail',
  imports: [RouterLink],
  templateUrl: './person-detail.component.html',
  styleUrl: './person-detail.component.scss',
})
export class PersonDetailComponent implements OnInit {
  private readonly store = inject(PeopleStore);
  private readonly route = inject(ActivatedRoute);

  readonly personId = this.route.snapshot.paramMap.get('personId')!;
  readonly sourceStatus: PersonStatus =
    this.route.snapshot.queryParamMap.get('fromStatus') === 'WAITING_LIST'
      ? 'WAITING_LIST'
      : 'ACTIVE';
  readonly saved = this.route.snapshot.queryParamMap.get('saved');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notFound = signal(false);
  readonly person = signal<Person | null>(null);
  readonly configuration = signal<SchedulingConfiguration | null>(null);
  readonly allPeople = signal<Person[]>([]);
  readonly relatedPeople = computed(() => {
    const person = this.person();
    if (!person) return [];
    const ids = new Set(person.relatedPersonIds);
    return this.allPeople().filter(({ id }) => ids.has(id));
  });
  readonly unavailableByDay = computed(() => {
    const unavailable = new Set(this.person()?.unavailableSlotIds ?? []);
    return dayOrder
      .map((day) => ({
        day,
        slots: (this.configuration()?.slots ?? []).filter(
          (slot) => slot.dayOfWeek === day && unavailable.has(slot.id),
        ),
      }))
      .filter(({ slots }) => slots.length > 0);
  });

  ngOnInit(): void {
    this.load();
  }

  retry(): void {
    this.load();
  }

  fullName(person: Person): string {
    return [person.firstName, person.firstSurname, person.secondSurname].filter(Boolean).join(' ');
  }

  courseLabel(code: CourseCode): string {
    return this.configuration()?.courseLabels[code] ?? code;
  }

  subjectLabel(code: SubjectCode): string {
    return this.configuration()?.subjectLabels[code] ?? code;
  }

  statusLabel(status: PersonStatus): string {
    return status === 'ACTIVE' ? 'Alumno activo' : 'Lista de espera';
  }

  dayLabel(day: DayOfWeek): string {
    return dayLabels[day];
  }

  slotLabel(slot: WeeklySlot): string {
    return `${slot.startTime}–${slot.endTime}`;
  }

  value(value: string | null): string {
    return value?.trim() || 'No indicado';
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    this.notFound.set(false);
    forkJoin({
      person: this.store.getPerson(this.personId),
      configuration: this.store.getSchedulingConfiguration(),
      people: this.store.listPeople(),
    }).subscribe({
      next: ({ person, configuration, people }) => {
        this.person.set(person);
        this.configuration.set(configuration);
        this.allPeople.set(people.items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.notFound.set(error instanceof HttpErrorResponse && error.status === 404);
        this.error.set(
          this.notFound()
            ? 'La persona solicitada no existe o ya no está disponible.'
            : problemMessage(error, 'No se ha podido cargar el detalle de la persona.'),
        );
        this.loading.set(false);
      },
    });
  }
}
