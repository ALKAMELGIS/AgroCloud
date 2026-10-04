import { AuthzError } from './authorizationService.js'
import { isIdentityReady } from './db.js'
import { resolveSessionUser } from './sessionService.js'

export async function requireIdentitySession(req, res, next) {
  if (!isIdentityReady()) {
    return res.status(503).json({ ok: false, error: 'Identity service not configured.', code: 'identity_unavailable' })
  }
  try {
    const actor = await resolveSessionUser(req)
    if (!actor) {
      return res.status(401).json({ ok: false, error: 'Unauthorized.', code: 'unauthorized' })
    }
    req.identityActor = actor
    return next()
  } catch (e) {
    return next(e)
  }
}

export function identityErrorHandler(err, res) {
  if (err instanceof AuthzError) {
    return res.status(err.status).json({ ok: false, error: err.message, code: err.code })
  }
  console.error('[identity]', err)
  return res.status(500).json({ ok: false, error: 'Internal error.', code: 'internal_error' })
}
