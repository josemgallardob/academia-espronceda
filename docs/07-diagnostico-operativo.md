# Diagnostico operativo

## Objetivo

Este documento describe como observar y diagnosticar NestJS y FastAPI en desarrollo y en
un entorno desplegado. Cubre salud, correlacion de llamadas, metricas basicas, timeouts,
concurrencia y los fallos de autenticacion y del solver.

Los secretos nunca deben aparecer en logs, metricas ni respuestas de error. Eso incluye
contrasenas, JWT, cookies, `Authorization`, `INTERNAL_SERVICE_TOKEN` y `DATABASE_AUTH_TOKEN`.

## Superficie operativa

| Recurso | Servicio | Autenticacion | Uso |
| ------- | -------- | ------------- | --- |
| `GET /health` | NestJS y FastAPI | Publico | Proceso vivo. El balanceador puede usarlo como liveness. |
| `GET /ready` | NestJS | Publico | Dependencias. `200` si la base responde; `503` solo si la base falla. |
| `GET /metrics` | NestJS | Publico | Contadores en proceso: HTTP, login y llamadas al solver. |
| `X-Request-Id` | NestJS y FastAPI | Cabecera | Correlacion de una peticion de extremo a extremo. |

En produccion, `/api/health`, `/api/ready` y `/api/metrics` llegan a NestJS como `/health`,
`/ready` y `/metrics` despues de retirar el prefijo `/api`. FastAPI no se publica.

## Correlacion NestJS-FastAPI

1. Si la peticion HTTP trae `X-Request-Id` con un valor seguro, se reutiliza. Si no, NestJS
   genera un UUID.
2. Ese identificador viaja en la respuesta (`X-Request-Id`) y en `traceId` de
   `application/problem+json`.
3. La generacion automatica usa el mismo valor como `requestId` del contrato del solver y
   lo reenvia a FastAPI en `X-Request-Id`.
4. FastAPI escribe el mismo `traceId` en sus problemas y lo devuelve en `X-Request-Id`.

Para seguir un fallo: tomar el `X-Request-Id` o el `traceId` de la respuesta y buscar ese
valor en los logs JSON de ambos procesos.

## Logs estructurados

Cada evento operativo es una linea JSON. Campos habituales:

- `timestamp`, `service` (`api` o `solver`), `level`, `event`
- `requestId`, `method`, `path`, `status`, `durationMs`, `code` o `outcome`

Eventos relevantes:

| event | Significado |
| ----- | ----------- |
| `http.request` | Peticion HTTP terminada. No se registra `/health`, `/ready` ni `/metrics`. |
| `http.problem` | Respuesta `application/problem+json`. |
| `auth.login` | Login aceptado o rechazado. La identidad se registra como huella SHA-256, nunca en claro. |
| `solver.request` / `solver.response` | Ida y vuelta NestJS-FastAPI. |
| `solver.busy` / `SOLVER_BUSY` | Hay otra generacion en curso. |

Los campos `password`, `Authorization`, `cookie`, `token`, `jwt` y equivalentes se sustituyen
por `[REDACTED]`. Los JWT y cabeceras `Bearer` que aparezcan en texto tambien se ocultan.

No se registran cuerpos de login ni el payload del solver: contienen credenciales o datos
de alumnos.

## Health y degradacion

`GET /health` solo confirma que el proceso responde.

`GET /ready` en NestJS comprueba:

1. Base de datos: `SELECT 1`. Si falla, `status=error` y HTTP 503.
2. Solver: `GET {SOLVER_URL}/health` con 2 segundos de espera. Si falla, `status=degraded`
   y HTTP 200. Login y personas siguen disponibles.

```json
{
  "service": "api",
  "status": "degraded",
  "checks": { "database": "ok", "solver": "error" }
}
```

Un solver caido no debe sacar la API del balanceador. Un fallo de base si.

## Metricas

`GET /metrics` expone contadores del proceso actual. Se pierden al reiniciar. Sirven para
confirmar trafico, saturacion del solver e intentos de login, no como historial.

Campos: `httpRequestsTotal`, `httpResponses`, `solverRequestsTotal`, `solverOutcomes`,
`solverInFlight`, `loginAttemptsTotal`, `loginOutcomes` y las ultimas duraciones observadas.

## Timeouts y concurrencia

La generacion pide primero una solucion estricta y, si hace falta, una relajada. NestJS
espera como maximo `2 * timeLimitSeconds + SOLVER_TIMEOUT_BUFFER_SECONDS`. El valor por
defecto del buffer es 5 segundos.

`SOLVER_MAX_CONCURRENT` limita generaciones simultaneas en NestJS y en FastAPI. El valor
por defecto es 1: CP-SAT es costoso y una segunda generacion no debe apilarse.

Si el limite esta ocupado:

- NestJS responde `503 GENERATION_BUSY`.
- FastAPI responde `503 SOLVER_BUSY` si recibe otra llamada directa.

No hay reintentos automaticos. El operador o el usuario debe esperar a que termine la
generacion en curso.

## Fallos de autenticacion

| Sintoma | Codigo | Que revisar |
| ------- | ------ | ----------- |
| Login rechazado | `401 INVALID_CREDENTIALS` | Identidad o contrasena. El error es generico a proposito. |
| Sesion ausente o invalida | `401 AUTHENTICATION_REQUIRED` | Cookie, caducidad, `token_version` o algoritmo distinto de HS256. |
| Demasiados intentos | `429 RATE_LIMIT_EXCEEDED` | Limite por IP o por identificador. Esperar la ventana. |
| Origen no permitido | `403 ORIGIN_FORBIDDEN` | `API_CORS_ORIGINS` y la cabecera `Origin`. |
| CSRF | `403` | Cookie `XSRF-TOKEN` y cabecera `X-XSRF-TOKEN` de la misma sesion. |
| Solver sin token interno | `401 AUTHENTICATION_REQUIRED` o `INVALID_SERVICE_TOKEN` | `INTERNAL_SERVICE_TOKEN` identico en NestJS y FastAPI. Nunca un JWT de usuario. |

Los logs de login usan `identityFingerprint`, no el usuario ni la contrasena. Si el
problema es 429, mirar `AUTH_LOGIN_IP_LIMIT` y `AUTH_LOGIN_IDENTIFIER_LIMIT`.

## Fallos del solver

| Sintoma | Codigo | Que revisar |
| ------- | ------ | ----------- |
| Timeout o red | `502 SOLVER_UNAVAILABLE` | `SOLVER_URL`, red privada, proceso FastAPI y `GET {SOLVER_URL}/health`. |
| Token interno o 5xx del motor | `502 SOLVER_UNAVAILABLE` | Token, logs `solver.response` del motor y `/health` de FastAPI. |
| Contrato o JSON invalido | `502 SOLVER_INVALID_RESPONSE` | Version del contrato y del catalogo. |
| Resultado incoherente con NestJS | `502 SOLVER_RESULT_DIVERGED` | Defecto de consistencia: no reintentar a ciegas. |
| Sin solucion usable | `409 GENERATION_INFEASIBLE` | Datos de alumnos, profesores y huecos, no infraestructura. |
| Otra generacion en curso | `503 GENERATION_BUSY` / `SOLVER_BUSY` | Esperar. Subir `SOLVER_MAX_CONCURRENT` solo si hay CPU de sobra. |

Comprobacion rapida:

```bash
curl -sS http://127.0.0.1:3000/health
curl -sS http://127.0.0.1:3000/ready
curl -sS http://127.0.0.1:8001/health
```

Si `/ready` marca `solver=error`, FastAPI no responde en `SOLVER_URL`. Si `/health` de
NestJS falla, el proceso API no esta vivo.

## Variables operativas

| Variable | Defecto | Efecto |
| -------- | ------- | ------ |
| `SOLVER_TIMEOUT_BUFFER_SECONDS` | `5` | Margen HTTP extra sobre las dos pasadas del solver (0-60). |
| `SOLVER_MAX_CONCURRENT` | `1` | Generaciones simultaneas por proceso (1-8). |

El resto de variables de entorno sigue en [Configuracion de entornos y secretos](./05-configuracion-entornos.md).
