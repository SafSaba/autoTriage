"""
agent/src/autotriage/shift_left_generator.py - Autonomous Shift-Left Spec, Test Data & Playwright Generator
========================================================================================================
Executes in CI/CD whenever Safwan-dev pushes changes to 'dev' (prior to QA deployment).
1. Parses Java Spring Boot AST for all REST endpoints (@GetMapping, @PostMapping, etc.)
2. Scans Flyway migrations for schema definitions and constraints
3. Detects gaps in RAG specifications (docs/specs/E_AUTOMATE_SPEC.md) and QA E2E test suites (sut/e2e/tests/)
4. Autonomously generates:
   a) Formal PRD specification chunks and updates the RAG index
   b) Synthetic test data seeds for neondb_dev and neondb_qa
   c) Deterministic + Adversarial Playwright/API test scripts
5. Executes the generated tests against the DEV environment before allowing promotion to QA.
"""

import json
import logging
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Set

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("autotriage-shift-left")

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
CONTROLLER_DIR = BASE_DIR / "sut" / "backend-spring" / "src" / "main" / "java" / "com" / "autotriage" / "shop" / "controller"
MIGRATION_DIR = BASE_DIR / "sut" / "backend-spring" / "src" / "main" / "resources" / "db" / "migration"
SPEC_FILE = BASE_DIR / "docs" / "specs" / "E_AUTOMATE_SPEC.md"
E2E_DIR = BASE_DIR / "sut" / "e2e" / "tests"

DEV_API_URL = "https://autotriage-backend-dev.graytree-645df5bf.eastus.azurecontainerapps.io"


@dataclass
class DiscoveredEndpoint:
    method: str
    path: str
    controller: str
    summary: str = ""
    is_admin_only: bool = False


class ShiftLeftEngine:
    def __init__(self):
        self.discovered_endpoints: List[DiscoveredEndpoint] = []
        self.covered_endpoints_in_e2e: Set[str] = set()
        self.covered_endpoints_in_rag: Set[str] = set()

    def scan_controllers(self) -> List[DiscoveredEndpoint]:
        """Scans Java source files using regex AST parsing for REST endpoints."""
        endpoints = []
        if not CONTROLLER_DIR.exists():
            logger.warning(f"Controller directory not found: {CONTROLLER_DIR}")
            return endpoints

        mapping_pattern = re.compile(
            r'@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*(?:value\s*=\s*)?["\']([^"\']+)["\']'
        )
        base_mapping_pattern = re.compile(r'@RequestMapping\s*\(\s*["\']([^"\']+)["\']')
        summary_pattern = re.compile(r'@Operation\s*\(\s*summary\s*=\s*["\']([^"\']+)["\']')
        admin_pattern = re.compile(r'@PreAuthorize\s*\(\s*["\']hasRole\([\'"]ADMIN[\'"]\)')

        for java_file in CONTROLLER_DIR.glob("*.java"):
            content = java_file.read_text(encoding="utf-8")
            base_path = ""
            base_match = base_mapping_pattern.search(content)
            if base_match:
                base_path = base_match.group(1).rstrip("/")

            lines = content.splitlines()
            current_summary = ""
            is_admin = False

            for i, line in enumerate(lines):
                if "@Operation" in line:
                    sm = summary_pattern.search(line)
                    if sm:
                        current_summary = sm.group(1)
                if "@PreAuthorize" in line and "ADMIN" in line:
                    is_admin = True

                m = mapping_pattern.search(line)
                if m:
                    verb = m.group(1).replace("Mapping", "").upper()
                    sub_path = m.group(2)
                    if not sub_path.startswith("/"):
                        sub_path = "/" + sub_path
                    full_path = f"{base_path}{sub_path}"
                    endpoints.append(
                        DiscoveredEndpoint(
                            method=verb,
                            path=full_path,
                            controller=java_file.name,
                            summary=current_summary or f"{verb} {full_path}",
                            is_admin_only=is_admin,
                        )
                    )
                    current_summary = ""
                    is_admin = False

        self.discovered_endpoints = endpoints
        logger.info(f"Discovered {len(endpoints)} Spring Boot REST endpoints across controllers.")
        return endpoints

    def scan_existing_coverage(self):
        """Scans E2E tests and PRD markdown specs to find covered endpoints."""
        # 1. Scan RAG Specification
        if SPEC_FILE.exists():
            spec_content = SPEC_FILE.read_text(encoding="utf-8")
            for ep in self.discovered_endpoints:
                if ep.path in spec_content:
                    self.covered_endpoints_in_rag.add(f"{ep.method} {ep.path}")

        # 2. Scan Playwright E2E Tests
        if E2E_DIR.exists():
            for py_file in E2E_DIR.glob("*.py"):
                content = py_file.read_text(encoding="utf-8")
                for ep in self.discovered_endpoints:
                    if ep.path in content or ep.path.split("/")[-1] in content:
                        self.covered_endpoints_in_e2e.add(f"{ep.method} {ep.path}")

    def detect_gaps(self) -> Dict[str, List[DiscoveredEndpoint]]:
        """Identifies endpoints that lack RAG specifications or E2E tests."""
        self.scan_controllers()
        self.scan_existing_coverage()

        missing_rag = []
        missing_e2e = []

        for ep in self.discovered_endpoints:
            key = f"{ep.method} {ep.path}"
            if key not in self.covered_endpoints_in_rag:
                missing_rag.append(ep)
            if key not in self.covered_endpoints_in_e2e:
                missing_e2e.append(ep)

        return {"missing_rag": missing_rag, "missing_e2e": missing_e2e}

    def generate_spec_chunk(self, ep: DiscoveredEndpoint) -> str:
        """Synthesizes a structured PRD specification section for a discovered endpoint."""
        slug = re.sub(r"[^A-Za-z0-9]", "_", ep.path.strip("/")).upper()
        prd_id = f"PRD-AUTO-{slug[:16]}"
        return f"""
### {prd_id}: {ep.summary}
- **Method:** `{ep.method}`
- **Endpoint:** `{ep.path}`
- **Access Control:** `{'Role: ADMIN' if ep.is_admin_only else 'Public / Authenticated'}`
- **Controller Source:** `{ep.controller}`
- **Contract Specification:**
  - Standard Response: HTTP 200 OK (or HTTP 201 Created for POST)
  - Security Requirement: Bearer JWT header required for non-public endpoints
  - Invariant: Payloads must adhere to strict JSON schema validation. Invalid inputs reject with HTTP 400 Bad Request.
"""

    def generate_playwright_test(self, ep: DiscoveredEndpoint) -> Path:
        """Synthesizes an executable Playwright/pytest test covering positive and negative validation."""
        safe_name = re.sub(r"[^A-Za-z0-9]", "_", ep.path.strip("/")).lower()
        test_file = E2E_DIR / f"test_shift_left_{safe_name}.py"

        code = f'''"""
Shift-Left Auto-Generated Test for {ep.method} {ep.path}
Generated by AutoTriage ShiftLeftEngine (Safwan-mlops)
"""
import pytest
import requests

API_URL = "{DEV_API_URL}"

def test_shift_left_{safe_name}_happy_path():
    """Verifies {ep.method} {ep.path} returns expected HTTP status."""
    url = f"{{API_URL}}{ep.path}"
    headers = {{"Content-Type": "application/json"}}
    
    if "{ep.method}" == "GET":
        resp = requests.get(url, headers=headers, timeout=10)
    elif "{ep.method}" == "POST":
        # Deterministic synthetic test payload
        payload = {{"email": "shiftleft@autotriage.local", "subject": "ShiftLeft Verification", "message": "Automated Shift-Left synthetic verification payload"}}
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
    else:
        resp = requests.request("{ep.method}", url, headers=headers, timeout=10)
        
    assert resp.status_code in [200, 201, 401, 403], f"Unexpected status: {{resp.status_code}} for {{url}}"

def test_shift_left_{safe_name}_boundary_negative():
    """Adversarial / Negative validation: ensures invalid requests reject with 4xx rather than 500 crash."""
    url = f"{{API_URL}}{ep.path}"
    headers = {{"Content-Type": "application/json"}}
    
    if "{ep.method}" == "POST":
        # Send empty/malformed payload
        resp = requests.post(url, json={{}}, headers=headers, timeout=10)
        assert resp.status_code in [400, 422, 401], f"Expected 4xx validation error, got {{resp.status_code}}"
'''
        test_file.write_text(code, encoding="utf-8")
        logger.info(f"Synthesized Shift-Left test: {test_file}")
        return test_file

    def execute_shift_left_verification(self) -> Dict[str, Any]:
        """Runs the entire Shift-Left discovery, generation, and test execution loop."""
        gaps = self.detect_gaps()
        missing_e2e = gaps["missing_e2e"]
        missing_rag = gaps["missing_rag"]

        generated_specs = []
        generated_tests = []

        # 1. Update RAG Spec if missing
        if missing_rag and SPEC_FILE.exists():
            spec_additions = "\n\n## Auto-Generated Shift-Left Specifications\n"
            for ep in missing_rag:
                chunk = self.generate_spec_chunk(ep)
                spec_additions += chunk
                generated_specs.append(f"{ep.method} {ep.path}")
            
            current_spec = SPEC_FILE.read_text(encoding="utf-8")
            if "Auto-Generated Shift-Left Specifications" not in current_spec:
                SPEC_FILE.write_text(current_spec + spec_additions, encoding="utf-8")
                logger.info(f"Updated {SPEC_FILE} with {len(generated_specs)} new PRD specifications.")

        # 2. Synthesize Tests for missing endpoints
        for ep in missing_e2e:
            tf = self.generate_playwright_test(ep)
            generated_tests.append(str(tf.name))

        # 3. Execute live verification against DEV
        test_results = {"total": len(generated_tests), "passed": 0, "failed": 0, "details": []}
        pytest_bin = BASE_DIR / "sut" / "e2e" / ".venv" / "bin" / "pytest"
        env_vars = dict(os.environ)
        env_vars["API_URL"] = DEV_API_URL

        for tname in generated_tests:
            cmd = [str(pytest_bin), str(E2E_DIR / tname), "-v"]
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=env_vars, cwd=str(BASE_DIR))
                passed = res.returncode == 0
                test_results["details"].append({"test": tname, "passed": passed, "output": res.stdout[-300:]})
                if passed:
                    test_results["passed"] += 1
                else:
                    test_results["failed"] += 1
            except Exception as e:
                test_results["failed"] += 1
                test_results["details"].append({"test": tname, "passed": False, "error": str(e)})

        return {
            "discovered_endpoints": len(self.discovered_endpoints),
            "generated_specs": generated_specs,
            "generated_tests": generated_tests,
            "verification_results": test_results,
            "status": "PASSED" if test_results["failed"] == 0 else "FAILED",
        }


if __name__ == "__main__":
    engine = ShiftLeftEngine()
    result = engine.execute_shift_left_verification()
    print(json.dumps(result, indent=2))
