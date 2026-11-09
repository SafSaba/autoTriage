"""
agent/src/autotriage/llm.py - Real Gemini LLM Client for AutoTriage
===================================================================
Provides structured reasoning using the official google-genai SDK.
Reads GEMINI_API_KEY from process environment or gitignored local .env.
Defaults to gemini-4-argon (highest capability reasoning model) via the Interactions API.
If GEMINI_API_KEY is unset or unavailable, raises LlmUnavailable so callers
can gracefully fall back to deterministic logic and record reasoning_mode="deterministic_fallback".
"""

import logging
import os
import time
from pathlib import Path
from typing import Generic, List, Literal, Optional, Type, TypeVar
from pydantic import BaseModel, Field

logger = logging.getLogger("autotriage-llm")

T = TypeVar("T", bound=BaseModel)

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent


class LlmUnavailable(Exception):
    """Raised when GEMINI_API_KEY is not set or Gemini API is unreachable."""
    pass


class ClassificationOutput(BaseModel):
    category: Literal[
        "REGRESSION",
        "ENVIRONMENT_DRIFT",
        "FLAKY",
        "WORKING_AS_DESIGNED",
        "NEEDS_HUMAN",
    ]
    rationale: str
    action_path: str
    cited_doc_ids: List[str] = Field(default_factory=list)


class LocalizationOutput(BaseModel):
    file: str
    start_line: int
    end_line: int
    rationale: str
    cited_doc_ids: List[str] = Field(default_factory=list)


class StructuredResult(BaseModel, Generic[T]):
    parsed: T
    prompt_tokens: int = 0
    candidates_tokens: int = 0
    total_tokens: int = 0
    latency_sec: float = 0.0
    model: str = ""


def _resolve_env_value(key: str) -> Optional[str]:
    """
    Resolves an environment variable from os.environ first.
    Unless AUTOTRIAGE_DISABLE_DOTENV=1 is set (e.g. in unit tests testing missing keys),
    falls back to reading the gitignored project .env file without logging the secret.
    """
    val = os.getenv(key)
    if val and val.strip():
        return val.strip()

    if os.getenv("AUTOTRIAGE_DISABLE_DOTENV") == "1":
        return None

    env_file = BASE_DIR / ".env"
    if env_file.is_file():
        try:
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() == key:
                    cleaned = v.strip().strip('"').strip("'")
                    if cleaned:
                        return cleaned
        except Exception:
            pass
    return None


def get_llm_model_name() -> str:
    """Returns model name from AUTOTRIAGE_LLM_MODEL or defaults to gemini-3-flash-preview."""
    return _resolve_env_value("AUTOTRIAGE_LLM_MODEL") or "gemini-3-flash-preview"


def generate_structured(
    prompt: str,
    response_schema: Type[T],
    system_instruction: Optional[str] = None,
) -> StructuredResult[T]:
    """
    Executes a structured LLM call via the google-genai SDK.
    Uses generate_content with response_schema for maximum stability across model tiers.
    Returns parsed Pydantic object, real usage token counts, and wall-clock latency.
    Raises LlmUnavailable if GEMINI_API_KEY is not present or inference fails.
    """
    api_key = _resolve_env_value("GEMINI_API_KEY")
    if not api_key:
        raise LlmUnavailable("GEMINI_API_KEY is not set in the process environment.")

    from google import genai
    from google.genai import types

    model_name = get_llm_model_name()
    t0 = time.time()

    try:
        client = genai.Client(api_key=api_key)
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_schema,
            system_instruction=system_instruction,
            temperature=0.1,
        )
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=config,
        )
        latency = round(time.time() - t0, 3)

        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
        candidates_tokens = getattr(usage, "candidates_token_count", 0) or 0
        total_tokens = getattr(usage, "total_token_count", 0) or (prompt_tokens + candidates_tokens)

        text = response.text or "{}"
        parsed_obj = response_schema.model_validate_json(text)

        return StructuredResult(
            parsed=parsed_obj,
            prompt_tokens=prompt_tokens,
            candidates_tokens=candidates_tokens,
            total_tokens=total_tokens,
            latency_sec=latency,
            model=model_name,
        )
    except Exception as exc:
        logger.warning(f"Gemini API call failed ({type(exc).__name__}): {exc}")
        raise LlmUnavailable(f"Gemini LLM inference failed: {type(exc).__name__}") from exc

