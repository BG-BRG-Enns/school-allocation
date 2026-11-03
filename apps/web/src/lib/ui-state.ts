// What a page remembers about how it was shown: a section folded, a filter
// set. Kept in the browser's localStorage under the app's base path, so a
// class filter stays while the organizer walks between the registration,
// the class and the allocation, and a folded section stays folded. It is
// the way the page looks, not data: no user id, nothing the server knows
// of, and a value that does not parse or has another shape falls back to
// the initial one. Keys are literal per page and section
// (`wahl:status`), never derived from a route.

import { ref, watch, type Ref } from 'vue'
import { BASE_PATH } from './base.ts'

const PREFIX = `schulwahl:${BASE_PATH}:`

/** The browser's storage, or nothing where it is denied (a private window with storage off) or absent (a test of a pure module). */
function storage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage
  } catch {
    return undefined
  }
}

/** Whether `value` has the shape of `initial`: the same type, and an array where an array is expected. */
function sameShape(value: unknown, initial: unknown): boolean {
  if (Array.isArray(initial)) return Array.isArray(value)
  if (initial === null) return value === null
  return typeof value === typeof initial && !Array.isArray(value)
}

/** What was stored under `key`, when it has the shape of `initial`; else `initial`. */
export function readUiState<T>(key: string, initial: T): T {
  const raw = storage()?.getItem(PREFIX + key) ?? null
  if (raw === null) return initial
  try {
    const parsed: unknown = JSON.parse(raw)
    return sameShape(parsed, initial) ? parsed as T : initial
  } catch {
    return initial
  }
}

/** A ref that starts from what the browser remembers under `key` and writes every change back. */
export function useUiState<T>(key: string, initial: T): Ref<T> {
  const state = ref(readUiState(key, initial)) as Ref<T>
  watch(state, (next) => {
    try {
      storage()?.setItem(PREFIX + key, JSON.stringify(next))
    } catch {
      // Storage full or denied: the state lives as long as the page.
    }
  }, { deep: true })
  return state
}
