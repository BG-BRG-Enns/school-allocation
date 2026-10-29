import type { Queryable } from '../db.ts'
import type { Campaign } from '../models/campaigns.ts'
import { campaignRosterBatch, CURRENT_BATCH_ID } from './roster-selection.ts'

/** The class teachers of the campaign's roster with an address, by class: assigned in the app for the roster's year, or named by the roster's column. */
export async function classTeachersByClass(client: Queryable, campaign: Campaign): Promise<Map<string, { personId: string, displayName: string, address: string }[]>> {
  const batch = campaignRosterBatch(campaign)
  const { rows } = await client.query<{ class_name: string, person_id: string, display_name: string, address: string }>(
    `with b as (select id, school_year from import_batch where id = ${batch}),
     teachers as (select e.person_id, e.display_name, coalesce(e.mail, e.upn) as address, lower(e.mail) as mail, lower(e.upn) as upn
                    from roster_entry e, b where e.batch_id = b.id and e.kind = 'teacher' and e.person_id is not null),
     classes as (select distinct e.class_name, lower(e.class_teacher_mail) as kv_mail from roster_entry e, b where e.batch_id = b.id and e.kind = 'student' and e.class_name is not null)
     select distinct c.class_name, t.person_id, t.display_name, t.address
       from classes c
       join teachers t on (c.kv_mail is not null and (t.mail = c.kv_mail or t.upn = c.kv_mail))
                       or exists (select 1 from class_teacher a, b where a.person_id = t.person_id and a.class_name = c.class_name and a.school_year = b.school_year and a.revoked_at is null)
      where t.address is not null
      order by c.class_name, t.display_name`,
  )
  const byClass = new Map<string, { personId: string, displayName: string, address: string }[]>()
  for (const row of rows) {
    const list = byClass.get(row.class_name) ?? []
    list.push({ personId: row.person_id, displayName: row.display_name, address: row.address })
    byClass.set(row.class_name, list)
  }
  return byClass
}

export async function freezeRoster(db: Queryable, campaign: Campaign) {
  await db.query(`update campaign set roster_batch_id = ${CURRENT_BATCH_ID} where id = $1`, [campaign.id])
}
