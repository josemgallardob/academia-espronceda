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
import {
  schedules,
  scheduleTeachers,
  subjectTeacherAllocations,
} from '../src/database/schema';
import { hashPassword } from '../src/security/password-hasher';

const FRONTEND_ORIGIN = 'http://frontend.test';
const AUTH_COOKIE = 'academia_session';
const XSRF_COOKIE = 'XSRF-TOKEN';
const PASSWORD = 'correct horse battery staple';

interface PersonIdentifier {
  id: string;
}

interface PersonBody extends PersonIdentifier {
  response: Record<string, unknown>;
}

interface SchedulingConfigurationBody {
  slots: Array<{
    id: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  }>;
}

describe('People and teacher options (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let connection: DatabaseConnection;
  let temporaryDirectory: string;
  let originalEnvironment: NodeJS.ProcessEnv;
  let cookieHeader: string;
  let xsrfToken: string;

  beforeAll(async () => {
    originalEnvironment = { ...process.env };
    temporaryDirectory = await mkdtemp(
      resolve(tmpdir(), 'academia-api-people-'),
    );
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = `file:${resolve(temporaryDirectory, 'people.db')}`;
    process.env.JWT_SECRET = 'integration-test-jwt-secret-never-production';
    process.env.JWT_ISSUER = 'academia-espronceda-api';
    process.env.JWT_AUDIENCE = 'academia-espronceda-web';
    process.env.AUTH_COOKIE_NAME = AUTH_COOKIE;
    process.env.XSRF_COOKIE_NAME = XSRF_COOKIE;
    process.env.COOKIE_SECURE = 'false';
    process.env.API_CORS_ORIGINS = FRONTEND_ORIGIN;
    process.env.AUTH_LOGIN_IP_LIMIT = '20';
    process.env.AUTH_LOGIN_IDENTIFIER_LIMIT = '10';

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApiApplication(
      app as NestExpressApplication,
      loadApiEnvironment(),
    );
    connection = moduleFixture.get(DatabaseConnection);
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
      id: 'teacher-active',
      displayName: 'Profesor Activo',
      profile: 'GENERAL_SCIENCES',
      isActive: true,
    });
    await teachers.insert({
      id: 'teacher-inactive',
      displayName: 'Profesor Inactivo',
      profile: 'LANGUAGES',
      isActive: false,
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
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnvironment;
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('requires authentication for people and teacher data', async () => {
    await request(app.getHttpServer()).get('/api/v1/people').expect(401);
    await request(app.getHttpServer()).get('/api/v1/teachers').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/scheduling/configuration')
      .expect(401);
  });

  it('exposes the stable scheduling catalogue used by person forms', async () => {
    const response = await authenticatedGet(
      '/api/v1/scheduling/configuration',
    ).expect(200);
    const body = response.body as unknown as SchedulingConfigurationBody;

    expect(response.body).toMatchObject({
      timezone: 'Europe/Madrid',
      courseLabels: {
        ESO_1: '1.º ESO',
        BACH_2: '2.º Bachillerato',
      },
      subjectLabels: {
        MATHEMATICS: 'Matemáticas',
        ENGLISH: 'Inglés',
      },
    });
    expect(body.slots).toHaveLength(23);
    expect(body.slots[0]).toEqual({
      id: 'slot-monday-1600',
      dayOfWeek: 'MONDAY',
      startTime: '16:00',
      endTime: '17:00',
    });
    expect(body.slots.map((slot) => slot.id)).toEqual(
      expect.arrayContaining([
        'slot-monday-2000',
        'slot-tuesday-2000',
        'slot-wednesday-2000',
        'slot-thursday-2000',
      ]),
    );
    expect(
      body.slots.some(
        (slot) => slot.dayOfWeek === 'FRIDAY' && slot.startTime === '20:00',
      ),
    ).toBe(false);
    expect(body.slots.at(-1)).toEqual({
      id: 'slot-friday-1800',
      dayOfWeek: 'FRIDAY',
      startTime: '18:00',
      endTime: '19:00',
    });
  });

  it('exposes only active minimal teacher selector options', async () => {
    const response = await authenticatedGet('/api/v1/teachers').expect(200);
    expect(response.body).toEqual([
      {
        id: 'teacher-active',
        displayName: 'Profesor Activo',
        availableSlotIds: [],
      },
    ]);
  });

  it('creates, reads, edits and activates complete people without duplicates', async () => {
    const related = await createPerson({
      firstName: 'Luis',
      status: 'ACTIVE',
      unavailableSlotIds: [],
    });
    const created = await createPerson({
      firstName: 'Ana',
      status: 'WAITING_LIST',
      unavailableSlotIds: ['slot-monday-1600'],
      relatedPersonIds: [related.id],
    });

    expect(created.response).toMatchObject({
      firstName: 'Ana',
      status: 'WAITING_LIST',
      weeklyHoursTotal: 3,
      subjectHours: [
        { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
        { subjectCode: 'PHYSICS', weeklyHours: 1 },
      ],
      unavailableSlotIds: ['slot-monday-1600'],
      relatedPersonIds: [related.id],
    });

    const waiting = await authenticatedGet(
      '/api/v1/people?status=WAITING_LIST',
    ).expect(200);
    expect(waiting.body).toMatchObject({
      total: 1,
      items: [{ id: created.id }],
    });

    await mutate('patch', `/api/v1/people/${created.id}`)
      .send({ weeklyHoursTotal: 4 })
      .expect(400)
      .expect((response) => {
        expect(responseBody(response).code).toBe('INVALID_PERSON');
      });
    const updated = await mutate('patch', `/api/v1/people/${created.id}`)
      .send({
        subjectHours: [
          { subjectCode: 'MATHEMATICS', weeklyHours: 3 },
          { subjectCode: 'PHYSICS', weeklyHours: 1 },
        ],
        weeklyHoursTotal: 4,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: created.id,
      weeklyHoursTotal: 4,
      status: 'WAITING_LIST',
    });

    const activated = await mutate('post', '/api/v1/people/activate')
      .send({ personIds: [created.id] })
      .expect(200);
    expect(activated.body).toMatchObject({
      total: 1,
      items: [{ id: created.id, status: 'ACTIVE' }],
    });
    await mutate('post', '/api/v1/people/activate')
      .send({ personIds: [created.id] })
      .expect(409)
      .expect((response) => {
        expect(responseBody(response).code).toBe('PEOPLE_ACTIVATION_CONFLICT');
      });

    const all = await authenticatedGet('/api/v1/people').expect(200);
    const allBody = all.body as unknown as {
      total: number;
      items: PersonIdentifier[];
    };
    expect(allBody.total).toBe(2);
    expect(
      allBody.items.filter((person) => person.id === created.id),
    ).toHaveLength(1);
  });

  it('rejects invalid references, incoherent tutoring and unknown properties', async () => {
    await mutate('post', '/api/v1/people')
      .send(personPayload({ unavailableSlotIds: ['missing-slot'] }))
      .expect(400);
    await mutate('post', '/api/v1/people')
      .send(personPayload({ isTutored: true, tutorFullName: null }))
      .expect(400);
    await mutate('post', '/api/v1/people')
      .send(personPayload({ unexpected: true }))
      .expect(400);
    await mutate('post', '/api/v1/people')
      .send(
        personPayload({
          weeklyHoursTotal: 4,
          subjectHours: [
            { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
            { subjectCode: 'PHYSICS', weeklyHours: 1 },
          ],
        }),
      )
      .expect(400);
  });

  it('deletes unreferenced people but preserves anyone used by a schedule', async () => {
    const deletable = await createPerson({ firstName: 'Elena' });
    await mutate('delete', `/api/v1/people/${deletable.id}`).expect(204);
    await authenticatedGet(`/api/v1/people/${deletable.id}`).expect(404);

    const referenced = await createPerson({ firstName: 'Mario' });
    await connection.db.insert(schedules).values({
      id: 'schedule-referencing-person',
      ruleCatalogVersion: '1.0.0',
    });
    await connection.db.insert(scheduleTeachers).values({
      scheduleId: 'schedule-referencing-person',
      teacherId: 'teacher-active',
      displayName: 'Profesor Activo',
      profile: 'GENERAL_SCIENCES',
    });
    await connection.db.insert(subjectTeacherAllocations).values({
      scheduleId: 'schedule-referencing-person',
      personId: referenced.id,
      subjectCode: 'MATHEMATICS',
      teacherId: 'teacher-active',
      weeklyHours: 2,
    });

    await mutate('delete', `/api/v1/people/${referenced.id}`)
      .expect(409)
      .expect((response) => {
        expect(responseBody(response).code).toBe(
          'PERSON_REFERENCED_BY_SCHEDULE',
        );
      });
    await authenticatedGet(`/api/v1/people/${referenced.id}`).expect(200);
  });

  function authenticatedGet(path: string) {
    return request(app.getHttpServer()).get(path).set('Cookie', cookieHeader);
  }

  function mutate(method: 'post' | 'patch' | 'delete', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Origin', FRONTEND_ORIGIN)
      .set('Cookie', cookieHeader)
      .set('X-XSRF-TOKEN', xsrfToken);
  }

  async function createPerson(
    overrides: Record<string, unknown> = {},
  ): Promise<PersonBody> {
    const response = await mutate('post', '/api/v1/people')
      .send(personPayload(overrides))
      .expect(201);
    const body = responseBody(response);
    if (typeof body.id !== 'string') {
      throw new Error('Expected a person response with an identifier');
    }
    return { id: body.id, response: body };
  }
});

function personPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Ana',
    firstSurname: 'Ruiz',
    courseCode: 'BACH_1',
    subjectHours: [
      { subjectCode: 'MATHEMATICS', weeklyHours: 2 },
      { subjectCode: 'PHYSICS', weeklyHours: 1 },
    ],
    weeklyHoursTotal: 3,
    primaryPhone: '600000000',
    isTutored: false,
    status: 'ACTIVE',
    ...overrides,
  };
}

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
