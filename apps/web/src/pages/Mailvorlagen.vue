<script setup lang="ts">
// The texts of the mails the window sends, by kind, with the placeholders
// each may use; edited here by the organizer or the administration, and
// tried out with a test mail to one's own address.

import { computed, onMounted, ref } from 'vue'
import { loadMailTemplates, saveMailTemplate, sendTestMail, type MailTemplate, type TemplateInvalidBody } from '../lib/admin-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { useFeedback } from '../lib/feedback.ts'
import { MAIL_KIND_LABELS, TEMPLATE_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => 'Mailvorlagen')
const templates = ref<MailTemplate[]>([])
const mailEnabled = ref(false)
const loading = useFeedback()
const saving = useFeedback()
const problems = ref<string[]>([])
const editing = ref<{ kind: string, subject: string, body: string } | null>(null)
const mayEdit = computed(() => (session.value?.roles ?? []).some((role) => role === 'school_admin' || role === 'campaign_organizer'))

onMounted(() => loading.run(async () => {
  const result = await loadMailTemplates()
  templates.value = result.templates
  mailEnabled.value = result.mailEnabled
}))

/** The placeholders of a template as they are written, in one line; built here since the braces would end a template expression. */
function placeholderList(template: MailTemplate): string {
  return template.placeholders.map((p) => '{{' + p + '}}').join(', ')
}

function startEditing(template: MailTemplate): void {
  editing.value = { kind: template.kind, subject: template.subject, body: template.body }
  problems.value = []
}

async function onSave(): Promise<void> {
  const e = editing.value
  if (!e) return
  problems.value = []
  const ok = await saving.run(async () => {
    try {
      const saved = (await saveMailTemplate(e.kind, e.subject.trim(), e.body)).template
      templates.value = templates.value.map((t) => (t.kind === saved.kind ? saved : t))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'template_invalid') {
        const body = err.body as unknown as TemplateInvalidBody
        problems.value = body.problems.map((p) => `${TEMPLATE_PROBLEM_LABELS[p.code] ?? p.code}: ${p.message}`)
      }
      throw err
    }
  }, 'Vorlage gespeichert.')
  if (ok) editing.value = null
}

async function onTest(kind: string): Promise<void> {
  await saving.run(async () => {
    await sendTestMail(kind)
  }, 'Testmail an Ihre Adresse in die Warteschlange gestellt.')
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung">
      ← Verwaltung
    </RouterLink>
  </p>
  <h1>Mailvorlagen</h1>
  <p
    v-if="!mayEdit"
    role="alert"
  >
    Die Mailvorlagen ändern die Administration und die Organisation einer Wahl.
  </p>
  <template v-else>
    <p>Die Texte der Nachrichten, die eine Wahl verschickt. Platzhalter in doppelten geschweiften Klammern füllt das Programm beim Versand; jede Vorlage nennt die ihren.</p>
    <p
      v-if="!mailEnabled && !loading.busy.value"
      class="notice"
    >
      Der Mailversand ist auf diesem Server nicht eingerichtet: Nachrichten bleiben in der Warteschlange, bis er es ist.
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
      v-for="template in templates"
      :key="template.kind"
    >
      <h2>{{ MAIL_KIND_LABELS[template.kind] ?? template.kind }}</h2>
      <template v-if="editing?.kind !== template.kind">
        <p><strong>{{ template.subject }}</strong></p>
        <pre class="mail-body">{{ template.body }}</pre>
        <p class="muted">
          Platzhalter: {{ placeholderList(template) }}
        </p>
        <p class="actions">
          <button
            type="button"
            class="ghost"
            @click="startEditing(template)"
          >
            Bearbeiten
          </button>
          <button
            v-if="mailEnabled"
            type="button"
            class="ghost"
            :disabled="saving.busy.value"
            @click="onTest(template.kind)"
          >
            Testmail an mich
          </button>
        </p>
      </template>
      <form
        v-else-if="editing"
        class="panel"
        :aria-label="`${MAIL_KIND_LABELS[template.kind] ?? template.kind} bearbeiten`"
        @submit.prevent="onSave"
      >
        <p class="field">
          <label :for="`subject-${template.kind}`">Betreff</label>
          <input
            :id="`subject-${template.kind}`"
            v-model="editing.subject"
            required
            maxlength="200"
          >
        </p>
        <p class="field">
          <label :for="`body-${template.kind}`">Text</label>
          <textarea
            :id="`body-${template.kind}`"
            v-model="editing.body"
            rows="12"
            maxlength="8000"
            required
          />
        </p>
        <p class="muted">
          Platzhalter: {{ placeholderList(template) }}
        </p>
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
            Speichern
          </button>
          <button
            type="button"
            class="ghost"
            @click="editing = null"
          >
            Abbrechen
          </button>
        </p>
      </form>
    </section>
  </template>
</template>
