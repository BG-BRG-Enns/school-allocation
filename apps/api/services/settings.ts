// The school's settings that are not a campaign's: the period grid (D-25),
// read by everyone who places or reads a session, replaced as a whole by
// an administrator, and with it what the sessions of the registrations not
// yet open credit, which is derived from it; the school's language, which the pages, the workbooks
// and the notices speak, set by an administrator. Audited in the school
// scope.

import type { Locale } from '@school-allocation/messages'
import { checkPeriods, type Period } from '@school-allocation/school-core'
import { type Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import { sessionCredits } from '../lib/credits.ts'
import { listCampaignsBeforeOpening, listSessionsBeforeOpening, updateSessionCredits } from '../lib/dao/items.ts'
import * as store from '../lib/dao/settings.ts'
import { readPeriods } from '../lib/dao/settings.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { PeriodsInvalid } from '../lib/errors.ts'
import { schoolLocale } from '../lib/i18n.ts'

/**
 * What the sessions credit follows the grid (lib/credits.ts): every
 * session of a registration not yet open is derived again from `periods`.
 * Each such registration under its lock, its state read again there, so an
 * opening in flight and this never cross: one that has opened keeps what
 * its choices compute with. Returns how many sessions were written.
 */
async function recomputeCredits(client: Queryable, periods: readonly Period[]): Promise<number> {
  const campaigns = await listCampaignsBeforeOpening(client)
  for (const campaign of campaigns) await lockScope(client, campaign.id)
  const sessions = await listSessionsBeforeOpening(client, campaigns.map((campaign) => campaign.id))
  for (const session of sessions) await updateSessionCredits(client, session.id, sessionCredits(periods, session.startsAt, session.endsAt))
  return sessions.length
}

/** Replaces the grid with `periods`, which must pass school-core's check, and derives the credits of the registrations not yet open from it; audited. */
export async function replacePeriods(db: Database, periods: readonly Period[], actor: Actor): Promise<Period[]> {
  const problems = checkPeriods(periods)
  if (problems.length > 0) throw new PeriodsInvalid(problems)
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    await store.deletePeriods(client)
    for (const period of periods) {
      await store.insertPeriod(client, period)
    }
    const sessions = await recomputeCredits(client, periods)
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'settings.periods-changed',
      metadata: { periods: periods.length, first: periods[0]?.starts ?? '', last: periods.at(-1)?.ends ?? '', sessions },
    })
  })
  return readPeriods(db)
}

/** The grid offered to signed-in people by the settings page. */
export async function periodSettings(db: Database) {
  return { periods: await readPeriods(db) }
}

/** The school's language, for the settings page; the pages themselves read it from the tag the server sets. */
export async function languageSetting(db: Database): Promise<{ locale: Locale }> {
  return { locale: await schoolLocale(db) }
}

/** Sets the school's language; audited with the one before. Setting the language it has changes nothing and records nothing. */
export async function replaceLanguage(db: Database, locale: Locale, actor: Actor): Promise<{ locale: Locale }> {
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const from = await schoolLocale(client)
    if (from === locale) return
    await store.updateLocale(client, locale, actor)
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'settings.language-changed',
      metadata: { from, to: locale },
    })
  })
  return languageSetting(db)
}
