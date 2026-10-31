import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HANDBOOK_URL, handbookLink } from '../src/lib/handbook.ts'

/** The roster person behind an account, as the session names it. */
function person(kind: 'teacher' | 'student') {
  return kind === 'student' ? { id: 'p', kind, className: '5A', grade: 9 } : { id: 'p', kind, className: null, grade: null }
}

test('the help link opens the handbook of the person\'s role, the administration\'s before the organisation\'s before the teachers\'', () => {
  assert.equal(handbookLink({ roles: ['school_admin', 'campaign_organizer'], person: person('teacher') }, 'de'), `${HANDBOOK_URL}verwaltung/`)
  assert.equal(handbookLink({ roles: ['campaign_organizer'], person: person('teacher') }, 'de'), `${HANDBOOK_URL}organisation/`)
  assert.equal(handbookLink({ roles: [], person: person('teacher') }, 'de'), `${HANDBOOK_URL}lehrkraefte/`)
})

test('the start page for the rest of the staff side, nothing for a student', () => {
  assert.equal(handbookLink({ roles: ['read_only_auditor'], person: null }, 'de'), HANDBOOK_URL)
  assert.equal(handbookLink({ roles: [], person: null }, 'de'), HANDBOOK_URL)
  assert.equal(handbookLink({ roles: [], person: person('student') }, 'de'), undefined)
})

test('English opens the English handbook; formal German reads the German one', () => {
  assert.equal(handbookLink({ roles: ['school_admin'], person: null }, 'en'), `${HANDBOOK_URL}en/verwaltung/`)
  assert.equal(handbookLink({ roles: [], person: person('teacher') }, 'de-formal'), `${HANDBOOK_URL}lehrkraefte/`)
  assert.equal(handbookLink({ roles: [], person: null }, 'en'), `${HANDBOOK_URL}en/`)
})
