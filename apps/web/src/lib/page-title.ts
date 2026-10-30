// The browser's title for a page: "<page> – SchulWahl", kept current while
// the page is shown.

import { watchEffect } from 'vue'
import { t } from './i18n.ts'

export const APP_NAME = t.common.appName

export function pageTitle(title: string): string {
  return title === '' ? APP_NAME : `${title} – ${APP_NAME}`
}

export function usePageTitle(title: () => string): void {
  watchEffect(() => {
    document.title = pageTitle(title())
  })
}
