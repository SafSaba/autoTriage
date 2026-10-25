"""
mcp_servers/playwright_runner/server.py - FastMCP Playwright & Pytest Execution Server
=====================================================================================
Enables the AutoTriage agent to act as an automated Quality Engineer:
1. Discovering relevant automated tests across the E2E, REST API, and DB suites
2. Dynamically toggling SUT fault-injection bug flags
3. Executing target tests in isolated subprocesses
4. Parsing failure assertions, stack traces, and test statuses
"""

import ast
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.mcpserver import MCPServer

app = MCPServer("autotriage-playwright-runner")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
E2E_DIR = BASE_DIR / "sut" / "e2e"
TESTS_DIR = E2E_DIR / "tests"

API_URL = os.getenv("API_URL", "http://localhost:8080")
ADMIN_EMAIL = "admin@autotriage.local"
ADMIN_PASSWORD = "AdminPassword123!"


def get_admin_token() -> Optional[str]:
    """Retrieves an admin JWT token from the SUT API."""
    try:
        with httpx.Client(base_url=API_URL, timeout=5.0) as client:
            resp = client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
            if resp.status_code == 200:
                return resp.json().get("token")
    except Exception:
        pass
    return None


def set_sut_bug_flag(flag_name: str, enabled: bool) -> bool:
    """Toggles a runtime fault-injection flag on the Spring Boot SUT."""
    token = get_admin_token()
    if not token:
        return False
    try:
        with httpx.Client(base_url=API_URL, timeout=5.0) as client:
            resp = client.put(
                "/api/admin/bugs",
                headers={"Authorization": f"Bearer {token}"},
                json={flag_name: enabled},
            )
            return resp.status_code == 200
    except Exception:
        return False


@app.tool()
def search_tests(query: str, test_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Scans the pytest suite to find relevant tests matching a feature, symptom, or bug.
    Args:
        query: Search term (e.g. 'cart', 'discount', '0002', 'npe', 'shipping', 'tax').
        test_type: Optional category filter ('ui', 'api', 'database', 'bug_repro').
    """
    matches = []
    q_tokens = query.lower().split()

    if not TESTS_DIR.exists():
        return []

    for test_file in sorted(TESTS_DIR.glob("test_*.py")):
        rel_path = f"tests/{test_file.name}"
        try:
            with open(test_file, "r", encoding="utf-8") as f:
                content = f.read()
                tree = ast.parse(content)

            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
                    docstring = ast.get_docstring(node) or ""
                    test_id = f"{rel_path}::{node.name}"

                    # Detect markers from decorators or filename
                    detected_type = "ui"
                    if "api" in test_file.name or "bugs" in test_file.name:
                        detected_type = "api"
                    elif "database" in test_file.name:
                        detected_type = "database"
                    elif "rag" in test_file.name or "mcp" in test_file.name:
                        detected_type = "mcp"

                    if test_type and test_type.lower() not in detected_type:
                        continue

                    searchable = f"{test_file.name} {node.name} {docstring}".lower()
                    if any(t in searchable for t in q_tokens):
                        matches.append({
                            "test_id": test_id,
                            "function_name": node.name,
                            "file": rel_path,
                            "type": detected_type,
                            "docstring": docstring.strip(),
                        })
        except Exception:
            continue

    return matches


@app.tool()
def run_test(
    test_path: str,
    bug_flag: Optional[str] = None,
    timeout_sec: int = 45,
) -> Dict[str, Any]:
    """
    Executes a targeted pytest scenario against the live SUT and returns structured reproduction results.
    Args:
        test_path: The pytest path (e.g. 'tests/test_api_and_bugs.py::test_autotriage_three_runtime_bug_flags').
        bug_flag: Optional runtime fault-injection flag to enable during the test (e.g. 'BUG_OFF_BY_ONE_DISCOUNT').
        timeout_sec: Maximum execution timeout in seconds.
    """
    # 1. Optionally toggle bug flag ON
    flag_activated = False
    if bug_flag:
        flag_activated = set_sut_bug_flag(bug_flag, True)

    start_time = time.time()
    try:
        # 2. Run pytest in sut/e2e
        cmd = f"uv run pytest {test_path} --tb=short -q"
        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=str(E2E_DIR),
            text=True,
            capture_output=True,
            timeout=timeout_sec,
        )
        duration = round(time.time() - start_time, 2)
        status = "PASSED" if proc.returncode == 0 else "FAILED"

        # 3. Extract error assertion if failed
        error_summary = None
        if status == "FAILED":
            lines = proc.stdout.splitlines() + proc.stderr.splitlines()
            error_lines = [l for l in lines if "E   " in l or "FAILED " in l or "Error: " in l]
            error_summary = "\n".join(error_lines[-5:]) if error_lines else proc.stdout[-500:]

        return {
            "status": status,
            "exit_code": proc.returncode,
            "duration_sec": duration,
            "test_path": test_path,
            "bug_flag_applied": bug_flag if flag_activated else None,
            "error_summary": error_summary,
            "stdout": proc.stdout[-1500:] if proc.stdout else "",
            "stderr": proc.stderr[-500:] if proc.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "TIMEOUT",
            "exit_code": -1,
            "duration_sec": timeout_sec,
            "test_path": test_path,
            "error_summary": f"Test timed out after {timeout_sec} seconds.",
        }
    finally:
        # Always restore clean baseline SUT state
        if bug_flag:
            set_sut_bug_flag(bug_flag, False)


@app.tool()
def toggle_sut_bug_flag(flag_name: str, enabled: bool) -> Dict[str, Any]:
    """
    Directly toggles a runtime fault-injection flag on the Spring Boot backend.
    Supported flags: 'BUG_OFF_BY_ONE_DISCOUNT', 'BUG_STALE_CART_CACHE', 'BUG_NULL_SHIPPING_NPE'.
    """
    success = set_sut_bug_flag(flag_name, enabled)
    return {
        "success": success,
        "flag_name": flag_name,
        "enabled": enabled,
        "message": f"Bug flag {flag_name} set to {enabled}." if success else "Failed to toggle bug flag (backend unreachable or unauthorized).",
    }


@app.tool()
def get_sut_bug_flags() -> Dict[str, Any]:
    """Retrieves the current state of all SUT runtime bug flags."""
    token = get_admin_token()
    if not token:
        return {"error": "Failed to authenticate with backend."}
    try:
        with httpx.Client(base_url=API_URL, timeout=5.0) as client:
            resp = client.get("/api/admin/bugs", headers={"Authorization": f"Bearer {token}"})
            if resp.status_code == 200:
                return {"flags": resp.json()}
    except Exception as e:
        return {"error": str(e)}
    return {"error": "Unknown error retrieving bug flags."}


if __name__ == "__main__":
    app.run()
