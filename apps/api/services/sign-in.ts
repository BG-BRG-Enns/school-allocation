import { upsertAppUser, type EntraIdentity } from '../lib/app-user.ts'
import { lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import type { Database } from '../lib/db.ts'
import { bootstrapAdmin } from '../lib/roles.ts'
import { bindAtSignIn } from './bindings.ts'

/** Lock the school before the account, as account administration does. */
export function recordSignIn(db: Database, identity: EntraIdentity, bootstrapAdmins: readonly string[]) {
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const signedIn = await upsertAppUser(client, identity)
    if (!signedIn.blocked) {
      await bootstrapAdmin(client, { ...identity, id: signedIn.id }, bootstrapAdmins)
      await bindAtSignIn(client, identity, signedIn.id, identity.displayName)
    }
    return signedIn
  })
}
