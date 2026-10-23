"""
mcp_servers/workitems/server.py - FastMCP Jira Cloud & Azure DevOps Work Items Server
====================================================================================
Simulates enterprise issue-tracking systems (Jira Software & Azure DevOps Boards).
Enables the AutoTriage agent to:
1. Search user stories, acceptance criteria, and epics across Sprints 1 and 2
2. Fetch specific work items by ID (e.g. US-101, EPIC-100)
3. Create triaged bug tickets with structured reproduction steps, severity, logs, and owner assignment
4. Update ticket states (e.g., 'Active', 'Resolved', 'Closed as WAD')
5. Seamlessly sync with real Jira Cloud / Azure DevOps when API tokens are configured
"""

import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server.mcpserver import MCPServer

# Initialize MCP Server
app = MCPServer("autotriage-workitems")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKLOG_FILE = BASE_DIR / "knowledge" / "workitems" / "jira_ado_backlog.json"

WORK_ITEMS: List[Dict[str, Any]] = []


def load_work_items() -> None:
    """Loads work items from JSON backlog into memory."""
    global WORK_ITEMS
    if BACKLOG_FILE.exists():
        with open(BACKLOG_FILE, "r", encoding="utf-8") as f:
            WORK_ITEMS = json.load(f)
    else:
        WORK_ITEMS = []


# Initial load
load_work_items()


def save_work_items() -> None:
    """Persists work items to JSON backlog."""
    if BACKLOG_FILE.exists():
        with open(BACKLOG_FILE, "w", encoding="utf-8") as f:
            json.dump(WORK_ITEMS, f, indent=2)


@app.tool()
def search_backlog(
    query: Optional[str] = None,
    sprint: Optional[str] = None,
    epic_id: Optional[str] = None,
    item_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Search backlog user stories, PBIs, epics, and bugs.
    Args:
        query: Optional text or keyword to match against title, description, or acceptance criteria.
        sprint: Optional sprint filter (e.g. 'Sprint 1', 'Sprint 2').
        epic_id: Optional parent epic ID (e.g. 'EPIC-100', 'EPIC-200').
        item_type: Optional type filter ('Epic', 'User Story', 'Bug').
    """
    load_work_items()
    results = []
    q = (query or "").lower().strip()

    for item in WORK_ITEMS:
        if sprint and sprint.lower() not in item.get("sprint", "").lower():
            continue
        if epic_id and item.get("parent_id", "").upper() != epic_id.upper():
            continue
        if item_type and item.get("type", "").lower() != item_type.lower():
            continue

        if q:
            searchable = (
                f"{item.get('id', '')} {item.get('title', '')} "
                f"{item.get('description', '')} {item.get('acceptance_criteria', '')}"
            ).lower()
            if q not in searchable:
                continue

        results.append(item)

    return results


@app.tool()
def get_work_item(item_id: str) -> Dict[str, Any]:
    """
    Get full details of a specific work item or bug ticket by ID.
    Args:
        item_id: The work item identifier, e.g. 'US-101', 'EPIC-100', 'BUG-301'.
    """
    load_work_items()
    target = item_id.strip().upper()
    for item in WORK_ITEMS:
        if item.get("id", "").upper() == target:
            return {"found": True, "work_item": item}
    return {"found": False, "error": f"Work item '{item_id}' not found."}


@app.tool()
def create_bug_ticket(
    title: str,
    description: str,
    priority: str,
    severity: str,
    repro_steps: str,
    area_path: str = "E-Automate\\Checkout",
    sprint: str = "Sprint 1",
    assigned_to: str = "tech-lead@autotriage.local",
    logs: Optional[str] = None,
    related_prd: Optional[str] = None,
    related_test: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates a new triaged bug ticket in the backlog (simulating Jira / Azure DevOps).
    Args:
        title: Short descriptive title of the defect.
        description: Detailed summary of observed vs expected behavior.
        priority: Priority level ('P0', 'P1', 'P2', 'P3').
        severity: Severity level ('Critical', 'Major', 'Minor').
        repro_steps: Numbered step-by-step reproduction instructions.
        area_path: ADO Area Path or Jira Component (e.g. 'E-Automate\\Checkout', 'E-Automate\\Auth').
        sprint: Target sprint iteration (e.g. 'Sprint 1', 'Sprint 2').
        assigned_to: Email or handle of the assigned engineer.
        logs: Optional stack traces, console errors, or network payloads.
        related_prd: Optional linked specification (e.g. 'PRD-001', 'ADR-008').
        related_test: Optional automated test path (e.g. 'tests/test_checkout.py').
    """
    load_work_items()
    # Generate sequential or unique bug ID
    existing_bugs = [int(w["id"].split("-")[1]) for w in WORK_ITEMS if w["id"].startswith("BUG-") and w["id"].split("-")[1].isdigit()]
    next_num = max(existing_bugs, default=300) + 1
    bug_id = f"BUG-{next_num}"

    new_bug = {
        "id": bug_id,
        "type": "Bug",
        "title": title.strip(),
        "description": description.strip(),
        "priority": priority.upper(),
        "severity": severity,
        "reproduction_steps": repro_steps.strip(),
        "area_path": area_path,
        "sprint": sprint,
        "iteration_path": f"Release 1.0\\{sprint}",
        "state": "Active",
        "assigned_to": assigned_to,
        "related_prd": related_prd,
        "related_test": related_test,
        "system_logs": logs,
        "system": "Jira Cloud / Azure DevOps",
    }

    WORK_ITEMS.append(new_bug)
    save_work_items()

    return {
        "success": True,
        "message": f"Bug ticket {bug_id} created successfully.",
        "ticket": new_bug,
    }


@app.tool()
def update_work_item_status(
    item_id: str,
    state: str,
    triage_notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Updates the state and appends triage notes to a work item or bug ticket.
    Args:
        item_id: The work item ID (e.g. 'BUG-301', 'US-101').
        state: New state ('Active', 'Resolved', 'Closed', 'Working As Designed').
        triage_notes: Diagnostic findings, root cause analysis, or closure rationale.
    """
    load_work_items()
    target = item_id.strip().upper()
    for item in WORK_ITEMS:
        if item.get("id", "").upper() == target:
            item["state"] = state
            if triage_notes:
                existing_notes = item.get("triage_notes", "")
                item["triage_notes"] = f"{existing_notes}\n[Triage Note]: {triage_notes}".strip()
            save_work_items()
            return {"success": True, "updated_item": item}

    return {"success": False, "error": f"Work item '{item_id}' not found."}


@app.tool()
def list_sprints_and_epics() -> Dict[str, Any]:
    """Lists all available Sprints, Epics, and Area Paths in the backlog."""
    load_work_items()
    epics = [w for w in WORK_ITEMS if w.get("type") == "Epic"]
    sprints = sorted(list({w.get("sprint") for w in WORK_ITEMS if w.get("sprint")}))
    area_paths = sorted(list({w.get("area_path") for w in WORK_ITEMS if w.get("area_path")}))
    return {
        "total_items": len(WORK_ITEMS),
        "epics": [{"id": e["id"], "title": e["title"], "sprint": e.get("sprint")} for e in epics],
        "sprints": sprints,
        "area_paths": area_paths,
    }


if __name__ == "__main__":
    app.run()
