import json
from pathlib import Path
import httpx
import pytest

ROOT_DIR = Path(__file__).resolve().parents[3]
SUT_DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "sut_test_data.json"
RAG_CORPUS_FILE = ROOT_DIR / "knowledge" / "corpus" / "rag_knowledge_chunks.jsonl"
GOLDEN_EVAL_FILE = ROOT_DIR / "evals" / "datasets" / "triage_tickets_golden.jsonl"


@pytest.mark.api
@pytest.mark.smoke
def test_json_test_data_matches_live_spring_boot_catalog(api_client: httpx.Client):
    """
    Validates that sut/e2e/data/sut_test_data.json is 100% synchronized with the live
    Spring Boot /api/products catalog (IDs, names, categories, prices, and stock).
    """
    assert SUT_DATA_FILE.exists(), f"Missing {SUT_DATA_FILE}"
    data = json.loads(SUT_DATA_FILE.read_text())

    live_products = {p["id"]: p for p in api_client.get("/api/products").json()}
    assert len(live_products) == len(data["products"]) == 8

    for expected in data["products"]:
        pid = expected["id"]
        assert pid in live_products
        actual = live_products[pid]
        assert actual["name"] == expected["name"]
        assert actual["category"] == expected["category"]
        assert actual["price"] == expected["price"]
        assert actual["stock"] == expected["stock"]


@pytest.mark.api
def test_rag_knowledge_corpus_and_golden_eval_datasets_integrity():
    """
    Validates the Agentic RAG corpus (knowledge/corpus/rag_knowledge_chunks.jsonl)
    and Golden Triage Eval dataset (evals/datasets/triage_tickets_golden.jsonl):
    1. Every JSONL line parses cleanly and contains required schema keys.
    2. Every 'expected_rag_citation' in golden tickets exists in the RAG knowledge corpus.
    3. Every 'expected_test_to_run' in golden tickets points to an actual pytest file in sut/e2e/.
    """
    assert RAG_CORPUS_FILE.exists(), f"Missing {RAG_CORPUS_FILE}"
    assert GOLDEN_EVAL_FILE.exists(), f"Missing {GOLDEN_EVAL_FILE}"

    rag_docs = [json.loads(line) for line in RAG_CORPUS_FILE.read_text().splitlines() if line.strip()]
    assert len(rag_docs) >= 6
    rag_doc_ids = {doc["doc_id"] for doc in rag_docs}

    for doc in rag_docs:
        for required_key in ("doc_id", "doc_type", "title", "content", "related_routes"):
            assert required_key in doc, f"Missing {required_key} in {doc}"

    golden_tickets = [json.loads(line) for line in GOLDEN_EVAL_FILE.read_text().splitlines() if line.strip()]
    assert len(golden_tickets) >= 7

    e2e_root = Path(__file__).resolve().parents[1]
    for ticket in golden_tickets:
        for key in ("ticket_id", "subject", "body", "expected_path", "expected_classification"):
            assert key in ticket, f"Missing {key} in ticket {ticket}"

        if ticket.get("expected_rag_citation"):
            assert ticket["expected_rag_citation"] in rag_doc_ids, (
                f"Ticket {ticket['ticket_id']} cites unknown doc_id {ticket['expected_rag_citation']}"
            )

        if ticket.get("expected_test_to_run"):
            test_file = ticket["expected_test_to_run"].split("::")[0]
            assert (e2e_root / test_file).exists(), (
                f"Ticket {ticket['ticket_id']} references missing test file {test_file}"
            )
