#!/bin/sh
# Whether the app may be updated or restarted now: exits 0 unless a job is
# executing (an allocation run, a roster import, an outbox flush), which
# the app's health check reports as "busy": true.
# podman-auto-update.service runs this as its ExecCondition
# (deploy/systemd/podman-auto-update.service.d/busy.conf), so the nightly
# update waits for the next night without failing. An app that does not
# answer blocks nothing: nothing is busy then. The base path comes from
# PUBLIC_URL in the app's .env; the port is the one the unit publishes.
set -eu

env_file="${1:-$HOME/school-allocation/.env}"
port="${2:-3000}"
url="$(sed -n 's/^PUBLIC_URL=//p' "$env_file" | tr -d '"'"'"'"' | tail -n 1)"
path="$(printf '%s' "$url" | sed -E 's#^[A-Za-z][A-Za-z0-9+.-]*://[^/]*##; s#/$##')"

if curl -fsS --max-time 5 "http://127.0.0.1:${port}${path}/api/health" | grep -q '"busy":true'; then
  echo "school-allocation: a job is executing, not updating now"
  exit 1
fi
