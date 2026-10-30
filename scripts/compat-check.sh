#!/bin/sh
# The previous release's API tests on this checkout's migrations: the state
# a host is in after podman-auto-update rolls an update back (deploy/README.md,
# Updates). The release's code, its migrator and its privilege list run on
# the schema this checkout's migrations make; every migration has to carry
# that (AGENTS.md, migrations compatible with the previous release).
#
#   scripts/compat-check.sh [ref]
#
# The ref is the argument, else PREVIOUS_RELEASE, else the newest release
# tag (v<major>.<minor>.<patch>) that is not the commit under test. Without
# one there is nothing to check yet, which passes. TEST_DATABASE_URL names a
# PostgreSQL superuser connection, as for npm test.
#
# The release is checked out as a worktree under tmp/compat/ and gets this
# checkout's migrations beside its own; a file both have must be identical,
# since the migrator refuses an applied migration that was edited, and none
# of its own may be missing here. Then its API tests run as its own test
# script runs them, less one: the migrator test that the tables in public are
# exactly the release's list, which a newer release's table breaks by design
# (the migrator itself accepts a table it does not list).
set -eu

SKIP='a second run applies nothing, and every table in public is either granted or deliberately not'

root="$(git rev-parse --show-toplevel)"
summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"; fi
  printf '%s\n' "$1"
}

if [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo "TEST_DATABASE_URL must name a PostgreSQL superuser connection (npm run db:test, CONTRIBUTING.md)" >&2
  exit 2
fi

ref="${1:-${PREVIOUS_RELEASE:-}}"
if [ -z "$ref" ]; then
  head="$(git -C "$root" rev-parse HEAD)"
  ref="$(git -C "$root" tag --list 'v*' --sort=-v:refname | grep -Ex 'v[0-9]+\.[0-9]+\.[0-9]+' | while read -r tag; do
    if [ "$(git -C "$root" rev-list -n 1 "$tag")" != "$head" ]; then
      echo "$tag"
      break
    fi
  done)"
fi
if [ -z "$ref" ]; then
  summary "Compatibility: no previous release yet, nothing to check."
  exit 0
fi

sha="$(git -C "$root" rev-parse --verify --quiet "$ref^{commit}")" || {
  echo "not a commit: $ref" >&2
  exit 2
}
dir="$root/tmp/compat/$sha"
cleanup() {
  git -C "$root" worktree remove --force "$dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup
mkdir -p "$root/tmp/compat"
git -C "$root" worktree add --detach --quiet "$dir" "$sha"

problems=0
for file in "$root"/apps/api/migrations/*.sql; do
  name="$(basename "$file")"
  target="$dir/apps/api/migrations/$name"
  if [ ! -e "$target" ]; then
    cp "$file" "$target"
  elif ! cmp -s "$file" "$target"; then
    echo "$name differs from $ref's: an applied migration was edited, which the migrator refuses" >&2
    problems=1
  fi
done
for file in "$dir"/apps/api/migrations/*.sql; do
  name="$(basename "$file")"
  if [ ! -e "$root/apps/api/migrations/$name" ]; then
    echo "$name of $ref is missing here: a host that applied it refuses this checkout's migrator" >&2
    problems=1
  fi
done
if [ "$problems" -ne 0 ]; then
  summary "Compatibility with $ref ($sha): this checkout's migrations do not continue the ones that release applied."
  exit 1
fi

(cd "$dir" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error)
# Without --throw-deprecation, as the release's own script ran: a
# deprecation in the release's code is that release's, not a sign that
# the schema breaks it.
status=0
(cd "$dir/apps/api" && CI=true node --test --test-concurrency=1 --test-skip-pattern="$SKIP" "test/**/*.test.ts") || status=$?
if [ "$status" -eq 0 ]; then
  summary "Compatibility: the API tests of $ref ($sha) pass on this checkout's migrations."
else
  summary "Compatibility: the API tests of $ref ($sha) fail on this checkout's migrations."
fi
exit "$status"
