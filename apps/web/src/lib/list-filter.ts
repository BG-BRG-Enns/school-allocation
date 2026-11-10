// A filter over a list the page holds whole: its fields, its values
// remembered by the browser (ui-state.ts), and the tests a row's texts
// are put to. The predicate is the page's; this keeps what every page
// shares.

import { computed, type Ref } from 'vue'
import { useUiState } from './ui-state.ts'

/** One control of a filter bar: a text, a choice among options, or a box. */
export interface FilterField {
  key: string
  kind: 'text' | 'select' | 'check'
  label: string
  /** The choices of a select; the empty value is "all". */
  options?: readonly { value: string, label: string }[]
}

/** The values by field key: '' or false means "not filtered by this". */
export type FilterValues = Record<string, string | boolean>

/** The filter's values, remembered under `id`; a field the stored values lack starts from `initial`, so every key the page reads is there. */
export function useListFilter(id: string, initial: FilterValues): Ref<FilterValues> {
  const state = useUiState<FilterValues>(`${id}:filter`, initial)
  state.value = { ...initial, ...state.value }
  return state
}

/** Whether `chosen` is one of `values`, or nothing is chosen (also a value the page never set). */
export function matchesOneOf(values: readonly string[], chosen: string | boolean | undefined): boolean {
  return chosen === '' || chosen === undefined || chosen === false || chosen === true || values.includes(chosen)
}

/** Whether any value filters. */
export function isFiltering(values: FilterValues): boolean {
  return differsFrom(values, {})
}

/** What a value rests at: the page's default for its key, else "not filtered" for its kind. */
function restOf(initial: FilterValues, key: string, box: boolean): string | boolean {
  return initial[key] ?? (box ? false : '')
}

/** Whether any value is not the one the page starts from (`initial`; a key it lacks starts at "not filtered"). */
export function differsFrom(values: FilterValues, initial: FilterValues): boolean {
  return Object.entries(values).some(([key, value]) => value !== restOf(initial, key, typeof value === 'boolean'))
}

/**
 * The values as the page starts from them: every field shown at its
 * default, and so a value kept for a field the page does not show right
 * now (a category control a teacher has no categories for).
 */
export function restored(values: FilterValues, fields: readonly FilterField[], initial: FilterValues): FilterValues {
  const kept = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, restOf(initial, key, typeof value === 'boolean')]))
  return { ...kept, ...Object.fromEntries(fields.map((field) => [field.key, restOf(initial, field.key, field.kind === 'check')])) }
}

/** The choice of state an activity list starts from: every activity but the withdrawn ones. Not a state of an activity (school-core ITEM_STATES). */
export const ACTIVE_ITEMS = 'active'

/** Whether an activity in `state` passes the chosen state: the active ones are all but the withdrawn; else as any option. */
export function matchesItemState(state: string, chosen: string | boolean | undefined): boolean {
  return chosen === ACTIVE_ITEMS ? state !== 'withdrawn' : matchesOption(state, chosen)
}

/** Whether one of `texts` contains `needle`, case-insensitively; an empty needle matches everything. */
export function matchesText(texts: readonly (string | null | undefined)[], needle: unknown): boolean {
  const wanted = typeof needle === 'string' ? needle.trim().toLocaleLowerCase('de') : ''
  if (wanted === '') return true
  return texts.some((text) => (text ?? '').toLocaleLowerCase('de').includes(wanted))
}

/** Whether `value` is the chosen option, or none is chosen. */
export function matchesOption(value: string | number | null | undefined, chosen: string | boolean | undefined): boolean {
  return chosen === '' || chosen === undefined || chosen === false || chosen === true || String(value ?? '') === chosen
}

/** The rows that pass `predicate` under the filter's current values, as a computed. */
export function filtered<T>(rows: Ref<readonly T[]> | (() => readonly T[]), values: Ref<FilterValues>, predicate: (row: T, values: FilterValues) => boolean) {
  return computed(() => {
    const list = typeof rows === 'function' ? rows() : rows.value
    return list.filter((row) => predicate(row, values.value))
  })
}
