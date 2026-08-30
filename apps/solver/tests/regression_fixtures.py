from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from academia_espronceda_solver.engine import CpSatScheduleEngine
from academia_espronceda_solver.schemas import SolveScheduleRequest, SolveScheduleResponse

REGRESSION_DIR = (
    Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "v1" / "regression"
)


def load_json(name: str) -> dict[str, Any]:
    return json.loads((REGRESSION_DIR / name).read_text(encoding="utf-8"))


def load_regression_cases() -> list[dict[str, Any]]:
    payload = load_json("cases.json")
    return list(payload["cases"])


def load_case_request(case: dict[str, Any]) -> SolveScheduleRequest:
    return SolveScheduleRequest.model_validate(load_json(case["request"]))


def solve_case(case: dict[str, Any]) -> SolveScheduleResponse:
    request = load_case_request(case)
    outcome = CpSatScheduleEngine().solve(
        request,
        time_limit_seconds=request.options.timeLimitSeconds,
    )
    return SolveScheduleResponse(
        contractVersion=request.contractVersion,
        ruleCatalogVersion=request.ruleCatalogVersion,
        requestId=request.requestId,
        mode=outcome.mode,
        status=outcome.status,
        attempts=list(outcome.attempts),
        solution=outcome.solution,
        elapsedMilliseconds=outcome.elapsed_milliseconds,
        randomSeed=request.options.randomSeed,
        timeLimitSeconds=request.options.timeLimitSeconds,
    )


def write_published_responses() -> None:
    for case in load_regression_cases():
        response_name = case.get("response")
        if not response_name:
            continue
        response = solve_case(case)
        (REGRESSION_DIR / response_name).write_text(
            response.model_dump_json(indent=2) + "\n",
            encoding="utf-8",
        )
