"""
sut/e2e/tests/test_chaos_orchestrator.py - Automated Tests for Multi-Vector Chaos Orchestrator (TC-704 / AB#98)
"""

import pytest
from agent.src.autotriage.chaos_orchestrator import inject_fault, restore_baseline, get_cluster_status


def test_chaos_cluster_status():
    status = get_cluster_status()
    assert "dev" in status
    assert "qa" in status
    assert "prod" in status
    assert status["dev"]["health"] == "UP"


def test_chaos_vector_api_npe_and_restore():
    # 1. Inject API NPE
    res = inject_fault("API_NPE", environment="dev")
    assert res["status"] == "FAULT_INJECTED"
    assert res["vector"] == "API_NPE"
    assert res["http_status"] == 500
    assert "NullPointerException" in res["error_type"]
    assert res["target_class"] == "OrderController.java"

    # 2. Restore Baseline
    restored = restore_baseline(environment="dev")
    assert restored["status"] == "RESTORED_HEALTHY"
    assert restored["health_http_status"] == 200
    assert not restored["bug_flags"]["BUG_NULL_SHIPPING_NPE"]


def test_chaos_vector_database_zero_stock_and_restore():
    # 1. Inject Database zero-stock
    res = inject_fault("DATABASE_INVENTORY_ZERO", environment="dev")
    assert res["status"] == "FAULT_INJECTED"
    assert res["vector"] == "DATABASE_INVENTORY_ZERO"
    assert res["target_db"] == "neondb_dev"
    assert "neondb_qa" in res["isolated_tiers_unaffected"]

    # 2. Restore Baseline
    restored = restore_baseline(environment="dev")
    assert restored["status"] == "RESTORED_HEALTHY"
    assert restored["health_http_status"] == 200
