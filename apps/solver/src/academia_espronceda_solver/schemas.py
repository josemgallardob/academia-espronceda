from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

EntityId = Annotated[str, Field(min_length=1, max_length=128)]
SemanticVersion = Annotated[str, Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+$")]
LocalTime = Annotated[str, Field(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")]
RuleId = Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]*$")]
Fingerprint = Annotated[str, Field(pattern=r"^sha256:[0-9a-f]{64}$")]
ErrorCode = Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]*$")]

CourseCode = Literal["ESO_1", "ESO_2", "ESO_3", "ESO_4", "BACH_1", "BACH_2", "OTHER"]
SubjectCode = Literal[
    "MATHEMATICS",
    "SOCIAL_SCIENCES_MATHEMATICS",
    "PHYSICS",
    "CHEMISTRY",
    "BIOLOGY",
    "SPANISH_LANGUAGE",
    "ENGLISH",
]
TeacherProfile = Literal["SENIOR_SCIENCES", "GENERAL_SCIENCES", "LANGUAGES"]
DayOfWeek = Literal["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
SolverMode = Literal["STRICT", "RELAXED"]
SolveOutcomeStatus = Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN"]
RuleEnforcement = Literal["HARD", "RELAXABLE", "PREFERENCE"]
FindingSeverity = Literal["ERROR", "WARNING", "INFO"]
EntityType = Literal[
    "SCHEDULE",
    "CLASS",
    "ASSIGNMENT",
    "STUDENT",
    "TEACHER",
    "SUBJECT",
    "COURSE",
    "SLOT",
    "RELATIONSHIP",
]
FindingParameterValue = str | int | float | bool | list[str]


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WeeklySlot(ContractModel):
    id: EntityId
    dayOfWeek: DayOfWeek
    startTime: LocalTime
    endTime: LocalTime


class SubjectHours(ContractModel):
    subjectCode: SubjectCode
    weeklyHours: int = Field(ge=1)


class StudentRelationship(ContractModel):
    studentIds: list[EntityId] = Field(min_length=2, max_length=2)

    @field_validator("studentIds")
    @classmethod
    def unique_student_ids(cls, value: list[str]) -> list[str]:
        return _require_unique(value)


class SolverTeacher(ContractModel):
    id: EntityId
    profile: TeacherProfile
    supportedCourseCodes: list[CourseCode] = Field(min_length=1)
    supportedSubjectCodes: list[SubjectCode] = Field(min_length=1)
    availableSlotIds: list[EntityId] = Field(min_length=1)

    @field_validator("supportedCourseCodes", "supportedSubjectCodes", "availableSlotIds")
    @classmethod
    def unique_codes(cls, value: list[str]) -> list[str]:
        return _require_unique(value)


class SolverStudent(ContractModel):
    id: EntityId
    status: Literal["ACTIVE"]
    courseCode: CourseCode
    subjectHours: list[SubjectHours] = Field(min_length=1)
    weeklyHoursTotal: int = Field(ge=1)
    unavailableSlotIds: list[EntityId]

    @field_validator("unavailableSlotIds")
    @classmethod
    def unique_unavailable_slots(cls, value: list[str]) -> list[str]:
        return _require_unique(value)


class SolveOptions(ContractModel):
    timeLimitSeconds: float = Field(gt=0, allow_inf_nan=False)
    randomSeed: int = Field(ge=0)


class SolveScheduleRequest(ContractModel):
    contractVersion: SemanticVersion
    ruleCatalogVersion: SemanticVersion
    requestId: EntityId
    timezone: Literal["Europe/Madrid"]
    slots: list[WeeklySlot] = Field(min_length=1)
    teachers: list[SolverTeacher] = Field(min_length=1)
    students: list[SolverStudent]
    relationships: list[StudentRelationship]
    options: SolveOptions


class SolveAttempt(ContractModel):
    mode: SolverMode
    status: SolveOutcomeStatus
    elapsedMilliseconds: int = Field(ge=0)


class EntityReference(ContractModel):
    type: EntityType
    id: EntityId


class SolverFinding(ContractModel):
    fingerprint: Fingerprint
    ruleId: RuleId
    enforcement: RuleEnforcement
    severity: FindingSeverity
    blocksConfirmation: bool
    entityRefs: list[EntityReference]
    slotIds: list[EntityId]
    parameters: dict[str, FindingParameterValue]

    @field_validator("slotIds")
    @classmethod
    def unique_slot_ids(cls, value: list[str]) -> list[str]:
        return _require_unique(value)


class ScoreTier(ContractModel):
    priority: int = Field(ge=1)
    penalty: float = Field(ge=0)


class RuleScore(ContractModel):
    ruleId: RuleId
    priority: int = Field(ge=1)
    occurrenceCount: int = Field(ge=0)
    penalty: float = Field(ge=0)


class ScheduleScore(ContractModel):
    direction: Literal["MINIMIZE"]
    bestScore: Literal[0]
    tiers: list[ScoreTier]
    ruleBreakdown: list[RuleScore]


class WeeklyClass(ContractModel):
    id: EntityId
    teacherId: EntityId
    slotId: EntityId
    studentIds: list[EntityId]

    @field_validator("studentIds")
    @classmethod
    def unique_student_ids(cls, value: list[str]) -> list[str]:
        return _require_unique(value)


class SubjectTeacherAllocation(ContractModel):
    studentId: EntityId
    teacherId: EntityId
    subjectHours: list[SubjectHours] = Field(min_length=1)
    totalHours: int = Field(ge=1)


class SolverSolution(ContractModel):
    classes: list[WeeklyClass]
    subjectTeacherAllocations: list[SubjectTeacherAllocation]
    score: ScheduleScore
    findings: list[SolverFinding]


class SolveScheduleResponse(ContractModel):
    contractVersion: SemanticVersion
    ruleCatalogVersion: SemanticVersion
    requestId: EntityId
    mode: SolverMode
    status: SolveOutcomeStatus
    attempts: list[SolveAttempt] = Field(min_length=1)
    solution: SolverSolution | None
    elapsedMilliseconds: int = Field(ge=0)
    randomSeed: int = Field(ge=0)
    timeLimitSeconds: float = Field(gt=0, allow_inf_nan=False)


class HealthResponse(ContractModel):
    status: Literal["ok"]
    service: Literal["solver"]
    version: SemanticVersion


class FieldViolation(ContractModel):
    field: Annotated[str, Field(min_length=1)]
    code: ErrorCode
    message: Annotated[str, Field(min_length=1)]


class ProblemDetails(ContractModel):
    type: str
    title: Annotated[str, Field(min_length=1)]
    status: int = Field(ge=400, le=599)
    detail: str | None = None
    instance: str | None = None
    code: ErrorCode
    traceId: Annotated[str, Field(min_length=1)]
    fieldErrors: list[FieldViolation] | None = None


class SolverErrorProblem(ProblemDetails):
    status: Literal[500] = 500
    solverStatus: Literal["ERROR"] = "ERROR"


def _require_unique(value: list[str]) -> list[str]:
    if len(value) != len(set(value)):
        raise ValueError("items must be unique")
    return value
