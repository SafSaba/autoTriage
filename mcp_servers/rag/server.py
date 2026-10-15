"""
mcp_servers/rag/server.py - FastMCP Knowledge & Specification Retrieval Server
=============================================================================
Provides grounded RAG retrieval over:
1. Product Requirement Documents (PRD-001 to PRD-006)
2. Architecture Decision Records (ADR-008 Stock reservation)
3. Sprint Planning & Code Ownership Notes (Active vs Departed owners)
4. Jira / ADO Backlog Epics & User Stories (Acceptance Criteria)
5. Known Intentional Behaviors ("Working As Designed" rules)

Uses BM25 lexical ranking + exact token boosting for deterministic, hallucination-free triage.
"""

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server.mcpserver import MCPServer
from rank_bm25 import BM25Okapi

# Initialize MCP Server
app = MCPServer("autotriage-rag")

# Locate corpus directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent
CORPUS_FILE = BASE_DIR / "knowledge" / "corpus" / "rag_knowledge_chunks.jsonl"
BACKLOG_FILE = BASE_DIR / "knowledge" / "workitems" / "jira_ado_backlog.json"

CHUNKS: List[Dict[str, Any]] = []
TOKENIZED_CORPUS: List[List[str]] = []
bm25_index: Optional[BM25Okapi] = None


def tokenize(text: str) -> List[str]:
    """Tokenizes text into lowercase alphanumeric words and symbols."""
    return re.findall(r"\w+", (text or "").lower())


def load_corpus() -> None:
    """Loads all knowledge chunks from JSONL and backlog stories into index."""
    global CHUNKS, TOKENIZED_CORPUS, bm25_index
    CHUNKS.clear()
    TOKENIZED_CORPUS.clear()

    # 1. Load RAG knowledge chunks
    if CORPUS_FILE.exists():
        with open(CORPUS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    chunk = json.loads(line)
                    chunk["source"] = "corpus"
                    CHUNKS.append(chunk)

    # 2. Load Jira / ADO backlog items
    if BACKLOG_FILE.exists():
        with open(BACKLOG_FILE, "r", encoding="utf-8") as f:
            items = json.load(f)
            for item in items:
                chunk = {
                    "doc_id": item["id"],
                    "doc_type": "backlog_story" if item.get("type") == "User Story" else "backlog_epic",
                    "title": f"{item.get('type')}: {item.get('title')}",
                    "section": item.get("sprint", "Backlog"),
                    "version": "1.0",
                    "content": (
                        f"Description: {item.get('description', '')}\n"
                        f"Acceptance Criteria: {item.get('acceptance_criteria', '')}\n"
                        f"Related PRD: {item.get('related_prd', '')}\n"
                        f"Related Test: {item.get('related_test', '')}\n"
                        f"Assigned To: {item.get('assigned_to', '')}"
                    ),
                    "related_routes": [item.get("area_path", "")],
                    "related_test_ids": [item.get("related_test", "")] if item.get("related_test") else [],
                    "source": "jira_ado_backlog",
                }
                CHUNKS.append(chunk)

    # Build BM25 index
    for c in CHUNKS:
        combined_text = f"{c.get('doc_id', '')} {c.get('title', '')} {c.get('section', '')} {c.get('content', '')}"
        TOKENIZED_CORPUS.append(tokenize(combined_text))

    if TOKENIZED_CORPUS:
        bm25_index = BM25Okapi(TOKENIZED_CORPUS)


# Initial load
load_corpus()


@app.tool()
def search_knowledge(
    query: str,
    category: Optional[str] = None,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Search product specifications, ADRs, release notes, and user stories using BM25 ranking.
    Args:
        query: The natural language search query or technical symptom (e.g. '0002 card decline', 'tax calculation', 'line2 address').
        category: Optional filter: 'prd', 'adr', 'sprint_notes', 'backlog_story', 'backlog_epic'.
        top_k: Maximum number of results to return (default 5).
    """
    if not bm25_index or not CHUNKS:
        load_corpus()
        if not bm25_index:
            return []

    tokens = tokenize(query)
    scores = bm25_index.get_scores(tokens)

    # Calculate exact keyword and ID boosts
    query_lower = query.lower()
    results = []
    for idx, chunk in enumerate(CHUNKS):
        doc_type = chunk.get("doc_type", "").lower()
        if category and category.lower() not in doc_type:
            continue

        score = float(scores[idx])
        doc_id = chunk.get("doc_id", "").lower()

        # Boost exact document ID matches (e.g. 'PRD-001', 'ADR-008', 'US-101')
        if doc_id in query_lower:
            score += 20.0

        # Boost specific critical test tokens
        for token in ["0002", "4242", "line2", "0.99", "1.10", "alex.mercer"]:
            if token in query_lower and token in chunk.get("content", "").lower():
                score += 5.0

        if score > 0.1:
            results.append({
                "doc_id": chunk.get("doc_id"),
                "doc_type": chunk.get("doc_type"),
                "title": chunk.get("title"),
                "section": chunk.get("section"),
                "score": round(score, 3),
                "content": chunk.get("content"),
                "related_test_ids": chunk.get("related_test_ids", []),
                "related_routes": chunk.get("related_routes", []),
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]


@app.tool()
def get_document_by_id(doc_id: str) -> Dict[str, Any]:
    """
    Direct lookup of a PRD, ADR, Sprint Note, or User Story by its exact ID.
    Args:
        doc_id: The document identifier, e.g. 'PRD-001', 'PRD-004', 'ADR-008', 'US-101'.
    """
    target = doc_id.strip().upper()
    for chunk in CHUNKS:
        if chunk.get("doc_id", "").upper() == target:
            return {"found": True, "document": chunk}
    return {"found": False, "error": f"Document with ID '{doc_id}' not found in knowledge base."}


@app.tool()
def check_working_as_designed(claim_or_symptom: str) -> Dict[str, Any]:
    """
    Evaluates whether a reported user complaint or test failure is actually 'Working As Designed' (WAD).
    Prevents filing bug tickets for intentional product behaviors and test harnesses.
    Args:
        claim_or_symptom: The reported bug description (e.g. 'Payment declined for card 0002', 'Total has 10% added', 'Unauthenticated user cannot add to cart').
    """
    text = claim_or_symptom.lower()

    # Rule 1: Card 0002 Decline
    if "0002" in text and ("decline" in text or "402" in text or "payment" in text):
        return {
            "is_working_as_designed": True,
            "matched_spec": "PRD-004 / US-103",
            "confidence": 0.99,
            "rationale": "PRD-004 explicitly mandates that test cards ending in '0002' must return HTTP 402 Payment Required to simulate decline flows for automated testing.",
            "recommended_action": "Close ticket as Working As Designed (WAD).",
        }

    # Rule 2: 10% Sales Tax
    if ("10%" in text or "tax" in text) and ("subtotal" in text or "added" in text or "extra" in text):
        return {
            "is_working_as_designed": True,
            "matched_spec": "PRD-001 / US-101",
            "confidence": 0.95,
            "rationale": "PRD-001 dictates all orders are subject to a flat 10% sales tax (multiplier 1.10) with Free Shipping. Total = Subtotal * 1.10.",
            "recommended_action": "Close ticket as Working As Designed (WAD).",
        }

    # Rule 3: Guest Add to Cart Redirect
    if ("guest" in text or "unauthenticated" in text) and ("redirect" in text or "login" in text or "cannot add" in text):
        return {
            "is_working_as_designed": True,
            "matched_spec": "PRD-002",
            "confidence": 0.95,
            "rationale": "PRD-002 requires that unauthenticated users clicking Add to Cart are shown 'Authentication Required' and redirected to /login.",
            "recommended_action": "Close ticket as Working As Designed (WAD).",
        }

    # Rule 4: Password Complexity
    if ("password" in text) and ("12" in text or "uppercase" in text or "special" in text or "too short" in text):
        return {
            "is_working_as_designed": True,
            "matched_spec": "PRD-004 / US-201",
            "confidence": 0.95,
            "rationale": "PRD-004 requires passwords to be at least 12 characters with at least one uppercase letter and one special character.",
            "recommended_action": "Close ticket as Working As Designed (WAD).",
        }

    # Rule 5: Address Line 2 Optional
    if "line2" in text and ("optional" in text or "apartment" in text):
        return {
            "is_working_as_designed": True,
            "matched_spec": "PRD-003 / US-203",
            "confidence": 0.95,
            "rationale": "PRD-003 explicitly states Address Line 2 is strictly optional. Omitting it is valid customer input.",
            "recommended_action": "Close ticket as Working As Designed (WAD).",
        }

    return {
        "is_working_as_designed": False,
        "matched_spec": None,
        "confidence": 0.30,
        "rationale": "Symptom does not match any documented intentional constraint. Potential defect.",
        "recommended_action": "Proceed with reproduction and triage investigation.",
    }


@app.tool()
def list_knowledge_sources() -> List[Dict[str, Any]]:
    """Lists all registered specifications, ADRs, sprint notes, and backlog epics."""
    return [
        {
            "id": c.get("doc_id"),
            "type": c.get("doc_type"),
            "title": c.get("title"),
            "section": c.get("section"),
            "source": c.get("source"),
        }
        for c in CHUNKS
    ]


if __name__ == "__main__":
    app.run()
