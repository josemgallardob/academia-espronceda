const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|password|passwd|secret|token|jwt|api[_-]?key|database_auth_token|internal_service_token|access_token|refresh_token)$/i;

const BEARER_TOKEN = /Bearer\s+\S+/gi;
const JWT_SHAPE = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;

export function redactText(value: string): string {
  return value
    .replace(BEARER_TOKEN, `Bearer ${REDACTED}`)
    .replace(JWT_SHAPE, REDACTED);
}

export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redactValue(nested),
      ]),
    );
  }
  return value;
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}
