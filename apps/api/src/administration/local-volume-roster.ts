import type { CourseCode, SubjectCode } from '../database/schema/catalog';
import type {
  InsertPersonInput,
  PersonSubjectInput,
} from '../database/repositories/people.repository';

export const VOLUME_ROSTER_SIZE = 80;
export const VOLUME_SCIENCE_COUNT = 52;
export const VOLUME_LETTERS_COUNT = 28;

export type VolumeTrack = 'SCIENCES' | 'LETTERS';

interface CourseQuota {
  courseCode: CourseCode;
  sciences: number;
  letters: number;
}

const COURSE_QUOTAS: CourseQuota[] = [
  { courseCode: 'ESO_1', sciences: 9, letters: 5 },
  { courseCode: 'ESO_2', sciences: 9, letters: 5 },
  { courseCode: 'ESO_3', sciences: 9, letters: 4 },
  { courseCode: 'ESO_4', sciences: 8, letters: 5 },
  { courseCode: 'BACH_1', sciences: 10, letters: 5 },
  { courseCode: 'BACH_2', sciences: 7, letters: 4 },
];

const FIRST_NAMES = [
  'Aitana',
  'Álvaro',
  'Bruno',
  'Carla',
  'Daniel',
  'Elena',
  'Fátima',
  'Gabriel',
  'Helena',
  'Iván',
  'Jimena',
  'Hugo',
  'Inés',
  'Javier',
  'Laia',
  'Marcos',
  'Noa',
  'Óscar',
  'Paula',
  'Raúl',
  'Sara',
  'Tomás',
  'Unai',
  'Valeria',
  'Ximena',
  'Yago',
  'Zoe',
  'Adrián',
  'Blanca',
  'César',
  'Diana',
  'Erik',
  'Iris',
  'Leo',
  'Marta',
  'Nicolás',
  'Olivia',
  'Pablo',
  'Rocío',
  'Sergio',
] as const;

const SURNAMES = [
  'García',
  'Rodríguez',
  'González',
  'Fernández',
  'López',
  'Martínez',
  'Sánchez',
  'Pérez',
  'Gómez',
  'Martín',
  'Jiménez',
  'Ruiz',
  'Hernández',
  'Díaz',
  'Moreno',
  'Muñoz',
  'Álvarez',
  'Romero',
  'Alonso',
  'Gutiérrez',
  'Navarro',
  'Torres',
  'Domínguez',
  'Vázquez',
  'Ramos',
  'Gil',
  'Serrano',
  'Blanco',
  'Molina',
  'Morales',
  'Suárez',
  'Ortega',
  'Delgado',
  'Castro',
  'Ortiz',
  'Rubio',
  'Marín',
  'Sanz',
  'Iglesias',
  'Medina',
] as const;

const SCHOOLS = [
  'IES Espronceda',
  'IES Cervantes',
  'IES Isabel la Católica',
  'Colegio San José',
  null,
  'IES Lope de Vega',
] as const;

const TUTORS = [
  'Elena Ruiz',
  'Javier Molina',
  'Marta Ortega',
  'Carlos Navarro',
  'Isabel Gil',
] as const;

const SCIENCE_HOURS = [3, 2, 3, 2, 3, 2, 1, 4, 5, 3, 2, 3, 2] as const;
const LETTER_HOURS = [3, 2, 3, 2, 3, 1, 4] as const;

export function buildVolumeRoster(): InsertPersonInput[] {
  const roster: InsertPersonInput[] = [];
  let scienceIndex = 0;
  let letterIndex = 0;

  for (const quota of COURSE_QUOTAS) {
    for (let index = 0; index < quota.sciences; index += 1) {
      roster.push(
        buildStudent({
          serial: roster.length,
          track: 'SCIENCES',
          courseCode: quota.courseCode,
          hours: SCIENCE_HOURS[scienceIndex % SCIENCE_HOURS.length]!,
          variant: scienceIndex,
        }),
      );
      scienceIndex += 1;
    }
    for (let index = 0; index < quota.letters; index += 1) {
      roster.push(
        buildStudent({
          serial: roster.length,
          track: 'LETTERS',
          courseCode: quota.courseCode,
          hours: LETTER_HOURS[letterIndex % LETTER_HOURS.length]!,
          variant: letterIndex,
        }),
      );
      letterIndex += 1;
    }
  }

  applySiblingPairs(roster);
  return roster;
}

export function summarizeVolumeRoster(roster: InsertPersonInput[]): {
  total: number;
  sciences: number;
  letters: number;
  byCourse: Record<CourseCode, number>;
  byHours: Record<number, number>;
} {
  const byCourse = {
    ESO_1: 0,
    ESO_2: 0,
    ESO_3: 0,
    ESO_4: 0,
    BACH_1: 0,
    BACH_2: 0,
    OTHER: 0,
  } satisfies Record<CourseCode, number>;
  const byHours: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sciences = 0;
  let letters = 0;

  for (const entry of roster) {
    byCourse[entry.person.courseCode] += 1;
    byHours[entry.person.weeklyHoursTotal] =
      (byHours[entry.person.weeklyHoursTotal] ?? 0) + 1;
    if (isScienceTrack(entry.subjects)) {
      sciences += 1;
    } else {
      letters += 1;
    }
  }

  return { total: roster.length, sciences, letters, byCourse, byHours };
}

export function isScienceTrack(subjects: PersonSubjectInput[]): boolean {
  return subjects.every((item) => !isLetterSubject(item.subjectCode));
}

function buildStudent(input: {
  serial: number;
  track: VolumeTrack;
  courseCode: CourseCode;
  hours: number;
  variant: number;
}): InsertPersonInput {
  const id = volumeStudentId(input.serial);
  const firstName = FIRST_NAMES[input.serial % FIRST_NAMES.length]!;
  const firstSurname =
    SURNAMES[
      (input.serial + Math.floor(input.serial / FIRST_NAMES.length) * 17) %
        SURNAMES.length
    ]!;
  const secondSurname = SURNAMES[(input.serial * 7 + 3) % SURNAMES.length]!;
  const subjects =
    input.track === 'SCIENCES'
      ? scienceSubjects(input.courseCode, input.hours, input.variant)
      : letterSubjects(input.hours, input.variant);
  const lowerCourse =
    input.courseCode === 'ESO_1' || input.courseCode === 'ESO_2';
  const isTutored = lowerCourse && input.variant % 3 === 0;

  return {
    person: {
      id,
      firstName,
      firstSurname,
      secondSurname,
      courseCode: input.courseCode,
      weeklyHoursTotal: input.hours,
      schoolName: SCHOOLS[input.serial % SCHOOLS.length] ?? undefined,
      primaryPhone: `611${String(input.serial + 1).padStart(6, '0')}`,
      isTutored,
      tutorFullName: isTutored
        ? TUTORS[input.variant % TUTORS.length]
        : undefined,
      comments:
        input.variant % 11 === 0
          ? 'Perfil de volumen para probar generación automática.'
          : undefined,
      status: 'ACTIVE',
    },
    subjects,
    unavailableSlotIds: unavailableSlots(input.serial),
  };
}

function scienceSubjects(
  courseCode: CourseCode,
  hours: number,
  variant: number,
): PersonSubjectInput[] {
  const patterns = sciencePatterns(courseCode, hours);
  return patterns[variant % patterns.length]!;
}

function letterSubjects(hours: number, variant: number): PersonSubjectInput[] {
  const patterns: PersonSubjectInput[][] = {
    1: [hoursOf('ENGLISH', 1), hoursOf('SPANISH_LANGUAGE', 1)],
    2: [
      hoursOf('ENGLISH', 2),
      hoursOf('SPANISH_LANGUAGE', 2),
      [...hoursOf('ENGLISH', 1), ...hoursOf('SPANISH_LANGUAGE', 1)],
    ],
    3: [
      hoursOf('ENGLISH', 3),
      hoursOf('SPANISH_LANGUAGE', 3),
      [...hoursOf('SPANISH_LANGUAGE', 2), ...hoursOf('ENGLISH', 1)],
      [...hoursOf('ENGLISH', 2), ...hoursOf('SPANISH_LANGUAGE', 1)],
    ],
    4: [
      [...hoursOf('ENGLISH', 2), ...hoursOf('SPANISH_LANGUAGE', 2)],
      [...hoursOf('SPANISH_LANGUAGE', 3), ...hoursOf('ENGLISH', 1)],
      hoursOf('ENGLISH', 4),
    ],
    5: [
      [...hoursOf('ENGLISH', 3), ...hoursOf('SPANISH_LANGUAGE', 2)],
      [...hoursOf('SPANISH_LANGUAGE', 3), ...hoursOf('ENGLISH', 2)],
      hoursOf('ENGLISH', 5),
    ],
  }[hours]!;
  return patterns[variant % patterns.length]!;
}

function sciencePatterns(
  courseCode: CourseCode,
  hours: number,
): PersonSubjectInput[][] {
  const math = (weeklyHours: number) => hoursOf('MATHEMATICS', weeklyHours);
  const social = (weeklyHours: number) =>
    hoursOf('SOCIAL_SCIENCES_MATHEMATICS', weeklyHours);
  const physics = (weeklyHours: number) => hoursOf('PHYSICS', weeklyHours);
  const chemistry = (weeklyHours: number) => hoursOf('CHEMISTRY', weeklyHours);
  const biology = (weeklyHours: number) => hoursOf('BIOLOGY', weeklyHours);
  const allowsPhysics = courseCode !== 'ESO_1';
  const allowsBiology = courseCode !== 'BACH_2';

  if (hours === 1) {
    const options = [math(1), chemistry(1), social(1)];
    if (allowsBiology) {
      options.push(biology(1));
    }
    if (allowsPhysics) {
      options.push(physics(1));
    }
    return options;
  }

  if (hours === 2) {
    const options = [math(2), social(2), [...math(1), ...chemistry(1)]];
    if (allowsBiology) {
      options.push(biology(2), [...math(1), ...biology(1)]);
    }
    if (allowsPhysics) {
      options.push(physics(2), [...math(1), ...physics(1)]);
    }
    return options;
  }

  if (hours === 3) {
    const options = [math(3), [...math(2), ...chemistry(1)]];
    if (allowsPhysics) {
      options.push(
        [...math(2), ...physics(1)],
        [...physics(2), ...chemistry(1)],
      );
    }
    if (allowsBiology) {
      options.push(
        [...math(2), ...biology(1)],
        [...biology(2), ...chemistry(1)],
      );
    }
    return options;
  }

  if (hours === 4) {
    const options = [[...math(2), ...chemistry(2)], math(4)];
    if (allowsPhysics) {
      options.push(
        [...math(2), ...physics(2)],
        [...physics(2), ...chemistry(2)],
      );
    }
    if (allowsBiology) {
      options.push([...math(2), ...biology(2)]);
    }
    return options;
  }

  const options = [math(5), [...math(3), ...chemistry(2)]];
  if (allowsPhysics) {
    options.push([...math(3), ...physics(2)], [...physics(3), ...chemistry(2)]);
  }
  if (allowsBiology) {
    options.push([...math(3), ...biology(2)]);
  }
  return options;
}

function hoursOf(
  subjectCode: SubjectCode,
  weeklyHours: number,
): PersonSubjectInput[] {
  return [{ subjectCode, weeklyHours }];
}

function unavailableSlots(serial: number): string[] | undefined {
  if (serial % 7 !== 3) {
    return undefined;
  }
  const options = [
    'slot-friday-1600',
    'slot-monday-1600',
    'slot-wednesday-2000',
    'slot-thursday-1900',
  ];
  return [options[serial % options.length]!];
}

function applySiblingPairs(roster: InsertPersonInput[]): void {
  const pairs: Array<[number, number]> = [
    [0, 9],
    [14, 23],
    [28, 37],
  ];
  for (const [left, right] of pairs) {
    const first = roster[left];
    const second = roster[right];
    if (!first || !second) {
      continue;
    }
    second.person.firstSurname = first.person.firstSurname;
    second.person.isTutored = true;
    second.person.tutorFullName = first.person.tutorFullName ?? TUTORS[0];
    first.person.isTutored = true;
    first.person.tutorFullName = second.person.tutorFullName;
    second.relatedPersonIds = [first.person.id];
  }
}

function volumeStudentId(serial: number): string {
  return `volume-student-${String(serial + 1).padStart(2, '0')}`;
}

function isLetterSubject(subjectCode: SubjectCode): boolean {
  return subjectCode === 'ENGLISH' || subjectCode === 'SPANISH_LANGUAGE';
}
