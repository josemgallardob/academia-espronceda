import {
  VOLUME_LETTERS_COUNT,
  VOLUME_ROSTER_SIZE,
  VOLUME_SCIENCE_COUNT,
  buildVolumeRoster,
  isScienceTrack,
  summarizeVolumeRoster,
} from './local-volume-roster';

describe('buildVolumeRoster', () => {
  const roster = buildVolumeRoster();
  const summary = summarizeVolumeRoster(roster);

  it('builds 80 active students with a 65/35 sciences-to-letters split', () => {
    expect(summary.total).toBe(VOLUME_ROSTER_SIZE);
    expect(summary.sciences).toBe(VOLUME_SCIENCE_COUNT);
    expect(summary.letters).toBe(VOLUME_LETTERS_COUNT);
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
    const hoursOf = (predicate: (entry: (typeof roster)[number]) => boolean) =>
      roster
        .filter(predicate)
        .reduce((total, entry) => total + entry.person.weeklyHoursTotal, 0);
    const isBach = (courseCode: string) =>
      courseCode === 'BACH_1' || courseCode === 'BACH_2';

    expect(
      hoursOf(
        (entry) =>
          isScienceTrack(entry.subjects) && !isBach(entry.person.courseCode),
      ),
    ).toBe(85);
    expect(
      hoursOf(
        (entry) =>
          isScienceTrack(entry.subjects) && isBach(entry.person.courseCode),
      ),
    ).toBe(85);
    expect(hoursOf((entry) => !isScienceTrack(entry.subjects))).toBe(70);
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

  it('does not mix science and language tracks on the volume roster', () => {
    expect(
      roster.filter((entry) => isScienceTrack(entry.subjects)),
    ).toHaveLength(VOLUME_SCIENCE_COUNT);
    expect(
      roster.filter((entry) => !isScienceTrack(entry.subjects)),
    ).toHaveLength(VOLUME_LETTERS_COUNT);
  });
});
