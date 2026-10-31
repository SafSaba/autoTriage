"""
sut/e2e/tests/test_azure_monitor_webhook.py - Unit and Integration Tests for Webhook Ingestion
"""

import pytest
from starlette.testclient import TestClient
from agent.src.autotriage.webhook_receiver import app, normalize_azure_alert


@pytest.fixture
def sample_azure_alert_payload():
    return {
        "schemaId": "azureMonitorCommonAlertSchema",
        "data": {
            "essentials": {
                "alertId": "/subscriptions/0393F912-174B-4F94-AF02-D621C5344962/providers/Microsoft.AlertsManagement/alerts/b6d1912a-350e-473d-8ab1-863a8e993e3d",
                "alertRule": "HTTP 500 Failure Spike - Order NPE addressLine2",
                "severity": "Sev1",
                "signalType": "Log",
                "monitorCondition": "Fired",
                "monitoringService": "Log Analytics",
                "alertTargetIDs": [
                    "/subscriptions/0393F912-174B-4F94-AF02-D621C5344962/resourcegroups/rg-autotriage-free/providers/microsoft.app/containerapps/autotriage-backend-dev"
                ],
                "targetResource": "autotriage-backend-dev",
                "targetResourceGroup": "rg-autotriage-free",
                "firedDateTime": "2026-10-31T03:00:00.000Z",
                "description": "App Exceptions spike in autotriage-backend-dev: NullPointerException in OrderController line 88"
            },
            "alertContext": {
                "SearchResults": {
                    "tables": [
                        {
                            "name": "PrimaryResult",
                            "columns": [{"name": "OperationId", "type": "string"}],
                            "rows": [["4bf92f3577b34da6a3ce929d0e0e4736"]]
                        }
                    ]
                }
            }
        }
    }


def test_normalize_azure_alert(sample_azure_alert_payload):
    normalized = normalize_azure_alert(sample_azure_alert_payload)
    assert "AZ-ALERT-" in normalized["ticket_id"]
    assert normalized["environment"] == "dev"
    assert normalized["severity"] == "Sev1"
    assert normalized["operation_id"] == "4bf92f3577b34da6a3ce929d0e0e4736"
    assert normalized["active_bug_flag"] == "DEFECT_ORDER_NPE_ADDRESS_LINE2"
    assert "OrderController" in normalized["body"]


def test_webhook_receiver_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_webhook_receiver_ingest_alert(sample_azure_alert_payload):
    client = TestClient(app)
    response = client.post("/api/v1/alerts/azure-monitor", json=sample_azure_alert_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "PROCESSED"
    assert "AZ-ALERT-" in data["ticket_id"]
    assert data["classification"] in ["CONFIRMED_BUG", "WORKING_AS_DESIGNED", "NEEDS_INFO"]
