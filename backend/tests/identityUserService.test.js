import test from 'node:test'
import assert from 'node:assert/strict'
import { mapLegacyRoleToCode, legacyRoleLabel, normalizeEmail } from '../server/identity/userService.js'
import { defaultScopeForRoleCode } from '../server/identity/authorizationService.js'

test('mapLegacyRoleToCode maps admin roles', () => {
  assert.equal(mapLegacyRoleToCode('Admin'), 'DIRECTOR')
  assert.equal(mapLegacyRoleToCode('Manager'), 'MANAGER')
  assert.equal(mapLegacyRoleToCode('Admin Manager'), 'SUPERVISOR')
  assert.equal(mapLegacyRoleToCode('Editor'), 'STAFF')
})

test('legacyRoleLabel maps back for UI compatibility', () => {
  assert.equal(legacyRoleLabel('DIRECTOR'), 'Admin')
  assert.equal(legacyRoleLabel('MANAGER'), 'Manager')
})

test('defaultScopeForRoleCode', () => {
  assert.equal(defaultScopeForRoleCode('MANAGER'), 'MANAGER_SCOPE')
  assert.equal(defaultScopeForRoleCode('STAFF'), 'USER_SCOPE')
})

test('normalizeEmail', () => {
  assert.equal(normalizeEmail('  A@B.COM '), 'a@b.com')
})
