# school-allocation

Self-hosted allocation of project-week activities and elective subjects (Wahlpflichtgegenstände) for Austrian schools. Students rank what they want, teachers offer and fix activities, and an allocation run assigns places fairly and reproducibly; the school reviews before anything is published. Every record is identified, and every privileged action is audited.

Everyone signs in with the school's Microsoft Entra ID; that is the only thing the software assumes about a school. The roster comes from the school's Entra class groups or a CSV upload.

This is the foundation release: sign-in, roles, the audit log and the deployment. The catalogue, the choice window and the allocation follow in [`docs/mvp-plan.md`](docs/mvp-plan.md). The design is in [`docs/`](docs/); the conventions for contributors in [`AGENTS.md`](AGENTS.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Development

Requires Node 26.

```bash
npm ci --ignore-scripts
cp apps/api/.env.example apps/api/.env
npm run dev:api:fake-entra   # http://127.0.0.1:3000, signing in with a stand-in for Entra ID
npm run dev:web              # Vite dev server, /api proxied to the API
npm run lint
npm test
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the database setup, the secret files and both ways of signing in during development.

### Browser journeys

`npm run e2e` runs the Playwright journeys in `e2e/specs` in Chromium against the real server, started by `e2e/harness/server.ts` with a fresh database and a stand-in for the Microsoft sign-in. It needs `TEST_DATABASE_URL` like the API tests, and Chromium once: `npm run e2e:install`. The specs of a file build on each other and the files on the ones before, so run them in order; `npm run e2e:ui` opens Playwright's UI. The journeys run on a clock of their own, the server's, its database's and the browser's, from Monday 7 November 2033 to the project days of July 2034, which a spec moves with `setClock` and whose scheduler it runs with `runTick` (`e2e/support/clock.ts`), so their dates never expire. `npm run e2e:screenshots` writes a full-page screenshot of every step to `docs/anleitung/bilder/full-size/`, which git ignores: a quick look at the whole app, from the empty roster to the published catalogue, without clicking through it. The browser console must stay clean: a message at warning or error level, or an uncaught exception, in any page of a journey fails the test it happened in; a refusal a spec provokes on purpose is declared with `refused` from `e2e/support/console.ts`.

## Container images

Three images: the API, which also serves the built web app, as a non-root user (uid 10001); its PostgreSQL; and the solver.

```bash
docker build -t school-allocation:local .
docker build -t school-allocation-solver:local apps/solver
```

A release is a `v<major>.<minor>.<patch>` tag; pushing it publishes the three images to `ghcr.io/<owner>/school-allocation`, `…-postgres` and `…-solver`, under the release tag and the line tag `v1`, which deployments follow and pick up with their nightly update. A release that fixes a vulnerability in the app raises the schema version, so that no deployment goes back to an app behind it ([`SECURITY.md`](SECURITY.md)).

## Handbooks

The handbooks for a school's administration, organizers and teachers are at <https://bg-brg-enns.github.io/school-allocation/>, in German and in English, published with each release; in the app, **Hilfe** opens the one of the signed-in person's role. Their source is [`handbook/`](handbook/), with pictures cut from the browser journeys; [CONTRIBUTING.md](CONTRIBUTING.md#handbooks) says how to change them.

## Deployment

[deploy/README.md](deploy/README.md) is the operator guide: the Entra ID app registration, secret files, rootless podman units for the three containers that update themselves nightly, and the TLS proxy in front, on the host or elsewhere.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The engineering conventions, the sign-in, the migration runner and the deployment model come from [school-election](https://github.com/cmiicbrg/school-election), by the same author under the same license.

The images carry the notices for what they contain of other projects beyond their packages' own licence files: [`third-party-notices/`](third-party-notices/README.md) for the app, [`apps/solver/third-party-notices/`](apps/solver/third-party-notices/README.md) for the solver. The web app's bundled packages are listed with their licences in `third-party-licenses.txt` next to the app, linked from the account page.
