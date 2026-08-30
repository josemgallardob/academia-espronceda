from typing import Literal
from uuid import uuid4

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from academia_espronceda_solver.constants import PROBLEM_JSON_MEDIA_TYPE
from academia_espronceda_solver.schemas import FieldViolation, ProblemDetails, SolverErrorProblem

_PROBLEM_TYPES = {
    "AUTHENTICATION_REQUIRED": "/problems/unauthorized",
    "INVALID_SERVICE_TOKEN": "/problems/unauthorized",
    "INVALID_REQUEST": "/problems/invalid-request",
    "INCOMPATIBLE_VERSION": "/problems/incompatible-version",
    "REJECTED_SOLVE_OPTIONS": "/problems/rejected-solve-options",
    "SOLVER_EXECUTION_FAILED": "/problems/solver-error",
    "SOLVER_BUSY": "/problems/solver-busy",
    "INTERNAL_ERROR": "/problems/internal-error",
}


class ProblemDetailsError(Exception):
    def __init__(
        self,
        *,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        field_errors: list[FieldViolation] | None = None,
        solver_status: Literal["ERROR"] | None = None,
    ) -> None:
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.field_errors = field_errors
        self.solver_status = solver_status
        super().__init__(title)


def problem_json_response(problem: ProblemDetails) -> JSONResponse:
    payload = problem.model_dump(exclude_none=True)
    if isinstance(problem, SolverErrorProblem):
        payload["solverStatus"] = problem.solverStatus
        payload["status"] = problem.status
    return JSONResponse(
        status_code=problem.status,
        content=jsonable_encoder(payload),
        media_type=PROBLEM_JSON_MEDIA_TYPE,
    )


def build_problem(
    *,
    request: Request,
    status: int,
    code: str,
    title: str,
    detail: str | None = None,
    field_errors: list[FieldViolation] | None = None,
    solver_status: Literal["ERROR"] | None = None,
) -> ProblemDetails:
    trace_id = _trace_id(request)
    instance = request.url.path
    if solver_status == "ERROR" or (status >= 500 and code != "SOLVER_BUSY"):
        return SolverErrorProblem(
            type=_PROBLEM_TYPES.get(code, "/problems/solver-error"),
            title=title,
            status=500,
            detail=detail,
            instance=instance,
            code=code,
            traceId=trace_id,
            fieldErrors=field_errors,
            solverStatus="ERROR",
        )
    return ProblemDetails(
        type=_PROBLEM_TYPES.get(code, f"/problems/{code.lower().replace('_', '-')}"),
        title=title,
        status=status,
        detail=detail,
        instance=instance,
        code=code,
        traceId=trace_id,
        fieldErrors=field_errors,
    )


def request_validation_problem(request: Request, exc: RequestValidationError) -> ProblemDetails:
    field_errors = [
        FieldViolation(
            field=_field_path(error.get("loc", ())),
            code=_error_code(str(error.get("type", "INVALID_FIELD"))),
            message=str(error.get("msg", "Invalid request")),
        )
        for error in exc.errors()
    ]
    return build_problem(
        request=request,
        status=400,
        code="INVALID_REQUEST",
        title="The request is malformed or violates a hard input invariant",
        detail="The JSON body does not match the solver contract.",
        field_errors=field_errors,
    )


def http_exception_problem(request: Request, exc: StarletteHTTPException) -> ProblemDetails:
    status = exc.status_code if 400 <= exc.status_code <= 599 else 500
    if status == 422:
        status = 400
    code, title = _http_defaults(status)
    return build_problem(
        request=request,
        status=status,
        code=code,
        title=title,
        detail=str(exc.detail) if exc.detail else None,
    )


def _trace_id(request: Request) -> str:
    state_id = getattr(request.state, "request_id", None)
    if isinstance(state_id, str) and state_id.strip():
        return state_id.strip()
    header = request.headers.get("x-request-id", "").strip()
    return header if header else str(uuid4())


def _field_path(location: tuple[object, ...]) -> str:
    parts = [str(item) for item in location if item != "body"]
    return ".".join(parts) if parts else "body"


def _error_code(error_type: str) -> str:
    code = "".join(character if character.isalnum() else "_" for character in error_type.upper())
    compact = "_".join(part for part in code.split("_") if part)
    if compact and compact[0].isalpha():
        return compact
    return "INVALID_FIELD"


def _http_defaults(status: int) -> tuple[str, str]:
    if status == 401:
        return "AUTHENTICATION_REQUIRED", "The service credential is missing or invalid"
    if status == 404:
        return "NOT_FOUND", "Resource not found"
    if status == 405:
        return "METHOD_NOT_ALLOWED", "Method not allowed"
    if status >= 500:
        return "INTERNAL_ERROR", "The solver failed while processing an accepted request"
    return "INVALID_REQUEST", "The request is malformed or violates a hard input invariant"
