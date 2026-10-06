"""
mcp_servers/notify/server.py - FastMCP Notification & Team Alerting Server
=========================================================================
Delivers triage results and critical alerts to Slack and Microsoft Teams.
Supports:
1. Dual-mode execution (local audit logging + live webhook delivery)
2. Slack Block Kit message formatting with severity color badges
3. Microsoft Teams Adaptive Cards v1.5 with actionable links
4. Notification history inspection for automated evals
"""

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.mcpserver import MCPServer

app = MCPServer("autotriage-notify")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
LOG_FILE = DATA_DIR / "notifications.jsonl"

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")
TEAMS_WEBHOOK_URL = os.getenv("TEAMS_WEBHOOK_URL")


def record_notification(payload: Dict[str, Any]) -> None:
    """Appends sent notification to local audit log."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload["timestamp"] = time.time()
    payload["formatted_time"] = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(payload) + "\n")


@app.tool()
def post_slack_alert(
    channel: str,
    title: str,
    priority: str,
    message: str,
    fields: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Sends a structured Slack notification with severity color-coding and key-value fields.
    Args:
        channel: Slack channel or handle (e.g. '#alerts-triage', '#eng-checkout').
        title: Alert headline.
        priority: Priority level ('P0', 'P1', 'P2', 'P3').
        message: Main body or triage rationale.
        fields: Optional dictionary of key-value pairs (e.g. {'Ticket': 'BUG-301', 'PRD': 'PRD-001'}).
    """
    p_upper = priority.upper()
    color_map = {
        "P0": "#E01E5A",  # Red
        "P1": "#ECB22E",  # Orange / Yellow
        "P2": "#2EB67D",  # Green
        "P3": "#36C5F0",  # Blue
    }
    color = color_map.get(p_upper, "#4A154B")

    # Construct Slack Block Kit payload
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"[{p_upper}] {title}", "emoji": True},
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": message},
        },
    ]

    if fields:
        field_elements = [
            {"type": "mrkdwn", "text": f"*{k}:*\n{v}"} for k, v in fields.items()
        ]
        blocks.append({"type": "section", "fields": field_elements})

    slack_payload = {
        "channel": channel,
        "attachments": [{"color": color, "blocks": blocks}],
    }

    delivered_live = False
    if SLACK_WEBHOOK_URL:
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.post(SLACK_WEBHOOK_URL, json=slack_payload)
                delivered_live = (res.status_code == 200)
        except Exception:
            delivered_live = False

    record_notification({
        "platform": "slack",
        "channel": channel,
        "title": title,
        "priority": p_upper,
        "message": message,
        "fields": fields or {},
        "delivered_live": delivered_live,
    })

    return {
        "success": True,
        "platform": "slack",
        "channel": channel,
        "delivered_live": delivered_live,
        "message": f"Slack alert posted to {channel}.",
    }


@app.tool()
def post_teams_card(
    title: str,
    subtitle: str,
    summary: str,
    facts: Optional[Dict[str, str]] = None,
    actions: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Sends a Microsoft Teams Adaptive Card v1.5 with metadata facts and action buttons.
    Args:
        title: Card title.
        subtitle: Subtitle or component area.
        summary: Executive summary of the triage verdict.
        facts: Optional dictionary of facts displayed in a table.
        actions: Optional list of action button definitions [{'title': 'View Jira', 'url': '...'}]
    """
    teams_facts = [{"title": k, "value": v} for k, v in (facts or {}).items()]

    card_content: Dict[str, Any] = {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.5",
        "body": [
            {"type": "TextBlock", "size": "Medium", "weight": "Bolder", "text": title},
            {"type": "TextBlock", "spacing": "None", "text": subtitle, "isSubtle": True},
            {"type": "TextBlock", "text": summary, "wrap": True},
        ],
    }

    if teams_facts:
        card_content["body"].append({"type": "FactSet", "facts": teams_facts})

    if actions:
        card_content["actions"] = [
            {"type": "Action.OpenUrl", "title": a["title"], "url": a["url"]} for a in actions
        ]

    teams_payload = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": card_content,
            }
        ],
    }

    delivered_live = False
    if TEAMS_WEBHOOK_URL:
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.post(TEAMS_WEBHOOK_URL, json=teams_payload)
                delivered_live = (res.status_code in (200, 202))
        except Exception:
            delivered_live = False

    record_notification({
        "platform": "teams",
        "title": title,
        "subtitle": subtitle,
        "summary": summary,
        "facts": facts or {},
        "delivered_live": delivered_live,
    })

    return {
        "success": True,
        "platform": "teams",
        "delivered_live": delivered_live,
        "message": "Teams Adaptive Card dispatched.",
    }


@app.tool()
def get_notification_history(limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieves the most recent notifications sent by AutoTriage."""
    if not LOG_FILE.exists():
        return []
    records = []
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records[-limit:]


@app.tool()
def clear_notification_history() -> Dict[str, Any]:
    """Clears the notification audit log."""
    if LOG_FILE.exists():
        LOG_FILE.unlink()
    return {"success": True, "message": "Notification log cleared."}


if __name__ == "__main__":
    app.run()
