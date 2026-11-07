import { Router } from 'express'
import { getPool, isIdentityReady } from './db.js'
import { requireIdentitySession, identityErrorHandler } from './authMiddleware.js'
import { resolveSessionUser, clearSessionCookie, deleteSessionByToken, parseCookies, sessionCookieName, createSession, setSessionCookie } from './sessionService.js'
import { mapUserForClient } from './userService.js'
import {
  listUsers,
  createUser,
  updateUser,
  disableUser,
  activateUser,
  transferUser,
  getHierarchy,
} from './userService.js'
import { requirePermission, hasPermission } from './authorizationService.js'
import {
  getOrgManpowerSummary,
  listAllocations,
  allocateManpower,
  listTransactions,
} from './manpowerService.js'
import {
  adminAdjustCredits,
  getWalletForUser,
  listCreditTransactions,
} from './creditsService.js'

const router = Router()

router.get('/identity/status', (_req, res) => {
  res.json({ ok: true, identity: isIdentityReady() })
})

router.get('/identity/me', async (req, res) => {
  if (!isIdentityReady()) return res.status(503).json({ ok: false, code: 'identity_unavailable' })
  const actor = await resolveSessionUser(req)
  if (!actor) return res.status(401).json({ ok: false, code: 'unauthorized' })
  return res.json({
    ok: true,
    user: mapUserForClient(actor.user, actor.permissions),
    permissions: actor.permissions,
  })
})

router.post('/identity/logout', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie)
  const auth = String(req.headers.authorization || '')
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  // Same token sources as resolveSessionUser: cookie first, then Bearer.
  const token = cookies[sessionCookieName()] || bearer
  if (token) await deleteSessionByToken(token)
  clearSessionCookie(res)
  return res.json({ ok: true })
})

// Session required for the routes below — scoped to this router's own paths so other /api/v1 routes
// are never answered with 401 by this guard.
router.use(['/identity', '/manpower', '/credits', '/admin/credits'], requireIdentitySession)

router.get('/identity/users', async (req, res) => {
  try {
    const users = await listUsers(null, req.identityActor)
    return res.json({ ok: true, users })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.post('/identity/users', async (req, res) => {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN IMMEDIATE') // takes the write lock up front (SQLite's equivalent of SELECT … FOR UPDATE)
    const user = await createUser(client, req.identityActor, req.body || {})
    await client.query('COMMIT')
    return res.status(201).json({ ok: true, user })
  } catch (e) {
    await client.query('ROLLBACK')
    return identityErrorHandler(e, res)
  } finally {
    client.release()
  }
})

router.patch('/identity/users/:id', async (req, res) => {
  try {
    const user = await updateUser(null, req.identityActor, req.params.id, req.body || {})
    return res.json({ ok: true, user })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.post('/identity/users/:id/disable', async (req, res) => {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN IMMEDIATE') // takes the write lock up front (SQLite's equivalent of SELECT … FOR UPDATE)
    const result = await disableUser(client, req.identityActor, req.params.id)
    await client.query('COMMIT')
    return res.json(result)
  } catch (e) {
    await client.query('ROLLBACK')
    return identityErrorHandler(e, res)
  } finally {
    client.release()
  }
})

router.post('/identity/users/:id/activate', async (req, res) => {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN IMMEDIATE') // takes the write lock up front (SQLite's equivalent of SELECT … FOR UPDATE)
    const result = await activateUser(client, req.identityActor, req.params.id)
    await client.query('COMMIT')
    return res.json(result)
  } catch (e) {
    await client.query('ROLLBACK')
    return identityErrorHandler(e, res)
  } finally {
    client.release()
  }
})

router.post('/identity/users/:id/transfer', async (req, res) => {
  try {
    const user = await transferUser(null, req.identityActor, req.params.id, req.body || {})
    return res.json({ ok: true, user })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.get('/identity/roles', async (req, res) => {
  try {
    requirePermission(req.identityActor, 'roles.view')
    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT r.*, json_group_array(p.code) FILTER (WHERE p.code IS NOT NULL) AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.organization_id IS NULL
       GROUP BY r.id
       ORDER BY r.level DESC`,
    )
    return res.json({ ok: true, roles: rows.map((r) => ({ ...r, permissions: JSON.parse(r.permissions || '[]') })) })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.get('/identity/permissions', async (req, res) => {
  try {
    requirePermission(req.identityActor, 'permissions.view')
    const pool = getPool()
    const { rows } = await pool.query('SELECT * FROM permissions ORDER BY code')
    return res.json({ ok: true, permissions: rows })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.get('/identity/hierarchy', async (req, res) => {
  try {
    const nodes = await getHierarchy(null, req.identityActor, req.query.root || null)
    return res.json({ ok: true, nodes })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.get('/identity/hierarchy/:userId', async (req, res) => {
  try {
    const nodes = await getHierarchy(null, req.identityActor, req.params.userId)
    return res.json({ ok: true, nodes })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.get('/manpower', async (req, res) => {
  try {
    requirePermission(req.identityActor, 'manpower.view')
    const summary = await getOrgManpowerSummary(null, req.identityActor.user.organization_id)
    return res.json({ ok: true, ...summary })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.get('/manpower/allocations', async (req, res) => {
  try {
    requirePermission(req.identityActor, 'manpower.view')
    const rows = await listAllocations(null, req.identityActor.user.organization_id)
    return res.json({ ok: true, allocations: rows })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.post('/manpower/allocate', async (req, res) => {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN IMMEDIATE') // takes the write lock up front (SQLite's equivalent of SELECT … FOR UPDATE)
    const row = await allocateManpower(client, req.identityActor, req.body || {})
    await client.query('COMMIT')
    return res.json({ ok: true, allocation: row })
  } catch (e) {
    await client.query('ROLLBACK')
    return identityErrorHandler(e, res)
  } finally {
    client.release()
  }
})

router.get('/manpower/transactions', async (req, res) => {
  try {
    requirePermission(req.identityActor, 'manpower.view')
    const rows = await listTransactions(null, req.identityActor.user.organization_id)
    return res.json({ ok: true, transactions: rows })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

/* ---------- credits (see core/docs/CREDITS.md) ---------- */

function walletForClient(w) {
  return { id: w.id, balance: Number(w.balance), updatedAt: w.updated_at }
}

function transactionForClient(t) {
  return {
    id: t.id,
    amount: Number(t.amount),
    balanceAfter: Number(t.balance_after),
    type: t.type,
    reason: t.reason,
    referenceId: t.reference_id,
    metadata: t.metadata,
    actorUserId: t.actor_user_id,
    createdAt: t.created_at,
  }
}

router.get('/credits/wallet', async (req, res) => {
  try {
    requirePermission(req.identityActor, 'credits.read')
    const wallet = await getWalletForUser(req.identityActor.user.id)
    return res.json({ ok: true, wallet: walletForClient(wallet) })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.get('/credits/transactions', async (req, res) => {
  try {
    requirePermission(req.identityActor, 'credits.read')
    const rows = await listCreditTransactions(req.identityActor.user.id, {
      limit: req.query.limit,
      offset: req.query.offset,
    })
    return res.json({ ok: true, transactions: rows.map(transactionForClient) })
  } catch (e) {
    return identityErrorHandler(e, res)
  }
})

router.post('/admin/credits/adjust', async (req, res) => {
  const { userId, amount, reason } = req.body || {}
  const client = await getPool().connect()
  try {
    await client.query('BEGIN IMMEDIATE') // wallet read + update + ledger row as one write
    const result = await adminAdjustCredits(client, req.identityActor, userId, amount, reason)
    await client.query('COMMIT')
    return res.json({
      ok: true,
      balance: Number(result.wallet.balance),
      transaction: transactionForClient(result.transaction),
    })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    return identityErrorHandler(e, res)
  } finally {
    client.release()
  }
})

export function registerIdentityRoutes(app) {
  app.use('/api/v1', router)
}

export async function attachSessionToLogin(res, userId, meta) {
  const session = await createSession(userId, meta)
  if (session) {
    setSessionCookie(res, session.token, { secure: process.env.NODE_ENV === 'production' })
  }
  return session
}
