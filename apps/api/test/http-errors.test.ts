import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApplicationError, ChoiceInvalid, requireFound } from '../lib/errors.ts'
import { applicationFailure } from '../lib/http-errors.ts'

test('central error handling preserves the former class-teacher status overrides', () => {
  assert.deepEqual(applicationFailure(new ApplicationError('class_unknown')), { status: 404, body: { error: 'class_unknown' } })
  assert.equal(applicationFailure(new ApplicationError('teacher_unknown'))?.status, 422)
  assert.equal(applicationFailure(new ApplicationError('no_roster'))?.status, 422)
})

test('structured validation details survive translation while unexpected errors stay outside the public mapper', () => {
  const problems = [{ code: 'unknown_group' as const, group: 'missing' }]
  assert.deepEqual(applicationFailure(new ChoiceInvalid(problems)), { status: 422, body: { error: 'ranking_invalid', problems } })
  assert.equal(applicationFailure(new Error('private database details')), undefined)
  assert.throws(() => requireFound(undefined), (error: unknown) => error instanceof ApplicationError && error.code === 'not_found')
})
