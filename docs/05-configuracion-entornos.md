# Configuracion de entornos y secretos

## Objetivo

El proyecto dispone de dos entornos:

1. `development`: ejecucion completa y autocontenida en el equipo local.
2. `production`: artefactos optimizados, dominio HTTPS publico, Turso remoto y comunicacion
   privada entre NestJS y FastAPI.

La plataforma cerrada es Railway. El contrato de topologia, secretos, dominio, migraciones,
CI de despliegue, operacion y recuperacion esta en
[Plataforma de despliegue](./08-plataforma-despliegue.md). El blueprint es
`.railway/railway.ts`.

## Topologia

### Desarrollo local

```text
Angular :4200 ────────> NestJS :3000 ────────> FastAPI :8001
                              │
                              └──────────────> .data/academia-espronceda.db
                                               (libSQL local)
```

Los tres procesos solo escuchan en `127.0.0.1`. NestJS es el unico servicio que accede a la
base de datos y el unico consumidor de FastAPI. Angular puede llamar a NestJS desde los
origenes locales declarados expresamente en CORS.

### Produccion

```text
https://<dominio-publico>                 Railway academia-espronceda-web
    ├── /*       ─────> Angular estatico (servido por NestJS)
    └── /api/*, /health, /ready
                 ─────> NestJS ─────> FastAPI (Railway academia-espronceda-solver)
                            │
                            └───────> Turso/libSQL remoto
```

Un solo origen HTTPS conserva las cookies `__Host-`, CORS y CSRF. NestJS mantiene sus
rutas (`/health`, `/api/v1/...`) y sirve el bundle de Angular en el resto. FastAPI no
publica puerto, ruta ni dominio a Internet; NestJS lo llama en el hostname privado
`RAILWAY_PRIVATE_DOMAIN` del solver, puerto 8001.

## Preparacion y arranque local

Despues de instalar las versiones de Node y Python indicadas en el repositorio:

```bash
npm run setup
cp .env.development.example .env.local
npm run dev
```

El repositorio ya puede contener un `.env.local` de trabajo, pero el archivo esta ignorado por
Git. `npm run dev` valida su contenido, crea de forma segura el directorio `.data` y levanta
Angular, NestJS y FastAPI de forma coordinada. Al detener el comando se detienen los tres
procesos.

Tambien se puede iniciar un servicio aislado:

```bash
npm run dev:web
npm run dev:api
npm run dev:solver
```

Puntos de comprobacion:

- Web: `http://localhost:4200`
- API: `http://localhost:3000/health` y `http://localhost:3000/ready`
- Solver: `http://localhost:8001/health`
- Base local: `.data/academia-espronceda.db`

Tras migrar, `npm run seed:local` deja cuentas, profesores y alumnos para recorrer Horario
desde el navegador. En producción, `npm run seed:teachers` carga solo el catálogo de
profesores contra Turso. En el login de desarrollo aparece un acceso de demostración. Las
etiquetas visibles de los tres profesores se leen de `.env.local` si están definidas;
el ejemplo versionado usa solo nombres genéricos.

La base local usa una URL `file:` compatible con `@libsql/client`. No necesita Docker, un
daemon ni credenciales de Turso. La dependencia de persistencia se incorporara en PR-01.

## Construccion y ejecucion de produccion

Railway construye `Dockerfile.web` y `Dockerfile.solver` (Node 24.16 y Python 3.14.2).
El start de produccion migra Turso con el migrador compilado y arranca NestJS, que
sirve `apps/web/dist/web/browser` con fallback a `index.html`.

Antes de un deploy, la misma secuencia de comprobaciones (formato, contratos, lint, tests
y build) es la que ejecuta GitHub Actions en cada push a `main`. Ver `.github/workflows/ci.yml`.

```bash
npm ci
npm run setup:solver
npm run check
```

Salidas y procesos:

- Angular: contenido estatico de `apps/web/dist/web/browser`, servido por NestJS.
- NestJS: `npm run db:migrate:prod && npm run start:prod:api`.
- FastAPI: `python -m academia_espronceda_solver`, solo en la red privada.

Las variables de `.env.production.example` se configuran en el gestor de variables y secretos
de la plataforma. No se copia ese archivo como `.env` en el servidor y no se hornea ningun
secreto dentro de la imagen o del bundle de Angular.

NestJS y FastAPI fallan al arrancar cuando detectan una configuracion de produccion insegura o
incompleta. Entre otras garantias, produccion exige HTTPS para los origenes CORS, Turso remoto,
cookie `Secure` con prefijo `__Host-`, proxy de confianza y longitudes minimas para los
secretos.

## Variables

| Variable                         | Desarrollo                  | Produccion                                | Consumidor      |
| -------------------------------- | --------------------------- | ----------------------------------------- | --------------- |
| `NODE_ENV`                       | `development`               | `production`                              | NestJS, FastAPI |
| `WEB_HOST`                       | `127.0.0.1`                 | No aplica al bundle estatico              | Arranque local  |
| `WEB_PORT`                       | `4200`                      | Gestionado por el hosting                 | Arranque local  |
| `API_HOST`                       | `127.0.0.1`                 | `0.0.0.0` o interfaz privada asignada     | NestJS          |
| `API_PORT`                       | `3000`                      | `PORT` de Railway si no hay `API_PORT`    | NestJS          |
| `API_CORS_ORIGINS`               | Origenes locales explicitos | `https://<dominio-publico>`               | NestJS          |
| `SOLVER_HOST`                    | `127.0.0.1`                 | Interfaz de red privada                   | FastAPI         |
| `SOLVER_PORT`                    | `8001`                      | `PORT` de Railway si no hay `SOLVER_PORT` | FastAPI         |
| `SOLVER_URL`                     | `http://127.0.0.1:8001`     | Hostname privado y `PORT` del solver      | NestJS          |
| `DATABASE_URL`                   | `file:./.data/...`          | `libsql://...turso.io`                    | NestJS          |
| `DATABASE_AUTH_TOKEN`            | Vacio                       | Secreto de Turso                          | NestJS          |
| `JWT_SECRET`                     | Marcador local conocido     | Secreto aleatorio de 64+ caracteres       | NestJS          |
| `JWT_ISSUER`                     | `academia-espronceda-api`   | Emisor estable de la API                  | NestJS          |
| `JWT_AUDIENCE`                   | `academia-espronceda-web`   | Audiencia estable de la web               | NestJS          |
| `JWT_TTL_SECONDS`                | `36000` (10 horas)          | Entre 28800 y 43200                       | NestJS          |
| `INTERNAL_SERVICE_TOKEN`         | Marcador local conocido     | Secreto aleatorio de 32+ caracteres       | NestJS, FastAPI |
| `AUTH_COOKIE_NAME`               | `academia_session`          | `__Host-academia_session`                 | NestJS          |
| `XSRF_COOKIE_NAME`               | `XSRF-TOKEN`                | `XSRF-TOKEN`                              | NestJS, Angular |
| `AUTH_LOGIN_RATE_WINDOW_SECONDS` | `900`                       | Ventana entre 60 y 3600 segundos          | NestJS          |
| `AUTH_LOGIN_IP_LIMIT`            | `20`                        | Intentos por IP y ventana                 | NestJS          |
| `AUTH_LOGIN_IDENTIFIER_LIMIT`    | `5`                         | Intentos por identidad y ventana          | NestJS          |
| `COOKIE_SECURE`                  | `false`                     | `true`                                    | NestJS          |
| `TRUST_PROXY`                    | `false`                     | `true`                                    | NestJS          |
| `SOLVER_TIMEOUT_BUFFER_SECONDS`  | `5`                         | Margen HTTP extra sobre el solver         | NestJS          |
| `SOLVER_MAX_CONCURRENT`          | `1`                         | Generaciones simultaneas por proceso      | NestJS, FastAPI |
| `TEACHER_1_DISPLAY_NAME`         | `Profesor 1`                | Etiqueta visible del profesor 1           | `seed:teachers` |
| `TEACHER_2_DISPLAY_NAME`         | `Profesor 2`                | Etiqueta visible del profesor 2           | `seed:teachers` |
| `TEACHER_3_DISPLAY_NAME`         | `Profesor 3`                | Etiqueta visible del profesor 3           | `seed:teachers` |

`API_CORS_ORIGINS` acepta una lista separada por comas, sin rutas ni comodines. En produccion
todos los origenes deben usar HTTPS.

La cookie de sesión es `HttpOnly`, `SameSite=Strict`, tiene ruta `/` y en
producción también es `Secure` y usa el prefijo `__Host-`. La cookie XSRF debe ser
legible por Angular y no contiene la sesión; NestJS exige además la cabecera
`X-XSRF-TOKEN`, verifica el origen en operaciones de escritura y vincula el token
XSRF al JWT de sesión. La duración configurada se aplica tanto al JWT como a la
cookie y no existe token de refresco.

## Manejo de secretos

- `.env.local`, `.env` y cualquier variante real estan ignorados por Git.
- Los archivos `*.example` solo contienen nombres, marcadores o valores locales publicos.
- Los secretos de produccion viven exclusivamente en el gestor de secretos de la plataforma.
- Cada entorno remoto debe tener valores distintos.
- Los secretos no se pasan como argumentos de comandos, no se imprimen en logs y no se
  incluyen en el frontend.
- `JWT_SECRET` e `INTERNAL_SERVICE_TOKEN` pueden generarse con
  `openssl rand -base64 48`.
- La rotacion del token interno requiere actualizar NestJS y FastAPI de forma coordinada.
- La rotacion de `JWT_SECRET` invalida las sesiones existentes y debe planificarse.

El token de servicio autentica en el futuro las llamadas NestJS a FastAPI; no sustituye el
aislamiento de red. El token de Turso solo se entrega a NestJS.

## Dominio publico y TLS

Antes de abrir produccion:

1. Configurar el dominio y sus registros DNS en el servicio web de Railway.
2. Activar certificado TLS valido y redireccion permanente de HTTP a HTTPS.
3. Confirmar que NestJS sirve Angular con fallback a `index.html`.
4. Mantener FastAPI sin dominio publico, solo red privada.
5. Establecer `API_CORS_ORIGINS` al origen HTTPS exacto.
6. Ejecutar `PRODUCTION_BASE_URL=https://<dominio> npm run smoke:production` y el
   recorrido autenticado de login, personas, horario manual y generacion.

La observabilidad, la correlacion de llamadas y el diagnostico de fallos se detallan en
[Diagnostico operativo](./07-diagnostico-operativo.md).

No se debe considerar listo el entorno si el dominio funciona por HTTP, FastAPI es publico o
la API acepta `*` en CORS.
