# Solver

Servicio Python/FastAPI que alojará el motor de generación de horarios.

Desde la raíz del repositorio:

```bash
npm run setup:solver
npm run dev:solver
```

La comprobación de salud queda disponible en `GET http://localhost:8001/health`.

`POST /v1/schedules/solve` acepta el contrato interno v1. Requiere el token de servicio
(`Authorization: Bearer …`) y no accede a la base de datos. Los límites de tiempo fuera de
política se rechazan con HTTP 422. El motor busca primero un horario estrictamente válido con
OR-Tools CP-SAT; `INFEASIBLE` y `UNKNOWN` son resultados normales con HTTP 200.
