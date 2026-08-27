export type ScheduleErrorCode =
  | 'SCHEDULE_NOT_MUTABLE'
  | 'SCHEDULE_REVISION_CONFLICT'
  | 'SCHEDULE_INTEGRITY_VIOLATION'
  | 'SCHEDULE_CONFIRMATION_REJECTED'
  | 'SCHEDULE_NOT_FOUND'
  | 'SCHEDULE_ALREADY_CONFIRMED';

export class ScheduleDomainError extends Error {
  constructor(
    readonly code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScheduleDomainError';
  }
}

export class ScheduleNotMutableError extends ScheduleDomainError {
  constructor(message = 'Only a draft schedule can be modified') {
    super('SCHEDULE_NOT_MUTABLE', message);
    this.name = 'ScheduleNotMutableError';
  }
}

export class ScheduleRevisionConflictError extends ScheduleDomainError {
  constructor(
    message = 'The schedule revision does not match the expected value',
  ) {
    super('SCHEDULE_REVISION_CONFLICT', message);
    this.name = 'ScheduleRevisionConflictError';
  }
}

export class ScheduleIntegrityError extends ScheduleDomainError {
  constructor(message: string) {
    super('SCHEDULE_INTEGRITY_VIOLATION', message);
    this.name = 'ScheduleIntegrityError';
  }
}

export class ScheduleConfirmationError extends ScheduleDomainError {
  constructor(message: string) {
    super('SCHEDULE_CONFIRMATION_REJECTED', message);
    this.name = 'ScheduleConfirmationError';
  }
}

export class ScheduleNotFoundError extends ScheduleDomainError {
  constructor(scheduleId: string) {
    super('SCHEDULE_NOT_FOUND', `Schedule ${scheduleId} was not found`);
    this.name = 'ScheduleNotFoundError';
  }
}

export class ScheduleAlreadyConfirmedError extends ScheduleDomainError {
  constructor(
    message = 'A confirmed schedule cannot be used as a mutable draft',
  ) {
    super('SCHEDULE_ALREADY_CONFIRMED', message);
    this.name = 'ScheduleAlreadyConfirmedError';
  }
}
