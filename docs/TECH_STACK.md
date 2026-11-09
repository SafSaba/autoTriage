# AutoTriage Technology Stack & Architecture Map

## 1. Directory & Component Mapping

| Directory | Stack & Framework | Primary Responsibilities |
| :--- | :--- | :--- |
| **`sut/backend-spring/`** | Java 21, Spring Boot 3.4, Maven, Spring Data JPA, Flyway | E-commerce REST backend, order transactions, JWT bearer security, 6 fault-injection endpoints, and Flyway database migrations (`V1` through `V4`). |
| **`sut/frontend-react/`** | React 18, Vite, TypeScript, Tailwind CSS, shadcn UI | Customer storefront, responsive checkout funnel, admin inventory console, and the glass-box FDE Mission Control telemetry cockpit (`/mission-control`). |
| **`sut/e2e/`** | Python 3.10+, uv, Pytest, Playwright | Over 70 automated test cases covering browser UI flows, REST API contracts, shift-left synthetic tests, and PostgreSQL ACID invariants. |
| **`agent/src/autotriage/`** | Python 3.11+, LangGraph, Pydantic | Core autonomous triage engine: 8-path state machine (`graph/`), security guardrails (`security/`), hotfix synthesis (`engine/`), and test publisher. |
| **`mcp_servers/`** | FastMCP, Python 3.11+ | 5 decoupled Model Context Protocol (MCP) tool servers: `rag`, `workitems`, `playwright_runner`, `observability`, and `notify`. |
| **`knowledge/`** | Markdown, JSON, JSONL | Grounding corpus: PRDs (`PRD-001` to `PRD-006`), ADRs (`ADR-001`, `ADR-008`), indexed Java AST code chunks, and Jira/ADO backlog items. |
| **`evals/`** | Python, JSONL | Golden benchmark dataset (`triage_tickets_golden.jsonl`) and evaluation harness (`eval_golden_dataset.py`) for CI accuracy gating. |

---

## 2. Component Technical Specifications

### A. Backend Microservice (`sut/backend-spring/`)
* **Runtime**: Java 21 LTS, Spring Boot 3.4.1.
* **Database & Persistence**: PostgreSQL 16 (Neon Serverless in cloud, Docker Compose / in-memory H2 in local development).
* **Migration Ledger**: Managed via Flyway:
  * `V1__init.sql`: Core tables (`users`, `products`, `cart_items`, `orders`, `order_items`, `contact_messages`).
  * `V2__seed.sql`: Canonical catalog items with idempotent `ON CONFLICT (id) DO NOTHING` protection.
  * `V3__indexes_and_contact.sql`: Performance query indexes and contact audit schema.
  * `V4__fde_knowledge_and_audit_ledger.sql`: Incident audit ledger and episodic memory tables.
* **Security**: Stateless JWT (`io.jsonwebtoken:jjwt`), HMAC-SHA256 bearer tokens, role-based authorization (`ROLE_CUSTOMER`, `ROLE_ADMIN`).
* **API Documentation**: SpringDoc OpenAPI 3.0 serving contracts at `/v3/api-docs` and `/swagger-ui/index.html`.

### B. Frontend Application (`sut/frontend-react/`)
* **Runtime**: React 18.3, Vite 5.x, TypeScript (strict mode enabled).
* **Styling**: Tailwind CSS with dark-mode telemetry themes.
* **State Management**: Context-based `AuthProvider` and `CartProvider` featuring debounced atomic synchronization to prevent race conditions during rapid user clicks.
* **Production Proxy**: Containerized via Nginx reverse proxy routing `/api/*` traffic to the backend.

### C. End-to-End Test Suite (`sut/e2e/`)
* **Execution Engine**: Pytest with `pytest-playwright` running against headless Chromium.
* **Dependency Isolation**: Managed exclusively through `uv` (`pyproject.toml` and `uv.lock`).
* **Failure Telemetry**: Automated screenshot capture and HTML DOM dump on test assertion failure configured in `conftest.py`.

### D. LangGraph Triage Agent (`agent/`)
* **State Engine**: Compiled LangGraph state machine maintaining state across intake, sanitization, security evaluation, retrieval, reproduction, and PR drafting.
* **Security Firewall**: Deterministic regex secret scrubber (`sanitize.py`) masking API tokens, bearer keys, and credentials, paired with an injection detector (`injection.py`) quarantining adversarial prompt exploits.

### E. FastMCP Microservice Tooling Layer (`mcp_servers/`)
* **`mcp_servers/rag/server.py`**: FastMCP service implementing hybrid BM25 Okapi lexical scoring and cosine vector retrieval.
* **`mcp_servers/observability/server.py`**: FastMCP service interfacing with Azure Application Insights KQL queries and W3C `traceparent` trace parsing.
* **`mcp_servers/playwright_runner/server.py`**: FastMCP service executing headless test runs and capturing step-by-step logs and execution times.
* **`mcp_servers/workitems/server.py`**: FastMCP service synchronizing with Azure DevOps Boards (`_apis/wit/workitems`) and Jira Cloud REST APIs.
* **`mcp_servers/notify/server.py`**: FastMCP service dispatching formatted incident summaries and root-cause analyses.

---

## 3. Port & Service Network Allocation

| Service | Protocol / Port | Target Environment / Binding |
| :--- | :--- | :--- |
| **Spring Boot REST API** | HTTP `:8080` | Local `localhost:8080`, Container App internal port |
| **React Vite Frontend** | HTTP `:5173` | Local `localhost:5173`, Nginx container port `80` |
| **PostgreSQL Database** | TCP `:5432` | Local Docker container, Neon Serverless cloud host |
| **Redis Cache** | TCP `:6379` | Local Docker container (session and lock cache) |
| **FastMCP Tool Endpoints** | STDIO / HTTP | Subprocess execution or containerized sidecar |
