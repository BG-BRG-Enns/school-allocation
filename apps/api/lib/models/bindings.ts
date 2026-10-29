/** What a sign-in brings to the match: the identity and the addresses the token carried. */
export interface SignedInIdentity {
  tid: string
  oid: string
  email: string | null
  upn: string | null
}

export interface AdminBinding {
  /** app_user.id of the account. */
  userId: string
  personId: string
  reason: string
}
