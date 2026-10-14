import { createHash, randomBytes } from 'crypto'
import { getPool, isIdentityReady } from './db.js'
import { normalizeEmail, findUsersByEmailForAuth, updateUserPasswordAndLogin } from './userService.js'
import { deleteAllSessionsForUser } from './sessionService.js'
import { writeAudit } from './auditService.js'

const RESET_TTL_MS = 60 * 60 * 1000

function defaultDevAppOrigin() {
  const port = Number(process.env.VITE_DEV_PORT || 5180)
  return String(process.env.APP_ORIGIN || `http://localhost:${port}/AgroCloud`).replace(/\/+$/, '')
}

function hashResetToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

export function buildPasswordResetLink(baseUrl, token) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '') || defaultDevAppOrigin()
  return `${base}/#/login?reset=${encodeURIComponent(token)}`
}

export async function createPasswordResetTokenForUser(userId, meta = {}) {
  if (!isIdentityReady()) return null
  const pool = getPool()
  const raw = randomBytes(32).toString('base64url')
  const tokenHash = hashResetToken(raw)
  const expiresAt = new Date(Date.now() + RESET_TTL_MS)
  await pool.query(`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [
    userId,
  ])
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt.toISOString(), meta.ip || null, meta.userAgent || null],
  )
  return { token: raw, expiresAt }
}

export async function requestPasswordResetForEmail(email, meta = {}) {
  const normalized = normalizeEmail(email)
  if (!normalized) return { ok: false, reason: 'missing_email' }
  if (!isIdentityReady()) return { ok: false, reason: 'identity_unavailable' }
  const matches = await findUsersByEmailForAuth(normalized)
  const user = matches.find((u) => String(u.status).toUpperCase() === 'ACTIVE') || matches[0]
  if (!user) return { ok: true, silent: true }
  const created = await createPasswordResetTokenForUser(user.id, meta)
  if (!created) return { ok: false, reason: 'token_create_failed' }
  await writeAudit(null, {
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: 'auth.password_reset_requested',
    resourceType: 'user',
    resourceId: user.id,
    metadata: {},
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  })
  return { ok: true, user, token: created.token }
}

export async function consumePasswordResetToken(rawToken, newPasswordHash) {
  if (!isIdentityReady() || !rawToken) return { ok: false, reason: 'invalid_token' }
  const pool = getPool()
  const tokenHash = hashResetToken(rawToken)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [tokenHash],
    )
    const row = rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'invalid_token' }
    }
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id])
    await updateUserPasswordAndLogin(client, row.user_id, newPasswordHash, false)
    await deleteAllSessionsForUser(client, row.user_id)
    await client.query('COMMIT')
    return { ok: true, userId: row.user_id }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
