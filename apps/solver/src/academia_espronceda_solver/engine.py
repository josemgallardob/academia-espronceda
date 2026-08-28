from dataclasses import dataclass
from time import perf_counter
from typing import Protocol

from academia_espronceda_solver.cpsat import solve_attempt
from academia_espronceda_solver.schemas import (
    SolveAttempt,
    SolveOutcomeStatus,
    SolverMode,
    SolverSolution,
    SolveScheduleRequest,
)

_SUCCESS_STATUSES = frozenset({"OPTIMAL", "FEASIBLE"})


@dataclass(frozen=True)
class SolveOutcome:
    mode: SolverMode
    status: SolveOutcomeStatus
    attempts: tuple[SolveAttempt, ...]
    solution: SolverSolution | None
    elapsed_milliseconds: int


class ScheduleEngine(Protocol):
    def solve(
        self,
        request: SolveScheduleRequest,
        *,
        time_limit_seconds: float,
    ) -> SolveOutcome: ...


class CpSatScheduleEngine:
    def solve(
        self,
        request: SolveScheduleRequest,
        *,
        time_limit_seconds: float,
    ) -> SolveOutcome:
        strict_started = perf_counter()
        strict_status, strict_solution = solve_attempt(
            request, mode="STRICT", time_limit_seconds=time_limit_seconds
        )
        strict_elapsed = _elapsed_ms(strict_started)
        strict_attempt = SolveAttempt(
            mode="STRICT",
            status=strict_status,
            elapsedMilliseconds=strict_elapsed,
        )
        if strict_status in _SUCCESS_STATUSES:
            return SolveOutcome(
                mode="STRICT",
                status=strict_status,
                attempts=(strict_attempt,),
                solution=strict_solution,
                elapsed_milliseconds=strict_elapsed,
            )

        relaxed_started = perf_counter()
        relaxed_status, relaxed_solution = solve_attempt(
            request, mode="RELAXED", time_limit_seconds=time_limit_seconds
        )
        relaxed_elapsed = _elapsed_ms(relaxed_started)
        return SolveOutcome(
            mode="RELAXED",
            status=relaxed_status,
            attempts=(
                strict_attempt,
                SolveAttempt(
                    mode="RELAXED",
                    status=relaxed_status,
                    elapsedMilliseconds=relaxed_elapsed,
                ),
            ),
            solution=relaxed_solution,
            elapsed_milliseconds=strict_elapsed + relaxed_elapsed,
        )


def get_engine() -> ScheduleEngine:
    return CpSatScheduleEngine()


def _elapsed_ms(started: float) -> int:
    return max(0, round((perf_counter() - started) * 1000))
