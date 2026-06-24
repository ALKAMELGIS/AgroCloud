import test from 'node:test'
import assert from 'node:assert/strict'
import { authServiceInternals } from '../server/authService.js'

const { hashPasswordScrypt, verifyPassword, sha256Hex, isSha256Hex } = authServiceInternals

test('scrypt hash verifies correct password', () => {
  const hash = hashPasswordScrypt('test-password-123')
  assert.ok(hash.startsWith('scrypt$'))
  const result = verifyPassword('test-password-123', hash)
  assert.equal(result.ok, true)
  assert.equal(result.migratedHash, null)
})

test('scrypt hash rejects wrong password', () => {
  const hash = hashPasswordScrypt('correct-password')
  const result = verifyPassword('wrong-password', hash)
  assert.equal(result.ok, false)
})

test('legacy sha256 hex verifies and migrates', () => {
  const legacy = sha256Hex('legacy-pass')
  assert.ok(isSha256Hex(legacy))
  const result = verifyPassword('legacy-pass', legacy)
  assert.equal(result.ok, true)
  assert.ok(result.migratedHash?.startsWith('scrypt$'))
})

test('normalizeEmail lowercases and trims', () => {
  assert.equal(authServiceInternals.normalizeEmail('  Test@Example.COM  '), 'test@example.com')
})
