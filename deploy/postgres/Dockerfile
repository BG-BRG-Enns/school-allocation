# syntax=docker/dockerfile:1.7
#
# PostgreSQL for school-allocation, published next to the app as
# ghcr.io/bg-brg-enns/school-allocation-postgres under the same tags: the
# upstream image, pinned, and nothing else. It exists so that a deployment
# follows a line this repository publishes and signs, and so that
# Dependabot bumps one pin that scripts/postgres.sh starts for development
# and CI as well. A PostgreSQL major changes only with the app's major
# line: the data directory needs a dump and restore (deploy/README.md).
# No USER instruction: the upstream entrypoint starts as root, takes
# ownership of a fresh data directory, and steps down to the postgres
# user itself.

FROM docker.io/library/postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873
