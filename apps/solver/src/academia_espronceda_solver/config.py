from collections.abc import Mapping
from dataclasses import dataclass
from os import environ
from typing import Literal

from academia_espronceda_solver.constants import DEFAULT_MAX_TIME_LIMIT_SECONDS

RuntimeEnvironment = Literal["development", "test", "production"]


@dataclass(frozen=True)
class SolverSettings:
    node_env: RuntimeEnvironment
    host: str
    port: int
    internal_service_token: str
    max_time_limit_seconds: float
    max_concurrent: int


def load_settings(source: Mapping[str, str] | None = None) -> SolverSettings:
    values = environ if source is None else source
    node_env = _read_environment(values.get("NODE_ENV"))
    host = values.get("SOLVER_HOST", "127.0.0.1").strip()
    port = _read_port(values.get("SOLVER_PORT") or values.get("PORT") or "8001")
    service_token = values.get(
        "INTERNAL_SERVICE_TOKEN",
        "local-only-service-token-replace-in-every-deployed-environment",
    ).strip()
    max_time_limit_seconds = _read_time_limit(
        values.get("SOLVER_MAX_TIME_LIMIT_SECONDS", str(DEFAULT_MAX_TIME_LIMIT_SECONDS))
    )
    max_concurrent = _read_max_concurrent(values.get("SOLVER_MAX_CONCURRENT", "1"))

    if not host:
        raise ValueError("SOLVER_HOST cannot be empty")
    if node_env == "production":
        if host in {"127.0.0.1", "localhost"}:
            raise ValueError("SOLVER_HOST must listen on the private network in production")
        if len(service_token) < 32:
            raise ValueError(
                "INTERNAL_SERVICE_TOKEN must contain at least 32 characters in production"
            )

    return SolverSettings(
        node_env=node_env,
        host=host,
        port=port,
        internal_service_token=service_token,
        max_time_limit_seconds=max_time_limit_seconds,
        max_concurrent=max_concurrent,
    )


def get_settings() -> SolverSettings:
    return load_settings()


def _read_environment(value: str | None) -> RuntimeEnvironment:
    environment = (value or "development").strip()
    if environment not in {"development", "test", "production"}:
        raise ValueError("NODE_ENV must be one of development, test, or production")
    return environment


def _read_port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as error:
        raise ValueError("SOLVER_PORT must be an integer between 1 and 65535") from error

    if not 1 <= port <= 65_535:
        raise ValueError("SOLVER_PORT must be an integer between 1 and 65535")
    return port


def _read_time_limit(value: str) -> float:
    try:
        time_limit = float(value)
    except ValueError as error:
        raise ValueError("SOLVER_MAX_TIME_LIMIT_SECONDS must be a positive number") from error

    if not 0 < time_limit < float("inf"):
        raise ValueError("SOLVER_MAX_TIME_LIMIT_SECONDS must be a positive number")
    return time_limit


def _read_max_concurrent(value: str) -> int:
    try:
        max_concurrent = int(value)
    except ValueError as error:
        raise ValueError("SOLVER_MAX_CONCURRENT must be an integer between 1 and 8") from error
    if not 1 <= max_concurrent <= 8:
        raise ValueError("SOLVER_MAX_CONCURRENT must be an integer between 1 and 8")
    return max_concurrent
