import { filterPeople, normalizeSearchText } from './people-list-filter';
import type { Person } from './people.models';

describe('filterPeople', () => {
  const ana = person({
    id: 'ana',
    firstName: 'Ana',
    firstSurname: 'García',
    secondSurname: 'López',
    courseCode: 'ESO_1',
    subjectHours: [
      { subjectCode: 'ENGLISH', weeklyHours: 2 },
      { subjectCode: 'MATHEMATICS', weeklyHours: 1 },
    ],
    weeklyHoursTotal: 3,
  });
  const alvaro = person({
    id: 'alvaro',
    firstName: 'Álvaro',
    firstSurname: 'Ruiz',
    courseCode: 'BACH_1',
    subjectHours: [{ subjectCode: 'PHYSICS', weeklyHours: 2 }],
    weeklyHoursTotal: 2,
  });
  const carlos = person({
    id: 'carlos',
    firstName: 'Carlos',
    firstSurname: 'Ruiz',
    courseCode: 'ESO_1',
    subjectHours: [{ subjectCode: 'SPANISH_LANGUAGE', weeklyHours: 4 }],
    weeklyHoursTotal: 4,
  });
  const roster = [ana, alvaro, carlos];

  it('returns every person when no filter is active', () => {
    expect(filterPeople(roster, emptyFilters())).toEqual(roster);
  });

  it('filters by name or surnames once at least two characters are typed', () => {
    expect(filterPeople(roster, emptyFilters({ query: 'a' }))).toEqual(roster);
    expect(filterPeople(roster, emptyFilters({ query: ' á ' }))).toEqual(roster);
    expect(ids(filterPeople(roster, emptyFilters({ query: 'an' })))).toEqual(['ana']);
    expect(ids(filterPeople(roster, emptyFilters({ query: 'ru' })))).toEqual(['alvaro', 'carlos']);
    expect(ids(filterPeople(roster, emptyFilters({ query: 'cia' })))).toEqual(['ana']);
    expect(ids(filterPeople(roster, emptyFilters({ query: 'ana gar' })))).toEqual(['ana']);
  });

  it('ignores case, accents and extra spaces in the query', () => {
    expect(normalizeSearchText('  ÁLvaro   GARCÍA ')).toBe('alvaro garcia');
    expect(ids(filterPeople(roster, emptyFilters({ query: 'alvaro' })))).toEqual(['alvaro']);
    expect(ids(filterPeople(roster, emptyFilters({ query: '  GARCÍA  ' })))).toEqual(['ana']);
  });

  it('applies multi-select filters with OR inside each field and AND across fields', () => {
    expect(ids(filterPeople(roster, emptyFilters({ courseCodes: ['ESO_1', 'BACH_1'] })))).toEqual([
      'ana',
      'alvaro',
      'carlos',
    ]);
    expect(
      ids(filterPeople(roster, emptyFilters({ subjectCodes: ['PHYSICS', 'SPANISH_LANGUAGE'] }))),
    ).toEqual(['alvaro', 'carlos']);
    expect(ids(filterPeople(roster, emptyFilters({ weeklyHours: [2, 4] })))).toEqual([
      'alvaro',
      'carlos',
    ]);
    expect(
      ids(
        filterPeople(
          roster,
          emptyFilters({
            courseCodes: ['ESO_1'],
            subjectCodes: ['ENGLISH', 'PHYSICS'],
            weeklyHours: [3, 2],
          }),
        ),
      ),
    ).toEqual(['ana']);
  });
});

function emptyFilters(
  overrides: Partial<Parameters<typeof filterPeople>[1]> = {},
): Parameters<typeof filterPeople>[1] {
  return {
    query: '',
    courseCodes: [],
    subjectCodes: [],
    weeklyHours: [],
    ...overrides,
  };
}

function ids(people: Person[]): string[] {
  return people.map((item) => item.id);
}

function person(overrides: Partial<Person> & Pick<Person, 'id' | 'firstName'>): Person {
  return {
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
    createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  };
}
