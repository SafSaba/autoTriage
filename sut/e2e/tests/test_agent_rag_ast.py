"""
Tests for mcp_servers/rag/server.py AST codebase retrieval and git diff tools.
"""

import sys
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from mcp_servers.rag.server import (
    search_knowledge,
    get_document_by_id,
    check_working_as_designed,
    list_knowledge_sources,
    search_codebase_ast,
    get_git_diff_hunks,
)


@pytest.fixture(autouse=True)
def reset_sut_state():
    """Overrides conftest.py network fixture to allow isolated unit testing."""
    yield


def test_search_codebase_ast_finds_order_controller():
    results = search_codebase_ast("orders checkout stock", controller_name="OrderController")
    assert len(results) > 0
    top = results[0]
    assert top["file"] == "OrderController.java"
    assert top["controller"] == "OrderController"
    assert top["method"] == "createOrder"
    assert top["start_line"] > 0
    assert top["end_line"] >= top["start_line"]
    assert top["score"] > 0.5
    assert len(top["annotations"]) > 0


def test_search_codebase_ast_finds_cart_methods():
    results = search_codebase_ast("addItem merge guest items", controller_name="CartController")
    assert len(results) > 0
    method_names = [r["method"] for r in results]
    assert "addItem" in method_names


def test_get_git_diff_hunks_returns_parsed_diff():
    hunks = get_git_diff_hunks("HEAD~10", "HEAD")
    assert isinstance(hunks, list)
    for h in hunks:
        assert "file" in h
        assert "old_start" in h
        assert "new_start" in h
        assert "diff_snippet" in h
        assert "changed_methods" in h


def test_search_knowledge_corpus_persists():
    res = search_knowledge("PRD-001 sales tax 10%")
    assert len(res) > 0
    assert any("PRD-001" in r["doc_id"] for r in res)


def test_check_working_as_designed():
    wad = check_working_as_designed("card ending in 0002 declined with 402")
    assert wad["is_working_as_designed"] is True
    assert "PRD-004" in wad["matched_spec"]
