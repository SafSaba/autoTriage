"""
agent/src/autotriage/graph/build.py - LangGraph Core Workflow Assembler
======================================================================
Compiles the AutoTriage durable state machine connecting:
- Intake Sanitization
- Prompt Injection Guardrails
- Specification RAG & Working As Designed checks
- Playwright Runner automated reproduction
- Code Ownership resolution
- Work Items Jira/ADO ticket filing
- Notification Slack & Teams alerting
"""

from typing import Any, Dict, Literal
from langgraph.graph import END, START, StateGraph

from agent.src.autotriage.graph.nodes import (
    notify_node,
    ownership_node,
    rag_retriever_node,
    reproduction_node,
    sanitize_node,
    security_guard_node,
    work_item_node,
)
from agent.src.autotriage.graph.state import TriageState


def route_after_security(state: TriageState) -> Literal["notify", "rag_retriever"]:
    """Routes quarantined threats directly to notification, bypassing tools."""
    if state.get("is_quarantined"):
        return "notify"
    return "rag_retriever"


def route_after_rag(state: TriageState) -> Literal["notify", "reproduction"]:
    """Routes intentional behaviors (Working As Designed) directly to notification."""
    if state.get("is_working_as_designed"):
        return "notify"
    return "reproduction"


def route_after_reproduction(state: TriageState) -> Literal["ownership", "notify"]:
    """Routes confirmed bugs to ownership & work items; vague reports to notify."""
    if state.get("repro_status") == "CONFIRMED":
        return "ownership"
    return "notify"


def build_triage_graph() -> Any:
    """Constructs and compiles the AutoTriage LangGraph state machine."""
    workflow = StateGraph(TriageState)

    # 1. Register Nodes
    workflow.add_node("sanitize", sanitize_node)
    workflow.add_node("security_guard", security_guard_node)
    workflow.add_node("rag_retriever", rag_retriever_node)
    workflow.add_node("reproduction", reproduction_node)
    workflow.add_node("ownership", ownership_node)
    workflow.add_node("work_item", work_item_node)
    workflow.add_node("notify", notify_node)

    # 2. Add Transitions & Edges
    workflow.add_edge(START, "sanitize")
    workflow.add_edge("sanitize", "security_guard")

    # Conditional routing after security guardrail
    workflow.add_conditional_edges(
        "security_guard",
        route_after_security,
        {
            "notify": "notify",
            "rag_retriever": "rag_retriever",
        },
    )

    # Conditional routing after RAG specification check
    workflow.add_conditional_edges(
        "rag_retriever",
        route_after_rag,
        {
            "notify": "notify",
            "reproduction": "reproduction",
        },
    )

    # Conditional routing after test reproduction
    workflow.add_conditional_edges(
        "reproduction",
        route_after_reproduction,
        {
            "ownership": "ownership",
            "notify": "notify",
        },
    )

    # Sequential edges for confirmed bugs
    workflow.add_edge("ownership", "work_item")
    workflow.add_edge("work_item", "notify")
    workflow.add_edge("notify", END)

    return workflow.compile()


# Singleton compiled graph
triage_agent = build_triage_graph()


def triage_ticket(ticket: Dict[str, Any]) -> TriageState:
    """
    Executes end-to-end triage on an incoming support ticket or issue report.
    Args:
        ticket: Dictionary containing 'ticket_id', 'customer_email', 'subject', 'body', and optional 'active_bug_flag'.
    """
    initial_state: TriageState = {
        "ticket_id": ticket.get("ticket_id", "TKT-UNKNOWN"),
        "customer_email": ticket.get("customer_email", "anonymous@example.com"),
        "subject": ticket.get("subject", "Support Inquiry"),
        "body": ticket.get("body", ""),
        "active_bug_flag": ticket.get("active_bug_flag"),
        "rag_citations": [],
        "is_quarantined": False,
        "is_working_as_designed": False,
        "slack_alert_sent": False,
        "teams_card_sent": False,
        "triage_notes": "",
    }
    return triage_agent.invoke(initial_state)
