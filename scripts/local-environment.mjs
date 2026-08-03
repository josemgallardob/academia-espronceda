import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const LOCAL_ENVIRONMENT_FILE = resolve('.env.local');

export function loadLocalEnvironment() {
  if (!existsSync(LOCAL_ENVIRONMENT_FILE)) {
    throw new Error('Missing .env.local. Create it with: cp .env.development.example .env.local');
  }

  const configured = parseEnvironmentFile(readFileSync(LOCAL_ENVIRONMENT_FILE, 'utf8'));
  const environment = { ...configured, ...process.env };
  validateLocalEnvironment(environment);
  return environment;
}

export function prepareLocalDatabase(environment) {
  const databaseUrl = environment.DATABASE_URL;
  const relativePath = databaseUrl.slice('file:'.length);
  const databasePath = resolve(relativePath);
  mkdirSync(dirname(databasePath), { recursive: true });
  return databasePath;
}

function parseEnvironmentFile(contents) {
  const values = {};

  for (const [index, rawLine] of contents.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator < 1) {
      throw new Error(`Invalid .env.local entry on line ${index + 1}`);
    }

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) {
      throw new Error(`Invalid variable name on .env.local line ${index + 1}`);
    }
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    values[name] = value;
  }

  return values;
}

function validateLocalEnvironment(environment) {
  if (environment.NODE_ENV !== 'development') {
    throw new Error('Local development requires NODE_ENV=development');
  }

  for (const name of ['WEB_PORT', 'API_PORT', 'SOLVER_PORT']) {
    readPort(environment[name], name);
  }

  const ports = [environment.WEB_PORT, environment.API_PORT, environment.SOLVER_PORT];
  if (new Set(ports).size !== ports.length) {
    throw new Error('WEB_PORT, API_PORT, and SOLVER_PORT must be different');
  }

  if (!environment.DATABASE_URL?.startsWith('file:./')) {
    throw new Error('Local DATABASE_URL must use a repository-relative file:./ URL');
  }

  const solverUrl = readHttpUrl(environment.SOLVER_URL, 'SOLVER_URL');
  if (solverUrl.port !== environment.SOLVER_PORT) {
    throw new Error('SOLVER_URL port must match SOLVER_PORT');
  }

  const origins = environment.API_CORS_ORIGINS?.split(',').map((value) => value.trim());
  if (!origins?.length || origins.includes('*')) {
    throw new Error('API_CORS_ORIGINS must list explicit local web origins');
  }

  for (const name of ['JWT_SECRET', 'INTERNAL_SERVICE_TOKEN']) {
    if (!environment[name]?.trim()) {
      throw new Error(`${name} must have a local-only development value`);
    }
  }
}

function readPort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

function readHttpUrl(value, name) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error();
    }
    return url;
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
}
