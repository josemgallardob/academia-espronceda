import type { CourseCode, Person, SubjectCode } from './people.models';

export interface PeopleListFilters {
  query: string;
  courseCodes: readonly CourseCode[];
  subjectCodes: readonly SubjectCode[];
  weeklyHours: readonly number[];
}

export const MIN_NAME_QUERY_LENGTH = 2;

export function filterPeople(people: readonly Person[], filters: PeopleListFilters): Person[] {
  const query = activeNameQuery(filters.query);
  const courses = new Set(filters.courseCodes);
  const subjects = new Set(filters.subjectCodes);
  const hours = new Set(filters.weeklyHours);

  return people.filter((person) => {
    if (query && !personMatchesQuery(person, query)) {
      return false;
    }
    if (courses.size > 0 && !courses.has(person.courseCode)) {
      return false;
    }
    if (subjects.size > 0 && !person.subjectHours.some((item) => subjects.has(item.subjectCode))) {
      return false;
    }
    if (hours.size > 0 && !hours.has(person.weeklyHoursTotal)) {
      return false;
    }
    return true;
  });
}

export function activeNameQuery(value: string): string {
  const query = normalizeSearchText(value);
  return query.length >= MIN_NAME_QUERY_LENGTH ? query : '';
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

function personMatchesQuery(person: Person, query: string): boolean {
  const parts = [person.firstName, person.firstSurname, person.secondSurname]
    .filter((part): part is string => Boolean(part))
    .map(normalizeSearchText);
  return [...parts, parts.join(' ')].some((haystack) => haystack.includes(query));
}
