<script setup lang="ts">
// The controls of a filter over a list: texts, choices and boxes in one
// row, how many rows pass, and a button that clears them. The values are
// the page's (lib/list-filter.ts useListFilter), so the page filters and
// the browser remembers.

import { computed } from 'vue'
import { isFiltering, type FilterField, type FilterValues } from '../lib/list-filter.ts'
import { t } from '../lib/i18n.ts'

const props = defineProps<{
  /** The id of the list, for the controls' ids. */
  id: string
  fields: readonly FilterField[]
  modelValue: FilterValues
  /** How many rows pass, of how many. */
  shown: number
  total: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: FilterValues] }>()

const active = computed(() => isFiltering(props.modelValue))

function set(key: string, value: string | boolean): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

/** Every value back to "not filtered": the fields shown, and a value kept for a field the page does not show right now (a category control a teacher has no categories for). */
function clear(): void {
  const kept = Object.fromEntries(Object.entries(props.modelValue).map(([key, value]) => [key, typeof value === 'boolean' ? false : '']))
  emit('update:modelValue', { ...kept, ...Object.fromEntries(props.fields.map((field) => [field.key, field.kind === 'check' ? false : ''])) })
}
</script>

<template>
  <div
    class="list-filter"
    role="group"
    :aria-label="t.filters.label"
  >
    <template
      v-for="field in fields"
      :key="field.key"
    >
      <label
        v-if="field.kind === 'check'"
        class="filter-check"
      >
        <input
          type="checkbox"
          :checked="modelValue[field.key] === true"
          @change="set(field.key, ($event.target as HTMLInputElement).checked)"
        >
        {{ field.label }}
      </label>
      <p
        v-else
        class="field"
      >
        <label :for="`${id}-${field.key}`">{{ field.label }}</label>
        <select
          v-if="field.kind === 'select'"
          :id="`${id}-${field.key}`"
          :value="String(modelValue[field.key] ?? '')"
          @change="set(field.key, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            {{ t.filters.all }}
          </option>
          <option
            v-for="option in field.options ?? []"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <input
          v-else
          :id="`${id}-${field.key}`"
          type="search"
          :value="String(modelValue[field.key] ?? '')"
          @input="set(field.key, ($event.target as HTMLInputElement).value)"
        >
      </p>
    </template>
    <p class="muted filter-count">
      {{ active ? t.filters.shown(shown, total) : t.filters.count(total) }}
      <button
        v-if="active"
        type="button"
        class="ghost small"
        @click="clear"
      >
        {{ t.filters.reset }}
      </button>
    </p>
  </div>
</template>
