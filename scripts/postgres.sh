#!/usr/bin/env bash
# Starts a PostgreSQL container for development and CI: the image the
# deployment's PostgreSQL is built from (deploy/postgres/Dockerfile), so a
# Dependabot update of that pin reaches all three.
#
# Usage: scripts/postgres.sh <container-name> <host-port> <owner-password-file>
# Uses docker unless CONTAINER_ENGINE is set (e.g. CONTAINER_ENGINE=podman).
# The server listens on 127.0.0.1 only; the database is school_allocation
# and the owner is the postgres superuser.
#
# Run it again after a reboot of the machine: a container that already
# exists is started, not recreated. The data lives in the named volume
# <container-name>-data, so the container can be removed and recreated
# without losing the database; for an empty database remove both:
#   docker rm -f <container-name> && docker volume rm <container-name>-data
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  echo "usage: $0 <container-name> <host-port> <owner-password-file>" >&2
  exit 2
fi
name="$1"
port="$2"
engine="${CONTAINER_ENGINE:-docker}"

wait_ready() {
  # Probe TCP, not the socket: on first start the image runs a temporary,
  # socket-only server for initialisation, and only the final server, started
  # after the database exists, listens on TCP.
  for _ in $(seq 1 60); do
    if "$engine" exec "$name" pg_isready -q -h 127.0.0.1 -p 5432 -U postgres -d school_allocation 2>/dev/null; then
      echo "PostgreSQL ready on 127.0.0.1:${port}"
      exit 0
    fi
    sleep 1
  done
  "$engine" logs "$name" >&2
  echo "PostgreSQL did not become ready within 60s" >&2
  exit 1
}

# A container of that name already exists: start it if it is stopped (after
# a reboot, say) and leave it alone otherwise. Its port and data are its own.
if running="$("$engine" container inspect --format '{{.State.Running}}' "$name" 2>/dev/null)"; then
  if [[ "$running" != "true" ]]; then
    "$engine" start "$name" >/dev/null
  fi
  wait_ready
fi

# The image reads the password file after dropping to its own user, which
# cannot read a 0600 file owned by the caller. Mount a 0644 copy kept in a
# directory only the caller can enter, relabelled for the container (Z) so
# SELinux-enforcing Podman hosts let PostgreSQL read it. The copy lives
# under the cache directory, not /tmp: /tmp is emptied at a reboot, and a
# container engine that then finds its mount source missing recreates the
# path as a root-owned directory, which breaks every later start here.
secret_dir="${XDG_CACHE_HOME:-$HOME/.cache}/school-allocation/postgres-${name}"
mkdir -p "$secret_dir"
if [[ ! -O "$secret_dir" ]]; then
  echo "$secret_dir is not owned by you (left behind by a container engine running as root?); remove it and run again" >&2
  exit 1
fi
chmod 700 "$secret_dir"
password_file="$secret_dir/owner-password"
install -m 0644 "$3" "$password_file"

dockerfile="$(dirname "${BASH_SOURCE[0]}")/../deploy/postgres/Dockerfile"
image="$(sed -n 's/^FROM \(docker\.io\/library\/postgres:[^ ]*@sha256:[0-9a-f]\{64\}\)$/\1/p' "$dockerfile")"
if [[ -z "$image" || "$image" == *$'\n'* ]]; then
  echo "expected exactly one digest-pinned postgres image in $dockerfile" >&2
  exit 1
fi

# The password file is read once, when the data volume is initialised; a
# volume that already holds a cluster keeps its password. --restart brings
# the container back when the engine starts, unless it was stopped by hand.
"$engine" run -d --name "$name" \
  --restart unless-stopped \
  -p "127.0.0.1:${port}:5432" \
  -e POSTGRES_DB=school_allocation \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/owner-password \
  -v "${name}-data:/var/lib/postgresql" \
  -v "${password_file}:/run/secrets/owner-password:ro,Z" \
  "$image" >/dev/null

wait_ready
