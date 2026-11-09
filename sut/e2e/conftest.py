import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Generator, Optional
import httpx
import pytest
from playwright.sync_api import Page, BrowserContext

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_ARTIFACTS_DIR = BASE_DIR / "sut" / "frontend-react" / "public" / "artifacts"
LATEST_FRAME_PATH = FRONTEND_ARTIFACTS_DIR / "latest_repro_frame.png"
LATEST_REPRO_JSON = FRONTEND_ARTIFACTS_DIR / "latest_repro.json"

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
    1. All 3 AutoTriage runtime bug flags turned OFF (clean baseline) unless AUTOTRIAGE_PRESERVE_FLAGS=1 is set.
    2. All 8 canonical E-Automate products and stock levels restored.
    3. Buyer's shopping cart cleared.
    """
    preserve_flags = os.getenv("AUTOTRIAGE_PRESERVE_FLAGS") == "1"
    if not preserve_flags:
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
    if not preserve_flags:
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


class ReproTracker:
    def __init__(self, test_name: str, page: Optional[Page] = None):
        self.test_name = test_name
        self.page = page
        self.steps: list[dict[str, Any]] = []
        FRONTEND_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    def record_step(self, action: str, expected: str = "", status: str = "passed", actual: str = ""):
        step_num = len(self.steps) + 1
        entry = {
            "step": f"Step {step_num}",
            "action": action,
            "expected": expected,
            "actual": actual,
            "status": status,
            "timestamp": time.time(),
        }
        self.steps.append(entry)
        self.capture_frame()
        self.persist()

    def capture_frame(self):
        if self.page:
            try:
                FRONTEND_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
                self.page.screenshot(path=str(LATEST_FRAME_PATH), full_page=True)
            except Exception:
                pass

    def persist(self, failed: bool = False, error: str = ""):
        try:
            FRONTEND_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
            payload = {
                "test_id": self.test_name,
                "repro_steps": self.steps,
                "screenshot_url": "/artifacts/latest_repro_frame.png" if LATEST_FRAME_PATH.exists() else None,
                "failed": failed,
                "error": error,
                "updated_at": time.time(),
            }
            with open(LATEST_REPRO_JSON, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception:
            pass


@pytest.fixture
def repro_tracker(request: pytest.FixtureRequest) -> Generator[ReproTracker, None, None]:
    tracker = ReproTracker(test_name=request.node.nodeid)
    setattr(request.node, "_repro_tracker", tracker)
    yield tracker
    failed = hasattr(request.node, "rep_call") and request.node.rep_call.failed
    error_msg = str(getattr(request.node.rep_call, "longrepr", "")) if failed else ""
    tracker.persist(failed=failed, error=error_msg)


@pytest.fixture
def page(context: BrowserContext, frontend_url: str, request: pytest.FixtureRequest) -> Generator[Page, None, None]:
    """
    Provides a clean Playwright Page per test and captures screenshots:
    1. Writes to reports/screenshots/<test_name>.png
    2. Writes to sut/frontend-react/public/artifacts/latest_repro_frame.png for live Mission Control Viewport.
    """
    pg = context.new_page()
    pg.set_default_timeout(15000)

    # Attach tracker if requested or create an implicit tracker
    tracker = getattr(request.node, "_repro_tracker", None)
    if not tracker:
        tracker = ReproTracker(test_name=request.node.nodeid, page=pg)
        setattr(request.node, "_repro_tracker", tracker)
    else:
        tracker.page = pg

    # Attach convenient step recording method on page object
    def record_step(action: str, expected: str = "", status: str = "passed", actual: str = ""):
        tracker.record_step(action=action, expected=expected, status=status, actual=actual)

    setattr(pg, "record_step", record_step)

    yield pg

    if hasattr(request.node, "rep_call") and request.node.rep_call.failed:
        os.makedirs("reports/screenshots", exist_ok=True)
        safe_name = request.node.name.replace("/", "_").replace(":", "_")
        try:
            pg.screenshot(path=f"reports/screenshots/{safe_name}.png", full_page=True)
        except Exception:
            pass
        try:
            FRONTEND_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
            pg.screenshot(path=str(LATEST_FRAME_PATH), full_page=True)
        except Exception:
            pass
        tracker.persist(failed=True, error=str(getattr(request.node.rep_call, "longrepr", "")))
    elif LATEST_FRAME_PATH.exists():
        tracker.persist(failed=False)

    pg.close()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    setattr(item, "rep_" + rep.when, rep)
