import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'
import type { AdminBinding, SignedInIdentity } from '../models/bindings.ts'

export function findIdentityBinding(db: Queryable, identity: SignedInIdentity) {
  return db.query('select 1 from identity_binding where tid = $1 and oid = $2 and unbound_at is null', [identity.tid, identity.oid])
}

export function findUnboundCandidates(db: Queryable, addresses: string[]) {
  return db.query<{ person_id: string, batch_id: string }>(
    `select e.person_id, e.batch_id
       from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
      where e.person_id is not null
        and (lower(e.mail) = any($1::text[]) or lower(e.upn) = any($1::text[]))
        and not exists (select 1 from identity_binding b where b.person_id = e.person_id and b.unbound_at is null)`,
    [addresses],
  )
}

export function bindByAddress(db: Queryable, personId: string, identity: SignedInIdentity, userId: string, batchId: string) {
  return db.query(
    `insert into identity_binding (person_id, tid, oid, method, bound_by, import_batch_id) values ($1, $2, $3, 'email_match', $4, $5)`,
    [personId, identity.tid, identity.oid, userId, batchId],
  )
}

export function findAccount(db: Queryable, input: AdminBinding) {
  return db.query<{ tid: string, oid: string }>('select tid, oid from app_user where id = $1', [input.userId])
}

export function findPerson(db: Queryable, input: AdminBinding) {
  return db.query('select 1 from person where id = $1', [input.personId])
}

export function findOpenBindings(db: Queryable, input: AdminBinding, user: { tid: string, oid: string }) {
  return db.query<{ id: string, person_id: string, tid: string, oid: string }>(
    'select id, person_id, tid, oid from identity_binding where unbound_at is null and (person_id = $1 or (tid = $2 and oid = $3))',
    [input.personId, user.tid, user.oid],
  )
}

export function closeBinding(db: Queryable, binding: { id: string, person_id: string, tid: string, oid: string }, actor: Actor, input: AdminBinding) {
  return db.query(
    'update identity_binding set unbound_at = now(), unbound_by = $2, unbind_reason = $3 where id = $1',
    [binding.id, actor.id, input.reason],
  )
}

export function insertAdminBinding(db: Queryable, input: AdminBinding, user: { tid: string, oid: string }, actor: Actor) {
  return db.query<{ id: string }>(
    `insert into identity_binding (person_id, tid, oid, method, bound_by, reason) values ($1, $2, $3, 'admin', $4, $5) returning id`,
    [input.personId, user.tid, user.oid, actor.id, input.reason],
  )
}
