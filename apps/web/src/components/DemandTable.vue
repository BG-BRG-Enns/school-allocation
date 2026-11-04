<script setup lang="ts">
// Places and demand (D-13): per project day a table, the grades as rows and
// the day's cells as columns: the periods of its attendance frame, or the
// whole day. A cell says who needs a place, the target (the need and the
// registration's headroom on top) and what the submitted and approved
// activities offer; a cell short of the target is marked. The arithmetic
// is the server's (school-core demandByDay); the target is computed here
// from the same function the server's pages would use.

import { placeTarget, type CellDemand, type DayDemand } from '@school-allocation/school-core'
import { formatDay } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'

const props = defineProps<{
  demand: DayDemand[]
  /** The registration's places above the need, in percent. */
  percent: number
}>()

/** The places a grade should be offered in a cell: what it needs and the headroom on top. */
function targetOf(cell: CellDemand): number {
  return placeTarget(cell.needing, props.percent)
}

/** How many places the cell lacks to reach the target; 0 when it is reached. */
function shortOf(cell: CellDemand): number {
  return Math.max(0, targetOf(cell) - cell.offered)
}
</script>

<template>
  <div
    v-for="day in demand"
    :key="day.date"
    class="demand-day"
  >
    <h3>{{ formatDay(day.date) }}</h3>
    <p class="muted">
      {{ day.frame ? t.campaign.demand.framed(t.format.periods(day.frame.from, day.frame.to)) : t.campaign.demand.unframed }}
    </p>
    <table
      class="table"
      :aria-label="t.campaign.demand.table(formatDay(day.date))"
    >
      <thead>
        <tr>
          <th scope="col">
            {{ t.common.field.grade }}
          </th>
          <th
            v-for="period in day.periods"
            :key="period ?? 'day'"
            scope="col"
          >
            {{ period === null ? t.campaign.demand.day : t.format.period(period) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="g in day.grades"
          :key="g.grade"
        >
          <th scope="row">
            {{ t.common.gradeOrdinal(g.grade) }}
          </th>
          <td
            v-for="cell in g.cells"
            :key="cell.period ?? 'day'"
            :class="{ short: shortOf(cell) > 0 }"
          >
            {{ t.campaign.demand.cell(cell.needing, targetOf(cell), cell.offered) }}
            <template v-if="shortOf(cell) > 0">
              <br>{{ t.campaign.demand.short(shortOf(cell)) }}
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
