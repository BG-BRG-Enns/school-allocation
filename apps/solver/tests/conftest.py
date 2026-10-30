"""Shared instances: small enough to check by hand, each with a known optimum."""

from __future__ import annotations

from typing import Any

import pytest

LEVELS = ["students_with_deficit", "deficit_minutes", "over:3000", "over:2000", "total_cost", "tiebreak"]


def request(students: list[dict[str, Any]], items: list[dict[str, Any]], *, conflicts: list[list[int]] | None = None, fixed: list[list[int]] | None = None, seed: int = 7, levels: list[str] | None = None) -> dict[str, Any]:
    return {
        "contract": "allocation/v1",
        "runId": "test",
        "seed": seed,
        "limits": {"deterministicTimePerLevel": 5},
        "students": students,
        "items": items,
        "conflicts": conflicts or [],
        "fixed": fixed or [],
        "levels": levels or LEVELS,
    }


def option(o: int, cost: int, minutes: int = 100, tie: int = 0, d: int = 0, weight: int | None = None) -> dict[str, Any]:
    # The weight is rank · minutes; the instances here give the cost over a 100-minute requirement, so rank = cost / 1000.
    return {"o": o, "cost": cost, "weight": weight if weight is not None else cost * minutes // 1000, "tie": tie, "credit": [{"d": d, "min": minutes}]}


def student(s: int, options: list[dict[str, Any]], required: int = 100, days: int = 1) -> dict[str, Any]:
    return {"s": s, "required": [{"d": d, "min": required} for d in range(days)], "norm": required * days, "options": options}


def item(o: int, places: int, minimum: int = 0, cancellable: bool = True) -> dict[str, Any]:
    return {"o": o, "max": places, "min": minimum, "cancellable": cancellable}


@pytest.fixture
def two_students() -> dict[str, Any]:
    """Two students, two single-place items, both want item 0 first; the lot decides who gets it."""
    return request(
        [student(0, [option(0, 1000, tie=5), option(1, 2000, tie=9)]), student(1, [option(0, 1000, tie=10), option(1, 2000, tie=1)])],
        [item(0, 1), item(1, 1)],
        conflicts=[[0, 1]],
    )
