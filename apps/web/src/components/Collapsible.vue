<script setup lang="ts">
// A section of a page that folds: a <details> whose heading is its
// <summary>, open unless the person folded it, and folded until they open
// it again, across pages and visits (lib/ui-state.ts). The heading keeps
// its level, so the page's outline and the journeys' lookups by heading
// stay as they are. Nothing a form requires goes inside one: a folded
// required field could not be filled.

import { useUiState } from '../lib/ui-state.ts'

const props = withDefaults(defineProps<{
  /** The key the state is kept under, literal per page and section ("wahl:status"). */
  id: string
  heading: string
  level?: 2 | 3
}>(), { level: 2 })

const open = useUiState<boolean>(`${props.id}:open`, true)

function onToggle(event: Event): void {
  open.value = (event.target as HTMLDetailsElement).open
}
</script>

<template>
  <details
    class="collapsible"
    :open="open"
    @toggle="onToggle"
  >
    <summary>
      <h2 v-if="level === 2">
        {{ heading }}
      </h2>
      <h3 v-else>
        {{ heading }}
      </h3>
    </summary>
    <slot />
  </details>
</template>
