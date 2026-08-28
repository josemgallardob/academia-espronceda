from copy import deepcopy
from typing import Any

from academia_espronceda_solver import engine as engine_module
from academia_espronceda_solver.cpsat import solve_attempt
from academia_espronceda_solver.engine import CpSatScheduleEngine
from academia_espronceda_solver.evaluate import evaluate_solution
from academia_espronceda_solver.schemas import SolveScheduleRequest, WeeklyClass


def test_two_students_use_relaxed_minimum_capacity(load_fixture) -> None:
    request = SolveScheduleRequest.model_validate(_two_student_payload(load_fixture))

    outcome = CpSatScheduleEngine().solve(request, time_limit_seconds=5)

    assert outcome.mode == "RELAXED"
    assert outcome.status == "OPTIMAL"
    assert [attempt.mode for attempt in outcome.attempts] == ["STRICT", "RELAXED"]
    assert outcome.attempts[0].status == "INFEASIBLE"
    assert outcome.attempts[1].status == "OPTIMAL"
    assert outcome.solution is not None
    assert len(outcome.solution.classes) == 1
    weekly_class = outcome.solution.classes[0]
    assert weekly_class.studentIds == ["student-1", "student-2"]
    assert weekly_class.teacherId == "teacher-2"
    assert [tier.penalty for tier in outcome.solution.score.tiers] == [0, 1, 2, 0, 0, 0]
    rule_ids = [finding.ruleId for finding in outcome.solution.findings]
    assert rule_ids == ["CLASS_CAPACITY_IDEAL", "CLASS_CAPACITY_MINIMUM"]
    minimum = next(
        finding
        for finding in outcome.solution.findings
        if finding.ruleId == "CLASS_CAPACITY_MINIMUM"
    )
    assert minimum.enforcement == "RELAXABLE"
    assert minimum.blocksConfirmation is False
    assert minimum.parameters["actualCapacity"] == 2
    assert minimum.fingerprint.startswith("sha256:")


def test_six_students_one_slot_relaxes_maximum_capacity() -> None:
    request = SolveScheduleRequest.model_validate(_six_students_one_teacher_request())

    outcome = CpSatScheduleEngine().solve(request, time_limit_seconds=5)

    assert outcome.mode == "RELAXED"
    assert outcome.status == "OPTIMAL"
    assert outcome.attempts[0].status == "INFEASIBLE"
    assert outcome.solution is not None
    assert len(outcome.solution.classes) == 1
    assert len(outcome.solution.classes[0].studentIds) == 6
    assert outcome.solution.score.tiers[0].penalty == 1
    assert outcome.solution.score.tiers[1].penalty == 0
    assert {finding.ruleId for finding in outcome.solution.findings} == {
        "CLASS_CAPACITY_MAXIMUM",
        "CLASS_CAPACITY_IDEAL",
    }


def test_hard_infeasibility_is_infeasible_in_both_modes(load_fixture) -> None:
    payload = deepcopy(load_fixture("single-teacher.request.json"))
    payload["slots"] = [
        {
            "id": "MONDAY_16_00",
            "dayOfWeek": "MONDAY",
            "startTime": "16:00",
            "endTime": "17:00",
        },
        {
            "id": "MONDAY_16_30",
            "dayOfWeek": "MONDAY",
            "startTime": "16:30",
            "endTime": "17:30",
        },
    ]
    payload["teachers"][0]["availableSlotIds"] = ["MONDAY_16_00", "MONDAY_16_30"]
    request = SolveScheduleRequest.model_validate(payload)

    outcome = CpSatScheduleEngine().solve(request, time_limit_seconds=5)

    assert outcome.mode == "RELAXED"
    assert outcome.status == "INFEASIBLE"
    assert [attempt.status for attempt in outcome.attempts] == ["INFEASIBLE", "INFEASIBLE"]
    assert outcome.solution is None


def test_same_seed_reproduces_the_relaxed_assignment() -> None:
    request = SolveScheduleRequest.model_validate(_six_students_one_teacher_request())
    engine = CpSatScheduleEngine()

    first = engine.solve(request, time_limit_seconds=5)
    second = engine.solve(request, time_limit_seconds=5)

    assert first.solution is not None
    assert second.solution is not None
    assert [
        (weekly_class.teacherId, weekly_class.slotId, weekly_class.studentIds)
        for weekly_class in first.solution.classes
    ] == [
        (weekly_class.teacherId, weekly_class.slotId, weekly_class.studentIds)
        for weekly_class in second.solution.classes
    ]
    assert [finding.fingerprint for finding in first.solution.findings] == [
        finding.fingerprint for finding in second.solution.findings
    ]


def test_unknown_strict_falls_back_to_relaxed(monkeypatch, load_fixture) -> None:
    request = SolveScheduleRequest.model_validate(_two_student_payload(load_fixture))

    def fake_attempt(problem, *, mode, time_limit_seconds):
        if mode == "STRICT":
            return "UNKNOWN", None
        return solve_attempt(problem, mode=mode, time_limit_seconds=time_limit_seconds)

    monkeypatch.setattr(engine_module, "solve_attempt", fake_attempt)

    outcome = CpSatScheduleEngine().solve(request, time_limit_seconds=5)

    assert outcome.mode == "RELAXED"
    assert outcome.status == "OPTIMAL"
    assert [attempt.status for attempt in outcome.attempts] == ["UNKNOWN", "OPTIMAL"]
    assert outcome.solution is not None


def test_unknown_in_both_passes_returns_no_solution(monkeypatch, load_fixture) -> None:
    request = SolveScheduleRequest.model_validate(load_fixture("strict-ideal.request.json"))

    monkeypatch.setattr(
        engine_module,
        "solve_attempt",
        lambda problem, *, mode, time_limit_seconds: ("UNKNOWN", None),
    )

    outcome = CpSatScheduleEngine().solve(request, time_limit_seconds=5)

    assert outcome.mode == "RELAXED"
    assert outcome.status == "UNKNOWN"
    assert [attempt.status for attempt in outcome.attempts] == ["UNKNOWN", "UNKNOWN"]
    assert outcome.solution is None


def test_evaluate_explains_capacity_minimum_and_maximum() -> None:
    request = SolveScheduleRequest.model_validate(_six_students_one_teacher_request())
    overcrowded = [
        WeeklyClass(
            id="class-over",
            teacherId="teacher-2",
            slotId="MONDAY_16_00",
            studentIds=[f"student-{index}" for index in range(1, 7)],
        )
    ]

    score, findings = evaluate_solution(request, overcrowded, [])

    assert score.tiers[0].penalty == 1
    assert score.tiers[2].penalty == 4
    assert {item.ruleId for item in findings} == {"CLASS_CAPACITY_MAXIMUM", "CLASS_CAPACITY_IDEAL"}


def _two_student_payload(load_fixture) -> dict[str, Any]:
    payload = deepcopy(load_fixture("strict-ideal.request.json"))
    payload["requestId"] = "request-relaxed-capacity"
    payload["students"] = payload["students"][:2]
    payload["relationships"] = []
    return payload


def _six_students_one_teacher_request() -> dict[str, Any]:
    return {
        "contractVersion": "1.0.0",
        "ruleCatalogVersion": "1.0.0",
        "requestId": "request-relaxed-maximum",
        "timezone": "Europe/Madrid",
        "slots": [
            {
                "id": "MONDAY_16_00",
                "dayOfWeek": "MONDAY",
                "startTime": "16:00",
                "endTime": "17:00",
            }
        ],
        "teachers": [
            {
                "id": "teacher-2",
                "profile": "GENERAL_SCIENCES",
                "supportedCourseCodes": ["BACH_1"],
                "supportedSubjectCodes": ["MATHEMATICS"],
                "availableSlotIds": ["MONDAY_16_00"],
            }
        ],
        "students": [
            {
                "id": f"student-{index}",
                "status": "ACTIVE",
                "courseCode": "BACH_1",
                "subjectHours": [{"subjectCode": "MATHEMATICS", "weeklyHours": 1}],
                "weeklyHoursTotal": 1,
                "unavailableSlotIds": [],
            }
            for index in range(1, 7)
        ],
        "relationships": [],
        "options": {"timeLimitSeconds": 10, "randomSeed": 12345},
    }
