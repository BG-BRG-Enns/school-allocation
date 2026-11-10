// A page with changes that are not saved yet says so here, and whoever
// would leave it asks first: the router's guard for a route of the app, the
// shell before it signs out (the sign-out revokes the session before the
// browser navigates, so the browser's own question would come too late),
// and the browser for a navigation of its own.

import { t } from './i18n.ts'

let unsaved: (() => boolean) | null = null

/** Registers the page's reading of whether a change is not saved; the answer stops it. */
export function watchUnsaved(check: () => boolean): () => void {
  unsaved = check
  return () => {
    if (unsaved === check) unsaved = null
  }
}

/** Whether the page may be left: yes when nothing is unsaved, otherwise the person's answer. */
export function mayLeave(): boolean {
  return !(unsaved?.() ?? false) || window.confirm(t.common.leaveUnsaved)
}
