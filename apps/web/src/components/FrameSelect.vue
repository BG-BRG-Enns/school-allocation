<script setup lang="ts">
// The attendance frame of a project day: two selects over the school's
// grid, "from period" with "no frame" as its first choice and "to period"
// once a start is chosen. The model is a Frame or null.

import type { Frame, Period } from '@school-allocation/school-core'
import { t } from '../lib/i18n.ts'

const props = defineProps<{
  modelValue: Frame | null
  grid: readonly Period[]
  /** The project day's number, counted from 1, for the labels. */
  day: number
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Frame | null] }>()

function onFrom(event: Event): void {
  const from = Number((event.target as HTMLSelectElement).value)
  if (from === 0) {
    emit('update:modelValue', null)
    return
  }
  emit('update:modelValue', { from, to: Math.max(from, props.modelValue?.to ?? from) })
}

function onTo(event: Event): void {
  const to = Number((event.target as HTMLSelectElement).value)
  emit('update:modelValue', { from: props.modelValue?.from ?? to, to })
}
</script>

<template>
  <select
    :aria-label="t.campaign.settings.frameFrom(day)"
    :value="modelValue?.from ?? 0"
    :disabled="disabled || grid.length === 0"
    @change="onFrom"
  >
    <option :value="0">
      {{ t.campaign.settings.noFrame }}
    </option>
    <option
      v-for="p in grid"
      :key="p.period"
      :value="p.period"
    >
      {{ t.format.period(p.period) }} ({{ p.starts }})
    </option>
  </select>
  <select
    v-if="modelValue"
    :aria-label="t.campaign.settings.frameTo(day)"
    :value="modelValue.to"
    :disabled="disabled"
    @change="onTo"
  >
    <option
      v-for="p in grid.filter((x) => x.period >= (modelValue?.from ?? 1))"
      :key="p.period"
      :value="p.period"
    >
      {{ t.format.period(p.period) }} ({{ p.ends }})
    </option>
  </select>
</template>
