# AutoTriage Product & Incident Triage Specification

## 1. Problem Statement & Operational Context

Modern software engineering organizations encounter critical bottlenecks during continuous integration and multi-stage cloud operations:

1. **Alert Fatigue and False-Positive Blame**: Flaky end-to-end browser tests, container dependency drift, and ephemeral database network latency trigger false alarms. SRE and on-call engineers spend up to 25% of sprint velocity investigating failures that have zero relation to recent application code changes.
2. **Ungrounded Generative AI Hallucination**: Generic LLM assistants lack real-time AST grounding, OpenAPI contract validation, and live runtime reproduction capabilities. When handed a stack trace, they hallucinate non-existent files, suggest invalid syntax, or guess line numbers without verifying against live running services.
3. **Delayed Mean Time to Resolution (MTTR)**: When true regressions occur, engineers must manually correlate distributed W3C telemetry traces, container logs, database transaction snapshots, and historical requirements (PRDs, ADRs) before drafting a patch.

AutoTriage functions as an autonomous reliability and triage engineer, sitting between CI/CD test runners, cloud observability streams, and enterprise issue tracking systems (Azure DevOps Boards, Jira Software). It isolates infrastructure drift, deterministically reproduces test failures, localizes flaws to physical Java AST line boundaries, and drafts verified Pull Requests.

---

## 2. The Core Triage Engine: 8-Path Decision Matrix

Incoming test failure payloads, CI alerts, or bug tickets are evaluated by an 8-path LangGraph decision engine (`agent/src/autotriage/graph/`):

| Path ID | Classification | Trigger Condition | Deterministic Action & Workflow |
| :--- | :--- | :--- | :--- |
| **P1** | **Needs More Info** | Missing error message, stack trace, and endpoint target | Halts execution, requests missing telemetry context, prevents empty ticket creation |
| **P2** | **Quarantine Injection** | Adversarial prompt-injection token or exploit payload detected | Quarantines payload immediately, alerts security operations, aborts tool calls |
| **P3** | **Duplicate Bug** | Active bug ticket with identical error signature exists in backlog | Links incident to existing work item, increments occurrence counter, avoids duplicate clutter |
| **P4** | **Working As Designed (WAD)** | Behavior matches documented PRD, ADR, or acceptance criteria | Resolves as WAD with exact PRD/ADR citation, updates ticket with explanation |
| **P5** | **Cannot Reproduce** | Sandboxed Playwright test execution passes cleanly on rerun | Tags as transient flake, updates test telemetry dashboard, files zero bugs |
| **P6** | **Confirmed Code Bug** | Sandboxed Playwright rerun fails and matches physical code flaw | Localizes root cause via AST RAG to exact Java file and line range, creates ADO/Jira bug |
| **P7** | **Heal & Draft PR** | Confirmed bug with high-confidence AST patch synthesis | Synthesizes verified code patch, validates in sandbox, opens Draft PR with full repro steps |
| **P8** | **Environment Drift** | Failure caused by runner dependency desync or DB outage | Quarantines failure, notifies DevOps maintainer, prevents filing code bug against engineers |

---

## 3. What Engineers See in Mission Control (`/mission-control`)

The glass-box Mission Control cockpit provides real-time visibility into the system:

1. **Active Telemetry Cockpit**: Live cluster health, HTTP error rate, W3C distributed trace spans (`traceparent`), and active Container App replica counts.
2. **Controlled Attack Vectors**: Interactive trigger chips for the 6 reproducible failure modes (Price Injection, Cart Underflow, Concurrency Oversell, Null Shipping NPE, Restock Loop, Admin SQL Smuggling).
3. **BDD Specification Drawer**: Direct mapping between live runtime invariants and Gherkin acceptance criteria (`Given/When/Then`).
4. **1-Click Self-Healing**: Immediate restoration of catalog stock, clearing of tainted cart sessions, and reset of runtime defect flags in under 85 milliseconds.

---

## 4. Hard System Invariants & Governance Rules

* **Zero Developer Blame on Environment Drift**: A test failure caused by a missing runner package (`DRIFT-001`) or a database container cold start must route to `P8` or `P5`. The system strictly prohibits filing code defect tickets against developers for infrastructure failures.
* **Grounding Threshold**: RAG retrievals must meet a 0.85 cosine similarity floor and exact token match against physical Java controller source files. Hallucinated line references are rejected before output synthesis.
* **Evaluation Dataset Isolation**: The 20 benchmark tickets in `evals/datasets/triage_tickets_golden.jsonl` are held out exclusively for scoring and are never indexed into the retrieval corpus (`knowledge/corpus/`).
