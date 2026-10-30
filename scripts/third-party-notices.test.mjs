// The third-party notices stay true (third-party-notices/README.md for the
// app image, apps/solver/third-party-notices/README.md for the solver's):
// the versions they name are the ones the lock files install, the licence
// texts they link are there, and no production npm package is under a
// licence outside the permissive ones the app image's notice relies on. A
// bump of OR-Tools, numpy, pydantic-core or sodium-native fails here until
// the notice follows it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
const APP = 'third-party-notices/README.md'
const SOLVER = 'apps/solver/third-party-notices/README.md'
const lock = JSON.parse(read('package-lock.json'))

/** The version uv.lock pins for a package. */
function uvLocked(name) {
  const match = new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"`).exec(read('apps/solver/uv.lock'))
  assert.ok(match, `${name} in apps/solver/uv.lock`)
  return match[1]
}

test('the versions the notices name are the ones the lock files install', () => {
  const solver = read(SOLVER)
  for (const [name, label] of [['ortools', 'OR-Tools'], ['numpy', 'numpy'], ['pydantic-core', 'pydantic-core']]) {
    const version = uvLocked(name)
    assert.ok(solver.includes(`${label} ${version} `), `${SOLVER} names ${label} ${version}`)
  }
  const app = read(APP)
  const sodium = lock.packages['node_modules/sodium-native']?.version
  assert.ok(app.includes(`\`sodium-native\` ${sodium} `), `${APP} names sodium-native ${sodium}`)
  // The libsodium the binding has compiled in: the commit its build fetches.
  const commit = /fetch_package\("github:jedisct1\/libsodium#([0-9a-f]+)"/.exec(read('node_modules/sodium-native/CMakeLists.txt'))?.[1]
  assert.ok(commit !== undefined && app.includes(`\`${commit}\``), `${APP} names libsodium's commit ${commit}`)
})

test('every licence text the notices link is there', () => {
  for (const notice of [APP, SOLVER]) {
    const targets = [...read(notice).matchAll(/\]\(([\w.-]+\.txt)\)/g)].map((match) => match[1])
    assert.ok(targets.length > 0, notice)
    for (const target of targets) assert.ok(existsSync(join(root, dirname(notice), target)), `${notice} links ${target}`)
  }
})

// What the app image's notice says of its npm packages: permissive, each
// with its own licence file. The web build's bundled packages (Vue and
// vue-router) are development dependencies, held to the same.
const PERMISSIVE = new Set(['MIT', 'MIT-0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'BlueOak-1.0.0', '0BSD'])
const BUNDLED = /^node_modules\/(?:vue|vue-router|@vue\/[\w-]+)$/

test('every production npm package, and every package the web build bundles, is under a permissive licence', () => {
  const others = Object.entries(lock.packages)
    .filter(([path, entry]) => path.startsWith('node_modules/') && !entry.link && ((!entry.dev && !entry.devOptional) || BUNDLED.test(path)))
    .filter(([, entry]) => !PERMISSIVE.has(entry.license))
    .map(([path, entry]) => `${path.replace(/^(?:.*\/)?node_modules\//, '')}: ${entry.license}`)
  assert.deepEqual(others, [])
})
