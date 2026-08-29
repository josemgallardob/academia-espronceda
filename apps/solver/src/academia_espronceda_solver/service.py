from academia_espronceda_solver.config import SolverSettings
from academia_espronceda_solver.constants import (
    SUPPORTED_CONTRACT_VERSION,
    SUPPORTED_RULE_CATALOG_VERSION,
)
from academia_espronceda_solver.engine import ScheduleEngine
from academia_espronceda_solver.invariants import collect_request_invariants
from academia_espronceda_solver.problems import ProblemDetailsError
from academia_espronceda_solver.schemas import (
    FieldViolation,
    SolveScheduleRequest,
    SolveScheduleResponse,
)


def solve_schedule(
    request: SolveScheduleRequest,
    *,
    settings: SolverSettings,
    engine: ScheduleEngine,
) -> SolveScheduleResponse:
    _reject_incompatible_versions(request)
    _reject_invariant_violations(request)
    _reject_time_limit_outside_policy(request, settings.max_time_limit_seconds)

    try:
        outcome = engine.solve(request, time_limit_seconds=request.options.timeLimitSeconds)
    except ProblemDetailsError:
        raise
    except Exception as error:
        raise ProblemDetailsError(
            status=500,
            code="SOLVER_EXECUTION_FAILED",
            title="Solver execution failed",
            detail="The scheduling engine could not complete the accepted request.",
            solver_status="ERROR",
        ) from error

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


def _reject_incompatible_versions(request: SolveScheduleRequest) -> None:
    unsupported: list[FieldViolation] = []
    if request.contractVersion != SUPPORTED_CONTRACT_VERSION:
        unsupported.append(
            FieldViolation(
                field="contractVersion",
                code="INCOMPATIBLE_VERSION",
                message=(
                    f"Unsupported contract version {request.contractVersion}; "
                    f"supported version is {SUPPORTED_CONTRACT_VERSION}"
                ),
            )
        )
    if request.ruleCatalogVersion != SUPPORTED_RULE_CATALOG_VERSION:
        unsupported.append(
            FieldViolation(
                field="ruleCatalogVersion",
                code="INCOMPATIBLE_VERSION",
                message=(
                    f"Unsupported rule catalog version {request.ruleCatalogVersion}; "
                    f"supported version is {SUPPORTED_RULE_CATALOG_VERSION}"
                ),
            )
        )
    if unsupported:
        raise ProblemDetailsError(
            status=409,
            code="INCOMPATIBLE_VERSION",
            title="The contract or rule catalog version is not supported",
            detail="The solver only accepts published v1 contract and catalog versions.",
            field_errors=unsupported,
        )


def _reject_invariant_violations(request: SolveScheduleRequest) -> None:
    violations = collect_request_invariants(request)
    if violations:
        raise ProblemDetailsError(
            status=400,
            code="INVALID_REQUEST",
            title="The request is malformed or violates a hard input invariant",
            detail="The scheduling problem violates a hard input invariant.",
            field_errors=violations,
        )


def _reject_time_limit_outside_policy(
    request: SolveScheduleRequest,
    max_time_limit_seconds: float,
) -> None:
    requested = request.options.timeLimitSeconds
    if requested > max_time_limit_seconds:
        raise ProblemDetailsError(
            status=422,
            code="REJECTED_SOLVE_OPTIONS",
            title="Requested solve limits are outside server policy",
            detail=(
                f"timeLimitSeconds must be at most {max_time_limit_seconds:g} "
                "for this solver instance."
            ),
            field_errors=[
                FieldViolation(
                    field="options.timeLimitSeconds",
                    code="TIME_LIMIT_OUTSIDE_POLICY",
                    message=(
                        f"Requested {requested:g}s exceeds the maximum of "
                        f"{max_time_limit_seconds:g}s"
                    ),
                )
            ],
        )
