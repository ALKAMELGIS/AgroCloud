/**
 * Enterprise-style admin directory persistence: users + audit log on the Node host
 * (survives frontend rebuilds, hot reload, and deploys when the file path is on a volume).
 *
 * Env:
 *   AGRI_ADMIN_DIRECTORY_FILE — absolute or relative to `backend/server` (default: agri_admin_directory.json)
 *   AGRI_ADMIN_DIRECTORY_TOKEN — optional; send X-Agri-Admin-Directory-Token or Authorization: Bearer …
 */
import fs from 'fs'
import path from 'path'

const MAX_USERS = 20000
const MAX_AUDIT = 8000

function emptyStore() {
  return { version: 1, updatedAt: null, users: [], auditLog: [] }
}

function readStore(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { persisted: false, data: emptyStore() }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!raw || typeof raw !== 'object') return { persisted: true, data: emptyStore() }
    const users = Array.isArray(raw.users) ? raw.users : []
    const auditLog = Array.isArray(raw.auditLog) ? raw.auditLog : []
    return {
      persisted: true,
      data: {
        version: 1,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
        users: users.slice(0, MAX_USERS),
        auditLog: auditLog.slice(0, MAX_AUDIT),
      },
    }
  } catch (e) {
    console.error('[admin-directory] read failed', e)
    return { persisted: false, data: emptyStore() }
  }
}

function writeStore(filePath, data) {
  const dir = path.dirname(filePath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: Array.isArray(data.users) ? data.users.slice(0, MAX_USERS) : [],
    auditLog: Array.isArray(data.auditLog) ? data.auditLog.slice(0, MAX_AUDIT) : [],
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
}

/**
 * @param {import('express').Express} app
 * @param {{ filePath: string, accessToken?: string }} opts
 */
export function registerAdminDirectoryPersistence(app, opts) {
  const filePath = opts.filePath
  const token = String(opts.accessToken || '').trim()

  function guard(req, res, next) {
    if (!token) return next()
    const hdr = String(req.headers['x-agri-admin-directory-token'] || '').trim()
    const auth = String(req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim()
    if (hdr === token || auth === token) return next()
    return res.status(401).json({ ok: false, error: 'Invalid or missing admin directory token.' })
  }

  app.get('/api/v1/admin/directory', guard, (_req, res) => {
    const { data } = readStore(filePath)
    return res.json({ ok: true, ...data })
  })

  app.put('/api/v1/admin/directory', guard, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const users = Array.isArray(body.users) ? body.users : null
      const auditLog = Array.isArray(body.auditLog) ? body.auditLog : null
      if (!users || !auditLog) {
        return res.status(400).json({ ok: false, error: 'Body must include users[] and auditLog[] arrays.' })
      }
      writeStore(filePath, { users, auditLog })
      return res.json({ ok: true, updatedAt: new Date().toISOString() })
    } catch (e) {
      console.error('[admin-directory] write failed', e)
      return res.status(500).json({ ok: false, error: 'Failed to persist admin directory.' })
    }
  })
}
