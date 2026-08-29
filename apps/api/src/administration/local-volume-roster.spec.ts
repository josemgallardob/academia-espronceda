import {
  VOLUME_LETTERS_COUNT,
  VOLUME_MIXED_COUNT,
  VOLUME_ROSTER_SIZE,
  VOLUME_SCIENCE_COUNT,
  buildVolumeRoster,
  isLetterTrack,
  isMixedTrack,
  isScienceTrack,
  summarizeVolumeRoster,
} from './local-volume-roster';

describe('buildVolumeRoster', () => {
  const roster = buildVolumeRoster();
  const summary = summarizeVolumeRoster(roster);

  it('builds 80 active students with sciences, letters, and mixed tracks', () => {
    expect(summary.total).toBe(VOLUME_ROSTER_SIZE);
    expect(summary.sciences).toBe(VOLUME_SCIENCE_COUNT);
    expect(summary.letters).toBe(VOLUME_LETTERS_COUNT);
    expect(summary.mixed).toBe(VOLUME_MIXED_COUNT);
    expect(roster.every((entry) => entry.person.status === 'ACTIVE')).toBe(
      true,
    );
  });

  it('spreads students across ESO and Bachillerato with mixed weekly hours', () => {
    expect(summary.byCourse.ESO_1).toBe(11);
    expect(summary.byCourse.ESO_2).toBe(12);
    expect(summary.byCourse.ESO_3).toBe(11);
    expect(summary.byCourse.ESO_4).toBe(11);
    expect(summary.byCourse.BACH_1).toBe(17);
    expect(summary.byCourse.BACH_2).toBe(18);
    expect(summary.byHours[1]).toBe(3);
    expect(summary.byHours[2]).toBe(14);
    expect(summary.byHours[3]).toBe(46);
    expect(summary.byHours[4]).toBe(14);
    expect(summary.byHours[5]).toBe(3);
  });

  it('gives each teacher enough hours to fill slots at three to four students', () => {
    const isBach = (courseCode: string) =>
      courseCode === 'BACH_1' || courseCode === 'BACH_2';
    const isLetterSubject = (subjectCode: string) =>
      subjectCode === 'ENGLISH' || subjectCode === 'SPANISH_LANGUAGE';

    expect(
      subjectHoursOf(
        roster,
        (entry) => !isBach(entry.person.courseCode),
        (subjectCode) => !isLetterSubject(subjectCode),
      ),
    ).toBe(81);
    expect(
      subjectHoursOf(
        roster,
        (entry) => isBach(entry.person.courseCode),
        (subjectCode) => !isLetterSubject(subjectCode),
      ),
    ).toBe(85);
    expect(
      subjectHoursOf(
        roster,
        () => true,
        (subjectCode) => isLetterSubject(subjectCode),
      ),
    ).toBe(74);
  });

  it('keeps contracted hours consistent and BACH_2 away from biology', () => {
    for (const entry of roster) {
      const subjectHours = entry.subjects.reduce(
        (total, item) => total + item.weeklyHours,
        0,
      );
      expect(subjectHours).toBe(entry.person.weeklyHoursTotal);
      expect(entry.person.weeklyHoursTotal).toBeGreaterThanOrEqual(1);
      expect(entry.person.weeklyHoursTotal).toBeLessThanOrEqual(5);
      if (entry.person.courseCode === 'BACH_2') {
        expect(
          entry.subjects.some((item) => item.subjectCode === 'BIOLOGY'),
        ).toBe(false);
      }
    }
  });

  it('includes mixed science-and-letters students such as English+Physics', () => {
    const mixed = roster.filter((entry) => isMixedTrack(entry.subjects));
    expect(mixed).toHaveLength(VOLUME_MIXED_COUNT);
    expect(
      roster.filter((entry) => isScienceTrack(entry.subjects)),
    ).toHaveLength(VOLUME_SCIENCE_COUNT);
    expect(
      roster.filter((entry) => isLetterTrack(entry.subjects)),
    ).toHaveLength(VOLUME_LETTERS_COUNT);
    expect(
      mixed.some(
        (entry) => hasSubject(entry, 'ENGLISH') && hasSubject(entry, 'PHYSICS'),
      ),
    ).toBe(true);
    expect(
      mixed.some(
        (entry) =>
          hasSubject(entry, 'SPANISH_LANGUAGE') &&
          hasSubject(entry, 'MATHEMATICS'),
      ),
    ).toBe(true);
  });

  it('adds a moderate set of unavailabilities and relationships', () => {
    const withUnavailable = roster.filter(
      (entry) => (entry.unavailableSlotIds?.length ?? 0) > 0,
    );
    const withRelated = roster.filter(
      (entry) => (entry.relatedPersonIds?.length ?? 0) > 0,
    );
    expect(withUnavailable.length).toBeGreaterThanOrEqual(16);
    expect(withUnavailable.length).toBeLessThanOrEqual(24);
    expect(
      withUnavailable.some(
        (entry) => (entry.unavailableSlotIds?.length ?? 0) >= 2,
      ),
    ).toBe(true);
    expect(withRelated).toHaveLength(6);
  });
});

type VolumeEntry = ReturnType<typeof buildVolumeRoster>[number];

function subjectHoursOf(
  roster: VolumeEntry[],
  personPredicate: (entry: VolumeEntry) => boolean,
  subjectPredicate: (subjectCode: string) => boolean,
): number {
  return roster
    .filter(personPredicate)
    .reduce(
      (total, entry) =>
        total +
        entry.subjects
          .filter((item) => subjectPredicate(item.subjectCode))
          .reduce((hours, item) => hours + item.weeklyHours, 0),
      0,
    );
}

function hasSubject(entry: VolumeEntry, subjectCode: string): boolean {
  return entry.subjects.some((item) => item.subjectCode === subjectCode);
}
