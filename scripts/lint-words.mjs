#!/usr/bin/env node
// Fail the build when a German text uses a word the school's texts do
// without. The list is short and deliberate: "brauchen" in every form
// (braucht, brauchst, gebraucht, unbrauchbar) was taken out of the user
// interface, the handbook and the scenario's catalogue on purpose, and
// a new sentence slips it back in easily.
//
// Checked: the German message catalogues, the German handbook (not
// handbook/en), and the scenario's German catalogue texts.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

/** A word's stem, matched anywhere in a word, either case. */
export const BANNED = [/brauch/i]

/** The files checked, relative to the repository root: single files and directories walked for .md and .ts. */
export const SCOPE = [
  'packages/messages/src/de.ts',
  'packages/messages/src/de-formal.ts',
  'e2e/scenario/school.ts',
  'handbook/index.md',
  'handbook/organisation',
  'handbook/verwaltung',
  'handbook/lehrkraefte',
]

/** The lines of `text` with a banned word: line number and the line, trimmed. */
export function offending(text) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    if (BANNED.some((re) => re.test(line))) hits.push({ line: i + 1, text: line.trim() })
  })
  return hits
}

function* files(path) {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path).sort()) if (/\.(md|ts)$/.test(name) || statSync(join(path, name)).isDirectory()) yield* files(join(path, name))
  } else yield path
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0
  for (const entry of SCOPE) {
    for (const file of files(join(root, entry))) {
      for (const hit of offending(readFileSync(file, 'utf8'))) {
        count++
        console.error(`${relative(root, file)}:${hit.line}: ${hit.text}`)
      }
    }
  }
  if (count > 0) {
    console.error(`${count} line(s) use a word the German texts do without (scripts/lint-words.mjs)`)
    process.exit(1)
  }
}
