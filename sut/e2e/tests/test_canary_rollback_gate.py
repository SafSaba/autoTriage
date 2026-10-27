"""
sut/e2e/tests/test_canary_rollback_gate.py - Tests for Autonomous Canary Gate & Auto-Rollback Engine (AB#79)
"""

import pytest
from agent.src.autotriage.canary_rollback_gate import run_canary_validation, record_incident_postmortem_to_ado


def test_canary_validation_success():
    res = run_canary_validation(
        container_app_name="autotriage-backend-dev",
        target_env="dev",
        synthetic_tests_passed=True,
        health_check_status=200,
        force_chaos_failure=False,
    )
    assert res["status"] == "CANARY_EVALUATED"
    assert res["action"] == "PROMOTE_CANARY_100_PERCENT"
    assert not res["rollback_triggered"]
    assert "PASSED" in res["verdict"]
    assert res["finops_ledger"]["revenue_impact_prevented_usd"] > 0


def test_canary_validation_failure_triggers_rollback():
    res = run_canary_validation(
        container_app_name="autotriage-backend-dev",
        target_env="dev",
        synthetic_tests_passed=False,
        health_check_status=500,
        force_chaos_failure=True,
    )
    assert res["status"] == "CANARY_EVALUATED"
    assert res["action"] == "AUTOMATIC_REVISION_ROLLBACK"
    assert res["rollback_triggered"]
    assert "FAILED" in res["verdict"]


def test_record_postmortem():
    sample_res = run_canary_validation(
        container_app_name="autotriage-backend-dev",
        target_env="dev",
    )
    ok = record_incident_postmortem_to_ado(
        work_item_id="79",
        incident_id="INC-AZURE-REVERT-01",
        postmortem_data=sample_res,
    )
    assert ok
