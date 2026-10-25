"""
agent/src/autotriage/graph/state.py - LangGraph State Definition for AutoTriage
==============================================================================
Typed state dictionary tracked throughout the agent workflow.
"""

from typing import Any, Dict, List, Optional
from typing_extensions import TypedDict


class TriageState(TypedDict, total=False):
    # Intake Ticket Information
    ticket_id: str
    customer_email: str
    subject: str
    body: str
    sanitized_body: str
    active_bug_flag: Optional[str]

    # Security & Guardrails
    injection_score: float
    is_quarantined: bool
    quarantine_reason: Optional[str]

    # RAG Grounding & Specification Analysis
    rag_citations: List[str]
    rag_context: str
    is_working_as_designed: bool
    wad_spec: Optional[str]
    wad_rationale: Optional[str]

    # Automated Test Reproduction
    test_to_run: Optional[str]
    repro_status: str  # "CONFIRMED", "CANNOT_REPRODUCE", "SKIPPED"
    repro_error_summary: Optional[str]
    repro_duration_sec: float

    # Code Ownership & Resolution
    assigned_owner: Optional[str]
    owner_status: Optional[str]  # "ACTIVE", "DEPARTED"
    classification: str          # "CONFIRMED_BUG", "WORKING_AS_DESIGNED", "NEEDS_INFO", "PROMPT_INJECTION_QUARANTINED"
    action_path: str             # "P0_QUARANTINE_SECURITY", "P1_NEEDS_MORE_INFO", "P2_WORKING_AS_DESIGNED", "P7_HEAL_AND_DRAFT_PR"

    # Work Item & Notification Outcomes
    created_work_item_id: Optional[str]
    slack_alert_sent: bool
    teams_card_sent: bool
    triage_notes: str
