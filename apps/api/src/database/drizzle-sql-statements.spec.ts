import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DRIZZLE_FOLDER = join(__dirname, '../../drizzle');
const NEXT_STATEMENT =
  /;\s*(CREATE|INSERT|ALTER|UPDATE|DELETE|DROP|REPLACE)\b/i;

describe('Drizzle SQL files', () => {
  it('splits every statement so Turso migrate can send one SQL string each', () => {
    const files = readdirSync(DRIZZLE_FOLDER).filter((name) =>
      name.endsWith('.sql'),
    );
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const statements = readFileSync(join(DRIZZLE_FOLDER, file), 'utf8').split(
        '--> statement-breakpoint',
      );
      for (const statement of statements) {
        expect(statement).not.toMatch(NEXT_STATEMENT);
        expect(statement.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
