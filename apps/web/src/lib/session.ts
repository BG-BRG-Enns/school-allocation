// Who is signed in, for the shell and the pages: loaded once from the
// API, null when nobody is (the API answers that with no content).
// Signing out ends the session on the server and brings the browser to
// the sign-in page. In the view as a teacher (view-as.ts) the API answers
// without the person's roles, so the session read here has none.

import * as endpoints from '@school-allocation/api-contracts/endpoint-metadata'

import type { Me } from '@school-allocation/api-contracts'
import { computed, ref } from 'vue'
import { apiRequest } from './api.ts'
import { withBase } from './base.ts'
import { viewAs, writeView, type View } from './view-as.ts'

export type { Me, MePerson } from '@school-allocation/api-contracts'

/** undefined until loaded; null when signed out. */
export const session = ref<Me | null | undefined>(undefined)

export const isSchoolAdmin = computed(() => session.value?.roles.includes('school_admin') ?? false)

export async function loadSession(): Promise<Me | null> {
  session.value = (await apiRequest(endpoints.getAuthMe, { })) ?? null
  return session.value
}

/** The change of view under way, if any: the next one waits for it. */
let viewChange: Promise<void> = Promise.resolve()

/**
 * Puts this tab into `view` and reads the session again, as the server
 * answers it from now on. A reading that fails leaves the tab in the view
 * it had. One change at a time, in the order asked for: two readings under
 * way together could answer out of order and leave the session of one view
 * beside the header of the other.
 */
export function setView(view: View): Promise<void> {
  const change = viewChange.then(async () => {
    const before = viewAs.value
    writeView(view)
    try {
      await loadSession()
    } catch (error) {
      writeView(before)
      throw error
    }
  })
  // The next change waits for this one whether it worked or not; its failure is its caller's to hear.
  viewChange = change.catch(() => {})
  return change
}

export async function signOut(): Promise<void> {
  await apiRequest(endpoints.postAuthLogout, { })
  // The view was this person's: whoever signs in next in this tab starts in their own.
  writeView(null)
  // A full navigation, which drops everything the page knew; the session
  // is not cleared here first, since the shell would then send the router
  // to the sign-in page while this navigation is still on its way, and the
  // two would race.
  window.location.assign(withBase('/anmelden'))
}
