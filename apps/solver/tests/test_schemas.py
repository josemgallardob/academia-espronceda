from collections.abc import Callable

from regression_fixtures import load_json, load_regression_cases

from academia_espronceda_solver.invariants import collect_request_invariants
from academia_espronceda_solver.schemas import (
    SolverErrorProblem,
    SolveScheduleRequest,
    SolveScheduleResponse,
)

LoadFixture = Callable[[str], dict]


def test_published_request_fixtures_match_pydantic_models(load_fixture: LoadFixture) -> None:
    for name in ("strict-ideal.request.json", "single-teacher.request.json"):
        SolveScheduleRequest.model_validate(load_fixture(name))


def test_regression_request_fixtures_match_pydantic_models() -> None:
    for case in load_regression_cases():
        SolveScheduleRequest.model_validate(load_json(case["request"]))


def test_published_response_fixtures_match_pydantic_models(load_fixture: LoadFixture) -> None:
    for name in (
        "strict-ideal.response.json",
        "single-teacher.response.json",
        "multi-teacher.response.json",
        "relaxed-capacity.response.json",
        "infeasible.response.json",
        "unknown.response.json",
    ):
        SolveScheduleResponse.model_validate(load_fixture(name))


def test_published_error_fixture_matches_solver_error_problem(load_fixture: LoadFixture) -> None:
    SolverErrorProblem.model_validate(load_fixture("error.problem.json"))


def test_invalid_hours_fixture_is_schema_valid_and_semantically_invalid(
    load_fixture: LoadFixture,
) -> None:
    request = SolveScheduleRequest.model_validate(load_fixture("invalid-hours.request.json"))
    violations = collect_request_invariants(request)

    assert any(violation.code == "HOURS_MISMATCH" for violation in violations)
