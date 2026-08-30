# Plataforma de despliegue

## Decision

La plataforma cerrada para el MVP es **Render**.

Turso sigue siendo la base de datos remota. No se despliega un motor SQL en Render.

Entornos:

1. `development`: el equipo local, sin Render.
2. `production`: un workspace Render en la region `frankfurt`, dominio HTTPS propio y
   Turso remoto.

No hay entorno de staging en el MVP. Un solo operador y dos profesores no justifican un
segundo cluster. Los preview environments de Render quedan fuera de alcance.

El aprovisionamiento real, las cuentas administrativas y el smoke en produccion pertenecen
a DE-05. Este documento cierra la eleccion y el contrato que DE-05 debe respetar.

El blueprint versionado es `render.yaml`.

## Comparacion

Criterios: origen HTTPS unico (cookies `__Host-`), FastAPI persistente y no publico,
despliegue desde `main` sin exigir PR, secretos fuera de Git, migraciones explicitas y
coste previsible para una academia pequena.

| Opcion | Origen unico | Solver privado y persistente | Operacion | Coste mensual esperado | Veredicto |
| ------ | ------------ | ---------------------------- | --------- | ---------------------- | --------- |
| Azure App Service | Posible con Front Door o un solo sitio | Si, con VNet | Ceremonia alta (AD, planes, red) | 40-90 EUR | Descartada para el MVP |
| Render | Si: un Web Service sirve Angular y NestJS | Private Service en la misma region | Git + blueprint | 30-45 EUR | **Elegida** |
| Railway | Si, con un proxy o un solo servicio publico | Red privada entre servicios | Simple, precio por uso | 15-40 EUR, variable | Reserva |
| Fly.io | Si, con una maquina publica | 6PN excelente | Mas `fly.toml` y pulido | 15-30 EUR | Reserva tecnica |
| Vercel u otro serverless | Frontend facil; API y solver no | El CP-SAT no encaja en funciones | Habría que partir el sistema | 20 EUR + otro host | Descartada |

Vercel (u otro FaaS) queda fuera: la generacion puede superar los limites de tiempo y
memoria, y FastAPI no debe apagarse entre peticiones.

Railway y Fly.io cumplen el contrato tecnico. Render gana porque ofrece Private Services
sin URL publica, TLS y dominio gestionados, secretos en el panel, `preDeployCommand` para
migrar, health checks y un precio fijo por instancia. Fly.io seria la alternativa si el
solver necesitara una VM dedicada mas adelante.

## Topologia de produccion

```text
https://<dominio-publico>          Render Web Service (frankfurt)
    ├── /*                         Angular estatico (NestJS lo sirve)
    └── /api/*, /health, /ready    NestJS
              │
              └── http://academia-espronceda-solver:8001
                    Render Private Service (misma region, sin URL publica)
              │
              └── libsql://<db>-<org>.turso.io
```

Un solo origen publico evita adaptar cookies, CORS y CSRF. NestJS escucha en `0.0.0.0` y
honra `PORT` o `API_PORT` (Render asigna `PORT`). FastAPI solo acepta trafico de la red
privada de Render; no recibe subdominio `onrender.com` ni certificado publico.

`SOLVER_URL` apunta al hostname interno del Private Service, por ejemplo
`http://academia-espronceda-solver:8001`. El token interno autentica la llamada; no
sustituye el aislamiento de red.

Health checks:

- Web Service: `GET /health` (liveness). `/ready` y `/metrics` siguen publicos en el
  mismo origen, como `/api/health` si se consulta desde fuera con el prefijo de Angular.
- Private Service: `GET /health` solo desde la red interna.

DE-05 debe hacer que NestJS sirva `apps/web/dist/web/browser` con fallback a `index.html`.
Hasta entonces el blueprint deja documentados build y start; no se considera desplegado.

## Secretos y variables

Los secretos viven en el Environment Group `academia-espronceda-production` de Render y
en el token de Turso. `render.yaml` marca esas claves con `sync: false` para que el panel
las pida y no queden en Git.

El Environment Group `academia-espronceda-production` se crea en el panel (DE-05) y
se referencia desde el blueprint. Claves:

| Clave | Secreto | Notas |
| ----- | ------- | ----- |
| `DATABASE_URL` | No (si es libsql://) | URL Turso |
| `DATABASE_AUTH_TOKEN` | Si | Solo NestJS |
| `JWT_SECRET` | Si | 64+ caracteres |
| `INTERNAL_SERVICE_TOKEN` | Si | 32+ caracteres, identico en ambos servicios |
| `API_CORS_ORIGINS` | No | `https://<dominio-publico>` |
| `TEACHER_*_DISPLAY_NAME` | No | Opcional |

No se puede marcar `sync: false` dentro de un Environment Group del blueprint: los
secretos se pegan en el panel.

Valores no secretos que Render o el blueprint pueden fijar: `NODE_ENV=production`,
`API_HOST=0.0.0.0`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`,
`AUTH_COOKIE_NAME=__Host-academia_session`, `API_CORS_ORIGINS=https://<dominio-publico>`.

El listado completo sigue en [Configuracion de entornos y secretos](./05-configuracion-entornos.md).
`.env.production.example` es la plantilla para rellenar el Environment Group.

## Dominio y HTTPS

1. Registrar o reutilizar un dominio de la academia.
2. Apuntar el DNS al Web Service (registros que indique Render).
3. Activar TLS gestionado y redireccion HTTP → HTTPS.
4. Poner `API_CORS_ORIGINS` al origen HTTPS exacto, sin ruta.
5. Dejar el subdominio `onrender.com` como respaldo o desactivarlo cuando el dominio
   propio responda.

No se abre produccion si el sitio solo funciona por HTTP, FastAPI es alcanzable desde
Internet o CORS admite `*`.

## Migraciones y datos

Orden en cada deploy del Web Service:

1. Build de Angular y NestJS.
2. `preDeployCommand`: `npm run db:migrate` contra Turso.
3. Arranque de NestJS.

El Private Service no toca la base. Tras el primer deploy (DE-05):

1. `npm run admin:create-users` (interactivo, fuera de CI).
2. `npm run seed:teachers`.
3. No ejecutar `seed:local` contra Turso.

Si una migracion falla, Render no sustituye la instancia anterior. No hay rollback
automatico de esquema: se corrige en `main` y se vuelve a desplegar.

## CI de despliegue

1. Push a `main` (no hace falta PR).
2. GitHub Actions `.github/workflows/ci.yml` ejecuta formato, contratos, lint, tests y
   build. El despliegue no debe continuar si ese job falla.
3. Render, conectado al mismo repositorio y a `main`, construye y publica cuando el
   check de CI esta en verde (`autoDeploy` del blueprint).
4. El Web Service migra y arranca; el Private Service arranca el solver.
5. Smoke minimo: `https://<dominio>/health`, `https://<dominio>/ready` y una llamada
   autenticada de generacion (DE-05).

No hay workflow de GitHub que despliegue por SSH ni que imprima secretos. Render es el
desplegador; GitHub es la puerta de calidad.

Antes de una entrega, `workflow_dispatch` con `include_extended` reserva los recorridos
Playwright. La suite Firefox/WebKit sigue fuera del deploy ordinario.

## Costes esperados

Cifras orientativas en USD de las instancias Render actuales; el cobro final depende del
tipo de cambio y del trafico.

| Concepto | Plan | Precio de lista | Motivo |
| -------- | ---- | --------------- | ------ |
| Web Service (Angular + NestJS) | Starter, 0.5 CPU / 512 MB | 7 USD/mes | Dos usuarios concurrentes, API ligera |
| Private Service (solver) | Standard, 1 CPU / 2 GB | 25 USD/mes | CP-SAT necesita RAM; 512 MB es justo |
| Ancho de banda | Incluido en el plan Hobby/Pro | 0 USD en el volumen de la academia | |
| Turso | Free / Developer | 0-29 USD/mes | El volumen del MVP cabe en el tramo gratuito |
| Dominio | DNS propio | ~10-15 EUR/ano | |

**Total esperado: unos 32 USD/mes de compute** (cerca de 30-45 EUR) mas el dominio. Si
el solver se queda corto de memoria, el siguiente escalon es Pro (4 GB, 85 USD) o
cambiar el Private Service a Fly.io sin tocar Turso ni el contrato de cookies.

No se usan discos persistentes en Render: la verdad esta en Turso.

## Lo que DE-05 debe hacer

1. Crear el workspace Render y aplicar `render.yaml`.
2. Rellenar el Environment Group y el dominio.
3. Servir el bundle de Angular desde NestJS.
4. Confirmar Node 24 y Python 3.14 en el runtime; si Render no los ofrece, anadir
   Dockerfiles sin cambiar la topologia.
5. Migrar, crear las dos cuentas, sembrar profesores y ejecutar el smoke.
