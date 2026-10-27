# Deploying school-allocation

Three containers under a rootless podman user, as systemd user units (Quadlet): the app, its PostgreSQL and the solver. They follow the `v1` line of the images this repository publishes and update themselves every night. TLS terminates in a reverse proxy outside the containers, on this host or on another one. The app serves plain HTTP on the host's loopback and assumes nothing about where the proxy runs.

Everything a host chooses is in `~/school-allocation/.env` and four secret files. Everything else is fixed in the units, so the files here are the same on every host.

## Entra ID app registration

In the school's tenant, under **App registrations**:

1. **New registration**: a name such as "SchulWahl", **Accounts in this organizational directory only**, platform **Web**, redirect URI `PUBLIC_URL` followed by `/api/auth/callback` (for example `https://wahl.example.org/api/auth/callback`).
2. Under **Certificates & secrets**, a client secret. Note its value; it goes into `secrets/entra-client-secret` and nowhere else. Note the expiry and renew it before.
3. From the overview page, the **Directory (tenant) ID** and **Application (client) ID**, for `.env`.
4. No app roles and no API permissions are needed for sign-in. Optionally, under **Enterprise applications**, set **Assignment required** and assign the groups of all students and all teachers, so nobody outside those groups can sign in at all.
5. For the roster import from class groups (a later release), the permission the app asks for is documented with that release.

## Host

A Linux host with Podman 5 or newer (Quadlet), `systemd`, `curl` and a user of its own for the app, called `allocation` here:

```bash
sudo useradd --create-home --shell /bin/bash allocation
sudo loginctl enable-linger allocation
```

As `allocation`:

```bash
mkdir -p ~/school-allocation/secrets ~/.config/containers/systemd ~/.config/systemd/user/podman-auto-update.service.d ~/.config/containers/registries.d
cp deploy/quadlet/* ~/.config/containers/systemd/
cp deploy/systemd/podman-auto-update.service.d/busy.conf ~/.config/systemd/user/podman-auto-update.service.d/
cp deploy/not-busy.sh ~/school-allocation/ && chmod +x ~/school-allocation/not-busy.sh
cp deploy/.env.example ~/school-allocation/.env && chmod 600 ~/school-allocation/.env
```

If another service on the host already publishes `127.0.0.1:3000`, give the app another port with a drop-in, and tell the proxy and `not-busy.sh` (its second argument, in `busy.conf`) the same port:

```ini
# ~/.config/containers/systemd/school-allocation.container.d/port.conf
[Container]
PublishPort=
PublishPort=127.0.0.1:3010:3000
```

### Signatures

The images are signed with this repository's cosign key. A host refuses an unsigned one:

```bash
cp deploy/cosign.pub ~/school-allocation/cosign.pub
cp deploy/policy.json ~/.config/containers/policy.json
cp deploy/registries.d/ghcr.yaml ~/.config/containers/registries.d/ghcr.yaml
```

`policy.json` names the key's path under the user's home; with another user name, change the path in the file.

The key pair is the maintainers' and is created once: `cosign generate-key-pair` writes `cosign.key` and `cosign.pub`. The public key is committed as `deploy/cosign.pub`; the private key and its password are the repository secrets `COSIGN_PRIVATE_KEY` and `COSIGN_PASSWORD`, and nothing else ever holds them. The release workflow refuses to publish while `deploy/cosign.pub` is missing.

## Secret files

Four files under `~/school-allocation/secrets/`, each holding one value and nothing else. The containers run as fixed ids, so the files are chowned into the user namespace with `podman unshare`; afterwards they can only be changed or removed through `podman unshare` as well.

```bash
umask 077
cd ~/school-allocation/secrets
openssl rand -hex 24 > db-owner-password
openssl rand -hex 24 > db-runtime-password
openssl rand -hex 32 > session-key
printf '%s' '<the client secret from Entra>' > entra-client-secret
chmod 400 db-runtime-password entra-client-secret session-key
chmod 440 db-owner-password
podman unshare chown 10001:10001 db-runtime-password entra-client-secret session-key
podman unshare chown 10001:70 db-owner-password
```

The app image runs as uid 10001, the app and the migrator alike, so the migrator reads `db-owner-password` as its owner. The PostgreSQL image reads it as its own user, whose group is 70, so the file is readable by that group as well. The running app is never given the file.

- `db-owner-password`: the PostgreSQL superuser, used by the database container and by the migrations (`ExecStartPre` of the app's unit). The app never sees it.
- `db-runtime-password`: the unprivileged role the app connects as. The migrator sets it.
- `session-key`: seals the session cookies. A new key signs everyone out.
- `entra-client-secret`: the client secret of the app registration. When Entra's expires, write the new one and `systemctl --user restart school-allocation`.

## Configuration

`~/school-allocation/.env`, from `deploy/.env.example`: `PUBLIC_URL`, `TRUST_PROXY`, `LOG_LEVEL`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `BOOTSTRAP_ADMINS`. The app refuses to start with a missing or unsafe value and names it in the journal.

`BOOTSTRAP_ADMINS` names the people who become school administrators at their first sign-in, by school address or Entra object id. Every further role is granted in the app and recorded in its audit log. Removing a name from the list revokes nothing; that is done in the app too.

## Under a path of an existing site

`PUBLIC_URL=https://www.example.org/wahl` runs the app under `/wahl`: every route, cookie and link carries the prefix, and the proxy passes the path through unchanged (the variant at the end of `nginx.example.conf`). On a shared origin the app's defence against cross-site requests trusts that whole origin, so a page of another application on the same host could send requests with a signed-in person's cookies. A host of its own keeps that boundary; the app runs either way.

## First start

```bash
systemctl --user daemon-reload
systemctl --user start school-allocation-postgres school-allocation-solver school-allocation
systemctl --user status school-allocation
curl -fsS http://127.0.0.1:3000/api/health
```

The first start pulls the three images (a few minutes), creates the database, runs every migration, creates the runtime role, and starts the app. The health check reports the release and commit it runs. Then open `PUBLIC_URL` and sign in as a listed first administrator.

## The proxy and TLS

The app expects a reverse proxy that terminates TLS and forwards to `127.0.0.1:3000` with `Host`, `X-Forwarded-For` and `X-Forwarded-Proto` set; `nginx.example.conf` is a complete site. The proxy adds no security headers and no authorization: both come from the app.

When the proxy runs on another host, bring the app's port there over a tunnel from the app's host, for example `autossh -N -R 127.0.0.1:3000:127.0.0.1:3000 proxy-host`, and point the proxy at its local end.

`TRUST_PROXY` lists the addresses the app accepts `X-Forwarded-*` headers from. With rootless podman the proxy's connections arrive from the egress network's gateway, not from `127.0.0.1`; `podman network inspect school-allocation-egress` shows its subnet, which is the value to set when the default `10.89.0.0/16` is wider than the host needs.

## Updates

`podman-auto-update.timer` pulls new `v1` images nightly and restarts the units whose image changed. The app's unit runs the migrations before every start, with the image it is about to run, so the app never starts on an old schema; a migration is written to work with the previous release too, so the automatic rollback after a failed health check is safe.

The update is skipped, without failing, while a job is executing (an allocation run, a roster import, an outbox flush): `busy.conf` makes `not-busy.sh` the unit's condition, and it asks the health check. Choices and catalogue changes are saved as they are made, so a restart at night loses nothing a person has done.

```bash
systemctl --user enable --now podman-auto-update.timer
systemctl --user list-timers podman-auto-update.timer
```

A major version (`v2`) changes the line the units follow and is installed by hand with the release notes.

## Reboots

With linger enabled the units start at boot (`WantedBy=default.target`) in order: the database, then the solver and the migrations, then the app.

## Backups

The data lives in the volume `school-allocation-db` and nowhere else. Back it up the way the host backs up its other services; `podman exec school-allocation-postgres pg_dump -U postgres -Fc school_allocation` works at any time, and a dump before and after each allocation run is a sensible habit.

## Logs

`journalctl --user -u school-allocation` holds the app's log: JSON lines without request lines, client addresses, query strings or error messages. The proxy's access log is the record of who reached the app when, under the proxy operator's retention.
