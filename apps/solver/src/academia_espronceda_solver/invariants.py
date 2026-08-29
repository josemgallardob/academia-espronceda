from academia_espronceda_solver.schemas import FieldViolation, SolveScheduleRequest, WeeklySlot


def collect_request_invariants(request: SolveScheduleRequest) -> list[FieldViolation]:
    violations: list[FieldViolation] = []
    slot_ids = [slot.id for slot in request.slots]
    teacher_ids = [teacher.id for teacher in request.teachers]
    student_ids = [student.id for student in request.students]
    known_slots = set(slot_ids)
    known_students = set(student_ids)

    _reject_duplicates(violations, slot_ids, "slots", "id")
    _reject_duplicates(violations, teacher_ids, "teachers", "id")
    _reject_duplicates(violations, student_ids, "students", "id")

    for index, slot in enumerate(request.slots):
        if _duration_minutes(slot) != 60:
            violations.append(
                FieldViolation(
                    field=f"slots.{index}.endTime",
                    code="INVALID_SLOT_DURATION",
                    message=f"Slot {slot.id} must last exactly 60 minutes",
                )
            )

    for teacher_index, teacher in enumerate(request.teachers):
        for slot_index, slot_id in enumerate(teacher.availableSlotIds):
            if slot_id not in known_slots:
                violations.append(
                    FieldViolation(
                        field=f"teachers.{teacher_index}.availableSlotIds.{slot_index}",
                        code="UNKNOWN_SLOT",
                        message=f"Teacher {teacher.id} references unknown slot {slot_id}",
                    )
                )

    for student_index, student in enumerate(request.students):
        subject_codes = [entry.subjectCode for entry in student.subjectHours]
        _reject_duplicates(
            violations,
            subject_codes,
            f"students.{student_index}.subjectHours",
            "subjectCode",
        )
        hours_sum = sum(entry.weeklyHours for entry in student.subjectHours)
        if hours_sum != student.weeklyHoursTotal:
            violations.append(
                FieldViolation(
                    field=f"students.{student_index}.weeklyHoursTotal",
                    code="HOURS_MISMATCH",
                    message=(
                        f"Student {student.id} subject hours sum to {hours_sum}, "
                        f"expected {student.weeklyHoursTotal}"
                    ),
                )
            )
        for slot_index, slot_id in enumerate(student.unavailableSlotIds):
            if slot_id not in known_slots:
                violations.append(
                    FieldViolation(
                        field=f"students.{student_index}.unavailableSlotIds.{slot_index}",
                        code="UNKNOWN_SLOT",
                        message=f"Student {student.id} references unknown slot {slot_id}",
                    )
                )

    relationship_keys: set[str] = set()
    for relationship_index, relationship in enumerate(request.relationships):
        first_id, second_id = relationship.studentIds
        for student_offset, student_id in enumerate(relationship.studentIds):
            if student_id not in known_students:
                violations.append(
                    FieldViolation(
                        field=f"relationships.{relationship_index}.studentIds.{student_offset}",
                        code="UNKNOWN_STUDENT",
                        message=f"Relationship references unknown student {student_id}",
                    )
                )
        key = "|".join(sorted((first_id, second_id)))
        if key in relationship_keys:
            violations.append(
                FieldViolation(
                    field=f"relationships.{relationship_index}.studentIds",
                    code="DUPLICATE_RELATIONSHIP",
                    message=f"Duplicate undirected relationship {key}",
                )
            )
        relationship_keys.add(key)

    return violations


def _reject_duplicates(
    violations: list[FieldViolation],
    values: list[str],
    field_prefix: str,
    label: str,
) -> None:
    seen: set[str] = set()
    for index, value in enumerate(values):
        if value in seen:
            violations.append(
                FieldViolation(
                    field=f"{field_prefix}.{index}.{label}",
                    code="DUPLICATE_ID",
                    message=f"Duplicate {label}: {value}",
                )
            )
        seen.add(value)


def _duration_minutes(slot: WeeklySlot) -> int:
    start_hours, start_minutes = (int(part) for part in slot.startTime.split(":"))
    end_hours, end_minutes = (int(part) for part in slot.endTime.split(":"))
    return (end_hours * 60 + end_minutes) - (start_hours * 60 + start_minutes)
