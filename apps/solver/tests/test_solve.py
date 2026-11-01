"""The model against instances with known optima."""

from __future__ import annotations

from app.contract import Level, SolveRequest, check_model
from app.solve import roll_up, solve

from .conftest import item, option, request, rule, student


def run(payload: dict) -> dict:
    outcome = solve(SolveRequest.model_validate(payload))
    return {"status": outcome.status, "levels": [(lv.name, lv.value, lv.proven) for lv in outcome.levels], "assign": outcome.assign, "cancelled": outcome.cancelled, "detail": outcome.detail}


def values(result: dict) -> dict[str, int]:
    return {name: value for name, value, _ in result["levels"]}


def test_two_students_share_two_places_and_the_lot_breaks_the_tie(two_students: dict) -> None:
    result = run(two_students)
    assert result["status"] == "OPTIMAL"
    assert all(proven for _, _, proven in result["levels"])
    assert values(result) == {"students_with_deficit": 0, "deficit_minutes": 0, "over:3000": 0, "over:2000": 0, "total_cost": 3000, "tiebreak": 5 + 1}
    # Student 0 draws the lower lot on item 0 (5 against 10) and student 1 on item 1 (1 against 9).
    assert result["assign"] == [(0, 0), (1, 1)]
    assert result["cancelled"] == []


def test_fewer_students_over_a_threshold_beats_a_lower_total_cost() -> None:
    # Giving student 1 item 0 costs 200 instead of 1900, but then student 0 is over 2000. L3 before L4.
    payload = request(
        [student(0, [option(0, 1000), option(1, 2100)]), student(1, [option(0, 200), option(1, 1900)])],
        [item(0, 1), item(1, 1)],
    )
    result = run(payload)
    assert result["assign"] == [(0, 0), (1, 1)]
    assert values(result)["over:2000"] == 0
    assert values(result)["total_cost"] == 2900
    # With the threshold levels left out, the cheaper total wins.
    cheaper = run({**payload, "levels": ["students_with_deficit", "deficit_minutes", "total_cost", "tiebreak"]})
    assert cheaper["assign"] == [(0, 1), (1, 0)]
    assert values(cheaper)["total_cost"] == 2300


def test_an_item_below_its_minimum_is_cancelled_and_its_students_fall_back() -> None:
    payload = request(
        [student(s, [option(0, 1000), option(1, 4000)]) for s in range(2)],
        [item(0, 5, minimum=3, cancellable=True), item(1, 5)],
    )
    result = run(payload)
    assert result["status"] == "OPTIMAL"
    assert result["cancelled"] == [0]
    assert result["assign"] == [(0, 1), (1, 1)]
    assert values(result) == {"students_with_deficit": 0, "deficit_minutes": 0, "over:3000": 2, "over:2000": 2, "total_cost": 8000, "tiebreak": 0}


def test_a_minimum_nobody_can_reach_is_infeasible_and_stops_at_the_first_level() -> None:
    payload = request([student(s, [option(0, 1000)]) for s in range(2)], [item(0, 5, minimum=3, cancellable=False)])
    result = run(payload)
    assert result["status"] == "INFEASIBLE"
    assert result["levels"] == []
    assert result["assign"] == []
    assert "students_with_deficit" in (result["detail"] or "")


def test_coverage_is_soft_and_a_deficit_is_counted_not_hidden() -> None:
    # One place for two students who need it: one of them misses the day.
    payload = request([student(s, [option(0, 1000)]) for s in range(2)], [item(0, 1)])
    result = run(payload)
    assert result["status"] == "OPTIMAL"
    assert values(result)["students_with_deficit"] == 1
    assert values(result)["deficit_minutes"] == 100
    assert len(result["assign"]) == 1


def test_conflicting_items_exclude_each_other_and_a_student_needs_two_to_cover_the_day() -> None:
    # Day of 200 minutes; items 0 and 1 overlap, item 2 does not. Only 0 + 2 or 1 + 2 cover it.
    payload = request(
        [student(0, [option(0, 500), option(1, 1000), option(2, 1500)], required=200)],
        [item(0, 1), item(1, 1), item(2, 1)],
        conflicts=[[0, 1]],
    )
    result = run(payload)
    assert result["assign"] == [(0, 0), (0, 2)]
    assert values(result)["deficit_minutes"] == 0


def test_fixed_pairs_hold_and_consume_capacity() -> None:
    payload = request(
        [student(0, [option(0, 1000), option(1, 2000)]), student(1, [option(0, 1000), option(1, 2000)])],
        [item(0, 1), item(1, 1)],
        fixed=[[1, 0]],
    )
    result = run(payload)
    assert result["assign"] == [(0, 1), (1, 0)]


def test_the_status_rolls_up_from_the_levels() -> None:
    proven = [Level(name="a", value=0, proven=True)]
    assert roll_up(proven, None) == "OPTIMAL"
    assert roll_up([*proven, Level(name="b", value=1, proven=False)], None) == "FEASIBLE"
    assert roll_up(proven, "UNKNOWN") == "UNKNOWN"


def test_model_checks_name_what_the_shape_cannot() -> None:
    sound = SolveRequest.model_validate(request([student(0, [option(0, 1000)])], [item(0, 1)]))
    assert check_model(sound) is None
    assert "not listed" in (check_model(SolveRequest.model_validate(request([student(0, [option(1, 1000)])], [item(0, 1)]))) or "")
    assert "not an option" in (check_model(SolveRequest.model_validate(request([student(0, [option(0, 1000)])], [item(0, 1)], fixed=[[0, 1]]))) or "")
    assert "unknown level" in (check_model(SolveRequest.model_validate(request([student(0, [option(0, 1000)])], [item(0, 1)], levels=["nope"]))) or "")
    assert "twice" in (check_model(SolveRequest.model_validate(request([student(0, [option(0, 1000), option(0, 1000)])], [item(0, 1)]))) or "")
    assert "conflict" in (check_model(SolveRequest.model_validate(request([student(0, [option(0, 1000)])], [item(0, 1)], conflicts=[[0, 0]]))) or "")
    assert "not an option of the student" in (check_model(SolveRequest.model_validate(request([student(0, [option(0, 1000)], rules=[rule(0, 1, [(1, 1)])])], [item(0, 1), item(1, 1)]))) or "")
    assert "rule twice" in (check_model(SolveRequest.model_validate(request([student(0, [option(0, 1000)], rules=[rule(0, 1, [(0, 1)]), rule(0, 1, [(0, 1)])])], [item(0, 1)]))) or "")


def test_a_level_the_limit_ends_without_a_solution_keeps_the_solution_before_it(two_students: dict) -> None:
    from ortools.sat.python import cp_model

    calls = {"n": 0}

    class Flaky(cp_model.CpSolver):
        def solve(self, model, callback=None):  # type: ignore[override]
            calls["n"] += 1
            if calls["n"] == 4:
                return cp_model.UNKNOWN
            return super().solve(model, callback)

    outcome = solve(SolveRequest.model_validate(two_students), new_solver=Flaky)
    assert outcome.status == "FEASIBLE"
    assert [lv.proven for lv in outcome.levels] == [True, True, True, False, True, True]
    assert outcome.assign == [(0, 0), (1, 1)]
    assert values({"levels": [(lv.name, lv.value, lv.proven) for lv in outcome.levels]})["total_cost"] == 3000

    class Hopeless(cp_model.CpSolver):
        def solve(self, model, callback=None):  # type: ignore[override]
            return cp_model.UNKNOWN

    outcome = solve(SolveRequest.model_validate(two_students), new_solver=Hopeless)
    assert outcome.status == "UNKNOWN"
    assert outcome.levels == [] and outcome.assign == []


def test_cliques_cover_every_conflict_edge() -> None:
    from app.solve import clique_cover

    # 0-1-2 a triangle, 2-3 an edge, 4 alone.
    cliques = clique_cover([0, 1, 2, 3, 4], {(0, 1), (1, 2), (0, 2), (2, 3)})
    assert cliques == [[0, 1, 2], [2, 3]]
    assert clique_cover([0, 1], set()) == []


def test_the_greedy_start_covers_what_it_can_and_respects_places_fixed_pairs_and_conflicts() -> None:
    from app.solve import greedy_assign

    payload = request(
        [student(0, [option(0, 500), option(1, 1000), option(2, 1500)], required=200), student(1, [option(0, 500), option(2, 1500)], required=200)],
        [item(0, 1), item(1, 1), item(2, 2)],
        conflicts=[[0, 1]],
        fixed=[[1, 0]],
    )
    # Student 1 holds item 0 by the fixed pair; student 0 then takes 1 (0 is full) and 2; student 1 adds 2.
    assert greedy_assign(SolveRequest.model_validate(payload)) == {(1, 0), (0, 1), (0, 2), (1, 2)}


def test_a_threshold_is_compared_exactly_not_on_rounded_costs() -> None:
    # Three second wishes of 300 minutes over a 900-minute week: cost 667 each, 2001 in all, but the average rank is exactly 2, not over it.
    payload = request(
        [{"s": 0, "required": [{"d": d, "min": 300} for d in range(3)], "norm": 900, "options": [{"o": d, "cost": 667, "weight": 600, "tie": 0, "credit": [{"d": d, "min": 300}]} for d in range(3)], "rules": []}],
        [item(o, 5) for o in range(3)],
    )
    result = run(payload)
    assert values(result)["over:2000"] == 0
    assert values(result)["total_cost"] == 2001


def test_an_item_without_a_minimum_runs_with_its_takers_or_none() -> None:
    # Nobody has item 1 as an option; cancellable, but with no minimum to fall below it stays available.
    payload = request([student(0, [option(0, 1000)])], [item(0, 5), item(1, 5, minimum=0, cancellable=True)])
    result = run(payload)
    assert result["status"] == "OPTIMAL"
    assert result["cancelled"] == []


RULE_LEVELS = ["students_with_deficit", "deficit_minutes", "students_missing_rule", "rule_missing_items", "rule_missing_minutes", "over:3000", "over:2000", "total_cost", "tiebreak"]


def test_a_rule_displaces_a_wish_but_never_a_day() -> None:
    # One day of 100 minutes. Item 0 is the first wish, item 1 a fallback of the rule's category at a higher cost, and
    # they overlap: the rule comes before the wish, so the student takes item 1.
    payload = request(
        [student(0, [option(0, 1000), option(1, 3000)], rules=[rule(0, 1, [(1, 1)])])],
        [item(0, 5), item(1, 5)],
        conflicts=[[0, 1]],
        levels=RULE_LEVELS,
    )
    result = run(payload)
    assert result["status"] == "OPTIMAL"
    assert result["assign"] == [(0, 1)]
    assert values(result)["students_missing_rule"] == 0
    # Item 1 credits nothing on the day: meeting the rule would leave the day short, and the day comes first.
    short = request(
        [student(0, [option(0, 1000), {**option(1, 3000), "credit": []}], rules=[rule(0, 1, [(1, 1)])])],
        [item(0, 5), item(1, 5)],
        conflicts=[[0, 1]],
        levels=RULE_LEVELS,
    )
    result = run(short)
    assert result["assign"] == [(0, 0)]
    assert values(result)["students_with_deficit"] == 0
    assert values(result)["students_missing_rule"] == 1
    assert values(result)["rule_missing_items"] == 1


def test_fewer_students_missing_a_rule_before_fewer_missing_minutes() -> None:
    # A minutes rule of 200 for both students; item 0 brings 200 with one place, item 1 brings 100 with two. Giving
    # item 0 to one student and item 1 to the other misses 100 minutes and one student; both on item 1 misses 200
    # minutes and two students. Item 2 covers the day for whoever needs it.
    def pupil(s: int) -> dict:
        return student(s, [option(0, 1000, minutes=0), option(1, 1000, minutes=0), option(2, 1000)], rules=[rule(0, 200, [(0, 200), (1, 100)], unit="minutes")])

    result = run(request([pupil(0), pupil(1)], [item(0, 1), item(1, 2), item(2, 2)], levels=RULE_LEVELS))
    assert result["status"] == "OPTIMAL"
    assert values(result)["students_missing_rule"] == 1
    assert values(result)["rule_missing_minutes"] == 100
    assert values(result)["rule_missing_items"] == 0


def test_a_student_here_for_a_rule_alone_has_no_average_rank() -> None:
    # Nothing to cover on the days (norm 0); the rule asks for one of item 0.
    lone = {"s": 0, "required": [], "norm": 0, "options": [{**option(0, 0, minutes=0), "weight": 0}], "rules": [rule(0, 1, [(0, 1)])]}
    result = run(request([lone], [item(0, 5)], levels=RULE_LEVELS))
    assert result["assign"] == [(0, 0)]
    assert values(result)["over:3000"] == 0
    assert values(result)["students_missing_rule"] == 0


def test_the_greedy_start_meets_a_rule_after_the_days() -> None:
    from app.solve import greedy_assign

    payload = SolveRequest.model_validate(request(
        [student(0, [option(0, 1000), option(1, 3000, minutes=0), option(2, 3000, minutes=0)], rules=[rule(0, 1, [(1, 1), (2, 1)])])],
        [item(0, 5), item(1, 0), item(2, 5)],
        levels=RULE_LEVELS,
    ))
    assert greedy_assign(payload) == {(0, 0), (0, 2)}, "item 1 has no place left"
