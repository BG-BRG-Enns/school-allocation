import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, ERROR_MESSAGES, errorMessage, isTransient, loginUrl, ownPath, problemOf, signInUrl } from '../src/lib/api-rules.ts'
import { pageTitle } from '../src/lib/page-title.ts'

test('only a path of this app is a return path; anything else becomes the start page', () => {
  assert.equal(ownPath('/konto'), '/konto')
  assert.equal(ownPath('/wahl/konto?x=1'), '/wahl/konto?x=1')
  assert.equal(ownPath('//evil.example.org/x'), '/')
  assert.equal(ownPath('https://evil.example.org/'), '/')
  assert.equal(ownPath(''), '/')
  assert.equal(signInUrl('/wahl/konto'), '/anmelden?returnTo=%2Fwahl%2Fkonto')
  assert.equal(loginUrl('//x'), '/api/auth/login?returnTo=%2F')
})

test('a refusal keeps the API\'s code and message; an unknown or empty body is a general failure', () => {
  const refusal = problemOf(403, { error: 'forbidden' })
  assert.equal(refusal.code, 'forbidden')
  assert.equal(errorMessage(refusal), ERROR_MESSAGES.forbidden)
  assert.equal(problemOf(400, { error: 'FST_ERR_VALIDATION', message: 'body/title must be string' }).message, 'body/title must be string')
  assert.equal(problemOf(502, 'not json').code, 'request_failed')
  assert.equal(errorMessage(new Error('network')), ERROR_MESSAGES.request_failed)
})

test('a connection failure or a 5xx may be retried unchanged; a refusal may not', () => {
  assert.equal(isTransient(new TypeError('failed to fetch')), true)
  assert.equal(isTransient(new ApiError(503, 'internal_error')), true)
  assert.equal(isTransient(new ApiError(409, 'invalid_transition')), false)
})

test('the page title names the page and the app', () => {
  assert.equal(pageTitle('Anmeldung'), 'Anmeldung – SchulWahl')
  assert.equal(pageTitle(''), 'SchulWahl')
})
