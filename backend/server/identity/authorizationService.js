import { getPool } from './db.js'

export class AuthzError extends Error {
  constructor(code, message, status = 403) {
    super(message)
    this.code = code
    this.status = status
  }
}

export function hasPermission(actor, code) {
  if (!actor?.permissions) return false
  return actor.permissions.includes(code)
}

export function requirePermission(actor, code) {
  if (!hasPermission(actor, code)) {
    throw new AuthzError('INSUFFICIENT_PERMISSION', 'Forbidden.', 403)
  }
}

export function defaultScopeForRoleCode(roleCode) {
  switch (String(roleCode || '').toUpperCase()) {
    case 'OWNER':
    case 'DIRECTOR':
      return 'ORGANIZATION'
    case 'MANAGER':
      return 'MANAGER_SCOPE'
    case 'SUPERVISOR':
      return 'SUPERVISOR_SCOPE'
    default:
      return 'USER_SCOPE'
  }
}

export async function getRoleByCode(client, code, organizationId = null) {
  const pool = client || getPool()
  const { rows } = await pool.query(
    `SELECT * FROM roles WHERE code = $1 AND (organization_id IS NULL OR organization_id = $2)
     ORDER BY organization_id NULLS FIRST LIMIT 1`,
    [String(code).toUpperCase(), organizationId],
  )
  return rows[0] || null
}

export async function getUserById(client, userId, organizationId) {
  const pool = client || getPool()
  const { rows } = await pool.query(
    `SELECT u.*, r.code AS role_code, r.level AS role_level
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.organization_id = $2`,
    [userId, organizationId],
  )
  return rows[0] || null
}

/** Users visible in actor subtree (simplified: org-wide for OWNER/DIRECTOR, descendants for others). */
export async function isUserInActorScope(client, actor, targetUserId) {
  if (!actor?.user) return false
  const actorRow = actor.user
  if (actorRow.role_code === 'OWNER' || actorRow.role_code === 'DIRECTOR') {
    return true
  }
  if (actorRow.id === targetUserId) return true
  const pool = client || getPool()
  const { rows } = await pool.query(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM users WHERE id = $1
       UNION ALL
       SELECT u.id FROM users u
       INNER JOIN subtree s ON u.parent_user_id = s.id
       WHERE u.organization_id = $3
     )
     SELECT 1 FROM subtree WHERE id = $2 LIMIT 1`,
    [actorRow.id, targetUserId, actorRow.organization_id],
  )
  return rows.length > 0
}

export async function assertCanManageUser(client, actor, targetUserId) {
  requirePermission(actor, 'users.update')
  const target = await getUserById(client, targetUserId, actor.user.organization_id)
  if (!target) throw new AuthzError('NOT_FOUND', 'User not found.', 404)
  if (target.role_level >= actor.user.role_level) {
    throw new AuthzError('ROLE_NOT_ALLOWED', 'Cannot modify user at this role level.', 403)
  }
  const inScope = await isUserInActorScope(client, actor, targetUserId)
  if (!inScope) throw new AuthzError('USER_OUTSIDE_SCOPE', 'User outside your scope.', 403)
  return target
}

export async function assertCanCreateRole(client, actor, targetRoleCode) {
  requirePermission(actor, 'users.create')
  const role = await getRoleByCode(client, targetRoleCode, actor.user.organization_id)
  if (!role) throw new AuthzError('VALIDATION_ERROR', 'Invalid role.', 422)
  if (role.level >= actor.user.role_level) {
    throw new AuthzError('ROLE_NOT_ALLOWED', 'Cannot assign this role.', 403)
  }
  return role
}

export function manpowerEnforced() {
  const raw = String(process.env.MANPOWER_ENFORCE || '').toLowerCase()
  if (raw === 'false') return false
  return true
}
