import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PeopleStore } from '../people-api';
import type { Person, SchedulingConfiguration } from '../people.models';
import { PersonDetailComponent } from './person-detail.component';

describe('PersonDetailComponent', () => {
  it('renders the approved read-only sections and resolves catalog labels', async () => {
    const store = {
      getPerson: vi.fn(() => of(person())),
      getSchedulingConfiguration: vi.fn(() => of(configuration())),
      listPeople: vi.fn(() => of({ items: [person()], total: 1 })),
    };
    await TestBed.configureTestingModule({
      imports: [PersonDetailComponent],
      providers: [provideRouter([]), { provide: PeopleStore, useValue: store }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PersonDetailComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ana Ruiz');
    expect(text).toContain('Datos personales y contacto');
    expect(text).toContain('Curso, asignaturas y horas');
    expect(text).toContain('Indisponibilidad semanal');
    expect(text).toContain('Tutoría y relaciones');
    expect(text).toContain('Comentarios');
    expect(text).toContain('Matemáticas');
    expect(text).toContain('Lunes');
  });
});

function person(): Person {
  return {
    id: 'person-1',
    firstName: 'Ana',
    firstSurname: 'Ruiz',
    secondSurname: null,
    courseCode: 'BACH_1',
    subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 3 }],
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
