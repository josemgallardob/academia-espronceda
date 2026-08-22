import { isAbsolute, resolve } from 'node:path';

const FILE_PREFIX = 'file:';
const IN_MEMORY_PATH = ':memory:';

export function resolveDatabaseUrl(url: string, baseDirectory: string): string {
  if (!url.startsWith(FILE_PREFIX)) {
    return url;
  }

  const queryStart = url.indexOf('?');
  const pathEnd = queryStart === -1 ? url.length : queryStart;
  const configuredPath = url.slice(FILE_PREFIX.length, pathEnd);
  if (!configuredPath || configuredPath === IN_MEMORY_PATH) {
    return url;
  }

  const query = queryStart === -1 ? '' : url.slice(queryStart);
  const databasePath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(baseDirectory, configuredPath);

  return `${FILE_PREFIX}${databasePath}${query}`;
}
