from collections.abc import Sequence
from dataclasses import dataclass

from academia_espronceda_solver.schemas import (
    CourseCode,
    FindingSeverity,
    RuleEnforcement,
    SolverStudent,
    SolverTeacher,
    SubjectCode,
    TeacherProfile,
    WeeklySlot,
)

MAXIMUM_CAPACITY = 5
MINIMUM_CAPACITY = 3
IDEAL_CAPACITY = 4
BELOW_IDEAL_PENALTY_PER_STUDENT = 1
ABOVE_IDEAL_PENALTY_PER_STUDENT = 2
SCORE_PRIORITIES = (1, 2, 3, 4, 5, 6)


@dataclass(frozen=True)
class RuleDefinition:
    enforcement: RuleEnforcement
    severity: FindingSeverity
    priority: int


SCIENCE_SUBJECT_CODES: frozenset[SubjectCode] = frozenset(
    {
        "MATHEMATICS",
        "SOCIAL_SCIENCES_MATHEMATICS",
        "PHYSICS",
        "CHEMISTRY",
        "BIOLOGY",
    }
)

RULE_DEFINITIONS: dict[str, RuleDefinition] = {
    "CLASS_CAPACITY_MAXIMUM": RuleDefinition("RELAXABLE", "ERROR", 1),
    "CLASS_CAPACITY_MINIMUM": RuleDefinition("RELAXABLE", "ERROR", 2),
    "CLASS_CAPACITY_IDEAL": RuleDefinition("PREFERENCE", "WARNING", 3),
    "STUDENT_TEACHER_CONTINUITY": RuleDefinition("PREFERENCE", "WARNING", 4),
    "RELATED_STUDENTS_TOGETHER": RuleDefinition("PREFERENCE", "WARNING", 5),
    "PREFERRED_TEACHER_BACH1_SCIENCES": RuleDefinition("PREFERENCE", "WARNING", 6),
    "PREFERRED_TEACHER_OTHER_SCIENCES": RuleDefinition("PREFERENCE", "WARNING", 6),
}

PREFERRED_SCIENCE_PROFILES: tuple[tuple[str, CourseCode, TeacherProfile, TeacherProfile], ...] = (
    ("PREFERRED_TEACHER_BACH1_SCIENCES", "BACH_1", "GENERAL_SCIENCES", "SENIOR_SCIENCES"),
    ("PREFERRED_TEACHER_OTHER_SCIENCES", "OTHER", "SENIOR_SCIENCES", "GENERAL_SCIENCES"),
)


def teacher_compatible_with(teacher: SolverTeacher, student: SolverStudent) -> bool:
    teacher_subjects = set(teacher.supportedSubjectCodes)
    return student.courseCode in teacher.supportedCourseCodes and any(
        item.subjectCode in teacher_subjects for item in student.subjectHours
    )


def teacher_supports_subject(
    teacher: SolverTeacher,
    student: SolverStudent,
    subject_code: SubjectCode,
) -> bool:
    return (
        student.courseCode in teacher.supportedCourseCodes
        and subject_code in teacher.supportedSubjectCodes
    )


def has_science_workload(student: SolverStudent) -> bool:
    return any(item.subjectCode in SCIENCE_SUBJECT_CODES for item in student.subjectHours)


def minimum_teachers_to_cover(
    subject_codes: Sequence[SubjectCode],
    teachers: Sequence[SolverTeacher],
) -> int:
    needed = set(subject_codes)
    if not needed:
        return 1
    candidates = [
        teacher
        for teacher in teachers
        if any(code in needed for code in teacher.supportedSubjectCodes)
    ]
    best = max(len(needed), 1)
    total = len(candidates)
    for mask in range(1, 1 << total):
        covered: set[SubjectCode] = set()
        count = 0
        for index, teacher in enumerate(candidates):
            if (mask & (1 << index)) == 0:
                continue
            count += 1
            for code in teacher.supportedSubjectCodes:
                if code in needed:
                    covered.add(code)
        if covered == needed:
            best = min(best, count)
    return best


def feasible_shared_sessions(
    left: SolverStudent,
    right: SolverStudent,
    teachers: Sequence[SolverTeacher],
    slots: Sequence[WeeklySlot],
) -> int:
    compatible_teachers = [
        teacher
        for teacher in teachers
        if teacher_compatible_with(teacher, left) and teacher_compatible_with(teacher, right)
    ]
    if not compatible_teachers:
        return 0
    unavailable = set(left.unavailableSlotIds) | set(right.unavailableSlotIds)
    feasible_slots = sum(
        1
        for slot in slots
        if slot.id not in unavailable
        and any(slot.id in teacher.availableSlotIds for teacher in compatible_teachers)
    )
    return min(left.weeklyHoursTotal, right.weeklyHoursTotal, feasible_slots)


def overlapping_slot_pairs(
    slots: Sequence[WeeklySlot],
) -> tuple[tuple[WeeklySlot, WeeklySlot], ...]:
    pairs: list[tuple[WeeklySlot, WeeklySlot]] = []
    for left_index, left in enumerate(slots):
        for right in slots[left_index + 1 :]:
            if slots_overlap(left, right):
                pairs.append((left, right))
    return tuple(pairs)


def slots_overlap(left: WeeklySlot, right: WeeklySlot) -> bool:
    if left.dayOfWeek != right.dayOfWeek:
        return False
    left_start = _minutes(left.startTime)
    left_end = _minutes(left.endTime)
    right_start = _minutes(right.startTime)
    right_end = _minutes(right.endTime)
    return left_start < right_end and right_start < left_end


def class_id_for(teacher_id: str, slot_id: str) -> str:
    return f"class-{slot_id}-{teacher_id}"


def _minutes(value: str) -> int:
    hours, minutes = (int(part) for part in value.split(":"))
    return hours * 60 + minutes
