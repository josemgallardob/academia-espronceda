# Academia Espronceda API

API NestJS y capa de persistencia de la aplicación. La base de datos usa Drizzle
ORM sobre libSQL: un fichero SQLite compatible en desarrollo y pruebas, y Turso
en producción.

## Base de datos

La fuente del modelo relacional está en
`src/database/schema/index.ts`. Las migraciones generadas y versionadas están en
`drizzle/`; no se editan manualmente.

Desde la raíz del repositorio:

```bash
npm run db:generate # genera una migración tras cambiar el esquema
npm run db:check    # comprueba la coherencia del historial
npm run db:migrate  # aplica las migraciones a DATABASE_URL
npm run db:studio   # abre el explorador gráfico local
```

`db:migrate` carga `.env.local` cuando existe. Sin configuración explícita usa
`.data/academia-espronceda.db`. En producción, `DATABASE_URL` y
`DATABASE_AUTH_TOKEN` deben apuntar a Turso según `docs/05-configuracion-entornos.md`.

La API no aplica migraciones durante el arranque. El despliegue debe ejecutar
`npm run db:migrate` antes de iniciar la nueva versión.

## Desarrollo y comprobaciones

```bash
npm run dev:api
npm run test:api
npm run lint:api
npm run build:api
```

Las pruebas de persistencia crean una base local aislada, aplican las migraciones
reales y comprueban repositorios, claves foráneas e invariantes relacionales.
