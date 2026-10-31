import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkEntry, checkRoster, classNameOf, diffRoster, gradeOfClass, isClassGroupName, rosterKey, summarizeDiff, type RosterEntry } from '../src/roster.ts'

const sara: RosterEntry = { kind: 'student', mail: 'Sara.Pfnaexthuber@schule.example.org', displayName: 'Sara Pfnäxthuber', className: '5A', grade: 9 }
const tim: RosterEntry = { kind: 'student', oid: 'E0000000-0000-4000-8000-00000000000E', mail: 'tim@schule.example.org', displayName: 'Tim Gnöxwieser', className: '5A', grade: 9 }
const anna: RosterEntry = { kind: 'teacher', mail: 'anna.zwexmhofer@schule.example.org', displayName: 'Anna Zwexmhofer' }

test('the key is the object id when there is one, otherwise the address, in lower case', () => {
  assert.equal(rosterKey(sara), 'sara.pfnaexthuber@schule.example.org')
  assert.equal(rosterKey(tim), 'e0000000-0000-4000-8000-00000000000e')
  assert.equal(rosterKey({ upn: 'Bernd@schule.example.org' }), 'bernd@schule.example.org')
  assert.equal(rosterKey({ mail: 'a@b.cd', upn: 'c@d.ef' }), 'a@b.cd')
  assert.equal(rosterKey({}), undefined)
})

test('an entry is complete for its kind, and its fields are well-formed', () => {
  assert.deepEqual(checkEntry(sara), [])
  assert.deepEqual(checkEntry(anna), [])
  assert.deepEqual(checkEntry({ kind: 'student', displayName: 'X' }), [{ code: 'no_key' }, { code: 'student_without_class' }])
  assert.deepEqual(checkEntry({ ...sara, grade: undefined }), [{ code: 'student_without_class', key: rosterKey(sara) }])
  assert.deepEqual(checkEntry({ ...anna, className: '5A' }), [{ code: 'teacher_with_class', key: rosterKey(anna) }])
  assert.deepEqual(checkEntry({ ...sara, grade: 14 }).map((p) => p.code), ['invalid_grade'])
  assert.deepEqual(checkEntry({ ...sara, grade: 9.5 }).map((p) => p.code), ['invalid_grade'])
  assert.deepEqual(checkEntry({ ...sara, className: 'a class name that is far too long' }).map((p) => p.code), ['invalid_class_name'])
  assert.deepEqual(checkEntry({ ...sara, mail: 'not an address' }).map((p) => p.code), ['invalid_address'])
  assert.deepEqual(checkEntry({ ...sara, classTeacherMail: 'nope' }).map((p) => p.code), ['invalid_address'])
  // A domain needs a dot with something on both sides of it, wherever it stands among others.
  assert.deepEqual(['sara@mail.schule.example.org', 'sara@schule..example.org'].map((mail) => checkEntry({ ...sara, mail })), [[], []])
  assert.deepEqual(['sara@schule.', 'sara@.example', 'sara@..', `sara@${'.'.repeat(200)} `].map((mail) => checkEntry({ ...sara, mail }).map((p) => p.code)), [['invalid_address'], ['invalid_address'], ['invalid_address'], ['invalid_address']])
  assert.deepEqual(checkEntry({ ...sara, displayName: ' ' }).map((p) => p.code), ['invalid_name'])
  assert.deepEqual(checkEntry({ ...sara, displayName: 'a\u0000b' }).map((p) => p.code), ['invalid_name'])
  assert.deepEqual(checkEntry({ ...sara, kind: 'parent' as 'student' }).map((p) => p.code), ['invalid_kind'])
})

test('a batch with the same person twice, as a student and a teacher, or with one address on two entries is refused with the key', () => {
  assert.deepEqual(checkRoster([sara, tim, anna]), [])
  assert.deepEqual(checkRoster([sara, { ...sara, mail: sara.mail?.toLowerCase() }]), [{ code: 'duplicate_key', key: rosterKey(sara) }])
  assert.deepEqual(checkRoster([sara, { kind: 'teacher', mail: sara.mail, displayName: 'Sara' }]), [{ code: 'both_kinds', key: rosterKey(sara) }])
  // Two Graph members (distinct object ids) with the same address: the address could bind either.
  assert.deepEqual(checkRoster([tim, { ...tim, oid: 'f0000000-0000-4000-8000-00000000000f' }]), [{ code: 'duplicate_address', key: 'f0000000-0000-4000-8000-00000000000f' }])
  // Entries without a key cannot be duplicates of each other; they are refused as keyless.
  assert.deepEqual(checkRoster([{ kind: 'teacher', displayName: 'A' }, { kind: 'teacher', displayName: 'B' }]), [{ code: 'no_key' }, { code: 'no_key' }])
  // Nobody at all is not a roster either.
  assert.deepEqual(checkRoster([]), [{ code: 'empty_roster' }])
})

test('the diff says who is new, who is gone and what changed, by key and not by name; the user principal name is not roster content', () => {
  const previous = [sara, tim, anna]
  const next: RosterEntry[] = [
    { ...sara, mail: sara.mail?.toUpperCase(), displayName: 'Sara Pfnäxthuber-Neu', className: '5B', classTeacherMail: 'anna.zwexmhofer@schule.example.org' },
    { ...anna, upn: 'anna.zwexmhofer@schule.example.org' },
    { kind: 'student', mail: 'neu@schule.example.org', displayName: 'Neu Dazu', className: '5A', grade: 9 },
  ]
  const diff = diffRoster(previous, next)
  assert.deepEqual(diff.added.map((e) => e.displayName), ['Neu Dazu'])
  assert.deepEqual(diff.removed.map((e) => e.displayName), ['Tim Gnöxwieser'])
  // The case of an address is no change; the class teacher's address is one.
  assert.deepEqual(diff.changed.map((c) => [c.key, c.fields]), [
    [rosterKey(sara), ['displayName', 'className', 'classTeacherMail']],
  ])
  assert.equal(diff.unchanged, 1)
  assert.deepEqual(summarizeDiff(diff), { added: 1, removed: 1, changed: 1, unchanged: 1 })
  assert.deepEqual(summarizeDiff(diffRoster(previous, previous)), { added: 0, removed: 0, changed: 0, unchanged: 3 })
  assert.deepEqual(summarizeDiff(diffRoster([], previous)), { added: 3, removed: 0, changed: 0, unchanged: 0 })
})

test('when the source changes and the key with it, an address both entries carry says they are the same person', () => {
  // A CSV roster keyed by address, replaced by a Graph roster keyed by object id.
  const fromCsv: RosterEntry[] = [sara, anna]
  const fromGraph: RosterEntry[] = [
    { ...sara, oid: 'd0000000-0000-4000-8000-00000000000d', upn: sara.mail },
    { kind: 'teacher', oid: 'a0000000-0000-4000-8000-00000000000a', mail: 'Anna.Zwexmhofer@schule.example.org', upn: 'anna.zwexmhofer@schule.example.org', displayName: 'Anna Zwexmhofer' },
    tim,
  ]
  assert.deepEqual(summarizeDiff(diffRoster(fromCsv, fromGraph)), { added: 1, removed: 0, changed: 0, unchanged: 2 })
  assert.deepEqual(summarizeDiff(diffRoster(fromGraph, fromCsv)), { added: 0, removed: 1, changed: 0, unchanged: 2 })
  // An address two previous entries carry decides nothing.
  const twice: RosterEntry[] = [{ ...tim }, { ...tim, oid: 'f0000000-0000-4000-8000-00000000000f', displayName: 'Tim Zwei' }]
  assert.deepEqual(summarizeDiff(diffRoster(twice, [{ kind: 'student', mail: tim.mail, displayName: 'Tim', className: '5A', grade: 9 }])), { added: 1, removed: 2, changed: 0, unchanged: 0 })
  // A previous entry is the same person as at most one new entry.
  assert.deepEqual(summarizeDiff(diffRoster([sara], [{ ...sara, oid: 'd0000000-0000-4000-8000-00000000000d' }, { ...sara, oid: 'e0000000-0000-4000-8000-00000000000e' }])), { added: 1, removed: 0, changed: 0, unchanged: 1 })
  // Another object id at the same address is another person, whatever the name says.
  assert.deepEqual(summarizeDiff(diffRoster([tim], [{ ...tim, oid: 'f0000000-0000-4000-8000-00000000000f' }])), { added: 1, removed: 1, changed: 0, unchanged: 0 })
})

test('a group named after a class gives the class and a default Schulstufe to edit', () => {
  assert.equal(classNameOf('5A'), '5A')
  assert.equal(classNameOf('Klasse 5A'), '5A')
  assert.equal(classNameOf('7AB Schüler/innen'), '7AB')
  assert.equal(classNameOf('Lehrkräfte'), undefined)
  assert.equal(classNameOf('5A und 5B'), undefined, 'two classes: none chosen')
  assert.equal(classNameOf('2026'), undefined, 'a year is not a class')
  assert.ok(isClassGroupName('1B') && isClassGroupName('8AB'))
  assert.ok(!isClassGroupName('Klasse 5A') && !isClassGroupName('Lehrkräfte'))
  assert.equal(gradeOfClass('5A'), 9, 'AHS: the 5. Klasse is the 9. Schulstufe')
  assert.equal(gradeOfClass('1 B'), 5)
  assert.equal(gradeOfClass('8C'), 12)
  assert.equal(gradeOfClass('9A'), undefined, 'beyond the 8. Klasse the convention does not hold')
  assert.equal(gradeOfClass('A5'), undefined)
})
