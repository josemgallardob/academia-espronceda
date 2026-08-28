from dataclasses import dataclass
from time import perf_counter
from typing import Protocol

from academia_espronceda_solver.cpsat import solve_strict
from academia_espronceda_solver.schemas import (
    SolveAttempt,
    SolveOutcomeStatus,
    SolverMode,
    SolverSolution,
    SolveScheduleRequest,
)


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


class StrictCpSatEngine:
    def solve(
        self,
        request: SolveScheduleRequest,
        *,
        time_limit_seconds: float,
    ) -> SolveOutcome:
        started = perf_counter()
        status, solution = solve_strict(request, time_limit_seconds=time_limit_seconds)
        elapsed = _elapsed_ms(started)
        return SolveOutcome(
            mode="STRICT",
            status=status,
            attempts=(SolveAttempt(mode="STRICT", status=status, elapsedMilliseconds=elapsed),),
            solution=solution,
            elapsed_milliseconds=elapsed,
        )


def get_engine() -> ScheduleEngine:
    return StrictCpSatEngine()


def _elapsed_ms(started: float) -> int:
    return max(0, round((perf_counter() - started) * 1000))
