# PostgreSQL for school-allocation, published next to the app as
# ghcr.io/bg-brg-enns/school-allocation-postgres under the same tags: the
# upstream image, pinned, and nothing else. It exists so that a deployment
# follows a line this repository publishes and signs, and so that
# Dependabot bumps one pin that scripts/postgres.sh starts for development
# and CI as well. A PostgreSQL major changes only with the app's major
# line: the data directory needs a dump and restore (deploy/README.md).
# No USER instruction: the upstream entrypoint starts as root, takes
# ownership of a fresh data directory, and steps down to the postgres
# user itself. No `# syntax=` line, as in the app's Dockerfile: the pinned
# BuildKit's built-in frontend reads this file.

FROM docker.io/library/postgres:18.7-alpine@sha256:b6972e1115a4ff8eba5d7f7d19184926d1e16d7d1136ae1e1a7ebf286da0f015
