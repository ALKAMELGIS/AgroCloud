/**
 * /api/v1/credits/* and /api/v1/admin/credits/adjust over HTTP, on in-memory SQLite:
 * session guard, permissions, organisation/scope isolation, ledger and error codes.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { closePool, getPool, initIdentityDatabase } from '../server/identity/db.js'
import { registerIdentityRoutes } from '../server/identity/identityRoutes.js'
import { createSession } from '../server/identity/sessionService.js'

process.env.AGROCLOUD_IDENTITY = 'on'
process.env.AGRI_ADMIN_DIRECTORY_FILE = '/nonexistent/agri_admin_directory.json'

let server
let base
const pool = () => getPool()

async function org(slug) {
  const found = await pool().query(`SELECT id FROM organizations WHERE slug = $1`, [slug])
  if (found.rows[0]) return found.rows[0].id
  return (await pool().query(`INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`, [slug])).rows[0].id
}

async function user(roleCode, { orgSlug = 'default', legacyId = null, parent = null } = {}) {
  const orgId = await org(orgSlug)
  const roleId = (await pool().query(`SELECT id FROM roles WHERE code = $1 AND organization_id IS NULL`, [roleCode]))
    .rows[0].id
  const { rows } = await pool().query(
    `INSERT INTO users (organization_id, email, name, role_id, status, legacy_directory_id, parent_user_id, data_scope)
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7) RETURNING id`,
    [
      orgId,
      `${roleCode.toLowerCase()}-${Math.random().toString(36).slice(2)}@farm.com`,
      roleCode,
      roleId,
      legacyId,
      parent,
      roleCode === 'DIRECTOR' || roleCode === 'OWNER' ? 'ORGANIZATION' : 'SELF',
    ],
  )
  const { token } = await createSession(rows[0].id)
  return { id: rows[0].id, auth: { authorization: `Bearer ${token}` } }
}

async function call(method, path, { headers = {}, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

test.before(async () => {
  assert.equal(await initIdentityDatabase(), true)
  const app = express()
  app.use(express.json())
  registerIdentityRoutes(app)
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${server.address().port}/api/v1`
})
test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await closePool()
})

test('wallet requires a session and starts at zero', async () => {
  assert.equal((await call('GET', '/credits/wallet')).status, 401)
  const staff = await user('STAFF')
  const r = await call('GET', '/credits/wallet', { headers: staff.auth })
  assert.equal(r.status, 200)
  assert.equal(r.body.wallet.balance, 0)
})

test('a director adjusts a user in the organisation; the ledger records it', async () => {
  const director = await user('DIRECTOR')
  const staff = await user('STAFF', { legacyId: 4242 })

  const add = await call('POST', '/admin/credits/adjust', {
    headers: director.auth,
    body: { userId: staff.id, amount: 120, reason: 'Season top-up' },
  })
  assert.equal(add.status, 200)
  assert.equal(add.body.balance, 120)

  // The numeric id the client shows for directory-era users works too.
  const remove = await call('POST', '/admin/credits/adjust', {
    headers: director.auth,
    body: { userId: '4242', amount: -20 },
  })
  assert.equal(remove.body.balance, 100)

  const wallet = await call('GET', '/credits/wallet', { headers: staff.auth })
  assert.equal(wallet.body.wallet.balance, 100)
  const tx = await call('GET', '/credits/transactions', { headers: staff.auth })
  assert.deepEqual(
    tx.body.transactions.map((t) => [t.amount, t.balanceAfter, t.type]).sort((a, b) => a[1] - b[1]),
    [
      [-20, 100, 'admin_adjustment'],
      [120, 120, 'admin_adjustment'],
    ],
  )
  const audit = await pool().query(`SELECT action FROM audit_logs WHERE resource_id = $1 ORDER BY action`, [staff.id])
  assert.deepEqual(
    audit.rows.map((r) => r.action),
    ['credits.added', 'credits.removed'],
  )
})

test('balance can never go negative; the failed adjustment leaves no trace', async () => {
  const director = await user('DIRECTOR')
  const staff = await user('STAFF')
  const r = await call('POST', '/admin/credits/adjust', { headers: director.auth, body: { userId: staff.id, amount: -5 } })
  assert.equal(r.status, 409)
  assert.equal(r.body.code, 'INSUFFICIENT_CREDITS')
  const ledger = await pool().query(`SELECT COUNT(*) AS n FROM credit_transactions WHERE user_id = $1`, [staff.id])
  assert.equal(ledger.rows[0].n, 0)
})

test('adjusting is refused without permission, outside the organisation, and for bad input', async () => {
  const director = await user('DIRECTOR')
  const staff = await user('STAFF')
  const other = await user('STAFF', { orgSlug: 'other-farm' })

  const byStaff = await call('POST', '/admin/credits/adjust', { headers: staff.auth, body: { userId: staff.id, amount: 50 } })
  assert.equal(byStaff.status, 403)
  assert.equal(byStaff.body.code, 'INSUFFICIENT_PERMISSION')

  const crossOrg = await call('POST', '/admin/credits/adjust', { headers: director.auth, body: { userId: other.id, amount: 50 } })
  assert.equal(crossOrg.status, 404)

  const zero = await call('POST', '/admin/credits/adjust', { headers: director.auth, body: { userId: staff.id, amount: 0 } })
  assert.equal(zero.status, 422)
  const missing = await call('POST', '/admin/credits/adjust', { headers: director.auth, body: { amount: 10 } })
  assert.equal(missing.status, 404)
})

test('a manager without credit-admin rights cannot adjust, even inside their team', async () => {
  const manager = await user('MANAGER')
  const report = await user('STAFF', { parent: manager.id })
  const r = await call('POST', '/admin/credits/adjust', { headers: manager.auth, body: { userId: report.id, amount: 10 } })
  assert.equal(r.status, 403)
})
