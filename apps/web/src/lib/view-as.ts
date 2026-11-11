// The view as a teacher: someone with a role (organisation, administration,
// read-only) lays it down for this browser tab and sees every page as the
// teacher they are. The tab says so with a header on each request
// (apps/api/lib/auth.ts viewOf), and the server then answers as for the
// same person without their roles: the page is a teacher's because the
// answers are, not because the page hides something. The header only ever
// takes roles away.
//
// Kept in sessionStorage under the app's base path: it holds for this tab,
// through a reload, and other tabs keep their roles. Where the browser
// denies storage it lasts as long as the page.
//
// A download is a plain link and carries no header: it is answered by the
// roles the account holds. In the view only the links a teacher gets are on
// the page, and no answer is more than the person may have anyway.

import { ref } from 'vue'
import { BASE_PATH } from './base.ts'

/** The views a tab may be in: the person's own (null) or a teacher's. */
export type View = 'teacher' | null

/** The header that names the view, as the server reads it. */
export const VIEW_AS_HEADER = 'x-view-as'

const KEY = `schulwahl:${BASE_PATH}:view-as`

/** The tab's storage, or nothing where it is denied or absent (a test of a pure module). */
function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  try {
    return (globalThis as { sessionStorage?: Storage }).sessionStorage
  } catch {
    return undefined
  }
}

/** The view the tab remembers; anything but a view it knows is the person's own. */
export function readView(): View {
  try {
    return storage()?.getItem(KEY) === 'teacher' ? 'teacher' : null
  } catch {
    return null
  }
}

/** The view this tab is in. */
export const viewAs = ref<View>(readView())

/** Puts the tab into `view` and remembers it; the requests from now on carry it. */
export function writeView(view: View): void {
  viewAs.value = view
  try {
    if (view === null) storage()?.removeItem(KEY)
    else storage()?.setItem(KEY, view)
  } catch {
    // Storage denied: the view lives as long as the page.
  }
}

/** The headers a request carries for the tab's view: none in the person's own. */
export function viewHeaders(): Record<string, string> {
  return viewAs.value === null ? {} : { [VIEW_AS_HEADER]: viewAs.value }
}

/** Whether the view as a teacher is offered: to someone who holds a role and is a teacher of the class lists, while in their own view. */
export function mayViewAsTeacher(me: { roles: readonly string[], person: { kind: string | null } | null } | null | undefined, view: View): boolean {
  return view === null && me !== null && me !== undefined && me.roles.length > 0 && me.person?.kind === 'teacher'
}
