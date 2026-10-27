<script setup lang="ts">
// One campaign: its state and days, the activities as far as the person
// may see them, and what they may do: teachers propose and tend their own,
// organizers review, move the campaign on and export the catalogue.

import { computed, onMounted, ref, watch } from 'vue'
import { approveItem, catalogueExportPath, deleteItem, loadCampaign, loadItems, proposeItem, returnItem, transitionCampaign, unproposeItem, updateCampaign, withdrawItem, type CampaignView, type Item } from '../lib/campaigns-api.ts'
import { withBase } from '../lib/base.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatFee, formatSpan } from '../lib/format.ts'
import { CAMPAIGN_STATE_LABELS, ITEM_STATE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

const props = defineProps<{ id: string }>()
const view = ref<CampaignView | null>(null)
const items = ref<Item[]>([])
const loading = useFeedback()
const action = useFeedback()
usePageTitle(() => view.value?.campaign.name ?? 'Wahl')

async function load(): Promise<void> {
  await loading.run(async () => {
    const [v, list] = await Promise.all([loadCampaign(props.id), loadItems(props.id)])
    view.value = v
    items.value = list.items
  })
}
onMounted(load)
watch(() => props.id, load)

const campaign = computed(() => view.value?.campaign)
const organizes = computed(() => view.value?.may.organize ?? false)
const published = computed(() => campaign.value !== undefined && !['draft', 'catalogue'].includes(campaign.value.state))

/** Whether the item is the signed-in person's: proposed by them or taught by them. */
function own(item: Item): boolean {
  const me = session.value
  return me !== null && me !== undefined && (item.proposedBy.id === me.id || item.teachers.some((t) => t.personId === me.person?.id))
}

// Organizer's settings.
const editing = ref(false)
const name = ref('')
const schoolYear = ref('')
const days = ref<string[]>([])
function startEditing(): void {
  if (!campaign.value) return
  name.value = campaign.value.name
  schoolYear.value = campaign.value.schoolYear
  days.value = [...campaign.value.projectDays]
  editing.value = true
}
async function onSaveSettings(): Promise<void> {
  const ok = await action.run(async () => {
    await updateCampaign(props.id, { name: name.value.trim(), schoolYear: schoolYear.value.trim(), projectDays: days.value.filter(Boolean) })
  }, 'Gespeichert.')
  if (ok) {
    editing.value = false
    await load()
  }
}
async function onTransition(to: 'catalogue' | 'published'): Promise<void> {
  const ok = await action.run(async () => {
    await transitionCampaign(props.id, to)
  })
  if (ok) await load()
}

// Item actions, with a reason or note where one is required.
type Pending = { item: Item, kind: 'return' | 'withdraw' } | null
const pending = ref<Pending>(null)
const text = ref('')
function ask(item: Item, kind: 'return' | 'withdraw'): void {
  pending.value = { item, kind }
  text.value = ''
}
async function act(fn: () => Promise<unknown>, done?: string): Promise<void> {
  const ok = await action.run(async () => {
    await fn()
  }, done)
  if (ok) {
    pending.value = null
    await load()
  }
}
function onSubmitPending(): void {
  const p = pending.value
  if (!p) return
  void act(() => p.kind === 'return' ? returnItem(p.item.id, text.value.trim()) : withdrawItem(p.item.id, text.value.trim()))
}
</script>

<template>
  <p>
    <RouterLink to="/wahlen">
      ← Wahlen
    </RouterLink>
  </p>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="campaign && view">
    <h1>{{ campaign.name }}</h1>
    <p>
      <span class="badge">{{ CAMPAIGN_STATE_LABELS[campaign.state] ?? campaign.state }}</span>
      Schuljahr {{ campaign.schoolYear }} · Projekttage: {{ campaign.projectDays.map(formatDay).join(', ') }}
    </p>
    <p
      v-if="action.error.value"
      role="alert"
      class="alert"
    >
      {{ action.error.value }}
    </p>
    <p
      v-if="action.notice.value"
      role="status"
      class="notice"
    >
      {{ action.notice.value }}
    </p>

    <section v-if="organizes">
      <h2>Organisation</h2>
      <p
        v-if="view.counts"
        class="muted"
      >
        {{ view.counts.draft }} Entwürfe · {{ view.counts.proposed }} eingereicht · {{ view.counts.approved }} genehmigt · {{ view.counts.withdrawn }} zurückgezogen
      </p>
      <p class="actions">
        <button
          v-if="campaign.state === 'draft'"
          type="button"
          :disabled="action.busy.value"
          @click="onTransition('catalogue')"
        >
          Aktivitäten sammeln
        </button>
        <button
          v-if="campaign.state === 'catalogue'"
          type="button"
          :disabled="action.busy.value"
          @click="onTransition('published')"
        >
          Katalog veröffentlichen
        </button>
        <button
          v-if="!editing && (campaign.state === 'draft' || campaign.state === 'catalogue')"
          type="button"
          class="ghost"
          @click="startEditing"
        >
          Einstellungen ändern
        </button>
        <a
          class="button ghost-link"
          :href="withBase(catalogueExportPath(campaign.id))"
        >Katalog als Excel</a>
      </p>
      <form
        v-if="editing"
        class="panel"
        aria-label="Einstellungen der Wahl"
        @submit.prevent="onSaveSettings"
      >
        <p class="field">
          <label for="edit-name">Bezeichnung</label>
          <input
            id="edit-name"
            v-model="name"
            required
            maxlength="200"
          >
        </p>
        <p class="field">
          <label for="edit-year">Schuljahr</label>
          <input
            id="edit-year"
            v-model="schoolYear"
            required
            pattern="[0-9]{4}/[0-9]{2}"
            size="8"
          >
        </p>
        <fieldset class="field">
          <legend>Projekttage</legend>
          <p
            v-for="(_, index) in days"
            :key="index"
            class="actions"
          >
            <input
              v-model="days[index]"
              :aria-label="`Projekttag ${index + 1}`"
              type="date"
              required
            >
            <button
              v-if="days.length > 1"
              type="button"
              class="ghost"
              @click="days.splice(index, 1)"
            >
              Entfernen
            </button>
          </p>
          <p>
            <button
              type="button"
              class="ghost"
              :disabled="days.length >= 10"
              @click="days.push('')"
            >
              Tag hinzufügen
            </button>
          </p>
        </fieldset>
        <p class="actions">
          <button
            type="submit"
            :disabled="action.busy.value"
          >
            Speichern
          </button>
          <button
            type="button"
            class="ghost"
            @click="editing = false"
          >
            Abbrechen
          </button>
        </p>
      </form>
    </section>

    <section>
      <h2>Aktivitäten</h2>
      <p class="actions">
        <RouterLink
          v-if="view.may.propose"
          class="button"
          :to="`/wahlen/${campaign.id}/aktivitaet/neu`"
        >
          Neue Aktivität
        </RouterLink>
        <RouterLink
          v-if="published || organizes"
          class="button ghost-link"
          :to="`/wahlen/${campaign.id}/katalog`"
        >
          Katalog ansehen
        </RouterLink>
      </p>
      <p v-if="items.length === 0">
        Noch keine Aktivitäten.
      </p>
      <table
        v-else
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              Nr.
            </th>
            <th scope="col">
              Aktivität
            </th>
            <th scope="col">
              Lehrkräfte
            </th>
            <th scope="col">
              Termine
            </th>
            <th scope="col">
              Plätze
            </th>
            <th scope="col">
              Stand
            </th>
            <th scope="col">
              <span class="visually-hidden">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
          >
            <td>{{ item.number ?? '–' }}</td>
            <td>
              <strong>{{ item.title }}</strong>
              <span
                v-if="item.fixedClasses.length > 0"
                class="muted"
              > · fix für {{ item.fixedClasses.join(', ') }}</span>
              <span
                v-if="item.feeCents > 0"
                class="muted"
              > · {{ formatFee(item.feeCents) }}</span>
              <p
                v-if="item.reviewNote && (own(item) || organizes)"
                class="muted"
              >
                Rückmeldung: {{ item.reviewNote }}
              </p>
            </td>
            <td>{{ item.teachers.map((t) => t.displayName).join(', ') }}</td>
            <td>
              <ul class="plain">
                <li
                  v-for="s in item.sessions"
                  :key="s.id"
                >
                  {{ formatSpan(s.startsAt, s.endsAt) }}
                </li>
              </ul>
            </td>
            <td>{{ item.places }}</td>
            <td><span :class="['badge', `badge-${item.state}`]">{{ ITEM_STATE_LABELS[item.state] ?? item.state }}</span></td>
            <td class="row-actions">
              <RouterLink
                v-if="(own(item) && item.state === 'draft' && campaign.state === 'catalogue') || (organizes && item.state !== 'withdrawn')"
                class="button ghost-link small"
                :to="`/wahlen/${campaign.id}/aktivitaet/${item.id}`"
              >
                Bearbeiten
              </RouterLink>
              <button
                v-if="own(item) && item.state === 'draft' && campaign.state === 'catalogue'"
                type="button"
                class="ghost"
                @click="act(() => proposeItem(item.id), 'Eingereicht.')"
              >
                Einreichen
              </button>
              <button
                v-if="own(item) && item.state === 'proposed' && campaign.state === 'catalogue' && !organizes"
                type="button"
                class="ghost"
                @click="act(() => unproposeItem(item.id))"
              >
                Zurück zum Entwurf
              </button>
              <button
                v-if="own(item) && item.state === 'draft'"
                type="button"
                class="ghost"
                @click="act(() => deleteItem(item.id), 'Entwurf gelöscht.')"
              >
                Löschen
              </button>
              <button
                v-if="organizes && item.state === 'proposed'"
                type="button"
                @click="act(() => approveItem(item.id), 'Genehmigt.')"
              >
                Genehmigen
              </button>
              <button
                v-if="organizes && (item.state === 'proposed' || item.state === 'approved')"
                type="button"
                class="ghost"
                @click="ask(item, 'return')"
              >
                Zurückgeben
              </button>
              <button
                v-if="organizes && item.state !== 'withdrawn' && !(own(item) && item.state === 'draft')"
                type="button"
                class="ghost"
                @click="ask(item, 'withdraw')"
              >
                Zurückziehen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <form
        v-if="pending"
        class="panel"
        :aria-label="pending.kind === 'return' ? `${pending.item.title} zurückgeben` : `${pending.item.title} zurückziehen`"
        @submit.prevent="onSubmitPending"
      >
        <h3>{{ pending.kind === 'return' ? `${pending.item.title} zurückgeben` : `${pending.item.title} zurückziehen` }}</h3>
        <p class="field">
          <label for="pending-text">{{ pending.kind === 'return' ? 'Rückmeldung an die Lehrkräfte' : 'Begründung' }}</label>
          <input
            id="pending-text"
            v-model="text"
            required
            maxlength="500"
          >
        </p>
        <p class="actions">
          <button
            type="submit"
            :disabled="action.busy.value"
          >
            {{ pending.kind === 'return' ? 'Zurückgeben' : 'Zurückziehen' }}
          </button>
          <button
            type="button"
            class="ghost"
            @click="pending = null"
          >
            Abbrechen
          </button>
        </p>
      </form>
    </section>
  </template>
</template>
