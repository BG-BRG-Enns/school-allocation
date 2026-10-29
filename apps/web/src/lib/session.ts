// Who is signed in, for the shell and the pages: loaded once from the
// API, null when nobody is (the API answers that with no content).
// Signing out ends the session on the server and brings the browser to
// the sign-in page.

import * as endpoints from '@school-allocation/api-contracts/endpoints'

import type { Me } from '@school-allocation/api-contracts'
import { computed,ref } from 'vue'
import { apiRequest } from './api.ts'
import { withBase } from './base.ts'

export type { Me,MePerson } from '@school-allocation/api-contracts'

/** undefined until loaded; null when signed out. */
export const session = ref<Me | null | undefined>(undefined)

export const isSchoolAdmin = computed(() => session.value?.roles.includes('school_admin') ?? false)

export async function loadSession(): Promise<Me | null> {
  session.value = (await apiRequest(endpoints.getAuthMe, { })) ?? null
  return session.value
}

export async function signOut(): Promise<void> {
  await apiRequest(endpoints.postAuthLogout, { })
  // A full navigation, which drops everything the page knew; the session
  // is not cleared here first, since the shell would then send the router
  // to the sign-in page while this navigation is still on its way, and the
  // two would race.
  window.location.assign(withBase('/anmelden'))
}
