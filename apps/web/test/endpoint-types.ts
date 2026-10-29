import * as endpoints from '@school-allocation/api-contracts/endpoints'
import { apiRequest } from '../src/lib/api.ts'

/** Compile-only examples: never invoked, and checked by the web test tsconfig. */
export async function endpointTypes(): Promise<void> {
  const result = await apiRequest(endpoints.getCampaigns, {})
  const name: string | undefined = result.campaigns[0]?.name
  void name
  // @ts-expect-error A campaign-list endpoint cannot promise a roster response.
  void result.batches
  // @ts-expect-error Required path parameters cannot be omitted.
  await apiRequest(endpoints.getCampaignsById, {})
  // @ts-expect-error Unknown body fields cannot be submitted.
  await apiRequest(endpoints.postAdminCampaigns, { body: { wrong: true } })
  // @ts-expect-error Read-only endpoints have no request body.
  await apiRequest(endpoints.getCampaigns, { body: {} })
  // @ts-expect-error A redirect cannot be requested as JSON.
  await apiRequest(endpoints.getAuthLogin, {})
  // @ts-expect-error The role must be one of the endpoint's accepted roles.
  await apiRequest(endpoints.postAdminRoles, { body: { userId: 'id', role: 'root', reason: 'test' } })
}
