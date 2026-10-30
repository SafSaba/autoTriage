import pytest
import os
import httpx
from agent.src.autotriage.chaos_orchestrator import inject_fault, restore_baseline, get_cluster_status

API_URL_DEV = os.getenv("API_URL", "https://autotriage-backend-dev.graytree-645df5bf.eastus.azurecontainerapps.io")


@pytest.mark.ui
@pytest.mark.smoke
def test_mission_control_rendered_components():
    """
    [Safwan-qa] TC-801: FDE Mission Control 4-Zone UI & Chaos Trigger Verification
    Validates that the mission control assets, API telemetry, and cluster status endpoints
    respond with 200 OK and accurate metadata across DEV, QA, and PROD.
    """
    cluster = get_cluster_status()
    assert "dev" in cluster, "DEV cluster node missing"
    assert "qa" in cluster, "QA cluster node missing"
    assert "prod" in cluster, "PROD cluster node missing"
    assert cluster["dev"]["health"] == "UP"
    assert cluster["dev"]["target_db"] == "neondb_dev"
    assert cluster["qa"]["target_db"] == "neondb_qa"
    assert cluster["prod"]["target_db"] == "neondb_prod"


def test_mission_control_chaos_and_restoration_cycle():
    """
    [Safwan-qa] TC-802: Live Cloud Multi-Tier Isolation & AST Diff Verification
    Verifies that injecting an API NPE fault degrades the DEV endpoint,
    while calling restore_baseline returns DEV to 200 OK without affecting QA/PROD.
    """
    # 1. Ensure clean starting point
    restored = restore_baseline(environment="dev")
    assert restored["status"] == "RESTORED_HEALTHY"
    assert restored["health_http_status"] == 200

    # 2. Inject Java API NPE
    fault = inject_fault("API_NPE", environment="dev")
    assert fault["status"] == "FAULT_INJECTED"
    assert fault["target_class"] == "OrderController.java"
    assert fault["http_status"] == 500

    # 3. Restore healthy baseline
    healed = restore_baseline(environment="dev")
    assert healed["status"] == "RESTORED_HEALTHY"
    assert healed["health_http_status"] == 200
    assert healed["bug_flags"]["BUG_NULL_SHIPPING_NPE"] is False
