import { loadApiEnvironment } from '../../config/environment';
import {
  assertNoAdministrativeArguments,
  toSafeAdministrativeError,
} from '../administrative-cli';
import { createAdministrativeContext } from '../administrative-context';
import {
  CATALOG_TEACHERS,
  resolveTeacherDisplayNames,
  seedTeacherCatalog,
} from '../teacher-catalog';

async function main(): Promise<void> {
  assertNoAdministrativeArguments(process.argv.slice(2));
  const context = await createAdministrativeContext();
  try {
    const environment = loadApiEnvironment();
    const teacherIds = await seedTeacherCatalog(context.connection);
    const displayNames = resolveTeacherDisplayNames();
    process.stdout.write(
      `Catálogo de profesores listo (${teacherIds.length}) en ${environment.nodeEnv}.\n`,
    );
    for (const teacher of CATALOG_TEACHERS) {
      process.stdout.write(
        `  ${teacher.id}  ·  ${displayNames[teacher.profile]}\n`,
      );
    }
    process.stdout.write(
      'Las etiquetas visibles se leen de TEACHER_1_DISPLAY_NAME, TEACHER_2_DISPLAY_NAME y TEACHER_3_DISPLAY_NAME.\n',
    );
  } finally {
    context.connection.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  const message = toSafeAdministrativeError(
    error,
    'No se pudo cargar el catálogo de profesores.',
  );
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
