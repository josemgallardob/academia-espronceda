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
puede dormir entre sesiones y apagarse el resto del año. Serverless va activado en
ambos servicios; Hobby solo durante la campana.

El blueprint versionado es `.railway/railway.ts`. La operacion y la recuperacion estan
en la seccion final de este documento.

## Comparacion

Criterios: origen HTTPS unico (cookies `__Host-`), FastAPI no publico, despliegue desde
`stable` (checkpoint de produccion; `main` sigue para evolutivos), secretos fuera de Git,
migraciones explicitas, coste alineado con uso esporadico y que el solver no se duerma a
mitad de una generacion.

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

`SOLVER_URL` se construye desde `RAILWAY_PRIVATE_DOMAIN` y `PORT` del solver. El token
interno autentica la llamada; no sustituye el aislamiento de red. El cliente
`@libsql/client` usa HTTP por peticion contra Turso: no deja un socket abierto que
impida el sueno.

Health checks:

- Web: `GET /health` (liveness). No usar `/ready` como sonda de plataforma: pega a Turso
  y al solver y los mantiene despiertos.
- Solver: `GET /health` solo desde la red interna o la sonda de Railway.

NestJS sirve `apps/web/dist/web/browser` con fallback a `index.html` para las rutas de
Angular (`/login`, `/personas`, `/horario`). Las rutas `/api/*`, `/health`, `/ready` y
`/metrics` siguen en NestJS.

Las imagenes son `Dockerfile.web` (Node 24.16.0) y `Dockerfile.solver` (Python 3.14.2).
Railway las selecciona con `RAILWAY_DOCKERFILE_PATH`.

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
`SOLVER_HOST=0.0.0.0`, `RAILWAY_DOCKERFILE_PATH`. NestJS y FastAPI escuchan el `PORT`
que inyecta Railway.

`SOLVER_URL` se interpola en `.railway/railway.ts` como
`http://${solver.env.RAILWAY_PRIVATE_DOMAIN}:${solver.env.PORT}`. Si el plan no acepta
esa referencia, dejarla en el panel con la misma forma
`http://${{academia-espronceda-solver.RAILWAY_PRIVATE_DOMAIN}}:${{academia-espronceda-solver.PORT}}`.

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
2. Start: `npm run db:migrate:prod` contra Turso y despues NestJS. El migrador compilado
   no necesita `drizzle-kit` en la imagen de produccion. Turso es publico; la migracion
   no usa la red privada de Railway.
3. Arranque de NestJS, que exige el bundle de Angular o falla al arrancar.

El solver no toca la base. Tras el primer deploy:

1. Desde un equipo con `.env.local` apuntando a Turso (nunca en Git):
   `npm run admin:create-users`.
2. `npm run seed:teachers`.
3. No ejecutar `seed:local` contra Turso.

Si una migracion falla, el proceso no llega a escuchar. No hay rollback automatico de
esquema: se corrige en `stable` (o se promociona un arreglo desde `main`) y se vuelve a
desplegar.

## CI de despliegue

1. Promocionar a `stable` el commit que debe salir a produccion (no cada push a `main`).
2. GitHub Actions `.github/workflows/ci.yml` ejecuta formato, contratos, lint, tests y
   build en `main` y en `stable`. El despliegue no debe continuar si el check de `stable`
   falla.
3. Railway, conectado al mismo repositorio y a `stable`, espera el check de CI y publica.
4. El servicio web migra y arranca; el solver arranca FastAPI.
5. Smoke minimo: `PRODUCTION_BASE_URL=https://<dominio> npm run smoke:production` y una
   sesion autenticada de generacion.

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
mientras arranca el contenedor. NestJS reintenta la llamada al solver ante fallos de
red y 502 de pasarela (1s, 2s, 4s y 8s). No reintenta un timeout de solve ni un
`503 SOLVER_BUSY`. La primera generacion del dia puede tardar unos segundos extra.

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

## Operacion del MVP

1. Crear el proyecto Railway en `europe-west4`, plan Hobby, y `railway link`.
2. Aplicar `.railway/railway.ts` (`railway config plan` y `railway config apply`).
3. Rellenar `preserve()`: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `JWT_SECRET`,
   `INTERNAL_SERVICE_TOKEN` (el mismo valor en web y solver) y `API_CORS_ORIGINS`.
4. En el solver: desactivar el dominio publico, Serverless activado, tope de RAM ~2 GB,
   health check `GET /health`.
5. En el web: Serverless activado, health check `GET /health` (nunca `/ready`),
   esperar el check de CI de `stable` antes de publicar, adjuntar el dominio HTTPS.
6. Confirmar `SOLVER_URL` al hostname privado y `PORT` del solver.
7. Primer deploy desde `stable`. El contenedor web migra y arranca; el solver arranca
   FastAPI.
8. Crear las dos cuentas con `npm run admin:create-users` y sembrar profesores con
   `npm run seed:teachers` contra Turso, desde un equipo local.
9. `PRODUCTION_BASE_URL=https://<dominio> npm run smoke:production`.
10. Recorrer login, personas, horario manual y generacion automatica en el navegador.

Campana: activar Hobby en agosto. Al terminar, bajar a Free o cancelar la suscripcion.
Hobby cobra 5 USD/mes aunque no haya compute.

## Recuperacion basica

| Sintoma | Que hacer |
| ------- | --------- |
| Deploy rojo | Leer el log de build. Si CI de `stable` fallo, no publicar. Corregir y promocionar a `stable`. |
| Migracion falla | El proceso web no llega a escuchar. Corregir SQL, llevarlo a `stable` y redesplegar. No hay rollback automatico de esquema. |
| `/health` 502 o timeout en frio | Esperar el arranque Serverless y repetir. Si persiste, el contenedor no arranca: logs de Railway. |
| `/ready` con `database=error` | Token o URL de Turso. NestJS no debe seguir en el balanceador. |
| `/ready` con `solver=error` | Solver dormido o sin red privada. Login y personas siguen. Lanzar una generacion o `GET` interno a `/health` del solver. |
| `502 SOLVER_UNAVAILABLE` | Red privada, `SOLVER_URL`, token interno identico y RAM del solver. Revisar `solver.cold_start_retry` en logs. |
| `503 GENERATION_BUSY` | Hay un solve en curso. Esperar; no relanzar en bucle. |
| Login imposible | `API_CORS_ORIGINS` debe ser el origen HTTPS exacto. Cookie `__Host-` exige HTTPS y `Path=/`. |
| Angular en blanco | Bundle ausente: el start deberia haber fallado. Si `/login` no es HTML, NestJS no esta sirviendo `dist/web/browser`. |
| Dominio propio no resuelve | DNS del servicio web y TLS de Railway. No abrir HTTP. |
| Coste alto fuera de campana | Apagar Serverless no basta: bajar Hobby a Free. |

El diagnostico detallado de autenticacion y del solver esta en
[Diagnostico operativo](./07-diagnostico-operativo.md).
