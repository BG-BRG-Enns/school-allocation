<script setup lang="ts">
// The classes a registration is for: a grid of checkboxes by grade, with a
// box per grade for the whole grade and two buttons for all and none. The
// options come from the class lists; a class the registration names that
// the lists no longer have stays in the grid, under its own heading, so it
// can be taken out.

import { computed } from 'vue'
import { t } from '../lib/i18n.ts'

const props = defineProps<{
  /** The classes to offer, name and grade, as the class lists have them. */
  options: readonly { className: string, grade: number }[]
  /** The classes chosen. */
  modelValue: readonly string[]
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

interface Group { grade: number | null, classes: string[] }

/** The grid by grade, in the lists' order; the chosen classes the lists do not have at the end. */
const groups = computed<Group[]>(() => {
  const byGrade = new Map<number, string[]>()
  for (const option of props.options) byGrade.set(option.grade, [...(byGrade.get(option.grade) ?? []), option.className])
  const known = new Set(props.options.map((option) => option.className))
  const gone = props.modelValue.filter((name) => !known.has(name)).sort((a, b) => a.localeCompare(b, 'de'))
  const list: Group[] = [...byGrade.entries()].sort((a, b) => a[0] - b[0]).map(([grade, classes]) => ({ grade, classes }))
  return gone.length > 0 ? [...list, { grade: null, classes: gone }] : list
})

const chosen = computed(() => new Set(props.modelValue))

function set(names: readonly string[], on: boolean): void {
  const next = new Set(props.modelValue)
  for (const name of names) {
    if (on) next.add(name)
    else next.delete(name)
  }
  emit('update:modelValue', [...next].sort((a, b) => a.localeCompare(b, 'de')))
}

/** What "all" chooses: the lists' classes; one gone from the lists is not brought back by it. "None" clears every class, the gone ones too. */
const all = computed(() => props.options.map((option) => option.className))
function none(): void {
  emit('update:modelValue', [])
}
function wholeGrade(group: Group): boolean {
  return group.classes.every((name) => chosen.value.has(name))
}
</script>

<template>
  <div class="class-picker">
    <p class="actions">
      <button
        type="button"
        class="ghost small"
        :disabled="disabled"
        @click="set(all, true)"
      >
        {{ t.campaigns.classes.selectAll }}
      </button>
      <button
        type="button"
        class="ghost small"
        :disabled="disabled"
        @click="none"
      >
        {{ t.campaigns.classes.selectNone }}
      </button>
    </p>
    <div
      v-for="group in groups"
      :key="group.grade ?? 'gone'"
      class="class-grade"
    >
      <label class="class-grade-label">
        <input
          type="checkbox"
          :checked="wholeGrade(group)"
          :disabled="disabled"
          :aria-label="group.grade === null ? t.campaigns.classes.gone : t.campaigns.classes.wholeGrade(group.grade)"
          @change="set(group.classes, ($event.target as HTMLInputElement).checked)"
        >
        <strong>{{ group.grade === null ? t.campaigns.classes.gone : t.campaigns.classes.grade(group.grade) }}</strong>
      </label>
      <div class="checks">
        <label
          v-for="name in group.classes"
          :key="name"
        >
          <input
            type="checkbox"
            :checked="chosen.has(name)"
            :disabled="disabled"
            @change="set([name], ($event.target as HTMLInputElement).checked)"
          >
          {{ name }}
        </label>
      </div>
    </div>
    <p
      v-if="groups.length === 0"
      class="muted"
    >
      {{ t.campaigns.classes.noneInLists }}
    </p>
  </div>
</template>
