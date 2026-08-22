import { sql } from 'drizzle-orm';
import {
  AnySQLiteColumn,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  courseCodes,
  daysOfWeek,
  evaluationOutcomes,
  findingSeverities,
  personStatuses,
  ruleEnforcements,
  scheduleStates,
  subjectCodes,
  teacherProfiles,
} from './catalog';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

function isOneOf(column: AnySQLiteColumn, values: readonly string[]) {
  return sql`${column} in (${sql.join(
    values.map((value) => sql.raw(`'${value}'`)),
    sql`, `,
  )})`;
}

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    tokenVersion: integer('token_version').notNull().default(0),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('users_username_ci_uq').on(sql`lower(${table.username})`),
    uniqueIndex('users_email_ci_uq').on(sql`lower(${table.email})`),
    check('users_token_version_non_negative', sql`${table.tokenVersion} >= 0`),
  ],
);

export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
    firstName: text('first_name').notNull(),
    firstSurname: text('first_surname').notNull(),
    secondSurname: text('second_surname'),
    courseCode: text('course_code', { enum: courseCodes }).notNull(),
    weeklyHoursTotal: integer('weekly_hours_total').notNull(),
    schoolName: text('school_name'),
    primaryPhone: text('primary_phone').notNull(),
    secondaryPhone: text('secondary_phone'),
    isTutored: integer('is_tutored', { mode: 'boolean' })
      .notNull()
      .default(false),
    tutorFullName: text('tutor_full_name'),
    comments: text('comments'),
    status: text('status', { enum: personStatuses }).notNull(),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    index('people_status_idx').on(table.status),
    index('people_name_idx').on(table.firstSurname, table.firstName),
    check(
      'people_first_name_not_blank',
      sql`length(trim(${table.firstName})) > 0`,
    ),
    check(
      'people_first_surname_not_blank',
      sql`length(trim(${table.firstSurname})) > 0`,
    ),
    check('people_weekly_hours_positive', sql`${table.weeklyHoursTotal} > 0`),
    check(
      'people_primary_phone_not_blank',
      sql`length(trim(${table.primaryPhone})) > 0`,
    ),
    check('people_course_code_allowed', isOneOf(table.courseCode, courseCodes)),
    check('people_status_allowed', isOneOf(table.status, personStatuses)),
    check(
      'people_tutor_coherence',
      sql`(${table.isTutored} = 0) or (${table.tutorFullName} is not null and length(trim(${table.tutorFullName})) > 0)`,
    ),
  ],
);

export const personSubjects = sqliteTable(
  'person_subjects',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    subjectCode: text('subject_code', { enum: subjectCodes }).notNull(),
    weeklyHours: integer('weekly_hours').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.subjectCode] }),
    check('person_subjects_hours_positive', sql`${table.weeklyHours} > 0`),
    check(
      'person_subjects_subject_allowed',
      isOneOf(table.subjectCode, subjectCodes),
    ),
  ],
);

export const weeklySlots = sqliteTable(
  'weekly_slots',
  {
    id: text('id').primaryKey(),
    dayOfWeek: text('day_of_week', { enum: daysOfWeek }).notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('weekly_slots_period_uq').on(
      table.dayOfWeek,
      table.startTime,
      table.endTime,
    ),
    check(
      'weekly_slots_start_format',
      sql`${table.startTime} glob '[0-2][0-9]:[0-5][0-9]'`,
    ),
    check(
      'weekly_slots_end_format',
      sql`${table.endTime} glob '[0-2][0-9]:[0-5][0-9]'`,
    ),
    check('weekly_slots_ordered', sql`${table.startTime} < ${table.endTime}`),
    check('weekly_slots_day_allowed', isOneOf(table.dayOfWeek, daysOfWeek)),
  ],
);

export const personUnavailableSlots = sqliteTable(
  'person_unavailable_slots',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    slotId: text('slot_id')
      .notNull()
      .references(() => weeklySlots.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
  },
  (table) => [primaryKey({ columns: [table.personId, table.slotId] })],
);

export const personRelationships = sqliteTable(
  'person_relationships',
  {
    firstPersonId: text('first_person_id')
      .notNull()
      .references(() => people.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    secondPersonId: text('second_person_id')
      .notNull()
      .references(() => people.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
  },
  (table) => [
    primaryKey({ columns: [table.firstPersonId, table.secondPersonId] }),
    check(
      'person_relationships_canonical_order',
      sql`${table.firstPersonId} < ${table.secondPersonId}`,
    ),
  ],
);

export const teachers = sqliteTable(
  'teachers',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    profile: text('profile', { enum: teacherProfiles }).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    check(
      'teachers_display_name_not_blank',
      sql`length(trim(${table.displayName})) > 0`,
    ),
    check('teachers_profile_allowed', isOneOf(table.profile, teacherProfiles)),
  ],
);

export const teacherSubjects = sqliteTable(
  'teacher_subjects',
  {
    teacherId: text('teacher_id')
      .notNull()
      .references(() => teachers.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    subjectCode: text('subject_code', { enum: subjectCodes }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teacherId, table.subjectCode] }),
    check(
      'teacher_subjects_subject_allowed',
      isOneOf(table.subjectCode, subjectCodes),
    ),
  ],
);

export const teacherCourses = sqliteTable(
  'teacher_courses',
  {
    teacherId: text('teacher_id')
      .notNull()
      .references(() => teachers.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    courseCode: text('course_code', { enum: courseCodes }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teacherId, table.courseCode] }),
    check(
      'teacher_courses_course_allowed',
      isOneOf(table.courseCode, courseCodes),
    ),
  ],
);

export const teacherAvailableSlots = sqliteTable(
  'teacher_available_slots',
  {
    teacherId: text('teacher_id')
      .notNull()
      .references(() => teachers.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    slotId: text('slot_id')
      .notNull()
      .references(() => weeklySlots.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
  },
  (table) => [primaryKey({ columns: [table.teacherId, table.slotId] })],
);

export const schedules = sqliteTable(
  'schedules',
  {
    id: text('id').primaryKey(),
    state: text('state', { enum: scheduleStates }).notNull().default('DRAFT'),
    revision: integer('revision').notNull().default(0),
    isCurrent: integer('is_current', { mode: 'boolean' })
      .notNull()
      .default(false),
    sourceScheduleId: text('source_schedule_id').references(
      (): AnySQLiteColumn => schedules.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    ruleCatalogVersion: text('rule_catalog_version').notNull(),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('schedules_single_current_uq')
      .on(table.isCurrent)
      .where(sql`${table.isCurrent} = 1`),
    index('schedules_state_created_idx').on(table.state, table.createdAt),
    check('schedules_revision_non_negative', sql`${table.revision} >= 0`),
    check('schedules_state_allowed', isOneOf(table.state, scheduleStates)),
    check(
      'schedules_current_is_confirmed',
      sql`${table.isCurrent} = 0 or ${table.state} = 'CONFIRMED'`,
    ),
    check(
      'schedules_rule_catalog_version_format',
      sql`${table.ruleCatalogVersion} glob '[0-9]*.[0-9]*.[0-9]*'`,
    ),
  ],
);

export const scheduleTeachers = sqliteTable(
  'schedule_teachers',
  {
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => schedules.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    teacherId: text('teacher_id')
      .notNull()
      .references(() => teachers.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    displayName: text('display_name').notNull(),
    profile: text('profile', { enum: teacherProfiles }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scheduleId, table.teacherId] }),
    check(
      'schedule_teachers_display_name_not_blank',
      sql`length(trim(${table.displayName})) > 0`,
    ),
    check(
      'schedule_teachers_profile_allowed',
      isOneOf(table.profile, teacherProfiles),
    ),
  ],
);

export const scheduleSlots = sqliteTable(
  'schedule_slots',
  {
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => schedules.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    slotId: text('slot_id')
      .notNull()
      .references(() => weeklySlots.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    dayOfWeek: text('day_of_week', { enum: daysOfWeek }).notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scheduleId, table.slotId] }),
    check('schedule_slots_ordered', sql`${table.startTime} < ${table.endTime}`),
    check('schedule_slots_day_allowed', isOneOf(table.dayOfWeek, daysOfWeek)),
  ],
);

export const scheduleClasses = sqliteTable(
  'schedule_classes',
  {
    id: text('id').primaryKey(),
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => schedules.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    teacherId: text('teacher_id').notNull(),
    slotId: text('slot_id').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('schedule_classes_teacher_slot_uq').on(
      table.scheduleId,
      table.teacherId,
      table.slotId,
    ),
    uniqueIndex('schedule_classes_schedule_slot_id_uq').on(
      table.scheduleId,
      table.slotId,
      table.id,
    ),
    index('schedule_classes_schedule_idx').on(table.scheduleId),
    foreignKey({
      columns: [table.scheduleId, table.teacherId],
      foreignColumns: [scheduleTeachers.scheduleId, scheduleTeachers.teacherId],
      name: 'schedule_classes_teacher_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.scheduleId, table.slotId],
      foreignColumns: [scheduleSlots.scheduleId, scheduleSlots.slotId],
      name: 'schedule_classes_slot_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
);

export const scheduleAssignments = sqliteTable(
  'schedule_assignments',
  {
    id: text('id').primaryKey(),
    classId: text('class_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    slotId: text('slot_id').notNull(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    studentDisplayName: text('student_display_name').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('schedule_assignments_class_person_uq').on(
      table.classId,
      table.personId,
    ),
    uniqueIndex('schedule_assignments_person_slot_uq').on(
      table.scheduleId,
      table.personId,
      table.slotId,
    ),
    index('schedule_assignments_person_idx').on(table.personId),
    foreignKey({
      columns: [table.scheduleId, table.slotId, table.classId],
      foreignColumns: [
        scheduleClasses.scheduleId,
        scheduleClasses.slotId,
        scheduleClasses.id,
      ],
      name: 'schedule_assignments_class_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    check(
      'schedule_assignments_display_name_not_blank',
      sql`length(trim(${table.studentDisplayName})) > 0`,
    ),
  ],
);

export const subjectTeacherAllocations = sqliteTable(
  'subject_teacher_allocations',
  {
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => schedules.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    subjectCode: text('subject_code', { enum: subjectCodes }).notNull(),
    teacherId: text('teacher_id').notNull(),
    weeklyHours: integer('weekly_hours').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.scheduleId, table.personId, table.subjectCode],
    }),
    index('subject_teacher_allocations_teacher_idx').on(
      table.scheduleId,
      table.teacherId,
    ),
    foreignKey({
      columns: [table.scheduleId, table.teacherId],
      foreignColumns: [scheduleTeachers.scheduleId, scheduleTeachers.teacherId],
      name: 'subject_teacher_allocations_teacher_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'subject_teacher_allocations_hours_positive',
      sql`${table.weeklyHours} > 0`,
    ),
    check(
      'subject_teacher_allocations_subject_allowed',
      isOneOf(table.subjectCode, subjectCodes),
    ),
  ],
);

export const scheduleValidations = sqliteTable(
  'schedule_validations',
  {
    id: text('id').primaryKey(),
    validationFingerprint: text('validation_fingerprint').notNull(),
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => schedules.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    scheduleRevision: integer('schedule_revision').notNull(),
    ruleCatalogVersion: text('rule_catalog_version').notNull(),
    outcome: text('outcome', { enum: evaluationOutcomes }).notNull(),
    canConfirm: integer('can_confirm', { mode: 'boolean' }).notNull(),
    blockingErrors: integer('blocking_errors').notNull().default(0),
    relaxableErrors: integer('relaxable_errors').notNull().default(0),
    warnings: integer('warnings').notNull().default(0),
    information: integer('information').notNull().default(0),
    evaluatedAt: text('evaluated_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('schedule_validations_fingerprint_uq').on(
      table.scheduleId,
      table.scheduleRevision,
      table.validationFingerprint,
    ),
    index('schedule_validations_schedule_idx').on(
      table.scheduleId,
      table.evaluatedAt,
    ),
    uniqueIndex('schedule_validations_schedule_id_uq').on(
      table.scheduleId,
      table.id,
    ),
    check(
      'schedule_validations_revision_non_negative',
      sql`${table.scheduleRevision} >= 0`,
    ),
    check(
      'schedule_validations_counts_non_negative',
      sql`${table.blockingErrors} >= 0 and ${table.relaxableErrors} >= 0 and ${table.warnings} >= 0 and ${table.information} >= 0`,
    ),
    check(
      'schedule_validations_outcome_allowed',
      isOneOf(table.outcome, evaluationOutcomes),
    ),
    check(
      'schedule_validations_fingerprint_format',
      sql`length(${table.validationFingerprint}) = 71 and substr(${table.validationFingerprint}, 1, 7) = 'sha256:' and substr(${table.validationFingerprint}, 8) not glob '*[^0-9a-f]*'`,
    ),
  ],
);

export const scheduleValidationFindings = sqliteTable(
  'schedule_validation_findings',
  {
    validationId: text('validation_id')
      .notNull()
      .references(() => scheduleValidations.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    fingerprint: text('fingerprint').notNull(),
    ruleId: text('rule_id').notNull(),
    enforcement: text('enforcement', { enum: ruleEnforcements }).notNull(),
    severity: text('severity', { enum: findingSeverities }).notNull(),
    blocksConfirmation: integer('blocks_confirmation', {
      mode: 'boolean',
    }).notNull(),
    entityRefsJson: text('entity_refs_json').notNull().default('[]'),
    slotIdsJson: text('slot_ids_json').notNull().default('[]'),
    parametersJson: text('parameters_json').notNull().default('{}'),
    message: text('message').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.validationId, table.fingerprint] }),
    index('schedule_validation_findings_rule_idx').on(table.ruleId),
    check(
      'schedule_validation_findings_message_not_blank',
      sql`length(trim(${table.message})) > 0`,
    ),
    check(
      'schedule_validation_findings_enforcement_allowed',
      isOneOf(table.enforcement, ruleEnforcements),
    ),
    check(
      'schedule_validation_findings_severity_allowed',
      isOneOf(table.severity, findingSeverities),
    ),
    check(
      'schedule_validation_findings_fingerprint_format',
      sql`length(${table.fingerprint}) = 71 and substr(${table.fingerprint}, 1, 7) = 'sha256:' and substr(${table.fingerprint}, 8) not glob '*[^0-9a-f]*'`,
    ),
    check(
      'schedule_validation_findings_entity_refs_json',
      sql`json_valid(${table.entityRefsJson})`,
    ),
    check(
      'schedule_validation_findings_slot_ids_json',
      sql`json_valid(${table.slotIdsJson})`,
    ),
    check(
      'schedule_validation_findings_parameters_json',
      sql`json_valid(${table.parametersJson})`,
    ),
  ],
);

export const scheduleConfirmations = sqliteTable(
  'schedule_confirmations',
  {
    scheduleId: text('schedule_id')
      .primaryKey()
      .references(() => schedules.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    validationId: text('validation_id')
      .notNull()
      .unique()
      .references(() => scheduleValidations.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    confirmedByUserId: text('confirmed_by_user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    confirmedAt: text('confirmed_at').notNull().default(now),
  },
  (table) => [
    index('schedule_confirmations_user_idx').on(table.confirmedByUserId),
    foreignKey({
      columns: [table.scheduleId, table.validationId],
      foreignColumns: [scheduleValidations.scheduleId, scheduleValidations.id],
      name: 'schedule_confirmations_schedule_validation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
);

export const scheduleAcceptedFindings = sqliteTable(
  'schedule_accepted_findings',
  {
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => schedules.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    validationId: text('validation_id').notNull(),
    findingFingerprint: text('finding_fingerprint').notNull(),
    acceptedByUserId: text('accepted_by_user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    acceptedAt: text('accepted_at').notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.scheduleId, table.findingFingerprint] }),
    foreignKey({
      columns: [table.validationId, table.findingFingerprint],
      foreignColumns: [
        scheduleValidationFindings.validationId,
        scheduleValidationFindings.fingerprint,
      ],
      name: 'schedule_accepted_findings_finding_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.scheduleId, table.validationId],
      foreignColumns: [scheduleValidations.scheduleId, scheduleValidations.id],
      name: 'schedule_accepted_findings_schedule_validation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PersonRow = typeof people.$inferSelect;
export type NewPersonRow = typeof people.$inferInsert;
export type TeacherRow = typeof teachers.$inferSelect;
export type NewTeacherRow = typeof teachers.$inferInsert;
export type ScheduleRow = typeof schedules.$inferSelect;
export type NewScheduleRow = typeof schedules.$inferInsert;
