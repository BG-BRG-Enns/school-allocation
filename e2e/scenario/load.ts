// Carries the scenario into a database through the services, as each
// person would act, at the moment the story has them act: the
// administrator labels the groups and imports the roster from the Graph
// stand-in, assigns the class teachers, grants the organizer's role and
// sets up the registration; teachers enter their availability and propose
// their activities; the organizer approves and publishes; the clock opens
// and closes the window; each student signs in and saves their list. No
// list is entered on anyone's behalf: that would put 600 reasons into the
// audit log.
//
// The story comes in stages (scenarioLoader), so that the journeys can
// tell their part of it through the pages and leave the rest of the
// school to the loader: the harness calls a stage between two steps, and
// a stage finds what the journeys made before it. loadScenario tells the
// whole story in one go, for the simulation.
//
// The caller owns the database, the clock and the stand-in (simulate.ts,
// or the harness): they are passed in, as the API tests pass them to the app.

import { actorOf, type Caller } from '../../apps/api/lib/actor.ts'
import { loadCaller } from '../../apps/api/lib/auth.ts'
import { readGroups } from '../../apps/api/lib/dao/roster-groups.ts'
import { currentBatch, entriesOf } from '../../apps/api/lib/dao/roster.ts'
import type { Database } from '../../apps/api/lib/db.ts'
import type { Campaign } from '../../apps/api/lib/models/campaigns.ts'
import type { WindowContext } from '../../apps/api/lib/models/window.ts'
import { grantRole } from '../../apps/api/services/admin-users.ts'
import { createCampaign, listCampaigns, requireCampaign, transitionCampaign, updateCampaign } from '../../apps/api/services/campaigns.ts'
import { itemInput } from '../../apps/api/services/catalogue-input.ts'
import { categories, createCategory } from '../../apps/api/services/categories.ts'
import { callerStudent, choiceView, saveRanking } from '../../apps/api/services/choices.ts'
import { applyTeacherList } from '../../apps/api/services/teacher-list.ts'
import { approveItem, createItem, proposeItem } from '../../apps/api/services/items.ts'
import { setMyAvailability } from '../../apps/api/services/planning.ts'
import { replaceGroups } from '../../apps/api/services/roster-groups.ts'
import { importGraphRoster } from '../../apps/api/services/roster-import.ts'
import { commitBatch } from '../../apps/api/services/roster.ts'
import { tick } from '../../apps/api/services/scheduling.ts'
import { recordSignIn } from '../../apps/api/services/sign-in.ts'
import type { ControlledClock } from '../../apps/api/test/helpers/clock.ts'
import { memberOf, type FakeGraph } from '../../apps/api/test/helpers/fake-graph.ts'
import { STORY, type ChoicePlan, type Scenario, type ScenarioPerson } from './school.ts'

export interface ScenarioWorld {
  /** The runtime role's connection, reading `clock`. */
  db: Database
  clock: ControlledClock
  /** The Graph stand-in; its groups are replaced by the scenario's. */
  graph: FakeGraph
  /** A bearer token the stand-in accepts. */
  accessToken: string
  /** The tenant the roster's identities are bound in (the stand-in for Entra's). */
  tenantId: string
  bootstrapAdmins: readonly string[]
  context: WindowContext
}

export interface LoadOptions {
  log?: (message: string) => void
}

export interface ChoiceOutcome {
  plan: ChoicePlan
  saves: number
  complete: boolean
}

/** What a run of saves did: the lists saved, and how many of them are complete. */
export interface SavesOutcome {
  saved: number
  complete: number
}

export interface Loaded {
  campaign: Campaign
  /** The organizer, signed in: who starts a run. */
  organizer: Caller
  /** Scenario item key → item id. */
  itemIds: Map<string, string>
  /** Oid → person id in the roster. */
  personIds: Map<string, string>
  /** Category name → id. */
  categoryIds: Map<string, string>
  /** Per student oid, what became of their list. */
  choices: Map<string, ChoiceOutcome>
}

type Event = { at: string, order: number, run: () => Promise<void> }

export type ScenarioLoader = ReturnType<typeof scenarioLoader>

/** The Graph stand-in holds the scenario's tenant: every class, the leavers who are never labelled, and the teachers. */
export function stockTenant(graph: FakeGraph, s: Scenario): void {
  graph.groups.clear()
  graph.names.clear()
  for (const c of [...s.classes, ...s.leavers]) {
    graph.groups.set(c.groupId, c.students.map((p) => memberOf(p)))
    graph.names.set(c.groupId, c.groupName)
  }
  graph.groups.set(s.teachersGroup.groupId, s.teachers.map((p) => memberOf(p)))
  graph.names.set(s.teachersGroup.groupId, s.teachersGroup.groupName)
}

/**
 * The story's stages, each acting as its people would. A stage finds what
 * came before it in the database (the labelled groups, the current roster,
 * the categories, the registration), so that a journey can have done a
 * part of it through the pages; what it made itself it remembers (the
 * items, the lists saved), for the stages after it. The clock only moves
 * forward: a moment the clock has passed runs at the clock's time.
 */
export function scenarioLoader(world: ScenarioWorld, s: Scenario, log: (message: string) => void = () => {}) {
  const { db, clock, context } = world
  const everyone = new Map<string, ScenarioPerson>([...s.classes.flatMap((c) => c.students), ...s.teachers].map((p) => [p.oid, p]))
  const callers = new Map<string, Caller>()
  const itemIds = new Map<string, string>()
  const outcomes = new Map<string, ChoiceOutcome>()

  /** Signs `oid` in, as the stand-in for Entra would, once; `fresh` again, for roles or a binding gained since. */
  async function signIn(oid: string, fresh = false): Promise<Caller> {
    const known = callers.get(oid)
    if (known && !fresh) return known
    const person = everyone.get(oid)
    if (!person) throw new Error(`nobody in the scenario has oid ${oid}`)
    const { id } = await recordSignIn(db, { tid: world.tenantId, oid, displayName: person.name, email: person.email, upn: person.email }, world.bootstrapAdmins)
    const caller = await loadCaller(db, id)
    if (!caller) throw new Error(`${person.name} could not sign in`)
    callers.set(oid, caller)
    return caller
  }

  /** The administrator labels the scenario's groups not labelled yet, keeping what is; `except` (group ids) are left to someone else. */
  async function labelGroups(except: ReadonlySet<string> = new Set()): Promise<number> {
    const admin = await signIn(s.admin, true)
    const labelled = await readGroups(db)
    const known = new Set(labelled.map((g) => g.groupId.toLowerCase()))
    const added = [
      ...s.classes.map((c) => ({ groupId: c.groupId, label: c.groupName, kind: 'student' as const, className: c.name, grade: c.grade })),
      { groupId: s.teachersGroup.groupId, label: s.teachersGroup.groupName, kind: 'teacher' as const },
    ].filter((g) => !known.has(g.groupId.toLowerCase()) && !except.has(g.groupId))
    await replaceGroups(db, [...labelled, ...added], actorOf(admin))
    log(`groups: ${added.length} labelled`)
    return added.length
  }

  /** The administrator imports the roster from the stand-in and commits it. */
  async function importRoster(): Promise<void> {
    const admin = await signIn(s.admin, true)
    const batch = await importGraphRoster(db, world.graph.baseUrl, world.accessToken, s.schoolYear, actorOf(admin))
    if (batch.state !== 'pending') throw new Error(`the roster import is ${batch.state}: ${JSON.stringify(batch.problems.slice(0, 3))}`)
    const committed = await commitBatch(db, batch.id, actorOf(admin), world.tenantId)
    log(`roster: ${committed.diff.added.length} people`)
  }

  /** Oid → person id, as the current roster has them. */
  async function personIds(): Promise<Map<string, string>> {
    const batch = await currentBatch(db)
    if (!batch) throw new Error('no roster is committed')
    return new Map((await entriesOf(db, batch.id)).filter((e) => e.oid && e.personId).map((e) => [e.oid as string, e.personId as string]))
  }

  /** The administrator imports the class teachers as a teacher list (but of the classes in `except`) and grants the organizer's role. */
  async function assignStaff(except: ReadonlySet<string> = new Set()): Promise<Caller> {
    const admin = await signIn(s.admin, true)
    const byOid = new Map(s.teachers.map((teacher) => [teacher.oid, teacher]))
    const rows = s.classes.filter((c) => c.classTeacher !== null && !except.has(c.name)).map((c) => `${must(byOid, c.classTeacher as string).email};${c.name}`)
    const applied = await applyTeacherList(db, ['email;class', ...rows, ''].join('\n'), actorOf(admin))
    const assigned = applied.classesChanged
    const organizerUser = await signIn(s.organizer)
    await grantRole(db, organizerUser.id, 'campaign_organizer', s.organizerReason, actorOf(admin))
    log(`staff: ${assigned} class teachers, the organizer`)
    return signIn(s.organizer, true)
  }

  /** The school's categories by name: the administrator adds those of the scenario not there yet, in any case of the letters. */
  async function ensureCategories(): Promise<Map<string, string>> {
    const admin = await signIn(s.admin, true)
    const ids = new Map<string, string>()
    for (const name of s.categories) {
      let known = (await categories(db)).categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
      if (!known) known = (await createCategory(db, name, actorOf(admin))).categories.find((c) => c.name === name)
      if (!known) throw new Error(`the category ${name} was not created`)
      ids.set(name, known.id)
    }
    return ids
  }

  /** The registration of the scenario's school year called `name`, made by the journeys or by createRegistration. */
  async function registrationNamed(name: string): Promise<Campaign> {
    const found = (await listCampaigns(db, await signIn(s.admin, true))).filter((c) => c.name === name && c.schoolYear === s.schoolYear)
    if (found.length !== 1) throw new Error(`${found.length} registrations are called ${name} in ${s.schoolYear}`)
    return found[0] as Campaign
  }

  /** The organizer sets up the registration with the scenario's window and rules, and opens it for proposals. */
  async function createRegistration(categoryIds: ReadonlyMap<string, string>): Promise<string> {
    const organizer = await signIn(s.organizer)
    const c = s.campaign
    const created = await createCampaign(db, { kind: 'project_week', name: c.name, schoolYear: s.schoolYear, projectDays: [...s.projectDays] }, actorOf(organizer))
    await updateCampaign(db, created.id, {
      name: c.name,
      schoolYear: s.schoolYear,
      projectDays: [...s.projectDays],
      opensAt: c.opensAt,
      closesAt: c.closesAt,
      lateUntil: c.lateUntil,
      swapFrom: c.swapFrom,
      swapUntil: c.swapUntil,
      wishesPerGroup: c.wishesPerGroup,
      dailyMinimum: c.dailyMinimum,
      showTeachers: c.showTeachers,
      reminderDays: c.reminderDays,
      placeHeadroomPercent: c.placeHeadroomPercent,
      rules: c.rules.map((r) => ({ categoryId: must(categoryIds, r.category), grades: r.grades, classes: r.classes, unit: r.unit, minimum: r.minimum })),
    }, actorOf(organizer))
    await transitionCampaign(db, created.id, 'catalogue', actorOf(organizer), context)
    return created.id
  }

  /** Until mid-February: availability, proposals, approvals, each at its moment, into the registration taking proposals. */
  async function catalogue(campaignId: string, categoryIds: ReadonlyMap<string, string>): Promise<Map<string, string>> {
    const ids = await personIds()
    const organizer = await signIn(s.organizer)
    const events: Event[] = []
    for (const teacher of s.teachers) {
      const at = teacher.availabilitySetAt
      if (at === null) continue
      events.push({ at, order: 0, run: async () => {
        const caller = await signIn(teacher.oid)
        for (const [date, status] of Object.entries(teacher.availability)) {
          if (status) await setMyAvailability(db, caller, date, status)
        }
      } })
    }
    for (const item of s.items) {
      events.push({ at: item.proposedAt, order: 1, run: async () => {
        const lead = await signIn(item.teachers[0] ?? s.organizer)
        const body = {
          title: item.title,
          description: item.description,
          location: item.location,
          feeCents: item.feeCents,
          feeNote: item.feeNote,
          places: item.places,
          minParticipants: item.minParticipants,
          cancellableBelowMin: item.cancellableBelowMin,
          fixedClasses: item.fixedClasses,
          eligibleGrades: item.eligibleGrades,
          eligibleClasses: item.eligibleClasses,
          teachers: item.teachers.map((oid) => must(ids, oid)),
          // The project days are in July: Vienna's summer time.
          sessions: item.sessions.map((x) => ({ startsAt: `${x.date}T${x.from}:00+02:00`, endsAt: `${x.date}T${x.to}:00+02:00`, credits: [{ date: x.date, minutes: x.minutes }] })),
          categories: item.categories.map((name) => must(categoryIds, name)),
        }
        const made = await createItem(db, campaignId, itemInput(body, lead, true), lead)
        await proposeItem(db, made.id, lead)
        itemIds.set(item.key, made.id)
      } })
      events.push({ at: item.approvedAt, order: 2, run: async () => {
        await approveItem(db, must(itemIds, item.key), organizer)
      } })
    }
    await play(clock, events)
    log(`catalogue: ${s.items.length} activities proposed and approved`)
    return itemIds
  }

  /**
   * Every student's save before `until`, at its moment, but those in
   * `skip` (a journey's) and those saved already; the scheduler's tick
   * at each of `ticks` before `until` as well.
   */
  async function saveChoices(campaignId: string, options: { until: string, skip?: ReadonlySet<string>, ticks?: readonly string[] }): Promise<SavesOutcome> {
    const until = Date.parse(options.until)
    const campaign = await requireCampaign(db, campaignId)
    const keyOf = new Map([...itemIds].map(([key, id]) => [id, key]))
    const events: Event[] = []
    let saved = 0
    let complete = 0
    for (const choice of s.choices) {
      if (choice.saveAt === null || Date.parse(choice.saveAt) >= until || options.skip?.has(choice.oid) || outcomes.has(choice.oid)) continue
      events.push({ at: choice.saveAt, order: 1, run: async () => {
        const caller = await signIn(choice.oid)
        const student = await callerStudent(db, campaign, caller)
        const view = await choiceView(db, campaign, student)
        // An activity the scenario does not know (a journey's) is wanted least.
        const taste = s.preferences[choice.oid] ?? {}
        const wanted = (id: string) => taste[keyOf.get(id) ?? ''] ?? 0
        const ranking: Record<string, string[]> = {}
        for (const group of view.groups) ranking[group.key] = [...group.itemIds].sort((a, b) => wanted(b) - wanted(a) || a.localeCompare(b, 'en')).slice(0, view.cap)
        if (choice.plan === 'incomplete') {
          // Saved, but one group left short: the last one asking for anything.
          const last = view.groups.findLast((g) => g.required > 0)
          if (last) ranking[last.key] = (ranking[last.key] ?? []).slice(0, last.required - 1)
        }
        let result = await saveRanking(db, campaign, student.personId, ranking, { caller })
        let count = 1
        // The page says what a rule still asks; the student puts a fitting activity in place of their least wanted wish.
        while (choice.plan !== 'incomplete' && !result.complete && count < 4) {
          const open = result.rules.find((r) => !r.done)
          const fix = open && result.groups.flatMap((g) => g.items.filter((i) => i.categoryIds.includes(open.categoryId) && !(ranking[g.key] ?? []).includes(i.id)).map((i) => ({ group: g.key, id: i.id })))
            .sort((a, b) => wanted(b.id) - wanted(a.id))[0]
          if (!fix) break
          const list = ranking[fix.group] ?? []
          ranking[fix.group] = list.length < view.cap ? [...list, fix.id] : [...list.slice(0, -1), fix.id]
          result = await saveRanking(db, campaign, student.personId, ranking, { caller })
          count++
        }
        outcomes.set(choice.oid, { plan: choice.plan, saves: count, complete: result.complete })
        saved++
        if (result.complete) complete++
      } })
    }
    for (const at of options.ticks ?? []) {
      if (Date.parse(at) >= until) continue
      events.push({ at, order: 0, run: async () => {
        await tick(db, context, db.now())
      } })
    }
    await play(clock, events, (done, total) => {
      if (done % 100 === 0) log(`choices: ${done} of ${total} moments`)
    })
    log(`choices: ${saved} lists saved, ${complete} of them complete`)
    return { saved, complete }
  }

  return { signIn, labelGroups, importRoster, personIds, assignStaff, ensureCategories, registrationNamed, createRegistration, catalogue, saveChoices, outcomes }
}

/** The whole story, from the empty school to the closed registration with every list in: the simulation's. */
export async function loadScenario(world: ScenarioWorld, s: Scenario, options: LoadOptions = {}): Promise<Loaded> {
  const { db, clock, context } = world
  const log = options.log ?? (() => {})
  const story = scenarioLoader(world, s, log)

  // Monday 7 November 2033: the administrator labels the groups, imports and commits the roster, assigns the staff.
  clock.set(new Date(STORY.starts))
  stockTenant(world.graph, s)
  await story.labelGroups()
  await story.importRoster()
  const organizer = await story.assignStaff()
  const categoryIds = await story.ensureCategories()

  // The organizer sets up the registration; until mid-February the catalogue fills.
  const campaignId = await story.createRegistration(categoryIds)
  const itemIds = await story.catalogue(campaignId, categoryIds)

  // Monday 27 February: published. Monday 6 March, 08:00: the clock opens the window.
  clock.set(new Date(STORY.published))
  await transitionCampaign(db, campaignId, 'published', actorOf(organizer), context)
  clock.set(new Date(STORY.opens))
  await tick(db, context, db.now())
  const opened = await requireCampaign(db, campaignId)
  if (opened.state !== 'open') throw new Error(`the window did not open: ${opened.state}`)

  // The two windows: every student's save at its moment, the clock's tick each morning and at each close.
  const ticks: string[] = []
  for (let ms = Date.parse(STORY.opens) + 86_400_000; ms < Date.parse(STORY.lateUntil); ms += 86_400_000) ticks.push(new Date(ms).toISOString())
  for (const end of [STORY.closes, STORY.lateUntil]) ticks.push(new Date(Date.parse(end) + 60_000).toISOString())
  await story.saveChoices(campaignId, { until: new Date(Date.parse(STORY.lateUntil) + 120_000).toISOString(), ticks })
  const closed = await requireCampaign(db, campaignId)
  if (closed.state !== 'closed') throw new Error(`the window did not close: ${closed.state}`)
  const choices = new Map(s.choices.map((c) => [c.oid, story.outcomes.get(c.oid) ?? { plan: c.plan, saves: 0, complete: false }]))
  log(`window closed: ${[...choices.values()].filter((x) => x.saves > 0).length} lists saved`)
  return { campaign: closed, organizer, itemIds, personIds: await story.personIds(), categoryIds, choices }
}

/** Runs the events in the order of their moments, the clock set to each. */
async function play(clock: ControlledClock, events: Event[], progress?: (done: number, total: number) => void): Promise<void> {
  const ordered = events.map((e) => ({ ...e, ms: Date.parse(e.at) })).sort((a, b) => a.ms - b.ms || a.order - b.order)
  for (const [index, event] of ordered.entries()) {
    // The clock never runs backwards: two events in the same minute keep their order.
    if (event.ms > clock.peek().getTime()) clock.set(new Date(event.ms))
    await event.run()
    progress?.(index + 1, ordered.length)
  }
}

function must<V>(map: ReadonlyMap<string, V>, key: string): V {
  const value = map.get(key)
  if (value === undefined) throw new Error(`nothing loaded for ${key}`)
  return value
}
