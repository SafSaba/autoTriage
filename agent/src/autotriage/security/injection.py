"""
agent/src/autotriage/security/injection.py - Prompt Injection Classifier
========================================================================
Protects downstream LLMs and MCP servers from adversarial ticket bodies.
"""

import re
from typing import Tuple

ADVERSARIAL_PATTERNS = [
    (r"ignore\s+(all\s+)?previous\s+instructions", 0.99, "Prompt Injection: Instruction Override Attempt"),
    (r"you\s+are\s+now\s+(in\s+)?(developer|maintenance|god|jailbreak)\s+mode", 0.95, "Prompt Injection: Role Hijack Attempt"),
    (r"cat\s+/etc/passwd", 0.98, "Command Injection / Sensitive File Read Attempt"),
    (r"dump\s+.*(jwt|secret|key|token|credential|database)", 0.90, "Credential Exfiltration Attempt"),
    (r"system\s+prompt\s*:", 0.85, "System Prompt Leaking Attempt"),
    (r"bypass\s+(safety|security|guardrail)", 0.80, "Guardrail Bypass Attempt"),
]


def detect_prompt_injection(text: str) -> Tuple[bool, float, str]:
    """
    Evaluates whether the input contains malicious prompt injection or credential exfiltration attempts.
    Returns:
        (is_injection: bool, score: float, reason: str)
    """
    cleaned = (text or "").lower()
    highest_score = 0.0
    detected_reasons = []

    for pattern, score, reason in ADVERSARIAL_PATTERNS:
        if re.search(pattern, cleaned, re.IGNORECASE):
            highest_score = max(highest_score, score)
            detected_reasons.append(reason)

    if highest_score >= 0.80:
        return True, highest_score, "; ".join(detected_reasons)

    return False, highest_score, "Clean Input"
