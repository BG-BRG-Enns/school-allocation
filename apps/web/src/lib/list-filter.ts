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

/** The filter's values, remembered under `id`; a value stored for a field that is gone is ignored. */
export function useListFilter(id: string, initial: FilterValues): Ref<FilterValues> {
  return useUiState<FilterValues>(`${id}:filter`, initial)
}

/** Whether any value filters. */
export function isFiltering(values: FilterValues): boolean {
  return Object.values(values).some((value) => value !== '' && value !== false)
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
