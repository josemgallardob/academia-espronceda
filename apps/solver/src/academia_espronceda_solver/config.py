from collections.abc import Mapping
from dataclasses import dataclass
from os import environ
from typing import Literal

RuntimeEnvironment = Literal["development", "test", "production"]


@dataclass(frozen=True)
class SolverSettings:
    node_env: RuntimeEnvironment
    host: str
    port: int
    internal_service_token: str


def load_settings(source: Mapping[str, str] | None = None) -> SolverSettings:
    values = environ if source is None else source
    node_env = _read_environment(values.get("NODE_ENV"))
    host = values.get("SOLVER_HOST", "127.0.0.1").strip()
    port = _read_port(values.get("SOLVER_PORT", "8001"))
    service_token = values.get(
        "INTERNAL_SERVICE_TOKEN",
        "local-only-service-token-replace-in-every-deployed-environment",
    ).strip()

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
    )


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
