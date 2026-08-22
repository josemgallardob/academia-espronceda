import { HttpException } from '@nestjs/common';

export interface FieldViolation {
  field: string;
  code: string;
  message: string;
}

export interface ProblemDetailsInput {
  status: number;
  code: string;
  title: string;
  detail?: string;
  fieldErrors?: FieldViolation[];
}

export class ProblemDetailsException extends HttpException {
  constructor(readonly problem: ProblemDetailsInput) {
    super(problem, problem.status);
  }
}
