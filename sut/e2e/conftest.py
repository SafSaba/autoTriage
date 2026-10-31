import os
from typing import Dict, Generator
import httpx
import pytest
from playwright.sync_api import Page, BrowserContext

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
API_URL = os.getenv("API_URL", "http://localhost:8080")

ADMIN_EMAIL = "admin@autotriage.local"
ADMIN_PASSWORD = "AdminPassword123!"

BUYER_EMAIL = "buyer@autotriage.local"
BUYER_PASSWORD = "BuyerPassword123!"

JANE_EMAIL = "jane.doe@autotriage.local"
JANE_PASSWORD = "BuyerPassword123!"


@pytest.fixture(scope="session")
def frontend_url() -> str:
    return FRONTEND_URL.rstrip("/")


@pytest.fixture(scope="session")
def api_url() -> str:
    return API_URL.rstrip("/")


@pytest.fixture(scope="session")
def api_client(api_url: str) -> Generator[httpx.Client, None, None]:
    with httpx.Client(base_url=api_url, timeout=60.0) as client:
        yield client


def get_jwt_token(client: httpx.Client, email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["token"]


@pytest.fixture(scope="session")
def admin_token(api_client: httpx.Client) -> str:
    return get_jwt_token(api_client, ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def buyer_token(api_client: httpx.Client) -> str:
    return get_jwt_token(api_client, BUYER_EMAIL, BUYER_PASSWORD)


@pytest.fixture(scope="session")
def admin_headers(admin_token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def buyer_headers(buyer_token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {buyer_token}"}


@pytest.fixture(autouse=True)
def reset_sut_state(api_client: httpx.Client, admin_headers: Dict[str, str], buyer_headers: Dict[str, str]):
    """
    Ensures every test starts with:
    1. All 3 AutoTriage runtime bug flags turned OFF (clean baseline).
    2. All 8 canonical E-Automate products and stock levels restored.
    3. Buyer's shopping cart cleared.
    """
    api_client.put(
        "/api/admin/bugs",
        headers=admin_headers,
        json={
            "BUG_OFF_BY_ONE_DISCOUNT": False,
            "BUG_STALE_CART_CACHE": False,
            "BUG_NULL_SHIPPING_NPE": False,
        },
    )
    api_client.post("/api/products/reset", headers=admin_headers)
    api_client.delete("/api/cart", headers=buyer_headers)
    yield
    # Guarantee bug flags are left OFF even if a test fails mid-execution
    api_client.put(
        "/api/admin/bugs",
        headers=admin_headers,
        json={
            "BUG_OFF_BY_ONE_DISCOUNT": False,
            "BUG_STALE_CART_CACHE": False,
            "BUG_NULL_SHIPPING_NPE": False,
        },
    )


@pytest.fixture
def page(context: BrowserContext, frontend_url: str, request: pytest.FixtureRequest) -> Generator[Page, None, None]:
    """
    Provides a clean Playwright Page per test and captures a screenshot in reports/ on failure.
    """
    pg = context.new_page()
    pg.set_default_timeout(15000)
    yield pg
    if hasattr(request.node, "rep_call") and request.node.rep_call.failed:
        os.makedirs("reports/screenshots", exist_ok=True)
        safe_name = request.node.name.replace("/", "_").replace(":", "_")
        pg.screenshot(path=f"reports/screenshots/{safe_name}.png", full_page=True)
    pg.close()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    setattr(item, "rep_" + rep.when, rep)
