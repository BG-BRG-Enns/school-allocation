import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArgs, releaseNotes } from './release-notes.mjs'

const images = {
  app: 'ghcr.io/bg-brg-enns/school-allocation:v1.2.0@sha256:aaaa',
  postgres: 'ghcr.io/bg-brg-enns/school-allocation-postgres:v1.2.0@sha256:bbbb',
  solver: 'ghcr.io/bg-brg-enns/school-allocation-solver:v1.2.0@sha256:cccc',
}
const base = {
  tag: 'v1.2.0',
  previous: 'v1.1.0',
  images,
  line: 'v1',
  lineMoved: true,
  lineCurrent: '',
  schemaVersion: 1,
  previousSchemaVersion: 1,
  handbookUrl: 'https://bg-brg-enns.github.io/school-allocation/',
  repositoryUrl: 'https://github.com/BG-BRG-Enns/school-allocation',
}

test('a release on the line: the three images, the nightly pickup, the schema unchanged, the verify line, the handbook', () => {
  const notes = releaseNotes(base)
  assert.match(notes, /^## What a host pulls\n\n```\n.*school-allocation:v1\.2\.0@sha256:aaaa\n.*-postgres:v1\.2\.0@sha256:bbbb\n.*-solver:v1\.2\.0@sha256:cccc\n```\n/)
  assert.match(notes, /Deployments following the `v1` line pick this release up with their next nightly update\./)
  assert.match(notes, /Built for schema version 1, unchanged since v1\.1\.0\./)
  assert.match(notes, /cosign verify --key deploy\/cosign\.pub ghcr\.io\/bg-brg-enns\/school-allocation:v1\.2\.0@sha256:aaaa/)
  assert.match(notes, /blob\/v1\.2\.0\/deploy\/cosign\.pub/)
  assert.match(notes, /<https:\/\/bg-brg-enns\.github\.io\/school-allocation\/>, built from this release\./)
  assert.doesNotMatch(notes, /raised|stays|first release/)
})

test('a raised schema version says that the way back is the backup, with the guide\'s section at the tag', () => {
  const notes = releaseNotes({ ...base, schemaVersion: 2 })
  assert.match(notes, /Built for schema version 2, raised from 1 \(v1\.1\.0\): an earlier release does not start on a database v1\.2\.0 migrated\. The way back is the backup taken before the update \(\[Updates\]\(https:\/\/github\.com\/BG-BRG-Enns\/school-allocation\/blob\/v1\.2\.0\/deploy\/README\.md#updates\)\)\./)
})

test('the first release has no previous one to compare with', () => {
  const notes = releaseNotes({ ...base, previous: '', previousSchemaVersion: undefined })
  assert.match(notes, /Built for schema version 1: the first release\./)
})

test('a line that stayed on a newer release says so and points at pinning', () => {
  const notes = releaseNotes({ ...base, tag: 'v1.0.1', lineMoved: false, lineCurrent: 'v1.2.0' })
  assert.match(notes, /The `v1` line stays on v1\.2\.0, which is newer; a host runs this release only \[pinned\]\(https:\/\/github\.com\/BG-BRG-Enns\/school-allocation\/blob\/v1\.0\.1\/deploy\/README\.md#pinning-a-release\)\./)
  assert.doesNotMatch(notes, /nightly/)
})

const argv = [
  '--tag=v1.2.0', '--previous=v1.1.0', `--app=${images.app}`, `--postgres=${images.postgres}`, `--solver=${images.solver}`,
  '--line=v1', '--line-moved=yes', '--line-current=', '--schema-version=1', '--previous-schema-version=1',
  '--handbook=https://bg-brg-enns.github.io/school-allocation/', '--repository=https://github.com/BG-BRG-Enns/school-allocation',
]

test('the command line names every value once; numbers become numbers, an empty previous version becomes none', () => {
  assert.deepEqual(parseArgs(argv), base)
  assert.deepEqual(parseArgs(argv.map((arg) => (arg === '--previous=v1.1.0' ? '--previous=' : arg === '--previous-schema-version=1' ? '--previous-schema-version=' : arg))), { ...base, previous: '', previousSchemaVersion: undefined })
})

test('a missing, repeated, unknown or malformed argument is refused with its name', () => {
  assert.throws(() => parseArgs(argv.filter((arg) => !arg.startsWith('--solver='))), /Missing: --solver/)
  assert.throws(() => parseArgs([...argv, '--tag=v9.9.9']), /Given twice: --tag/)
  assert.throws(() => parseArgs([...argv, '--latest=yes']), /Unexpected argument: --latest=yes/)
  assert.throws(() => parseArgs([...argv, 'v1.2.0']), /Unexpected argument: v1\.2\.0/)
  assert.throws(() => parseArgs(argv.map((arg) => (arg === '--line-moved=yes' ? '--line-moved=maybe' : arg))), /yes or no/)
  assert.throws(() => parseArgs(argv.map((arg) => (arg === '--schema-version=1' ? '--schema-version=one' : arg))), /must be a number/)
  assert.throws(() => parseArgs(argv.map((arg) => (arg === '--line-moved=yes' ? '--line-moved=no' : arg))), /--line-current names the release/)
})
