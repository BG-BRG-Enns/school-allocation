<script setup lang="ts">
// The start page: who is signed in, and the campaigns they may see.

import { onMounted, ref } from 'vue'
import { loadCampaigns, type Campaign } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { CAMPAIGN_STATE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => 'Startseite')
const campaigns = ref<Campaign[] | null>(null)
const loading = useFeedback()
onMounted(() => loading.run(async () => {
  campaigns.value = (await loadCampaigns()).campaigns
}))
</script>

<template>
  <h1>Startseite</h1>
  <p v-if="session">
    Angemeldet als <strong>{{ session.displayName }}</strong>.
  </p>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="campaigns">
    <p v-if="campaigns.length === 0">
      Es gibt noch keine Wahl, an der Sie teilnehmen oder die Sie betreuen.
    </p>
    <ul
      v-else
      class="cards"
    >
      <li
        v-for="campaign in campaigns"
        :key="campaign.id"
      >
        <RouterLink :to="`/wahlen/${campaign.id}`">
          {{ campaign.name }}
        </RouterLink>
        <p>{{ campaign.schoolYear }} · {{ CAMPAIGN_STATE_LABELS[campaign.state] ?? campaign.state }}</p>
      </li>
    </ul>
  </template>
</template>
