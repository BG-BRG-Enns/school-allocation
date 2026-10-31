// Planning with teachers: whether a teacher can take part on a project day,
// and who of an activity's teachers leads it.

/** A teacher on a project day: available (no record), unavailable, or available only if needed. */
export const AVAILABILITY_STATUSES = ['available', 'unavailable', 'if_needed'] as const
export type AvailabilityStatus = typeof AVAILABILITY_STATUSES[number]

/**
 * The lead of an activity's teachers, named in order: the one who proposed
 * it, when they are among them; otherwise the first named, as when an
 * organizer creates an activity on a teacher's behalf. The rest accompany.
 * Null for an activity without teachers.
 */
export function leadOf(teachers: readonly string[], proposer: string | null): string | null {
  if (proposer !== null && teachers.includes(proposer)) return proposer
  return teachers[0] ?? null
}
