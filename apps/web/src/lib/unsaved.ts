// A page with changes that are not saved yet says so here, and whoever
// would leave it asks first: the router's guard for a route of the app, the
// shell before it signs out (the sign-out revokes the session before the
// browser navigates, so the browser's own question would come too late),
// and the browser for a navigation of its own. Once leaving was agreed to,
// nothing asks again on the way out.

import { t } from './i18n.ts'

let unsaved: (() => boolean) | null = null
let leaving = false

/** Registers the page's reading of whether a change is not saved; the answer stops it. */
export function watchUnsaved(check: () => boolean): () => void {
  unsaved = check
  leaving = false
  return () => {
    if (unsaved === check) {
      unsaved = null
      leaving = false
    }
  }
}

/** Whether a change is not saved, as the page reads it; nothing once leaving was agreed to. */
export function hasUnsaved(): boolean {
  return !leaving && (unsaved?.() ?? false)
}

/** Whether the page may be left: yes when nothing is unsaved, otherwise the person's answer. */
export function mayLeave(): boolean {
  if (!hasUnsaved()) return true
  leaving = window.confirm(t.common.leaveUnsaved)
  return leaving
}

/** The leaving agreed to did not happen (the sign-out failed): the page is watched again. */
export function stayed(): void {
  leaving = false
}
