"""
sut/e2e/tests/test_agent_llm_and_hotfix.py - Unit Tests for LLM Reasoning & Hotfix Engine
==========================================================================================
Verifies:
1. LLM client raises LlmUnavailable when GEMINI_API_KEY is missing.
2. Nodes mark reasoning_mode="deterministic_fallback" and tokens_consumed=0 when LLM unavailable.
3. Grounding verification validates files, lines, and RAG doc_ids.
4. Git worktree in propose_and_verify_fix leaves main tree untouched and cleans up.
5. No vote: 10 or hardcoded reviewer GUID in hotfix engine.
"""

import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from agent.src.autotriage.llm import (
    LlmUnavailable,
    ClassificationOutput,
    LocalizationOutput,
    generate_structured,
)
from agent.src.autotriage.graph.nodes import (
    ownership_node,
    self_heal_pr_node,
    verify_grounding,
)
from agent.src.autotriage.emergency_hotfix_engine import (
    propose_and_verify_fix,
    generate_emergency_hotfix,
)


@pytest.fixture(autouse=True)
def reset_sut_state():
    """Overrides conftest.py network fixture to allow isolated fast unit testing."""
    yield


def test_llm_client_raises_when_no_api_key(monkeypatch):
    """Ensures LlmUnavailable is raised when GEMINI_API_KEY is not in process environment."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("AUTOTRIAGE_DISABLE_DOTENV", "1")
    with pytest.raises(LlmUnavailable) as exc_info:
        generate_structured("prompt", LocalizationOutput)
    assert "GEMINI_API_KEY" in str(exc_info.value)


def test_ownership_node_deterministic_fallback(monkeypatch):
    """Verifies that missing LLM triggers deterministic fallback and sets correct metadata."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("AUTOTRIAGE_DISABLE_DOTENV", "1")

    state = {
        "body": "Charged wrong total at checkout - discount instead of 10% tax",
        "rag_citations": ["PRD-001"],
        "repro_error_summary": "Expected 495.00 but got 445.50",
        "test_to_run": "tests/test_api_and_bugs.py::test_autotriage_three_runtime_bug_flags",
    }

    res = ownership_node(state)

    assert res["reasoning_mode"] == "deterministic_fallback"
    assert res["tokens_consumed"] == 0
    assert "OrderController.java" in res["suspect_file"]
    assert res["suspect_start_line"] == 147
    assert res["suspect_end_line"] == 151
    assert res["owner_status"] == "DEPARTED"


def test_verify_grounding_behavior():
    """Tests strict grounding checks on files, line counts, and RAG doc_ids."""
    # Valid grounding
    assert verify_grounding(
        "sut/backend-spring/src/main/java/com/autotriage/shop/controller/OrderController.java",
        147,
        151,
        ["PRD-001"],
    ) is True

    # Invalid file
    assert verify_grounding(
        "sut/backend-spring/src/main/java/com/autotriage/shop/controller/FakeController.java",
        1,
        10,
        ["PRD-001"],
    ) is False

    # Out of bounds lines
    assert verify_grounding(
        "sut/backend-spring/src/main/java/com/autotriage/shop/controller/OrderController.java",
        9999,
        10000,
        ["PRD-001"],
    ) is False

    # Invalid RAG doc_id
    assert verify_grounding(
        "sut/backend-spring/src/main/java/com/autotriage/shop/controller/OrderController.java",
        147,
        151,
        ["PRD-NON-EXISTENT-999"],
    ) is False


def test_propose_and_verify_fix_worktree_isolation(monkeypatch):
    """Ensures git worktree leaves main repository working tree clean and uncommitted."""
    monkeypatch.delenv("AUTOTRIAGE_ALLOW_PR", raising=False)

    loc = {
        "file": "sut/backend-spring/src/main/java/com/autotriage/shop/controller/OrderController.java",
        "start_line": 147,
        "end_line": 151,
        "rationale": "Tax calculation discount bug",
        "cited_doc_ids": ["PRD-001"],
    }

    # Record status of repo before fix
    status_before = subprocess.run(["git", "status", "--porcelain"], cwd=str(ROOT_DIR), capture_output=True, text=True)

    res = propose_and_verify_fix(loc, work_item_id="101")

    # Record status of repo after fix
    status_after = subprocess.run(["git", "status", "--porcelain"], cwd=str(ROOT_DIR), capture_output=True, text=True)

    assert res["status"] in ["VERIFIED_LOCAL_ONLY", "PR_OPENED"]
    assert "diff" in res and len(res["diff"]) > 0
    # Main working tree was not contaminated by the worktree branch
    assert status_before.stdout == status_after.stdout


def test_no_self_approval_in_hotfix_engine():
    """Asserts that self-approval (vote: 10) and hardcoded reviewer GUID are not present in hotfix code."""
    hotfix_file = ROOT_DIR / "agent" / "src" / "autotriage" / "emergency_hotfix_engine.py"
    content = hotfix_file.read_text(encoding="utf-8")

    assert '"vote": 10' not in content
    assert "'vote': 10" not in content
    assert "e2e17a46-91e9-6b8e-8108-bb905f2879db" not in content
