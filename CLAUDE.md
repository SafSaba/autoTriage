# Project: AutoTriage — FDE Agentic Bug-Triage Platform & System Under Test (SUT)

**Positioning & FDE Goal:**
AutoTriage is an end-to-end **Forward Deployed Engineer (FDE) / Applied AI Engineering** flagship system.
- **Agent, MCP Servers, Evals & E2E Test Automation:** **100% Python (`python 3.12+`, `pytest`, `pytest-playwright`, `httpx`, `pydantic`, `LangGraph`, `FastMCP`)**.
- **System Under Test (SUT):** Enterprise **Java 21 Spring Boot 3.4 REST API** + **React 18 (Vite/Tailwind/shadcn)** ported from `reference/e-automate`.

## Core Architecture Rules
1. **Python-First Test & Agent Stack:**
   - All E2E browser automation, API contract tests, and bug-reproduction tests live in `sut/e2e/` and are written exclusively in **Python (`pytest` + `pytest-playwright` + `httpx`)** — NEVER TypeScript Playwright.
   - This allows the Python `playwright-runner-mcp` server and the LangGraph triage agent (`agent/`) to execute, parse (`pytest-json-report`), synthesize, and heal tests in a single unified language.
2. **Reuse-First SUT Port:**
   - UI components, routes, and data shapes (`Product`, `CartItem`, `Order`, `ShippingAddress`, `UserProfile`) are preserved from `reference/e-automate`.
   - Seeded catalog uses the 8 canonical products (`prod_001` .. `prod_008`).
   - Baseline behavior with all runtime bug flags (`BUG_OFF_BY_ONE_DISCOUNT`, `BUG_STALE_CART_CACHE`, `BUG_NULL_SHIPPING_NPE`) set to `false` must be 100% green.
3. **Strict Boundaries:**
   - Never modify anything under `reference/`.
   - Never commit `.env*`, keys, `node_modules`, `.venv`, or `target/`.
   - Every interactive UI element used by tests must expose a stable `data-testid` or semantic label.
