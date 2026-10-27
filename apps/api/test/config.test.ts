import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConfigError, loadConfig, parseBootstrapAdmins } from '../config.ts'
import { ORIGIN, SERVER_ENV } from './helpers/env.ts'

test('BOOTSTRAP_ADMINS takes object ids and school addresses, lower-cased and without duplicates; unset means nobody', () => {
  assert.deepEqual(parseBootstrapAdmins(undefined), [])
  assert.deepEqual(parseBootstrapAdmins(' '), [])
  assert.deepEqual(
    parseBootstrapAdmins(' Anna.Lehrerin@Schule.example.org, A0000000-0000-4000-8000-00000000000A ,anna.lehrerin@schule.example.org'),
    ['anna.lehrerin@schule.example.org', 'a0000000-0000-4000-8000-00000000000a'],
  )
})

test('an entry that is neither an object id nor an address is refused by name, as is a long list', () => {
  assert.throws(() => parseBootstrapAdmins('anna.lehrerin, b@x.org'), (err: unknown) => err instanceof ConfigError && err.message.includes('anna.lehrerin') && !err.message.includes('b@x.org'))
  assert.throws(() => parseBootstrapAdmins('bad entry@x.org'), ConfigError)
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
