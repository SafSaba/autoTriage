"""
agent/src/autotriage/security/sanitize.py - Intake Sanitization
==============================================================
Strips dangerous control characters, normalizes whitespace, and enforces input limits.
"""

import re
import unicodedata

MAX_SUBJECT_LENGTH = 200
MAX_BODY_LENGTH = 4000


def sanitize_text(text: str, max_length: int = MAX_BODY_LENGTH) -> str:
    """Normalizes Unicode, removes non-printable characters, and caps maximum length."""
    if not text:
        return ""
    # Unicode normalize
    normalized = unicodedata.normalize("NFKC", text)
    # Remove control characters except newline and tab
    cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", normalized)
    # Collapse excessive whitespace
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()[:max_length]
