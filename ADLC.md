# Agentic Development Lifecycle (ADLC) — FDE & Python Quality Engineering

## 1. Unified Python Engineering Stack
AutoTriage enforces a unified **Python** stack across the entire verification and agentic layer:
- **SUT E2E & API Verification (`sut/e2e/`):** `pytest`, `pytest-playwright`, `httpx`, `pytest-json-report`
- **MCP Tool Servers (`mcp_servers/`):** Python `FastMCP` (`playwright_runner`, `repo_tools`, `log_collector`, `workitems`)
- **Agent Orchestration (`agent/`):** Python `LangGraph`, `Pydantic v2`, `FastAPI`
- **Evaluation Harness (`evals/`):** `pytest`, `DeepEval` / `RAGAS`, `Promptfoo` red-teaming

## 2. Lifecycle per Feature / Triage Path
1. **Spec:** Work item + explicit acceptance criteria.
2. **Eval & Test First:** Add or update Python `pytest` / eval cases in `sut/e2e/` or `evals/datasets/` before modifying prompts, graph nodes, or SUT endpoints.
3. **Implementation:** Small PRs (<400 changed lines); single responsibility per PR.
4. **Local Verification:**
   - Spring Boot SUT: `mvn -f sut/backend-spring/pom.xml verify`
   - React SUT: `npm --prefix sut/frontend-react run build`
   - Python E2E + API Suite: `pytest sut/e2e`
5. **CI Gates:** Lint (`ruff`, `eslint`), strict type-checking (`mypy --strict`, `tsc --noEmit`), unit/integration/E2E tests (`pytest`, `mvn verify`), eval regression gate, and security red-team gate (`promptfoo`, `gitleaks`).
6. **Human Review:** Manual code review and HITL approval before merge.
7. **Observability:** Verify traces, latency, and token cost in Langfuse.

## 3. Definition of Done (DoD)
- [x] `docs/porting-inventory.md` complete with full Firebase-to-REST mapping
- [x] Spring Boot 3.4 backend (`sut/backend-spring`) green (`mvn verify`) with Swagger UI (`/swagger-ui/index.html`)
- [x] React 18 frontend (`sut/frontend-react`) green (`tsc --noEmit && vite build`)
- [x] Python `pytest` + `pytest-playwright` E2E & API suite (`sut/e2e`) 100% passing against live SUT
- [ ] MCP servers + LangGraph triage agent connected to `sut/e2e` runner
- [ ] Traced in Langfuse and zero secrets in git (`gitleaks` clean)
