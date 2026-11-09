"""
sut/e2e/tests/test_agent_golden_eval.py - Unit Tests for Golden Dataset Evaluation & Leakage Prevention
=======================================================================================================
Verifies:
1. triage_ticket NEVER receives 'expected_*' or 'active_bug_flag' keys during benchmark evaluation.
2. Wilson 95% confidence intervals are mathematically valid.
3. Held-out partition function is deterministic and balanced.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from evals.eval_golden_dataset import (
    sanitize_eval_input,
    wilson_score_interval,
    is_held_out,
    run_benchmark,
)


@pytest.fixture(autouse=True)
def reset_sut_state():
    """Overrides conftest.py network fixture to allow isolated fast unit testing."""
    yield


def test_sanitize_eval_input_strips_leakage():
    """Ensures expected_* labels and active_bug_flag are completely removed."""
    raw_record = {
        "ticket_id": "TKT-101",
        "customer_email": "customer@example.com",
        "subject": "Wrong total at checkout",
        "body": "Tax was calculated incorrectly.",
        "active_bug_flag": "BUG_OFF_BY_ONE_DISCOUNT",
        "expected_path": "P7_HEAL_AND_DRAFT_PR",
        "expected_classification": "CONFIRMED_BUG",
        "expected_rag_citation": "PRD-001",
        "expected_test_to_run": "tests/test_api_and_bugs.py::test_autotriage_three_runtime_bug_flags",
        "expected_root_cause_file": "sut/backend-spring/src/main/java/com/autotriage/shop/controller/OrderController.java",
        "expected_owner_status": "DEPARTED",
    }

    cleaned = sanitize_eval_input(raw_record)

    assert "active_bug_flag" not in cleaned
    for k in cleaned:
        assert not k.startswith("expected_"), f"Found leaked key: {k}"

    assert cleaned["ticket_id"] == "TKT-101"
    assert cleaned["subject"] == "Wrong total at checkout"
    assert cleaned["body"] == "Tax was calculated incorrectly."


def test_triage_ticket_never_receives_leakage_during_benchmark():
    """Asserts triage_ticket receives only stripped inputs across the entire golden benchmark."""
    received_inputs = []

    def mock_triage(ticket):
        received_inputs.append(dict(ticket))
        return {
            "classification": "CONFIRMED_BUG",
            "action_path": "P7_HEAL_AND_DRAFT_PR",
            "rag_citations": ["PRD-001"],
            "repro_status": "CONFIRMED",
        }

    with patch("evals.eval_golden_dataset.triage_ticket", side_effect=mock_triage):
        summary = run_benchmark()

    assert len(received_inputs) >= 7
    for inp in received_inputs:
        assert "active_bug_flag" not in inp, f"active_bug_flag leaked in {inp.get('ticket_id')}"
        for key in inp:
            assert not key.startswith("expected_"), f"Leaked {key} in {inp.get('ticket_id')}"


def test_wilson_score_interval_properties():
    """Validates mathematical properties of Wilson 95% confidence interval."""
    # Boundary 0 trials
    assert wilson_score_interval(0, 0) == (0.0, 0.0)

    # 100% success on small sample
    low, high = wilson_score_interval(8, 8)
    assert 60.0 <= low <= 75.0
    assert high == 100.0

    # 50% on large sample
    low, high = wilson_score_interval(50, 100)
    assert low < 50.0 < high
    assert round(high - 50.0, 1) == round(50.0 - low, 1)


def test_held_out_partition_is_deterministic():
    """Validates that held-out split is strictly deterministic by sha256."""
    assert is_held_out("TKT-104") is True
    assert is_held_out("TKT-107") is True
    assert is_held_out("TKT-108") is True
    assert is_held_out("TKT-101") is False
    assert is_held_out("TKT-102") is False
    assert is_held_out("TKT-103") is False
