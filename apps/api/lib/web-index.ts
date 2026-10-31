// The web app's page as the server sends it: index.html, read once at
// startup from the build and told where the app is reached. Every page
// path gets this one document (history-mode routing), so the build's
// asset references, which are relative to the page, are made absolute
// under the base path here, and a meta tag names the base path to the
// web app, which derives its router base, its API paths and the address
// on the cards from it. At the root of a host the tag says "/". Another
// tag names the school's language, which the web app takes its words
// from, and <html lang> says it too; both are set on every page request.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { htmlLang, type Locale } from '@school-allocation/messages'
import type { FastifyReply } from 'fastify'

/** The tag as the build writes it; the server sets its content. */
export const BASE_PATH_META = '<meta name="base-path" content="/">'

/** The language tags as the build writes them, German; the server sets the school's. */
export const LOCALE_META = '<meta name="locale" content="de">'
export const HTML_LANG = '<html lang="de">'

export function withBasePath(html: string, basePath: string): string {
  return html
    .replaceAll('"./assets/', `"${basePath}/assets/`)
    .replace(BASE_PATH_META, `<meta name="base-path" content="${basePath}/">`)
}

/** The page in `locale`: the tag the web app reads its words by (apps/web/src/lib/i18n.ts), and the document's language. */
export function withLocale(html: string, locale: Locale): string {
  return html
    .replace(LOCALE_META, `<meta name="locale" content="${locale}">`)
    .replace(HTML_LANG, `<html lang="${htmlLang(locale)}">`)
}

export async function loadWebIndex(dir: string, basePath: string): Promise<string> {
  return withBasePath(await readFile(path.join(dir, 'index.html'), 'utf8'), basePath)
}

/**
 * The page as each request gets it: in the school's language, read every
 * time, so a change applies at the next load. When the language cannot be
 * read (the database is down), the page still goes out, in the language
 * last read, so the app can say that the server does not answer.
 */
export function pageInSchoolLanguage(html: string, readLocale: () => Promise<Locale>, onError: (err: unknown) => void): () => Promise<string> {
  let last: Locale = 'de'
  return async () => {
    try {
      last = await readLocale()
    } catch (err) {
      onError(err)
    }
    return withLocale(html, last)
  }
}

/** The page as every page path gets it: revalidated on every load, so a deploy takes effect. */
export function sendWebIndex(reply: FastifyReply, html: string): FastifyReply {
  return reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(html)
}
