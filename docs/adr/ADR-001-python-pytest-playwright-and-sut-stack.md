# ADR-001: Python (`pytest-playwright` + `httpx`) for All SUT E2E/API Testing & Agent Orchestration

- **Status:** Accepted
- **Date:** 2026-10-22
- **Owner:** Safwan Saba

## Context
The original E-Automate portfolio repository used Next.js (TypeScript) and a small set of `.spec.ts` files. However, the strategic goal of **AutoTriage** is to demonstrate **Forward Deployed Engineer (FDE)** and **Applied AI Quality Engineering** capabilities, where a Python LangGraph agent triages customer bug reports, executes existing regression suites, synthesizes new reproduction tests, and verifies code patches via Model Context Protocol (MCP) servers.

## Decision
1. **System Under Test (SUT):** Port E-Automate to a realistic enterprise stack — **Java 21 + Spring Boot 3.4** (`sut/backend-spring`) and **React 18 + Vite** (`sut/frontend-react`).
2. **Test Automation Suite (`sut/e2e/`):** Standardize 100% on **Python (`pytest`, `pytest-playwright`, `httpx`, `pytest-json-report`)** rather than TypeScript Playwright.
3. **Agent & MCP Stack (`agent/`, `mcp_servers/`, `evals/`):** Standardize on Python 3.12+ with `Pydantic v2`, `LangGraph`, and `FastMCP`.

## Consequences
- **Pros:**
  - Single language (**Python**) across test automation, MCP tool servers (`playwright-runner-mcp`), LLM reproduction test synthesis, and evaluation harnesses.
  - Structured JSON test reports (`reports/pytest-report.json`) and failure traces/screenshots are directly consumable by Python Pydantic models without cross-language AST/runner friction.
  - Directly aligns with FDE and AI Quality Engineering hiring requirements.
- **Cons:**
  - Existing `.spec.ts` tests from the old repo are replaced by clean Python `pytest` modules in `sut/e2e/tests/`.
