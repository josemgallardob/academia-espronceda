import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from academia_espronceda_solver.auth import require_service_token
from academia_espronceda_solver.concurrency import (
    configure_concurrency,
    reject_if_busy,
    release_solve_slot,
)
from academia_espronceda_solver.config import SolverSettings, get_settings
from academia_espronceda_solver.constants import SUPPORTED_CONTRACT_VERSION
from academia_espronceda_solver.engine import ScheduleEngine, get_engine
from academia_espronceda_solver.observability import log_event
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

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_concurrency(get_settings().max_concurrent)
    yield


app = FastAPI(
    title="Academia Espronceda Solver API",
    version=SUPPORTED_CONTRACT_VERSION,
    lifespan=lifespan,
)
_QUIET_PATHS = {"/health"}


@app.middleware("http")
async def correlate_and_log_requests(request: Request, call_next):
    request_id = request.headers.get("x-request-id", "").strip() or str(uuid4())
    request.state.request_id = request_id
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    if request.url.path not in _QUIET_PATHS:
        duration_ms = int((time.perf_counter() - started) * 1000)
        log_event(
            level=logging.ERROR if response.status_code >= 500 else logging.INFO,
            event="http.request",
            requestId=request_id,
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            durationMs=duration_ms,
        )
    return response


@app.exception_handler(ProblemDetailsError)
def handle_problem_details(request: Request, exc: ProblemDetailsError) -> JSONResponse:
    log_event(
        level=logging.ERROR if exc.status >= 500 else logging.WARNING,
        event="http.problem",
        requestId=getattr(request.state, "request_id", None),
        path=request.url.path,
        status=exc.status,
        code=exc.code,
    )
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
    log_event(
        level=logging.ERROR,
        event="http.problem",
        requestId=getattr(request.state, "request_id", None),
        path=request.url.path,
        status=500,
        code="SOLVER_EXECUTION_FAILED",
    )
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
    request: Request,
    _: Annotated[None, Depends(require_service_token)],
    settings: Annotated[SolverSettings, Depends(get_settings)],
    engine: Annotated[ScheduleEngine, Depends(get_engine)],
) -> SolveScheduleResponse:
    reject_if_busy()
    started = time.perf_counter()
    request_id = getattr(request.state, "request_id", payload.requestId)
    try:
        log_event(
            event="solver.request",
            requestId=request_id,
            timeLimitSeconds=payload.options.timeLimitSeconds,
        )
        result = solve_schedule(payload, settings=settings, engine=engine)
        log_event(
            event="solver.response",
            requestId=request_id,
            status=result.status,
            mode=result.mode,
            durationMs=int((time.perf_counter() - started) * 1000),
        )
        return result
    except ProblemDetailsError:
        raise
    except Exception:
        log_event(
            level=logging.ERROR,
            event="solver.response",
            requestId=request_id,
            status="ERROR",
            durationMs=int((time.perf_counter() - started) * 1000),
        )
        raise
    finally:
        release_solve_slot()
