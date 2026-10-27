<script setup lang="ts">
// Accounts and roles: who has signed in, which roster person the account
// is, which roles they hold, whether they are blocked. An account the
// roster did not recognise is bound to a person here; roles are granted
// and revoked here. Every action asks for a reason, which the audit log
// keeps.

import { computed, onMounted, ref } from 'vue'
import { bindAccount, blockAccount, grantRole, loadAccounts, loadGrants, revokeGrant, searchPersons, unblockAccount, type Account, type Grant, type RosterPerson } from '../lib/admin-api.ts'
import { formatWhen, useFeedback } from '../lib/feedback.ts'
import { KIND_LABELS, ROLE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => 'Konten und Rollen')

const accounts = ref<Account[]>([])
const grants = ref<Grant[]>([])
const q = ref('')
const unboundOnly = ref(false)
const loading = useFeedback()

type Action = 'bind' | 'block' | 'unblock' | 'grant'
/** The account an action is being prepared for, and which. */
const active = ref<{ account: Account, action: Action } | null>(null)
const reason = ref('')
const role = ref('campaign_organizer')
const personQuery = ref('')
const persons = ref<RosterPerson[]>([])
const chosenPerson = ref<string | null>(null)
const action = useFeedback()

const ROLES = Object.keys(ROLE_LABELS)

async function load(): Promise<void> {
  await loading.run(async () => {
    const [users, roles] = await Promise.all([loadAccounts(q.value.trim(), unboundOnly.value), loadGrants()])
    accounts.value = users.users
    grants.value = roles.grants
  })
}
onMounted(load)

function open(account: Account, which: Action): void {
  active.value = { account, action: which }
  reason.value = ''
  chosenPerson.value = null
  personQuery.value = ''
  persons.value = []
  action.error.value = null
  action.notice.value = null
  if (which === 'bind') void findPersons()
}

function close(): void {
  active.value = null
}

async function findPersons(): Promise<void> {
  await action.run(async () => {
    persons.value = (await searchPersons(personQuery.value.trim())).persons.filter((person) => person.account === null)
  })
}

async function submit(): Promise<void> {
  const current = active.value
  if (!current) return
  const ok = await action.run(async () => {
    switch (current.action) {
      case 'bind':
        if (chosenPerson.value === null) throw new Error('keine Person gewählt')
        await bindAccount(current.account.id, chosenPerson.value, reason.value)
        break
      case 'block':
        await blockAccount(current.account.id, reason.value)
        break
      case 'unblock':
        await unblockAccount(current.account.id, reason.value)
        break
      case 'grant':
        await grantRole(current.account.id, role.value, reason.value)
        break
    }
  })
  if (ok) {
    close()
    await load()
  }
}

const revoking = ref<Grant | null>(null)
const revokeReason = ref('')
const revoke = useFeedback()

async function onRevoke(): Promise<void> {
  const grant = revoking.value
  if (!grant) return
  const ok = await revoke.run(() => revokeGrant(grant.id, revokeReason.value))
  if (ok) {
    revoking.value = null
    revokeReason.value = ''
    await load()
  }
}

const actionTitle = computed(() => {
  if (!active.value) return ''
  const name = active.value.account.displayName
  return {
    bind: `${name} einer Person zuordnen`,
    block: `${name} sperren`,
    unblock: `${name} entsperren`,
    grant: `${name} eine Rolle erteilen`,
  }[active.value.action]
})

function personText(account: Account): string {
  const person = account.person
  if (!person) return 'Nicht zugeordnet'
  if (person.kind === null) return 'Nicht in der aktuellen Liste'
  const kind = KIND_LABELS[person.kind] ?? person.kind
  return person.kind === 'student' && person.className ? `${kind}, ${person.className}` : kind
}

function describePerson(person: RosterPerson): string {
  const kind = KIND_LABELS[person.kind] ?? person.kind
  const where = person.kind === 'student' && person.className ? `, ${person.className}` : ''
  return `${person.displayName} (${kind}${where}${person.mail ? `, ${person.mail}` : ''})`
}

const isSelf = (account: Account) => account.id === session.value?.id
</script>

<template>
  <h1>Konten und Rollen</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>

  <section>
    <h2>Konten</h2>
    <form
      class="filters"
      @submit.prevent="load"
    >
      <label for="account-filter">Name oder E-Mail</label>
      <input
        id="account-filter"
        v-model="q"
        type="search"
        maxlength="100"
      >
      <label>
        <input
          v-model="unboundOnly"
          type="checkbox"
          @change="load"
        >
        nur ohne Zuordnung
      </label>
      <button
        type="submit"
        class="ghost"
      >
        Filtern
      </button>
    </form>
    <p v-if="accounts.length === 0">
      Keine Konten gefunden.
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th scope="col">
            Name
          </th>
          <th scope="col">
            E-Mail
          </th>
          <th scope="col">
            Letzte Anmeldung
          </th>
          <th scope="col">
            Person
          </th>
          <th scope="col">
            Rollen
          </th>
          <th scope="col">
            <span class="visually-hidden">Aktionen</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="account in accounts"
          :key="account.id"
        >
          <td>
            {{ account.displayName }}
            <span
              v-if="account.blocked"
              class="badge badge-rejected"
            >gesperrt</span>
          </td>
          <td>{{ account.email ?? '–' }}</td>
          <td>{{ formatWhen(account.lastSignInAt) }}</td>
          <td>{{ personText(account) }}</td>
          <td>
            <span v-if="account.roles.length === 0">–</span>
            <span
              v-for="held in account.roles"
              v-else
              :key="held"
              class="badge"
            >{{ ROLE_LABELS[held] ?? held }}</span>
          </td>
          <td class="row-actions">
            <button
              type="button"
              class="ghost"
              @click="open(account, 'bind')"
            >
              Zuordnen
            </button>
            <button
              type="button"
              class="ghost"
              @click="open(account, 'grant')"
            >
              Rolle
            </button>
            <button
              v-if="!account.blocked && !isSelf(account)"
              type="button"
              class="ghost"
              @click="open(account, 'block')"
            >
              Sperren
            </button>
            <button
              v-if="account.blocked"
              type="button"
              class="ghost"
              @click="open(account, 'unblock')"
            >
              Entsperren
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <form
      v-if="active"
      class="panel"
      :aria-label="actionTitle"
      @submit.prevent="submit"
    >
      <h3>{{ actionTitle }}</h3>
      <template v-if="active.action === 'bind'">
        <p class="field">
          <label for="person-search">Person der Schule</label>
          <input
            id="person-search"
            v-model="personQuery"
            type="search"
            maxlength="100"
            placeholder="Name, Klasse oder E-Mail"
            @input="findPersons"
          >
        </p>
        <p v-if="persons.length === 0">
          Keine Person ohne Konto gefunden.
        </p>
        <ul
          v-else
          class="plain choices"
        >
          <li
            v-for="person in persons"
            :key="person.personId"
          >
            <label>
              <input
                v-model="chosenPerson"
                type="radio"
                name="person"
                :value="person.personId"
              >
              {{ describePerson(person) }}
            </label>
          </li>
        </ul>
      </template>
      <p
        v-if="active.action === 'grant'"
        class="field"
      >
        <label for="role">Rolle</label>
        <select
          id="role"
          v-model="role"
        >
          <option
            v-for="name in ROLES"
            :key="name"
            :value="name"
          >
            {{ ROLE_LABELS[name] }}
          </option>
        </select>
      </p>
      <p class="field">
        <label for="reason">Begründung</label>
        <input
          id="reason"
          v-model="reason"
          required
          maxlength="500"
        >
      </p>
      <p class="actions">
        <button
          type="submit"
          :disabled="action.busy.value || (active.action === 'bind' && chosenPerson === null)"
        >
          {{ { bind: 'Zuordnen', block: 'Sperren', unblock: 'Entsperren', grant: 'Rolle erteilen' }[active.action] }}
        </button>
        <button
          type="button"
          class="ghost"
          @click="close"
        >
          Abbrechen
        </button>
      </p>
      <p
        v-if="action.error.value"
        role="alert"
        class="alert"
      >
        {{ action.error.value }}
      </p>
    </form>
  </section>

  <section>
    <h2>Rollen</h2>
    <p v-if="grants.length === 0">
      Niemand hat eine besondere Rolle.
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th scope="col">
            Name
          </th>
          <th scope="col">
            Rolle
          </th>
          <th scope="col">
            Erteilt
          </th>
          <th scope="col">
            Begründung
          </th>
          <th scope="col">
            <span class="visually-hidden">Aktionen</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="grant in grants"
          :key="grant.id"
        >
          <td>{{ grant.displayName }}</td>
          <td>{{ ROLE_LABELS[grant.role] ?? grant.role }}</td>
          <td>{{ formatWhen(grant.grantedAt) }} von {{ grant.grantedBy }}</td>
          <td>{{ grant.reason }}</td>
          <td class="row-actions">
            <button
              type="button"
              class="ghost"
              :disabled="grant.role === 'school_admin' && grant.userId === session?.id"
              @click="revoking = grant; revokeReason = ''"
            >
              Entziehen
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <form
      v-if="revoking"
      class="panel"
      :aria-label="`${revoking.displayName}: ${ROLE_LABELS[revoking.role] ?? revoking.role} entziehen`"
      @submit.prevent="onRevoke"
    >
      <h3>{{ revoking.displayName }}: {{ ROLE_LABELS[revoking.role] ?? revoking.role }} entziehen</h3>
      <p class="field">
        <label for="revoke-reason">Begründung</label>
        <input
          id="revoke-reason"
          v-model="revokeReason"
          required
          maxlength="500"
        >
      </p>
      <p class="actions">
        <button
          type="submit"
          :disabled="revoke.busy.value"
        >
          Entziehen
        </button>
        <button
          type="button"
          class="ghost"
          @click="revoking = null"
        >
          Abbrechen
        </button>
      </p>
      <p
        v-if="revoke.error.value"
        role="alert"
        class="alert"
      >
        {{ revoke.error.value }}
      </p>
    </form>
  </section>
</template>
