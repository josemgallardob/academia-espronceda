# Flujo Git obligatorio para agentes

Estas reglas son de **cumplimiento obligatorio**. No hay excepciones salvo instrucción
explícita del humano en el mismo turno. Complementan el protocolo de canvas de
[AGENTS.md](./AGENTS.md); no lo sustituyen.

## Principio

Cada grupo funcional tiene **una sola rama**. El grupo lo determina el prefijo `XX` del
identificador de tarea en Obsidian (`XX-NN`).

El nombre de la rama **no** es el prefijo. Es un nombre breve descriptivo del área, derivado
de las tareas del grupo. El agente debe ser capaz de reconocer a qué rama pertenece un área
funcional leyendo las descripciones de esas tareas y comparándolas con los nombres de ramas
`feature/*` existentes.

Todas las tareas del mismo prefijo se implementan, commitean y pushean en esa rama.
Nunca se trabaja en `main`. Nunca se mezclan dos prefijos en la misma rama.

## Convención de rama

Formato: `feature/{nombre-breve-descriptivo}`

- Prefijo literal `feature/`.
- El nombre: **3 o 4 palabras como máximo**, en kebab-case, en inglés.
- Describe el área funcional del grupo, no una tarea suelta.
- Se crea **una vez**, desde `main` actualizado, la primera vez que se trabaja ese prefijo.
- Se reutiliza para el resto de tareas `XX-NN` de ese prefijo.

Ejemplos válidos (ilustrativos, no una tabla fija):

| Grupo (tareas) | Rama |
| -------------- | ---- |
| `SC-*` validador, comandos de horario, vista diaria, drag and drop | `feature/manual-scheduling` |
| `SO-*` contrato FastAPI, CP-SAT, integración NestJS | `feature/schedule-solver` |
| `DE-*` fixtures, Playwright, despliegue MVP | `feature/mvp-delivery` |

Ejemplos inválidos: `feat/sc`, `feature/SC`, `feature/sc-02`, `feature/implement-deterministic-global-validator`, `cursor/…`.

## Cómo saber qué rama usar

Antes de crear o cambiar de rama, el agente **reconstruye el mapeo** grupo → rama:

1. Leer el tablero: `list` / `show` de las tareas con el mismo prefijo `XX`.
2. Extraer el tema común de títulos y descripciones (el área funcional).
3. Listar ramas `feature/*` locales y remotas (`git branch -a`, PRs abiertos).
4. Elegir la rama cuyo nombre descriptivo **encaja con ese tema**.
   - Si hay una coincidencia clara → usarla. No crear otra.
   - Si no hay ninguna → crearla desde `main` con 3–4 palabras que resuman el área.

```bash
git fetch origin
git branch -a --list 'feature/*'
git checkout main
git pull origin main
git checkout -b feature/manual-scheduling          # solo si no existe
# o, si ya existe:
git checkout feature/manual-scheduling
git pull origin feature/manual-scheduling
```

Si hay duda entre dos nombres, reutilizar la rama ya existente. Nunca abrir una segunda
rama para el mismo prefijo `XX`.

## Ciclo por tarea (obligatorio)

El trabajo ocurre con la tarjeta en **naranja**. El commit y el push se hacen **antes** de
pasar la tarjeta a cian.

1. Identificar el prefijo `XX`, leer las tareas del grupo y situarse en su rama `feature/…`.
2. `python3 canvas-tool.py "Project.canvas" start <TASK-ID>` (rojo → naranja).
3. Implementar la tarea.
4. Verificar con tests que no se ha roto nada:
   - Mínimo: `npm test`
   - Si el cambio toca lint, formato, contratos o build: `npm run check`
   - Si el cambio es de UI: verificar el flujo en el navegador además de los tests.
5. Si los tests fallan: **no** commit, **no** push, **no** `finish`. Corregir y repetir.
6. Si los tests pasan, con la tarjeta **aún en naranja**: commit y push en la rama del grupo.
7. `python3 canvas-tool.py "Project.canvas" finish <TASK-ID>` (naranja → cian).
8. Si esa tarea era la **última pendiente del grupo**, abrir un PR contra `main`.

### Commit por tarea

Un commit por tarea completada. El mensaje **empieza siempre por `feat:`** y sigue un
resumen corto de lo hecho en esa tarea. Sin ID de tarea, sin alcance entre paréntesis.

```bash
git add <archivos de la tarea>
git commit -m "$(cat <<'EOF'
feat: add deterministic global schedule validator

EOF
)"
git push -u origin HEAD
```

Correcto: `feat: add daily teacher schedule view`  
Incorrecto: `feat(SC-02): …`, `SC-02 add validator`, `feat: SC-02 implement deterministic global validator`

Incluir en el commit los cambios de `Project.canvas` de esa tarea. No incluir
`.obsidian/workspace.json`, `.env`, secretos ni artefactos locales (`.data/`, `.venv`).

## Última tarea del grupo → PR a `main`

Tras el commit y push de una tarea, el grupo está cerrado si **no queda ninguna tarea
aprobada del mismo prefijo** en rojo, naranja o gris.

- No esperar a que el humano ponga las tarjetas en verde.
- No esperar a propuestas moradas (`propose`); no están aprobadas.
- Tarjetas ya verdes o cianes del mismo prefijo no impiden el PR.

Si esta era la última, abrir **un** PR de la rama `feature/…` del grupo hacia `main`:

```bash
git push -u origin HEAD
gh pr create --title "feat: manual scheduling" --body "$(cat <<'EOF'
## Summary
- Completa el grupo funcional de horarios manuales (tareas `SC-02` … `SC-06`).

## Test plan
- [ ] `npm test` en verde
- [ ] Flujos afectados revisados

EOF
)"
```

Si ya existe un PR abierto para esa rama, **no crear otro**: el push actualiza el existente.
No fusionar el PR. No pushear a `main`. No marcar tarjetas en verde.

## Qué está prohibido

- Commit, push o `finish` sin tests en verde.
- Commit o push en `main`.
- Una rama por tarea (`feature/sc-02`, `cursor/…-task-…`). El grano es el **grupo**, no la tarea.
- Prefijar la rama con `feat/` o con el código `XX` (`feat/sc`, `feature/SC`).
- Nombres de rama de más de 4 palabras.
- Mezclar prefijos distintos en la misma rama.
- Abrir el PR antes de terminar todas las tareas **aprobadas** del prefijo.
- Abrir un segundo PR para la misma rama.
- Mensajes de commit que no empiecen por `feat:`.
- Incluir secretos, `.env`, `.obsidian/workspace.json` o basura local.

## Arranque de sesión

Antes de tocar código:

1. Leer el tablero (`status` / `ready`).
2. Identificar el prefijo `XX` de la tarea elegida y leer las descripciones del grupo.
3. Localizar o crear la rama `feature/{nombre-breve}` que describe esa área.
4. Solo entonces hacer `start` y trabajar.
