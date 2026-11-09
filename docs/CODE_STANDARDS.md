# AutoTriage Code Standards & Architectural Invariants

## 1. General Principles

1. **Keep it simple; do not overcomplicate**: Prefer direct, readable code over abstract layers that add no immediate value.
2. **Comments only when necessary**: Code should be self-documenting. Use comments solely to explain non-obvious business invariants, race-condition mitigations, or security requirements.
3. **Concise documentation and commit messages**: Maintain professional technical documentation. Strictly zero emojis across documentation, code comments, and git commit logs.
4. **Avoid overly defensive code**: Validate inputs strictly at architectural boundaries (API DTO validation, secret sanitizers). Avoid cluttering internal methods with redundant `null` checks where framework contracts guarantee presence.
5. **Python dependency and execution standard**: Always use `uv`. Execute scripts and tests via `uv run` (e.g., `uv run pytest`), never bare `python3` or global `pip`.
6. **TypeScript type safety**: Strict mode is enforced across the frontend. Never use `any`; define explicit interfaces or use generic constraints.
7. **Java 21 standards**: Use immutable `record` types for all API request and response DTOs. Enforce constructor-based dependency injection and avoid field injection (`@Autowired` on private fields).

---

## 2. Structure: One Way to Do Each Thing

To maintain strict modularity and prevent architectural erosion, every subsystem follows a single designated pathway:

* **Frontend to Backend Communication**:
  The React application communicates with the backend exclusively through `sut/frontend-react/src/lib/api.ts`. Direct `fetch` or `axios` calls within UI components are prohibited.
* **Shopping Cart State & Persistence**:
  Cart mutations flow exclusively through `CartProvider.tsx`, which enforces atomic sequencing and debouncing before dispatching sync payloads to `CartController.java`.
* **Agent Tooling & External Integration**:
  The LangGraph decision engine communicates with external systems (observability, test runners, issue tracking, knowledge bases) exclusively through the 5 FastMCP servers in `mcp_servers/`. The agent core contains no direct HTTP client calls to third-party APIs.
* **Controlled Defect Simulation & Reset**:
  All runtime defect toggles are managed exclusively by `BugFlagsService.java`. State resets and catalog rollbacks must execute transactionally through the `POST /api/fde/heal` endpoint in `FdeAgenticController.java`.
* **Repository Relative Paths**:
  Every file path in test fixtures, scripts, documentation, and configuration files must be relative to the repository root. Absolute paths containing local workstation directories are strictly prohibited.
* **Configuration & Secret Handling**:
  Environment variables are loaded through standard property sources (`application.yml`, `.env`). Hardcoded credentials, bearer tokens, or database connection strings in source code will fail CI verification gates.
