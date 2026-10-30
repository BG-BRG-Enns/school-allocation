# Deploying school-allocation

Three containers under a rootless podman user, as systemd user units (Quadlet): the app, its PostgreSQL and the solver. They follow the `v1` line of the images this repository publishes and update themselves every night. TLS terminates in a reverse proxy outside the containers, on this host or on another one. The app serves plain HTTP on the host's loopback and assumes nothing about where the proxy runs.

Everything a host chooses is in `~/school-allocation/.env` and four secret files. Everything else is fixed in the units, so the files here are the same on every host.

## Entra ID app registration

In the school's tenant, under **App registrations**:

1. **New registration**: a name such as "SchulWahl", **Accounts in this organizational directory only**, platform **Web**, redirect URI `PUBLIC_URL` followed by `/api/auth/callback` (for example `https://wahl.example.org/api/auth/callback`).
2. Under **Certificates & secrets**, a client secret. Note its value; it goes into `secrets/entra-client-secret` and nowhere else. Note the expiry and renew it before.
3. From the overview page, the **Directory (tenant) ID** and **Application (client) ID**, for `.env`.
4. No app roles and no API permissions are needed for sign-in. Optionally, under **Enterprise applications**, set **Assignment required** and assign the groups of all students and all teachers, so nobody outside those groups can sign in at all.
5. For the roster from Entra groups, see the next section. A school that uploads its roster as a CSV file needs nothing more.

## Roster from Entra groups

An administrator can read the school's roster from the class groups and the teachers' group in Entra. The app holds no directory permission of its own: the refresh runs with the administrator's own token, which Entra issues after they consent, for that one refresh, and which the app forgets afterwards. For that, the app registration needs:

1. A second redirect URI, `PUBLIC_URL` followed by `/api/admin/roster/graph/callback`.
2. Under **API permissions**, the **delegated** Microsoft Graph permissions `GroupMember.Read.All` (reads the members of the labelled groups, nested groups included), `User.ReadBasic.All` (their names and e-mail addresses; without it Graph lists ids only) and `Group.Read.All` (finds groups by name when the administrator picks them), with admin consent granted for the tenant (**Grant admin consent**), so that the administrator is not asked to consent to a permission only a tenant administrator may grant.

A school that enters group ids by hand and wants no group search leaves `Group.Read.All` out of the registration and sets `GRAPH_DELEGATED_SCOPES=GroupMember.Read.All,User.ReadBasic.All` in `.env`.

In the app, under **Verwaltung → Stammdaten**, the administrator picks the groups from a search by name (authorizing a token for it at Microsoft, which the server keeps in memory for the token's lifetime, never on disk) or enters their object ids, labels them (a class with its grade, or the teachers), then starts the refresh. Members are read through nested groups, so a class whose students sit in nested groups is labelled once: either the class group or its nested groups, not both (3A, or 3AR and 3AG), or the students come in twice and the batch is refused. The members become a pending batch with a diff against the roster in force, which the administrator commits or discards.

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

Five files under `~/school-allocation/secrets/`, each holding one value and nothing else. The containers run as fixed ids, so the files are chowned into the user namespace with `podman unshare`; afterwards they can only be changed or removed through `podman unshare` as well.

```bash
umask 077
cd ~/school-allocation/secrets
openssl rand -hex 24 > db-owner-password
openssl rand -hex 24 > db-runtime-password
openssl rand -hex 32 > session-key
printf '%s' '<the client secret from Entra>' > entra-client-secret
printf '%s' '<the password of the SMTP account>' > smtp-password   # or `: > smtp-password` when no mail is sent
chmod 400 db-runtime-password entra-client-secret session-key smtp-password
chmod 440 db-owner-password
podman unshare chown 10001:10001 db-runtime-password entra-client-secret session-key smtp-password
podman unshare chown 10001:70 db-owner-password
```

The app image runs as uid 10001, the app and the migrator alike, so the migrator reads `db-owner-password` as its owner. The PostgreSQL image reads it as its own user, whose group is 70, so the file is readable by that group as well. The running app is never given the file.

- `db-owner-password`: the PostgreSQL superuser, used by the database container and by the migrations (`ExecStartPre` of the app's unit). The app never sees it.
- `db-runtime-password`: the unprivileged role the app connects as. The migrator sets it.
- `session-key`: seals the session cookies. A new key signs everyone out.
- `entra-client-secret`: the client secret of the app registration. When Entra's expires, write the new one and `systemctl --user restart school-allocation`.
- `smtp-password`: the password of the account the app sends mail as (Mail, below). The unit mounts the file on every host; where no mail is sent it stays empty.

## Configuration

`~/school-allocation/.env`, from `deploy/.env.example`: `PUBLIC_URL`, `TRUST_PROXY`, `LOG_LEVEL`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `BOOTSTRAP_ADMINS`, optionally `GRAPH_DELEGATED_SCOPES`, and the mail settings below. The app refuses to start with a missing or unsafe value and names it in the journal.

## The solver

The allocation is computed by the solver container (`school-allocation-solver`), OR-Tools CP-SAT behind a small HTTP service on the internal network: it holds no data and no credentials, has no way out, and sees nothing but small integers; the app checks every answer against the rules before it stores a run. The app's unit sets `SOLVER_URL=http://school-allocation-solver:8000`; without it the organizer's page says that no solver is set up and no run can start. A run is a job: the health check says `busy` while it executes, so the nightly update waits for it, and a run interrupted by a restart is marked so and started again by hand.

A run's time limit is per level of the objective, in CP-SAT's deterministic seconds, which the organizer sets on the page (5 unless changed, 60 at most); one of them is several seconds of wall-clock time on a small machine, so a school-sized run takes a minute or a few. The solver runs on one core; the same seed and limit give the same allocation on the same release. The host needs about half a gigabyte of memory for it.

## Mail

The app sends its notices (the invitation to a choice window, reminders, the lists to the class teachers, the notice to those who missed the deadline, the organizer's test mail) over the school's own SMTP submission, authenticated, over STARTTLS (port 587) or implicit TLS (port 465). Set in `.env`:

- `SMTP_HOST`: the submission server. Unset, mail is off: notices still go into the outbox and go out once it is set, and the organizer's pages say so.
- `SMTP_PORT`: 587 unless set. `SMTP_SECURE=true` for implicit TLS on 465. `SMTP_REQUIRE_TLS` is `true` unless set, and `false` only for a test server on a private network that offers no TLS.
- `SMTP_USER`: the account; its password is the file `secrets/smtp-password`.
- `MAIL_FROM`: the From header, a mailbox such as `SchulWahl <wahl@schule.example.org>`; the sending domain's SPF and DKIM are the school's mail setup. Optionally `MAIL_REPLY_TO` (where answers go) and `MAIL_ENVELOPE_FROM` (a bare address where bounces go; the From address unless set).

Every notice is a row of the outbox: who got what, when, and the server's reply or what went wrong; the organizer sees the state per student on the campaign's page. Nothing is logged about recipients or texts. A changed setting takes effect with `systemctl --user restart school-allocation`.

`BOOTSTRAP_ADMINS` names the people who become school administrators at their first sign-in, by school address or Entra object id. Every further role is granted in the app and recorded in its audit log. Removing a name from the list revokes nothing; that is done in the app too.

## Under a path of an existing site

`PUBLIC_URL=https://www.example.org/wahl` runs the app under `/wahl`: every route, cookie and link carries the prefix, and the proxy passes the path through unchanged (the variant at the end of `nginx.example.conf`). On a shared origin the app's defence against cross-site requests trusts that whole origin, so a page of another application on the same host could send requests with a signed-in person's cookies. Another cost: under a path the session cookie cannot be bound to the host by its name, so any host of `example.org` can set one for the app; the app refuses a session that was not started in the same browser, but a planted cookie can keep a person signed out until it expires. A host of its own keeps both boundaries; the app runs either way.

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

## Retention

Nothing is deleted automatically. A school administrator removes a school year's records on the
Aufbewahrung page once a year has passed since the school year's end and every campaign of it is
archived, with a reason; the audit log of the school keeps the purge with its counts. Export the
assignments and fee workbooks of the year before, if the school's accounting still needs them: the
purge removes the campaigns with everything under them, the year's roster batches and the people and
accounts nobody names any more. Backups (below) are the host's, outside this rule.

## Backups

The data lives in the volume `school-allocation-db` and nowhere else. Back it up the way the host backs up its other services; `podman exec school-allocation-postgres pg_dump -U postgres -Fc school_allocation` works at any time, and a dump before and after each allocation run is a sensible habit.

## Logs

`journalctl --user -u school-allocation` holds the app's log: JSON lines without request lines, client addresses, query strings or error messages. The proxy's access log is the record of who reached the app when, under the proxy operator's retention.
