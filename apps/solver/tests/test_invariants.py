from collections.abc import Callable
from copy import deepcopy

from academia_espronceda_solver.invariants import collect_request_invariants
from academia_espronceda_solver.schemas import SolveScheduleRequest

LoadFixture = Callable[[str], dict]


def test_valid_fixture_has_no_invariant_violations(load_fixture: LoadFixture) -> None:
    request = SolveScheduleRequest.model_validate(load_fixture("strict-ideal.request.json"))

    assert collect_request_invariants(request) == []


def test_duplicate_slot_ids_are_rejected(load_fixture: LoadFixture) -> None:
    payload = deepcopy(load_fixture("strict-ideal.request.json"))
    payload["slots"].append(payload["slots"][0])
    request = SolveScheduleRequest.model_validate(payload)

    violations = collect_request_invariants(request)

    assert any(violation.code == "DUPLICATE_ID" for violation in violations)


def test_unknown_teacher_slot_is_rejected(load_fixture: LoadFixture) -> None:
    payload = deepcopy(load_fixture("strict-ideal.request.json"))
    payload["teachers"][0]["availableSlotIds"] = ["MISSING_SLOT"]
    request = SolveScheduleRequest.model_validate(payload)

    violations = collect_request_invariants(request)

    assert any(violation.code == "UNKNOWN_SLOT" for violation in violations)
