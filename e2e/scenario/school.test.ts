// The scenario as generated, without a database: the school the plan
// describes, the same for the same seed.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeTarget } from '@school-allocation/school-core'
import { ANNA, BERND, CARLA, PERSONAS, SARA, TIM } from '../../apps/api/test/helpers/personas.ts'
import { inEnglish } from './english.ts'
import { FAMILY_NAMES } from './names.ts'
import { DOMAIN, PROJECT_DAYS, SHORT_GRADE_DAY, STORY, scenario, scenarioDemand, studentsOf, targetOf } from './school.ts'

const s = scenario()

test('the same seed gives the same school, another seed another', () => {
  assert.deepEqual(scenario(), s)
  const names = (x: typeof s) => studentsOf(x).map((st) => st.person.name)
  assert.notDeepEqual(names(scenario(s.seed + 1)), names(s))
})

test('600 students in the 25 classes of the plan; 8A and 8B only in the tenant', () => {
  const sizes = Object.fromEntries(s.classes.map((c) => [c.name, c.students.length]))
  assert.deepEqual(sizes, {
    '1A': 24, '1B': 24, '1C': 24, '1D': 24, '1E': 24, '2A': 25, '2B': 25, '2C': 25, '2D': 25,
    '3A': 23, '3B': 23, '3C': 23, '3D': 23, '3E': 23, '4A': 24, '4B': 24, '4C': 24, '4D': 24,
    '5A': 26, '5B': 26, '6A': 25, '6B': 25, '7A': 23, '7B': 22, '7G': 22,
  })
  assert.equal(studentsOf(s).length, 600)
  assert.deepEqual(s.leavers.map((c) => [c.name, c.grade, c.students.length, c.classTeacher]), [['8A', 12, 18, null], ['8B', 12, 18, null]])
})

test('60 teachers, a class teacher for every class, Bernd for 5A; the organizer is no class teacher; Anna administers', () => {
  assert.equal(s.teachers.length, 60)
  const classTeachers = s.classes.map((c) => c.classTeacher)
  assert.equal(new Set(classTeachers).size, 25)
  assert.ok(classTeachers.every((oid) => s.teachers.some((t) => t.oid === oid)))
  assert.equal(s.classes.find((c) => c.name === '5A')?.classTeacher, BERND.oid)
  assert.ok(!classTeachers.includes(s.organizer) && s.teachers.some((t) => t.oid === s.organizer))
  assert.equal(s.admin, ANNA.oid)
})

test('the test people are part of the school, Sara and Tim in 5A, each with a family name from the list', () => {
  const fiveA = s.classes.find((c) => c.name === '5A')?.students.map((p) => p.oid) ?? []
  assert.ok(fiveA.includes(SARA.oid) && fiveA.includes(TIM.oid))
  for (const persona of PERSONAS) {
    assert.ok((FAMILY_NAMES as readonly string[]).includes(persona.name.split(' ').slice(1).join(' ')), persona.name)
    const everyone = [...studentsOf(s).map((st) => st.person), ...s.teachers]
    assert.equal(everyone.find((p) => p.oid === persona.oid)?.email, persona.email)
  }
})

test('every full name and address once; addresses in plain letters; some names with an umlaut, an accent or ß', () => {
  const everyone = [...studentsOf(s).map((st) => st.person), ...s.teachers, ...s.leavers.flatMap((c) => c.students)]
  assert.equal(new Set(everyone.map((p) => p.name)).size, everyone.length)
  assert.equal(new Set(everyone.map((p) => p.email)).size, everyone.length)
  assert.equal(new Set(everyone.map((p) => p.oid)).size, everyone.length)
  assert.ok(everyone.every((p) => /^[a-z0-9.-]+$/.test(p.email.slice(0, p.email.indexOf('@'))) && p.email.slice(p.email.indexOf('@') + 1) === DOMAIN), 'ASCII addresses')
  assert.ok(everyone.every((p) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(p.oid) || PERSONAS.some((x) => x.oid === p.oid)))
  assert.ok(everyone.some((p) => /[äöü]/.test(p.name)))
  assert.ok(everyone.some((p) => /ß/.test(p.name)))
  assert.ok(everyone.some((p) => /[éë]/.test(p.name)))
})

/** Every teacher of every activity is available and in nothing else that day, and a class activity's class teachers lead it. */
function assertStaffing(school: ReturnType<typeof scenario>): void {
  const onDay = new Map<string, string>()
  for (const item of school.items) {
    const dates = [...new Set(item.sessions.map((x) => x.date))]
    for (const oid of item.teachers) {
      const teacher = school.teachers.find((t) => t.oid === oid)
      assert.ok(teacher, `${item.key}: ${oid}`)
      for (const d of dates) {
        assert.equal(teacher.availability[d], undefined, `${school.seed}, ${item.key}: ${teacher.name} is not available on ${d}`)
        assert.equal(onDay.get(`${oid}:${d}`), undefined, `${school.seed}: ${teacher.name} is in ${onDay.get(`${oid}:${d}`)} and ${item.key} on ${d}`)
        onDay.set(`${oid}:${d}`, item.key)
      }
    }
    for (const className of item.fixedClasses) assert.ok(item.teachers.includes(school.classes.find((c) => c.name === className)?.classTeacher ?? ''), item.key)
  }
}

test('about 65 activities; leads free on their days; nobody in two at once; a class activity led by its class teacher', () => {
  assert.ok(s.items.length >= 60 && s.items.length <= 70, `${s.items.length} activities`)
  assert.equal(new Set(s.items.map((i) => i.key)).size, s.items.length)
  assertStaffing(s)
  for (const item of s.items) {
    assert.ok(item.proposedAt < STORY.proposalsEnd && item.proposedAt >= STORY.starts.slice(0, 10), item.key)
    assert.ok(item.approvedAt > item.proposedAt && item.approvedAt < STORY.published, item.key)
  }
})

test('other seeds staff their activities as soundly: a companion drawn early is never a class teacher led later that day', () => {
  // 20331113 drew 1C's museum companion as 1D's cave lead, both Tuesday morning, before the leads were reserved first.
  for (const seed of [20331108, 20331109, 20331110, 20331111, 20331112, 20331113, 20331114, 20331115, 20331116]) assertStaffing(scenario(seed))
})

test('the test people lead nothing of the school\'s, and no title shares a word with the journeys\' climbing', () => {
  const cast = new Set([ANNA.oid, BERND.oid, CARLA.oid])
  for (const item of s.items) assert.ok(!item.teachers.some((oid) => cast.has(oid)), item.key)
  for (const school of [s, inEnglish(s)]) {
    assert.equal(new Set(school.items.map((i) => i.title)).size, school.items.length)
    assert.deepEqual(school.items.filter((i) => /kletter|climb/i.test(i.title)).map((i) => i.title), [])
  }
})

test('in English every activity, place, fee note and category has its text, and everything else is as drawn', () => {
  const english = inEnglish(s)
  assert.deepEqual(english.items.map((i) => [i.key, i.places, i.sessions, i.teachers]), s.items.map((i) => [i.key, i.places, i.sessions, i.teachers]))
  assert.deepEqual(english.choices, s.choices)
  assert.equal(new Set(english.categories).size, s.categories.length)
  for (const item of english.items) assert.ok(item.categories.every((c) => english.categories.includes(c)), item.key)
  assert.ok(english.campaign.rules.every((r) => english.categories.includes(r.category)))
  assert.ok(!english.items.some((i) => /[äöüß]/i.test(`${i.title} ${i.description} ${i.location} ${i.feeNote}`)))
})

test('no two activities in one room at once, but the meeting point at the main entrance', () => {
  const sessions = s.items.flatMap((i) => i.sessions.map((x) => ({ key: i.key, location: i.location, ...x })))
  for (const a of sessions) {
    for (const b of sessions) {
      if (a.key >= b.key || a.location !== b.location || a.location === 'Treffpunkt Haupteingang' || a.date !== b.date) continue
      assert.ok(a.to <= b.from || b.to <= a.from, `${a.key} and ${b.key} in ${a.location}`)
    }
  }
})

test('every grade-day is offered its target by the demand arithmetic, but grade 11 on Wednesday: short of the target, not of places', () => {
  const short: string[] = []
  for (const day of scenarioDemand(s.classes, s.items)) {
    for (const g of day.grades) {
      assert.ok(g.offered >= targetOf(g.grade, day.date, g.needing), `grade ${g.grade} on ${day.date}: ${g.offered} of ${targetOf(g.grade, day.date, g.needing)}`)
      if (g.offered < placeTarget(g.needing, s.campaign.placeHeadroomPercent)) short.push(`${g.grade}@${day.date}`)
      assert.ok(g.offered >= g.needing)
    }
  }
  assert.deepEqual(short, [`${SHORT_GRADE_DAY.grade}@${SHORT_GRADE_DAY.date}`])
  assert.deepEqual(s.projectDays, PROJECT_DAYS)
})

test('85% save on time, 8% in the grace week, 5% leave their list incomplete, 2% never save; each in its window', () => {
  const count = (plan: string) => s.choices.filter((c) => c.plan === plan).length
  assert.deepEqual([count('first'), count('late'), count('incomplete'), count('never')], [510, 48, 30, 12])
  for (const c of s.choices) {
    if (c.plan === 'never') assert.equal(c.saveAt, null)
    const at = Date.parse(c.saveAt ?? '')
    if (c.plan === 'first' || c.plan === 'incomplete') assert.ok(at >= Date.parse(STORY.opens) && at < Date.parse(STORY.closes), `${c.oid} at ${c.saveAt}`)
    if (c.plan === 'late') assert.ok(at > Date.parse(STORY.closes) && at < Date.parse(STORY.lateUntil), `${c.oid} at ${c.saveAt}`)
  }
  assert.equal(s.choices.find((c) => c.oid === SARA.oid)?.plan, 'first')
  assert.equal(s.choices.find((c) => c.oid === TIM.oid)?.plan, 'first')
})
