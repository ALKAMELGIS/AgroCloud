/**
 * John Deere Operations Center OAuth 2.0 (authorization code) + platform API proxy.
 * @see https://github.com/JohnDeere/OperationsCenterAPI-OAuth2-Java-Example
 */

import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))

/** Read at call time — `loadProductionEnv()` runs after ES module imports in index.js. */
function johnDeereClientId() {
  return String(process.env.JOHN_DEERE_CLIENT_ID || '').trim()
}
function johnDeereClientSecret() {
  return String(process.env.JOHN_DEERE_CLIENT_SECRET || '').trim()
}
function johnDeereOAuthIssuer() {
  return String(process.env.JOHN_DEERE_OAUTH_ISSUER || 'aus78tnlaysMraFhC1t7').trim()
}
function johnDeereOAuthScope() {
  return String(
    process.env.JOHN_DEERE_OAUTH_SCOPE || 'ag1 eq1 org1 offline_access openid profile',
  ).trim()
}
function johnDeereOAuthRedirectUrl() {
  return String(
    process.env.JOHN_DEERE_OAUTH_REDIRECT_URL || 'http://localhost:3011/api/john-deere/oauth/callback',
  ).trim()
}
function johnDeereApiBase() {
  return String(process.env.JOHN_DEERE_API_BASE || 'https://sandboxapi.deere.com/platform').replace(/\/$/, '')
}
function johnDeereOAuthSuccessRoute() {
  const raw = String(process.env.JOHN_DEERE_OAUTH_SUCCESS_ROUTE || '/sensors/gps').trim()
  return raw.startsWith('/') ? raw : `/${raw}`
}
function tokenUrl() {
  return `https://signin.johndeere.com/oauth2/${johnDeereOAuthIssuer()}/v1/token`
}
function authorizeUrl() {
  return `https://signin.johndeere.com/oauth2/${johnDeereOAuthIssuer()}/v1/authorize`
}
function tokensFilePath() {
  return process.env.JOHN_DEERE_OAUTH_TOKENS_FILE || path.join(SERVER_DIR, 'john_deere_oauth_tokens.json')
}

const jdStates = new Map()
/** @type {Map<string, { accessToken: string, refreshToken?: string, expiresAt: number, scope?: string, updatedAt: string }>} */
const jdSessions = new Map()

function parseCookies(header) {
  const out = {}
  const raw = String(header || '')
  if (!raw) return out
  raw.split(';').forEach(part => {
    const [k, ...rest] = part.split('=')
    const key = String(k || '').trim()
    if (!key) return
    out[key] = decodeURIComponent(rest.join('=').trim())
  })
  return out
}

function setCookie(res, name, value, opts) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (opts?.maxAgeSeconds) parts.push(`Max-Age=${Math.floor(opts.maxAgeSeconds)}`)
  parts.push(`Path=${opts?.path || '/'}`)
  if (opts?.httpOnly) parts.push('HttpOnly')
  if (opts?.sameSite) parts.push(`SameSite=${opts.sameSite}`)
  if (opts?.secure) parts.push('Secure')
  res.append('Set-Cookie', parts.join('; '))
}

function getOrCreateJohnDeereSessionId(req, res) {
  const cookies = parseCookies(req.headers.cookie)
  const existing = String(cookies.jd_oauth_sid || '').trim()
  if (existing) return existing
  const sid = randomBytes(16).toString('hex')
  setCookie(res, 'jd_oauth_sid', sid, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    maxAgeSeconds: 60 * 60 * 24 * 90,
  })
  return sid
}

function loadTokenStore() {
  try {
    const tokensFile = tokensFilePath()
    if (!fs.existsSync(tokensFile)) return
    const raw = fs.readFileSync(tokensFile, 'utf8')
    const parsed = JSON.parse(raw)
    const sessions = parsed?.sessions
    if (!sessions || typeof sessions !== 'object') return
    for (const [sid, row] of Object.entries(sessions)) {
      if (row && typeof row === 'object' && typeof row.accessToken === 'string') {
        jdSessions.set(sid, row)
      }
    }
  } catch (err) {
    console.warn('[john-deere-oauth] failed to load token store:', err?.message || err)
  }
}

function persistTokenStore() {
  try {
    const sessions = Object.fromEntries(jdSessions.entries())
    fs.writeFileSync(tokensFilePath(), JSON.stringify({ sessions, savedAt: new Date().toISOString() }, null, 2), {
      mode: 0o600,
    })
  } catch (err) {
    console.warn('[john-deere-oauth] failed to persist token store:', err?.message || err)
  }
}

function oauthConfigured() {
  return Boolean(johnDeereClientId() && johnDeereClientSecret())
}

async function exchangeToken(bodyParams) {
  const body = new URLSearchParams(bodyParams)
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'AgroCloud/1.0',
    },
    body,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    const msg = json?.error_description || json?.error || text.slice(0, 200)
    throw new Error(`Token exchange failed (${res.status}): ${msg}`)
  }
  return json
}

function storeTokens(sid, tokenJson) {
  const accessToken = String(tokenJson?.access_token || '')
  if (!accessToken) throw new Error('No access_token in token response')
  const expiresIn = Number(tokenJson?.expires_in || 3600)
  const row = {
    accessToken,
    refreshToken: typeof tokenJson?.refresh_token === 'string' ? tokenJson.refresh_token : undefined,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    scope: String(tokenJson?.scope || johnDeereOAuthScope()),
    updatedAt: new Date().toISOString(),
  }
  jdSessions.set(sid, row)
  persistTokenStore()
  return row
}

async function refreshAccessToken(sid, row) {
  if (!row?.refreshToken) throw new Error('No refresh token')
  const tokenJson = await exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: row.refreshToken,
    client_id: johnDeereClientId(),
    client_secret: johnDeereClientSecret(),
  })
  return storeTokens(sid, tokenJson)
}

async function getValidSession(req, res) {
  const sid = getOrCreateJohnDeereSessionId(req, res)
  let row = jdSessions.get(sid)
  if (!row?.accessToken) return null
  if (row.expiresAt > Date.now()) return { sid, row }
  try {
    row = await refreshAccessToken(sid, row)
    return { sid, row }
  } catch (err) {
    jdSessions.delete(sid)
    persistTokenStore()
    return null
  }
}

function requireJohnDeereSession(req, res) {
  return getValidSession(req, res).then(session => {
    if (!session) {
      res.status(401).json({ error: 'John Deere not connected.' })
      return null
    }
    return session
  })
}

async function deereApiFetch(accessToken, apiPath, init = {}) {
  const url = apiPath.startsWith('http') ? apiPath : `${johnDeereApiBase()}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.deere.axiom.v3+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'AgroCloud/1.0',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  return { ok: res.ok, status: res.status, data }
}

function unwrapDeereList(data) {
  if (Array.isArray(data?.values)) return data.values
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data)) return data
  return []
}

export function registerJohnDeereOAuthRoutes(app, { appHashRoute }) {
  loadTokenStore()

  app.get('/api/john-deere/setup', (_req, res) => {
    res.json({
      oauthConfigured: oauthConfigured(),
      redirectUri: johnDeereOAuthRedirectUrl(),
      apiBase: johnDeereApiBase(),
      scope: johnDeereOAuthScope(),
      successRoute: johnDeereOAuthSuccessRoute(),
      mapEmbedDefaultUrl: 'https://map.deere.com/',
      mapEmbedProxyLoginPath: '/api/gps/john-deere-map/go/map.deere.com/login',
      developerPortal: 'https://developer.deere.com',
    })
  })

  app.get('/api/john-deere/oauth/config', (_req, res) => {
    res.json({
      configured: oauthConfigured(),
      redirectUri: johnDeereOAuthRedirectUrl(),
      apiBase: johnDeereApiBase(),
      scope: johnDeereOAuthScope(),
      authorizeHost: 'signin.johndeere.com',
      successRoute: johnDeereOAuthSuccessRoute(),
    })
  })

  app.get('/api/john-deere/oauth/status', async (req, res) => {
    const sid = getOrCreateJohnDeereSessionId(req, res)
    const row = jdSessions.get(sid)
    if (!row?.accessToken) {
      return res.json({ connected: false, configured: oauthConfigured() })
    }
    const session = await getValidSession(req, res)
    res.json({
      connected: Boolean(session?.row?.accessToken),
      configured: oauthConfigured(),
      scope: session?.row?.scope || row.scope || '',
      updatedAt: session?.row?.updatedAt || row.updatedAt,
    })
  })

  app.post('/api/john-deere/oauth/disconnect', (req, res) => {
    const cookies = parseCookies(req.headers.cookie)
    const sid = String(cookies.jd_oauth_sid || '').trim()
    if (sid) jdSessions.delete(sid)
    persistTokenStore()
    res.json({ ok: true })
  })

  app.get('/api/john-deere/oauth/start', (req, res) => {
    if (!oauthConfigured()) {
      return res.status(500).json({
        error:
          'John Deere OAuth is not configured. Set JOHN_DEERE_CLIENT_ID and JOHN_DEERE_CLIENT_SECRET on the server.',
      })
    }
    const sid = getOrCreateJohnDeereSessionId(req, res)
    const state = randomBytes(16).toString('hex')
    jdStates.set(sid, { state, exp: Date.now() + 10 * 60 * 1000 })
    const q =
      `client_id=${encodeURIComponent(johnDeereClientId())}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(johnDeereOAuthRedirectUrl())}` +
      `&scope=${encodeURIComponent(johnDeereOAuthScope())}` +
      `&state=${encodeURIComponent(state)}`
    res.redirect(`${authorizeUrl()}?${q}`)
  })

  app.get('/api/john-deere/oauth/callback', async (req, res) => {
    const sid = getOrCreateJohnDeereSessionId(req, res)
    const code = String(req.query.code || '').trim()
    const state = String(req.query.state || '').trim()
    const record = jdStates.get(sid)
    jdStates.delete(sid)

    const successRoute = johnDeereOAuthSuccessRoute()
    const fail = msg => res.redirect(appHashRoute(req, successRoute, `error=${encodeURIComponent(msg)}`))

    if (!code) return fail('Missing authorization code')
    if (!record || record.state !== state || record.exp < Date.now()) return fail('Invalid OAuth state')
    if (!oauthConfigured()) return fail('John Deere OAuth not configured on server')

    try {
      const tokenJson = await exchangeToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: johnDeereOAuthRedirectUrl(),
        client_id: johnDeereClientId(),
        client_secret: johnDeereClientSecret(),
      })
      storeTokens(sid, tokenJson)
      res.redirect(appHashRoute(req, successRoute, 'connected=1'))
    } catch (err) {
      return fail(String(err?.message || 'OAuth callback failed'))
    }
  })

  app.get('/api/john-deere/organizations', async (req, res) => {
    const session = await requireJohnDeereSession(req, res)
    if (!session) return
    const r = await deereApiFetch(session.row.accessToken, '/organizations')
    if (!r.ok) return res.status(r.status).json({ error: 'John Deere API error', details: r.data })
    res.json({ items: unwrapDeereList(r.data) })
  })

  app.get('/api/john-deere/organizations/:orgId/machines', async (req, res) => {
    const session = await requireJohnDeereSession(req, res)
    if (!session) return
    const orgId = encodeURIComponent(String(req.params.orgId || '').trim())
    if (!orgId) return res.status(400).json({ error: 'Missing organization id' })
    const r = await deereApiFetch(session.row.accessToken, `/organizations/${orgId}/machines`)
    if (!r.ok) return res.status(r.status).json({ error: 'John Deere API error', details: r.data })
    res.json({ items: unwrapDeereList(r.data) })
  })

  app.get('/api/john-deere/organizations/:orgId/assets', async (req, res) => {
    const session = await requireJohnDeereSession(req, res)
    if (!session) return
    const orgId = encodeURIComponent(String(req.params.orgId || '').trim())
    if (!orgId) return res.status(400).json({ error: 'Missing organization id' })
    const r = await deereApiFetch(session.row.accessToken, `/organizations/${orgId}/assets`)
    if (!r.ok) return res.status(r.status).json({ error: 'John Deere API error', details: r.data })
    res.json({ items: unwrapDeereList(r.data) })
  })
}
