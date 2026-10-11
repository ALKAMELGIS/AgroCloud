import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditsError } from '../server/identity/creditsService.js'

test('CreditsError carries code and status', () => {
  const err = new CreditsError('INSUFFICIENT_CREDITS', 'Insufficient credits.', 409)
  assert.equal(err.code, 'INSUFFICIENT_CREDITS')
  assert.equal(err.status, 409)
})
