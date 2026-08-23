import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { PeopleStore } from '../people-api';
import type { Person, SchedulingConfiguration } from '../people.models';
import { PersonFormComponent } from './person-form.component';

describe('PersonFormComponent', () => {
  const createdPerson = person('created');
  const store = {
    getSchedulingConfiguration: vi.fn(() => of(configuration())),
    listPeople: vi.fn(() => of({ items: [person('related')], total: 1 })),
    getPerson: vi.fn(),
    createPerson: vi.fn(() => of(createdPerson)),
    updatePerson: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PersonFormComponent],
      providers: [provideRouter([]), { provide: PeopleStore, useValue: store }],
    }).compileComponents();
  });

  it('requires an exact integer distribution of the contracted hours', () => {
    const fixture = TestBed.createComponent(PersonFormComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.patchValue({
      firstName: 'Ana',
      firstSurname: 'Ruiz',
      courseCode: 'BACH_1',
      weeklyHoursTotal: 3,
      primaryPhone: '+34 600 000 000',
      isTutored: false,
    });

    component.toggleSubject('MATHEMATICS', true);
    component.updateSubjectHours('MATHEMATICS', '2');
    expect(component.form.hasError('hoursMismatch')).toBe(true);
    expect(component.hoursDifference()).toBe(1);
    expect(component.form.valid).toBe(false);

    component.updateSubjectHours('MATHEMATICS', '3');
    expect(component.form.hasError('hoursMismatch')).toBe(false);
    expect(component.hoursDifference()).toBe(0);
    expect(component.form.valid).toBe(true);
  });

  it('sends all approved fields and navigates to the new detail without a second confirmation', () => {
    const fixture = TestBed.createComponent(PersonFormComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.form.patchValue({
      firstName: ' Ana ',
      firstSurname: ' Ruiz ',
      courseCode: 'BACH_1',
      weeklyHoursTotal: 3,
      primaryPhone: '+34 600 000 000',
      isTutored: false,
      status: 'ACTIVE',
    });
    component.toggleSubject('MATHEMATICS', true);
    component.updateSubjectHours('MATHEMATICS', '3');

    component.save();

    expect(store.createPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Ana',
        weeklyHoursTotal: 3,
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 3 }],
        tutorFullName: null,
        status: 'ACTIVE',
      }),
    );
    expect(component.form.pristine).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/personas', 'created'], {
      queryParams: { fromStatus: 'ACTIVE', saved: 'created' },
    });
  });

  it('asks before discarding dirty data and before clearing a tutor name', async () => {
    const fixture = TestBed.createComponent(PersonFormComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.markAsDirty();

    const discard = component.canDeactivate() as Promise<boolean>;
    expect(component.confirmation()).toBe('discard');
    component.answerConfirmation(true);
    await expect(discard).resolves.toBe(true);

    component.form.controls.isTutored.setValue(true);
    component.form.controls.tutorFullName.setValue('Laura Gómez');
    const click = new Event('click', { cancelable: true });
    const change = component.changeTutored(false, click);
    expect(click.defaultPrevented).toBe(true);
    expect(component.confirmation()).toBe('tutor');
    component.answerConfirmation(false);
    await change;
    expect(component.form.controls.isTutored.value).toBe(true);
    expect(component.form.controls.tutorFullName.value).toBe('Laura Gómez');
  });
});

function configuration(): SchedulingConfiguration {
  return {
    timezone: 'Europe/Madrid',
    slots: [
      {
        id: 'slot-monday-1600',
        dayOfWeek: 'MONDAY',
        startTime: '16:00',
        endTime: '17:00',
      },
    ],
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

function person(id: string): Person {
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
    status: 'ACTIVE',
    createdAt: '2026-08-23T10:00:00.000Z',
    updatedAt: '2026-08-23T10:00:00.000Z',
  };
}
