// What the window and mail routes accept: shapes and bounds. The rules (a
// ranking against the groups offered, a template against its kind's
// placeholders) are school-core's and lib/mail/templates.ts's, applied after.

import { Type } from 'typebox'
import { MAIL_KINDS } from '../mail/templates.ts'
import { Literals, MultiLineText, Reason, SingleLineText, StrictObject, Uuid } from './common.ts'

/** Group key → item ids in order; a group key is what the view named it. */
export const RankingSchema = Type.Record(Type.String({ minLength: 1, maxLength: 400 }), Type.Array(Uuid, { maxItems: 10 }), { maxProperties: 60, additionalProperties: false })

export const RankingBody = StrictObject({ ranking: RankingSchema })
export const OnBehalfBody = StrictObject({ ranking: RankingSchema, reason: Reason })
export const ExemptBody = StrictObject({ reason: Reason })
export const PersonParams = StrictObject({ id: Uuid, personId: Uuid })
export const ExemptParams = StrictObject({ id: Uuid, personId: Uuid, itemId: Uuid })

export const RankingInvalidResponse = StrictObject({
  error: Type.Literal('ranking_invalid'),
  problems: Type.Array(StrictObject({ code: Type.String(), group: Type.Optional(Type.String()) })),
})

export const KindParams = StrictObject({ kind: Literals(MAIL_KINDS) })
export const TemplateBody = StrictObject({ subject: SingleLineText(200), body: MultiLineText(8000, 1) })
export const TemplateInvalidResponse = StrictObject({
  error: Type.Literal('template_invalid'),
  problems: Type.Array(StrictObject({ code: Type.String(), message: Type.String() })),
})
