# Canvas Workflow — Agent Instructions

This project uses Obsidian Canvas files as visual task boards. A Python CLI tool manages all board modifications.

## CRITICAL RULE

**NEVER edit `.canvas` files directly.** All canvas modifications MUST go through the CLI tool:

```bash
python canvas-tool.py "<file>.canvas" <command> [args]
```

Direct JSON editing of `.canvas` files is **forbidden**. The CLI tool enforces workflow rules (valid transitions, cycle detection, blocked states) so you don't have to remember them.

## CRITICAL: Git workflow

Agents **must** follow [GIT.md](./GIT.md). Summary:

- One branch per functional group (prefix `XX` of `XX-NN`). Name: `feature/{short-descriptive-name}` in kebab-case, **3–4 words max**. Infer the branch from the group's task descriptions and existing `feature/*` names (e.g. SC tasks about validator, daily view, drag-and-drop → `feature/manual-scheduling`). Never work on `main`.
- After tests pass, **commit and push on that branch while the card is still orange**, then `finish` (orange → cyan). Commit message: `feat: short description of what this task did`.
- When the last approved task of that prefix is completed (none left red/orange/gray), open **one PR to `main`**. Do not merge it.

No commit, push, or `finish` if tests are red. Full rules, commands, and prohibitions: [GIT.md](./GIT.md).

## Session Protocol

### 1. Start of session — read the board

```bash
python canvas-tool.py "Project.canvas" status
```

Review the board state. Run `normalize` if needed. Report ready tasks, blocked tasks, and any anomalies to the user.

### 2. Pick a task

```bash
python canvas-tool.py "Project.canvas" ready            # see what's available
python canvas-tool.py "Project.canvas" show <TASK-ID>    # read task details
python canvas-tool.py "Project.canvas" start <TASK-ID>   # begin work (red → orange)
```

If multiple tasks are ready, ask the user which to prioritize.

### 3. Work on the task

Execute the task. If you discover subtasks, propose them:

```bash
python canvas-tool.py "Project.canvas" propose Development "Subtask title" "Description" --depends-on DV-01
```

Update notes on your in-progress task:

```bash
python canvas-tool.py "Project.canvas" edit <TASK-ID> "Updated description with findings."
```

### 4. Finish the task

After tests pass, commit (`feat: short description`) and push on the group's `feature/…` branch while the card is still orange. Then:

```bash
python canvas-tool.py "Project.canvas" finish <TASK-ID>   # orange → cyan
```

If this was the last approved task of the prefix, open one PR to `main`. Tell the user what was done. Do NOT attempt to set the card green — only the human does that. See [GIT.md](./GIT.md).

### 5. Repeat

After the human marks your task green, check for newly unblocked tasks:

```bash
python canvas-tool.py "Project.canvas" normalize
python canvas-tool.py "Project.canvas" ready
```

## What you CAN do

- **Read** the board: `status`, `show`, `list`, `blocked`, `blocking`, `ready`, `dump`
- **Normalize** the board: `normalize`
- **Propose** tasks: `propose` or `batch` (creates purple cards)
- **Propose** groups: `propose-group` or `batch`
- **Start** a task: `start <ID>` (red → orange)
- **Finish** a task: `finish <ID>` (orange → cyan)
- **Pause** a task: `pause <ID>` (orange → red)
- **Edit** task text: `edit <ID> "<text>"` (only orange tasks)
- **Add dependencies**: `add-dep <FROM> <TO>`

## What you CANNOT do

- Edit `.canvas` files directly
- Mark any card green (done) — human only
- Work on purple cards (proposals awaiting approval)
- Work on gray cards (blocked)
- Work on cyan cards (awaiting human review)
- Remove cards or edges
- Change green cards

## CLI Quick Reference

### Read-only commands
| Command | Description |
|---------|-------------|
| `status` | Board overview |
| `show <ID>` | Task detail with dependencies |
| `list [STATE\|GROUP]` | List tasks (filtered) |
| `blocked` | Gray tasks and blockers |
| `blocking` | Tasks that block others |
| `ready` | Red tasks with deps met |
| `dump` | Raw JSON |

### Lifecycle commands
| Command | Transition |
|---------|-----------|
| `start <ID>` | Red → Orange |
| `finish <ID>` | Orange → Cyan |
| `pause <ID>` | Orange → Red |

### Proposal commands
| Command | Description |
|---------|-------------|
| `propose <GROUP> "<TITLE>" "<DESC>" [--depends-on ID ...]` | Add task |
| `propose-group "<LABEL>"` | Add group |
| `batch` | Bulk-add from JSON on stdin |

### Other commands
| Command | Description |
|---------|-------------|
| `edit <ID> "<TEXT>"` | Update text (orange only) |
| `add-dep <FROM> <TO>` | Add dependency |
| `normalize` | Assign IDs, fix blocked states |

## Color meanings

| Color | Meaning |
|-------|---------|
| 🟣 Purple | Proposed by agent |
| 🔴 Red | To Do (ready) |
| 🟠 Orange | Doing |
| 🔵 Cyan | Ready to review |
| 🟢 Green | Done |
| ⬜ Gray | Blocked |
