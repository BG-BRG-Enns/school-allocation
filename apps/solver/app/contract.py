"""The solver contract (docs/domain-and-api.md §6), as the request arrives.

Small integers only: students, items and project days are indices the API
assigned; nothing here is a name, an address or a class. FastAPI checks the
shape with these models; what the shape cannot say (an option naming an item
the request does not list, a fixed pair that is not an option) is checked in
check_model and answered as MODEL_INVALID, so the API stores the reason.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT = "allocation/v1"

LEVEL_NAMES = ("students_with_deficit", "deficit_minutes", "total_cost", "tiebreak")

Status = Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN", "MODEL_INVALID"]


class Strict(BaseModel):
    """A field the contract does not name is a mistake, not an extension."""

    model_config = ConfigDict(extra="forbid")


class DayMinutes(Strict):
    d: int = Field(ge=0)
    min: int = Field(ge=0)


class Option(Strict):
    o: int = Field(ge=0)
    cost: int = Field(ge=0)
    tie: int = Field(ge=0)
    credit: list[DayMinutes]


class Student(Strict):
    s: int = Field(ge=0)
    required: list[DayMinutes]
    options: list[Option]


class Item(Strict):
    o: int = Field(ge=0)
    max: int = Field(ge=0)
    min: int = Field(ge=0)
    cancellable: bool


class Limits(Strict):
    """CP-SAT's deterministic time per level; never a wall-clock limit (reproducibility)."""

    deterministicTimePerLevel: float = Field(gt=0, le=600)


class SolveRequest(Strict):
    contract: Literal["allocation/v1"]
    runId: str = Field(min_length=1, max_length=100)
    seed: int = Field(ge=0, le=2**53)
    limits: Limits
    students: list[Student]
    items: list[Item]
    conflicts: list[tuple[int, int]]
    fixed: list[tuple[int, int]]
    levels: list[str] = Field(min_length=1)


class Level(Strict):
    name: str
    value: int
    proven: bool


class Versions(Strict):
    solver: str
    ortools: str


class SolveResponse(Strict):
    status: Status
    levels: list[Level]
    assign: list[tuple[int, int]]
    cancelled: list[int]
    versions: Versions
    detail: str | None = None


def level_threshold(name: str) -> int | None:
    """The cost threshold of an `over:<t>` level, or None for the other names."""
    if not name.startswith("over:"):
        return None
    rest = name[len("over:"):]
    return int(rest) if rest.isdigit() else None


def check_model(request: SolveRequest) -> str | None:
    """What makes a well-shaped request unsolvable as a model; None when it is sound."""
    items = {item.o for item in request.items}
    if len(items) != len(request.items):
        return "an item index is listed twice"
    students = {student.s for student in request.students}
    if len(students) != len(request.students):
        return "a student index is listed twice"
    options: set[tuple[int, int]] = set()
    for student in request.students:
        if len({r.d for r in student.required}) != len(student.required):
            return f"student {student.s} names a day twice"
        for option in student.options:
            if option.o not in items:
                return f"student {student.s} has an option on item {option.o}, which is not listed"
            if (student.s, option.o) in options:
                return f"student {student.s} has item {option.o} as an option twice"
            options.add((student.s, option.o))
            if len({c.d for c in option.credit}) != len(option.credit):
                return f"student {student.s}, item {option.o}: a day is credited twice"
    for a, b in request.conflicts:
        if a not in items or b not in items or a == b:
            return f"conflict {a}/{b} does not name two listed items"
    for s, o in request.fixed:
        if (s, o) not in options:
            return f"fixed pair {s}/{o} is not an option"
    for name in request.levels:
        if name not in LEVEL_NAMES and level_threshold(name) is None:
            return f"unknown level {name}"
    if len(set(request.levels)) != len(request.levels):
        return "a level is listed twice"
    return None
