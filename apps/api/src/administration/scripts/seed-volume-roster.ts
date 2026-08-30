import { eq } from 'drizzle-orm';
import { PeopleRepository } from '../../database/repositories/people.repository';
import {
  scheduleAssignments,
  subjectTeacherAllocations,
} from '../../database/schema';
import { loadApiEnvironment } from '../../config/environment';
import {
  assertNoAdministrativeArguments,
  toSafeAdministrativeError,
} from '../administrative-cli';
import { createAdministrativeContext } from '../administrative-context';
import { assertLocalDemoAllowed } from '../local-demo-seed';
import {
  buildVolumeRoster,
  summarizeVolumeRoster,
} from '../local-volume-roster';

async function main(): Promise<void> {
  assertNoAdministrativeArguments(process.argv.slice(2));
  const context = await createAdministrativeContext();
  try {
    const environment = loadApiEnvironment();
    assertLocalDemoAllowed({
      nodeEnv: environment.nodeEnv,
      databaseUrl: environment.databaseUrl,
    });
    const people = new PeopleRepository(context.connection);
    const roster = buildVolumeRoster();
    let created = 0;
    let updated = 0;
    for (const entry of roster) {
      const current = await people.findById(entry.person.id);
      if (current) {
        await people.update({
          personId: entry.person.id,
          person: {
            weeklyHoursTotal: entry.person.weeklyHoursTotal,
            firstName: entry.person.firstName,
            firstSurname: entry.person.firstSurname,
            secondSurname: entry.person.secondSurname,
            courseCode: entry.person.courseCode,
            schoolName: entry.person.schoolName,
            isTutored: entry.person.isTutored,
            tutorFullName: entry.person.tutorFullName,
            comments: entry.person.comments,
            updatedAt: new Date().toISOString(),
          },
          subjects: entry.subjects,
          unavailableSlotIds: entry.unavailableSlotIds ?? [],
          relatedPersonIds: entry.relatedPersonIds ?? [],
        });
        updated += 1;
        continue;
      }
      await people.insert(entry);
      created += 1;
    }

    const keep = new Set(roster.map((entry) => entry.person.id));
    const extras = (await people.listAggregates()).filter(
      (entry) => !keep.has(entry.person.id),
    );
    for (const extra of extras) {
      await context.connection.db
        .delete(scheduleAssignments)
        .where(eq(scheduleAssignments.personId, extra.person.id));
      await context.connection.db
        .delete(subjectTeacherAllocations)
        .where(eq(subjectTeacherAllocations.personId, extra.person.id));
      await people.deleteById(extra.person.id);
    }

    const summary = summarizeVolumeRoster(roster);
    process.stdout.write(
      `Roster de volumen listo: ${created} creados, ${updated} actualizados, ${extras.length} anteriores eliminados.\n`,
    );
    process.stdout.write(
      `  Total ${summary.total}: ${summary.sciences} ciencias, ${summary.letters} letras, ${summary.mixed} mixtos.\n`,
    );
    process.stdout.write(
      `  Cursos: ESO1 ${summary.byCourse.ESO_1}, ESO2 ${summary.byCourse.ESO_2}, ESO3 ${summary.byCourse.ESO_3}, ESO4 ${summary.byCourse.ESO_4}, BACH1 ${summary.byCourse.BACH_1}, BACH2 ${summary.byCourse.BACH_2}.\n`,
    );
    process.stdout.write(
      `  Horas semanales: 1h ${summary.byHours[1]}, 2h ${summary.byHours[2]}, 3h ${summary.byHours[3]}, 4h ${summary.byHours[4]}, 5h ${summary.byHours[5]}.\n`,
    );
    process.stdout.write(
      'Recarga Horario y pulsa Generar horario para probar el volumen real.\n',
    );
  } finally {
    context.connection.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  const message = toSafeAdministrativeError(
    error,
    'No se pudo cargar el roster de volumen.',
  );
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
