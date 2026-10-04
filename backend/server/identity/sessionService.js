import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { getPool, isIdentityReady } from './db.js'

const COOKIE_NAME = 'agro_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

function sessionSecret() {
  return (
    String(process.env.IDENTITY_SESSION_SECRET || '').trim() ||
    String(process.env.JWT_SECRET || '').trim() ||
    'dev-insecure-change-me'
  )
}

export function hashSessionToken(token) {
  return createHmac('sha256', sessionSecret()).update(String(token)).digest('hex')
}

export function sessionCookieName() {
  return COOKIE_NAME
}

export function parseCookies(header) {
  const out = {}
  const raw = String(header || '')
  if (!raw) return out
  raw.split(';').forEach((part) => {
    const [k, ...rest] = part.split('=')
    const key = String(k || '').trim()
    if (!key) return
    out[key] = decodeURIComponent(rest.join('=').trim())
  })
  return out
}

export function setSessionCookie(res, token, opts = {}) {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`]
  const maxAge = Math.floor((opts.maxAgeSeconds ?? SESSION_TTL_MS / 1000))
  parts.push(`Max-Age=${maxAge}`)
  parts.push('Path=/')
  parts.push('HttpOnly')
  parts.push('SameSite=Lax')
  if (opts.secure ?? process.env.NODE_ENV === 'production') parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function clearSessionCookie(res) {
  const parts = [`${COOKIE_NAME}=`, 'Max-Age=0', 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export async function createSession(userId, meta = {}) {
  if (!isIdentityReady()) return null
  const pool = getPool()
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashSessionToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt.toISOString(), meta.ip || null, meta.userAgent || null],
  )
  return { token, expiresAt }
}

export async function deleteSessionByToken(token) {
  if (!isIdentityReady() || !token) return
  const pool = getPool()
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)])
}

export async function resolveSessionUser(req) {
  if (!isIdentityReady()) return null
  const cookies = parseCookies(req.headers.cookie)
  let token = String(cookies[COOKIE_NAME] || '').trim()
  const auth = String(req.headers.authorization || '')
  if (!token && auth.toLowerCase().startsWith('bearer ')) {
    token = auth.slice(7).trim()
  }
  if (!token) return null
  const pool = getPool()
  const tokenHash = hashSessionToken(token)
  const { rows } = await pool.query(
    `SELECT u.*, r.code AS role_code, r.level AS role_level, r.name AS role_name, o.slug AS organization_slug
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN roles r ON r.id = u.role_id
     JOIN organizations o ON o.id = u.organization_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'ACTIVE'`,
    [tokenHash],
  )
  if (!rows[0]) return null
  const user = rows[0]
  const perms = await loadUserPermissions(user.id, user.role_id)
  return { user, permissions: perms, sessionToken: token }
}

export async function loadUserPermissions(userId, roleId) {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT DISTINCT p.code
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1`,
    [roleId],
  )
  return rows.map((r) => r.code)
}

export function safeCompareToken(a, b) {
  try {
    const ba = Buffer.from(String(a))
    const bb = Buffer.from(String(b))
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}
