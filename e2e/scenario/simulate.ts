// The solver simulation (the plan's P.1): the scenario carried into a
// throwaway database through the services (load.ts), closed, and allocated
// by the real solver, for schools drawn from consecutive seeds; what came
// of it is written to docs/simulation.md. Local only, never in CI: it
// needs the test server (TEST_DATABASE_URL, as for the API tests) and a
// solver (SOLVER_URL, http://127.0.0.1:8000 unless set; CONTRIBUTING.md
// starts one). About two minutes per school.
//
//   npm run simulate                         five schools, docs/simulation.md
//   npm run simulate -- --schools 1 --out -  one school, the report on stdout
//   --seed N (the first school's), --limit S (deterministic time per level;
//   --limit 5,30,60 runs each school's one snapshot at each, so only the time differs)

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { RUN_LIMITS } from '@school-allocation/api-contracts/allocation'
import { placeTarget, type LevelValue, type SolveStatus } from '@school-allocation/school-core'
import { actorOf } from '../../apps/api/lib/actor.ts'
import { campaignStudents } from '../../apps/api/lib/dao/choices.ts'
import { createDatabase, type Database } from '../../apps/api/lib/db.ts'
import type { Campaign } from '../../apps/api/lib/models/campaigns.ts'
import { createSolverClient, type SolverClient } from '../../apps/api/lib/solver-client.ts'
import { runReview, startRun } from '../../apps/api/services/allocation.ts'
import { campaignDemand, requireCampaign } from '../../apps/api/services/campaigns.ts'
import { choiceView } from '../../apps/api/services/choices.ts'
import { ControlledClock } from '../../apps/api/test/helpers/clock.ts'
import { createTestDatabase } from '../../apps/api/test/helpers/db.ts'
import { TENANT_ID } from '../../apps/api/test/helpers/env.ts'
import { startFakeGraph } from '../../apps/api/test/helpers/fake-graph.ts'
import { ANNA } from '../../apps/api/test/helpers/personas.ts'
import { loadScenario, type Loaded } from './load.ts'
import { PROJECT_DAYS, SCENARIO_SEED, STORY, scenario, type Scenario, type ScenarioClass, type ScenarioItem } from './school.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const { values: args } = parseArgs({ options: { seed: { type: 'string', default: String(SCENARIO_SEED) }, schools: { type: 'string', default: '5' }, out: { type: 'string', default: path.join(ROOT, 'docs', 'simulation.md') }, limit: { type: 'string', default: String(RUN_LIMITS.defaultDeterministicTimePerLevel) } } })
const SCHOOLS = Number(args.schools)
/** Deterministic time per level; several, comma-separated, run one after another on each school's one snapshot. */
const LIMITS = args.limit.split(',').map(Number)
const SOLVER_URL = process.env.SOLVER_URL ?? 'http://127.0.0.1:8000'
const TOKEN = 'simulation-token'
const VIENNA = 'Europe/Vienna'
const DAY_NAMES: Record<string, string> = { [PROJECT_DAYS[0]]: 'Mon', [PROJECT_DAYS[1]]: 'Tue', [PROJECT_DAYS[2]]: 'Wed' }

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL must name a PostgreSQL superuser connection, as for the API tests (npm run db:test starts one)')
  process.exit(1)
}

interface PassTiming {
  status: SolveStatus
  ms: number
  levels: LevelValue[]
}

/** A time group as one class sees it on the choice page. */
interface ClassGroup {
  date: string
  from: string
  to: string
  items: string[]
  required: number
}

/** One run of a school's snapshot. */
interface Run {
  limit: number
  passes: PassTiming[]
  review: Awaited<ReturnType<typeof runReview>>
}

interface School {
  seed: number
  s: Scenario
  loaded: Loaded
  loadMs: number
  groups: Map<string, ClassGroup[]>
  /** The organizer's demand page at the close: places per day and grade, rules per grade. */
  demand: Awaited<ReturnType<typeof campaignDemand>>
  /** One per limit, in the order given; the first is the one the sections after the runs describe. */
  runs: Run[]
  versions: { solver: string, ortools: string } | null
}

const schools: School[] = []
for (let k = 0; k < SCHOOLS; k++) {
  const seed = Number(args.seed) + k
  console.error(`school ${k + 1} of ${SCHOOLS} (seed ${seed})`)
  schools.push(await simulate(seed))
}
const report = render(schools)
if (args.out === '-') process.stdout.write(report)
else {
  writeFileSync(args.out, report)
  console.error(`written to ${path.relative(process.cwd(), args.out)}`)
}

async function simulate(seed: number): Promise<School> {
  const s = scenario(seed)
  // createTestDatabase registers the drop with a test context; this one collects what to undo, undone last first.
  const cleanups: (() => unknown)[] = []
  const context = { after: (fn: () => unknown) => cleanups.push(fn) } as unknown as TestContext
  try {
    const testDb = await createTestDatabase(context)
    const clock = new ControlledClock(new Date(STORY.starts))
    const graph = await startFakeGraph([TOKEN], new Map())
    cleanups.push(() => graph.close())
    const db = createDatabase(testDb.runtimeUrl, (err) => console.error('database client failed', err), clock)
    cleanups.push(() => db.close())
    const started = performance.now()
    const loaded = await loadScenario({ db, clock, graph, accessToken: TOKEN, tenantId: TENANT_ID, bootstrapAdmins: [ANNA.email ?? ''], context: { baseUrl: 'http://127.0.0.1:3100' } }, s, { log: (m) => console.error(`  ${m}`) })
    const loadMs = performance.now() - started
    const groups = await groupsByClass(db, loaded.campaign)
    const demand = await campaignDemand(db, loaded.campaign)

    // Monday 20 March: the organizer starts the run, and another per further limit on the same frozen
    // snapshot (a campaign in review takes another run); each pass timed at the client.
    clock.set(new Date(STORY.runs))
    let passes: PassTiming[] = []
    let versions: School['versions'] = null
    const client = createSolverClient(SOLVER_URL)
    const solver: SolverClient = {
      health: () => client.health(),
      solve: async (request) => {
        const at = performance.now()
        const response = await client.solve(request)
        passes.push({ status: response.status, ms: performance.now() - at, levels: response.levels })
        versions = response.versions
        return response
      },
    }
    const runs: Run[] = []
    for (const limit of LIMITS) {
      passes = []
      const { run, done } = await startRun(db, { solver, log: { error: (fields, message) => console.error(message, fields) } }, await requireCampaign(db, loaded.campaign.id), { seed, deterministicTimePerLevel: limit }, actorOf(loaded.organizer))
      await done
      const review = await runReview(db, await requireCampaign(db, loaded.campaign.id), run.id)
      if (review.run.status !== 'succeeded') throw new Error(`the run of seed ${seed} at ${limit} s ${review.run.status}: ${review.run.failure ?? ''} ${review.run.detail ?? ''}`)
      console.error(`  run at ${limit} s per level: ${passes.map((p) => `${p.status} in ${seconds(p.ms)}`).join(', ')}`)
      runs.push({ limit, passes, review })
    }
    return { seed, s, loaded, loadMs, groups, demand, runs, versions }
  } finally {
    for (const cleanup of cleanups.toReversed()) await cleanup()
  }
}

/** Per class, the time groups one of its students is asked to rank in, as the choice page builds them. */
async function groupsByClass(db: Database, campaign: Campaign): Promise<Map<string, ClassGroup[]>> {
  const students = await campaignStudents(db, campaign)
  const out = new Map<string, ClassGroup[]>()
  for (const student of students) {
    if (out.has(student.className)) continue
    const view = await choiceView(db, campaign, student)
    out.set(student.className, view.groups.map((g) => ({
      date: localDate(g.startsAt),
      from: localTime(g.startsAt),
      to: localTime(g.endsAt),
      items: g.items.map((i) => i.title),
      required: g.required,
    })))
  }
  return out
}

/** Per day and grade, the places an exact split of every shared item would give the grade, before rounding to whole places. */
function exactShares(classes: readonly ScenarioClass[], items: readonly ScenarioItem[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const date of PROJECT_DAYS) {
    const onDay = items.filter((i) => i.sessions.some((x) => x.date === date))
    const fixed = new Set(onDay.flatMap((i) => i.fixedClasses))
    const needing = new Map(classes.map((c) => [c.name, fixed.has(c.name) ? 0 : c.students.length]))
    for (const item of onDay) {
      const eligible = classes.filter((c) => !item.fixedClasses.includes(c.name)
        && (item.eligibleGrades.length === 0 || item.eligibleGrades.includes(c.grade))
        && (item.eligibleClasses.length === 0 || item.eligibleClasses.includes(c.name)))
      const need = eligible.reduce((sum, c) => sum + (needing.get(c.name) ?? 0), 0)
      if (need === 0 || item.places <= 0) continue
      for (const c of eligible) {
        const key = `${date}:${c.grade}`
        out.set(key, (out.get(key) ?? 0) + item.places * (needing.get(c.name) ?? 0) / need)
      }
    }
  }
  return out
}

function render(all: readonly School[]): string {
  const first = all[0] as School
  const { s } = first
  const lines: string[] = []
  const add = (...more: string[]) => lines.push(...more)
  const table = (head: readonly string[], rows: readonly (readonly (string | number)[])[], right = head.map((_, i) => i > 0)) => {
    add(`| ${head.join(' | ')} |`, `| ${head.map((_, i) => (right[i] ? '---:' : '---')).join(' | ')} |`)
    for (const row of rows) add(`| ${row.map((cell) => (cell === '' ? '–' : cell)).join(' | ')} |`)
    add('')
  }
  const versions = first.versions
  const firstRun = first.runs[0] as Run
  const review = firstRun.review
  add(
    '# Solver simulation',
    '',
    `Generated by \`npm run simulate\` (e2e/scenario/simulate.ts): ${all.length === 1 ? 'one school' : `${all.length} schools`} drawn by the scenario generator from ${all.length === 1 ? 'seed' : 'seeds'} ${all.map((x) => x.seed).join(', ')}, each loaded into a throwaway database through the services as its people would act, closed by the clock and allocated by the real solver${versions ? ` (OR-Tools ${versions.ortools}, solver build ${versions.solver})` : ''} with ${LIMITS.length === 1 ? `${LIMITS[0]} s` : `${LIMITS.slice(0, -1).join(', ')} and ${LIMITS.at(-1)} s, one run after another on the same snapshot,`} of deterministic time per level. Times are wall-clock on the machine that ran it. The database draws a school's ids anew at every load, and the solver's request lists students and activities in id order; where the deterministic time stops a level the solver has not proven depends on that order, so two loads of one seed can come out quite differently. A stored run repeated with its seed answers the same.`,
    '',
    `Every school: ${s.classes.reduce((n, c) => n + c.students.length, 0)} students in ${s.classes.length} classes, ${s.teachers.length} teachers, ${s.items.length} activities over three project days; ${s.campaign.wishesPerGroup} wishes per time group; a daily minimum of ${Object.entries(s.campaign.dailyMinimum).map(([g, m]) => `${m} minutes for grade ${g}`).join(', ')}; ${s.campaign.placeHeadroomPercent}% places beyond the need as the demand marker's target; the rules ${s.campaign.rules.map((r) => `"${r.category} ≥ ${amount(r.minimum, r.unit)}, grade${r.grades.length > 1 ? 's' : ''} ${gradeSpan(r.grades)}"`).join(' and ')}.`,
    '',
    '## The runs',
    '',
  )
  const rankHead = Array.from({ length: s.campaign.wishesPerGroup }, (_, i) => `Wish ${i + 1}`)
  table(['Seed', 'Load', 'Limit', 'Pass 1', 'Pass 2', ...rankHead, 'Fallback', 'With a deficit', 'Missing a rule', 'Cancelled'], all.flatMap((x) => x.runs.map((run) => {
    const sum = run.review.summary
    return [
      String(x.seed), seconds(x.loadMs), `${run.limit} s`, ...[0, 1].map((p) => `${seconds(run.passes[p]?.ms ?? 0)} ${run.passes[p]?.status ?? ''}`),
      ...rankHead.map((_, i) => sum?.ranks[String(i + 1)] ?? 0), sum?.ranks.fallback ?? 0,
      sum?.students.withDeficit ?? 0, sum?.students.missingRule ?? 0, run.review.run.cancelledItemIds.length,
    ]
  })))
  add('Rows by wish number count assignments to time groups a student ranked; a fallback is a free place given where the wishes ran out. Pass 1 places the lists saved in time; pass 2 keeps them and adds the late lists and the students without one.', '')

  add('### Levels of the first school', '', `The solver optimizes level after level, each kept while the next is optimized; a value "not proven" is the best it found before the deterministic time ran out, not one it proved optimal.`, '')
  const levelHead = first.runs.flatMap((run) => [1, 2].map((p) => (first.runs.length === 1 ? `Pass ${p}` : `Pass ${p} at ${run.limit} s`)))
  table(['Level', ...levelHead], (firstRun.passes[0]?.levels ?? []).map((level, i) => [`\`${level.name}\``, ...first.runs.flatMap((run) => [0, 1].map((p) => {
    const l = run.passes[p]?.levels[i]
    return l === undefined ? '' : `${l.value}${l.proven ? '' : ', not proven'}`
  }))]), [false, ...levelHead.map(() => true)])

  add('## Demand and the target', '', 'Per day and grade for the first school, as the organizer\'s demand page shows it: who needs a place, the target (need plus the headroom, rounded up), the places offered by the demand arithmetic, and what an exact split of the shared activities would give before rounding to whole places.', '')
  const exact = exactShares(s.classes, s.items)
  const demandRows: (string | number)[][] = []
  for (const day of first.demand.demand) {
    for (const g of day.grades) {
      if (g.needing === 0) continue
      const target = placeTarget(g.needing, s.campaign.placeHeadroomPercent)
      demandRows.push([DAY_NAMES[day.date] ?? day.date, g.grade, g.needing, target, g.offered, (exact.get(`${day.date}:${g.grade}`) ?? 0).toFixed(1), g.offered < target ? 'short' : ''])
    }
  }
  table(['Day', 'Grade', 'Needing', 'Target', 'Offered', 'Exact split', 'Marker'], demandRows, [false, true, true, true, true, true, false])
  add('Per rule and grade, as the same page shows it: what the students need of the rule after their class activities, and what the category\'s activities open to them could bring, an activity open to several grades counted for each. Beside it, the grades that share those activities taken together: their need against what the shared activities can bring once.', '')
  const ruleRows: (string | number)[][] = []
  for (const r of first.demand.rules) {
    const rule = review.rules.find((x) => x.id === r.ruleId)
    const category = review.categories.find((c) => c.id === rule?.categoryId)?.name ?? '?'
    const joint = jointRuleOffer(s, first.demand.rules.filter((x) => x.ruleId === r.ruleId), category, rule?.unit ?? 'items', r.grade)
    ruleRows.push([`${category} ≥ ${rule ? amount(rule.minimum, rule.unit) : '?'}`, r.grade, r.students, r.needed, r.offered, joint.grades.join(', '), joint.needed, joint.offered, joint.offered < joint.needed ? 'short together' : ''])
  }
  table(['Rule', 'Grade', 'Students', 'Needed', 'Offered', 'Sharing grades', 'Needed together', 'Offered together', 'Marker'], ruleRows, [false, true, true, true, true, false, true, true, false])

  add('## Time groups', '', 'Each class\'s choice page for the first school: per day the time groups (activities with the same sessions) and the wishes they ask for, which is the cap or the number of activities in the group, whichever is smaller.', '')
  const groupRows = [...first.groups].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([className, groups]) => [className, ...PROJECT_DAYS.map((date) => {
    const onDay = groups.filter((g) => g.date === date)
    return onDay.length === 0 ? '–' : `${onDay.length} / ${onDay.reduce((n, g) => n + g.required, 0)}`
  })])
  table(['Class', 'Mon groups / wishes', 'Tue groups / wishes', 'Wed groups / wishes'], groupRows, [false, true, true, true])
  const single = new Map<string, string[]>()
  const fragmented = new Map<string, string[]>()
  for (const [className, groups] of first.groups) {
    for (const g of groups.filter((x) => x.items.length === 1)) {
      const key = `${g.items[0] ?? ''} (${DAY_NAMES[g.date] ?? g.date} ${g.from}–${g.to})`
      single.set(key, [...(single.get(key) ?? []), className])
    }
    for (const date of PROJECT_DAYS) {
      const onDay = groups.filter((x) => x.date === date)
      if (!onDay.some((g) => onDay.some((h) => h !== g && g.from < h.to && h.from < g.to))) continue
      const key = `${DAY_NAMES[date] ?? date} | ${onDay.map((g) => `${g.from}–${g.to} (${g.items.length})`).join(', ')}`
      fragmented.set(key, [...(fragmented.get(key) ?? []), className])
    }
  }
  add('**One-activity groups.** A group with one activity asks for one wish, which can only be that activity: it is on every list of the classes that see it, as the first wish of its group.', '')
  table(['Activity', 'Classes'], [...single].map(([what, classes]) => [what, classList(classes)]), [false, false])
  add('**Overlapping groups.** Activities whose sessions overlap without being identical form separate groups, each asking for its own wishes, though a student can attend only one of them at a time. The days where a class has such groups, with each group\'s span and number of activities:', '')
  table(['Day', 'Groups (activities)', 'Classes'], [...fragmented].map(([key, classes]) => [...key.split(' | '), classList(classes)]), [false, false, false])

  add('## Lists', '', 'How the first school\'s students saved, by the plan the generator gave them. A student whose list misses a rule after the first save puts a fitting activity in place of their least wanted wish, as the page asks, and saves again.', '')
  const plans = ['first', 'late', 'incomplete', 'never'] as const
  const outcomes = [...first.loaded.choices.values()]
  table(['Plan', 'Students', 'Saved', 'Saved more than once', 'Complete'], plans.map((plan) => {
    const of = outcomes.filter((o) => o.plan === plan)
    return [plan, of.length, of.filter((o) => o.saves > 0).length, of.filter((o) => o.saves > 1).length, of.filter((o) => o.complete).length]
  }))

  const summary = review.summary
  if (summary) {
    add('## Outcome of the first school', '', ...(first.runs.length > 1 ? [`Of its run at ${firstRun.limit} s per level.`, ''] : []))
    add(`- Students: ${summary.students.total}; with something to choose ${summary.students.choosing}; every day covered ${summary.students.covered}; with a deficit ${summary.students.withDeficit} (${summary.deficits.reduce((n, d) => n + d.minutes, 0)} minutes in all); with a fallback ${summary.students.withFallback}; late ${summary.students.late}; without a list ${summary.students.nonSubmitters}.`)
    const categoryOf = new Map(review.categories.map((c) => [c.id, c.name]))
    for (const rule of summary.rules) {
      const r = review.rules.find((x) => x.id === rule.ruleId)
      add(`- Rule "${categoryOf.get(r?.categoryId ?? '') ?? '?'} ≥ ${r ? amount(r.minimum, r.unit) : '?'}": met by ${rule.met} of ${rule.students}.`)
    }
    const missing = review.students.filter((st) => st.rules.some((r) => !r.met))
    if (missing.length > 0) {
      const windows = { first: 0, late: 0, none: 0 }
      for (const st of missing) windows[st.window ?? 'none'] += 1
      // The places a missing student could still have taken: free after the run, in a live activity of the category open to them.
      const keyOf = new Map([...first.loaded.itemIds].map(([key, id]) => [id, key]))
      const byKey = new Map(s.items.map((i) => [i.key, i]))
      const free = new Map<string, number>()
      const counted = new Set<string>()
      for (const st of missing) {
        for (const rule of st.rules.filter((r) => !r.met)) {
          for (const row of review.items) {
            const item = byKey.get(keyOf.get(row.itemId) ?? '')
            if (!item || row.cancelled || counted.has(row.itemId) || !item.categories.includes(categoryOf.get(rule.categoryId) ?? '')) continue
            if (item.fixedClasses.includes(st.className) || (item.eligibleGrades.length > 0 && !item.eligibleGrades.includes(st.grade)) || (item.eligibleClasses.length > 0 && !item.eligibleClasses.includes(st.className))) continue
            counted.add(row.itemId)
            for (const date of new Set(item.sessions.map((x) => x.date))) free.set(date, (free.get(date) ?? 0) + Math.max(0, row.places - row.assigned))
          }
        }
      }
      add(`- Missing a rule: ${missing.length} students (${windows.first} saved in time, ${windows.late} late, ${windows.none} without a list), in ${classList(missing.map((x) => x.className))}; places left free after the run in activities of the missed category open to them: ${PROJECT_DAYS.map((d) => `${DAY_NAMES[d] ?? d} ${free.get(d) ?? 0}`).join(', ')}.`)
    }
    const cancelled = review.items.filter((i) => i.cancelled)
    add(`- Cancelled: ${cancelled.length === 0 ? 'none' : cancelled.map((i) => `${i.title} (${i.assigned} of minimum ${i.minimum})`).join(', ')}.`)
    const underMin = review.items.filter((i) => !i.cancelled && i.minimum > 0 && i.assigned < i.minimum)
    if (underMin.length > 0) add(`- Below the minimum but kept (not cancellable): ${underMin.map((i) => `${i.title} (${i.assigned} of ${i.minimum})`).join(', ')}.`)
    add('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** The grades of a rule that share the category's activities open to `grade`, their need together, and what those activities bring once. */
function jointRuleOffer(s: Scenario, rows: readonly { grade: number, needed: number }[], category: string, unit: 'items' | 'minutes', grade: number): { grades: number[], needed: number, offered: number } {
  // As the demand counts it: an activity without places is open to nobody, a class activity's extra places to whom its rules name.
  const gradesOf = (item: ScenarioItem) => new Set(rows.map((r) => r.grade).filter((g) => item.places > 0 && s.classes.some((c) => c.grade === g && !item.fixedClasses.includes(c.name)
    && (item.eligibleGrades.length === 0 || item.eligibleGrades.includes(g)) && (item.eligibleClasses.length === 0 || item.eligibleClasses.includes(c.name)))))
  const open = s.items.filter((i) => i.categories.includes(category) && gradesOf(i).has(grade))
  const grades = [...new Set(open.flatMap((i) => [...gradesOf(i)]))].sort((a, b) => a - b)
  const shared = s.items.filter((i) => i.categories.includes(category) && [...gradesOf(i)].some((g) => grades.includes(g)))
  return {
    grades,
    needed: rows.filter((r) => grades.includes(r.grade)).reduce((n, r) => n + r.needed, 0),
    offered: shared.reduce((n, i) => n + i.places * (unit === 'minutes' ? i.sessions.reduce((m, x) => m + x.minutes, 0) : 1), 0),
  }
}

/** Class names, consecutive letters of one year as a span: 1A–1E, 2A, 2C. */
function classList(names: readonly string[]): string {
  const byYear = new Map<string, string[]>()
  for (const name of [...new Set(names)].sort((a, b) => a.localeCompare(b, 'en'))) byYear.set(name.slice(0, -1), [...(byYear.get(name.slice(0, -1)) ?? []), name.slice(-1)])
  return [...byYear].map(([year, letters]) => {
    const consecutive = letters.every((l, i) => i === 0 || l.charCodeAt(0) === (letters[i - 1] as string).charCodeAt(0) + 1)
    return consecutive && letters.length > 2 ? `${year}${letters[0]}–${year}${letters.at(-1)}` : letters.map((l) => `${year}${l}`).join(', ')
  }).join(', ')
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

function amount(n: number, unit: 'items' | 'minutes'): string {
  return `${n} ${unit === 'minutes' ? 'minutes' : n === 1 ? 'activity' : 'activities'}`
}

function gradeSpan(grades: readonly number[]): string {
  const sorted = [...grades].sort((a, b) => a - b)
  const contiguous = sorted.every((g, i) => i === 0 || g === (sorted[i - 1] as number) + 1)
  return contiguous && sorted.length > 2 ? `${sorted[0]}–${sorted.at(-1)}` : sorted.join(', ')
}

function localDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: VIENNA })
}
function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-AT', { timeZone: VIENNA, hour: '2-digit', minute: '2-digit' })
}
