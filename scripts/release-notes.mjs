#!/usr/bin/env node
// The head of a release's notes, written by the publish workflow once the
// release's images are verified and tagged (.github/workflows/publish-image.yml,
// the `release` job): what a host pulls, with the digests; whether the line
// moved; the schema version the release was built for and whether it rose,
// which decides whether an earlier release can run on the database again;
// how to verify an image; where the handbook is. GitHub's generated notes
// (the pull requests merged since the previous release) follow it.
//
// Usage: node scripts/release-notes.mjs --tag=v1.2.0 --previous=v1.1.0 --app=<image ref> --postgres=<image ref>
//   --solver=<image ref> --line=v1 --line-moved=yes|no --line-current=<tag> --schema-version=N
//   --previous-schema-version=N --handbook=<url> --repository=<url>
// An image ref is `image:tag@sha256:…`, as the step summary writes it. `previous`, `line-current` and
// `previous-schema-version` are empty for a first release.

import { fileURLToPath } from 'node:url'

/** The notes above GitHub's generated part, as Markdown. */
export function releaseNotes({ tag, previous, images, line, lineMoved, lineCurrent, schemaVersion, previousSchemaVersion, handbookUrl, repositoryUrl }) {
  const guide = (anchor) => `${repositoryUrl}/blob/${tag}/deploy/README.md#${anchor}`
  return [
    '## What a host pulls',
    '',
    '```',
    images.app,
    images.postgres,
    images.solver,
    '```',
    '',
    lineMoved
      ? `Deployments following the \`${line}\` line pick this release up with their next nightly update.`
      : `The \`${line}\` line stays on ${lineCurrent}, which is newer; a host runs this release only [pinned](${guide('pinning-a-release')}).`,
    '',
    '## Schema version',
    '',
    schemaLine({ tag, previous, schemaVersion, previousSchemaVersion, updatesUrl: guide('updates') }),
    '',
    '## Verify',
    '',
    '```',
    `cosign verify --key deploy/cosign.pub ${images.app}`,
    '```',
    '',
    `A host's policy (\`deploy/policy.json\`) checks the same signature on every pull; the key is [\`deploy/cosign.pub\`](${repositoryUrl}/blob/${tag}/deploy/cosign.pub).`,
    '',
    '## Handbook',
    '',
    `<${handbookUrl}>, republished from this release; it describes the latest release that came out.`,
  ].join('\n')
}

function schemaLine({ tag, previous, schemaVersion, previousSchemaVersion, updatesUrl }) {
  if (previous === '') return `Built for schema version ${schemaVersion}: the first release.`
  if (schemaVersion === previousSchemaVersion) return `Built for schema version ${schemaVersion}, unchanged since ${previous}.`
  return `Built for schema version ${schemaVersion}, raised from ${previousSchemaVersion} (${previous}): an earlier release does not start on a database migrated by ${tag}. The way back is the backup taken before the update ([Updates](${updatesUrl})).`
}

const FLAGS = ['tag', 'previous', 'app', 'postgres', 'solver', 'line', 'line-moved', 'line-current', 'schema-version', 'previous-schema-version', 'handbook', 'repository']

/** The command line's `--flag=value` pairs, every flag given once; a stray argument or a missing flag is refused. */
export function parseArgs(argv) {
  const values = {}
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/s.exec(arg)
    if (match === null || !FLAGS.includes(match[1])) throw new Error(`Unexpected argument: ${arg}`)
    if (Object.hasOwn(values, match[1])) throw new Error(`Given twice: --${match[1]}`)
    values[match[1]] = match[2]
  }
  for (const flag of FLAGS) if (!Object.hasOwn(values, flag)) throw new Error(`Missing: --${flag}`)
  if (!['yes', 'no'].includes(values['line-moved'])) throw new Error('--line-moved must be yes or no')
  if (!/^[0-9]+$/.test(values['schema-version'])) throw new Error('--schema-version must be a number')
  if (!/^([0-9]+)?$/.test(values['previous-schema-version'])) throw new Error('--previous-schema-version must be a number or empty')
  if (values['line-moved'] === 'no' && values['line-current'] === '') throw new Error('--line-current names the release the line stays on')
  return {
    tag: values.tag,
    previous: values.previous,
    images: { app: values.app, postgres: values.postgres, solver: values.solver },
    line: values.line,
    lineMoved: values['line-moved'] === 'yes',
    lineCurrent: values['line-current'],
    schemaVersion: Number(values['schema-version']),
    previousSchemaVersion: values['previous-schema-version'] === '' ? undefined : Number(values['previous-schema-version']),
    handbookUrl: values.handbook,
    repositoryUrl: values.repository,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${releaseNotes(parseArgs(process.argv.slice(2)))}\n`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
