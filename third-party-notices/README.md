# Third-party notices

What the app image carries besides this repository's own code. The image carries this directory as `/app/third-party-notices`.

The npm packages in the image are the production tree of `package-lock.json`. They are all under permissive licences (today MIT, BSD-3-Clause, Apache-2.0, ISC, BlueOak-1.0.0 and MIT-0), and each carries its own licence file in `/app/node_modules`; a test (`scripts/third-party-notices.test.mjs`) refuses a production package under any other licence. Two things carry no notice of their own, and they are what this page is about.

## libsodium

The sessions are sealed with [libsodium](https://github.com/jedisct1/libsodium) through `sodium-native` 5.2.0 (MIT). Its prebuilt binding, `/app/node_modules/sodium-native/prebuilds/linux-x64/sodium-native.node` in the image, has libsodium compiled into it, from the commit `79a59b7` that the package's `CMakeLists.txt` names: <https://github.com/jedisct1/libsodium/tree/79a59b7>. The package carries its own licence but not libsodium's.

libsodium is under the ISC licence: [ISC-libsodium.txt](ISC-libsodium.txt).

## The web app

The web app's files bundle Vue (`@vue/reactivity`, `@vue/runtime-core`, `@vue/runtime-dom`, `@vue/shared`) and vue-router, all under the MIT licence. They are build-time dependencies, so they are not in the image's `node_modules`, and the bundle keeps no licence comments. The build writes the licences of everything it bundles next to the app instead: `apps/web/dist/third-party-licenses.txt` in the image, served as `PUBLIC_URL` followed by `/third-party-licenses.txt` and linked from the account page.

## The base image

The image is built on `docker.io/library/node` (Debian). Its operating-system packages carry their copyright files from upstream, one per package under `/usr/share/doc`; nothing is added here.

## The other images

- The solver image carries notices of its own: [`apps/solver/third-party-notices/`](../apps/solver/third-party-notices/README.md).
- The PostgreSQL image is the upstream `docker.io/library/postgres` image (Alpine) as it is; this repository adds nothing to it. What it contains and under which licences is listed by the upstream image's maintainers: <https://github.com/docker-library/repo-info/tree/master/repos/postgres>.
