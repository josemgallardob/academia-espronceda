from regression_fixtures import (
    load_case_request,
    load_json,
    load_regression_cases,
    solve_case,
)

from academia_espronceda_solver.evaluate import evaluate_solution
from academia_espronceda_solver.schemas import WeeklyClass


def test_regression_battery_covers_the_named_reference_problems() -> None:
    ids = [case["id"] for case in load_regression_cases()]
    assert ids == [
        "minimal-valid",
        "multiple-valid-solutions",
        "impossible-availability",
        "student-overlap",
        "insufficient-capacity",
        "cross-subject-teachers",
        "best-effort-required",
        "weekly-hours-exceeded",
    ]


def test_solver_matches_published_regression_expectations() -> None:
    for case in load_regression_cases():
        expected = case["solve"]
        response = solve_case(case)
        assert response.mode == expected["mode"], case["id"]
        assert response.status in expected["statuses"], case["id"]
        if expected["hasUsableSolution"]:
            assert response.solution is not None, case["id"]
            finding_ids = {finding.ruleId for finding in response.solution.findings}
            assert finding_ids.issuperset(expected.get("requiredFindingRuleIds", [])), case["id"]
            assert finding_ids.isdisjoint(expected.get("forbiddenFindingRuleIds", [])), case["id"]
        else:
            assert response.solution is None, case["id"]


def test_published_responses_keep_the_same_functional_outcome() -> None:
    for case in load_regression_cases():
        if "response" not in case:
            continue
        live = solve_case(case)
        published = load_json(case["response"])
        assert published["mode"] == live.mode, case["id"]
        assert published["status"] == live.status, case["id"]
        if live.solution is None:
            assert published["solution"] is None, case["id"]
            continue
        assert published["solution"] is not None, case["id"]
        live_classes = {
            (item.teacherId, item.slotId, tuple(sorted(item.studentIds)))
            for item in live.solution.classes
        }
        published_classes = {
            (
                item["teacherId"],
                item["slotId"],
                tuple(sorted(item["studentIds"])),
            )
            for item in published["solution"]["classes"]
        }
        if case["solve"].get("allowMultipleSolutions"):
            assert {item[0] for item in live_classes} <= {"teacher-a", "teacher-b"}
            assert all(len(item[2]) == 4 for item in live_classes)
            assert all(len(item[2]) == 4 for item in published_classes)
            continue
        assert live_classes == published_classes, case["id"]
        live_findings = sorted(finding.ruleId for finding in live.solution.findings)
        published_findings = sorted(
            finding["ruleId"] for finding in published["solution"]["findings"]
        )
        assert live_findings == published_findings, case["id"]


def test_invalid_schedules_are_not_emitted_by_the_solver() -> None:
    for case in load_regression_cases():
        invalid_name = case.get("invalidSolution")
        if not invalid_name:
            continue
        response = solve_case(case)
        invalid = load_json(invalid_name)
        invalid_classes = {
            (item["teacherId"], item["slotId"], tuple(sorted(item["studentIds"])))
            for item in invalid["classes"]
        }
        if response.solution is None:
            continue
        live_classes = {
            (item.teacherId, item.slotId, tuple(sorted(item.studentIds)))
            for item in response.solution.classes
        }
        assert live_classes != invalid_classes, case["id"]


def test_cross_subject_allocations_cover_each_subject() -> None:
    case = next(item for item in load_regression_cases() if item["id"] == "cross-subject-teachers")
    response = solve_case(case)
    assert response.solution is not None
    by_teacher = {item.teacherId for item in response.solution.classes}
    assert by_teacher == {"teacher-2", "teacher-3"}
    assert len(response.solution.subjectTeacherAllocations) == 6


def test_evaluate_does_not_contradict_a_feasible_solver_score() -> None:
    for case in load_regression_cases():
        if not case["solve"]["hasUsableSolution"]:
            continue
        response = solve_case(case)
        assert response.solution is not None
        request = load_case_request(case)
        score, findings = evaluate_solution(
            request,
            response.solution.classes,
            response.solution.subjectTeacherAllocations,
        )
        assert [tier.penalty for tier in score.tiers] == [
            tier.penalty for tier in response.solution.score.tiers
        ]
        assert sorted(item.ruleId for item in findings) == sorted(
            item.ruleId for item in response.solution.findings
        )


def test_invalid_overlap_schedule_is_a_hard_student_conflict() -> None:
    classes = [
        WeeklyClass.model_validate(item)
        for item in load_json("student-overlap.invalid-solution.json")["classes"]
    ]
    assert {item.slotId for item in classes} == {"MONDAY_16_00", "MONDAY_16_30"}
    assert all(item.studentIds == ["student-1", "student-2", "student-3"] for item in classes)
