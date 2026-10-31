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
// The caller owns the database, the clock and the stand-in (simulate.ts,
// or a harness): they are passed in, as the API tests pass them to the app.

import { actorOf, type Caller } from '../../apps/api/lib/actor.ts'
import { loadCaller } from '../../apps/api/lib/auth.ts'
import type { Database } from '../../apps/api/lib/db.ts'
import type { Campaign } from '../../apps/api/lib/models/campaigns.ts'
import type { WindowContext } from '../../apps/api/lib/models/window.ts'
import { grantRole } from '../../apps/api/services/admin-users.ts'
import { createCampaign, requireCampaign, transitionCampaign, updateCampaign } from '../../apps/api/services/campaigns.ts'
import { itemInput } from '../../apps/api/services/catalogue-input.ts'
import { createCategory } from '../../apps/api/services/categories.ts'
import { callerStudent, choiceView, saveRanking } from '../../apps/api/services/choices.ts'
import { replaceClassTeachers } from '../../apps/api/services/class-teachers.ts'
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

/** How far the story is told: the catalogue taking proposals, published, the window open, or closed with every list in. */
export type Stage = 'catalogue' | 'published' | 'open' | 'closed'

export interface LoadOptions {
  until?: Stage
  /** Students whose lists are left to someone else (a journey). */
  skipChoicesOf?: ReadonlySet<string>
  log?: (message: string) => void
}

export interface ChoiceOutcome {
  plan: ChoicePlan
  saves: number
  complete: boolean
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

export async function loadScenario(world: ScenarioWorld, s: Scenario, options: LoadOptions = {}): Promise<Loaded> {
  const { db, clock, context } = world
  const until = options.until ?? 'closed'
  const log = options.log ?? (() => {})
  const everyone = new Map<string, ScenarioPerson>([...s.classes.flatMap((c) => c.students), ...s.teachers].map((p) => [p.oid, p]))
  const callers = new Map<string, Caller>()
  const signIn = async (oid: string, fresh = false): Promise<Caller> => {
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

  // Monday 7 November 2033: the administrator labels the groups, imports and commits the roster.
  clock.set(new Date(STORY.starts))
  const admin = await signIn(s.admin)
  world.graph.groups.clear()
  world.graph.names.clear()
  for (const c of [...s.classes, ...s.leavers]) {
    world.graph.groups.set(c.groupId, c.students.map((p) => memberOf(p)))
    world.graph.names.set(c.groupId, c.groupName)
  }
  world.graph.groups.set(s.teachersGroup.groupId, s.teachers.map((p) => memberOf(p)))
  world.graph.names.set(s.teachersGroup.groupId, s.teachersGroup.groupName)
  await replaceGroups(db, [
    ...s.classes.map((c) => ({ groupId: c.groupId, label: c.groupName, kind: 'student' as const, className: c.name, grade: c.grade })),
    { groupId: s.teachersGroup.groupId, label: s.teachersGroup.groupName, kind: 'teacher' as const },
  ], actorOf(admin))
  const batch = await importGraphRoster(db, world.graph.baseUrl, world.accessToken, s.schoolYear, admin.id)
  if (batch.state !== 'pending') throw new Error(`the roster import is ${batch.state}: ${JSON.stringify(batch.problems.slice(0, 3))}`)
  const committed = await commitBatch(db, batch.id, actorOf(admin), world.tenantId)
  const personIds = new Map(committed.diff.added.filter((e) => e.oid && e.personId).map((e) => [e.oid as string, e.personId as string]))
  log(`roster: ${committed.diff.added.length} people`)
  const anna = await signIn(s.admin, true)
  for (const c of s.classes) {
    if (c.classTeacher !== null) await replaceClassTeachers(db, c.name, [must(personIds, c.classTeacher)], actorOf(anna))
  }
  const organizerUser = await signIn(s.organizer)
  await grantRole(db, organizerUser.id, 'campaign_organizer', 'Organisation der Projekttage', actorOf(anna))
  const organizer = await signIn(s.organizer, true)
  const categoryIds = new Map<string, string>()
  for (const name of s.categories) {
    const { categories } = await createCategory(db, name, actorOf(anna))
    const made = categories.find((c) => c.name === name)
    if (!made) throw new Error(`the category ${name} was not created`)
    categoryIds.set(name, made.id)
  }

  // The organizer sets up the registration and opens it for proposals.
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

  // Until mid-February: availability, proposals, approvals, each at its moment.
  const itemIds = new Map<string, string>()
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
        teachers: item.teachers.map((oid) => must(personIds, oid)),
        // The project days are in July: Vienna's summer time.
        sessions: item.sessions.map((x) => ({ startsAt: `${x.date}T${x.from}:00+02:00`, endsAt: `${x.date}T${x.to}:00+02:00`, credits: [{ date: x.date, minutes: x.minutes }] })),
        categories: item.categories.map((name) => must(categoryIds, name)),
      }
      const made = await createItem(db, created.id, itemInput(body, lead, true), lead)
      await proposeItem(db, made.id, lead)
      itemIds.set(item.key, made.id)
    } })
    events.push({ at: item.approvedAt, order: 2, run: async () => {
      await approveItem(db, must(itemIds, item.key), organizer)
    } })
  }
  await play(clock, events)
  log(`catalogue: ${itemIds.size} activities proposed and approved`)
  if (until === 'catalogue') return { campaign: await requireCampaign(db, created.id), organizer, itemIds, personIds, categoryIds, choices: new Map() }

  // Monday 27 February: published. Monday 6 March, 08:00: the clock opens the window.
  clock.set(new Date(STORY.published))
  await transitionCampaign(db, created.id, 'published', actorOf(organizer), context)
  if (until === 'published') return { campaign: await requireCampaign(db, created.id), organizer, itemIds, personIds, categoryIds, choices: new Map() }
  clock.set(new Date(STORY.opens))
  await tick(db, context, db.now())
  const campaign = await requireCampaign(db, created.id)
  if (campaign.state !== 'open') throw new Error(`the window did not open: ${campaign.state}`)
  if (until === 'open') return { campaign, organizer, itemIds, personIds, categoryIds, choices: new Map() }

  // The two windows: every student's save at its moment, the clock's tick each morning and at each close.
  const keyOf = new Map([...itemIds].map(([key, id]) => [id, key]))
  const choices = new Map<string, ChoiceOutcome>()
  const saves: Event[] = []
  for (const choice of s.choices) {
    if (choice.saveAt === null || options.skipChoicesOf?.has(choice.oid)) {
      choices.set(choice.oid, { plan: choice.plan, saves: 0, complete: false })
      continue
    }
    saves.push({ at: choice.saveAt, order: 1, run: async () => {
      const caller = await signIn(choice.oid)
      const student = await callerStudent(db, campaign, caller)
      const view = await choiceView(db, campaign, student)
      const taste = s.preferences[choice.oid] ?? {}
      const wanted = (id: string) => taste[keyOf.get(id) ?? ''] ?? 0
      const ranking: Record<string, string[]> = {}
      for (const group of view.groups) ranking[group.key] = [...group.itemIds].sort((a, b) => wanted(b) - wanted(a) || a.localeCompare(b, 'en')).slice(0, view.cap)
      if (choice.plan === 'incomplete') {
        // Saved, but one group left short: the last one asking for anything.
        const last = view.groups.findLast((g) => g.required > 0)
        if (last) ranking[last.key] = (ranking[last.key] ?? []).slice(0, last.required - 1)
      }
      let saved = await saveRanking(db, campaign, student.personId, ranking, { caller })
      let count = 1
      // The page says what a rule still asks; the student puts a fitting activity in place of their least wanted wish.
      while (choice.plan !== 'incomplete' && !saved.complete && count < 4) {
        const open = saved.rules.find((r) => !r.done)
        const fix = open && saved.groups.flatMap((g) => g.items.filter((i) => i.categoryIds.includes(open.categoryId) && !(ranking[g.key] ?? []).includes(i.id)).map((i) => ({ group: g.key, id: i.id })))
          .sort((a, b) => wanted(b.id) - wanted(a.id))[0]
        if (!fix) break
        const list = ranking[fix.group] ?? []
        ranking[fix.group] = list.length < view.cap ? [...list, fix.id] : [...list.slice(0, -1), fix.id]
        saved = await saveRanking(db, campaign, student.personId, ranking, { caller })
        count++
      }
      choices.set(choice.oid, { plan: choice.plan, saves: count, complete: saved.complete })
    } })
  }
  for (let ms = Date.parse(STORY.opens) + 86_400_000; ms < Date.parse(STORY.lateUntil); ms += 86_400_000) {
    saves.push({ at: new Date(ms).toISOString(), order: 0, run: async () => {
      await tick(db, context, db.now())
    } })
  }
  for (const end of [STORY.closes, STORY.lateUntil]) {
    saves.push({ at: new Date(Date.parse(end) + 60_000).toISOString(), order: 0, run: async () => {
      await tick(db, context, db.now())
    } })
  }
  await play(clock, saves, (done, total) => {
    if (done % 100 === 0) log(`choices: ${done} of ${total} moments`)
  })
  const closed = await requireCampaign(db, created.id)
  if (closed.state !== 'closed') throw new Error(`the window did not close: ${closed.state}`)
  log(`window closed: ${[...choices.values()].filter((x) => x.saves > 0).length} lists saved`)
  return { campaign: closed, organizer, itemIds, personIds, categoryIds, choices }
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
