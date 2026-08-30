# Academia Espronceda

Plataforma para automatizar la gestión académica y la generación de horarios semanales de
Academia Espronceda.

## Estructura

```text
apps/
├── web/       Frontend Angular
├── api/       API de aplicación NestJS
└── solver/    Motor de horarios Python/FastAPI
docs/          Documentación funcional y técnica
Project.canvas Backlog visual del proyecto
```

Los paquetes TypeScript se administran mediante `npm workspaces`. El servicio Python mantiene
su entorno virtual y sus dependencias de forma independiente.

## Requisitos

- Node.js 24.16.0
- npm 11.13.0
- Python 3.14.2

Las versiones esperadas también están declaradas en `.nvmrc`, `.python-version` y
`package.json`.

## Preparación

```bash
npm run setup
```

Este comando instala los paquetes JavaScript, crea `.venv` e instala el servicio solver con sus
dependencias de desarrollo.

## Desarrollo local

La configuracion local real vive en `.env.local`, que esta ignorado por Git. Para crearla a
partir de valores locales seguros y levantar todos los procesos:

```bash
cp .env.development.example .env.local
npm run dev
```

Servicios:

- Web: `http://localhost:4200`
- API: `http://localhost:3000`, salud en `GET /health`
- Solver: `http://localhost:8001`, salud en `GET /health`
- Base libSQL local: `.data/academia-espronceda.db`

Los procesos tambien pueden iniciarse por separado con `dev:web`, `dev:api` y `dev:solver`.

Para ver el horario en la interfaz (login, tres profesores y alumnos activos):

```bash
npm run db:migrate
npm run seed:local
```

Luego abre `http://localhost:4200/login`. En desarrollo el propio formulario muestra la cuenta
`profesor1` y un botón **Entrar y abrir Horario**. En Horario, crea un borrador vacío para
arrastrar alumnos, ver avisos y confirmar.

`seed:local` solo funciona contra la base `file:` de desarrollo. Alinea las dos cuentas
administrativas a `profesor1` / `profesor2` con las contraseñas de demostración, siembra el
catálogo de profesores y deja un conjunto de personas de ejemplo. Las etiquetas visibles de
los tres profesores se pueden definir en `.env.local`; el repositorio solo documenta
etiquetas genéricas.

En producción, tras migrar y crear las cuentas administrativas, carga solo el catálogo de
profesores con `npm run seed:teachers`. No crea alumnos ni toca usuarios.

## Produccion

El frontend se sirve bajo un dominio HTTPS publico; las peticiones a `/api` se enrutan a
NestJS y FastAPI permanece en una red privada. Produccion usa Turso remoto y secretos
inyectados por la plataforma, nunca archivos versionados.

El contrato completo de variables, topologia, arranque, dominio, TLS, CORS y manejo de secretos
esta en [Configuracion de entornos y secretos](./docs/05-configuracion-entornos.md).

## Contratos y reglas de horarios

Los contratos versionados entre Angular, NestJS y FastAPI, junto con el catalogo neutral de
reglas y preferencias, viven en `contracts/`. Su estructura, versionado y semantica se resumen en
[Contratos API y catalogo de reglas v1](./docs/06-contratos-y-catalogo-reglas.md).

## Comandos comunes

```bash
npm run format          # aplica el formato
npm run format:check    # comprueba el formato sin modificar
npm run lint            # analiza TypeScript, plantillas y Python
npm run test            # ejecuta las pruebas de los tres servicios
npm run build           # construye o valida los tres servicios
npm run check           # ejecuta todas las comprobaciones anteriores
```

Cada comando dispone además de variantes por servicio, por ejemplo `test:web`, `test:api` y
`test:solver`.

## Convenciones de idioma

Los textos visibles para los usuarios se escriben en español. El código, los identificadores,
los nombres de archivos, las configuraciones, las pruebas y los mensajes técnicos se escriben
en inglés con nombres descriptivos. Los comentarios se reservan para decisiones o invariantes
que el propio código no pueda expresar con claridad.

## Flujo de trabajo

El backlog se gestiona mediante `Project.canvas`. Sus tarjetas solo se modifican a través de
`canvas-tool.py`, siguiendo las reglas de [AGENTS.md](./AGENTS.md). El trabajo en Git (rama por
grupo funcional, commit/push por tarea y PR a `main`) es obligatorio y está definido en
[GIT.md](./GIT.md).
