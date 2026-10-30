// The school year a roster batch belongs to, as Austrian schools write it:
// "2026/27" runs from September 2026 to August 2027. The caller supplies
// the date; this module never reads the clock.

/** "2026/27": four digits, a slash, the next year's last two digits. */
export const SCHOOL_YEAR = /^(\d{4})\/(\d{2})$/

/** Whether `label` names a school year, with the second year following the first. */
export function isSchoolYear(label: unknown): label is string {
  if (typeof label !== 'string') return false
  const match = SCHOOL_YEAR.exec(label)
  if (!match) return false
  const first = Number(match[1])
  return first >= 2000 && first <= 2999 && Number(match[2]) === (first + 1) % 100
}

/** The school year a date falls in: September starts the next one. `month` is 1–12. */
export function schoolYearOf(year: number, month: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`not a year and month: ${year}, ${month}`)
  }
  const first = month >= 9 ? year : year - 1
  return `${first}/${String((first + 1) % 100).padStart(2, '0')}`
}

/** The first and second calendar year of a school year's label; the caller checked isSchoolYear. */
export function yearsOf(label: string): [number, number] {
  const match = SCHOOL_YEAR.exec(label)
  if (!match) throw new RangeError(`not a school year: ${label}`)
  const first = Number(match[1])
  return [first, first + 1]
}

/**
 * When the retention of a school year's project-week records ends (D-15):
 * one year after the school year's end, so the first of September of the
 * year after the second, at its start in Vienna (UTC+2 then). An ISO 8601
 * instant; the caller, which has the clock, compares.
 */
export function retentionEndsAt(label: string): string {
  const [, second] = yearsOf(label)
  return `${second + 1}-08-31T22:00:00.000Z`
}
