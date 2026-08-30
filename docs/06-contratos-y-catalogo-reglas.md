# Contratos API y catálogo de reglas v1

## Propósito

Este documento describe los artefactos neutrales definidos en FO-03 para coordinar Angular,
NestJS y FastAPI sin duplicar el significado de los contratos ni de las reglas de planificación.

Los artefactos ejecutables están bajo `contracts/`:

| Artefacto               | Versión | Ruta                                   |
| ----------------------- | ------- | -------------------------------------- |
| API Angular–NestJS      | `1.0.0` | `contracts/app-api/v1/openapi.json`    |
| API NestJS–FastAPI      | `1.0.0` | `contracts/solver-api/v1/openapi.json` |
| Componentes compartidos | `1.0.0` | `contracts/shared/v1/components.json`  |
| Catálogo de reglas      | `1.0.0` | `contracts/rules/1.0.0/catalog.json`   |
| Fixtures                | `1.0.0` | `contracts/fixtures/v1/manifest.json`  |

`contracts/manifest.json` relaciona las versiones y ubicaciones publicadas. OpenAPI 3.1 JSON es
la fuente de verdad para los payloads HTTP. Los futuros modelos TypeScript y Pydantic deben
derivarse de estos documentos o comprobarse contra ellos.

## Versionado

Las rutas HTTP expresan su versión mayor:

- API pública: `/api/v1`.
- API privada del solver: `/v1`.

Los contratos y el catálogo usan SemVer de forma independiente. Un identificador de regla
publicado no se renombra ni se reutiliza con otro significado. Un cambio semántico incompatible
requiere un identificador nuevo y una nueva versión mayor cuando rompa consumidores existentes.

## Clasificación de reglas

Cada entrada separa dos conceptos:

- `enforcement`: `HARD`, `RELAXABLE` o `PREFERENCE`.
- `severity`: `ERROR`, `WARNING` o `INFO`.

Una regla `HARD` nunca puede relajarse ni confirmarse con aceptación humana. Una regla
`RELAXABLE` debe cumplirse en la búsqueda estricta, pero puede aparecer en una solución relajada
y confirmarse conscientemente. Una `PREFERENCE` determina la calidad relativa de soluciones que
ya respetan las prioridades superiores.

### Reglas hard

| Identificador                   | Invariante                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ACTIVE_STUDENTS_ONLY`          | Solo los alumnos activos reciben asignaciones.                                                    |
| `CLASS_SLOT_VALID`              | Toda clase usa una franja semanal predefinida de 60 minutos.                                      |
| `TEACHER_SINGLE_CLASS_PER_SLOT` | Un profesor tiene como máximo una clase en cada franja.                                           |
| `STUDENT_UNIQUE_IN_CLASS`       | Un alumno no aparece duplicado dentro de una clase.                                               |
| `STUDENT_TIME_OVERLAP`          | Un alumno no tiene clases solapadas.                                                              |
| `STUDENT_SAME_DAY_CONTIGUOUS`   | Si un alumno tiene varias clases el mismo día, deben ocupar franjas consecutivas.                 |
| `TEACHER_SUBJECT_COMPATIBILITY` | El profesor imparte las asignaturas que justifican la asignación.                                 |
| `TEACHER_COURSE_COMPATIBILITY`  | El profesor admite el curso del alumno.                                                           |
| `TEACHER_AVAILABILITY`          | El profesor está disponible en la franja.                                                         |
| `TEACHER_WORKING_SLOT_OCCUPIED` | Al generar, cada franja de trabajo del profesor que admite algún alumno compatible queda ocupada. |
| `STUDENT_AVAILABILITY`          | El alumno no ha marcado la franja como no disponible.                                             |
| `STUDENT_WEEKLY_HOURS_EXACT`    | El horario final contiene exactamente las horas totales contratadas.                              |
| `STUDENT_SUBJECT_HOURS_EXACT`   | Si intervienen varios profesores, el reparto conserva las horas por asignatura.                   |
| `SUBJECT_SINGLE_TEACHER`        | Todas las horas de una asignatura de un alumno pertenecen a un único profesor.                    |
| `STUDENT_TEACHER_CONTINUITY`    | Un alumno no se reparte entre más profesores de los necesarios para cubrir sus asignaturas.       |

Un borrador puede tener temporalmente horas pendientes mientras se construye, pero nunca horas
excedidas. La confirmación y cualquier solución del solver exigen igualdad exacta.
`TEACHER_WORKING_SLOT_OCCUPIED` solo se exige al generar: un borrador manual puede dejar franjas
vacías mientras se edita, pero el generador no puede devolver esas franjas vacías si admiten algún
alumno compatible. `STUDENT_TEACHER_CONTINUITY` sí se exige también en borradores y al confirmar:
un alumno no puede quedar repartido entre más profesores de los que hacen falta para sus
asignaturas.

### Reglas relajables

| Prioridad | Identificador            | Invariante                                      |
| --------: | ------------------------ | ----------------------------------------------- |
|         1 | `CLASS_CAPACITY_MAXIMUM` | Una clase activa no debe superar 5 alumnos.     |
|         2 | `CLASS_CAPACITY_MINIMUM` | Una clase activa debe tener al menos 3 alumnos. |

Estas son las únicas reglas obligatorias relajables. Si hay que elegir, se evita superar el
máximo antes de evitar una clase de 1 o 2 alumnos.

### Preferencias

| Prioridad | Identificador                      | Objetivo                                                            |
| --------: | ---------------------------------- | ------------------------------------------------------------------- |
|         3 | `CLASS_CAPACITY_IDEAL`             | Mantener 4 alumnos; una clase de 5 penaliza más que una de 3.       |
|         4 | `STUDENT_DAY_SPREAD`               | Repartir las horas de un alumno en el mayor número posible de días. |
|         5 | `RELATED_STUDENTS_TOGETHER`        | Maximizar clases compartidas con el mismo profesor, día y hora.     |
|         6 | `PREFERRED_TEACHER_BACH1_SCIENCES` | Preferir `GENERAL_SCIENCES` para ciencias de 1.º de Bachillerato.   |
|         6 | `PREFERRED_TEACHER_OTHER_SCIENCES` | Preferir `SENIOR_SCIENCES` para ciencias del curso `OTHER`.         |

## Puntuación

La puntuación interna es una penalización no negativa:

- Cero es el mejor valor.
- Los niveles se comparan lexicográficamente en el orden del catálogo.
- Una mejora de prioridad inferior nunca compensa un incumplimiento de prioridad superior.
- La respuesta interna incluye desglose por prioridad y regla.

La API pública no expone esa cifra como una supuesta nota comprensible para el usuario. NestJS
transforma la evaluación en uno de estos resultados y en explicaciones en español:

- `IDEAL`.
- `VALID_WITH_RECOMMENDATIONS`.
- `HAS_RELAXABLE_CONFLICTS`.
- `BLOCKED`.

## Estados del solver

El modo y el resultado son campos distintos:

- Modo: `STRICT` o `RELAXED`.
- Estado: `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `UNKNOWN` o `ERROR`.

El solver intenta primero el modo estricto. Una solución estricta factible siempre prevalece
sobre una solución relajada. Solo `OPTIMAL` y `FEASIBLE` contienen horario. `INFEASIBLE` y
`UNKNOWN` son resultados normales con HTTP 200; los errores de autenticación, contrato, entrada
o ejecución usan respuestas HTTP de problema.

## Conflictos estructurados

Cada hallazgo contiene el identificador de regla, enforcement, severidad, si bloquea la
confirmación, referencias de entidades, franjas, parámetros y una huella SHA-256 determinista.

FastAPI no construye mensajes de interfaz. NestJS usa la evidencia para producir explicaciones
en español y conserva, junto a un horario confirmado, la revisión, versión del catálogo,
resultado de validación, conflictos relajables aceptados, usuario y fecha.

## API pública

La API Angular–NestJS cubre exclusivamente el alcance funcional aprobado:

- Inicio, cierre y consulta de sesión.
- Alta, listado, detalle, edición, eliminación consistente y activación de personas.
- Lista mínima de profesores para el selector del cuadrante.
- Configuración pública de franjas y etiquetas.
- Consulta de horarios y revisiones.
- Creación de borrador vacío o generado.
- Alta, retirada y traslado atómico de asignaciones.
- Reparto asignatura–profesor cuando intervienen varios docentes.
- Validación global determinista y confirmación consciente.

No expone administración ni vistas de detalle de profesores. Las mutaciones autenticadas
requieren cookie de sesión y cabecera XSRF. La revisión esperada y la huella de validación evitan
confirmar información obsoleta.

## API privada del solver

`POST /v1/schedules/solve` recibe un problema autocontenido con identificadores opacos, franjas,
capacidades docentes, alumnos activos, horas, disponibilidades, relaciones y opciones de
ejecución. No recibe nombres, teléfonos, centros, tutores ni comentarios.

La respuesta contiene clases, reparto asignatura–profesor cuando sea necesario, intentos,
estado, puntuación, hallazgos, tiempos, semilla y límites efectivos. NestJS valida de forma
independiente todo horario recibido antes de mostrarlo o persistirlo.

## Validación local

```bash
npm run validate:contracts
```

La comprobación valida referencias, manifiestos, esquema y semántica del catálogo, unicidad de
operaciones, invariantes de horas, franjas, relaciones, estados del solver, reparto de
asignaturas, revisiones y evidencia de confirmación. También valida todos los fixtures positivos
y negativos declarados en su manifiesto.
