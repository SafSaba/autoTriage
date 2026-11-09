# AutoTriage Engineering Process & Quality Gates

## 1. Unified Local Verification Suite

Before submitting any code change, engineers run the complete verification suite across the three application tiers:

1. **Spring Boot Backend Verification**:
   ```bash
   mvn -f sut/backend-spring/pom.xml clean test
   ```
   *Verifies Java compilation, Spring slicing tests, Flyway migrations, and JPA repository invariants.*

2. **React Frontend Verification**:
   ```bash
   cd sut/frontend-react && npm run build
   ```
   *Verifies TypeScript strict type-checking and production Vite asset bundling.*

3. **End-to-End & Triage Engine Verification**:
   ```bash
   cd sut/e2e && uv run pytest
   ```
   *Executes the Playwright browser suite, contract tests, and fault-injection verifications.*

4. **Golden Dataset Benchmark Gate**:
   ```bash
   python3 evals/eval_golden_dataset.py
   ```
   *Asserts that decision path accuracy on the 20 canonical incident tickets meets or exceeds the 95% threshold.*

---

## 2. Milestone Planning & Implementation Workflow

Every major feature, fault-injection vector, or agent capability follows a strict phase-gated lifecycle:

### Step 1: Design & Scope
* Document the architectural boundaries, database schema changes, and REST contracts before writing code.
* Define explicit success criteria for each phase (unit test assertion, HTTP status code, Playwright element check).

### Step 2: Implementation & Isolated Testing
* Implement changes incrementally, running only the focused test file during development (e.g., `uv run pytest tests/test_checkout.py`).
* Verify each success criterion against live running services.

### Step 3: Verification & Logbook Update
* Run the unified local verification suite.
* Update `docs/STATUS.md` with the exact execution metrics, latencies, and findings.
* Commit changes using standard, human-readable commit messages.

---

## 3. Non-Negotiable Engineering Rules

1. **Deterministic Unit Testing**: Unit and integration tests must never make outbound calls to live frontier LLMs. Use deterministic mocks, local AST fixtures, or the FastMCP stub interfaces.
2. **Never Bypass Git Hooks**: Do not use `git commit --no-verify`. Pre-commit checks ensure that no syntax errors or unformatted files enter the git tree.
3. **No Lowering of Quality Thresholds**: Never disable a compiler warning, lower a test assertion, or exclude a source file to force a green build. If an invariant fails, resolve the root cause.
4. **Evaluation Set Quarantine**: The benchmark scenarios in `evals/datasets/triage_tickets_golden.jsonl` are held out exclusively for scoring. They must never be indexed into the RAG corpus or referenced directly in agent prompts.
5. **Clean Repository Hygiene**: Never commit transient local artifacts, editor configurations, or environment files (`.env`, `target/`, `node_modules/`, `.venv/`).
