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
  const token = cookies[sessionCookieName()]
  if (token) await deleteSessionByToken(token)
  clearSessionCookie(res)
  return res.json({ ok: true })
})

router.use(requireIdentitySession)

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
    await client.query('BEGIN')
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
    await client.query('BEGIN')
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
    await client.query('BEGIN')
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
      `SELECT r.*, COALESCE(json_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '[]') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.organization_id IS NULL
       GROUP BY r.id
       ORDER BY r.level DESC`,
    )
    return res.json({ ok: true, roles: rows })
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
    await client.query('BEGIN')
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
