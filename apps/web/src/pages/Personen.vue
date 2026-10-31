<script setup lang="ts">
// Accounts and roles: who has signed in, which roster person the account
// is, which roles they hold, whether they are blocked. An account the
// roster did not recognise is bound to a person here; roles are granted
// and revoked here. Every action asks for a reason, which the audit log
// keeps.

import type { Role } from '@school-allocation/api-contracts'
import { computed, onMounted, ref } from 'vue'
import { bindAccount, blockAccount, grantRole, loadAccounts, loadGrants, revokeGrant, searchPersons, unblockAccount, type Account, type Grant, type RosterPerson } from '../lib/admin-api.ts'
import { formatWhen, useFeedback } from '../lib/feedback.ts'
import { t } from '../lib/i18n.ts'
import { KIND_LABELS, ROLE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => t.common.page.people)

const accounts = ref<Account[]>([])
const grants = ref<Grant[]>([])
const q = ref('')
const unboundOnly = ref(false)
const loading = useFeedback()

type Action = 'bind' | 'block' | 'unblock' | 'grant'
/** The account an action is being prepared for, and which. */
const active = ref<{ account: Account, action: Action } | null>(null)
const reason = ref('')
const role = ref<Role>('campaign_organizer')
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
    // Bound persons stay in the list: a replacement account is bound to a
    // person whose old account is still bound, and the server closes that
    // binding. The list says which account a person has now. A choice the
    // new search no longer shows is no choice.
    persons.value = (await searchPersons(personQuery.value.trim())).persons
    if (!persons.value.some((person) => person.personId === chosenPerson.value)) chosenPerson.value = null
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
  return t.people.title[active.value.action](name)
})

function personText(account: Account): string {
  const person = account.person
  if (!person) return t.people.accounts.unbound
  if (person.kind === null) return t.people.accounts.notInRoster
  const kind = KIND_LABELS[person.kind] ?? person.kind
  return person.kind === 'student' && person.className ? `${kind}, ${person.className}` : kind
}

function describePerson(person: RosterPerson): string {
  const kind = KIND_LABELS[person.kind] ?? person.kind
  const where = person.kind === 'student' && person.className ? `, ${person.className}` : ''
  const now = person.account === null ? '' : ` – ${t.people.currentAccount(person.account)}`
  return `${person.displayName} (${kind}${where}${person.mail ? `, ${person.mail}` : ''})${now}`
}

const isSelf = (account: Account) => account.id === session.value?.id
</script>

<template>
  <h1>{{ t.common.page.people }}</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>

  <section>
    <h2>{{ t.people.accounts.title }}</h2>
    <form
      class="filters"
      @submit.prevent="load"
    >
      <label for="account-filter">{{ t.people.accounts.filter }}</label>
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
        {{ t.people.accounts.unboundOnly }}
      </label>
      <button
        type="submit"
        class="ghost"
      >
        {{ t.people.accounts.apply }}
      </button>
    </form>
    <p v-if="accounts.length === 0">
      {{ t.people.accounts.none }}
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th scope="col">
            {{ t.common.field.name }}
          </th>
          <th scope="col">
            {{ t.common.field.email }}
          </th>
          <th scope="col">
            {{ t.people.accounts.lastSignIn }}
          </th>
          <th scope="col">
            {{ t.people.accounts.person }}
          </th>
          <th scope="col">
            {{ t.people.roles }}
          </th>
          <th scope="col">
            <span class="visually-hidden">{{ t.common.field.actions }}</span>
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
            >{{ t.people.accounts.blocked }}</span>
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
              {{ t.people.open.bind }}
            </button>
            <button
              type="button"
              class="ghost"
              @click="open(account, 'grant')"
            >
              {{ t.people.open.grant }}
            </button>
            <button
              v-if="!account.blocked && !isSelf(account)"
              type="button"
              class="ghost"
              @click="open(account, 'block')"
            >
              {{ t.people.open.block }}
            </button>
            <button
              v-if="account.blocked"
              type="button"
              class="ghost"
              @click="open(account, 'unblock')"
            >
              {{ t.people.open.unblock }}
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
          <label for="person-search">{{ t.people.personSearch }}</label>
          <input
            id="person-search"
            v-model="personQuery"
            type="search"
            maxlength="100"
            :placeholder="t.people.personSearchPlaceholder"
            @input="findPersons"
          >
        </p>
        <p v-if="persons.length === 0">
          {{ t.people.noPerson }}
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
        <label for="role">{{ t.common.field.role }}</label>
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
        <label for="reason">{{ t.common.field.reason }}</label>
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
          {{ t.people.submit[active.action] }}
        </button>
        <button
          type="button"
          class="ghost"
          @click="close"
        >
          {{ t.common.cancel }}
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
    <h2>{{ t.people.roles }}</h2>
    <p v-if="grants.length === 0">
      {{ t.people.grants.none }}
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th scope="col">
            {{ t.common.field.name }}
          </th>
          <th scope="col">
            {{ t.common.field.role }}
          </th>
          <th scope="col">
            {{ t.people.grants.granted }}
          </th>
          <th scope="col">
            {{ t.common.field.reason }}
          </th>
          <th scope="col">
            <span class="visually-hidden">{{ t.common.field.actions }}</span>
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
          <td>{{ t.people.grants.grantedBy(formatWhen(grant.grantedAt), grant.grantedBy) }}</td>
          <td>{{ grant.reason }}</td>
          <td class="row-actions">
            <button
              type="button"
              class="ghost"
              :disabled="grant.role === 'school_admin' && grant.userId === session?.id"
              @click="revoking = grant; revokeReason = ''"
            >
              {{ t.people.grants.revoke }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <form
      v-if="revoking"
      class="panel"
      :aria-label="t.people.grants.revokeTitle(revoking.displayName, ROLE_LABELS[revoking.role] ?? revoking.role)"
      @submit.prevent="onRevoke"
    >
      <h3>{{ t.people.grants.revokeTitle(revoking.displayName, ROLE_LABELS[revoking.role] ?? revoking.role) }}</h3>
      <p class="field">
        <label for="revoke-reason">{{ t.common.field.reason }}</label>
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
          {{ t.people.grants.revoke }}
        </button>
        <button
          type="button"
          class="ghost"
          @click="revoking = null"
        >
          {{ t.common.cancel }}
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
