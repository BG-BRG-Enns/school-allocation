---
applyTo: "**/*.{ts,js,mjs,vue}"
---

# TypeScript / Vue instructions (ESLint)

## Goals

- Favor clear, maintainable code over clever tricks.
- Avoid unrelated refactors or style churn.

## Linting and verification

- Keep changes clean under `npm run lint` (ESLint, markdownlint, `lint:deps`, typecheck). The repository formats code through ESLint's stylistic rules; there is no Prettier.
- Fix the underlying issue rather than adding `eslint-disable`. A suppression needs a comment with the reason.
- Pin every dependency to an exact version in the `package.json` of the workspace that uses it. `npm run lint:deps` enforces it.

## Repository rules

- `packages/school-core` stays pure: no Node, HTTP, database, session or Vue imports, no clock, no randomness. ESLint enforces it.
- The API runs as raw TypeScript on Node 26 (type stripping): no enums, namespaces or parameter properties, and relative imports carry the `.ts` extension.
- Validate external input at the API boundary. The browser is never authoritative for eligibility, completeness or an allocation; it computes them for display with the same `school-core` code the server checks with.
- Authorize every read per request. A signed-in person may be curious about ids in URLs; the role and the roster decide what they see.
- Never log a token, a name, a choice or a database value, and never put a token into a URL path or query string.
