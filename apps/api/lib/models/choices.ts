import type { ChoiceView as ContractChoiceView, MissingStudent } from '@school-allocation/api-contracts'
import { type Caller } from '../actor.ts'

export type { CampaignStudent } from '@school-allocation/api-contracts'

export type { GroupView } from '@school-allocation/api-contracts'
export type ChoiceView = Omit<ContractChoiceView, 'campaign'>

export interface SaveBy {
  caller: Caller
  /** Set when an organizer enters the list on the student's behalf; recorded and audited. */
  reason?: string
}

export type { ChoiceState } from '@school-allocation/api-contracts'
export type StudentChoiceState = Omit<MissingStudent, 'mails'>
