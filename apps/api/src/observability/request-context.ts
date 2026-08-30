import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

const storage = new AsyncLocalStorage<{ requestId: string }>();

export function resolveRequestId(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (REQUEST_ID_PATTERN.test(trimmed)) {
      return trimmed;
    }
  }
  if (Array.isArray(value) && value.length > 0) {
    return resolveRequestId(value[0]);
  }
  return randomUUID();
}

export function runWithRequestId<T>(requestId: string, next: () => T): T {
  return storage.run({ requestId }, next);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function currentOrNewRequestId(): string {
  return currentRequestId() ?? randomUUID();
}
