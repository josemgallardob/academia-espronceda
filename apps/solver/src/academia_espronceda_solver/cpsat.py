from collections.abc import Sequence
from dataclasses import dataclass

from ortools.sat.python import cp_model

from academia_espronceda_solver.evaluate import evaluate_solution, unique_sorted
from academia_espronceda_solver.rules import (
    ABOVE_IDEAL_PENALTY_PER_STUDENT,
    BELOW_IDEAL_PENALTY_PER_STUDENT,
    IDEAL_CAPACITY,
    MAXIMUM_CAPACITY,
    MINIMUM_CAPACITY,
    PREFERRED_SCIENCE_PROFILES,
    class_id_for,
    feasible_shared_sessions,
    has_science_workload,
    minimum_teachers_to_cover,
    overlapping_slot_pairs,
    teacher_compatible_with,
    teacher_supports_subject,
)
from academia_espronceda_solver.schemas import (
    SolveOutcomeStatus,
    SolverMode,
    SolverSolution,
    SolveScheduleRequest,
    SubjectHours,
    SubjectTeacherAllocation,
    WeeklyClass,
)

AssignKey = tuple[str, str, str]
AllocKey = tuple[str, str, str]


@dataclass(frozen=True)
class _ClassGroup:
    teacher_id: str
    slot_id: str
    size: object
    occupied: cp_model.IntVar


def solve_strict(
    request: SolveScheduleRequest,
    *,
    time_limit_seconds: float,
) -> tuple[SolveOutcomeStatus, SolverSolution | None]:
    return solve_attempt(request, mode="STRICT", time_limit_seconds=time_limit_seconds)


def solve_attempt(
    request: SolveScheduleRequest,
    *,
    mode: SolverMode,
    time_limit_seconds: float,
) -> tuple[SolveOutcomeStatus, SolverSolution | None]:
    strict = mode == "STRICT"
    model = cp_model.CpModel()
    assign = _assignment_vars(model, request)
    alloc = _allocation_vars(model, request, assign)
    groups = _class_groups(model, request, assign)

    _constrain_exact_hours(model, request, assign)
    _constrain_no_student_overlap(model, request, assign)
    _constrain_occupied_teacher_slots(model, groups)
    _constrain_teacher_continuity(model, request, assign)
    _constrain_class_capacity(model, groups, strict=strict)
    _constrain_subject_hours(model, request, assign, alloc)
    _minimize_lexicographic_preferences(model, request, assign, groups, strict=strict)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.random_seed = request.options.randomSeed & 0x7FFFFFFF
    solver.parameters.num_search_workers = 1
    solver.parameters.log_search_progress = False

    status_code = solver.Solve(model)
    status = _map_status(status_code)
    if status_code == cp_model.MODEL_INVALID:
        raise RuntimeError(f"The {mode.lower()} CP-SAT model is invalid")
    if status not in {"OPTIMAL", "FEASIBLE"}:
        return status, None
    return status, _extract_solution(request, solver, assign, alloc)


def _assignment_vars(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
) -> dict[AssignKey, cp_model.IntVar]:
    assign: dict[AssignKey, cp_model.IntVar] = {}
    slot_ids = {slot.id for slot in request.slots}
    for student in request.students:
        unavailable = set(student.unavailableSlotIds)
        for teacher in request.teachers:
            if not teacher_compatible_with(teacher, student):
                continue
            for slot_id in teacher.availableSlotIds:
                if slot_id not in slot_ids or slot_id in unavailable:
                    continue
                key = (student.id, teacher.id, slot_id)
                assign[key] = model.NewBoolVar(f"assign:{student.id}:{teacher.id}:{slot_id}")
    return assign


def _allocation_vars(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    assign: dict[AssignKey, cp_model.IntVar],
) -> dict[AllocKey, cp_model.IntVar]:
    feasible_pairs = {(student_id, teacher_id) for student_id, teacher_id, _ in assign}
    alloc: dict[AllocKey, cp_model.IntVar] = {}
    for student in request.students:
        for subject in student.subjectHours:
            for teacher in request.teachers:
                if (student.id, teacher.id) not in feasible_pairs:
                    continue
                if not teacher_supports_subject(teacher, student, subject.subjectCode):
                    continue
                key = (student.id, subject.subjectCode, teacher.id)
                alloc[key] = model.NewBoolVar(
                    f"alloc:{student.id}:{subject.subjectCode}:{teacher.id}"
                )
    return alloc


def _constrain_exact_hours(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    assign: dict[AssignKey, cp_model.IntVar],
) -> None:
    for student in request.students:
        variables = [
            variable for (student_id, _, _), variable in assign.items() if student_id == student.id
        ]
        model.Add(sum(variables) == student.weeklyHoursTotal)


def _constrain_no_student_overlap(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    assign: dict[AssignKey, cp_model.IntVar],
) -> None:
    for student in request.students:
        for slot in request.slots:
            variables = [
                variable
                for (student_id, _, slot_id), variable in assign.items()
                if student_id == student.id and slot_id == slot.id
            ]
            if variables:
                model.Add(sum(variables) <= 1)
        for left, right in overlapping_slot_pairs(request.slots):
            variables = [
                variable
                for (student_id, _, slot_id), variable in assign.items()
                if student_id == student.id and slot_id in {left.id, right.id}
            ]
            if variables:
                model.Add(sum(variables) <= 1)


def _class_groups(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    assign: dict[AssignKey, cp_model.IntVar],
) -> list[_ClassGroup]:
    groups: list[_ClassGroup] = []
    known_slots = {slot.id for slot in request.slots}
    for teacher in request.teachers:
        for slot_id in teacher.availableSlotIds:
            if slot_id not in known_slots:
                continue
            variables = [
                variable
                for (_, teacher_id, assigned_slot_id), variable in assign.items()
                if teacher_id == teacher.id and assigned_slot_id == slot_id
            ]
            if not variables:
                continue
            size = sum(variables)
            occupied = model.NewBoolVar(f"occupied:{teacher.id}:{slot_id}")
            model.Add(size >= 1).OnlyEnforceIf(occupied)
            model.Add(size == 0).OnlyEnforceIf(occupied.Not())
            groups.append(
                _ClassGroup(
                    teacher_id=teacher.id,
                    slot_id=slot_id,
                    size=size,
                    occupied=occupied,
                )
            )
    return groups


def _constrain_occupied_teacher_slots(
    model: cp_model.CpModel,
    groups: Sequence[_ClassGroup],
) -> None:
    for group in groups:
        model.Add(group.size >= 1)


def _constrain_class_capacity(
    model: cp_model.CpModel,
    groups: Sequence[_ClassGroup],
    *,
    strict: bool,
) -> None:
    if not strict:
        return
    for group in groups:
        model.Add(group.size <= MAXIMUM_CAPACITY)
        model.Add(group.size >= MINIMUM_CAPACITY).OnlyEnforceIf(group.occupied)


def _constrain_subject_hours(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    assign: dict[AssignKey, cp_model.IntVar],
    alloc: dict[AllocKey, cp_model.IntVar],
) -> None:
    for student in request.students:
        for subject in student.subjectHours:
            subject_vars = [
                variable
                for (student_id, subject_code, _), variable in alloc.items()
                if student_id == student.id and subject_code == subject.subjectCode
            ]
            model.Add(sum(subject_vars) == 1)
        for teacher in request.teachers:
            alloc_terms = [
                subject.weeklyHours * alloc[(student.id, subject.subjectCode, teacher.id)]
                for subject in student.subjectHours
                if (student.id, subject.subjectCode, teacher.id) in alloc
            ]
            assign_terms = [
                variable
                for (student_id, teacher_id, _), variable in assign.items()
                if student_id == student.id and teacher_id == teacher.id
            ]
            if not alloc_terms and not assign_terms:
                continue
            model.Add(sum(alloc_terms) == sum(assign_terms))


def _minimize_lexicographic_preferences(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    assign: dict[AssignKey, cp_model.IntVar],
    groups: Sequence[_ClassGroup],
    *,
    strict: bool,
) -> None:
    p1, p2 = _capacity_violation_penalties(model, request, groups, strict=strict)
    p3 = _ideal_capacity_penalty(model, request, groups)
    p4 = 0
    p5 = _related_students_penalty(model, request, assign)
    p6 = _preferred_teacher_penalty(request, assign)
    class_slots = max(len(request.teachers) * len(request.slots), 1)
    student_count = max(len(request.students), 1)
    maxima = (
        max(student_count * class_slots, 1),
        max(MINIMUM_CAPACITY * class_slots, 1),
        max(ABOVE_IDEAL_PENALTY_PER_STUDENT * student_count * class_slots, 1),
        max(len(request.students) * max(len(request.teachers) - 1, 0), 1),
        max(
            len(request.relationships)
            * max((student.weeklyHoursTotal for student in request.students), default=0),
            1,
        ),
        max(sum(student.weeklyHoursTotal for student in request.students), 1),
    )
    weights = _lexicographic_weights(maxima)
    model.Minimize(
        p1 * weights[0]
        + p2 * weights[1]
        + p3 * weights[2]
        + p4 * weights[3]
        + p5 * weights[4]
        + p6 * weights[5]
    )


def _capacity_violation_penalties(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    groups: Sequence[_ClassGroup],
    *,
    strict: bool,
):
    if strict or not groups:
        return 0, 0
    zero = model.NewConstant(0)
    student_count = max(len(request.students), 1)
    excess_terms = []
    deficit_terms = []
    for group in groups:
        over = model.NewIntVar(
            -MAXIMUM_CAPACITY,
            student_count,
            f"over:{group.teacher_id}:{group.slot_id}",
        )
        excess = model.NewIntVar(0, student_count, f"excess:{group.teacher_id}:{group.slot_id}")
        model.Add(over == group.size - MAXIMUM_CAPACITY)
        model.AddMaxEquality(excess, [over, zero])
        excess_terms.append(excess)

        under = model.NewIntVar(
            -student_count,
            MINIMUM_CAPACITY,
            f"under:{group.teacher_id}:{group.slot_id}",
        )
        below_min = model.NewIntVar(
            0, MINIMUM_CAPACITY, f"belowMin:{group.teacher_id}:{group.slot_id}"
        )
        deficit = model.NewIntVar(
            0, MINIMUM_CAPACITY, f"deficit:{group.teacher_id}:{group.slot_id}"
        )
        model.Add(under == MINIMUM_CAPACITY - group.size)
        model.AddMaxEquality(below_min, [under, zero])
        model.Add(deficit == below_min).OnlyEnforceIf(group.occupied)
        model.Add(deficit == 0).OnlyEnforceIf(group.occupied.Not())
        deficit_terms.append(deficit)
    return sum(excess_terms), sum(deficit_terms)


def _ideal_capacity_penalty(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    groups: Sequence[_ClassGroup],
):
    if not groups:
        return 0
    zero = model.NewConstant(0)
    student_count = max(len(request.students), 1)
    max_penalty = (
        IDEAL_CAPACITY * BELOW_IDEAL_PENALTY_PER_STUDENT
        + student_count * ABOVE_IDEAL_PENALTY_PER_STUDENT
    )
    terms = []
    for group in groups:
        below_delta = model.NewIntVar(
            -student_count,
            IDEAL_CAPACITY,
            f"idealBelowDelta:{group.teacher_id}:{group.slot_id}",
        )
        above_delta = model.NewIntVar(
            -IDEAL_CAPACITY,
            student_count,
            f"idealAboveDelta:{group.teacher_id}:{group.slot_id}",
        )
        below = model.NewIntVar(0, IDEAL_CAPACITY, f"idealBelow:{group.teacher_id}:{group.slot_id}")
        above = model.NewIntVar(0, student_count, f"idealAbove:{group.teacher_id}:{group.slot_id}")
        penalty = model.NewIntVar(0, max_penalty, f"idealPen:{group.teacher_id}:{group.slot_id}")
        model.Add(below_delta == IDEAL_CAPACITY - group.size)
        model.Add(above_delta == group.size - IDEAL_CAPACITY)
        model.AddMaxEquality(below, [below_delta, zero])
        model.AddMaxEquality(above, [above_delta, zero])
        active_penalty = (
            below * BELOW_IDEAL_PENALTY_PER_STUDENT + above * ABOVE_IDEAL_PENALTY_PER_STUDENT
        )
        model.Add(penalty == active_penalty).OnlyEnforceIf(group.occupied)
        model.Add(penalty == 0).OnlyEnforceIf(group.occupied.Not())
        terms.append(penalty)
    return sum(terms)


def _constrain_teacher_continuity(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    assign: dict[AssignKey, cp_model.IntVar],
) -> None:
    for student in request.students:
        uses: list[cp_model.IntVar] = []
        for teacher in request.teachers:
            hours = [
                variable
                for (student_id, teacher_id, _), variable in assign.items()
                if student_id == student.id and teacher_id == teacher.id
            ]
            if not hours:
                continue
            used = model.NewBoolVar(f"uses:{student.id}:{teacher.id}")
            total = sum(hours)
            model.Add(total >= 1).OnlyEnforceIf(used)
            model.Add(total == 0).OnlyEnforceIf(used.Not())
            uses.append(used)
        if not uses:
            continue
        minimum = minimum_teachers_to_cover(
            [item.subjectCode for item in student.subjectHours],
            request.teachers,
        )
        model.Add(sum(uses) <= minimum)


def _related_students_penalty(
    model: cp_model.CpModel,
    request: SolveScheduleRequest,
    assign: dict[AssignKey, cp_model.IntVar],
):
    students = {student.id: student for student in request.students}
    zero = model.NewConstant(0)
    terms = []
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
        target = feasible_shared_sessions(left, right, request.teachers, request.slots)
        if target <= 0:
            continue
        together: list[cp_model.IntVar] = []
        for teacher in request.teachers:
            for slot in request.slots:
                left_key = (left_id, teacher.id, slot.id)
                right_key = (right_id, teacher.id, slot.id)
                if left_key not in assign or right_key not in assign:
                    continue
                both = model.NewBoolVar(f"together:{left_id}:{right_id}:{teacher.id}:{slot.id}")
                model.AddBoolAnd([assign[left_key], assign[right_key]]).OnlyEnforceIf(both)
                model.AddBoolOr([assign[left_key].Not(), assign[right_key].Not()]).OnlyEnforceIf(
                    both.Not()
                )
                together.append(both)
        shared = sum(together) if together else 0
        unshared = model.NewIntVar(0, target, f"unshared:{left_id}:{right_id}")
        diff = model.NewIntVar(-target, target, f"unsharedDelta:{left_id}:{right_id}")
        model.Add(diff == target - shared)
        model.AddMaxEquality(unshared, [diff, zero])
        terms.append(unshared)
    return sum(terms) if terms else 0


def _preferred_teacher_penalty(
    request: SolveScheduleRequest,
    assign: dict[AssignKey, cp_model.IntVar],
):
    students = {student.id: student for student in request.students}
    teachers = {teacher.id: teacher for teacher in request.teachers}
    terms = []
    for _rule_id, course_code, preferred_profile, fallback_profile in PREFERRED_SCIENCE_PROFILES:
        preferred_teachers = [
            teacher for teacher in request.teachers if teacher.profile == preferred_profile
        ]
        for (student_id, teacher_id, _), variable in assign.items():
            student = students[student_id]
            teacher = teachers[teacher_id]
            if teacher.profile != fallback_profile:
                continue
            if student.courseCode != course_code or not has_science_workload(student):
                continue
            if not any(teacher_compatible_with(item, student) for item in preferred_teachers):
                continue
            terms.append(variable)
    return sum(terms) if terms else 0


def _extract_solution(
    request: SolveScheduleRequest,
    solver: cp_model.CpSolver,
    assign: dict[AssignKey, cp_model.IntVar],
    alloc: dict[AllocKey, cp_model.IntVar],
) -> SolverSolution:
    classes: list[WeeklyClass] = []
    teacher_order = {teacher.id: index for index, teacher in enumerate(request.teachers)}
    slot_order = {slot.id: index for index, slot in enumerate(request.slots)}
    for teacher in request.teachers:
        for slot in request.slots:
            student_ids = unique_sorted(
                student_id
                for (student_id, teacher_id, slot_id), variable in assign.items()
                if teacher_id == teacher.id and slot_id == slot.id and solver.Value(variable) == 1
            )
            if not student_ids:
                continue
            classes.append(
                WeeklyClass(
                    id=class_id_for(teacher.id, slot.id),
                    teacherId=teacher.id,
                    slotId=slot.id,
                    studentIds=student_ids,
                )
            )
    classes.sort(key=lambda item: (slot_order[item.slotId], teacher_order[item.teacherId], item.id))
    allocations = _extract_allocations(request, solver, assign, alloc)
    score, findings = evaluate_solution(request, classes, allocations)
    return SolverSolution(
        classes=classes,
        subjectTeacherAllocations=allocations,
        score=score,
        findings=findings,
    )


def _extract_allocations(
    request: SolveScheduleRequest,
    solver: cp_model.CpSolver,
    assign: dict[AssignKey, cp_model.IntVar],
    alloc: dict[AllocKey, cp_model.IntVar],
) -> list[SubjectTeacherAllocation]:
    allocations: list[SubjectTeacherAllocation] = []
    for student in request.students:
        teacher_ids = unique_sorted(
            teacher_id
            for (student_id, teacher_id, _), variable in assign.items()
            if student_id == student.id and solver.Value(variable) == 1
        )
        if len(teacher_ids) <= 1:
            continue
        for teacher_id in teacher_ids:
            subject_hours = [
                SubjectHours(subjectCode=subject.subjectCode, weeklyHours=subject.weeklyHours)
                for subject in student.subjectHours
                if (key := (student.id, subject.subjectCode, teacher_id)) in alloc
                and solver.Value(alloc[key]) == 1
            ]
            if not subject_hours:
                continue
            allocations.append(
                SubjectTeacherAllocation(
                    studentId=student.id,
                    teacherId=teacher_id,
                    subjectHours=subject_hours,
                    totalHours=sum(item.weeklyHours for item in subject_hours),
                )
            )
    allocations.sort(key=lambda item: (item.studentId, item.teacherId))
    return allocations


def _lexicographic_weights(maxima: Sequence[int]) -> list[int]:
    weights = [1] * len(maxima)
    for index in range(len(maxima) - 2, -1, -1):
        weights[index] = maxima[index + 1] * weights[index + 1] + 1
    return weights


def _map_status(status_code: int) -> SolveOutcomeStatus:
    mapping: dict[int, SolveOutcomeStatus] = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.UNKNOWN: "UNKNOWN",
    }
    return mapping.get(status_code, "UNKNOWN")
