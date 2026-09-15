# AutoTriage — Python `pytest` + `pytest-playwright` E2E & API Test Suite

This directory (`sut/e2e/`) contains the **Python-first** end-to-end browser and REST API test suite for the ported **E-Automate** System Under Test (Spring Boot `:8080` + React `:5173`).

> **Why Python (`pytest-playwright` + `httpx`)?**
> AutoTriage is an FDE / Applied AI Quality Engineering system. Keeping the E2E suite, the MCP `playwright-runner` server, the LangGraph triage agent (`agent/`), and the evaluation harness (`evals/`) in **100% Python** allows the agent to run existing regression specs, parse structured JSON reports (`reports/pytest-report.json`), synthesize failing reproduction tests, and verify fixes using a single unified toolchain.

---

## 1. Test Modules & Scenarios (`tests/`)

| File | Markers | Scenarios Covered |
| :--- | :--- | :--- |
| `tests/test_navigation.py` | `ui`, `smoke` | Root redirect (`/` -> `/products`), Header/Logo/Footer rendering, Customer Support `/contact` form submission & toast verification |
| `tests/test_auth.py` | `ui`, `smoke` | Email/password Login & Logout, 1-Click Quick Demo Buyer Login (`buyer@autotriage.local`), New User Sign Up (`/signup`), Profile & Shipping Address update + DB persistence across page reload |
| `tests/test_products.py` | `ui`, `smoke` | 8-product catalog load, keyword search (`Chronograph`), category filtering (`Laptops`), Clear Filters button, Product Detail page (`/products/prod_001`) price/tax/total & stock badge (`15 in stock`) |
| `tests/test_cart.py` | `ui`, `smoke` | Unauthenticated Add-to-Cart guard (toast + redirect to `/login`), Authenticated Add-to-Cart, quantity increment (`2x`), 10% tax & subtotal/total calculation, item removal |
| `tests/test_checkout.py` | `ui`, `smoke` | Full E2E purchase flow (`/products/prod_002` -> `/cart` -> `/checkout` -> `/checkout/payment` -> `/checkout/summary` -> `/order-confirmation/:orderId`), backend stock decrement check (`25` -> `23`), and Order History (`/orders`) verification |
| `tests/test_admin.py` | `ui`, `admin` | 1-Click Admin login (`admin@autotriage.local`), 4-tab Admin Dashboard (`Orders`, `Products`, `Messages`, `Bug Flags`), Add/Publish new product, Delete product, Bug Flag switch visibility |
| `tests/test_api_and_bugs.py` | `api`, `smoke`, `bug_repro` | Direct `httpx` REST contract checks (`401`, `403`, `400`, `404`), Guest Cart Sync (`POST /api/cart/sync`), Stock Overflow (`409 Conflict`), Order Cancellation Stock Restoration (`PUT /api/admin/orders/{id}/status`), and deterministic reproduction of all 3 AutoTriage runtime bug flags (`BUG_OFF_BY_ONE_DISCOUNT`, `BUG_STALE_CART_CACHE`, `BUG_NULL_SHIPPING_NPE`) |

---

## 2. How to Run the Tests

Make sure the Spring Boot backend (`:8080`) and React frontend (`:5173`) are running, then from `/Users/lion/Projects/autotriage/sut/e2e`:

### Run All 15 Tests (Headless Chromium + API)
```bash
cd /Users/lion/Projects/autotriage/sut/e2e
.venv/bin/pytest
```

### Run in Headed Browser Mode (Watch Chrome Execute Live)
```bash
cd /Users/lion/Projects/autotriage/sut/e2e
.venv/bin/pytest --headed --slowmo=300
```

### Run Specific Suites by Marker
```bash
# Fast smoke suite only
.venv/bin/pytest -m smoke

# Browser UI Playwright tests only
.venv/bin/pytest -m ui

# REST API + AutoTriage Bug Reproduction tests only
.venv/bin/pytest -m "api or bug_repro"
```

### View Generated Reports
Every run automatically writes:
- **JSON Report (for AutoTriage MCP Runner):** `sut/e2e/reports/pytest-report.json`
- **Self-Contained HTML Report:** `sut/e2e/reports/pytest-report.html` (open in any browser: `open reports/pytest-report.html`)
- **Failure Screenshots:** `sut/e2e/reports/screenshots/`
