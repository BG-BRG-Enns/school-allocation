// A seeded source of chance for the scenario: the same seed gives the same
// school, the same choices and the same moments, on every machine.
// Mulberry32, enough for drawing names and wishes; nothing here is secret.

export interface Random {
  /** A number in [0, 1). */
  next: () => number
  /** A whole number in [0, n). */
  below: (n: number) => number
  /** True with probability p. */
  chance: (p: number) => boolean
  pick: <T>(values: readonly T[]) => T
  /** A copy of `values` in an order of chance. */
  shuffled: <T>(values: readonly T[]) => T[]
  /** An index drawn in proportion to `weights`. */
  weighted: (weights: readonly number[]) => number
  /** A source of its own for `label`, so that drawing more in one place changes nothing elsewhere. */
  fork: (label: string) => Random
}

export function random(seed: number): Random {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const below = (n: number) => Math.floor(next() * n)
  return {
    next,
    below,
    chance: (p) => next() < p,
    pick: (values) => {
      if (values.length === 0) throw new Error('nothing to pick from')
      return values[below(values.length)] as (typeof values)[number]
    },
    shuffled: (values) => {
      const copy = [...values]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = below(i + 1)
        ;[copy[i], copy[j]] = [copy[j] as (typeof copy)[number], copy[i] as (typeof copy)[number]]
      }
      return copy
    },
    weighted: (weights) => {
      const total = weights.reduce((sum, w) => sum + w, 0)
      let at = next() * total
      for (const [index, weight] of weights.entries()) {
        at -= weight
        if (at < 0) return index
      }
      return weights.length - 1
    },
    fork: (label) => random(hash(`${seed}:${label}`)),
  }
}

/** FNV-1a over the label: a seed for a fork. */
function hash(label: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A version 4 UUID drawn from `rng`, lower case, as Entra writes object ids. */
export function uuid(rng: Random): string {
  const hex = Array.from({ length: 32 }, () => rng.below(16).toString(16))
  hex[12] = '4'
  hex[16] = (8 + rng.below(4)).toString(16)
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}
