"""
agent/src/autotriage/webhook_receiver.py - Azure Monitor Alert Webhook Receiver & Payload Normalizer
===================================================================================================
Receives incoming alerts in Azure Monitor Common Alert Schema, normalizes the payload,
correlates telemetry, and dispatches to the LangGraph AutoTriage incident remediation engine.
"""

import json
import logging
from typing import Any, Dict, Optional
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from agent.src.autotriage.graph.build import triage_ticket

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("autotriage-webhook")


def normalize_azure_alert(raw_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses Azure Monitor Common Alert Schema format and converts to an internal incident ticket.
    Supports both metric alerts, log analytics search alerts, and Smart Detection exceptions.
    """
    data = raw_payload.get("data", {})
    essentials = data.get("essentials", {})
    alert_context = data.get("alertContext", {})

    alert_id = essentials.get("alertId", "ALERT-UNKNOWN")
    alert_rule = essentials.get("alertRule", "HTTP 500 Failure Spike")
    severity = essentials.get("severity", "Sev1")
    target_resource = essentials.get("targetResource", "")
    description = essentials.get("description", "Automated alert detected from Azure Application Insights.")
    fired_date = essentials.get("firedDateTime", "")

    # Infer target environment
    env = "dev"
    lower_target = (target_resource + " " + alert_rule + " " + json.dumps(alert_context)).lower()
    if "prod" in lower_target:
        env = "prod"
    elif "qa" in lower_target:
        env = "qa"

    # Extract failing operation / search criteria if present
    operation_id = None
    if "condition" in alert_context:
        condition = alert_context.get("condition", {})
        window_size = condition.get("windowSize", "")
    else:
        condition = {}

    # Check for direct custom properties or search results
    search_results = alert_context.get("SearchResults", {})
    tables = search_results.get("tables", [])
    if tables and len(tables) > 0:
        rows = tables[0].get("rows", [])
        if rows and len(rows) > 0 and len(rows[0]) > 0:
            operation_id = str(rows[0][0])

    # Construct the normalized ticket structure
    body = (
        f"[Azure Monitor Incident {severity}]\n"
        f"Rule: {alert_rule}\n"
        f"Environment: {env.upper()}\n"
        f"Target Resource: {target_resource}\n"
        f"Description: {description}\n"
        f"Fired At: {fired_date}\n"
    )
    if operation_id:
        body += f"Correlated OperationId: {operation_id}\n"

    # Map alert rule to known failure flag if applicable
    active_flag = None
    if "discount" in alert_rule.lower() or "pricing" in alert_rule.lower():
        active_flag = "DEFECT_WRONG_DISCOUNT_MATH"
    elif "cart" in alert_rule.lower() or "inventory" in alert_rule.lower() or "stock" in alert_rule.lower():
        active_flag = "DEFECT_CART_ZERO_QUANTITY"
    elif "npe" in alert_rule.lower() or "order" in alert_rule.lower() or "checkout" in alert_rule.lower():
        active_flag = "DEFECT_ORDER_NPE_ADDRESS_LINE2"

    return {
        "ticket_id": f"AZ-ALERT-{alert_id.split('/')[-1][:8].upper() if '/' in alert_id else 'ALERT-101'}",
        "customer_email": "azure-monitor@alerts.azure.com",
        "subject": f"[{env.upper()}] {severity}: {alert_rule}",
        "body": body,
        "environment": env,
        "active_bug_flag": active_flag,
        "operation_id": operation_id,
        "severity": severity,
        "alert_rule": alert_rule,
        "raw_alert": raw_payload,
    }


async def health_endpoint(request: Request) -> JSONResponse:
    """Health check for Azure App Service / Container App probing."""
    return JSONResponse({
        "status": "healthy",
        "service": "AutoTriage Azure Monitor Webhook Receiver",
        "version": "1.0.0",
    })


async def receive_azure_alert_webhook(request: Request) -> JSONResponse:
    """
    POST /api/v1/alerts/azure-monitor
    Webhook endpoint wired into Azure Monitor Action Groups.
    """
    try:
        raw_payload = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"Invalid JSON payload: {str(e)}"}, status_code=400)

    # Validate Schema
    schema_id = raw_payload.get("schemaId")
    if schema_id != "azureMonitorCommonAlertSchema" and "data" not in raw_payload:
        logger.warning(f"Received non-standard schema: {schema_id}, attempting best-effort parsing.")

    # 1. Normalize
    ticket = normalize_azure_alert(raw_payload)
    logger.info(f"Normalized incoming Azure Alert: {ticket['ticket_id']} ({ticket['subject']})")

    # 2. Dispatch to LangGraph AutoTriage engine
    triage_result = triage_ticket(ticket)
    logger.info(f"Triage completed for {ticket['ticket_id']}: verdict={triage_result.get('classification')}, PR={triage_result.get('pr_url')}")

    return JSONResponse({
        "status": "PROCESSED",
        "ticket_id": ticket["ticket_id"],
        "classification": triage_result.get("classification"),
        "action_path": triage_result.get("action_path"),
        "created_work_item_id": triage_result.get("created_work_item_id"),
        "pr_url": triage_result.get("pr_url"),
        "pr_id": triage_result.get("pr_id"),
        "finops_receipt": triage_result.get("finops_receipt"),
    }, status_code=200)


routes = [
    Route("/health", health_endpoint, methods=["GET"]),
    Route("/api/v1/alerts/azure-monitor", receive_azure_alert_webhook, methods=["POST"]),
]

app = Starlette(debug=True, routes=routes)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
