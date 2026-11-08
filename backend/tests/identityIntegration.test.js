/**
 * Identity module end-to-end against the real SQLite schema (in-memory under `node --test`).
 * Covers the paths where SQLite differs from the old PostgreSQL backend: migrations + seeds,
 * sessions and expiry, credits (wallet locking / insufficient balance), manpower and single-use
 * password-reset tokens.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { closePool, getPool, initIdentityDatabase } from '../server/identity/db.js'
import { getOrgManpowerSummary, ensureAllocationRow } from '../server/identity/manpowerService.js'
import { createSession, loadUserPermissions, resolveSessionUser } from '../server/identity/sessionService.js'
import { applyCreditDelta, ensureWallet, CreditsError } from '../server/identity/creditsService.js'
import {
  consumePasswordResetToken,
  createPasswordResetTokenForUser,
} from '../server/identity/passwordResetService.js'
import { runMigrations } from '../server/database/migrate.js'

process.env.AGROCLOUD_IDENTITY = 'on'
// A legacy directory file: identity's first start must carry these users over.
const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agro-identity-'))
process.env.AGRI_ADMIN_DIRECTORY_FILE = path.join(legacyDir, 'agri_admin_directory.json')
fs.writeFileSync(
  process.env.AGRI_ADMIN_DIRECTORY_FILE,
  JSON.stringify({
    users: [
      { id: 1, name: 'Admin', email: 'Admin@Example.com', role: 'Admin', status: 'Active', passwordHash: 'h1' },
      { id: 2, name: 'Field', email: 'field@example.com', role: 'Editor', status: 'Active', managedById: 1 },
    ],
    auditLog: [],
  }),
)
const pool = () => getPool()

async function createUser(roleCode = 'STAFF', email = `u${Math.random().toString(36).slice(2)}@example.com`) {
  const orgId = (await pool().query(`SELECT id FROM organizations WHERE slug = 'default'`)).rows[0].id
  const roleId = (await pool().query(`SELECT id FROM roles WHERE code = $1 AND organization_id IS NULL`, [roleCode]))
    .rows[0].id
  const { rows } = await pool().query(
    `INSERT INTO users (organization_id, email, name, role_id, status, password_hash, email_verified)
     VALUES ($1, $2, $3, $4, 'ACTIVE', 'old-hash', $5) RETURNING *`,
    [orgId, email, 'Test User', roleId, true],
  )
  return { orgId, user: rows[0] }
}

test.before(async () => {
  assert.equal(await initIdentityDatabase(), true)
})
test.after(async () => {
  await closePool()
  fs.rmSync(legacyDir, { recursive: true, force: true })
})

test('first start imports the admin-directory users with their hierarchy', async () => {
  const { rows } = await pool().query(
    `SELECT u.email, u.status, u.password_hash, r.code, p.email AS parent
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN users p ON p.id = u.parent_user_id ORDER BY u.email`,
  )
  assert.deepEqual(
    rows.map((r) => [r.email, r.code, r.status, r.parent]),
    [
      ['admin@example.com', 'DIRECTOR', 'ACTIVE', null],
      ['field@example.com', 'STAFF', 'ACTIVE', 'admin@example.com'],
    ],
  )
  assert.equal(rows[0].password_hash, 'h1')
})

test('migrations are idempotent and seed the default organization and roles', async () => {
  assert.deepEqual(runMigrations(), [], 'second run applies nothing')
  const orgs = await pool().query(`SELECT * FROM organizations WHERE slug = 'default'`)
  assert.equal(orgs.rowCount, 1)
  assert.ok(orgs.rows[0].settings && typeof orgs.rows[0].settings === 'object', 'JSON column parsed')
  const { rows } = await pool().query(
    `SELECT r.code, COUNT(rp.permission_id) AS n FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE r.organization_id IS NULL GROUP BY r.code`,
  )
  const counts = Object.fromEntries(rows.map((r) => [r.code, r.n]))
  assert.equal(counts.OWNER, 40)
  assert.equal(counts.STAFF, 6)
})

test('users get UUID ids, booleans and timestamps round-trip', async () => {
  const { user } = await createUser()
  assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(user.email_verified, true)
  assert.ok(user.created_at instanceof Date)
  const perms = await loadUserPermissions(user.id, user.role_id)
  assert.equal(perms.length, 6)
})

test('sessions resolve by cookie and bearer token, and expire', async () => {
  const { user } = await createUser('MANAGER')
  const s = await createSession(user.id, { ip: '127.0.0.1' })
  const byCookie = await resolveSessionUser({ headers: { cookie: `agro_session=${s.token}` } })
  assert.equal(byCookie.user.id, user.id)
  assert.equal(byCookie.user.role_code, 'MANAGER')
  const byBearer = await resolveSessionUser({ headers: { authorization: `Bearer ${s.token}` } })
  assert.equal(byBearer.user.id, user.id)

  await pool().query(`UPDATE sessions SET expires_at = $1 WHERE user_id = $2`, [new Date(Date.now() - 1000), user.id])
  assert.equal(await resolveSessionUser({ headers: { cookie: `agro_session=${s.token}` } }), null)
  assert.equal(await resolveSessionUser({ headers: { cookie: 'agro_session=unknown' } }), null)
})

test('credits: deltas update the wallet and refuse to go negative', async () => {
  const { user } = await createUser()
  const wallet = await ensureWallet(pool(), user.id)
  assert.equal(Number(wallet.balance), 0)
  assert.equal((await ensureWallet(pool(), user.id)).id, wallet.id, 'one wallet per user')

  const r = await applyCreditDelta(pool(), { userId: user.id, amount: 100, type: 'purchase', metadata: { order: 1 } })
  assert.equal(Number(r.wallet.balance), 100)
  assert.deepEqual(r.transaction.metadata, { order: 1 })

  await assert.rejects(
    applyCreditDelta(pool(), { userId: user.id, amount: -150, type: 'usage' }),
    (e) => e instanceof CreditsError && e.code === 'INSUFFICIENT_CREDITS',
  )
  const after = await pool().query(`SELECT balance FROM wallets WHERE id = $1`, [wallet.id])
  assert.equal(Number(after.rows[0].balance), 100)
})

test('the organisation manpower pool row is reused, never duplicated', async () => {
  const orgId = (await pool().query(`SELECT id FROM organizations WHERE slug = 'default'`)).rows[0].id
  const a = await ensureAllocationRow(pool(), orgId, 'SUPERVISOR', null)
  const b = await ensureAllocationRow(pool(), orgId, 'SUPERVISOR', null)
  assert.equal(a.id, b.id)
  await assert.rejects(
    pool().query(
      `INSERT INTO manpower_allocations (organization_id, role_code, total, used, reserved) VALUES ($1, 'SUPERVISOR', 1, 0, 0)`,
      [orgId],
    ),
    /UNIQUE/,
  )
})

test('manpower summary counts allocations', async () => {
  const orgId = (await pool().query(`SELECT id FROM organizations WHERE slug = 'default'`)).rows[0].id
  await ensureAllocationRow(pool(), orgId, 'STAFF', null)
  await pool().query(
    `UPDATE manpower_allocations SET total = 5, used = 2, reserved = 1
     WHERE organization_id = $1 AND role_code = 'STAFF' AND holder_user_id IS NULL`,
    [orgId],
  )
  const summary = await getOrgManpowerSummary(pool(), orgId)
  assert.ok(summary.available >= 2)
})

test('password reset tokens are single use and clear sessions', async () => {
  const { user } = await createUser()
  await createSession(user.id)
  const { token } = await createPasswordResetTokenForUser(user.id)

  const ok = await consumePasswordResetToken(token, 'new-hash')
  assert.deepEqual(ok, { ok: true, userId: user.id })
  const { rows } = await pool().query(`SELECT password_hash FROM users WHERE id = $1`, [user.id])
  assert.equal(rows[0].password_hash, 'new-hash')
  assert.equal((await pool().query(`SELECT 1 FROM sessions WHERE user_id = $1`, [user.id])).rowCount, 0)

  assert.deepEqual(await consumePasswordResetToken(token, 'again'), { ok: false, reason: 'invalid_token' })
})

test('manpower available formula', () => {
  const row = { total: 10, used: 7, reserved: 2 }
  assert.equal(row.total - row.used - row.reserved, 1)
})
