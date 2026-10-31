// Categories and rules: the school keeps one list of categories (sport,
// creative, trip, IBOBB …), an activity belongs to none, one or several,
// and a registration asks of the students of some grades (or classes) at
// least so many activities or minutes of a category. A rule is never a hard
// constraint: the allocation meets it where it can, after the days and
// before the wishes, and reports who misses it. A class activity counts
// toward a rule like any other. Pure.

import { creditedMinutesByDate, type Credit, type StudentOf } from './catalogue.ts'
import type { Ranking, TimeGroup } from './choices.ts'
import type { ClassSize } from './demand.ts'

/** A rule counts activities or their credited minutes. */
export const RULE_UNITS = ['items', 'minutes'] as const
export type RuleUnit = typeof RULE_UNITS[number]

/** The most a rule may ask: a week of activities, or of minutes. */
export const RULE_LIMITS: Record<RuleUnit, number> = { items: 20, minutes: 10_000 }

/** At most this many rules per registration, and categories per school. */
export const MAX_RULES = 20
export const MAX_CATEGORIES = 50

export interface CampaignRule {
  id: string
  categoryId: string
  /** The grades it applies to; never empty. */
  grades: number[]
  /** The classes of those grades it is limited to; empty means every class. */
  classes: string[]
  unit: RuleUnit
  /** At least this many activities, or minutes. */
  minimum: number
}

/** An activity as a rule sees it: its categories and what it credits. */
export interface RuledItem {
  categoryIds: readonly string[]
  sessions: readonly { credits: readonly Credit[] }[]
}

export const RULE_PROBLEM_CODES = ['category_unknown', 'grades_missing', 'minimum_out_of_range', 'too_many_rules'] as const
export type RuleProblemCode = typeof RULE_PROBLEM_CODES[number]

export interface RuleProblem {
  code: RuleProblemCode
  /** The rule's position in the list, from 0. */
  rule?: number
}

/** What is wrong with a registration's rules against the school's categories. */
export function checkRules(rules: readonly Omit<CampaignRule, 'id'>[], categoryIds: ReadonlySet<string>): RuleProblem[] {
  const problems: RuleProblem[] = []
  if (rules.length > MAX_RULES) problems.push({ code: 'too_many_rules' })
  rules.forEach((rule, index) => {
    if (!categoryIds.has(rule.categoryId)) problems.push({ code: 'category_unknown', rule: index })
    if (rule.grades.length === 0) problems.push({ code: 'grades_missing', rule: index })
    if (!Number.isInteger(rule.minimum) || rule.minimum < 1 || rule.minimum > RULE_LIMITS[rule.unit]) problems.push({ code: 'minimum_out_of_range', rule: index })
  })
  return problems
}

/** Whether a rule asks anything of the student: their grade is listed and, when classes are, their class. */
export function ruleApplies(rule: Pick<CampaignRule, 'grades' | 'classes'>, student: StudentOf): boolean {
  return rule.grades.includes(student.grade) && (rule.classes.length === 0 || rule.classes.includes(student.className))
}

/** What an activity adds to a rule: one activity, or its credited minutes on the project days; nothing outside the rule's category. */
export function ruleAmount(rule: Pick<CampaignRule, 'categoryId' | 'unit'>, item: RuledItem, projectDays: readonly string[]): number {
  if (!item.categoryIds.includes(rule.categoryId)) return 0
  if (rule.unit === 'items') return 1
  const credit = creditedMinutesByDate(item.sessions)
  return projectDays.reduce((sum, date) => sum + (credit.get(date) ?? 0), 0)
}

/** How far a student's activities go toward a rule. */
export function ruleProgress(rule: Pick<CampaignRule, 'categoryId' | 'unit'>, items: readonly RuledItem[], projectDays: readonly string[]): number {
  return items.reduce((sum, item) => sum + ruleAmount(rule, item, projectDays), 0)
}

/** A rule as it stands for one student: what it asks, what their activities bring, whether that is enough. */
export interface RuleStanding {
  ruleId: string
  categoryId: string
  unit: RuleUnit
  minimum: number
  have: number
  met: boolean
}

/** The rules applying to a student, each with what `items` (fixed and assigned together) bring. */
export function ruleStandings(rules: readonly CampaignRule[], student: StudentOf, items: readonly RuledItem[], projectDays: readonly string[]): RuleStanding[] {
  return rules.filter((rule) => ruleApplies(rule, student)).map((rule) => {
    const have = ruleProgress(rule, items, projectDays)
    return { ruleId: rule.id, categoryId: rule.categoryId, unit: rule.unit, minimum: rule.minimum, have, met: have >= rule.minimum }
  })
}

/**
 * The most a list of wishes can bring to a rule: per time group the best
 * ranked activity of the category, summed over the groups. A group yields
 * one activity at most, so this is an upper bound (two groups may still
 * overlap); it is what the choice page asks a list to reach.
 */
export function rankingReach(rule: Pick<CampaignRule, 'categoryId' | 'unit'>, ranking: Ranking, groups: readonly Pick<TimeGroup, 'key' | 'itemIds'>[], items: ReadonlyMap<string, RuledItem>, projectDays: readonly string[]): number {
  return groups.reduce((sum, group) => {
    const ranked = (ranking[group.key] ?? []).filter((id) => group.itemIds.includes(id))
    return sum + Math.max(0, ...ranked.map((id) => {
      const item = items.get(id)
      return item ? ruleAmount(rule, item, projectDays) : 0
    }))
  }, 0)
}

/** A rule on the choice page: what the fixed activities bring, what the wishes can bring, and the most the offer could. */
export interface RuleReach {
  ruleId: string
  categoryId: string
  unit: RuleUnit
  minimum: number
  /** From the student's class activities. */
  fixed: number
  /** The most the ranked wishes can add (rankingReach). */
  ranked: number
  /** The most every offered activity could add, ranked or not: the offer's own limit. */
  offered: number
  /** Whether the list does what it can: fixed + ranked reaches the minimum, or everything the offer allows. */
  done: boolean
}

/**
 * The rules applying to a student on the choice page. A list is complete
 * only when, rule by rule, its wishes reach the minimum, or as far as the
 * offer can: a rule the offer cannot meet asks every activity of the
 * category the student may rank, not the impossible.
 */
export function ruleReaches(rules: readonly CampaignRule[], student: StudentOf, fixed: readonly RuledItem[], ranking: Ranking, groups: readonly Pick<TimeGroup, 'key' | 'itemIds'>[], items: ReadonlyMap<string, RuledItem>, projectDays: readonly string[]): RuleReach[] {
  const everything: Ranking = Object.fromEntries(groups.map((group) => [group.key, group.itemIds]))
  return rules.filter((rule) => ruleApplies(rule, student)).map((rule) => {
    const fromFixed = ruleProgress(rule, fixed, projectDays)
    const ranked = rankingReach(rule, ranking, groups, items, projectDays)
    const offered = rankingReach(rule, everything, groups, items, projectDays)
    const goal = Math.min(rule.minimum, fromFixed + offered)
    return { ruleId: rule.id, categoryId: rule.categoryId, unit: rule.unit, minimum: rule.minimum, fixed: fromFixed, ranked, offered, done: fromFixed + ranked >= goal }
  })
}

/** An activity as the rule demand sees it: its categories and credit, and who may take it. */
export interface RuledOffer extends RuledItem {
  fixedClasses: readonly string[]
  eligibleGrades: readonly number[]
  eligibleClasses: readonly string[]
  places: number
}

/** A rule for one grade before any list: what its students need of it and what the category offers them. */
export interface RuleDemand {
  ruleId: string
  grade: number
  /** Students of the grade the rule applies to. */
  students: number
  /** What their class activities leave of the minimum, summed over them: activities or minutes. */
  needed: number
  /** The most the category's activities they may rank could bring: places times what each brings, an activity open to several grades counted for each. */
  offered: number
}

/**
 * Per rule and grade, the need against the offer, from the roster's class
 * sizes and the catalogue: what the places page shows beside the days. The
 * offer is an upper bound (a shared activity's places count for every grade
 * that may take them), so an offer below the need is certain to fall short.
 */
export function ruleDemand(rules: readonly CampaignRule[], classes: readonly ClassSize[], items: readonly RuledOffer[], projectDays: readonly string[]): RuleDemand[] {
  const result: RuleDemand[] = []
  for (const rule of rules) {
    for (const grade of [...rule.grades].sort((a, b) => a - b)) {
      const own = classes.filter((c) => c.grade === grade && (rule.classes.length === 0 || rule.classes.includes(c.className)))
      if (own.length === 0) continue
      const students = own.reduce((sum, c) => sum + c.students, 0)
      const needed = own.reduce((sum, c) => {
        const fixed = ruleProgress(rule, items.filter((item) => item.fixedClasses.includes(c.className)), projectDays)
        return sum + c.students * Math.max(0, rule.minimum - fixed)
      }, 0)
      const open = items.filter((item) => item.places > 0 && own.some((c) => !item.fixedClasses.includes(c.className)
        && (item.eligibleGrades.length === 0 || item.eligibleGrades.includes(grade))
        && (item.eligibleClasses.length === 0 || item.eligibleClasses.includes(c.className))))
      const offered = open.reduce((sum, item) => sum + item.places * ruleAmount(rule, item, projectDays), 0)
      result.push({ ruleId: rule.id, grade, students, needed, offered })
    }
  }
  return result
}
