import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractsRoot = path.join(repositoryRoot, 'contracts');

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function contractPath(relativePath) {
  return path.resolve(contractsRoot, relativePath);
}

function jsonPointer(document, fragment) {
  if (!fragment) {
    return document;
  }

  return fragment
    .split('/')
    .slice(1)
    .reduce((value, token) => value?.[token.replaceAll('~1', '/').replaceAll('~0', '~')], document);
}

function verifyReferences(rootFiles) {
  const documents = new Map();
  const walkedDocuments = new Set();

  function load(absolutePath) {
    const normalizedPath = path.normalize(absolutePath);
    if (!documents.has(normalizedPath)) {
      assert(
        fs.existsSync(normalizedPath),
        `Referenced document does not exist: ${normalizedPath}`,
      );
      documents.set(normalizedPath, readJson(normalizedPath));
    }
    return documents.get(normalizedPath);
  }

  function walk(value, sourcePath) {
    if (value === null || typeof value !== 'object') {
      return;
    }

    if (typeof value.$ref === 'string') {
      const [relativeTarget, fragment = ''] = value.$ref.split('#');
      const targetPath = relativeTarget
        ? path.resolve(path.dirname(sourcePath), relativeTarget)
        : sourcePath;
      const targetDocument = load(targetPath);
      assert(
        jsonPointer(targetDocument, fragment) !== undefined,
        `Unresolved reference ${value.$ref} in ${path.relative(repositoryRoot, sourcePath)}`,
      );
    }

    for (const nestedValue of Object.values(value)) {
      walk(nestedValue, sourcePath);
    }
  }

  for (const rootFile of rootFiles) {
    const absolutePath = contractPath(rootFile);
    if (walkedDocuments.has(absolutePath)) {
      continue;
    }
    walkedDocuments.add(absolutePath);
    walk(load(absolutePath), absolutePath);
  }

  return documents;
}

function validateManifest(manifest) {
  const entries = [
    manifest.applicationApi,
    manifest.solverApi,
    manifest.sharedComponents,
    manifest.ruleCatalog,
  ];

  for (const entry of entries) {
    assert(
      fs.existsSync(contractPath(entry.path)),
      `Manifest target does not exist: ${entry.path}`,
    );
  }

  assert(
    fs.existsSync(contractPath(manifest.ruleCatalog.schemaPath)),
    `Rule catalog schema does not exist: ${manifest.ruleCatalog.schemaPath}`,
  );
  assert(
    fs.existsSync(contractPath(manifest.fixtures.manifestPath)),
    `Fixture manifest does not exist: ${manifest.fixtures.manifestPath}`,
  );

  const appApi = readJson(contractPath(manifest.applicationApi.path));
  const solverApi = readJson(contractPath(manifest.solverApi.path));
  const catalog = readJson(contractPath(manifest.ruleCatalog.path));

  assert(appApi.openapi === '3.1.0', 'Application API must use OpenAPI 3.1.0');
  assert(solverApi.openapi === '3.1.0', 'Solver API must use OpenAPI 3.1.0');
  assert(
    appApi.info.version === manifest.applicationApi.artifactVersion,
    'Application API version does not match the contract manifest',
  );
  assert(
    solverApi.info.version === manifest.solverApi.artifactVersion,
    'Solver API version does not match the contract manifest',
  );
  assert(
    catalog.catalogVersion === manifest.ruleCatalog.catalogVersion,
    'Rule catalog version does not match the contract manifest',
  );
}

function validateOpenApi(document, kind) {
  const operationIds = [];

  for (const [route, pathItem] of Object.entries(document.paths)) {
    if (kind === 'application') {
      assert(route.startsWith('/api/v1/'), `Public route is not versioned: ${route}`);
    } else {
      assert(
        route === '/health' || route.startsWith('/v1/'),
        `Solver route is not versioned: ${route}`,
      );
    }

    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }
      assert(operation.operationId, `${method.toUpperCase()} ${route} has no operationId`);
      operationIds.push(operation.operationId);
    }
  }

  assert(
    new Set(operationIds).size === operationIds.length,
    `${kind} API contains duplicate operationIds`,
  );
}

function validateRuleCatalog(catalogSchema, catalog) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(catalogSchema);
  assert(validate(catalog), `Rule catalog schema errors:\n${ajv.errorsText(validate.errors)}`);

  const ids = catalog.rules.map((rule) => rule.id);
  assert(new Set(ids).size === ids.length, 'Rule catalog contains duplicate identifiers');

  const expectedCounts = { HARD: 12, RELAXABLE: 2, PREFERENCE: 5 };
  for (const [enforcement, count] of Object.entries(expectedCounts)) {
    assert(
      catalog.rules.filter((rule) => rule.enforcement === enforcement).length === count,
      `Expected ${count} ${enforcement} rules`,
    );
  }

  const scoredIds = [];
  const priorities = new Set();
  for (const tier of catalog.scoring.priorityOrder) {
    assert(!priorities.has(tier.priority), `Duplicate score priority ${tier.priority}`);
    priorities.add(tier.priority);
    for (const ruleId of tier.ruleIds) {
      assert(ids.includes(ruleId), `Score priority references unknown rule ${ruleId}`);
      scoredIds.push(ruleId);
    }
  }
  assert(new Set(scoredIds).size === scoredIds.length, 'A rule appears in multiple score tiers');

  for (const rule of catalog.rules) {
    if (rule.enforcement === 'HARD') {
      assert(rule.classification === 'RULE', `${rule.id} must be classified as a rule`);
      assert(rule.severity === 'ERROR', `${rule.id} must use ERROR severity`);
      assert(rule.priority === null, `${rule.id} must not have an optimization priority`);
      assert(rule.optimization === null, `${rule.id} must not have an optimization metric`);
      assert(!scoredIds.includes(rule.id), `${rule.id} must not appear in score tiers`);
    } else {
      assert(rule.priority !== null, `${rule.id} must have an optimization priority`);
      assert(rule.optimization !== null, `${rule.id} must have an optimization metric`);
      assert(scoredIds.includes(rule.id), `${rule.id} is missing from score tiers`);
      assert(
        catalog.scoring.priorityOrder.some(
          (tier) => tier.priority === rule.priority && tier.ruleIds.includes(rule.id),
        ),
        `${rule.id} priority does not match priorityOrder`,
      );
    }

    if (rule.enforcement === 'PREFERENCE') {
      assert(rule.classification === 'PREFERENCE', `${rule.id} must be a preference`);
      assert(rule.severity === 'WARNING', `${rule.id} must use WARNING severity`);
    }
  }
}

function minutes(localTime) {
  const [hours, minute] = localTime.split(':').map(Number);
  return hours * 60 + minute;
}

function uniqueBy(items, key, errors, label) {
  const seen = new Set();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) {
      errors.push(`Duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}

function validateSubjectHours(subjectHours, weeklyHoursTotal, pathLabel, errors) {
  uniqueBy(subjectHours, (entry) => entry.subjectCode, errors, `${pathLabel} subject`);
  const sum = subjectHours.reduce((total, entry) => total + entry.weeklyHours, 0);
  if (sum !== weeklyHoursTotal) {
    errors.push(`${pathLabel} subject hours sum to ${sum}, expected ${weeklyHoursTotal}`);
  }
}

function validateSolverRequest(payload) {
  const errors = [];
  uniqueBy(payload.slots, (slot) => slot.id, errors, 'slot id');
  uniqueBy(payload.teachers, (teacher) => teacher.id, errors, 'teacher id');
  uniqueBy(payload.students, (student) => student.id, errors, 'student id');

  const slotIds = new Set(payload.slots.map((slot) => slot.id));
  const studentIds = new Set(payload.students.map((student) => student.id));

  for (const slot of payload.slots) {
    if (minutes(slot.endTime) - minutes(slot.startTime) !== 60) {
      errors.push(`Slot ${slot.id} must last exactly 60 minutes`);
    }
  }

  for (const teacher of payload.teachers) {
    for (const slotId of teacher.availableSlotIds) {
      if (!slotIds.has(slotId)) {
        errors.push(`Teacher ${teacher.id} references unknown slot ${slotId}`);
      }
    }
  }

  for (const student of payload.students) {
    validateSubjectHours(
      student.subjectHours,
      student.weeklyHoursTotal,
      `Student ${student.id}`,
      errors,
    );
    for (const slotId of student.unavailableSlotIds) {
      if (!slotIds.has(slotId)) {
        errors.push(`Student ${student.id} references unknown slot ${slotId}`);
      }
    }
  }

  const relationshipKeys = new Set();
  for (const relationship of payload.relationships) {
    const [firstId, secondId] = relationship.studentIds;
    for (const studentId of relationship.studentIds) {
      if (!studentIds.has(studentId)) {
        errors.push(`Relationship references unknown student ${studentId}`);
      }
    }
    const key = [firstId, secondId].sort().join('|');
    if (relationshipKeys.has(key)) {
      errors.push(`Duplicate undirected relationship ${key}`);
    }
    relationshipKeys.add(key);
  }

  return errors;
}

function validateSolverResponse(payload) {
  const errors = [];
  const hasSolution = payload.solution !== null;
  const shouldHaveSolution = payload.status === 'OPTIMAL' || payload.status === 'FEASIBLE';
  if (hasSolution !== shouldHaveSolution) {
    errors.push(`${payload.status} response has inconsistent solution presence`);
  }

  if (payload.attempts[0]?.mode !== 'STRICT') {
    errors.push('The first solver attempt must be STRICT');
  }
  const relaxedIndex = payload.attempts.findIndex((attempt) => attempt.mode === 'RELAXED');
  if (
    relaxedIndex > 0 &&
    ['OPTIMAL', 'FEASIBLE'].includes(payload.attempts[relaxedIndex - 1].status)
  ) {
    errors.push('RELAXED mode cannot follow a feasible STRICT attempt');
  }

  if (!payload.solution) {
    return errors;
  }

  uniqueBy(payload.solution.classes, (weeklyClass) => weeklyClass.id, errors, 'class id');
  uniqueBy(
    payload.solution.classes,
    (weeklyClass) => `${weeklyClass.teacherId}|${weeklyClass.slotId}`,
    errors,
    'teacher-slot class',
  );

  const assignmentCounts = new Map();
  for (const weeklyClass of payload.solution.classes) {
    uniqueBy(
      weeklyClass.studentIds,
      (studentId) => studentId,
      errors,
      `student in ${weeklyClass.id}`,
    );
    for (const studentId of weeklyClass.studentIds) {
      const key = `${studentId}|${weeklyClass.teacherId}`;
      assignmentCounts.set(key, (assignmentCounts.get(key) ?? 0) + 1);
    }
  }

  const subjectTeachers = new Map();
  for (const allocation of payload.solution.subjectTeacherAllocations) {
    const allocationTotal = allocation.subjectHours.reduce(
      (total, subject) => total + subject.weeklyHours,
      0,
    );
    if (allocationTotal !== allocation.totalHours) {
      errors.push(
        `Allocation ${allocation.studentId}|${allocation.teacherId} totals ${allocationTotal}, expected ${allocation.totalHours}`,
      );
    }
    const assigned = assignmentCounts.get(`${allocation.studentId}|${allocation.teacherId}`) ?? 0;
    if (assigned !== allocation.totalHours) {
      errors.push(
        `Allocation ${allocation.studentId}|${allocation.teacherId} has ${assigned} classes, expected ${allocation.totalHours}`,
      );
    }
    for (const subject of allocation.subjectHours) {
      const key = `${allocation.studentId}|${subject.subjectCode}`;
      const previousTeacher = subjectTeachers.get(key);
      if (previousTeacher && previousTeacher !== allocation.teacherId) {
        errors.push(`Subject ${key} is split between teachers`);
      }
      subjectTeachers.set(key, allocation.teacherId);
    }
  }

  if (payload.mode === 'RELAXED') {
    for (const finding of payload.solution.findings) {
      if (finding.enforcement === 'HARD') {
        errors.push(`Relaxed solution contains hard finding ${finding.ruleId}`);
      }
    }
  }

  return errors;
}

function validateCreatePerson(payload) {
  const errors = [];
  validateSubjectHours(payload.subjectHours, payload.weeklyHoursTotal, 'Person', errors);
  uniqueBy(payload.relatedPersonIds ?? [], (id) => id, errors, 'related person id');
  return errors;
}

function validateEvaluation(payload) {
  const errors = [];
  const expectedCounts = {
    blockingErrors: payload.findings.filter(
      (finding) => finding.severity === 'ERROR' && finding.blocksConfirmation,
    ).length,
    relaxableErrors: payload.findings.filter(
      (finding) => finding.severity === 'ERROR' && !finding.blocksConfirmation,
    ).length,
    warnings: payload.findings.filter((finding) => finding.severity === 'WARNING').length,
    information: payload.findings.filter((finding) => finding.severity === 'INFO').length,
  };

  for (const [key, value] of Object.entries(expectedCounts)) {
    if (payload.counts[key] !== value) {
      errors.push(`Evaluation count ${key} is ${payload.counts[key]}, expected ${value}`);
    }
  }
  if (payload.canConfirm === payload.counts.blockingErrors > 0) {
    errors.push('Evaluation canConfirm is inconsistent with blocking errors');
  }
  return errors;
}

function validateAppSchedule(payload) {
  const errors = validateEvaluation(payload.evaluation);
  if (payload.evaluation.scheduleId !== payload.id) {
    errors.push('Schedule evaluation references a different schedule');
  }
  if (payload.evaluation.scheduleRevision !== payload.revision) {
    errors.push('Schedule evaluation references a stale revision');
  }
  if (payload.evaluation.ruleCatalogVersion !== payload.ruleCatalogVersion) {
    errors.push('Schedule and evaluation rule catalog versions differ');
  }

  if (payload.state === 'CONFIRMED') {
    if (payload.confirmedAt === null || payload.confirmedByUserId === null) {
      errors.push('Confirmed schedule is missing confirmation evidence');
    }
    if (!payload.evaluation.canConfirm) {
      errors.push('A confirmed schedule cannot contain blocking findings');
    }
    const relaxableFingerprints = payload.evaluation.findings
      .filter((finding) => finding.enforcement === 'RELAXABLE')
      .map((finding) => finding.fingerprint);
    for (const fingerprint of relaxableFingerprints) {
      if (!payload.acceptedFindingFingerprints.includes(fingerprint)) {
        errors.push(`Confirmed schedule did not preserve accepted finding ${fingerprint}`);
      }
    }
  }

  return errors;
}

const semanticValidators = {
  APP_CREATE_PERSON: validateCreatePerson,
  APP_SCHEDULE: validateAppSchedule,
  APP_SCHEDULE_EVALUATION: validateEvaluation,
  NONE: () => [],
  SOLVER_REQUEST: validateSolverRequest,
  SOLVER_RESPONSE: validateSolverResponse,
};

function createFixtureAjv(documentPaths) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  for (const absolutePath of documentPaths) {
    const document = structuredClone(readJson(absolutePath));
    document.$id = pathToFileURL(absolutePath).href;
    ajv.addSchema(document);
  }

  return ajv;
}

function validateComponentSchemas(contractManifest) {
  const documentPaths = [
    contractPath(contractManifest.sharedComponents.path),
    contractPath(contractManifest.applicationApi.path),
    contractPath(contractManifest.solverApi.path),
  ];
  const ajv = createFixtureAjv(documentPaths);
  let componentCount = 0;

  for (const absolutePath of documentPaths) {
    const document = readJson(absolutePath);
    for (const schemaName of Object.keys(document.components.schemas)) {
      const reference = `${pathToFileURL(absolutePath).href}#/components/schemas/${schemaName}`;
      try {
        ajv.compile({ $ref: reference });
      } catch (error) {
        fail(`${path.relative(repositoryRoot, absolutePath)}#${schemaName}: ${error.message}`);
      }
      componentCount += 1;
    }
  }

  return componentCount;
}

function validateFixtures(manifest, contractManifest) {
  const fixtureManifestPath = contractPath(contractManifest.fixtures.manifestPath);
  const fixtureDirectory = path.dirname(fixtureManifestPath);
  assert(
    manifest.fixtureVersion === contractManifest.fixtures.fixtureVersion,
    'Fixture version does not match the contract manifest',
  );

  const schemaDocumentPaths = [
    contractPath(contractManifest.sharedComponents.path),
    contractPath(contractManifest.applicationApi.path),
    contractPath(contractManifest.solverApi.path),
  ];
  const ajv = createFixtureAjv(schemaDocumentPaths);
  const fixtureIds = new Set();

  for (const fixture of manifest.fixtures) {
    assert(!fixtureIds.has(fixture.id), `Duplicate fixture id ${fixture.id}`);
    fixtureIds.add(fixture.id);
    assert(
      semanticValidators[fixture.semanticValidator],
      `Unknown semantic validator ${fixture.semanticValidator}`,
    );

    const [schemaPath, fragment = ''] = fixture.schemaRef.split('#');
    const absoluteSchemaPath = path.resolve(fixtureDirectory, schemaPath);
    const schemaReference = `${pathToFileURL(absoluteSchemaPath).href}#${fragment}`;
    const validate = ajv.compile({ $ref: schemaReference });
    const payload = readJson(path.resolve(fixtureDirectory, fixture.path));
    const schemaValid = validate(payload);
    const semanticErrors = schemaValid
      ? semanticValidators[fixture.semanticValidator](payload)
      : [];
    const valid = schemaValid && semanticErrors.length === 0;
    const expectedValid = fixture.expected === 'VALID';

    if (valid !== expectedValid) {
      const schemaErrors = validate.errors
        ? ajv.errorsText(validate.errors, { separator: '\n' })
        : '';
      fail(
        [
          `Fixture ${fixture.id} expected ${fixture.expected} but was ${valid ? 'VALID' : 'INVALID'}`,
          schemaErrors,
          ...semanticErrors,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  }

  return fixtureIds.size;
}

const contractManifest = readJson(contractPath('manifest.json'));
const fixtureManifest = readJson(contractPath(contractManifest.fixtures.manifestPath));

validateManifest(contractManifest);
const referencedDocuments = verifyReferences([
  contractManifest.applicationApi.path,
  contractManifest.solverApi.path,
  contractManifest.sharedComponents.path,
  contractManifest.ruleCatalog.path,
  contractManifest.ruleCatalog.schemaPath,
]);

const appApi = readJson(contractPath(contractManifest.applicationApi.path));
const solverApi = readJson(contractPath(contractManifest.solverApi.path));
validateOpenApi(appApi, 'application');
validateOpenApi(solverApi, 'solver');

const catalogSchema = readJson(contractPath(contractManifest.ruleCatalog.schemaPath));
const catalog = readJson(contractPath(contractManifest.ruleCatalog.path));
validateRuleCatalog(catalogSchema, catalog);

const componentCount = validateComponentSchemas(contractManifest);
const fixtureCount = validateFixtures(fixtureManifest, contractManifest);

console.log(
  `Validated ${referencedDocuments.size} contract documents, ${componentCount} component schemas, ${catalog.rules.length} rules, and ${fixtureCount} fixtures.`,
);
