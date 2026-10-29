import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue(), {
    name: 'browser-contract-boundary',
    generateBundle(_options, bundle) {
      // Check emitted modules, including indirect imports, rather than a byte
      // budget that could miss schemas after an unrelated size reduction.
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        for (const id of Object.keys(output.modules)) {
          const contract = /packages\/api-contracts\/src\/(.+)$/.exec(id)?.[1]
          if ((contract !== undefined && !['endpoint-metadata.ts', 'client-endpoint.ts'].includes(contract)) || /node_modules\/typebox\//.test(id)) {
            this.error(`Server schemas must not enter the browser bundle: ${id}`)
          }
        }
      }
    },
  }],
  // Relative asset references: the build does not know under which path
  // the app will run. The server makes them absolute under its base path
  // when it sends index.html, and names the base path to the app
  // (src/lib/base.ts); inside the bundle, URLs resolve from the module or
  // stylesheet that carries them.
  base: './',
  build: {
    // Every asset is a file under /assets, never a data: URL in the CSS:
    // the content security policy allows fonts from this origin only, and
    // Vite's default inlines the small font subsets, which the browser
    // then refuses and logs on every page.
    assetsInlineLimit: 0,
  },
  server: {
    // The API serves the built app in production; in development Vite
    // forwards /api to a locally running API so the browser sees one origin.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
})
