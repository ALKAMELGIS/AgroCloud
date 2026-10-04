import test from 'node:test'
import assert from 'node:assert/strict'
import { isIdentityConfigured, getPool, closePool, runMigrations } from '../server/identity/db.js'
import { getOrgManpowerSummary, ensureAllocationRow } from '../server/identity/manpowerService.js'
import { loadUserPermissions } from '../server/identity/sessionService.js'

const runPg = isIdentityConfigured() && process.env.IDENTITY_RUN_INTEGRATION_TESTS === 'true'

test('identity integration — skipped unless IDENTITY_RUN_INTEGRATION_TESTS=true and DATABASE_URL', { skip: !runPg }, async () => {
  const pool = getPool()
  const client = await pool.connect()
  await runMigrations(client)
  client.release()

  const orgId = (await pool.query(`SELECT id FROM organizations WHERE slug = 'default' LIMIT 1`)).rows[0]?.id
  assert.ok(orgId)

  await ensureAllocationRow(pool, orgId, 'STAFF', null)
  await pool.query(
    `UPDATE manpower_allocations SET total = 2, used = 0, reserved = 0
     WHERE organization_id = $1 AND role_code = 'STAFF' AND holder_user_id IS NULL`,
    [orgId],
  )

  const summary = await getOrgManpowerSummary(pool, orgId)
  assert.ok(summary.available >= 0)

  const { rows: users } = await pool.query(
    `SELECT u.id, u.role_id, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.organization_id = $1 AND u.status = 'ACTIVE' LIMIT 1`,
    [orgId],
  )
  if (users[0]) {
    const perms = await loadUserPermissions(users[0].id, users[0].role_id)
    assert.ok(Array.isArray(perms))
  }

  await closePool()
})

test('manpower available formula', () => {
  const row = { total: 10, used: 7, reserved: 2 }
  const available = row.total - row.used - row.reserved
  assert.equal(available, 1)
})
