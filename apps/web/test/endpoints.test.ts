import { endpointPath } from '@school-allocation/api-contracts/client-endpoint'
import { getAdminRosterGraphStart, getAdminRosterPersons, putAdminClassesByClassNameTeachers } from '@school-allocation/api-contracts/endpoint-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('endpoint paths encode segments and queries independently, without a deployment base', () => {
  assert.equal(endpointPath(putAdminClassesByClassNameTeachers, { params: { className: '5A/B ü' } }), '/api/admin/classes/5A%2FB%20%C3%BC/teachers')
  assert.equal(endpointPath(getAdminRosterPersons, { query: { q: 'a+b & c' } }), '/api/admin/roster/persons?q=a%2Bb+%26+c')
  assert.equal(endpointPath(getAdminRosterGraphStart, { query: { purpose: 'picker' } }), '/api/admin/roster/graph/start?purpose=picker')
  assert.equal(endpointPath(getAdminRosterPersons, {}), '/api/admin/roster/persons')
})
