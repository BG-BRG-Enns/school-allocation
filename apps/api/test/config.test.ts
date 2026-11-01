import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConfigError, loadConfig, MAX_MAIL_PER_HOUR, parseBootstrapAdmins } from '../config.ts'
import { ORIGIN, secretFile, SERVER_ENV } from './helpers/env.ts'

test('BOOTSTRAP_ADMINS takes object ids and school addresses, lower-cased and without duplicates; unset means nobody', () => {
  assert.deepEqual(parseBootstrapAdmins(undefined), [])
  assert.deepEqual(parseBootstrapAdmins(' '), [])
  assert.deepEqual(
    parseBootstrapAdmins(' Anna.Zwexmhofer@Schule.example.org, A0000000-0000-4000-8000-00000000000A ,anna.zwexmhofer@schule.example.org'),
    ['anna.zwexmhofer@schule.example.org', 'a0000000-0000-4000-8000-00000000000a'],
  )
})

test('an entry that is neither an object id nor an address is refused by name, as is a long list', () => {
  assert.throws(() => parseBootstrapAdmins('anna.zwexmhofer, b@x.org'), (err: unknown) => err instanceof ConfigError && err.message.includes('anna.zwexmhofer') && !err.message.includes('b@x.org'))
  assert.throws(() => parseBootstrapAdmins('bad entry@x.org'), ConfigError)
  for (const entry of ['anna@schule.', 'anna@.example', `anna@${'.'.repeat(200)}x y`]) assert.throws(() => parseBootstrapAdmins(entry), ConfigError, entry)
  assert.deepEqual(parseBootstrapAdmins('anna@mail.schule.example.org'), ['anna@mail.schule.example.org'])
  const many = Array.from({ length: 21 }, (_, i) => `person${i}@schule.example.org`).join(',')
  assert.throws(() => parseBootstrapAdmins(many), /at most 20/)
})

test('the server configuration carries the list, and refuses to start with a bad one among its problems', () => {
  const config = loadConfig({ ...SERVER_ENV, PUBLIC_URL: ORIGIN, BOOTSTRAP_ADMINS: 'Admin@Schule.example.org' })
  assert.deepEqual(config.bootstrapAdmins, ['admin@schule.example.org'])
  assert.throws(
    () => loadConfig({ ...SERVER_ENV, PUBLIC_URL: ORIGIN, BOOTSTRAP_ADMINS: 'nobody' }),
    (err: unknown) => err instanceof ConfigError && err.message.includes('BOOTSTRAP_ADMINS'),
  )
})

test('SOLVER_URL is an http(s) address kept without trailing slashes; unset means no solver; credentials, a query or another scheme are refused', () => {
  const solverUrl = (value: string | undefined) => loadConfig({ ...SERVER_ENV, PUBLIC_URL: ORIGIN, SOLVER_URL: value }).solverUrl
  assert.equal(solverUrl(undefined), null)
  assert.equal(solverUrl(' '), null)
  assert.equal(solverUrl('http://school-allocation-solver:8000/'), 'http://school-allocation-solver:8000')
  assert.equal(solverUrl('https://solver.example.org/allocation//'), 'https://solver.example.org/allocation')
  for (const bad of ['solver:8000', 'ftp://solver', 'http://user:pw@solver', 'http://solver/?a=1', 'http://solver/#x']) {
    assert.throws(() => solverUrl(bad), (err: unknown) => err instanceof ConfigError && err.message.includes('SOLVER_URL'), bad)
  }
})

test('MAIL_PER_HOUR is a whole number from 1 to 200, 200 when unset; without SMTP_HOST it is refused', () => {
  const smtp = { SMTP_HOST: 'smtp.example.org', SMTP_USER: 'wahl', SMTP_PASSWORD_FILE: secretFile('smtp-password', 'x\n'), MAIL_FROM: 'wahl@schule.example.org' }
  const perHour = (value: string | undefined) => loadConfig({ ...SERVER_ENV, PUBLIC_URL: ORIGIN, ...smtp, MAIL_PER_HOUR: value }).mail?.perHour
  assert.equal(perHour(undefined), MAX_MAIL_PER_HOUR)
  assert.equal(perHour(' '), MAX_MAIL_PER_HOUR)
  assert.equal(perHour('60'), 60)
  assert.equal(perHour('1'), 1)
  for (const bad of ['0', '201', '1.5', '-5', '1e2', '0x10', 'fast']) {
    assert.throws(() => perHour(bad), (err: unknown) => err instanceof ConfigError && err.message.includes('MAIL_PER_HOUR'), bad)
  }
  assert.throws(
    () => loadConfig({ ...SERVER_ENV, PUBLIC_URL: ORIGIN, MAIL_PER_HOUR: '100' }),
    (err: unknown) => err instanceof ConfigError && err.message.includes('MAIL_PER_HOUR is set but SMTP_HOST is not'),
  )
})
