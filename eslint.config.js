import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'

const jsFiles = ['**/*.{js,mjs,cjs}']
const tsFiles = ['**/*.ts']
const vueFiles = ['**/*.vue']
const typedFiles = [...tsFiles, ...vueFiles]

// One clock (apps/api/lib/clock.ts): the server reads the time through the
// database, db.now() in TypeScript and app_now() in SQL, so a test that
// controls the clock moves all of it. Another read of the system's clock,
// or of the database's own now(), would stand still while the rest moved.
// Spread into every no-restricted-syntax of apps/api below: a later
// block's list replaces an earlier one's.
const clockReads = [
  { selector: 'MemberExpression[object.name="Date"][property.name="now"]', message: 'Read the time from the clock: db.now() (apps/api/lib/clock.ts).' },
  { selector: 'NewExpression[callee.name="Date"][arguments.length=0]', message: 'Read the time from the clock: db.now() (apps/api/lib/clock.ts).' },
  { selector: String.raw`Literal[value=/\bnow\(\)/], TemplateElement[value.raw=/\bnow\(\)/]`, message: 'SQL reads the clock with app_now(), not now().' },
]

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'coverage/**', 'tmp/**', 'apps/solver/.venv/**', 'handbook/.vitepress/cache/**'],
  },

  // One formatter for the whole repository, enforced by ESLint rather than a
  // separate Prettier pass: two spaces, single quotes, no semicolons,
  // trailing commas on multi-line literals.
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: false,
    jsx: false,
    commaDangle: 'always-multiline',
    braceStyle: '1tbs',
    arrowParens: true,
  }),

  // Plain JS: this config file and the repository scripts.
  {
    ...js.configs.recommended,
    files: jsFiles,
  },
  {
    files: jsFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // TypeScript and Vue SFCs — recommendedTypeChecked, not plain recommended.
  // The rules that matter most here are not type errors: `tsc` never reports
  // a floating promise or a promise handed to a void callback, and in this
  // application an unawaited query inside a transaction is a choice that is
  // acknowledged without being stored.
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({ ...c, files: typedFiles })),
  ...pluginVue.configs['flat/recommended'].map((c) => ({ ...c, files: vueFiles })),
  {
    files: typedFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        // Each workspace has its own tsconfig.json; the project service picks
        // the nearest one per file. vite.config.ts and the Playwright config
        // at the root are the files no tsconfig.json beside them includes
        // (both run in Node), so they get the web workspace's Node-side
        // config as their default.
        projectService: {
          allowDefaultProject: ['apps/web/vite.config.ts', 'playwright.config.ts'],
          defaultProject: 'apps/web/tsconfig.node.json',
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // Leading underscores mark intentionally-unused bindings.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // node:test's `test()` returns a promise the runner itself awaits, so
      // every top-level call is "floating" by design. Whitelisting the runner
      // entry points keeps the rule live inside test bodies.
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [
          {
            from: 'package',
            package: 'node:test',
            name: ['test', 'it', 'describe', 'suite', 'before', 'after', 'beforeEach', 'afterEach'],
          },
        ],
      }],

      // Fastify's plugin and hook contracts require async functions even when
      // there is nothing to await; the rule is a style hint, not correctness.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: vueFiles,
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      // Catalogue text, names and reasons are user-entered; render them as text only.
      'vue/no-v-html': 'error',
    },
  },
  // Every word on a page comes from the message catalogue
  // (packages/messages/src/de.ts), so a template holds none of its own:
  // only punctuation, symbols and numbers stand bare. The rule sees text
  // and the attributes a person reads (title, aria-label, placeholder,
  // alt); a word inside an expression is the reviewer's to catch.
  {
    files: ['apps/web/src/**/*.vue'],
    rules: {
      'vue/no-bare-strings-in-template': ['error', {
        allowlist: [
          '(', ')', ',', '.', ';', ':', '!', '?', '&', '+', '-', '=', '*', '/', '#', '%', '[', ']', '{', '}', '<', '>', '|',
          '·', '•', '‐', '–', '—', '−', '…', '←', '→', '€', '×', '✕', '„', '“', '"', '\'',
          String.raw`/\d+/`,
        ],
        attributes: {
          '/.+/': ['title', 'aria-label', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext', 'aria-description'],
          'input': ['placeholder'],
          'textarea': ['placeholder'],
          'img': ['alt'],
        },
      }],
    },
  },

  // The domain package is pure: eligibility, time arithmetic, completeness,
  // the allocation model and its validation, the lifecycle guards. It must
  // not depend on HTTP, PostgreSQL, sessions, Vue or Node APIs, so the same
  // code runs in the API and the browser. It must also be deterministic: the
  // same input always gives the same result, so nothing in it may read
  // randomness or the clock. Enforced here rather than left to review. Tests
  // may use node:test. The message catalogue is held to the same rules: the
  // API and the browser read the same words, and a word never depends on
  // when or where it is read.
  {
    files: ['packages/school-core/src/**/*.ts', 'packages/messages/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            // Only same-directory imports: src is flat, so any ../ would
            // leave it. Widen this deliberately if src ever gets folders.
            regex: String.raw`^(?!\./)`,
            message: 'school-core and messages are pure modules: only ./ imports inside src are allowed.',
          },
        ],
      }],
      // The global-object aliases are banned outright, because through them
      // every other restriction could be sidestepped (globalThis.Math.random),
      // and process because Node's types are in scope for the tests.
      'no-restricted-globals': ['error',
        { name: 'Date', message: 'A pure module must not depend on the clock.' },
        { name: 'crypto', message: 'A pure module must not depend on randomness.' },
        { name: 'performance', message: 'A pure module must not depend on the clock.' },
        ...['globalThis', 'global', 'window', 'self', 'process'].map((name) => ({
          name,
          message: 'A pure module must not reach the runtime environment.',
        })),
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'A pure module must not depend on randomness.' },
      ],
    },
  },

  // Canonical JSON and the audit hash chain are what an exported audit log
  // is verified with, so they stay pure: node:crypto and each other, no
  // database, no network, no file system, no environment.
  {
    files: [
      'apps/api/lib/canonical-json.ts',
      'apps/api/lib/audit-chain.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            regex: String.raw`^(?!node:crypto$|\./canonical-json\.ts$)`,
            message: 'The audit chain is verified offline: import only node:crypto and canonical-json.',
          },
        ],
      }],
      'no-restricted-globals': ['error',
        ...['process', 'fetch', 'globalThis', 'global'].map((name) => ({
          name,
          message: 'The audit chain is verified offline: no access to the runtime environment.',
        })),
      ],
    },
  },
  // The server reads the time from its clock alone; the clock itself, the
  // tests and the migrator (which runs outside the server) excepted.
  {
    files: ['apps/api/**/*.ts'],
    ignores: ['apps/api/lib/clock.ts', 'apps/api/test/**', 'apps/api/scripts/migrate.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...clockReads],
    },
  },
  // HTTP adapters may call application operations, never sibling route modules.
  {
    files: ['apps/api/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['./*', '**/routes/**', '**/dao/**', '**/audit.ts', '**/mail/outbox.ts', '**/jobs.ts'], message: 'Routes depend on services and shared HTTP helpers, not sibling routes, DAOs or persistence adapters.' },
        { group: ['**/graph.ts'], allowImportNames: ['GraphError', 'GRAPH_BASE_URL'], message: 'Graph reads belong in application services.' },
      ] }],
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[callee.type=\'MemberExpression\'][callee.property.name=/^(query|tx)$/]',
        message: 'Application services own database operations and transactions.',
      }, {
        selector: 'CallExpression[callee.object.name="app"][callee.property.name=/^(get|post|put|patch|delete|route)$/]',
        message: 'Register shared endpoint descriptors through registerEndpoint.',
      }, ...clockReads],
    },
  },
  {
    files: ['apps/api/services/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['fastify', '@fastify/*', '**/routes/**', '**/lib/auth.ts', '**/http-errors.ts', 'pg', '**/dao/*-rows.ts'], message: 'Services receive plain callers and dependencies; HTTP belongs in routes.' },
      ] }],
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[callee.type=\'MemberExpression\'][callee.property.name=\'query\']',
        message: 'Put SQL in a feature DAO and pass the current transaction client.',
      }, {
        selector: 'ExportNamedDeclaration[source], ExportAllDeclaration',
        message: 'Services expose application operations, never re-export DAO functions or models.',
      }, ...clockReads],
    },
  },
  {
    files: ['apps/api/lib/dao/**/*.ts', 'apps/api/lib/models/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['fastify', '@fastify/*', '**/routes/**', '**/services/**', '**/auth.ts'], message: 'Data access and models must not depend on HTTP or application services.' },
      ] }],
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[callee.type=\'MemberExpression\'][callee.property.name=\'tx\']',
        message: 'The calling service owns the transaction.',
      }, ...clockReads],
    },
  },
  {
    files: ['apps/api/lib/scheduler.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        group: ['**/dao/**', '**/audit.ts', '**/mail/outbox.ts'],
        message: 'The timer delegates persistence and decisions to the scheduling service.',
      }] }],
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name=/^(query|tx)$/]',
        message: 'The scheduling service owns database work.',
      }, {
        selector: 'ImportExpression',
        message: 'Use static scheduling dependencies.',
      }, ...clockReads],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,vue}', 'apps/web/test/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        regex: '^@school-allocation/api-contracts(?:$|/(?!endpoint-metadata$|client-endpoint$))',
        allowTypeImports: true,
        message: 'Browser values come from endpoint-metadata and client-endpoint; import server contracts as types only.',
      }] }],
    },
  },
  {
    files: ['apps/web/src/lib/*api*.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'Literal[value=/^\\/api\\//], TemplateElement[value.raw=/^\\/api\\//]',
        message: 'Use a shared endpoint descriptor for URLs and request/response types.',
      }],
    },
  },
  {
    files: ['packages/api-contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        regex: String.raw`^(?!\./|typebox$|@school-allocation/school-core$)`,
        message: 'Contracts are shared with the browser: only TypeBox, school-core and sibling contracts are allowed.',
      }, {
        group: ['./index.ts'],
        message: 'Import contracts from their feature module, never the package barrel.',
      }] }],
    },
  },

]
