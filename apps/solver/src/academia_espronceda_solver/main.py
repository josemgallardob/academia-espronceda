import logging
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from academia_espronceda_solver.auth import require_service_token
from academia_espronceda_solver.config import SolverSettings, get_settings
from academia_espronceda_solver.constants import SUPPORTED_CONTRACT_VERSION
from academia_espronceda_solver.engine import ScheduleEngine, get_engine
from academia_espronceda_solver.problems import (
    ProblemDetailsError,
    build_problem,
    http_exception_problem,
    problem_json_response,
    request_validation_problem,
)
from academia_espronceda_solver.schemas import (
    HealthResponse,
    SolveScheduleRequest,
    SolveScheduleResponse,
)
from academia_espronceda_solver.service import solve_schedule

logger = logging.getLogger(__name__)

app = FastAPI(title="Academia Espronceda Solver API", version=SUPPORTED_CONTRACT_VERSION)


@app.exception_handler(ProblemDetailsError)
def handle_problem_details(request: Request, exc: ProblemDetailsError) -> JSONResponse:
    return problem_json_response(
        build_problem(
            request=request,
            status=exc.status,
            code=exc.code,
            title=exc.title,
            detail=exc.detail,
            field_errors=exc.field_errors,
            solver_status=exc.solver_status,
        )
    )


@app.exception_handler(RequestValidationError)
def handle_request_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
    return problem_json_response(request_validation_problem(request, exc))


@app.exception_handler(StarletteHTTPException)
def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return problem_json_response(http_exception_problem(request, exc))


@app.exception_handler(Exception)
def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled solver failure path=%s", request.url.path, exc_info=exc)
    return problem_json_response(
        build_problem(
            request=request,
            status=500,
            code="SOLVER_EXECUTION_FAILED",
            title="Solver execution failed",
            detail="The scheduling engine could not complete the accepted request.",
            solver_status="ERROR",
        )
    )


@app.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    return HealthResponse(status="ok", service="solver", version=SUPPORTED_CONTRACT_VERSION)


@app.post("/v1/schedules/solve", response_model=SolveScheduleResponse)
def post_solve_weekly_schedule(
    payload: SolveScheduleRequest,
    _: Annotated[None, Depends(require_service_token)],
    settings: Annotated[SolverSettings, Depends(get_settings)],
    engine: Annotated[ScheduleEngine, Depends(get_engine)],
) -> SolveScheduleResponse:
    return solve_schedule(payload, settings=settings, engine=engine)
