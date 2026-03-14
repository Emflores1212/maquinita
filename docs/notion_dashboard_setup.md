# Maquinita Notion Dashboard Setup

This guide implements the ADHD-friendly dashboard plan using:
- `scripts/setup_notion_dashboard.py` for structure + seed via Notion API
- 10-15 minutes of manual UI setup for linked views/templates

## 1) Prerequisites

1. Create a Notion integration at https://www.notion.so/my-integrations
2. Copy your internal integration token.
3. Open the parent Notion page where you want this dashboard.
4. Share that page with your integration (`Share` -> invite integration).

## 2) Run the bootstrap script

From repo root (`/Users/edgarmflores/maquinita`):

```bash
export NOTION_API_KEY="secret_..."
export NOTION_PARENT_PAGE_ID="paste-page-id-or-full-notion-url"

python3 scripts/setup_notion_dashboard.py
```

Optional:

```bash
# Pick explicit sprint label
python3 scripts/setup_notion_dashboard.py --sprint "2026-S1"

# Use existing parent page directly as HQ (no new "Maquinita HQ" page)
python3 scripts/setup_notion_dashboard.py --no-create-hq

# Create structure only (no seed tasks)
python3 scripts/setup_notion_dashboard.py --no-seed
```

## 3) What the script creates

1. `Maquinita HQ` page (unless `--no-create-hq`)
2. `Work Board` database with these properties:
- `Nombre` (Title)
- `Proyecto` (Select)
- `Area` (Select)
- `Estado` (Select)
- `Prioridad` (Select)
- `Sprint` (Select)
- `Fecha foco` (Date)
- `Fecha límite` (Date)
- `Esfuerzo` (Number)
- `Tipo` (Select)
- `Hoy` (Checkbox)
- `Progreso` (Formula)
- `Parent item` relation (best effort)
3. Seed data:
- 6 epics
- 18 tasks
- Subtasks (up to 5 per task)

## 4) Manual UI setup (required)

Notion API still has limitations around advanced linked views/templates. Do this in UI:

### A) Build page sections in `Maquinita HQ`

Create these sections top-down:
1. `Top 3 de Hoy`
2. `Sprint actual`
3. `Bloqueos`
4. `Progreso del sprint`
5. `Done esta semana`
6. `Inbox rápido`

### B) Create linked database views from `Work Board`

Use `/linked` and select `Work Board`.

1. `Inbox` (List/Table)
- Filter: `Estado` = `Inbox`

2. `Plan Sprint` (Table)
- Filter: `Sprint` = current sprint (example `2026-S1`)
- Filter: `Estado` is not `Done`
- Filter: `Tipo` is `Epic` or `Task`

3. `Execution Board` (Board)
- Filter: `Sprint` = current sprint
- Filter: `Tipo` is not `Subtask`
- Group by: `Estado`

4. `Subtasks Focus` (List)
- Filter: `Tipo` = `Subtask`
- Filter: `Estado` is not `Done`
- Sort: `Fecha foco` ascending

5. `Calendar` (Calendar)
- Filter: `Estado` is not `Done`
- Date property: `Fecha límite`

6. `Wins` (List)
- Filter: `Estado` = `Done`
- Sort: `Last edited time` descending

### C) Create 3 database templates

1. `Nueva tarea rápida`
- Defaults:
  - `Estado` = `Inbox`
  - `Tipo` = `Task`
  - `Prioridad` = `P1`
  - `Proyecto` = `Maquinita`

2. `Epic (con desglose)`
- Defaults:
  - `Tipo` = `Epic`
  - `Estado` = `Next`
  - `Esfuerzo` = `5`
- Add checklist in template body:
  - Definir objetivo del epic
  - Crear 3-5 tareas
  - Dividir tareas grandes en max 5 subtareas
  - Asignar sprint y prioridad

3. `Subtarea enfocada`
- Defaults:
  - `Tipo` = `Subtask`
  - `Estado` = `Next`
  - `Esfuerzo` = `1` o `2`
- Add body note: "Objetivo: 25-60 minutos"

## 5) ADHD operating rules (daily cadence)

1. Keep max 3 tasks with `Hoy = true` each day.
2. If `Esfuerzo >= 4`, split into subtasks.
3. Max 5 subtasks per task/epic.
4. New incoming ideas go to `Inbox`, not to active board.

## 6) Validation checklist

1. Create 3 quick tasks in under 2 minutes from `Inbox rápido`.
2. Confirm only 3 tasks are marked `Hoy=true`.
3. Move one item to `Blocked` and verify it appears in `Bloqueos`.
4. Move one item to `Done` and confirm `Wins` updates.
5. Confirm sprint board reflects progress by status.
