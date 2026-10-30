# AutoTriage Runbook: How to Replicate Environment Drift & Flaky Tests

This runbook gives you the exact **breakpoints** and terminal commands to trigger and demonstrate real-life **Environment Drift** and **Flaky Test / Infra Outages** in Azure DevOps pipelines.

---

## 1. Case Study 1: CI Runner Environment Drift (Build #7 Regression)

* **Azure Boards Ticket**: [Bug #34: [DRIFT-001] CI Runner Dependency Desync](https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/34)
* **Parent User Story**: [US-403: CI/CD Anti-Flake & Environment Drift Quarantine Gate](https://dev.azure.com/isafwan/AutoTriage/_workitems/edit/33)
* **Category**: `ENVIRONMENT_DRIFT` (NOT a Code Defect)

### Breakpoint & Trigger Commands

To replicate this exact failure during a live demo:

```bash
# BREAKPOINT 1: Simulate runner dependency desync by removing a package from runner venv
/Users/lion/myagent/_work/1/s/sut/e2e/.venv/bin/pip uninstall -y rank-bm25

# BREAKPOINT 2: Trigger the Azure DevOps Pipeline
az pipelines run --name AutoTriage-Smoke-Pipeline --branch main
```

### What Happens in Azure DevOps:
1. The pipeline runs `uv run pytest -m smoke`.
2. Pytest throws `ModuleNotFoundError: No module named 'rank_bm25'`.
3. **The Interview Punchline**: 
   > *"A naive AI looks at `tests/test_langgraph_agent.py` in the stack trace and files a code bug against the developer who wrote the test. AutoTriage's Pre-Triage Gate inspects the failure signature, flags it as `ENVIRONMENT_DRIFT`, alerts the DevOps runner maintainer, and prevents filing a false bug in Sprint 4."*

### How to Heal:
```bash
# Auto-Heal: Re-sync lockfile dependencies into the runner's environment
cd /Users/lion/myagent/_work/1/s/sut/e2e && uv sync
```

---

## 2. Case Study 2: Infrastructure Outage / Database Cold-Start (Item 4)

* **Category**: `INFRA_OUTAGE` / `FLAKY_TIMEOUT`

### Breakpoint & Trigger Commands

To simulate a database outage or cold-start network drop:

```bash
# BREAKPOINT 1: Stop the SUT PostgreSQL database
docker stop autotriage-db-1

# BREAKPOINT 2: Run smoke tests against the SUT
cd /Users/lion/Projects/autotriage/sut/e2e
uv run pytest tests/test_api_and_bugs.py -m smoke
```

### What Happens:
1. Tests fail with `httpx.ConnectError: [Errno 61] Connection refused` or HTTP 500 DB connection pool exhaustion.
2. AutoTriage detects that the relational database container on port `5432` is unreachable.
3. **Verdict**: `INFRA_OUTAGE (Postgres Port 5432 Offline)`.
4. **Action**: Dispatches an infrastructure health alert instead of creating a code regression ticket.

### How to Heal:
```bash
# Restart the database container
docker compose up -d db
```

---

## 3. Case Study 3: Flaky Test Transient Network Blip (Quorum Retry)

### How AutoTriage Detects It:
1. If a Playwright UI test fails due to a transient 2000ms frontend render timeout, AutoTriage immediately re-runs **only that specific failed test** in an isolated retry pass.
2. If the retry **passes**, AutoTriage classifies it as:
   * **Tag**: `FLAKY_TRANSIENT_TIMEOUT`
   * **Action**: Quarantines the test metric to the **Test Health Telemetry Dashboard**.
   * **Backlog Protection**: **Zero bugs created in Sprint 4**, keeping the team's burndown clean!
