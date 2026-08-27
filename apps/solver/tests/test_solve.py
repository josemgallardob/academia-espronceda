from collections.abc import Callable
from copy import deepcopy
from pathlib import Path

from fastapi.testclient import TestClient

from academia_espronceda_solver.config import SolverSettings
from academia_espronceda_solver.engine import get_engine
from academia_espronceda_solver.main import app
from academia_espronceda_solver.schemas import SolveScheduleRequest, SolveScheduleResponse

LoadFixture = Callable[[str], dict]


def test_health_does_not_require_service_authentication(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "service": "solver",
        "status": "ok",
        "version": "1.0.0",
    }


def test_solve_without_credential_returns_problem_details(
    client: TestClient,
    load_fixture: LoadFixture,
) -> None:
    response = client.post("/v1/schedules/solve", json=load_fixture("strict-ideal.request.json"))

    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    payload = response.json()
    assert payload["code"] == "AUTHENTICATION_REQUIRED"
    assert payload["status"] == 401
    assert payload["instance"] == "/v1/schedules/solve"
    assert payload["traceId"]


def test_solve_rejects_human_jwt_as_service_credential(
    client: TestClient,
    load_fixture: LoadFixture,
) -> None:
    response = client.post(
        "/v1/schedules/solve",
        json=load_fixture("strict-ideal.request.json"),
        headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.sig"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_SERVICE_TOKEN"


def test_solve_accepts_valid_problem_and_returns_unknown_outcome(
    client: TestClient,
    auth_headers: dict[str, str],
    load_fixture: LoadFixture,
) -> None:
    request = load_fixture("strict-ideal.request.json")

    response = client.post("/v1/schedules/solve", json=request, headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    SolveScheduleResponse.model_validate(payload)
    assert payload["contractVersion"] == request["contractVersion"]
    assert payload["ruleCatalogVersion"] == request["ruleCatalogVersion"]
    assert payload["requestId"] == request["requestId"]
    assert payload["randomSeed"] == request["options"]["randomSeed"]
    assert payload["timeLimitSeconds"] == request["options"]["timeLimitSeconds"]
    assert payload["status"] == "UNKNOWN"
    assert payload["mode"] == "RELAXED"
    assert payload["solution"] is None
    assert payload["attempts"][0]["mode"] == "STRICT"
    assert payload["elapsedMilliseconds"] >= 0


def test_solve_rejects_invalid_hours_as_bad_request(
    client: TestClient,
    auth_headers: dict[str, str],
    load_fixture: LoadFixture,
) -> None:
    response = client.post(
        "/v1/schedules/solve",
        json=load_fixture("invalid-hours.request.json"),
        headers=auth_headers,
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["code"] == "INVALID_REQUEST"
    assert any(error["code"] == "HOURS_MISMATCH" for error in payload["fieldErrors"])


def test_solve_rejects_invalid_json_as_bad_request(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.post(
        "/v1/schedules/solve",
        content=b"{not-json",
        headers={**auth_headers, "Content-Type": "application/json"},
    )

    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "INVALID_REQUEST"


def test_solve_rejects_malformed_body_as_bad_request(
    client: TestClient,
    auth_headers: dict[str, str],
    load_fixture: LoadFixture,
) -> None:
    payload = deepcopy(load_fixture("strict-ideal.request.json"))
    payload["unexpected"] = True

    response = client.post("/v1/schedules/solve", json=payload, headers=auth_headers)

    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "INVALID_REQUEST"


def test_solve_rejects_incompatible_contract_version(
    client: TestClient,
    auth_headers: dict[str, str],
    load_fixture: LoadFixture,
) -> None:
    payload = deepcopy(load_fixture("strict-ideal.request.json"))
    payload["contractVersion"] = "2.0.0"

    response = client.post("/v1/schedules/solve", json=payload, headers=auth_headers)

    assert response.status_code == 409
    problem = response.json()
    assert problem["code"] == "INCOMPATIBLE_VERSION"
    assert any(error["field"] == "contractVersion" for error in problem["fieldErrors"])


def test_solve_rejects_incompatible_rule_catalog_version(
    client: TestClient,
    auth_headers: dict[str, str],
    load_fixture: LoadFixture,
) -> None:
    payload = deepcopy(load_fixture("strict-ideal.request.json"))
    payload["ruleCatalogVersion"] = "9.9.9"

    response = client.post("/v1/schedules/solve", json=payload, headers=auth_headers)

    assert response.status_code == 409
    assert response.json()["code"] == "INCOMPATIBLE_VERSION"


def test_solve_rejects_time_limit_outside_policy(
    client: TestClient,
    auth_headers: dict[str, str],
    load_fixture: LoadFixture,
) -> None:
    payload = deepcopy(load_fixture("strict-ideal.request.json"))
    payload["options"]["timeLimitSeconds"] = 120

    response = client.post("/v1/schedules/solve", json=payload, headers=auth_headers)

    assert response.status_code == 422
    problem = response.json()
    assert problem["code"] == "REJECTED_SOLVE_OPTIONS"
    assert problem["fieldErrors"][0]["field"] == "options.timeLimitSeconds"


def test_solve_returns_structured_error_when_engine_fails(
    client: TestClient,
    auth_headers: dict[str, str],
    settings: SolverSettings,
    load_fixture: LoadFixture,
) -> None:
    class FailingEngine:
        def solve(self, request: SolveScheduleRequest, *, time_limit_seconds: float):
            raise RuntimeError("constraint model exploded")

    app.dependency_overrides[get_engine] = lambda: FailingEngine()
    try:
        response = client.post(
            "/v1/schedules/solve",
            json=load_fixture("strict-ideal.request.json"),
            headers=auth_headers,
        )
    finally:
        app.dependency_overrides.pop(get_engine, None)

    assert response.status_code == 500
    problem = response.json()
    assert problem["code"] == "SOLVER_EXECUTION_FAILED"
    assert problem["solverStatus"] == "ERROR"
    assert problem["status"] == 500
    assert "exploded" not in str(problem)
    assert settings.internal_service_token


def test_solve_echoes_trace_id_from_request_header(
    client: TestClient,
    auth_headers: dict[str, str],
    load_fixture: LoadFixture,
) -> None:
    response = client.post(
        "/v1/schedules/solve",
        json=load_fixture("invalid-hours.request.json"),
        headers={**auth_headers, "X-Request-Id": "trace-from-nestjs"},
    )

    assert response.status_code == 400
    assert response.json()["traceId"] == "trace-from-nestjs"


def test_solver_sources_do_not_reference_a_database() -> None:
    solver_root = Path(__file__).resolve().parents[1] / "src"
    forbidden = ("libsql", "sqlite3", "turso", "drizzle", "sqlalchemy")
    for path in solver_root.rglob("*.py"):
        text = path.read_text(encoding="utf-8").lower()
        for token in forbidden:
            assert token not in text, f"{path} references {token}"
