// The handbooks (handbook/) stay whole without building the site, which
// only release tags do (.github/workflows/handbook.yml): every page of
// handbook/.vitepress/pages.ts exists in German and in English and no
// other page does; a page shows only pictures of its own language, each
// one the journeys take (`picture` in e2e/specs, npm run handbook:shots),
// and every picture they take is shown in both languages; the app's help
// link opens a page that exists. The pictures themselves are not
// committed yet: the site's build fails on a missing one.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HANDBOOKS } from '../handbook/.vitepress/pages.ts'
import { HANDBOOK_URL, handbookLink } from '../apps/web/src/lib/handbook.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const site = join(root, 'handbook')
const LANGUAGES = [['de', ''], ['en', 'en/']]

/** Every Markdown file under `dir`, as a path relative to the site; node_modules and .vitepress left out. */
function pages(dir = site) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'public') return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return pages(path)
    return entry.name.endsWith('.md') ? [relative(site, path)] : []
  })
}

/** The pictures a page shows: `/bilder/<language>/<name>.png`. */
function picturesOf(page) {
  return [...readFileSync(join(site, page), 'utf8').matchAll(/\/bilder\/([\w-]+)\/([\w-]+)\.png/g)].map(([, language, name]) => ({ language, name }))
}

const expected = LANGUAGES.flatMap(([, prefix]) => [`${prefix}index.md`, ...HANDBOOKS.flatMap((handbook) => handbook.pages.map(([file]) => `${prefix}${handbook.folder}/${file === '' ? 'index' : file}.md`))])

test('every page of the handbooks exists in German and in English, and no other page does', () => {
  assert.deepEqual(pages().sort(), [...expected].sort())
})

/** The pictures the journeys take: `picture(page, '<name>'` in e2e/specs. */
function taken() {
  return new Set(readdirSync(join(root, 'e2e', 'specs')).flatMap((spec) => [...readFileSync(join(root, 'e2e', 'specs', spec), 'utf8').matchAll(/picture\(page, '([\w-]+)'/g)].map((match) => match[1])))
}

test('a page shows pictures of its own language, each one a journey takes', () => {
  const names = taken()
  for (const page of pages()) {
    const language = page.startsWith('en/') ? 'en' : 'de'
    for (const picture of picturesOf(page)) {
      assert.equal(picture.language, language, `${page} shows /bilder/${picture.language}/${picture.name}.png`)
      assert.ok(names.has(picture.name), `${page}: no journey takes /bilder/${language}/${picture.name}.png`)
    }
  }
})

test('every picture a journey takes is shown in both languages', () => {
  const names = taken()
  for (const [language] of LANGUAGES) {
    const shown = new Set(pages().filter((page) => page.startsWith('en/') === (language === 'en')).flatMap((page) => picturesOf(page).map((picture) => picture.name)))
    assert.deepEqual([...names].filter((name) => !shown.has(name)).sort(), [], `pictures the journeys take that no ${language} page shows`)
  }
})

test('the app\'s help link opens a page of the handbooks', () => {
  const people = [
    { roles: ['school_admin'], person: null },
    { roles: ['campaign_organizer'], person: null },
    { roles: [], person: { id: 'p', kind: 'teacher', className: null, grade: null } },
    { roles: ['read_only_auditor'], person: null },
  ]
  for (const locale of ['de', 'de-formal', 'en']) {
    for (const me of people) {
      const link = handbookLink(me, locale)
      assert.ok(link?.startsWith(HANDBOOK_URL), link)
      const page = `${link.slice(HANDBOOK_URL.length)}index.md`
      assert.ok(existsSync(join(site, page)), `${link} → handbook/${page}`)
    }
  }
})
