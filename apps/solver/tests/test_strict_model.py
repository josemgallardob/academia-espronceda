from copy import deepcopy
from typing import Any

from academia_espronceda_solver.cpsat import solve_strict
from academia_espronceda_solver.engine import CpSatScheduleEngine
from academia_espronceda_solver.evaluate import evaluate_solution
from academia_espronceda_solver.schemas import (
    SolveScheduleRequest,
    SubjectTeacherAllocation,
    WeeklyClass,
)


def test_strict_ideal_fixture_is_optimal_with_preferred_teacher(load_fixture) -> None:
    request = SolveScheduleRequest.model_validate(load_fixture("strict-ideal.request.json"))

    status, solution = solve_strict(request, time_limit_seconds=5)

    assert status == "OPTIMAL"
    assert solution is not None
    assert len(solution.classes) == 1
    weekly_class = solution.classes[0]
    assert weekly_class.teacherId == "teacher-2"
    assert weekly_class.slotId == "MONDAY_16_00"
    assert weekly_class.studentIds == ["student-1", "student-2", "student-3", "student-4"]
    assert solution.subjectTeacherAllocations == []
    assert [tier.penalty for tier in solution.score.tiers] == [0, 0, 0, 0, 0, 0]
    assert solution.findings == []


def test_single_teacher_fixture_keeps_capacity_preference_findings(load_fixture) -> None:
    request = SolveScheduleRequest.model_validate(load_fixture("single-teacher.request.json"))

    status, solution = solve_strict(request, time_limit_seconds=5)

    assert status == "OPTIMAL"
    assert solution is not None
    assert {weekly_class.teacherId for weekly_class in solution.classes} == {"teacher-2"}
    assert {weekly_class.slotId for weekly_class in solution.classes} == {
        "MONDAY_16_00",
        "TUESDAY_16_00",
        "WEDNESDAY_16_00",
    }
    for weekly_class in solution.classes:
        assert weekly_class.studentIds == ["student-1", "student-2", "student-3"]
    assert solution.subjectTeacherAllocations == []
    assert solution.score.tiers[2].penalty == 3
    assert solution.score.ruleBreakdown[0].ruleId == "CLASS_CAPACITY_IDEAL"
    assert solution.score.ruleBreakdown[0].occurrenceCount == 3
    assert {finding.ruleId for finding in solution.findings} == {"CLASS_CAPACITY_IDEAL"}


def test_multi_teacher_subjects_are_allocated_exactly() -> None:
    request = SolveScheduleRequest.model_validate(_multi_teacher_request())

    status, solution = solve_strict(request, time_limit_seconds=5)

    assert status == "OPTIMAL"
    assert solution is not None
    by_teacher = {weekly_class.teacherId: weekly_class for weekly_class in solution.classes}
    assert set(by_teacher) == {"teacher-2", "teacher-3"}
    science_classes = [item for item in solution.classes if item.teacherId == "teacher-2"]
    language_classes = [item for item in solution.classes if item.teacherId == "teacher-3"]
    assert len(science_classes) == 2
    assert len(language_classes) == 1
    for weekly_class in solution.classes:
        assert weekly_class.studentIds == ["student-1", "student-2", "student-3"]
    assert len(solution.subjectTeacherAllocations) == 6
    for student_id in ("student-1", "student-2", "student-3"):
        physics = _allocation(solution.subjectTeacherAllocations, student_id, "teacher-2")
        english = _allocation(solution.subjectTeacherAllocations, student_id, "teacher-3")
        assert physics.totalHours == 2
        assert physics.subjectHours[0].subjectCode == "PHYSICS"
        assert english.totalHours == 1
        assert english.subjectHours[0].subjectCode == "ENGLISH"


def test_fewer_than_minimum_capacity_is_strictly_infeasible(load_fixture) -> None:
    payload = deepcopy(load_fixture("strict-ideal.request.json"))
    payload["students"] = payload["students"][:2]
    payload["relationships"] = []
    request = SolveScheduleRequest.model_validate(payload)

    status, solution = solve_strict(request, time_limit_seconds=5)

    assert status == "INFEASIBLE"
    assert solution is None


def test_related_students_share_a_class_when_the_group_must_split() -> None:
    request = SolveScheduleRequest.model_validate(_six_students_one_slot_request())

    status, solution = solve_strict(request, time_limit_seconds=5)

    assert status == "OPTIMAL"
    assert solution is not None
    assert len(solution.classes) == 2
    shared = [
        weekly_class
        for weekly_class in solution.classes
        if "student-1" in weekly_class.studentIds and "student-2" in weekly_class.studentIds
    ]
    assert len(shared) == 1
    assert len(shared[0].studentIds) == 3


def test_overlapping_slots_are_infeasible_when_hours_require_both(load_fixture) -> None:
    payload = deepcopy(load_fixture("single-teacher.request.json"))
    payload["slots"].append(
        {
            "id": "MONDAY_16_30",
            "dayOfWeek": "MONDAY",
            "startTime": "16:30",
            "endTime": "17:30",
        }
    )
    payload["teachers"][0]["availableSlotIds"] = ["MONDAY_16_00", "MONDAY_16_30"]
    payload["slots"] = [
        slot for slot in payload["slots"] if slot["id"] in {"MONDAY_16_00", "MONDAY_16_30"}
    ]
    request = SolveScheduleRequest.model_validate(payload)

    status, solution = solve_strict(request, time_limit_seconds=5)

    assert status == "INFEASIBLE"
    assert solution is None


def test_empty_students_yield_an_empty_optimal_schedule(load_fixture) -> None:
    payload = deepcopy(load_fixture("strict-ideal.request.json"))
    payload["students"] = []
    payload["relationships"] = []
    request = SolveScheduleRequest.model_validate(payload)

    status, solution = solve_strict(request, time_limit_seconds=5)

    assert status == "OPTIMAL"
    assert solution is not None
    assert solution.classes == []
    assert solution.findings == []


def test_engine_exposes_a_single_strict_attempt(load_fixture) -> None:
    request = SolveScheduleRequest.model_validate(load_fixture("strict-ideal.request.json"))

    outcome = CpSatScheduleEngine().solve(request, time_limit_seconds=5)

    assert outcome.mode == "STRICT"
    assert outcome.status == "OPTIMAL"
    assert len(outcome.attempts) == 1
    assert outcome.attempts[0].mode == "STRICT"
    assert outcome.solution is not None


def test_evaluate_scores_ideal_capacity_like_the_catalog() -> None:
    classes = [
        WeeklyClass(
            id="class-a",
            teacherId="teacher-2",
            slotId="MONDAY_16_00",
            studentIds=["student-1", "student-2", "student-3"],
        )
    ]
    request = SolveScheduleRequest.model_validate(_single_class_request())

    score, findings = evaluate_solution(request, classes, [])

    assert score.tiers[2].penalty == 1
    assert findings[0].ruleId == "CLASS_CAPACITY_IDEAL"
    assert findings[0].parameters["actualCapacity"] == 3
    assert findings[0].fingerprint.startswith("sha256:")


def _allocation(
    allocations: list[SubjectTeacherAllocation],
    student_id: str,
    teacher_id: str,
) -> SubjectTeacherAllocation:
    matches = [
        item
        for item in allocations
        if item.studentId == student_id and item.teacherId == teacher_id
    ]
    assert len(matches) == 1
    return matches[0]


def _multi_teacher_request() -> dict[str, Any]:
    return {
        "contractVersion": "1.0.0",
        "ruleCatalogVersion": "1.0.0",
        "requestId": "request-multi-teacher",
        "timezone": "Europe/Madrid",
        "slots": [
            _slot("MONDAY_16_00", "MONDAY"),
            _slot("TUESDAY_16_00", "TUESDAY"),
            _slot("WEDNESDAY_16_00", "WEDNESDAY"),
        ],
        "teachers": [
            {
                "id": "teacher-2",
                "profile": "GENERAL_SCIENCES",
                "supportedCourseCodes": ["BACH_1"],
                "supportedSubjectCodes": ["PHYSICS", "MATHEMATICS"],
                "availableSlotIds": ["MONDAY_16_00", "TUESDAY_16_00", "WEDNESDAY_16_00"],
            },
            {
                "id": "teacher-3",
                "profile": "LANGUAGES",
                "supportedCourseCodes": ["BACH_1"],
                "supportedSubjectCodes": ["ENGLISH"],
                "availableSlotIds": ["MONDAY_16_00", "TUESDAY_16_00", "WEDNESDAY_16_00"],
            },
        ],
        "students": [
            _student("student-1", [("PHYSICS", 2), ("ENGLISH", 1)]),
            _student("student-2", [("PHYSICS", 2), ("ENGLISH", 1)]),
            _student("student-3", [("PHYSICS", 2), ("ENGLISH", 1)]),
        ],
        "relationships": [],
        "options": {"timeLimitSeconds": 10, "randomSeed": 12345},
    }


def _six_students_one_slot_request() -> dict[str, Any]:
    students = [_student(f"student-{index}", [("MATHEMATICS", 1)]) for index in range(1, 7)]
    return {
        "contractVersion": "1.0.0",
        "ruleCatalogVersion": "1.0.0",
        "requestId": "request-related-split",
        "timezone": "Europe/Madrid",
        "slots": [_slot("MONDAY_16_00", "MONDAY")],
        "teachers": [
            {
                "id": "teacher-1",
                "profile": "SENIOR_SCIENCES",
                "supportedCourseCodes": ["BACH_1"],
                "supportedSubjectCodes": ["MATHEMATICS"],
                "availableSlotIds": ["MONDAY_16_00"],
            },
            {
                "id": "teacher-2",
                "profile": "GENERAL_SCIENCES",
                "supportedCourseCodes": ["BACH_1"],
                "supportedSubjectCodes": ["MATHEMATICS"],
                "availableSlotIds": ["MONDAY_16_00"],
            },
        ],
        "students": students,
        "relationships": [{"studentIds": ["student-1", "student-2"]}],
        "options": {"timeLimitSeconds": 10, "randomSeed": 12345},
    }


def _single_class_request() -> dict[str, Any]:
    payload = _multi_teacher_request()
    payload["teachers"] = [payload["teachers"][0]]
    payload["slots"] = [payload["slots"][0]]
    payload["students"] = [
        _student("student-1", [("PHYSICS", 1)]),
        _student("student-2", [("PHYSICS", 1)]),
        _student("student-3", [("PHYSICS", 1)]),
    ]
    payload["teachers"][0]["availableSlotIds"] = ["MONDAY_16_00"]
    return payload


def _student(student_id: str, subject_hours: list[tuple[str, int]]) -> dict[str, Any]:
    return {
        "id": student_id,
        "status": "ACTIVE",
        "courseCode": "BACH_1",
        "subjectHours": [
            {"subjectCode": subject_code, "weeklyHours": hours}
            for subject_code, hours in subject_hours
        ],
        "weeklyHoursTotal": sum(hours for _, hours in subject_hours),
        "unavailableSlotIds": [],
    }


def _slot(slot_id: str, day: str) -> dict[str, str]:
    return {"id": slot_id, "dayOfWeek": day, "startTime": "16:00", "endTime": "17:00"}
