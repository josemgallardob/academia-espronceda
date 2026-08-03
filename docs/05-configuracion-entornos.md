# Configuracion de entornos y secretos

## Objetivo

El proyecto dispone de dos entornos:

1. `development`: ejecucion completa y autocontenida en el equipo local.
2. `production`: artefactos optimizados, dominio HTTPS publico, Turso remoto y comunicacion
   privada entre NestJS y FastAPI.

La seleccion del proveedor y el aprovisionamiento real pertenecen a las tareas DE-04 y DE-05.
Este documento define el contrato que debera respetar cualquier plataforma elegida.

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
https://<dominio-publico>
    ├── /*       ─────> Angular estatico
    └── /api/*   ─────> NestJS publico ─────> FastAPI privado
                                  │
                                  └──────────> Turso/libSQL remoto
```

El router de la plataforma debe retirar el prefijo `/api` antes de reenviar la peticion a
NestJS. Por ejemplo, `/api/health` en el dominio publico llega como `/health` al proceso
NestJS. FastAPI no debe publicar puerto, ruta ni dominio accesible desde Internet.

Servir frontend y API desde un unico origen simplifica las cookies seguras, CORS y la
proteccion CSRF. Si la plataforma elegida obliga a usar un subdominio de API, se deberan
adaptar la URL de Angular y la politica de cookies antes del despliegue.

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
- API: `http://localhost:3000/health`
- Solver: `http://localhost:8001/health`
- Base local: `.data/academia-espronceda.db`

La base local usa una URL `file:` compatible con `@libsql/client`. No necesita Docker, un
daemon ni credenciales de Turso. La dependencia de persistencia se incorporara en PR-01.

## Construccion y ejecucion de produccion

La plataforma debe instalar dependencias reproducibles, construir una unica revision y
desplegar sus tres salidas:

```bash
npm ci
npm run setup:solver
npm run check
npm run build
```

Salidas y procesos:

- Angular: contenido estatico optimizado de `apps/web/dist/web/browser`.
- NestJS: `npm run start:prod:api`.
- FastAPI: `npm run start:prod:solver`, solo en la red privada.

Las variables de `.env.production.example` se configuran en el gestor de variables y secretos
de la plataforma. No se copia ese archivo como `.env` en el servidor y no se hornea ningun
secreto dentro de la imagen o del bundle de Angular.

NestJS y FastAPI fallan al arrancar cuando detectan una configuracion de produccion insegura o
incompleta. Entre otras garantias, produccion exige HTTPS para los origenes CORS, Turso remoto,
cookie `Secure` con prefijo `__Host-`, proxy de confianza y longitudes minimas para los
secretos.

## Variables

| Variable                 | Desarrollo                  | Produccion                            | Consumidor      |
| ------------------------ | --------------------------- | ------------------------------------- | --------------- |
| `NODE_ENV`               | `development`               | `production`                          | NestJS, FastAPI |
| `WEB_HOST`               | `127.0.0.1`                 | No aplica al bundle estatico          | Arranque local  |
| `WEB_PORT`               | `4200`                      | Gestionado por el hosting             | Arranque local  |
| `API_HOST`               | `127.0.0.1`                 | `0.0.0.0` o interfaz privada asignada | NestJS          |
| `API_PORT`               | `3000`                      | Puerto asignado/interno               | NestJS          |
| `API_CORS_ORIGINS`       | Origenes locales explicitos | `https://<dominio-publico>`           | NestJS          |
| `SOLVER_HOST`            | `127.0.0.1`                 | Interfaz de red privada               | FastAPI         |
| `SOLVER_PORT`            | `8001`                      | Puerto interno                        | FastAPI         |
| `SOLVER_URL`             | `http://127.0.0.1:8001`     | URL interna, nunca publica            | NestJS          |
| `DATABASE_URL`           | `file:./.data/...`          | `libsql://...turso.io`                | NestJS          |
| `DATABASE_AUTH_TOKEN`    | Vacio                       | Secreto de Turso                      | NestJS          |
| `JWT_SECRET`             | Marcador local conocido     | Secreto aleatorio de 64+ caracteres   | NestJS          |
| `INTERNAL_SERVICE_TOKEN` | Marcador local conocido     | Secreto aleatorio de 32+ caracteres   | NestJS, FastAPI |
| `AUTH_COOKIE_NAME`       | `academia_session`          | `__Host-academia_session`             | NestJS          |
| `COOKIE_SECURE`          | `false`                     | `true`                                | NestJS          |
| `TRUST_PROXY`            | `false`                     | `true`                                | NestJS          |

`API_CORS_ORIGINS` acepta una lista separada por comas, sin rutas ni comodines. En produccion
todos los origenes deben usar HTTPS.

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

1. Configurar el dominio y sus registros DNS en la plataforma elegida.
2. Activar certificado TLS valido y redireccion permanente de HTTP a HTTPS.
3. Enrutar `/api/*` a NestJS retirando `/api`.
4. Servir Angular con fallback a `index.html` para sus rutas de cliente.
5. Mantener FastAPI sin acceso publico.
6. Establecer `API_CORS_ORIGINS` al origen HTTPS exacto.
7. Ejecutar smoke tests sobre web, `/api/health` y el flujo NestJS-FastAPI.

No se debe considerar listo el entorno si el dominio funciona por HTTP, FastAPI es publico o
la API acepta `*` en CORS.
