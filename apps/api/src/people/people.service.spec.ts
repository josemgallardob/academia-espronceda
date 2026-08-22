import { ProblemDetailsException } from '../http/problem-details.exception';
import { validateHours } from './people.service';

describe('People domain rules', () => {
  it('accepts only an exact distribution of the contracted weekly hours', () => {
    expect(() =>
      validateHours(
        [
          { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
          { subjectCode: 'PHYSICS', weeklyHours: 1 },
        ],
        3,
      ),
    ).not.toThrow();

    expectProblem(() =>
      validateHours(
        [
          { subjectCode: 'MATHEMATICS', weeklyHours: 1 },
          { subjectCode: 'PHYSICS', weeklyHours: 1 },
        ],
        3,
      ),
    );
  });

  it('rejects duplicate subjects and non-positive or fractional hours', () => {
    expectProblem(() =>
      validateHours(
        [
          { subjectCode: 'MATHEMATICS', weeklyHours: 1 },
          { subjectCode: 'MATHEMATICS', weeklyHours: 1 },
        ],
        2,
      ),
    );
    expectProblem(() =>
      validateHours([{ subjectCode: 'PHYSICS', weeklyHours: 0 }], 1),
    );
    expectProblem(() =>
      validateHours([{ subjectCode: 'PHYSICS', weeklyHours: 1.5 }], 1.5),
    );
  });
});

function expectProblem(action: () => void): void {
  try {
    action();
    throw new Error('Expected the rule to reject the input');
  } catch (error) {
    expect(error).toBeInstanceOf(ProblemDetailsException);
    expect((error as ProblemDetailsException).problem).toMatchObject({
      status: 400,
      code: 'INVALID_PERSON',
    });
  }
}
