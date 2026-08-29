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
    expect(summary.byCourse.ESO_1).toBe(14);
    expect(summary.byCourse.ESO_2).toBe(14);
    expect(summary.byCourse.ESO_3).toBe(13);
    expect(summary.byCourse.ESO_4).toBe(13);
    expect(summary.byCourse.BACH_1).toBe(15);
    expect(summary.byCourse.BACH_2).toBe(11);
    expect(summary.byHours[1]).toBeGreaterThan(0);
    expect(summary.byHours[2]).toBeGreaterThan(0);
    expect(summary.byHours[3]).toBeGreaterThan(summary.byHours[2]);
    expect(summary.byHours[3] - summary.byHours[2]).toBeLessThanOrEqual(6);
    expect(summary.byHours[4]).toBeGreaterThan(0);
    expect(summary.byHours[5]).toBeGreaterThan(0);
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
