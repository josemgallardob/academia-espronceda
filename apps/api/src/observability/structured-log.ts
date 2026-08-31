import type { LoggerService } from '@nestjs/common';
import { redactText, redactValue } from './redact';
import { currentRequestId } from './request-context';

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogRecord {
  timestamp: string;
  service: 'api';
  level: StructuredLogLevel;
  event: string;
  message?: string;
  requestId?: string;
  [field: string]: unknown;
}

export type StructuredLogWriter = (line: string) => void;

let writeLine: StructuredLogWriter = (line) => {
  process.stdout.write(`${line}\n`);
};

export function setStructuredLogWriter(writer?: StructuredLogWriter): void {
  writeLine = writer ?? ((line) => process.stdout.write(`${line}\n`));
}

export function writeStructuredLog(
  record: Omit<StructuredLogRecord, 'timestamp' | 'service'> & {
    timestamp?: string;
    service?: 'api';
  },
): void {
  const payload = redactValue({
    timestamp: record.timestamp ?? new Date().toISOString(),
    service: 'api',
    requestId: record.requestId ?? currentRequestId(),
    ...record,
  }) as StructuredLogRecord;
  writeLine(JSON.stringify(payload));
}

export class StructuredNestLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  private write(
    level: StructuredLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const context =
      typeof optionalParams[optionalParams.length - 1] === 'string'
        ? (optionalParams[optionalParams.length - 1] as string)
        : undefined;
    writeStructuredLog({
      level,
      event: 'nestjs.log',
      message: redactText(stringifyLogMessage(message)),
      ...(context === undefined ? {} : { context }),
    });
  }
}

function stringifyLogMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  return JSON.stringify(message);
}
