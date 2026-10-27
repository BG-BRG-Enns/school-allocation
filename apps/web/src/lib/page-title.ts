// The browser's title for a page: "<page> – SchulWahl", kept current while
// the page is shown.

import { watchEffect } from 'vue'

export const APP_NAME = 'SchulWahl'

export function pageTitle(title: string): string {
  return title === '' ? APP_NAME : `${title} – ${APP_NAME}`
}

export function usePageTitle(title: () => string): void {
  watchEffect(() => {
    document.title = pageTitle(title())
  })
}
