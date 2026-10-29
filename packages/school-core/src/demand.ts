// Places needed against places offered, per project day and grade (D-13):
// what the organizer watches while proposals come in, and what a teacher
// sees before proposing. Students in a class activity on a day need no
// place that day; an activity open to several classes counts its places
// for each of them in proportion to what they still need, since the offer
// is assumed to draw every eligible class alike. Pure arithmetic over the
// roster's class sizes and the catalogue.

export interface ClassSize {
  className: string
  grade: number
  students: number
}

/** An activity as the demand sees it: where it counts, for whom, how many places, on which dates. */
export interface OfferedItem {
  fixedClasses: readonly string[]
  eligibleGrades: readonly number[]
  eligibleClasses: readonly string[]
  places: number
  /** The local dates its sessions touch. */
  dates: readonly string[]
}

export interface GradeDemand {
  grade: number
  /** Students of the grade in the roster. */
  students: number
  /** Of them in a class activity on this day. */
  fixed: number
  /** students − fixed: who needs a place this day. */
  needing: number
  /** Places offered to the grade this day, shares of shared items included; rounded to a whole place. */
  offered: number
}

export interface DayDemand {
  date: string
  grades: GradeDemand[]
}

/**
 * The demand of every project day: per grade, the students, the ones a
 * class activity takes that day, the rest who need a place, and the places
 * the items offer them. Items are counted per class first (a class activity
 * takes its classes out; an item's places split over its eligible classes
 * by their remaining need), then summed per grade.
 */
export function demandByDay(projectDays: readonly string[], classes: readonly ClassSize[], items: readonly OfferedItem[]): DayDemand[] {
  return projectDays.map((date) => {
    const onDay = items.filter((item) => item.dates.includes(date))
    const fixedClasses = new Set(onDay.flatMap((item) => item.fixedClasses))
    const needing = new Map(classes.map((c) => [c.className, fixedClasses.has(c.className) ? 0 : c.students]))
    const offered = new Map(classes.map((c) => [c.className, 0]))
    for (const item of onDay) {
      if (item.places <= 0) continue
      const eligible = classes.filter((c) => mayRank(c, item))
      const need = eligible.reduce((sum, c) => sum + (needing.get(c.className) ?? 0), 0)
      for (const c of eligible) {
        // Nobody left to place in any eligible class: the places go nowhere.
        const share = need === 0 ? 0 : item.places * ((needing.get(c.className) ?? 0) / need)
        offered.set(c.className, (offered.get(c.className) ?? 0) + share)
      }
    }
    const grades = [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b).map((grade) => {
      const own = classes.filter((c) => c.grade === grade)
      const students = own.reduce((sum, c) => sum + c.students, 0)
      const stillNeeding = own.reduce((sum, c) => sum + (needing.get(c.className) ?? 0), 0)
      return {
        grade,
        students,
        fixed: students - stillNeeding,
        needing: stillNeeding,
        offered: Math.round(own.reduce((sum, c) => sum + (offered.get(c.className) ?? 0), 0)),
      }
    })
    return { date, grades }
  })
}

/** Whether students of the class may rank the item: not fixed into it, and within its grade and class rules. */
function mayRank(c: ClassSize, item: OfferedItem): boolean {
  if (item.fixedClasses.includes(c.className)) return false
  if (item.eligibleGrades.length > 0 && !item.eligibleGrades.includes(c.grade)) return false
  if (item.eligibleClasses.length > 0 && !item.eligibleClasses.includes(c.className)) return false
  return true
}
