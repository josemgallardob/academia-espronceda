from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from typing import Any

_SENSITIVE_KEYS = re.compile(
    r"^(authorization|cookie|set-cookie|password|passwd|secret|token|jwt|"
    r"api[_-]?key|database_auth_token|internal_service_token|access_token|"
    r"refresh_token)$",
    re.IGNORECASE,
)
_BEARER = re.compile(r"Bearer\s+\S+", re.IGNORECASE)
_JWT = re.compile(r"eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+")
_REDACTED = "[REDACTED]"

logger = logging.getLogger("academia_espronceda_solver.ops")


def redact_text(value: str) -> str:
    return _JWT.sub(_REDACTED, _BEARER.sub(f"Bearer {_REDACTED}", value))


def redact_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, dict):
        return {
            key: _REDACTED if _SENSITIVE_KEYS.match(key) else redact_value(nested)
            for key, nested in value.items()
        }
    return value


def log_event(*, level: int = logging.INFO, **fields: Any) -> None:
    payload = redact_value(
        {
            "timestamp": datetime.now(UTC).isoformat(),
            "service": "solver",
            **fields,
        }
    )
    logger.log(level, json.dumps(payload, ensure_ascii=True, default=str))
