"""
test_mcp_servers.py - Comprehensive Unit & Integration Test Suite for AutoTriage MCP Servers
===========================================================================================
Validates:
1. FastMCP RAG Server (mcp_servers/rag/server.py):
   - BM25 search over PRDs, ADRs, Sprint Notes, and Backlog Stories
   - Exact ID lookups (PRD-001, ADR-008, US-101)
   - Working As Designed (WAD) classification heuristics
   - Listing knowledge sources
2. FastMCP Work Items Server (mcp_servers/workitems/server.py):
   - Backlog searching by keyword, sprint, and epic
   - Work item retrieval
   - Bug ticket creation (simulating Jira / Azure DevOps)
   - Status updates & triage note additions
   - Listing sprints and epics
"""

import sys
from pathlib import Path
import pytest

# Ensure autotriage root is in python path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from mcp_servers.rag.server import (
    search_knowledge,
    get_document_by_id,
    check_working_as_designed,
    list_knowledge_sources,
)
from mcp_servers.workitems.server import (
    search_backlog,
    get_work_item,
    create_bug_ticket,
    update_work_item_status,
    list_sprints_and_epics,
)


class TestFastMCPRagServer:
    """Tests the FastMCP RAG server retrieval and specification analysis tools."""

    def test_search_knowledge_bm25_and_id_boosting(self):
        """Validates that search_knowledge retrieves relevant PRD chunks with BM25 scores."""
        # Query 1: Exact PRD ID
        results = search_knowledge(query="PRD-001")
        assert len(results) >= 1
        top = results[0]
        assert top["doc_id"] == "PRD-001"
        assert "10% sales tax" in top["content"]
        assert top["score"] > 20.0  # Boosted for exact ID

        # Query 2: Natural language symptom regarding card decline
        card_results = search_knowledge(query="credit card payment declined 0002")
        assert len(card_results) >= 1
        assert any("0002" in r["content"] for r in card_results)

        # Query 3: Address line2
        line2_results = search_knowledge(query="is address line 2 apartment required or optional")
        assert len(line2_results) >= 1
        assert any(r["doc_id"] == "PRD-003" for r in line2_results)

    def test_search_knowledge_category_filter(self):
        """Validates filtering results by category ('prd', 'adr', 'backlog_story')."""
        adr_results = search_knowledge(query="stock reservation order cancellation", category="adr")
        assert len(adr_results) >= 1
        for r in adr_results:
            assert r["doc_type"] == "adr"
            assert r["doc_id"] == "ADR-008"

    def test_get_document_by_id(self):
        """Validates exact document retrieval by ID."""
        doc = get_document_by_id("PRD-004")
        assert doc["found"] is True
        assert doc["document"]["doc_id"] == "PRD-004"
        assert "0002" in doc["document"]["content"]

        # Non-existent doc
        missing = get_document_by_id("PRD-999")
        assert missing["found"] is False

    def test_check_working_as_designed_heuristics(self):
        """
        Validates the 'Working As Designed' classifier:
        - Card 0002 decline is intentional (True)
        - 10% sales tax addition is intentional (True)
        - Unauthenticated cart redirect is intentional (True)
        - Arbitrary bug is NOT intentional (False)
        """
        # Intentional 1: Card 0002
        res1 = check_working_as_designed("My test card ending in 0002 was declined with HTTP 402")
        assert res1["is_working_as_designed"] is True
        assert "PRD-004" in res1["matched_spec"]
        assert res1["confidence"] >= 0.95

        # Intentional 2: 10% tax
        res2 = check_working_as_designed("Order total has an extra 10% added on top of the subtotal")
        assert res2["is_working_as_designed"] is True
        assert "PRD-001" in res2["matched_spec"]

        # Intentional 3: Guest cart redirect
        res3 = check_working_as_designed("Guest user cannot add to cart and is redirected to login")
        assert res3["is_working_as_designed"] is True
        assert "PRD-002" in res3["matched_spec"]

        # Actual Bug: Off by one discount multiplier
        res_bug = check_working_as_designed("Cart discount gave 0.99x price instead of charging full amount")
        assert res_bug["is_working_as_designed"] is False

    def test_list_knowledge_sources(self):
        """Validates listing all registered knowledge sources."""
        sources = list_knowledge_sources()
        assert len(sources) >= 6
        doc_ids = [s["id"] for s in sources]
        assert "PRD-001" in doc_ids
        assert "ADR-008" in doc_ids
        assert "US-101" in doc_ids


class TestFastMCPWorkItemsServer:
    """Tests the FastMCP Jira / Azure DevOps Work Items server."""

    def test_search_backlog(self):
        """Validates backlog search across Epics and User Stories."""
        # 1. Search by sprint
        sprint1_items = search_backlog(sprint="Sprint 1")
        assert len(sprint1_items) >= 3
        for item in sprint1_items:
            assert item["sprint"] == "Sprint 1"

        # 2. Search by parent epic
        epic100_items = search_backlog(epic_id="EPIC-100")
        assert len(epic100_items) >= 3
        for item in epic100_items:
            assert item["parent_id"] == "EPIC-100"

        # 3. Search by query
        tax_items = search_backlog(query="Sales Tax")
        assert len(tax_items) >= 1
        assert any(item["id"] == "US-101" for item in tax_items)

    def test_get_work_item(self):
        """Validates retrieving specific work items by ID."""
        item = get_work_item("US-102")
        assert item["found"] is True
        assert item["work_item"]["id"] == "US-102"
        assert "Inventory" in item["work_item"]["title"]
        assert "ADR-008" in item["work_item"]["related_prd"]

        # Missing item
        missing = get_work_item("US-999")
        assert missing["found"] is False

    def test_create_and_update_bug_ticket(self):
        """
        Validates creating a new triaged bug ticket and updating its status.
        Simulates enterprise bug filing in Jira / Azure DevOps.
        """
        # Create ticket
        res = create_bug_ticket(
            title="Checkout total calculates 0.99x instead of 1.10x tax multiplier",
            description="When BUG_OFF_BY_ONE_DISCOUNT is active, total is discounted instead of taxed.",
            priority="P1",
            severity="Major",
            repro_steps="1. Log in as buyer.\n2. Add prod_001 ($450.00).\n3. Complete checkout.\n4. Observe total is $445.50 instead of $495.00.",
            area_path="E-Automate\\Checkout",
            sprint="Sprint 1",
            assigned_to="tech-lead@autotriage.local",
            related_prd="PRD-001",
            related_test="sut/e2e/tests/test_api_and_bugs.py::test_autotriage_three_runtime_bug_flags",
            logs="AssertionError: 445.50 != 495.00",
        )
        assert res["success"] is True
        ticket = res["ticket"]
        ticket_id = ticket["id"]
        assert ticket_id.startswith("BUG-")
        assert ticket["priority"] == "P1"
        assert ticket["state"] == "Active"

        # Fetch created ticket
        fetched = get_work_item(ticket_id)
        assert fetched["found"] is True
        assert fetched["work_item"]["title"] == ticket["title"]

        # Update ticket status
        update_res = update_work_item_status(
            item_id=ticket_id,
            state="Resolved",
            triage_notes="Root cause identified in OrderController.java line 148. BUG_OFF_BY_ONE_DISCOUNT disabled.",
        )
        assert update_res["success"] is True
        updated = update_res["updated_item"]
        assert updated["state"] == "Resolved"
        assert "OrderController.java" in updated["triage_notes"]

    def test_list_sprints_and_epics(self):
        """Validates summary of sprints, epics, and area paths."""
        summary = list_sprints_and_epics()
        assert summary["total_items"] >= 7
        assert "Sprint 1" in summary["sprints"]
        assert "Sprint 2" in summary["sprints"]
        assert any(e["id"] == "EPIC-100" for e in summary["epics"])
        assert any(e["id"] == "EPIC-200" for e in summary["epics"])
