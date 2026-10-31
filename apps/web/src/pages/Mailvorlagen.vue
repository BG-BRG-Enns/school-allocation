<script setup lang="ts">
// The texts of the mails the window sends, by kind: the school's own where
// an organizer saved one, else the default in the school's language. Edited
// here by the organizer or the administration, with the placeholders each
// kind may use listed with their meaning (a click puts one where the cursor
// was), reset to the default, and tried out with a test mail to one's own
// address. Above them, the sending: its pace, what waits and until when,
// and a button to pause it.

import type { MailKind } from '@school-allocation/api-contracts'
import { computed, nextTick, onMounted, ref } from 'vue'
import { loadMailStatus, loadMailTemplates, resetMailTemplate, saveMailTemplate, sendTestMail, setMailPaused, type MailStatusResponse, type MailTemplate, type TemplateInvalidBody } from '../lib/admin-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { formatWhen, useFeedback } from '../lib/feedback.ts'
import { LOCALE, t } from '../lib/i18n.ts'
import { MAIL_KIND_LABELS, TEMPLATE_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => t.common.page.mailTemplates)
const templates = ref<MailTemplate[]>([])
const mailEnabled = ref(false)
const status = ref<MailStatusResponse | null>(null)
const loading = useFeedback()
const saving = useFeedback()
const problems = ref<string[]>([])
const editing = ref<{ kind: MailKind, subject: string, body: string } | null>(null)
const mayEdit = computed(() => (session.value?.roles ?? []).some((role) => role === 'school_admin' || role === 'campaign_organizer'))

/** What each placeholder stands for, by its name as the API lists it. */
const MEANINGS: Readonly<Record<string, string>> = t.mailTemplates.placeholder
/** The languages by code, for a text saved in another one than the school's. */
const LOCALE_LABELS: Readonly<Record<string, string>> = t.labels.locale

onMounted(() => loading.run(async () => {
  const [result, sending] = await Promise.all([loadMailTemplates(), loadMailStatus()])
  templates.value = result.templates
  mailEnabled.value = result.mailEnabled
  status.value = sending
}))

/** What waits, in a sentence; none when nothing does. */
const waiting = computed(() => {
  const w = status.value?.waiting
  if (!w || w.personal + w.staff + w.students === 0) return t.mailTemplates.sending.none
  return t.mailTemplates.sending.waiting(w.personal, w.staff, w.students)
})

async function onPause(paused: boolean): Promise<void> {
  await saving.run(async () => {
    status.value = await setMailPaused(paused)
  }, paused ? t.mailTemplates.sending.pausedDone : t.mailTemplates.sending.resumedDone)
}

/** A placeholder as it is written in a template; built here since the braces would end a template expression. */
function written(name: string): string {
  return '{{' + name + '}}'
}

/** The placeholders of a template as they are written, in one line. */
function placeholderList(template: MailTemplate): string {
  return template.placeholders.map(written).join(', ')
}

/** A text the school saved in another language than the one it speaks now. */
function otherLanguage(template: MailTemplate): string | null {
  if (!template.custom || template.locale === LOCALE) return null
  return t.mailTemplates.otherLanguage(template.locale === null ? '?' : LOCALE_LABELS[template.locale] ?? template.locale)
}

// The field a placeholder goes into: the one last focused, the text until the subject was.
const lastField = ref<'subject' | 'body'>('body')

function startEditing(template: MailTemplate): void {
  editing.value = { kind: template.kind, subject: template.subject, body: template.body }
  lastField.value = 'body'
  problems.value = []
}

/** Puts `{{name}}` where the cursor is (or was) in the field last focused, in place of a selection, and the cursor after it. */
async function insertPlaceholder(name: string): Promise<void> {
  const e = editing.value
  if (!e) return
  const field = document.getElementById(`${lastField.value}-${e.kind}`) as HTMLInputElement | HTMLTextAreaElement | null
  if (!field) return
  const text = written(name)
  const value = e[lastField.value]
  const start = field.selectionStart ?? value.length
  const end = field.selectionEnd ?? start
  e[lastField.value] = value.slice(0, start) + text + value.slice(end)
  await nextTick()
  field.focus()
  field.setSelectionRange(start + text.length, start + text.length)
}

function replaced(saved: MailTemplate): void {
  templates.value = templates.value.map((template) => (template.kind === saved.kind ? saved : template))
}

async function onSave(): Promise<void> {
  const e = editing.value
  if (!e) return
  problems.value = []
  const ok = await saving.run(async () => {
    try {
      replaced((await saveMailTemplate(e.kind, e.subject.trim(), e.body)).template)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'template_invalid') {
        const body = err.body as unknown as TemplateInvalidBody
        problems.value = body.problems.map((p) => `${TEMPLATE_PROBLEM_LABELS[p.code] ?? p.code}: ${p.message}`)
      }
      throw err
    }
  }, t.mailTemplates.saved)
  if (ok) editing.value = null
}

async function onReset(kind: MailKind): Promise<void> {
  if (!window.confirm(t.mailTemplates.resetConfirm)) return
  await saving.run(async () => {
    replaced((await resetMailTemplate(kind)).template)
  }, t.mailTemplates.resetDone)
}

async function onTest(kind: MailKind): Promise<void> {
  await saving.run(async () => {
    await sendTestMail(kind)
    status.value = await loadMailStatus()
  }, t.mailTemplates.testQueued)
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung">
      ← {{ t.common.page.admin }}
    </RouterLink>
  </p>
  <h1>{{ t.common.page.mailTemplates }}</h1>
  <p
    v-if="!mayEdit"
    role="alert"
  >
    {{ t.mailTemplates.editorsOnly }}
  </p>
  <template v-else>
    <p>{{ t.mailTemplates.intro }}</p>
    <p
      v-if="!mailEnabled && !loading.busy.value"
      class="notice"
    >
      {{ t.mailTemplates.mailOff }}
    </p>
    <p
      v-if="loading.error.value"
      role="alert"
      class="alert"
    >
      {{ loading.error.value }}
    </p>
    <p
      v-if="saving.error.value && problems.length === 0"
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
    <section
      v-if="status?.perHour"
      aria-labelledby="sending"
    >
      <h2 id="sending">
        {{ t.mailTemplates.sending.heading }}
      </h2>
      <p>{{ t.mailTemplates.sending.pace(status.perHour) }}</p>
      <p
        v-if="status.paused"
        class="notice"
      >
        {{ t.mailTemplates.sending.paused }}
      </p>
      <p v-else>
        {{ t.mailTemplates.sending.pauseHint }}
      </p>
      <p>{{ waiting }}</p>
      <p v-if="status.expectedEndAt">
        {{ t.mailTemplates.sending.expectedEnd(formatWhen(status.expectedEndAt)) }}
      </p>
      <p class="actions">
        <button
          type="button"
          :class="status.paused ? undefined : 'ghost'"
          :disabled="saving.busy.value"
          @click="onPause(!status.paused)"
        >
          {{ status.paused ? t.mailTemplates.sending.resume : t.mailTemplates.sending.pause }}
        </button>
      </p>
    </section>
    <section
      v-for="template in templates"
      :key="template.kind"
    >
      <h2>{{ MAIL_KIND_LABELS[template.kind] ?? template.kind }}</h2>
      <p>
        <span class="badge">{{ template.custom ? t.mailTemplates.customText : t.mailTemplates.defaultText }}</span>
      </p>
      <p
        v-if="otherLanguage(template)"
        class="alert"
      >
        {{ otherLanguage(template) }}
      </p>
      <template v-if="editing?.kind !== template.kind">
        <p><strong>{{ template.subject }}</strong></p>
        <pre class="mail-body">{{ template.body }}</pre>
        <p class="muted">
          {{ t.mailTemplates.placeholders }}: {{ placeholderList(template) }}
        </p>
        <p class="actions">
          <button
            type="button"
            class="ghost"
            @click="startEditing(template)"
          >
            {{ t.common.edit }}
          </button>
          <button
            v-if="template.custom"
            type="button"
            class="ghost"
            :disabled="saving.busy.value"
            @click="onReset(template.kind)"
          >
            {{ t.mailTemplates.reset }}
          </button>
          <button
            v-if="mailEnabled"
            type="button"
            class="ghost"
            :disabled="saving.busy.value"
            @click="onTest(template.kind)"
          >
            {{ t.mailTemplates.sendTest }}
          </button>
        </p>
      </template>
      <form
        v-else-if="editing"
        class="panel"
        :aria-label="t.mailTemplates.editing(MAIL_KIND_LABELS[template.kind] ?? template.kind)"
        @submit.prevent="onSave"
      >
        <p class="field">
          <label :for="`subject-${template.kind}`">{{ t.mailTemplates.subject }}</label>
          <input
            :id="`subject-${template.kind}`"
            v-model="editing.subject"
            required
            maxlength="200"
            @focus="lastField = 'subject'"
          >
        </p>
        <p class="field">
          <label :for="`body-${template.kind}`">{{ t.mailTemplates.body }}</label>
          <textarea
            :id="`body-${template.kind}`"
            v-model="editing.body"
            rows="12"
            maxlength="8000"
            required
            @focus="lastField = 'body'"
          />
        </p>
        <h3>{{ t.mailTemplates.placeholders }}</h3>
        <p class="muted">
          {{ t.mailTemplates.placeholderHint }}
        </p>
        <ul class="plain placeholders">
          <li
            v-for="name in template.placeholders"
            :key="name"
          >
            <button
              type="button"
              class="ghost"
              @mousedown.prevent
              @click="insertPlaceholder(name)"
            >
              {{ written(name) }}
            </button>
            {{ MEANINGS[name] ?? '' }}
          </li>
        </ul>
        <ul
          v-if="problems.length > 0"
          class="alert"
          role="alert"
        >
          <li
            v-for="problem in problems"
            :key="problem"
          >
            {{ problem }}
          </li>
        </ul>
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
    </section>
  </template>
</template>
