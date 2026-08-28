from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Sequence

from academia_espronceda_solver.rules import (
    ABOVE_IDEAL_PENALTY_PER_STUDENT,
    BELOW_IDEAL_PENALTY_PER_STUDENT,
    IDEAL_CAPACITY,
    MAXIMUM_CAPACITY,
    MINIMUM_CAPACITY,
    PREFERRED_SCIENCE_PROFILES,
    RULE_DEFINITIONS,
    SCORE_PRIORITIES,
    feasible_shared_sessions,
    has_science_workload,
    minimum_teachers_to_cover,
    teacher_compatible_with,
)
from academia_espronceda_solver.schemas import (
    EntityReference,
    FindingParameterValue,
    RuleScore,
    ScheduleScore,
    ScoreTier,
    SolverFinding,
    SolveScheduleRequest,
    SubjectTeacherAllocation,
    WeeklyClass,
)


def evaluate_solution(
    request: SolveScheduleRequest,
    classes: Sequence[WeeklyClass],
    allocations: Sequence[SubjectTeacherAllocation],
) -> tuple[ScheduleScore, list[SolverFinding]]:
    penalties: dict[int, float] = {priority: 0.0 for priority in SCORE_PRIORITIES}
    rule_totals: dict[str, list[float]] = defaultdict(list)
    findings: list[SolverFinding] = []

    _collect_class_capacity(classes, penalties, rule_totals, findings)
    _collect_teacher_continuity(request, classes, penalties, rule_totals, findings)
    _collect_related_students(request, classes, penalties, rule_totals, findings)
    _collect_preferred_teachers(request, classes, penalties, rule_totals, findings)

    ordered = sorted(findings, key=lambda item: (item.ruleId, item.fingerprint))
    breakdown = [
        RuleScore(
            ruleId=rule_id,
            priority=RULE_DEFINITIONS[rule_id].priority,
            occurrenceCount=len(amounts),
            penalty=sum(amounts),
        )
        for rule_id, amounts in sorted(
            rule_totals.items(),
            key=lambda item: (RULE_DEFINITIONS[item[0]].priority, item[0]),
        )
        if amounts
    ]
    score = ScheduleScore(
        direction="MINIMIZE",
        bestScore=0,
        tiers=[
            ScoreTier(priority=priority, penalty=penalties[priority])
            for priority in SCORE_PRIORITIES
        ],
        ruleBreakdown=breakdown,
    )
    return score, ordered


def canonical_json(value: object) -> str:
    if value is None or isinstance(value, (bool, int, float, str)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return f"[{','.join(canonical_json(item) for item in value)}]"
    if isinstance(value, dict):
        entries = sorted((key, item) for key, item in value.items() if item is not None)
        inner = ",".join(
            f"{json.dumps(key, ensure_ascii=False)}:{canonical_json(item)}" for key, item in entries
        )
        return f"{{{inner}}}"
    raise TypeError(f"Unsupported canonical JSON value: {type(value)!r}")


def fingerprint_of(payload: object) -> str:
    digest = hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def _collect_class_capacity(
    classes: Sequence[WeeklyClass],
    penalties: dict[int, float],
    rule_totals: dict[str, list[float]],
    findings: list[SolverFinding],
) -> None:
    for weekly_class in classes:
        actual = len(weekly_class.studentIds)
        if actual == 0:
            continue
        student_ids = list(weekly_class.studentIds)
        class_refs = [
            EntityReference(type="CLASS", id=weekly_class.id),
            EntityReference(type="TEACHER", id=weekly_class.teacherId),
            EntityReference(type="SLOT", id=weekly_class.slotId),
        ]
        if actual > MAXIMUM_CAPACITY:
            amount = actual - MAXIMUM_CAPACITY
            _add_finding(
                findings,
                penalties,
                rule_totals,
                "CLASS_CAPACITY_MAXIMUM",
                amount,
                entity_refs=class_refs,
                slot_ids=[weekly_class.slotId],
                parameters={
                    "studentIds": student_ids,
                    "actualCapacity": actual,
                    "maximumCapacity": MAXIMUM_CAPACITY,
                },
            )
        if actual < MINIMUM_CAPACITY:
            amount = MINIMUM_CAPACITY - actual
            _add_finding(
                findings,
                penalties,
                rule_totals,
                "CLASS_CAPACITY_MINIMUM",
                amount,
                entity_refs=class_refs,
                slot_ids=[weekly_class.slotId],
                parameters={
                    "studentIds": student_ids,
                    "actualCapacity": actual,
                    "minimumCapacity": MINIMUM_CAPACITY,
                },
            )
        if actual != IDEAL_CAPACITY:
            amount = (
                (IDEAL_CAPACITY - actual) * BELOW_IDEAL_PENALTY_PER_STUDENT
                if actual < IDEAL_CAPACITY
                else (actual - IDEAL_CAPACITY) * ABOVE_IDEAL_PENALTY_PER_STUDENT
            )
            _add_finding(
                findings,
                penalties,
                rule_totals,
                "CLASS_CAPACITY_IDEAL",
                amount,
                entity_refs=[EntityReference(type="CLASS", id=weekly_class.id)],
                slot_ids=[weekly_class.slotId],
                parameters={
                    "studentIds": student_ids,
                    "actualCapacity": actual,
                    "idealCapacity": IDEAL_CAPACITY,
                },
            )


def _collect_teacher_continuity(
    request: SolveScheduleRequest,
    classes: Sequence[WeeklyClass],
    penalties: dict[int, float],
    rule_totals: dict[str, list[float]],
    findings: list[SolverFinding],
) -> None:
    for student in request.students:
        assigned = _teachers_for_student(classes, student.id)
        if not assigned:
            continue
        subject_codes = [item.subjectCode for item in student.subjectHours]
        minimum = minimum_teachers_to_cover(subject_codes, request.teachers)
        extra = len(assigned) - minimum
        if extra <= 0:
            continue
        _add_finding(
            findings,
            penalties,
            rule_totals,
            "STUDENT_TEACHER_CONTINUITY",
            extra,
            entity_refs=[
                EntityReference(type="STUDENT", id=student.id),
                *[EntityReference(type="TEACHER", id=teacher_id) for teacher_id in assigned],
            ],
            slot_ids=[],
            parameters={
                "teacherIds": assigned,
                "subjectCodes": subject_codes,
                "minimumRequiredTeachers": minimum,
            },
        )


def _collect_related_students(
    request: SolveScheduleRequest,
    classes: Sequence[WeeklyClass],
    penalties: dict[int, float],
    rule_totals: dict[str, list[float]],
    findings: list[SolverFinding],
) -> None:
    students = {student.id: student for student in request.students}
    seen: set[tuple[str, str]] = set()
    for relationship in request.relationships:
        left_id, right_id = sorted(relationship.studentIds)
        pair = (left_id, right_id)
        if pair in seen:
            continue
        seen.add(pair)
        left = students.get(left_id)
        right = students.get(right_id)
        if left is None or right is None:
            continue
        shared_ids = [
            weekly_class.id
            for weekly_class in classes
            if left_id in weekly_class.studentIds and right_id in weekly_class.studentIds
        ]
        target = feasible_shared_sessions(left, right, request.teachers, request.slots)
        unshared = target - len(shared_ids)
        if target <= 0 or unshared <= 0:
            continue
        _add_finding(
            findings,
            penalties,
            rule_totals,
            "RELATED_STUDENTS_TOGETHER",
            unshared,
            entity_refs=[
                EntityReference(type="STUDENT", id=left_id),
                EntityReference(type="STUDENT", id=right_id),
            ],
            slot_ids=[],
            parameters={
                "studentIds": [left_id, right_id],
                "sharedClassIds": shared_ids,
                "sharedSessionTarget": target,
            },
        )


def _collect_preferred_teachers(
    request: SolveScheduleRequest,
    classes: Sequence[WeeklyClass],
    penalties: dict[int, float],
    rule_totals: dict[str, list[float]],
    findings: list[SolverFinding],
) -> None:
    students = {student.id: student for student in request.students}
    teachers = {teacher.id: teacher for teacher in request.teachers}
    for rule_id, course_code, preferred_profile, fallback_profile in PREFERRED_SCIENCE_PROFILES:
        preferred_teachers = [
            teacher for teacher in request.teachers if teacher.profile == preferred_profile
        ]
        for weekly_class in classes:
            assigned_teacher = teachers.get(weekly_class.teacherId)
            if assigned_teacher is None or assigned_teacher.profile != fallback_profile:
                continue
            for student_id in weekly_class.studentIds:
                student = students.get(student_id)
                if (
                    student is None
                    or student.courseCode != course_code
                    or not has_science_workload(student)
                ):
                    continue
                if not any(
                    teacher_compatible_with(teacher, student) for teacher in preferred_teachers
                ):
                    continue
                _add_finding(
                    findings,
                    penalties,
                    rule_totals,
                    rule_id,
                    1,
                    entity_refs=[
                        EntityReference(type="CLASS", id=weekly_class.id),
                        EntityReference(type="STUDENT", id=student.id),
                        EntityReference(type="TEACHER", id=weekly_class.teacherId),
                    ],
                    slot_ids=[weekly_class.slotId],
                    parameters={
                        "teacherProfile": assigned_teacher.profile,
                        "courseCode": student.courseCode,
                        "subjectCodes": [item.subjectCode for item in student.subjectHours],
                    },
                )


def _add_finding(
    findings: list[SolverFinding],
    penalties: dict[int, float],
    rule_totals: dict[str, list[float]],
    rule_id: str,
    amount: float,
    *,
    entity_refs: Sequence[EntityReference],
    slot_ids: Sequence[str],
    parameters: dict[str, FindingParameterValue],
) -> None:
    definition = RULE_DEFINITIONS[rule_id]
    priority = definition.priority
    enforcement = definition.enforcement
    severity = definition.severity
    refs = _sort_entity_refs(entity_refs)
    slots = unique_sorted(slot_ids)
    normalized = _normalize_parameters(parameters)
    findings.append(
        SolverFinding(
            fingerprint=fingerprint_of(
                {
                    "ruleId": rule_id,
                    "entityRefs": [item.model_dump() for item in refs],
                    "slotIds": slots,
                    "parameters": normalized,
                }
            ),
            ruleId=rule_id,
            enforcement=enforcement,
            severity=severity,
            blocksConfirmation=enforcement == "HARD",
            entityRefs=refs,
            slotIds=slots,
            parameters=normalized,
        )
    )
    penalties[priority] += amount
    rule_totals[rule_id].append(amount)


def _teachers_for_student(classes: Sequence[WeeklyClass], student_id: str) -> list[str]:
    return unique_sorted(
        weekly_class.teacherId for weekly_class in classes if student_id in weekly_class.studentIds
    )


def _sort_entity_refs(refs: Sequence[EntityReference]) -> list[EntityReference]:
    return sorted(refs, key=lambda item: (item.type, item.id))


def _normalize_parameters(
    parameters: dict[str, FindingParameterValue],
) -> dict[str, FindingParameterValue]:
    normalized: dict[str, FindingParameterValue] = {}
    for key in sorted(parameters):
        value = parameters[key]
        normalized[key] = unique_sorted(value) if isinstance(value, list) else value
    return normalized


def unique_sorted(values: Sequence[str]) -> list[str]:
    return sorted(set(values))
