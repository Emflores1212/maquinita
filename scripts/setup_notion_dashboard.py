#!/usr/bin/env python3
"""
Bootstrap a Notion dashboard for Maquinita.

What this script creates:
1) A "Maquinita HQ" page (optional) under a parent Notion page.
2) A "Work Board" database with ADHD-friendly properties.
3) Seed data: epics, tasks, and subtasks for Maquinita.
4) Optional helper blocks in HQ with setup guidance for manual views/templates.

Usage:
  python3 scripts/setup_notion_dashboard.py \
    --parent-page-id "<NOTION_PAGE_ID_OR_URL>" \
    --token "$NOTION_API_KEY"
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


AREAS = [
    ("Backend", "blue"),
    ("Operator Dashboard", "green"),
    ("Kiosk UI", "orange"),
    ("Maquinita UI", "purple"),
    ("Edge/Hardware", "pink"),
    ("Infra/DevOps", "gray"),
]

ESTADOS = [
    ("Inbox", "gray"),
    ("Next", "blue"),
    ("In Progress", "yellow"),
    ("Blocked", "red"),
    ("Done", "green"),
]

PRIORIDADES = [("P0", "red"), ("P1", "orange"), ("P2", "yellow")]
TIPOS = [("Epic", "purple"), ("Task", "blue"), ("Subtask", "gray")]


@dataclass
class SeedTask:
    name: str
    effort: int
    priority: str
    subtasks: List[str]


@dataclass
class SeedEpic:
    name: str
    area: str
    priority: str
    tasks: List[SeedTask]


SEED_BLUEPRINT: List[SeedEpic] = [
    SeedEpic(
        name="API core estable",
        area="Backend",
        priority="P0",
        tasks=[
            SeedTask(
                name="Normalizar endpoints de máquinas y productos",
                effort=4,
                priority="P0",
                subtasks=[
                    "Definir contrato final de /machines y /products",
                    "Alinear schemas Pydantic con respuestas reales",
                    "Agregar manejo de errores consistente",
                    "Documentar ejemplos de request/response",
                ],
            ),
            SeedTask(
                name="Cerrar flujo unlock con validaciones de estado",
                effort=3,
                priority="P0",
                subtasks=[
                    "Validar máquina offline y door state antes de unlock",
                    "Agregar eventos WS para cambios de puerta",
                    "Agregar pruebas de happy path y error path",
                ],
            ),
            SeedTask(
                name="Hardening de healthcheck y observabilidad básica",
                effort=2,
                priority="P1",
                subtasks=[
                    "Estandarizar payload de /health",
                    "Agregar logging mínimo para errores API",
                ],
            ),
        ],
    ),
    SeedEpic(
        name="Flujo kiosk compra/checkout",
        area="Kiosk UI",
        priority="P0",
        tasks=[
            SeedTask(
                name="Conectar pantallas Idle/Menu/Shopping/Checkout",
                effort=4,
                priority="P0",
                subtasks=[
                    "Validar navegación entre estados de compra",
                    "Asegurar persistencia del carrito en store",
                    "Manejar retorno seguro a Idle tras timeout",
                ],
            ),
            SeedTask(
                name="Manejo de errores UX en checkout",
                effort=3,
                priority="P1",
                subtasks=[
                    "Mostrar fallas de red sin romper flujo",
                    "Agregar estado de reintento de pago",
                    "Definir copy corto y claro por error",
                ],
            ),
            SeedTask(
                name="Polish visual básico para kiosko",
                effort=2,
                priority="P2",
                subtasks=[
                    "Ajustar jerarquía tipográfica",
                    "Revisar spacing para touch targets",
                ],
            ),
        ],
    ),
    SeedEpic(
        name="Operator dashboard inventario y alertas",
        area="Operator Dashboard",
        priority="P0",
        tasks=[
            SeedTask(
                name="Consolidar vista inventario en tiempo real",
                effort=4,
                priority="P0",
                subtasks=[
                    "Validar fuentes de datos en RealtimeInventoryDashboard",
                    "Corregir edge cases de stock negativo",
                    "Priorizar alertas críticas visibles en primer fold",
                ],
            ),
            SeedTask(
                name="Definir flujo de alertas de fraude",
                effort=3,
                priority="P1",
                subtasks=[
                    "Mapear payload esperado desde backend/vision",
                    "Crear vista de revisión de alertas pendientes",
                    "Definir acciones operador: revisar, descartar, escalar",
                ],
            ),
            SeedTask(
                name="QA de permisos y auth en rutas sensibles",
                effort=3,
                priority="P1",
                subtasks=[
                    "Validar guards en páginas de settings y financials",
                    "Probar escenarios sin permisos",
                ],
            ),
        ],
    ),
    SeedEpic(
        name="Integración visión y sensor fusion",
        area="Edge/Hardware",
        priority="P1",
        tasks=[
            SeedTask(
                name="Definir contrato de datos RFID + cámara",
                effort=4,
                priority="P1",
                subtasks=[
                    "Normalizar IDs de ítems entre sensores",
                    "Ajustar endpoint /vision/verify-taking",
                    "Definir umbral de discrepancia y acciones",
                ],
            ),
            SeedTask(
                name="Pipeline de pruebas en scripts POC",
                effort=3,
                priority="P1",
                subtasks=[
                    "Crear checklist de pruebas de camera/rfid/solenoid",
                    "Registrar resultados por corrida",
                ],
            ),
            SeedTask(
                name="Especificar criterios de fraude para operador",
                effort=2,
                priority="P2",
                subtasks=[
                    "Definir nivel warning vs critical",
                    "Alinear mensaje para revisión de video",
                ],
            ),
        ],
    ),
    SeedEpic(
        name="UI maquinita base",
        area="Maquinita UI",
        priority="P1",
        tasks=[
            SeedTask(
                name="Revisar app shell y navegación base",
                effort=3,
                priority="P1",
                subtasks=[
                    "Validar estructura App.tsx y rutas base",
                    "Ajustar estilos base para consistencia",
                ],
            ),
            SeedTask(
                name="Definir componentes reutilizables mínimos",
                effort=3,
                priority="P2",
                subtasks=[
                    "Crear botones y tarjetas base",
                    "Establecer tokens de color/spacing",
                    "Documentar uso de componentes",
                ],
            ),
            SeedTask(
                name="Setup de calidad frontend",
                effort=2,
                priority="P2",
                subtasks=[
                    "Revisar reglas eslint para TS estricto",
                    "Asegurar scripts de build/dev funcionales",
                ],
            ),
        ],
    ),
    SeedEpic(
        name="Infra local + deploy básico",
        area="Infra/DevOps",
        priority="P1",
        tasks=[
            SeedTask(
                name="Estandarizar setup local multi-módulo",
                effort=4,
                priority="P1",
                subtasks=[
                    "Definir orden de arranque backend/kiosk/dashboard",
                    "Crear checklist de variables de entorno",
                    "Documentar troubleshooting común",
                ],
            ),
            SeedTask(
                name="Pipeline mínima de CI por módulo",
                effort=3,
                priority="P1",
                subtasks=[
                    "Ejecutar lint/build por frontend principal",
                    "Agregar checks básicos backend",
                ],
            ),
            SeedTask(
                name="Borrador de estrategia de deploy",
                effort=2,
                priority="P2",
                subtasks=[
                    "Decidir primer target de despliegue",
                    "Definir criterios de readiness v1",
                ],
            ),
        ],
    ),
]


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def normalize_notion_id(raw: str) -> str:
    """
    Accepts:
    - Plain UUID with/without dashes
    - Full Notion URL containing a 32-char hex id
    Returns a canonical dashed UUID string.
    """
    if not raw:
        raise ValueError("Empty Notion ID.")

    value = raw.strip()
    value = value.split("?")[0]

    hex_candidate = re.findall(r"[0-9a-fA-F]{32}", value.replace("-", ""))
    if hex_candidate:
        compact = hex_candidate[-1].lower()
    else:
        compact = value.replace("-", "").lower()

    if not re.fullmatch(r"[0-9a-f]{32}", compact):
        raise ValueError(
            f"Invalid Notion ID: {raw!r}. Provide page id or URL containing a 32-hex id."
        )

    return (
        f"{compact[0:8]}-{compact[8:12]}-{compact[12:16]}-"
        f"{compact[16:20]}-{compact[20:32]}"
    )


def notion_url_from_id(notion_id: str) -> str:
    return f"https://www.notion.so/{notion_id.replace('-', '')}"


def compute_sprint_label(today: Optional[dt.date] = None) -> str:
    now = today or dt.date.today()
    iso_year, iso_week, _ = now.isocalendar()
    sprint_num = ((iso_week - 1) // 2) + 1
    return f"{iso_year}-S{sprint_num}"


class NotionAPIError(RuntimeError):
    pass


class NotionClient:
    def __init__(self, token: str, dry_run: bool = False) -> None:
        self.token = token
        self.dry_run = dry_run

    def request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{API_BASE}{path}"
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        }

        if self.dry_run:
            print(f"[dry-run] {method} {url}")
            if payload is not None:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            return {}

        req = Request(url=url, data=body, headers=headers, method=method.upper())
        try:
            with urlopen(req) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except HTTPError as exc:
            raw_error = exc.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(raw_error)
            except json.JSONDecodeError:
                parsed = {"raw": raw_error}
            raise NotionAPIError(
                f"HTTP {exc.code} for {method} {path}: {json.dumps(parsed, ensure_ascii=False)}"
            ) from exc
        except URLError as exc:
            raise NotionAPIError(f"Network error for {method} {path}: {exc}") from exc


def rich_text(content: str) -> List[Dict[str, Any]]:
    return [{"type": "text", "text": {"content": content}}]


def title_text(content: str) -> List[Dict[str, Any]]:
    return [{"type": "text", "text": {"content": content}}]


def page_title_property(title: str) -> Dict[str, Any]:
    return {"title": title_text(title)}


def make_select_options(entries: Iterable[Tuple[str, str]]) -> List[Dict[str, str]]:
    return [{"name": name, "color": color} for name, color in entries]


def base_properties(sprint_label: str) -> Dict[str, Any]:
    return {
        "Nombre": {"title": {}},
        "Proyecto": {"select": {"options": [{"name": "Maquinita", "color": "blue"}]}},
        "Area": {"select": {"options": make_select_options(AREAS)}},
        "Estado": {"select": {"options": make_select_options(ESTADOS)}},
        "Prioridad": {"select": {"options": make_select_options(PRIORIDADES)}},
        "Sprint": {"select": {"options": [{"name": sprint_label, "color": "default"}]}},
        "Fecha foco": {"date": {}},
        "Fecha límite": {"date": {}},
        "Esfuerzo": {"number": {"format": "number"}},
        "Tipo": {"select": {"options": make_select_options(TIPOS)}},
        "Hoy": {"checkbox": {}},
        "Progreso": {
            "formula": {
                "expression": 'if(prop("Estado") == "Done", 100, if(prop("Estado") == "In Progress", 50, 0))'
            }
        },
    }


def create_page(client: NotionClient, parent_page_id: str, title: str, children: Optional[List[Dict[str, Any]]] = None) -> str:
    payload: Dict[str, Any] = {
        "parent": {"type": "page_id", "page_id": parent_page_id},
        "properties": {"title": page_title_property(title)},
    }
    if children:
        payload["children"] = children
    data = client.request("POST", "/pages", payload)
    return data.get("id", "")


def append_blocks(client: NotionClient, block_id: str, children: List[Dict[str, Any]]) -> None:
    payload = {"children": children}
    client.request("PATCH", f"/blocks/{block_id}/children", payload)


def build_hq_blocks(sprint_label: str) -> List[Dict[str, Any]]:
    rules = [
        "Toda tarea con Esfuerzo >= 4 se divide en subtareas.",
        "Máximo 5 subtareas por tarea.",
        "Máximo 3 tareas con Hoy = true por día.",
    ]
    views = [
        "Inbox -> Estado = Inbox",
        "Plan Sprint -> Sprint actual, Estado != Done, Tipo in (Epic, Task)",
        "Execution Board -> Sprint actual, Tipo != Subtask, agrupado por Estado",
        "Subtasks Focus -> Tipo = Subtask, Estado != Done, ordenado por Fecha foco",
        "Calendar -> Estado != Done por Fecha límite",
        "Wins -> Estado = Done, orden cronológico",
    ]
    sections = [
        "Top 3 de Hoy",
        "Sprint actual",
        "Bloqueos",
        "Progreso del sprint",
        "Done esta semana",
        "Inbox rápido",
    ]

    blocks: List[Dict[str, Any]] = [
        {
            "object": "block",
            "type": "heading_1",
            "heading_1": {"rich_text": rich_text("Maquinita HQ")},
        },
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": rich_text(
                    f"Sprint inicial sugerido: {sprint_label}. Este espacio está optimizado para foco ADHD-friendly."
                )
            },
        },
        {
            "object": "block",
            "type": "heading_2",
            "heading_2": {"rich_text": rich_text("Reglas de trabajo")},
        },
    ]
    blocks.extend(
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": rich_text(rule)}}
        for rule in rules
    )
    blocks.append(
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": rich_text("Secciones en esta página")}}
    )
    blocks.extend(
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": rich_text(name)}}
        for name in sections
    )
    blocks.append(
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": rich_text("Vistas que debes crear manualmente")}}
    )
    blocks.extend(
        {"object": "block", "type": "numbered_list_item", "numbered_list_item": {"rich_text": rich_text(view)}}
        for view in views
    )
    blocks.append(
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": rich_text(
                    "Nota: la API de Notion no soporta crear todas las vistas/templates avanzadas. Usa la guía en docs/notion_dashboard_setup.md para completarlo en 10-15 minutos."
                )
            },
        }
    )
    return blocks


def create_database(client: NotionClient, parent_page_id: str, sprint_label: str) -> Tuple[str, str]:
    title = [{"type": "text", "text": {"content": "Work Board"}}]
    payload = {
        "parent": {"type": "page_id", "page_id": parent_page_id},
        "title": title,
        "properties": base_properties(sprint_label),
    }
    data = client.request("POST", "/databases", payload)
    db_id = data.get("id", "")
    if client.dry_run and not db_id:
        db_id = "00000000-0000-0000-0000-000000000001"
    return db_id, data.get("url", notion_url_from_id(db_id))


def try_add_parent_relation(client: NotionClient, database_id: str) -> bool:
    """
    Best-effort self relation that can be used as "Parent item".
    """
    payload = {
        "properties": {
            "Parent item": {
                "relation": {
                    "database_id": database_id,
                    "single_property": {},
                }
            }
        }
    }
    try:
        client.request("PATCH", f"/databases/{database_id}", payload)
        return True
    except NotionAPIError as err:
        eprint(f"[warn] No se pudo crear relación 'Parent item': {err}")
        return False


def create_db_page(
    client: NotionClient,
    database_id: str,
    name: str,
    project: str,
    area: str,
    estado: str,
    prioridad: str,
    sprint: str,
    effort: int,
    tipo: str,
    hoy: bool = False,
    fecha_foco: Optional[str] = None,
    fecha_limite: Optional[str] = None,
    parent_rel_id: Optional[str] = None,
) -> str:
    props: Dict[str, Any] = {
        "Nombre": {"title": title_text(name)},
        "Proyecto": {"select": {"name": project}},
        "Area": {"select": {"name": area}},
        "Estado": {"select": {"name": estado}},
        "Prioridad": {"select": {"name": prioridad}},
        "Sprint": {"select": {"name": sprint}},
        "Esfuerzo": {"number": effort},
        "Tipo": {"select": {"name": tipo}},
        "Hoy": {"checkbox": hoy},
    }
    if fecha_foco:
        props["Fecha foco"] = {"date": {"start": fecha_foco}}
    if fecha_limite:
        props["Fecha límite"] = {"date": {"start": fecha_limite}}
    if parent_rel_id:
        props["Parent item"] = {"relation": [{"id": parent_rel_id}]}

    payload = {
        "parent": {"database_id": database_id},
        "properties": props,
    }
    data = client.request("POST", "/pages", payload)
    return data.get("id", "")


def plus_days(iso_date: str, days: int) -> str:
    date_obj = dt.date.fromisoformat(iso_date) + dt.timedelta(days=days)
    return date_obj.isoformat()


def seed_database(
    client: NotionClient,
    database_id: str,
    sprint_label: str,
    use_parent_relation: bool,
) -> Dict[str, int]:
    today = dt.date.today().isoformat()
    focus_slots = [today, plus_days(today, 1), plus_days(today, 2)]
    focus_idx = 0

    counts = {"epics": 0, "tasks": 0, "subtasks": 0}

    for epic in SEED_BLUEPRINT:
        epic_id = create_db_page(
            client=client,
            database_id=database_id,
            name=epic.name,
            project="Maquinita",
            area=epic.area,
            estado="Next",
            prioridad=epic.priority,
            sprint=sprint_label,
            effort=5,
            tipo="Epic",
        )
        counts["epics"] += 1

        for task in epic.tasks:
            is_focus = focus_idx < 3
            task_id = create_db_page(
                client=client,
                database_id=database_id,
                name=task.name,
                project="Maquinita",
                area=epic.area,
                estado="Next",
                prioridad=task.priority,
                sprint=sprint_label,
                effort=task.effort,
                tipo="Task",
                hoy=is_focus,
                fecha_foco=focus_slots[focus_idx] if is_focus else None,
                parent_rel_id=epic_id if use_parent_relation else None,
            )
            if is_focus:
                focus_idx += 1
            counts["tasks"] += 1

            for sub in task.subtasks[:5]:
                create_db_page(
                    client=client,
                    database_id=database_id,
                    name=sub,
                    project="Maquinita",
                    area=epic.area,
                    estado="Next",
                    prioridad=task.priority,
                    sprint=sprint_label,
                    effort=1 if task.effort <= 3 else 2,
                    tipo="Subtask",
                    parent_rel_id=task_id if use_parent_relation else None,
                )
                counts["subtasks"] += 1

    return counts


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create Maquinita Notion dashboard + seed.")
    parser.add_argument(
        "--token",
        default=os.getenv("NOTION_API_KEY", ""),
        help="Notion integration token. Defaults to env NOTION_API_KEY.",
    )
    parser.add_argument(
        "--parent-page-id",
        default=os.getenv("NOTION_PARENT_PAGE_ID", ""),
        help="Parent Notion page id or URL. Defaults to env NOTION_PARENT_PAGE_ID.",
    )
    parser.add_argument(
        "--sprint",
        default=compute_sprint_label(),
        help="Sprint label, e.g. 2026-S1. Default computed from current ISO week.",
    )
    parser.add_argument(
        "--hq-title",
        default="Maquinita HQ",
        help="Title for the HQ page when --no-create-hq is not set.",
    )
    parser.add_argument(
        "--no-create-hq",
        action="store_true",
        help="Use parent page directly instead of creating a new HQ page.",
    )
    parser.add_argument(
        "--no-seed",
        action="store_true",
        help="Create only the structure (page + database) without seed tasks.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print API payloads without sending requests.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    if not args.token and not args.dry_run:
        eprint("Missing --token (or env NOTION_API_KEY).")
        return 2
    if not args.parent_page_id:
        eprint("Missing --parent-page-id (or env NOTION_PARENT_PAGE_ID).")
        return 2

    try:
        parent_page_id = normalize_notion_id(args.parent_page_id)
    except ValueError as err:
        eprint(str(err))
        return 2

    client = NotionClient(token=args.token, dry_run=args.dry_run)

    try:
        hq_page_id = parent_page_id
        if not args.no_create_hq:
            hq_page_id = create_page(client, parent_page_id, args.hq_title)
            if args.dry_run and not hq_page_id:
                hq_page_id = parent_page_id
            if not args.dry_run and hq_page_id:
                append_blocks(client, hq_page_id, build_hq_blocks(args.sprint))

        db_id, db_url = create_database(client, hq_page_id, args.sprint)
        relation_ok = False
        if db_id and not args.dry_run:
            relation_ok = try_add_parent_relation(client, db_id)

        counts = {"epics": 0, "tasks": 0, "subtasks": 0}
        if not args.no_seed and db_id:
            counts = seed_database(
                client=client,
                database_id=db_id,
                sprint_label=args.sprint,
                use_parent_relation=relation_ok,
            )

        if args.dry_run:
            print("\nDry run complete.")
            return 0

        print("\nSetup complete.")
        if not args.no_create_hq and hq_page_id:
            print(f"- HQ page: {notion_url_from_id(hq_page_id)}")
        else:
            print(f"- HQ page (existing parent): {notion_url_from_id(parent_page_id)}")
        print(f"- Work Board DB: {db_url}")
        print(f"- Sprint: {args.sprint}")
        print("- Estado property type: Select")
        print(f"- Parent relation enabled: {'yes' if relation_ok else 'no'}")
        print(
            f"- Seed created: {counts['epics']} epics, {counts['tasks']} tasks, {counts['subtasks']} subtasks"
        )

        print("\nNext steps:")
        print("1) Open docs/notion_dashboard_setup.md and configure the 6 linked views.")
        print("2) Create 3 templates: Nueva tarea rápida, Epic (con desglose), Subtarea enfocada.")
        print("3) Keep max 3 tasks with Hoy=true each day.")
        return 0
    except NotionAPIError as err:
        eprint(f"Notion setup failed: {err}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
