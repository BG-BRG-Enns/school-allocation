import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAMPAIGN_STATES, CATALOGUE_PROBLEM_CODES, ITEM_STATES, PERIOD_PROBLEM_CODES, PERSON_KINDS, RANKING_PROBLEM_CODES, ROSTER_PROBLEM_CODES } from '@school-allocation/school-core'
import { BATCH_STATE_LABELS, CAMPAIGN_STATE_LABELS, CATALOGUE_PROBLEM_LABELS, CHOICE_STATE_LABELS, FIELD_LABELS, ITEM_STATE_LABELS, KIND_LABELS, MAIL_KIND_LABELS, MAIL_STATE_LABELS, PERIOD_PROBLEM_LABELS, PROBLEM_LABELS, RANKING_PROBLEM_LABELS, ROLE_LABELS, SOURCE_LABELS, TEMPLATE_PROBLEM_LABELS, WINDOW_LABELS } from '../src/lib/labels.ts'

test('every code the API can send has a German label', () => {
  assert.deepEqual(Object.keys(PROBLEM_LABELS).sort(), [...ROSTER_PROBLEM_CODES].sort())
  assert.deepEqual(Object.keys(CATALOGUE_PROBLEM_LABELS).sort(), [...CATALOGUE_PROBLEM_CODES].sort())
  assert.deepEqual(Object.keys(PERIOD_PROBLEM_LABELS).sort(), [...PERIOD_PROBLEM_CODES].sort())
  assert.deepEqual(Object.keys(RANKING_PROBLEM_LABELS).sort(), [...RANKING_PROBLEM_CODES].sort())
  assert.deepEqual(Object.keys(CHOICE_STATE_LABELS).sort(), ['complete', 'incomplete', 'none'])
  assert.deepEqual(Object.keys(WINDOW_LABELS).sort(), ['first', 'late'])
  assert.deepEqual(Object.keys(MAIL_KIND_LABELS).sort(), ['choice_invitation', 'choice_reminder', 'class_missing', 'grace_invitation', 'grace_reminder', 'missed_deadline'])
  assert.deepEqual(Object.keys(MAIL_STATE_LABELS).sort(), ['failed', 'queued', 'sending', 'sent'])
  assert.deepEqual(Object.keys(TEMPLATE_PROBLEM_LABELS).sort(), ['body_syntax', 'subject_syntax', 'unknown_placeholder'])
  assert.deepEqual(Object.keys(CAMPAIGN_STATE_LABELS).sort(), [...CAMPAIGN_STATES].sort())
  assert.deepEqual(Object.keys(ITEM_STATE_LABELS).sort(), [...ITEM_STATES].sort())
  assert.deepEqual(Object.keys(KIND_LABELS).sort(), [...PERSON_KINDS].sort())
  assert.deepEqual(Object.keys(ROLE_LABELS).sort(), ['campaign_organizer', 'read_only_auditor', 'school_admin'])
  assert.deepEqual(Object.keys(SOURCE_LABELS).sort(), ['csv', 'graph:groups'])
  assert.deepEqual(Object.keys(BATCH_STATE_LABELS).sort(), ['committed', 'discarded', 'pending', 'rejected'])
  assert.deepEqual(Object.keys(FIELD_LABELS).sort(), ['className', 'classTeacherMail', 'displayName', 'grade', 'kind', 'mail'])
  for (const labels of [PROBLEM_LABELS, KIND_LABELS, ROLE_LABELS, SOURCE_LABELS, BATCH_STATE_LABELS, FIELD_LABELS, CATALOGUE_PROBLEM_LABELS, CAMPAIGN_STATE_LABELS, ITEM_STATE_LABELS, PERIOD_PROBLEM_LABELS, RANKING_PROBLEM_LABELS, CHOICE_STATE_LABELS, WINDOW_LABELS, MAIL_KIND_LABELS, MAIL_STATE_LABELS, TEMPLATE_PROBLEM_LABELS]) {
    for (const [code, label] of Object.entries(labels)) assert.ok(label.trim() !== '' && label !== code, code)
  }
})
