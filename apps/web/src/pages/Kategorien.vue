<script setup lang="ts">
// The school's categories (sport, careers guidance …): one list for every
// registration, by name. An activity belongs to some, a registration's
// rule asks for some of one. Kept by administrators and organizers,
// audited; a category in use is only renamed, which the server decides.

import { computed, onMounted, ref } from 'vue'
import { createCategory, loadCategoryUsage, removeCategory, renameCategory, type CategoryUsage } from '../lib/admin-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { t } from '../lib/i18n.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => t.common.page.categories)
const categories = ref<CategoryUsage[]>([])
const loading = useFeedback()
const saving = useFeedback()
const mayEdit = computed(() => (session.value?.roles ?? []).some((role) => role === 'school_admin' || role === 'campaign_organizer'))
const newName = ref('')
/** The category being renamed, with the name as it will be saved. */
const editing = ref<{ id: string, was: string, name: string } | null>(null)

onMounted(() => loading.run(async () => {
  categories.value = (await loadCategoryUsage()).categories
}))

async function onAdd(): Promise<void> {
  const name = newName.value.trim()
  if (name === '') return
  const ok = await saving.run(async () => {
    categories.value = (await createCategory(name)).categories
  }, t.categories.added)
  if (ok) newName.value = ''
}

async function onRename(): Promise<void> {
  const e = editing.value
  if (!e) return
  const ok = await saving.run(async () => {
    categories.value = (await renameCategory(e.id, e.name.trim())).categories
  }, t.categories.renamed)
  if (ok) editing.value = null
}

async function onRemove(category: CategoryUsage): Promise<void> {
  await saving.run(async () => {
    categories.value = (await removeCategory(category.id)).categories
  }, t.categories.removed)
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung">
      ← {{ t.common.page.admin }}
    </RouterLink>
  </p>
  <h1>{{ t.common.page.categories }}</h1>
  <p
    v-if="!mayEdit"
    role="alert"
  >
    {{ t.categories.editorsOnly }}
  </p>
  <template v-else>
    <p>{{ t.categories.intro }}</p>
    <p
      v-if="loading.error.value"
      role="alert"
      class="alert"
    >
      {{ loading.error.value }}
    </p>
    <p v-if="!loading.busy.value && categories.length === 0">
      {{ t.categories.none }}
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th scope="col">
            {{ t.categories.name }}
          </th>
          <th scope="col">
            {{ t.categories.usedBy }}
          </th>
          <th scope="col">
            <span class="visually-hidden">{{ t.common.field.actions }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="c in categories"
          :key="c.id"
        >
          <td>{{ c.name }}</td>
          <td>{{ t.categories.usage(c.items, c.rules) }}</td>
          <td class="row-actions">
            <button
              type="button"
              class="ghost"
              :aria-label="t.categories.renameOf(c.name)"
              @click="editing = { id: c.id, was: c.name, name: c.name }"
            >
              {{ t.categories.rename }}
            </button>
            <button
              v-if="c.items === 0 && c.rules === 0"
              type="button"
              class="ghost"
              :aria-label="t.categories.removeOf(c.name)"
              :disabled="saving.busy.value"
              @click="onRemove(c)"
            >
              {{ t.common.remove }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <form
      v-if="editing"
      class="panel"
      :aria-label="t.categories.renameOf(editing.was)"
      @submit.prevent="onRename"
    >
      <p class="field">
        <label for="category-rename">{{ t.categories.renameOf(editing.was) }}</label>
        <input
          id="category-rename"
          v-model="editing.name"
          required
          maxlength="60"
        >
      </p>
      <p class="actions">
        <button
          type="submit"
          :disabled="saving.busy.value"
        >
          {{ t.common.save }}
        </button>
        <button
          type="button"
          class="ghost"
          @click="editing = null"
        >
          {{ t.common.cancel }}
        </button>
      </p>
    </form>
    <form
      v-else
      class="panel"
      :aria-label="t.categories.add"
      @submit.prevent="onAdd"
    >
      <p class="field">
        <label for="category-new">{{ t.categories.newName }}</label>
        <input
          id="category-new"
          v-model="newName"
          required
          maxlength="60"
        >
      </p>
      <p class="actions">
        <button
          type="submit"
          :disabled="saving.busy.value"
        >
          {{ t.categories.add }}
        </button>
      </p>
    </form>
    <p
      v-if="saving.error.value"
      role="alert"
      class="alert"
    >
      {{ saving.error.value }}
    </p>
    <p
      v-if="saving.notice.value"
      role="status"
      class="notice"
    >
      {{ saving.notice.value }}
    </p>
  </template>
</template>
