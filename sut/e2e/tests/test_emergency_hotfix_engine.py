"""
sut/e2e/tests/test_emergency_hotfix_engine.py - Tests for Autonomous Emergency Hotfix Generator (AB#78)
"""

import pytest
from agent.src.autotriage.emergency_hotfix_engine import generate_emergency_hotfix


def test_generate_emergency_hotfix():
    res = generate_emergency_hotfix(
        incident_id="INC-500-CHECKOUT",
        work_item_id="78",
        target_env="dev",
        operation_id="4bf92f3577b34da6a3ce929d0e0e4736",
        error_summary="NullPointerException in OrderController addressLine2",
        suspect_file="sut/backend-spring/src/main/java/com/autotriage/shop/controller/OrderController.java"
    )

    assert res["status"] == "HOTFIX_PR_CREATED"
    assert "fix/alert-78-dev" in res["branch_name"]
    assert res["pull_request_id"] is not None
    assert "https://dev.azure.com/isafwan/AutoTriage/_git/AutoTriage/pullrequest/" in res["pull_request_url"]
    assert res["adversarial_critic"]["status"] == "APPROVED"
    assert res["finops_receipt"]["total_cost_prevented_usd"] > 0
    print(f"\nCreated Hotfix PR: {res['pull_request_url']}")
