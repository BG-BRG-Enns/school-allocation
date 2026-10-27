// Who is signed in, for the shell and the pages: loaded once from the
// API, null when nobody is (the API answers that with no content).
// Signing out ends the session on the server and brings the browser to
// the sign-in page.

import { computed, ref } from 'vue'
import { apiGet, apiPost } from './api.ts'
import { withBase } from './base.ts'

/** The roster person behind the account; null until the roster knows the account, `kind` null when the roster in force does not list them. */
export interface MePerson {
  id: string
  kind: 'student' | 'teacher' | null
  className: string | null
  grade: number | null
}

export interface Me {
  id: string
  displayName: string
  roles: string[]
  person: MePerson | null
}

/** undefined until loaded; null when signed out. */
export const session = ref<Me | null | undefined>(undefined)

export const isSchoolAdmin = computed(() => session.value?.roles.includes('school_admin') ?? false)

export async function loadSession(): Promise<Me | null> {
  session.value = (await apiGet<Me>('/api/auth/me')) ?? null
  return session.value
}

export async function signOut(): Promise<void> {
  await apiPost('/api/auth/logout')
  session.value = null
  window.location.assign(withBase('/anmelden'))
}
