# Plataforma de despliegue

## Decision

La plataforma cerrada para el MVP es **Railway**.

Turso sigue siendo la base de datos remota. No se despliega un motor SQL en Railway.

Entornos:

1. `development`: el equipo local, sin Railway.
2. `production`: un proyecto Railway en la region `europe-west4`, dominio HTTPS propio y
   Turso remoto.

No hay entorno de staging en el MVP. Un solo operador y dos profesores no justifican un
segundo cluster. Los entornos de preview de Railway quedan fuera de alcance.

El uso es estacional: sobre todo al inicio de curso y pocas veces al dia. El compute
puede dormir entre sesiones y apagarse el resto del año. DE-05 activa Serverless en
ambos servicios y deja Hobby solo durante la campana.

El aprovisionamiento real, las cuentas administrativas y el smoke en produccion pertenecen
a DE-05. Este documento cierra la eleccion y el contrato que DE-05 debe respetar.

El blueprint versionado es `.railway/railway.ts`.

## Comparacion

Criterios: origen HTTPS unico (cookies `__Host-`), FastAPI no publico, despliegue desde
`main` sin exigir PR, secretos fuera de Git, migraciones explicitas, coste alineado con
uso esporadico y que el solver no se duerma a mitad de una generacion.

| Opcion | Origen unico | Solver privado | Operacion | Coste esperado | Veredicto |
| ------ | ------------ | -------------- | --------- | -------------- | --------- |
| Azure App Service | Posible con Front Door o un solo sitio | Si, con VNet | Ceremonia alta (AD, planes, red) | 40-90 EUR/mes | Descartada para el MVP |
| Render | Si: un Web Service sirve Angular y NestJS | Private Service | Git + blueprint, precio por instancia | ~32 USD el mes encendido; 0 si se suspende | Reserva |
| Railway | Si: un servicio publico sirve Angular y NestJS | Red privada `.railway.internal` | Git + IaC, precio por minuto | ~5 USD el mes de campana con Hobby y Serverless | **Elegida** |
| Fly.io | Si, con una maquina publica | 6PN excelente | Mas `fly.toml` y pulido | 15-30 EUR/mes o por segundo | Reserva tecnica |
| Vercel u otro serverless | Frontend facil; API y solver no | El CP-SAT no encaja en funciones | Habría que partir el sistema | 20 EUR + otro host | Descartada |

Vercel (u otro FaaS) queda fuera: la generacion puede superar los limites de tiempo y
memoria de una funcion, y FastAPI no debe cortarse a mitad de un solve.

Render cumple el contrato tecnico y cobra 0 si los servicios estan suspendidos. Railway
gana porque el Serverless nativo duerme a los 5-10 minutos sin trafico, el solver puede
despertar por red privada, y Hobby incluye 5 USD de compute. Con pocas sesiones en
septiembre el suelo es la cuota de Hobby, no dos instancias fijas. Fly.io seria la
alternativa si el solver necesitara una VM dedicada mas adelante.

## Topologia de produccion

```text
https://<dominio-publico>          Railway service academia-espronceda-web
    ├── /*                         Angular estatico (NestJS lo sirve)
    └── /api/*, /health, /ready    NestJS
              │
              └── http://<solver.RAILWAY_PRIVATE_DOMAIN>:8001
                    Railway service academia-espronceda-solver
                    (sin dominio publico)
              │
              └── libsql://<db>-<org>.turso.io
```

Un solo origen publico evita adaptar cookies, CORS y CSRF. NestJS escucha en `0.0.0.0` y
honra `PORT` o `API_PORT` (Railway asigna `PORT`). FastAPI solo acepta trafico de la red
privada del proyecto; no recibe dominio `up.railway.app` ni certificado publico.

`SOLVER_URL` apunta al hostname privado del solver en el puerto 8001. El token interno
autentica la llamada; no sustituye el aislamiento de red. El cliente `@libsql/client` usa
HTTP por peticion contra Turso: no deja un socket abierto que impida el sueno.

Health checks:

- Web: `GET /health` (liveness). No usar `/ready` como sonda de plataforma: pega a Turso
  y al solver y los mantiene despiertos.
- Solver: `GET /health` solo desde la red interna o la sonda de Railway.

DE-05 debe hacer que NestJS sirva `apps/web/dist/web/browser` con fallback a `index.html`.
Hasta entonces el blueprint deja documentados build y start; no se considera desplegado.

## Secretos y variables

Los secretos viven en las variables del proyecto Railway y en el token de Turso.
`.railway/railway.ts` marca esas claves con `preserve()` para que el plan no las pise ni
las escriba en Git.

Claves:

| Clave | Secreto | Notas |
| ----- | ------- | ----- |
| `DATABASE_URL` | No (si es libsql://) | URL Turso; solo NestJS |
| `DATABASE_AUTH_TOKEN` | Si | Solo NestJS |
| `JWT_SECRET` | Si | 64+ caracteres |
| `INTERNAL_SERVICE_TOKEN` | Si | 32+ caracteres, identico en ambos servicios |
| `API_CORS_ORIGINS` | No | `https://<dominio-publico>` |
| `TEACHER_*_DISPLAY_NAME` | No | Opcional |

Valores no secretos que el blueprint fija: `NODE_ENV=production`, `API_HOST=0.0.0.0`,
`COOKIE_SECURE=true`, `TRUST_PROXY=true`, `AUTH_COOKIE_NAME=__Host-academia_session`,
`SOLVER_HOST=0.0.0.0`, `SOLVER_PORT=8001`.

`SOLVER_URL` se construye desde `RAILWAY_PRIVATE_DOMAIN` del solver. Si el plan no acepta
la interpolacion, DE-05 la deja en el panel como
`http://${{academia-espronceda-solver.RAILWAY_PRIVATE_DOMAIN}}:8001`.

El listado completo sigue en [Configuracion de entornos y secretos](./05-configuracion-entornos.md).
`.env.production.example` es la plantilla para rellenar las variables de Railway.

## Dominio y HTTPS

1. Registrar o reutilizar un dominio de la academia.
2. Adjuntarlo al servicio `academia-espronceda-web` (registros que indique Railway).
3. Activar TLS gestionado y redireccion HTTP → HTTPS.
4. Poner `API_CORS_ORIGINS` al origen HTTPS exacto, sin ruta.
5. Dejar el dominio `up.railway.app` como respaldo o desactivarlo cuando el dominio
   propio responda.

No se abre produccion si el sitio solo funciona por HTTP, FastAPI es alcanzable desde
Internet o CORS admite `*`.

## Migraciones y datos

Orden en cada deploy del servicio web:

1. Build de Angular y NestJS.
2. Start: `npm run db:migrate` contra Turso y despues NestJS. La red privada de Railway
   no existe en el build; Turso es publico y la migracion no la necesita.
3. Arranque de NestJS.

El solver no toca la base. Tras el primer deploy (DE-05):

1. `npm run admin:create-users` (interactivo, fuera de CI).
2. `npm run seed:teachers`.
3. No ejecutar `seed:local` contra Turso.

Si una migracion falla, el proceso no llega a escuchar. No hay rollback automatico de
esquema: se corrige en `main` y se vuelve a desplegar.

## CI de despliegue

1. Push a `main` (no hace falta PR).
2. GitHub Actions `.github/workflows/ci.yml` ejecuta formato, contratos, lint, tests y
   build. El despliegue no debe continuar si ese job falla.
3. Railway, conectado al mismo repositorio y a `main`, espera el check de CI y publica.
4. El servicio web migra y arranca; el solver arranca FastAPI.
5. Smoke minimo: `https://<dominio>/health`, `https://<dominio>/ready` y una llamada
   autenticada de generacion (DE-05).

No hay workflow de GitHub que despliegue por SSH ni que imprima secretos. Railway es el
desplegador; GitHub es la puerta de calidad.

Antes de una entrega, `workflow_dispatch` con `include_extended` reserva los recorridos
Playwright. La suite Firefox/WebKit sigue fuera del deploy ordinario.

## Sueno, despertar y campana

Railway Serverless duerme un servicio a los 5-10 minutos sin trafico de salida y lo
despierta el primer request, tambien por red privada.

El cliente de Turso no mantiene una conexion persistente (`libsql://` va por HTTPS y
cierra el stream en cada query). `/health` no toca la base. El riesgo de no dormir es
una sonda de plataforma en `/ready` o health checks demasiado frecuentes.

El primer request tras el sueno puede tardar y, en frio, Railway puede devolver 502
mientras arranca el contenedor. DE-05 debe reintentar el cliente NestJS→solver unos
segundos o aceptar ese fallo puntual en la primera generacion del dia.

Fuera de campana: bajar Hobby a Free o cancelar la suscripcion. Hobby cobra 5 USD/mes
aunque no haya compute. Render sigue como reserva si se prefiere suspender instancias
sin cuota de plan.

## Costes esperados

Cifras orientativas en USD; el cobro final depende del tipo de cambio, del tiempo
encendido y de si Hobby sigue activo fuera de septiembre.

| Concepto | Plan | Precio | Motivo |
| -------- | ---- | ------ | ------ |
| Cuota Hobby | Suelo mensual | 5 USD/mes mientras el plan este activo | Incluye 5 USD de compute |
| Web (Angular + NestJS) | RAM/CPU por minuto | Cubierto por Hobby si duerme | API ligera |
| Solver | ~2 GB RAM mientras corre | Cubierto por Hobby si duerme; ~20 USD/mes si queda 24/7 | CP-SAT; 512 MB es justo |
| Ancho de banda | Egreso 0.05 USD/GB | ~0 en el volumen de la academia | Trafico interno no cuenta |
| Turso | Free / Developer | 0-29 USD/mes | El volumen del MVP cabe en el tramo gratuito |
| Dominio | DNS propio | ~10-15 EUR/ano | |

**Total esperado en campana: 5 USD el mes** si Serverless funciona y Hobby se cancela
despues. Si NestJS o el solver se quedan arriba todo septiembre, la RAM del solver
puede acercar la factura a 25-35 USD ese mes. Doce meses de Hobby olvidado son 60 USD.

No se usan volumenes persistentes en Railway: la verdad esta en Turso.

## Lo que DE-05 debe hacer

1. Crear el proyecto Railway, enlazar el repositorio y aplicar `.railway/railway.ts`.
2. Rellenar secretos, `API_CORS_ORIGINS` y el dominio del servicio web.
3. Confirmar `SOLVER_URL` al hostname privado y puerto 8001.
4. Activar Serverless en ambos servicios. Health check solo en `/health`.
5. Esperar el check de CI de `main` antes de publicar.
6. Asignar ~2 GB de RAM al solver.
7. Servir el bundle de Angular desde NestJS.
8. Confirmar Node 24 y Python 3.14 en el runtime; si Railway no los ofrece, anadir
   Dockerfiles sin cambiar la topologia.
9. Migrar, crear las dos cuentas, sembrar profesores y ejecutar el smoke.
10. Documentar encender Hobby en agosto y bajarlo a Free al terminar la campana.
