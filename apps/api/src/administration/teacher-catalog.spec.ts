import {
  CATALOG_TEACHERS,
  DEFAULT_TEACHER_DISPLAY_NAMES,
  resolveTeacherDisplayNames,
} from './teacher-catalog';

describe('teacher catalog', () => {
  it('defines the three scheduling profiles used by the academy', () => {
    expect(CATALOG_TEACHERS.map((teacher) => teacher.id)).toEqual([
      'teacher-senior-sciences',
      'teacher-general-sciences',
      'teacher-languages',
    ]);
    expect(CATALOG_TEACHERS.map((teacher) => teacher.profile)).toEqual([
      'SENIOR_SCIENCES',
      'GENERAL_SCIENCES',
      'LANGUAGES',
    ]);
  });

  it('uses configured labels when present and falls back to generic names', () => {
    expect(resolveTeacherDisplayNames({})).toEqual(
      DEFAULT_TEACHER_DISPLAY_NAMES,
    );
    expect(
      resolveTeacherDisplayNames({
        TEACHER_1_DISPLAY_NAME: '  Martín  ',
        TEACHER_2_DISPLAY_NAME: '',
        TEACHER_3_DISPLAY_NAME: 'Mari Carmen',
      }),
    ).toEqual({
      SENIOR_SCIENCES: 'Martín',
      GENERAL_SCIENCES: 'Profesor 2',
      LANGUAGES: 'Mari Carmen',
    });
  });
});
