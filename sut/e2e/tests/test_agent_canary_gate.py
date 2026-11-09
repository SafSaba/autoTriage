"""
sut/e2e/tests/test_agent_canary_gate.py - Canary Rollback Gate and Telemetry Tests
==================================================================================
Tests real HTTP health checks, version parity checks, telemetry logging,
and autonomous Azure Container App rollback payload generation.
"""

import os
import sys
import pytest
import httpx

# Ensure repo root is in python path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from agent.src.autotriage.canary_rollback_gate import (
    run_canary_validation,
    resolve_environment_url,
    probe_endpoint,
    record_incident_postmortem_to_ado,
)


@pytest.fixture(autouse=True)
def reset_sut_state():
    """Module-level override of conftest reset_sut_state to enable offline testing."""
    yield


def test_resolve_environment_url_defaults():
    dev_url = resolve_environment_url("dev")
    assert "autotriage-backend-dev" in dev_url

    qa_url = resolve_environment_url("qa")
    assert "autotriage-backend-qa" in qa_url

    prod_url = resolve_environment_url("prod")
    assert "autotriage-backend-prod" in prod_url


def test_resolve_environment_url_custom_override():
    custom = "https://custom-dev.local:8443"
    assert resolve_environment_url("dev", base_url=custom) == "https://custom-dev.local:8443"


def test_canary_validation_healthy_promotion_with_mock():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/health":
            return httpx.Response(
                200,
                json={
                    "status": "up",
                    "version": "0.1.0",
                    "gitSha": "a1b2c3d",
                },
            )
        elif request.url.path == "/api/fde/releases/self":
            return httpx.Response(
                200,
                json={
                    "version": "0.1.0",
                    "gitSha": "a1b2c3d",
                    "flywayVersion": "3",
                    "activeBugFlags": {},
                },
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    res = run_canary_validation(
        container_app_name="autotriage-backend-dev",
        target_env="dev",
        base_url="https://mock-dev.internal",
        expected_git_sha="a1b2c3d",
        expected_version="0.1.0",
        synthetic_tests_passed=True,
        http_client=mock_client,
        resource_group="rg-autotriage",
    )

    assert res["status"] == "CANARY_EVALUATED"
    assert res["action"] == "PROMOTE_CANARY_100_PERCENT"
    assert not res["rollback_triggered"]
    assert "PASSED" in res["verdict"]

    telemetry = res["telemetry"]
    assert telemetry["target_app"] == "autotriage-backend-dev"
    assert telemetry["probes"]["health"]["status_code"] == 200
    assert telemetry["probes"]["health"]["latency_ms"] >= 0
    assert telemetry["probes"]["releases_self"]["status_code"] == 200
    assert telemetry["version_parity"]["passed"] is True

    assert res["promotion_payload"] is not None
    assert "az containerapp ingress traffic set" in res["promotion_payload"]["traffic_command"]
    assert res["rollback_payload"] is None


def test_canary_validation_health_probe_failure_triggers_rollback():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/health":
            return httpx.Response(500, json={"status": "down", "error": "Database unreachable"})
        return httpx.Response(200, json={"version": "0.1.0", "gitSha": "a1b2c3d"})

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    res = run_canary_validation(
        container_app_name="autotriage-backend-dev",
        target_env="dev",
        base_url="https://mock-dev.internal",
        expected_git_sha="a1b2c3d",
        synthetic_tests_passed=True,
        http_client=mock_client,
        resource_group="rg-autotriage",
    )

    assert res["status"] == "CANARY_EVALUATED"
    assert res["action"] == "AUTOMATIC_REVISION_ROLLBACK"
    assert res["rollback_triggered"] is True
    assert "FAILED" in res["verdict"]
    assert "health status=500" in res["verdict"]

    assert res["rollback_payload"] is not None
    assert "az containerapp revision set-mode" in res["rollback_payload"]["rollback_command"]
    assert "az containerapp ingress traffic set" in res["rollback_payload"]["traffic_revert_command"]
    assert res["promotion_payload"] is None


def test_canary_validation_git_sha_mismatch_triggers_rollback():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/health":
            return httpx.Response(200, json={"status": "up"})
        elif request.url.path == "/api/fde/releases/self":
            return httpx.Response(200, json={"version": "0.1.0", "gitSha": "oldsha1"})
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    res = run_canary_validation(
        container_app_name="autotriage-backend-dev",
        target_env="dev",
        base_url="https://mock-dev.internal",
        expected_git_sha="newsha2",
        synthetic_tests_passed=True,
        http_client=mock_client,
        resource_group="rg-autotriage",
    )

    assert res["status"] == "CANARY_EVALUATED"
    assert res["action"] == "AUTOMATIC_REVISION_ROLLBACK"
    assert res["rollback_triggered"] is True
    assert "version mismatch" in res["verdict"]
    assert res["telemetry"]["version_parity"]["passed"] is False


def test_canary_validation_synthetic_test_failure():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "up", "version": "0.1.0", "gitSha": "a1b2c3d"})

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    res = run_canary_validation(
        container_app_name="autotriage-backend-qa",
        target_env="qa",
        base_url="https://mock-qa.internal",
        expected_git_sha="a1b2c3d",
        synthetic_tests_passed=False,
        http_client=mock_client,
    )

    assert res["status"] == "CANARY_EVALUATED"
    assert res["action"] == "AUTOMATIC_REVISION_ROLLBACK"
    assert res["rollback_triggered"] is True
    assert "synthetic tests failed" in res["verdict"]


def test_record_postmortem_to_ado_without_pat():
    postmortem_data = {
        "action": "AUTOMATIC_REVISION_ROLLBACK",
        "verdict": "FAILED: Canary health failed (health status=503). Autonomous rollback executed.",
        "rollback_triggered": True,
        "finops_ledger": {
            "incident_blast_radius_contained": "90%",
            "estimated_downtime_prevented_min": 45,
            "revenue_impact_prevented_usd": 3250.00,
        },
    }
    # When AZURE_DEVOPS_EXT_PAT is empty, logs locally and returns True
    success = record_incident_postmortem_to_ado(
        work_item_id="79",
        incident_id="INC-AZURE-CANARY-02",
        postmortem_data=postmortem_data,
    )
    assert success is True
