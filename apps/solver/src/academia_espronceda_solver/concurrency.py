from __future__ import annotations

import threading

from academia_espronceda_solver.problems import ProblemDetailsError

_lock = threading.Lock()
_limiter: threading.BoundedSemaphore | None = None
_limit = 1


def configure_concurrency(max_concurrent: int) -> None:
    global _limiter, _limit
    if max_concurrent < 1:
        raise ValueError("SOLVER_MAX_CONCURRENT must be a positive integer")
    with _lock:
        _limit = max_concurrent
        _limiter = threading.BoundedSemaphore(max_concurrent)


def current_limit() -> int:
    return _limit


def try_acquire_solve_slot() -> bool:
    limiter = _require_limiter()
    return limiter.acquire(blocking=False)


def release_solve_slot() -> None:
    _require_limiter().release()


def reject_if_busy() -> None:
    if try_acquire_solve_slot():
        return
    raise ProblemDetailsError(
        status=503,
        code="SOLVER_BUSY",
        title="The solver is already running a generation",
        detail="Retry when the current solve request has finished.",
    )


def _require_limiter() -> threading.BoundedSemaphore:
    global _limiter
    if _limiter is None:
        configure_concurrency(_limit)
    assert _limiter is not None
    return _limiter
