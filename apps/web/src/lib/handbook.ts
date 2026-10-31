// The handbooks (handbook/, published from release tags to GitHub Pages):
// the shell's help link opens the one of the signed-in person's role, in
// the school's language. The address is fixed in the build, as the
// handbooks describe the release that serves this page; a school that
// publishes its own copy changes it here.

import type { Me } from '@school-allocation/api-contracts'
import type { Locale } from '@school-allocation/messages'

export const HANDBOOK_URL = 'https://bg-brg-enns.github.io/school-allocation/'

/**
 * The handbook for `me`: the administration's, the organisation's or the
 * teachers', the first that fits; the start page, which says who reads
 * which, for anyone else on the staff side; none for a student, whose
 * pages explain themselves. Formal German reads the German handbooks.
 */
export function handbookLink(me: Pick<Me, 'roles' | 'person'>, locale: Locale): string | undefined {
  const folder = me.roles.includes('school_admin')
    ? 'verwaltung/'
    : me.roles.includes('campaign_organizer')
      ? 'organisation/'
      : me.person?.kind === 'teacher' ? 'lehrkraefte/' : ''
  if (folder === '' && me.person?.kind === 'student') return undefined
  return `${HANDBOOK_URL}${locale === 'en' ? 'en/' : ''}${folder}`
}
