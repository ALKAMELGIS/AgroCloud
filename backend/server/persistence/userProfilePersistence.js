/**
 * Persists extended account profile fields (avatar, address, etc.) in the SQLite database
 * (`documents` store `agri_user_profiles`; a legacy agri_user_profiles.json is imported once)
 * so users see the same profile after signing in from another browser/device.
 *
 * Optional: set AGRI_USER_PROFILE_TOKEN and send the same value from the frontend via
 * VITE_AGRI_USER_PROFILE_TOKEN (header X-Agri-User-Profile-Token or Authorization: Bearer …).
 * When unset, writes are allowed without a token (suitable only for trusted local networks).
 */
import { readFileDocument, writeFileDocument } from '../database/documentStore.js'

function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function emptyStore() {
  return { version: 1, byEmail: {} }
}

function readStore(filePath) {
  try {
    const { exists, value: raw } = readFileDocument(filePath)
    if (!exists) return { persisted: false, data: emptyStore() }
    if (!raw || typeof raw !== 'object') return { persisted: true, data: emptyStore() }
    const byEmail = typeof raw.byEmail === 'object' && raw.byEmail ? { ...raw.byEmail } : {}
    return { persisted: true, data: { version: 1, byEmail } }
  } catch (e) {
    console.error('[user-profiles] read failed', e)
    return { persisted: false, data: emptyStore() }
  }
}

function writeStore(filePath, data) {
  return writeFileDocument(filePath, data)
}

/**
 * @param {import('express').Express} app
 * @param {{ filePath: string, accessToken?: string }} opts
 */
export function registerUserProfilePersistence(app, opts) {
  const filePath = opts.filePath
  const token = String(opts.accessToken || '').trim()

  function guard(req, res, next) {
    if (!token) return next()
    const hdr = String(req.headers['x-agri-user-profile-token'] || '').trim()
    const auth = String(req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim()
    if (hdr === token || auth === token) return next()
    return res.status(401).json({ error: 'Invalid or missing profile sync token.' })
  }

  app.get('/api/v1/account/profile-extra', guard, (req, res) => {
    const email = normalizeEmail(req.query.email)
    if (!email) {
      return res.status(400).json({ ok: false, error: 'Missing email query parameter.' })
    }
    const { data } = readStore(filePath)
    const profile = data.byEmail[email] && typeof data.byEmail[email] === 'object' ? data.byEmail[email] : {}
    return res.json({ ok: true, profile })
  })

  app.put('/api/v1/account/profile-extra', guard, (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const profile = req.body?.profile && typeof req.body.profile === 'object' ? req.body.profile : null
      if (!email) {
        return res.status(400).json({ ok: false, error: 'Missing email in body.' })
      }
      if (!profile) {
        return res.status(400).json({ ok: false, error: 'Missing profile object in body.' })
      }
      const { data } = readStore(filePath)
      const prev = data.byEmail[email] && typeof data.byEmail[email] === 'object' ? data.byEmail[email] : {}
      const nextProfile = { ...prev, ...profile }
      data.byEmail[email] = nextProfile
      writeStore(filePath, data)
      return res.json({ ok: true, profile: nextProfile })
    } catch (e) {
      console.error('[user-profiles] write failed', e)
      return res.status(500).json({ ok: false, error: 'Failed to save profile.' })
    }
  })
}
