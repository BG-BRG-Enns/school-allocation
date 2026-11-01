"""The allocation model in CP-SAT (docs/domain-and-api.md §5), solved
level by level.

Variables: x[s, o] whether student s takes item o (only for the options
the request lists), y[o] whether item o runs (free only for a cancellable
item), u[s, d] the minutes student s misses on day d, z[s] whether the
student misses anything, v[s, r] what student s misses of rule r (items or
minutes), w[s] whether they miss any rule, and per threshold b[s] whether
the student's cost is over it. Capacity and minimum go through y; coverage
and the rules are soft through u and v and never hidden; conflicting items
exclude each other per student, as cliques (at most one of a set) rather
than pairs; the fixed pairs of a second pass are forced.

Each level is minimized in turn and then held at the value found while the
next is solved, the solution found starting the next search; a greedy
assignment (the cheapest options with a place, day by day) starts the first,
which on a school-sized instance is the difference between a proven zero
deficit in seconds and a poor incumbent after minutes. A level the
limit ends without any solution keeps the solution before it (the run does
not fail on its lot). The values reported are the final solution's, read
off the assignment the way the validator recomputes them, so a level a
later search improved reports what the result has, not what its own search
stopped at. The search is as deterministic as one worker, the request's
seed, a deterministic time limit and loops over sorted keys make it;
nothing relies on that: the API stores a run's result and reads every
explanation from it, never from a repeat.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from ortools.sat.python import cp_model

from .contract import COST_SCALE, Level, SolveRequest, SolveResponse, Status, Versions, level_threshold

# CP-SAT's seed is a signed 32-bit integer; the API's may be larger.
SEED_MASK = 0x7FFFFFFF
# CP-SAT's workers: one in this release; more search in parallel and answer the same request differently from one run to the next.
NUM_WORKERS = 1


@dataclass
class Outcome:
    status: Status
    levels: list[Level]
    assign: list[tuple[int, int]]
    cancelled: list[int]
    detail: str | None = None


def roll_up(levels: list[Level], stopped: Status | None) -> Status:
    """One status for the run: what stopped it, else FEASIBLE while any level is unproven, else OPTIMAL."""
    if stopped is not None:
        return stopped
    return "OPTIMAL" if all(level.proven for level in levels) else "FEASIBLE"


def clique_cover(nodes: list[int], edges: set[tuple[int, int]]) -> list[list[int]]:
    """Cliques that together cover every edge, greedily: each edge is in at least one, in sorted order."""
    adjacent: dict[int, set[int]] = {n: set() for n in nodes}
    for a, b in edges:
        adjacent[a].add(b)
        adjacent[b].add(a)
    covered: set[tuple[int, int]] = set()
    cliques: list[list[int]] = []
    for a in nodes:
        for b in sorted(adjacent[a]):
            if a >= b or (a, b) in covered:
                continue
            clique = [a, b]
            for c in sorted(adjacent[a] & adjacent[b]):
                if c > b and all(c in adjacent[m] for m in clique):
                    clique.append(c)
            for i, m in enumerate(clique):
                for n in clique[i + 1:]:
                    covered.add((min(m, n), max(m, n)))
            cliques.append(clique)
    return cliques


class Model:
    """The CP-SAT model of one request, with the expressions the levels minimize and the arithmetic to read a solution."""

    def __init__(self, request: SolveRequest) -> None:
        self.request = request
        self.model = cp_model.CpModel()
        m = self.model
        self.items = {item.o: item for item in request.items}
        self.students = {student.s: student for student in request.students}
        self.x: dict[tuple[int, int], cp_model.IntVar] = {}
        self.y: dict[int, cp_model.IntVar] = {}
        self.u: dict[tuple[int, int], cp_model.IntVar] = {}
        self.z: dict[int, cp_model.IntVar] = {}
        self.v: dict[tuple[int, int], cp_model.IntVar] = {}
        self.w: dict[int, cp_model.IntVar] = {}
        self.cost: dict[int, cp_model.LinearExpr] = {}
        self.weight: dict[int, cp_model.LinearExpr] = {}
        self.weight_bound: dict[int, int] = {}
        self.over: dict[int, list[cp_model.IntVar]] = {}
        conflicts = {(min(a, b), max(a, b)) for a, b in request.conflicts}
        for o in sorted(self.items):
            self.y[o] = m.new_bool_var(f"y{o}")
            # An item without a minimum has nothing to fall below: it runs, takers or none.
            if not self.items[o].cancellable or self.items[o].min == 0:
                m.add(self.y[o] == 1)
        takers: dict[int, list[cp_model.IntVar]] = {o: [] for o in self.items}
        for s in sorted(self.students):
            student = self.students[s]
            options = sorted(student.options, key=lambda op: op.o)
            for option in options:
                var = m.new_bool_var(f"x{s}_{option.o}")
                self.x[(s, option.o)] = var
                takers[option.o].append(var)
            credit = {(op.o, c.d): c.min for op in options for c in op.credit}
            if student.required:
                z = m.new_bool_var(f"z{s}")
                self.z[s] = z
                for day in sorted(student.required, key=lambda r: r.d):
                    u = m.new_int_var(0, day.min, f"u{s}_{day.d}")
                    self.u[(s, day.d)] = u
                    covered = sum(credit.get((op.o, day.d), 0) * self.x[(s, op.o)] for op in options)
                    m.add(covered + u >= day.min)
                    m.add(u <= day.min * z)
            if student.rules:
                w = m.new_bool_var(f"w{s}")
                self.w[s] = w
                for rule in sorted(student.rules, key=lambda r: r.r):
                    v = m.new_int_var(0, rule.need, f"v{s}_{rule.r}")
                    self.v[(s, rule.r)] = v
                    m.add(sum(a.n * self.x[(s, a.o)] for a in rule.amounts) + v >= rule.need)
                    m.add(v <= rule.need * w)
            self.cost[s] = sum(op.cost * self.x[(s, op.o)] for op in options)
            self.weight[s] = sum(op.weight * self.x[(s, op.o)] for op in options)
            self.weight_bound[s] = sum(op.weight for op in options)
            mine = [op.o for op in options]
            mine_set = set(mine)
            edges = {(a, b) for a, b in conflicts if a in mine_set and b in mine_set}
            for clique in clique_cover(mine, edges):
                m.add_at_most_one(self.x[(s, o)] for o in clique)
        for o, item in sorted(self.items.items()):
            total = sum(takers[o])
            m.add(total <= item.max * self.y[o])
            if item.min > 0:
                m.add(total >= item.min * self.y[o])
        for s, o in request.fixed:
            m.add(self.x[(s, o)] == 1)
        # Only a student with days to cover has an average rank to be over; one who is here for a rule alone has none.
        self.ranked = [s for s in sorted(self.students) if self.students[s].norm > 0]

    def rule_missing(self, unit: str) -> list[tuple[int, int]]:
        """The (student, rule) keys of v for rules counting `unit`, in order."""
        return [(s, rule.r) for s in sorted(self.students) for rule in sorted(self.students[s].rules, key=lambda r: r.r) if rule.unit == unit]

    def objective(self, name: str) -> cp_model.LinearExpr:
        m = self.model
        if name == "students_with_deficit":
            return sum(self.z[s] for s in sorted(self.z))
        if name == "deficit_minutes":
            return sum(self.u[key] for key in sorted(self.u))
        if name == "students_missing_rule":
            return sum(self.w[s] for s in sorted(self.w))
        if name == "rule_missing_items":
            return sum(self.v[key] for key in self.rule_missing("items"))
        if name == "rule_missing_minutes":
            return sum(self.v[key] for key in self.rule_missing("minutes"))
        if name == "total_cost":
            return sum(self.cost[s] for s in sorted(self.cost))
        if name == "tiebreak":
            return sum(op.tie * self.x[(s, op.o)] for s in sorted(self.students) for op in sorted(self.students[s].options, key=lambda op: op.o))
        threshold = level_threshold(name)
        if threshold is None:
            raise ValueError(f"unknown level {name}")
        if threshold not in self.over:
            flags: list[cp_model.IntVar] = []
            for s in self.ranked:
                b = m.new_bool_var(f"b{threshold}_{s}")
                # Over the threshold only if b is set: Σ rank · minutes · COST_SCALE > threshold · norm, in whole numbers.
                # The bound is the most the student's options can weigh.
                norm = self.students[s].norm
                m.add(COST_SCALE * self.weight[s] <= threshold * norm + COST_SCALE * self.weight_bound[s] * b)
                flags.append(b)
            self.over[threshold] = flags
        return sum(self.over[threshold])

    def evaluate(self, name: str, assign: set[tuple[int, int]]) -> int:
        """A level's value on an assignment, read off x alone, as the validator recomputes it."""
        if name == "students_with_deficit":
            return sum(1 for s in self.students if any(self.deficits(s, assign)))
        if name == "deficit_minutes":
            return sum(sum(self.deficits(s, assign)) for s in self.students)
        if name == "students_missing_rule":
            return sum(1 for s in self.students if any(missing for _, missing in self.shortfalls(s, assign)))
        if name in ("rule_missing_items", "rule_missing_minutes"):
            unit = name.removeprefix("rule_missing_")
            return sum(missing for s in self.students for u, missing in self.shortfalls(s, assign) if u == unit)
        if name == "total_cost":
            return sum(self.student_cost(s, assign) for s in self.students)
        if name == "tiebreak":
            return sum(op.tie for s in self.students for op in self.students[s].options if (s, op.o) in assign)
        threshold = level_threshold(name)
        if threshold is None:
            raise ValueError(f"unknown level {name}")
        return sum(1 for s in self.ranked if self.over_threshold(s, threshold, assign))

    def student_cost(self, s: int, assign: set[tuple[int, int]]) -> int:
        return sum(op.cost for op in self.students[s].options if (s, op.o) in assign)

    def over_threshold(self, s: int, threshold: int, assign: set[tuple[int, int]]) -> bool:
        weight = sum(op.weight for op in self.students[s].options if (s, op.o) in assign)
        return COST_SCALE * weight > threshold * self.students[s].norm

    def deficits(self, s: int, assign: set[tuple[int, int]]) -> list[int]:
        student = self.students[s]
        credit: dict[int, int] = {}
        for op in student.options:
            if (s, op.o) in assign:
                for c in op.credit:
                    credit[c.d] = credit.get(c.d, 0) + c.min
        return [max(0, day.min - credit.get(day.d, 0)) for day in student.required]

    def shortfalls(self, s: int, assign: set[tuple[int, int]]) -> list[tuple[str, int]]:
        """Per rule of the student, in order: its unit and what the assignment leaves missing."""
        rules = sorted(self.students[s].rules, key=lambda r: r.r)
        return [(rule.unit, max(0, rule.need - sum(a.n for a in rule.amounts if (s, a.o) in assign))) for rule in rules]


@dataclass
class Incumbent:
    assign: set[tuple[int, int]]
    cancelled: list[int]


def greedy_assign(request: SolveRequest) -> set[tuple[int, int]]:
    """A first solution to start the search from: the fixed pairs, then for
    each student, day by day, the options that still have a place, credit
    the day and clash with nothing taken, by wish number (the cost per
    minute) and the longer first, until the day is covered; then rule by
    rule the cheapest options that count toward it, until it is met. A
    hint, not an answer: it may break a minimum, and the solver repairs it."""
    remaining = {item.o: item.max for item in request.items}
    conflicts = {(min(a, b), max(a, b)) for a, b in request.conflicts}
    fixed: dict[int, list[int]] = {}
    for s, o in request.fixed:
        fixed.setdefault(s, []).append(o)
        # Every fixed place is taken before anyone chooses.
        remaining[o] -= 1
    assign: set[tuple[int, int]] = set()
    for student in sorted(request.students, key=lambda st: st.s):
        options = {op.o: op for op in student.options}
        taken: list[int] = []
        covered: dict[int, int] = {}
        for o in sorted(fixed.get(student.s, [])):
            taken.append(o)
            for c in options[o].credit:
                covered[c.d] = covered.get(c.d, 0) + c.min
        def minutes(op) -> int:  # noqa: ANN001 - the option model of this request
            return sum(c.min for c in op.credit)

        for day in sorted(student.required, key=lambda r: r.d):
            for op in sorted(student.options, key=lambda op: (op.cost / max(1, minutes(op)), -minutes(op), op.o)):
                if covered.get(day.d, 0) >= day.min:
                    break
                if op.o in taken or remaining[op.o] <= 0 or not any(c.d == day.d and c.min > 0 for c in op.credit):
                    continue
                if any((min(op.o, t), max(op.o, t)) in conflicts for t in taken):
                    continue
                taken.append(op.o)
                remaining[op.o] -= 1
                for c in op.credit:
                    covered[c.d] = covered.get(c.d, 0) + c.min
        for rule in sorted(student.rules, key=lambda r: r.r):
            amounts = {a.o: a.n for a in rule.amounts}
            have = sum(amounts.get(o, 0) for o in taken)
            for o in sorted(amounts, key=lambda o: (options[o].cost, o)):
                if have >= rule.need:
                    break
                if o in taken or remaining[o] <= 0 or any((min(o, t), max(o, t)) in conflicts for t in taken):
                    continue
                taken.append(o)
                remaining[o] -= 1
                have += amounts[o]
        assign.update((student.s, o) for o in taken)
    return assign


def hint_from(model: Model, assign: set[tuple[int, int]]) -> None:
    """Hints every variable from an assignment: items run unless nobody takes a cancellable one with a minimum."""
    model.model.clear_hints()
    takers = {o: 0 for o in model.items}
    for s, o in assign:
        takers[o] += 1
    for (s, o), var in model.x.items():
        model.model.add_hint(var, 1 if (s, o) in assign else 0)
    for o, var in model.y.items():
        item = model.items[o]
        model.model.add_hint(var, 0 if item.cancellable and 0 < item.min and takers[o] < item.min else 1)
    for s in model.students:
        gaps = model.deficits(s, assign)
        if s in model.z:
            model.model.add_hint(model.z[s], 1 if any(gaps) else 0)
        for day, gap in zip(sorted(model.students[s].required, key=lambda r: r.d), gaps, strict=True):
            model.model.add_hint(model.u[(s, day.d)], gap)
        shortfalls = model.shortfalls(s, assign)
        if s in model.w:
            model.model.add_hint(model.w[s], 1 if any(missing for _, missing in shortfalls) else 0)
        for rule, (_, missing) in zip(sorted(model.students[s].rules, key=lambda r: r.r), shortfalls, strict=True):
            model.model.add_hint(model.v[(s, rule.r)], missing)
    for threshold, flags in model.over.items():
        for s, b in zip(model.ranked, flags, strict=True):
            model.model.add_hint(b, 1 if model.over_threshold(s, threshold, assign) else 0)


def solve(request: SolveRequest, new_solver: Callable[[], cp_model.CpSolver] = cp_model.CpSolver) -> Outcome:
    model = Model(request)
    proven: dict[str, bool] = {}
    incumbent: Incumbent | None = None
    hint_from(model, greedy_assign(request))
    for name in request.levels:
        expr = model.objective(name)
        model.model.minimize(expr)
        solver = new_solver()
        solver.parameters.num_workers = NUM_WORKERS
        solver.parameters.random_seed = request.seed & SEED_MASK
        solver.parameters.max_deterministic_time = request.limits.deterministicTimePerLevel
        solver.parameters.log_search_progress = False
        status = solver.solve(model.model)
        if status == cp_model.MODEL_INVALID:
            return Outcome("MODEL_INVALID", [], [], [], solver.response_stats())
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            incumbent = Incumbent(
                {key for key, var in model.x.items() if solver.value(var) == 1},
                sorted(o for o, var in model.y.items() if solver.value(var) == 0),
            )
            proven[name] = status == cp_model.OPTIMAL
        elif incumbent is None or status == cp_model.INFEASIBLE:
            stopped: Status = "INFEASIBLE" if status == cp_model.INFEASIBLE else "UNKNOWN"
            return Outcome(stopped, [], [], [], f"level {name}: {solver.status_name(status)}")
        else:
            # The limit ended before any solution of this level: the one before stands, unimproved.
            proven[name] = False
        # Held for the levels after it; the solution found starts their search.
        model.model.add(expr <= model.evaluate(name, incumbent.assign))
        hint_from(model, incumbent.assign)
    assert incumbent is not None
    levels = [Level(name=name, value=model.evaluate(name, incumbent.assign), proven=proven[name]) for name in request.levels]
    return Outcome(roll_up(levels, None), levels, sorted(incumbent.assign), incumbent.cancelled)


def respond(outcome: Outcome, versions: Versions) -> SolveResponse:
    return SolveResponse(status=outcome.status, levels=outcome.levels, assign=outcome.assign, cancelled=outcome.cancelled, versions=versions, detail=outcome.detail)
