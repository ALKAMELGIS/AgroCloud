import { isIdentityReady } from './db.js'
import { findUsersByEmailForAuth, mapUserForClient, updateUserPasswordAndLogin } from './userService.js'
import { attachSessionToLogin } from './identityRoutes.js'
import { loadUserPermissions } from './sessionService.js'

/**
 * @param {import('express').Response} res
 * @param {{ email: string, password: string, verifyPassword: (pw: string, hash: string) => { ok: boolean, migratedHash: string | null } }} input
 */
export async function tryIdentityLogin(req, res, input) {
  if (!isIdentityReady()) return null
  const { email, password, verifyPassword } = input
  const matches = await findUsersByEmailForAuth(email)
  if (!matches.length) return null // fall back to legacy JSON directory

  let matched = null
  let migratedHash = null
  for (const candidate of matches) {
    const result = verifyPassword(password, candidate.password_hash)
    if (result.ok) {
      matched = candidate
      migratedHash = result.migratedHash
      break
    }
  }
  if (!matched) return { failed: true, reason: 'invalid_credentials' }

  if (String(matched.status).toUpperCase() !== 'ACTIVE') {
    return { failed: true, reason: 'account_not_active', status: matched.status }
  }

  if (migratedHash) {
    await updateUserPasswordAndLogin(null, matched.id, migratedHash, false)
  } else {
    await updateUserPasswordAndLogin(null, matched.id, matched.password_hash, true)
  }

  await attachSessionToLogin(res, matched.id, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  })

  const permissions = await loadUserPermissions(matched.id, matched.role_id)
  return {
    ok: true,
    user: mapUserForClient({ ...matched, role_code: matched.role_code }, permissions),
    permissions,
  }
}
