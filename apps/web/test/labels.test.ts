import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PERSON_KINDS, ROSTER_PROBLEM_CODES } from '@school-allocation/school-core'
import { BATCH_STATE_LABELS, FIELD_LABELS, KIND_LABELS, PROBLEM_LABELS, ROLE_LABELS, SOURCE_LABELS } from '../src/lib/labels.ts'

test('every code the API can send has a German label', () => {
  assert.deepEqual(Object.keys(PROBLEM_LABELS).sort(), [...ROSTER_PROBLEM_CODES].sort())
  assert.deepEqual(Object.keys(KIND_LABELS).sort(), [...PERSON_KINDS].sort())
  assert.deepEqual(Object.keys(ROLE_LABELS).sort(), ['campaign_organizer', 'read_only_auditor', 'school_admin'])
  assert.deepEqual(Object.keys(SOURCE_LABELS).sort(), ['csv', 'graph:groups'])
  assert.deepEqual(Object.keys(BATCH_STATE_LABELS).sort(), ['committed', 'discarded', 'pending', 'rejected'])
  assert.deepEqual(Object.keys(FIELD_LABELS).sort(), ['className', 'classTeacherMail', 'displayName', 'grade', 'kind', 'mail'])
  for (const labels of [PROBLEM_LABELS, KIND_LABELS, ROLE_LABELS, SOURCE_LABELS, BATCH_STATE_LABELS, FIELD_LABELS]) {
    for (const [code, label] of Object.entries(labels)) assert.ok(label.trim() !== '' && label !== code, code)
  }
})
