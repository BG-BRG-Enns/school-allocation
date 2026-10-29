import type { Campaign } from '../models/campaigns.ts'

/** The school roster currently in force. Keep its ordering identical for every reader. */
export const CURRENT_BATCH_ID = '(select id from import_batch where state = \'committed\' order by decided_at desc limit 1)'

/** A loaded campaign uses its frozen roster, or follows the school's current roster. */
export function campaignRosterBatch(campaign: Pick<Campaign, 'rosterBatchId'>): string {
  return campaign.rosterBatchId === null ? CURRENT_BATCH_ID : `'${campaign.rosterBatchId}'::uuid`
}

/** For queries whose first parameter is the campaign id, including placement reconciliation. */
export const CAMPAIGN_BATCH_ID = `coalesce((select roster_batch_id from campaign where id = $1), ${CURRENT_BATCH_ID})`
