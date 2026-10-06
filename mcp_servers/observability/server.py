"""
mcp_servers/observability/server.py - Azure Application Insights & Log Analytics KQL Observability MCP
===================================================================================================
Provides deep, bytecode-level distributed tracing and telemetry inspection across DEV, QA, and PROD.
Enables the AutoTriage agent to:
1. Query W3C OperationId distributed traces spanning Frontend -> Spring Boot JVM -> Neon PostgreSQL
2. Query AppExceptions for unhandled Java stack traces (exact Class, Method, and Line Number)
3. Query AppDependencies for database query latencies, slow queries, and connection errors
4. Correlate client-side Playwright/browser failures with backend telemetry
"""

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server.mcpserver import MCPServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("autotriage-observability")

app = MCPServer("autotriage-observability")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
WORKSPACE_ID = "1af381b7-89d3-4442-99f5-df24fc100a69"  # law-autotriage

APP_INSIGHTS_MAP = {
    "dev": "autotriage-appinsights-dev",
    "qa": "autotriage-appinsights-qa",
    "prod": "autotriage-appinsights-prod",
}


def _run_kql(query: str, timespan: str = "P1D") -> List[Dict[str, Any]]:
    """Executes a Kusto Query Language (KQL) query against the central Log Analytics workspace."""
    cmd = [
        "az", "monitor", "log-analytics", "query",
        "--workspace", WORKSPACE_ID,
        "--analytics-query", query,
        "--timespan", timespan,
        "-o", "json"
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        if not res.stdout.strip():
            return []
        return json.loads(res.stdout)
    except subprocess.CalledProcessError as e:
        logger.error(f"KQL query failed: {e.stderr}")
        return []
    except Exception as e:
        logger.error(f"Failed to execute KQL: {str(e)}")
        return []


@app.tool()
def query_kql_telemetry(query: str, timespan: str = "P1D") -> List[Dict[str, Any]]:
    """Runs a raw KQL query against Azure Log Analytics (AppRequests, AppExceptions, AppDependencies, ContainerAppConsoleLogs)."""
    return _run_kql(query, timespan)


@app.tool()
def get_trace_correlation(operation_id: str) -> Dict[str, Any]:
    """Retrieves the full distributed trace tree for a given W3C OperationId or traceparent.
    
    Returns all linked HTTP requests, internal Java exceptions, and outbound PostgreSQL queries.
    """
    clean_op_id = operation_id.strip()
    if clean_op_id.startswith("00-"):
        parts = clean_op_id.split("-")
        if len(parts) >= 2:
            clean_op_id = parts[1]

    kql = f"""
    union AppRequests, AppDependencies, AppExceptions
    | where OperationId == '{clean_op_id}' or operation_Id == '{clean_op_id}' or ParentId == '{clean_op_id}'
    | project TimeGenerated, Type, Name, OperationId, ParentId, ResultCode, DurationMs, Target, ProblemId, InnermostMessage, InnermostType = tostring(split(InnermostExceptionType, '.')[-1]), _ResourceId
    | order by TimeGenerated asc
    """
    records = _run_kql(kql)
    
    requests = [r for r in records if r.get("Type") == "AppRequests"]
    exceptions = [r for r in records if r.get("Type") == "AppExceptions"]
    dependencies = [r for r in records if r.get("Type") == "AppDependencies"]

    return {
        "operation_id": clean_op_id,
        "total_spans": len(records),
        "requests": requests,
        "exceptions": exceptions,
        "dependencies": dependencies,
        "correlated": len(records) > 0
    }


@app.tool()
def get_environment_exceptions(env: str = "qa", limit: int = 10) -> List[Dict[str, Any]]:
    """Fetches the latest unhandled exceptions in a specific environment (dev, qa, or prod)."""
    target_app = APP_INSIGHTS_MAP.get(env.lower(), "autotriage-appinsights-qa")
    kql = f"""
    AppExceptions
    | where _ResourceId has '{target_app}' or Properties has '{env}'
    | project TimeGenerated, OperationId, ExceptionType, ProblemId, OuterMessage, InnermostMessage, Method, Assembly, _ResourceId
    | order by TimeGenerated desc
    | take {limit}
    """
    return _run_kql(kql)


@app.tool()
def get_database_dependency_health(env: str = "qa", limit: int = 10) -> List[Dict[str, Any]]:
    """Inspects database queries, slow operations, and failures against Neon PostgreSQL."""
    target_app = APP_INSIGHTS_MAP.get(env.lower(), "autotriage-appinsights-qa")
    kql = f"""
    AppDependencies
    | where _ResourceId has '{target_app}' and (Type == 'Postgres' or Target has 'neon' or Target has 'postgres')
    | project TimeGenerated, OperationId, Name, Target, ResultCode, DurationMs, Success, CommandName = tostring(Properties["Statement"])
    | order by TimeGenerated desc
    | take {limit}
    """
    return _run_kql(kql)


@app.tool()
def diagnose_root_cause_telemetry(operation_id: str, env: str = "qa") -> Dict[str, Any]:
    """Diagnoses the exact failure layer (FRONTEND_UI, BACKEND_CODE, DATABASE, or SPEC_DRIFT) from live telemetry.
    
    Extracts the offending source file, line number, and exception message for the autonomous self-healing agent.
    """
    trace = get_trace_correlation(operation_id)
    
    # 1. Check for Java Backend Exception
    if trace["exceptions"]:
        exc = trace["exceptions"][0]
        problem_id = exc.get("ProblemId", "")
        innermost = exc.get("InnermostMessage", "")
        # ProblemId format: com.autotriage.shop.controller.CheckoutController.applyDiscount at CheckoutController.java:108
        suspect_file = ""
        suspect_line = None
        if "at " in problem_id:
            loc = problem_id.split("at ")[-1].strip()
            if ":" in loc:
                suspect_file, line_str = loc.split(":")
                try:
                    suspect_line = int(line_str)
                except ValueError:
                    suspect_line = None
        
        return {
            "layer": "BACKEND_CODE",
            "confidence": 0.95,
            "root_cause": f"Unhandled Java Exception: {exc.get('InnermostType')} - {innermost}",
            "suspect_file": suspect_file,
            "suspect_line": suspect_line,
            "raw_exception": exc
        }
    
    # 2. Check for Database Failure
    failed_deps = [d for d in trace["dependencies"] if d.get("Success") == "False" or d.get("ResultCode") not in ["0", "200", None]]
    if failed_deps:
        dep = failed_deps[0]
        return {
            "layer": "DATABASE",
            "confidence": 0.90,
            "root_cause": f"PostgreSQL Query Failed: {dep.get('Name')} (ResultCode: {dep.get('ResultCode')})",
            "suspect_target": dep.get("Target"),
            "raw_dependency": dep
        }
        
    # 3. Check for HTTP 4xx (Spec Drift or Client Payload Error)
    failed_reqs = [r for r in trace["requests"] if str(r.get("ResultCode", "")).startswith("4")]
    if failed_reqs:
        req = failed_reqs[0]
        return {
            "layer": "SPEC_DRIFT_OR_PAYLOAD",
            "confidence": 0.85,
            "root_cause": f"Client request returned HTTP {req.get('ResultCode')}: {req.get('Name')}",
            "raw_request": req
        }

    return {
        "layer": "ENVIRONMENT_OR_COLD_START",
        "confidence": 0.70,
        "root_cause": "No exceptions found in telemetry. Likely container cold start timeout or network flake.",
        "trace": trace
    }


if __name__ == "__main__":
    app.run()
