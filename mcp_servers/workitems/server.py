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

import base64
import json
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server.mcpserver import MCPServer

# Initialize MCP Server
app = MCPServer("autotriage-workitems")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKLOG_FILE = BASE_DIR / "knowledge" / "workitems" / "jira_ado_backlog.json"
ENV_FILE = BASE_DIR / ".env"

WORK_ITEMS: List[Dict[str, Any]] = []


def _load_env() -> Dict[str, str]:
    """Loads environment variables from root .env if not already in os.environ."""
    env = dict(os.environ)
    if ENV_FILE.exists():
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env.setdefault(k.strip(), v.strip())
    return env


def _create_jira_issue_live(
    title: str,
    description: str,
    repro_steps: str,
    priority: str,
    env: Dict[str, str],
) -> Optional[Dict[str, Any]]:
    """Creates a real issue in Atlassian Jira Cloud via REST API v3."""
    base_url = env.get("JIRA_BASE_URL", "").rstrip("/")
    email = env.get("JIRA_USER_EMAIL", "")
    token = env.get("JIRA_API_TOKEN", "")
    project_key = env.get("JIRA_PROJECT_KEY", "SCRUM")

    if not (base_url and email and token):
        return None

    try:
        auth = base64.b64encode(f"{email}:{token}".encode()).decode()
        url = f"{base_url}/rest/api/3/issue"

        payload = {
            "fields": {
                "project": {"key": project_key},
                "summary": title[:255],
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": description}],
                        },
                        {
                            "type": "heading",
                            "attrs": {"level": 3},
                            "content": [{"type": "text", "text": "Reproduction Steps"}],
                        },
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": repro_steps}],
                        },
                    ],
                },
                "issuetype": {"name": "Task"},
            }
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            key = data.get("key")
            return {
                "key": key,
                "url": f"{base_url}/browse/{key}",
            }
    except Exception as e:
        # Graceful fallback: log and return None without blocking local triage
        print(f"[WorkItems MCP] Live Jira creation notice: {e}")
        return None


def _create_ado_work_item_live(
    title: str,
    description: str,
    repro_steps: str,
    priority: str,
    env: Dict[str, str],
) -> Optional[Dict[str, Any]]:
    """Creates a real Bug in Microsoft Azure DevOps via REST API v7."""
    org = env.get("AZURE_DEVOPS_ORG", "")
    project = env.get("AZURE_DEVOPS_PROJECT", "AutoTriage")
    pat = env.get("AZURE_DEVOPS_PAT", "")

    if not (org and project and pat):
        return None

    try:
        auth = base64.b64encode(f":{pat}".encode()).decode()
        url = f"https://dev.azure.com/{org}/{project}/_apis/wit/workitems/%24Bug?api-version=7.0"

        patch = [
            {"op": "add", "path": "/fields/System.Title", "value": title[:255]},
            {
                "op": "add",
                "path": "/fields/Microsoft.VSTS.TCM.ReproSteps",
                "value": f"{description}<br><br><b>Reproduction Steps:</b><br>{repro_steps.replace(chr(10), '<br>')}",
            },
            {
                "op": "add",
                "path": "/fields/Microsoft.VSTS.Common.Priority",
                "value": 1 if priority.upper() in ["P0", "P1"] else 2,
            },
            {
                "op": "add",
                "path": "/fields/Microsoft.VSTS.Common.Severity",
                "value": "1 - Critical" if priority.upper() in ["P0", "P1"] else "2 - High",
            },
        ]

        req = urllib.request.Request(
            url,
            data=json.dumps(patch).encode("utf-8"),
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/json-patch+json",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            item_id = data.get("id")
            html_url = data.get("_links", {}).get("html", {}).get("href")
            return {
                "id": str(item_id),
                "url": html_url or f"https://dev.azure.com/{org}/{project}/_workitems/edit/{item_id}",
            }
    except Exception as e:
        print(f"[WorkItems MCP] Live Azure DevOps creation notice: {e}")
        return None


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

    # Dispatch to live Jira Cloud & Azure DevOps if configured
    env = _load_env()
    jira_info = _create_jira_issue_live(title.strip(), description.strip(), repro_steps.strip(), priority, env)
    if jira_info:
        new_bug["jira_key"] = jira_info["key"]
        new_bug["jira_url"] = jira_info["url"]

    ado_info = _create_ado_work_item_live(title.strip(), description.strip(), repro_steps.strip(), priority, env)
    if ado_info:
        new_bug["ado_id"] = ado_info["id"]
        new_bug["ado_url"] = ado_info["url"]

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
