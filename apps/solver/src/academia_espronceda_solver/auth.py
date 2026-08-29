import hmac
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from academia_espronceda_solver.config import SolverSettings, get_settings
from academia_espronceda_solver.problems import ProblemDetailsError

_bearer = HTTPBearer(auto_error=False)


def require_service_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[SolverSettings, Depends(get_settings)],
) -> None:
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise ProblemDetailsError(
            status=401,
            code="AUTHENTICATION_REQUIRED",
            title="The service credential is missing or invalid",
            detail="Send the internal service token as a Bearer credential.",
        )

    if not _tokens_match(credentials.credentials, settings.internal_service_token):
        raise ProblemDetailsError(
            status=401,
            code="INVALID_SERVICE_TOKEN",
            title="The service credential is missing or invalid",
            detail="Human-user JWTs are not accepted.",
        )


def _tokens_match(provided: str, expected: str) -> bool:
    provided_bytes = provided.encode("utf-8")
    expected_bytes = expected.encode("utf-8")
    if len(provided_bytes) != len(expected_bytes):
        return False
    return hmac.compare_digest(provided_bytes, expected_bytes)
