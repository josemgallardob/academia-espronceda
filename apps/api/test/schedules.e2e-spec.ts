import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { loadApiEnvironment } from '../src/config/environment';
import { configureApiApplication } from '../src/configure-api-application';
import { DatabaseConnection } from '../src/database/database.connection';
import { TeachersRepository } from '../src/database/repositories/teachers.repository';
import { UsersRepository } from '../src/database/repositories/users.repository';
import { WeeklySlotsRepository } from '../src/database/repositories/weekly-slots.repository';
import { hashPassword } from '../src/security/password-hasher';
import {
  SCHEDULE_SOLVER,
  type ScheduleSolver,
  type SolveScheduleRequest,
  type SolveScheduleResponse,
} from '../src/scheduling/solver-contract';

const FRONTEND_ORIGIN = 'http://frontend.test';
const AUTH_COOKIE = 'academia_session';
const XSRF_COOKIE = 'XSRF-TOKEN';
const PASSWORD = 'correct horse battery staple';

interface ScheduleBody {
  id: string;
  state: string;
  revision: number;
  evaluation: {
    validationFingerprint: string;
    outcome: string;
    canConfirm: boolean;
    findings: Array<{
      fingerprint: string;
      ruleId: string;
      enforcement: string;
    }>;
  } | null;
  classes: Array<{
    id: string;
    teacherId: string;
    slotId: string;
    assignments: Array<{
      id: string;
      studentId: string;
      studentDisplayName: string;
    }>;
    findingFingerprints: string[];
  }>;
  acceptedFindingFingerprints: string[];
}

describe('Schedule commands (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let temporaryDirectory: string;
  let originalEnvironment: NodeJS.ProcessEnv;
  let cookieHeader: string;
  let xsrfToken: string;
  let studentId: string;

  beforeAll(async () => {
    originalEnvironment = { ...process.env };
    temporaryDirectory = await mkdtemp(
      resolve(tmpdir(), 'academia-api-schedules-'),
    );
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = `file:${resolve(temporaryDirectory, 'schedules.db')}`;
    process.env.JWT_SECRET = 'integration-test-jwt-secret-never-production';
    process.env.JWT_ISSUER = 'academia-espronceda-api';
    process.env.JWT_AUDIENCE = 'academia-espronceda-web';
    process.env.AUTH_COOKIE_NAME = AUTH_COOKIE;
    process.env.XSRF_COOKIE_NAME = XSRF_COOKIE;
    process.env.COOKIE_SECURE = 'false';
    process.env.API_CORS_ORIGINS = FRONTEND_ORIGIN;
    process.env.AUTH_LOGIN_IP_LIMIT = '20';
    process.env.AUTH_LOGIN_IDENTIFIER_LIMIT = '10';

    const fakeSolver = new FakeScheduleSolver();
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SCHEDULE_SOLVER)
      .useValue(fakeSolver)
      .compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApiApplication(
      app as NestExpressApplication,
      loadApiEnvironment(),
    );
    const connection = moduleFixture.get(DatabaseConnection);
    await connection.migrate(resolve(__dirname, '../drizzle'));

    const now = new Date().toISOString();
    await moduleFixture.get(UsersRepository).insert({
      id: randomUUID(),
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: await hashPassword(PASSWORD),
      createdAt: now,
      updatedAt: now,
    });
    const teachers = moduleFixture.get(TeachersRepository);
    await teachers.insert({
      id: 'teacher-1',
      displayName: 'Profesor Uno',
      profile: 'GENERAL_SCIENCES',
      isActive: true,
    });
    const slots = await moduleFixture.get(WeeklySlotsRepository).listActive();
    await teachers.replaceCapabilities('teacher-1', {
      subjectCodes: ['MATHEMATICS', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY'],
      courseCodes: ['ESO_1', 'ESO_2', 'ESO_3', 'ESO_4', 'BACH_1'],
      availableSlotIds: slots.map((slot) => slot.id),
    });
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ identifier: 'admin', password: PASSWORD })
      .expect(200);
    const cookies = responseCookies(login);
    cookieHeader = cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
    xsrfToken = cookieValue(cookies, XSRF_COOKIE);

    const person = await mutate('post', '/api/v1/people')
      .send({
        firstName: 'Ana',
        firstSurname: 'Pérez',
        courseCode: 'BACH_1',
        subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
        weeklyHoursTotal: 1,
        primaryPhone: '600000001',
        isTutored: false,
        status: 'ACTIVE',
      })
      .expect(201);
    studentId = (person.body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnvironment;
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('requires authentication for schedule commands', async () => {
    await request(app.getHttpServer()).get('/api/v1/schedules').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/schedules/drafts')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/schedules/generate')
      .expect(401);
  });

  it('returns 404 when there is no current confirmed schedule', async () => {
    await authenticatedGet('/api/v1/schedules/current')
      .expect(404)
      .expect((response) => {
        expect(responseBody(response).code).toBe('SCHEDULE_NOT_FOUND');
      });
  });

  it('creates a draft, assigns, validates globally and confirms with accepted incidences', async () => {
    const created = await mutate('post', '/api/v1/schedules/drafts').expect(
      201,
    );
    const draft = created.body as ScheduleBody;
    expect(draft).toMatchObject({
      state: 'DRAFT',
      revision: 0,
      evaluation: { outcome: 'IDEAL', canConfirm: true },
    });

    const listed = await authenticatedGet(
      '/api/v1/schedules?state=DRAFT',
    ).expect(200);
    expect(listed.body).toMatchObject({
      total: 1,
      items: [{ id: draft.id, state: 'DRAFT' }],
    });

    const assigned = await mutate(
      'post',
      `/api/v1/schedules/${draft.id}/assignments`,
    )
      .send({
        expectedRevision: draft.revision,
        studentId,
        teacherId: 'teacher-1',
        slotId: 'slot-monday-1600',
      })
      .expect(200);
    const assignedSchedule = (assigned.body as { schedule: ScheduleBody })
      .schedule;
    expect(assignedSchedule.classes[0].assignments[0].studentDisplayName).toBe(
      'Ana Pérez',
    );
    expect(assignedSchedule.evaluation?.outcome).toBe(
      'HAS_RELAXABLE_CONFLICTS',
    );
    expect(assignedSchedule.evaluation?.canConfirm).toBe(true);
    expect(
      assignedSchedule.classes[0].findingFingerprints.length,
    ).toBeGreaterThan(0);

    await mutate('post', `/api/v1/schedules/${draft.id}/assignments`)
      .send({
        expectedRevision: assignedSchedule.revision,
        studentId,
        teacherId: 'teacher-1',
        slotId: 'slot-monday-1700',
      })
      .expect(400)
      .expect((response) => {
        expect(responseBody(response).code).toBe(
          'SCHEDULE_INTEGRITY_VIOLATION',
        );
      });

    const validated = await mutate(
      'post',
      `/api/v1/schedules/${draft.id}/validate`,
    )
      .send({ expectedRevision: assignedSchedule.revision })
      .expect(200);
    const evaluation = validated.body as NonNullable<
      ScheduleBody['evaluation']
    >;
    expect(evaluation.outcome).toBe('HAS_RELAXABLE_CONFLICTS');
    expect(evaluation.canConfirm).toBe(true);
    expect(
      evaluation.findings.some(
        (item) => item.ruleId === 'CLASS_CAPACITY_MINIMUM',
      ),
    ).toBe(true);

    await mutate('post', `/api/v1/schedules/${draft.id}/confirm`)
      .send({
        expectedRevision: assignedSchedule.revision,
        validationFingerprint: evaluation.validationFingerprint,
        acceptRelaxableConflicts: false,
      })
      .expect(409)
      .expect((response) => {
        expect(responseBody(response).code).toBe(
          'SCHEDULE_CONFIRMATION_REJECTED',
        );
      });

    const confirmed = await mutate(
      'post',
      `/api/v1/schedules/${draft.id}/confirm`,
    )
      .send({
        expectedRevision: assignedSchedule.revision,
        validationFingerprint: evaluation.validationFingerprint,
        acceptRelaxableConflicts: true,
      })
      .expect(200);
    const confirmedSchedule = confirmed.body as ScheduleBody;
    expect(confirmedSchedule).toMatchObject({
      id: draft.id,
      state: 'CONFIRMED',
      isCurrent: true,
    });
    expect(
      confirmedSchedule.acceptedFindingFingerprints.length,
    ).toBeGreaterThan(0);
    expect(confirmedSchedule.evaluation?.findings.length).toBeGreaterThan(0);

    const current = await authenticatedGet('/api/v1/schedules/current').expect(
      200,
    );
    expect((current.body as ScheduleBody).id).toBe(draft.id);

    const reloaded = await authenticatedGet(
      `/api/v1/schedules/${draft.id}`,
    ).expect(200);
    expect((reloaded.body as ScheduleBody).acceptedFindingFingerprints).toEqual(
      confirmedSchedule.acceptedFindingFingerprints,
    );

    const revision = await mutate(
      'post',
      `/api/v1/schedules/${draft.id}/revisions`,
    ).expect(201);
    const revisionSchedule = revision.body as ScheduleBody;
    expect(revisionSchedule).toMatchObject({
      state: 'DRAFT',
      sourceScheduleId: draft.id,
    });

    const assignmentId = revisionSchedule.classes[0].assignments[0].id;
    const removed = await request(app.getHttpServer())
      .delete(
        `/api/v1/schedules/${revisionSchedule.id}/assignments/${assignmentId}?expectedRevision=${revisionSchedule.revision}`,
      )
      .set('Origin', FRONTEND_ORIGIN)
      .set('Cookie', cookieHeader)
      .set('X-XSRF-TOKEN', xsrfToken)
      .expect(200);
    expect(
      (removed.body as { schedule: ScheduleBody }).schedule.classes,
    ).toHaveLength(0);
  });

  it('returns 409 when the solver cannot produce a schedule', async () => {
    const fakeSolver = moduleFixture.get<FakeScheduleSolver>(SCHEDULE_SOLVER);
    fakeSolver.behavior = 'infeasible';

    await mutate('post', '/api/v1/schedules/generate')
      .expect(409)
      .expect((response) => {
        expect(responseBody(response).code).toBe('GENERATION_INFEASIBLE');
      });
  });

  it('generates an independently validated draft', async () => {
    const fakeSolver = moduleFixture.get<FakeScheduleSolver>(SCHEDULE_SOLVER);
    fakeSolver.behavior = 'success';
    for (const firstName of ['Luis', 'Marta', 'Pablo']) {
      await mutate('post', '/api/v1/people')
        .send({
          firstName,
          firstSurname: 'García',
          courseCode: 'BACH_1',
          subjectHours: [{ subjectCode: 'MATHEMATICS', weeklyHours: 1 }],
          weeklyHoursTotal: 1,
          primaryPhone: `60000001${firstName === 'Luis' ? '2' : firstName === 'Marta' ? '3' : '4'}`,
          isTutored: false,
          status: 'ACTIVE',
        })
        .expect(201);
    }

    const generated = await mutate('post', '/api/v1/schedules/generate').expect(
      201,
    );
    const body = generated.body as ScheduleBody;
    expect(body).toMatchObject({
      state: 'DRAFT',
      evaluation: { outcome: 'IDEAL', canConfirm: true },
    });
    expect(body.classes[0].assignments).toHaveLength(4);
  });

  function authenticatedGet(path: string) {
    return request(app.getHttpServer()).get(path).set('Cookie', cookieHeader);
  }

  function mutate(method: 'post' | 'patch' | 'delete' | 'put', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Origin', FRONTEND_ORIGIN)
      .set('Cookie', cookieHeader)
      .set('X-XSRF-TOKEN', xsrfToken);
  }
});

function responseCookies(response: request.Response): string[] {
  const cookies = response.headers['set-cookie'];
  if (Array.isArray(cookies)) {
    return cookies;
  }
  return typeof cookies === 'string' ? [cookies] : [];
}

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((candidate) => candidate.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`Expected response cookie ${name}`);
  }
  const pair = cookie.split(';', 1)[0];
  return decodeURIComponent(pair.slice(name.length + 1));
}

function responseBody(response: request.Response): Record<string, unknown> {
  return response.body as Record<string, unknown>;
}

class FakeScheduleSolver implements ScheduleSolver {
  behavior: 'success' | 'infeasible' = 'success';

  solve(request: SolveScheduleRequest): Promise<SolveScheduleResponse> {
    if (this.behavior === 'infeasible') {
      return Promise.resolve({
        contractVersion: request.contractVersion,
        ruleCatalogVersion: request.ruleCatalogVersion,
        requestId: request.requestId,
        mode: 'RELAXED',
        status: 'INFEASIBLE',
        attempts: [
          { mode: 'STRICT', status: 'INFEASIBLE', elapsedMilliseconds: 1 },
          { mode: 'RELAXED', status: 'INFEASIBLE', elapsedMilliseconds: 1 },
        ],
        solution: null,
        elapsedMilliseconds: 2,
        randomSeed: request.options.randomSeed,
        timeLimitSeconds: request.options.timeLimitSeconds,
      });
    }

    const teacherId = request.teachers[0]?.id;
    const slotId = request.slots[0]?.id;
    if (!teacherId || !slotId) {
      throw new Error('Fake solver expected at least one teacher and slot');
    }
    return Promise.resolve({
      contractVersion: request.contractVersion,
      ruleCatalogVersion: request.ruleCatalogVersion,
      requestId: request.requestId,
      mode: 'STRICT',
      status: 'OPTIMAL',
      attempts: [{ mode: 'STRICT', status: 'OPTIMAL', elapsedMilliseconds: 1 }],
      solution: {
        classes:
          request.students.length === 0
            ? []
            : [
                {
                  id: 'class-generated',
                  teacherId,
                  slotId,
                  studentIds: request.students.map((student) => student.id),
                },
              ],
        subjectTeacherAllocations: [],
        score: {
          direction: 'MINIMIZE',
          bestScore: 0,
          tiers: [1, 2, 3, 4, 5, 6].map((priority) => ({
            priority,
            penalty: 0,
          })),
          ruleBreakdown: [],
        },
        findings: [],
      },
      elapsedMilliseconds: 1,
      randomSeed: request.options.randomSeed,
      timeLimitSeconds: request.options.timeLimitSeconds,
    });
  }
}
