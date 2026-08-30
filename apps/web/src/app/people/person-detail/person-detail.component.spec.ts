import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { ScheduleStore } from '../../schedule/schedule-api';
import type { Schedule, TeacherOption } from '../../schedule/schedule.models';
import { PeopleStore } from '../people-api';
import type { Person, SchedulingConfiguration } from '../people.models';
import { PersonDetailComponent } from './person-detail.component';

describe('PersonDetailComponent', () => {
  it('renders the approved read-only sections and resolves catalog labels', async () => {
    const { fixture } = await createFixture();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ana Ruiz');
    expect(text).toContain('Datos personales y contacto');
    expect(text).toContain('Curso, asignaturas y horas');
    expect(text).toContain('Indisponibilidad semanal');
    expect(text).toContain('Tutoría y relaciones');
    expect(text).toContain('Comentarios');
    expect(text).toContain('Matemáticas');
    expect(text).toContain('Lunes');
    expect(text).not.toContain('Horario confirmado');
  });

  it('shows confirmed slots with subjects and teacher for an active student', async () => {
    const { fixture } = await createFixture({
      schedule: confirmedSchedule(),
      teachers: [profesor2()],
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Horario confirmado');
    expect(text).toContain('Lunes');
    expect(text).toContain('16:00–17:00');
    expect(text).toContain('Física');
    expect(text).toContain('Profesor 2');
  });

  it('hides the confirmed schedule section for waiting-list people', async () => {
    const { fixture } = await createFixture({
      person: person({ status: 'WAITING_LIST' }),
      schedule: confirmedSchedule(),
      teachers: [profesor2()],
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Lista de espera');
    expect(text).not.toContain('Horario confirmado');
    expect(text).not.toContain('Profesor 2');
  });

  it('keeps the person detail when there is no current confirmed schedule', async () => {
    const { fixture, scheduleStore } = await createFixture();

    expect(scheduleStore.getCurrentConfirmedSchedule).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ana Ruiz');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Horario confirmado');
  });

  it('returns to the people list when opened from that list', async () => {
    const { fixture } = await createFixture();
    const back = (fixture.nativeElement as HTMLElement).querySelector(
      '.back-link',
    ) as HTMLAnchorElement | null;

    expect(back?.textContent?.trim()).toBe('← Volver al listado');
    expect(back?.getAttribute('href')).toBe('/personas?status=ACTIVE');
  });

  it('reloads the detail when opening a related person from the same route', async () => {
    const related = person({
      id: 'person-2',
      firstName: 'Luis',
      firstSurname: 'García',
    });
    const current = person({ relatedPersonIds: [related.id] });
    const paramMap = new BehaviorSubject(convertToParamMap({ personId: current.id }));
    const { fixture, store } = await createFixture({
      person: current,
      people: [current, related],
      paramMap,
    });

    const relatedLink = [...fixture.nativeElement.querySelectorAll('a')].find((anchor) =>
      (anchor as HTMLAnchorElement).textContent?.includes('Luis García'),
    ) as HTMLAnchorElement | null;
    expect(relatedLink?.getAttribute('href')).toBe('/personas/person-2?fromStatus=ACTIVE');

    paramMap.next(convertToParamMap({ personId: related.id }));
    fixture.detectChanges();

    expect(store.getPerson).toHaveBeenCalledWith('person-2');
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain(
      'Luis García',
    );
  });

  it('returns to the schedule board when opened from a quadrant slot', async () => {
    const { fixture } = await createFixture({
      queryParams: { fromStatus: 'ACTIVE', from: 'horario' },
    });
    const back = (fixture.nativeElement as HTMLElement).querySelector(
      '.back-link',
    ) as HTMLAnchorElement | null;

    expect(back?.textContent?.trim()).toBe('← Volver al cuadrante');
    expect(back?.getAttribute('href')).toBe('/horario');
  });
});

async function createFixture(
  overrides: {
    person?: Person;
    people?: Person[];
    schedule?: Schedule | null;
    teachers?: TeacherOption[];
    queryParams?: Record<string, string>;
    paramMap?: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  } = {},
) {
  const currentPerson = overrides.person ?? person();
  const people = overrides.people ?? [currentPerson];
  const paramMap =
    overrides.paramMap ?? new BehaviorSubject(convertToParamMap({ personId: currentPerson.id }));
  const queryParamMap = convertToParamMap(overrides.queryParams ?? {});
  const store = {
    getPerson: vi.fn((personId: string) =>
      of(people.find((item) => item.id === personId) ?? currentPerson),
    ),
    getSchedulingConfiguration: vi.fn(() => of(configuration())),
    listPeople: vi.fn(() => of({ items: people, total: people.length })),
  };
  const scheduleStore = {
    getCurrentConfirmedSchedule: vi.fn(() => of(overrides.schedule ?? null)),
    listTeachers: vi.fn(() => of(overrides.teachers ?? [])),
  };
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [PersonDetailComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: paramMap.value,
            queryParamMap,
          },
          paramMap,
          queryParamMap: of(queryParamMap),
        },
      },
      { provide: PeopleStore, useValue: store },
      { provide: ScheduleStore, useValue: scheduleStore },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PersonDetailComponent);
  fixture.detectChanges();
  return { fixture, store, scheduleStore };
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    firstName: 'Ana',
    firstSurname: 'Ruiz',
    secondSurname: null,
    courseCode: 'BACH_1',
    subjectHours: [
      { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
      { subjectCode: 'PHYSICS', weeklyHours: 1 },
    ],
    weeklyHoursTotal: 3,
    schoolName: null,
    unavailableSlotIds: ['slot-monday-1600'],
    relatedPersonIds: [],
    primaryPhone: '600000000',
    secondaryPhone: null,
    isTutored: false,
    tutorFullName: null,
    comments: null,
    status: 'ACTIVE',
    createdAt: '2026-08-23T10:00:00.000Z',
    updatedAt: '2026-08-23T10:00:00.000Z',
    ...overrides,
  };
}

function configuration(): SchedulingConfiguration {
  return {
    timezone: 'Europe/Madrid',
    slots: [{ id: 'slot-monday-1600', dayOfWeek: 'MONDAY', startTime: '16:00', endTime: '17:00' }],
    courseLabels: {
      ESO_1: '1.º ESO',
      ESO_2: '2.º ESO',
      ESO_3: '3.º ESO',
      ESO_4: '4.º ESO',
      BACH_1: '1.º Bachillerato',
      BACH_2: '2.º Bachillerato',
      OTHER: 'Otro',
    },
    subjectLabels: {
      MATHEMATICS: 'Matemáticas',
      SOCIAL_SCIENCES_MATHEMATICS: 'Matemáticas CC. SS.',
      PHYSICS: 'Física',
      CHEMISTRY: 'Química',
      BIOLOGY: 'Biología',
      SPANISH_LANGUAGE: 'Lengua castellana',
      ENGLISH: 'Inglés',
    },
  };
}

function profesor2(): TeacherOption {
  return {
    id: 'teacher-2',
    displayName: 'Profesor 2',
    subjectCodes: ['MATHEMATICS', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY'],
    courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1', 'BACH_2'],
  };
}

function confirmedSchedule(): Schedule {
  return {
    id: 'schedule-1',
    state: 'CONFIRMED',
    revision: 1,
    isCurrent: true,
    sourceScheduleId: null,
    ruleCatalogVersion: '1.0.0',
    createdAt: '2026-08-23T10:00:00.000Z',
    confirmedAt: '2026-08-23T11:00:00.000Z',
    confirmedByUserId: 'user-1',
    teachers: [{ id: 'teacher-2', displayName: 'Profesor 2' }],
    slots: [{ id: 'slot-monday-1600', dayOfWeek: 'MONDAY', startTime: '16:00', endTime: '17:00' }],
    classes: [
      {
        id: 'class-1',
        teacherId: 'teacher-2',
        slotId: 'slot-monday-1600',
        findingFingerprints: [],
        assignments: [
          { id: 'assignment-1', studentId: 'person-1', studentDisplayName: 'Ana Ruiz' },
        ],
      },
    ],
    subjectTeacherAllocations: [
      {
        studentId: 'person-1',
        teacherId: 'teacher-2',
        totalHours: 1,
        subjectHours: [{ subjectCode: 'PHYSICS', weeklyHours: 1 }],
      },
    ],
    evaluation: null,
    acceptedFindingFingerprints: [],
  };
}
