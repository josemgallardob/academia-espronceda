from dataclasses import dataclass
from time import perf_counter
from typing import Protocol

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


class UnavailableModelEngine:
    """Returns UNKNOWN without searching. CP-SAT modeling is a later solver task."""

    def solve(
        self,
        request: SolveScheduleRequest,
        *,
        time_limit_seconds: float,
    ) -> SolveOutcome:
        del request, time_limit_seconds
        started = perf_counter()
        strict_elapsed = _elapsed_ms(started)
        relaxed_started = perf_counter()
        relaxed_elapsed = _elapsed_ms(relaxed_started)
        return SolveOutcome(
            mode="RELAXED",
            status="UNKNOWN",
            attempts=(
                SolveAttempt(mode="STRICT", status="UNKNOWN", elapsedMilliseconds=strict_elapsed),
                SolveAttempt(mode="RELAXED", status="UNKNOWN", elapsedMilliseconds=relaxed_elapsed),
            ),
            solution=None,
            elapsed_milliseconds=strict_elapsed + relaxed_elapsed,
        )


def get_engine() -> ScheduleEngine:
    return UnavailableModelEngine()


def _elapsed_ms(started: float) -> int:
    return max(0, round((perf_counter() - started) * 1000))
