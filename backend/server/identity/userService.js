import { getPool } from './db.js'
import {
  assertCanCreateRole,
  assertCanManageUser,
  AuthzError,
  defaultScopeForRoleCode,
  getRoleByCode,
  hasPermission,
  isUserInActorScope,
  manpowerEnforced,
  requirePermission,
} from './authorizationService.js'
import { consumeManpower, releaseManpower } from './manpowerService.js'
import { writeAudit } from './auditService.js'

export function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

export function mapUserForClient(row, permissions = []) {
  if (!row) return null
  return {
    id: row.legacy_directory_id || row.id,
    uuid: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || undefined,
    role: legacyRoleLabel(row.role_code),
    roleCode: row.role_code,
    scope: row.scope_label || undefined,
    managedById: row.parent_legacy_id || undefined,
    parentUserId: row.parent_user_id || undefined,
    status: mapStatusToLegacy(row.status),
    lastLogin: row.last_login_at ? new Date(row.last_login_at).toLocaleString() : 'Never',
    emailVerified: row.email_verified,
    organizationId: row.organization_id,
    dataScope: row.data_scope,
    permissions,
  }
}

function mapStatusToLegacy(status) {
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'Active'
    case 'PENDING':
      return 'Pending Approval'
    case 'INACTIVE':
      return 'Disabled'
    case 'SUSPENDED':
      return 'Suspended'
    default:
      return status
  }
}

function mapLegacyStatus(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'active') return 'ACTIVE'
  if (s.includes('pending') || s === 'invited') return 'PENDING'
  if (s === 'disabled' || s === 'inactive') return 'INACTIVE'
  if (s === 'suspended') return 'SUSPENDED'
  return 'PENDING'
}

export function legacyRoleLabel(code) {
  switch (String(code || '').toUpperCase()) {
    case 'OWNER':
    case 'DIRECTOR':
      return 'Admin'
    case 'MANAGER':
      return 'Manager'
    case 'SUPERVISOR':
      return 'Admin Manager'
    case 'STAFF':
      return 'Viewer'
    default:
      return 'Viewer'
  }
}

export function mapLegacyRoleToCode(legacy) {
  const raw = String(legacy || '').trim().toLowerCase()
  if (raw === 'admin') return 'DIRECTOR'
  if (raw === 'admin manager' || raw.includes('admin') && raw.includes('manager')) return 'SUPERVISOR'
  if (raw === 'manager') return 'MANAGER'
  if (raw === 'editor') return 'STAFF'
  return 'STAFF'
}

export async function listUsers(client, actor, query = {}) {
  requirePermission(actor, 'users.view')
  const pool = client || getPool()
  const orgId = actor.user.organization_id
  let sql = `SELECT u.*, r.code AS role_code, r.level AS role_level,
    p.legacy_directory_id AS parent_legacy_id
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN users p ON p.id = u.parent_user_id
    WHERE u.organization_id = $1`
  const params = [orgId]
  if (actor.user.role_code !== 'OWNER' && actor.user.role_code !== 'DIRECTOR') {
    sql += ` AND u.id IN (
      WITH RECURSIVE subtree AS (
        SELECT id FROM users WHERE id = $2
        UNION ALL
        SELECT u2.id FROM users u2 INNER JOIN subtree s ON u2.parent_user_id = s.id WHERE u2.organization_id = $1
      )
      SELECT id FROM subtree
    )`
    params.push(actor.user.id)
  }
  sql += ' ORDER BY u.created_at DESC LIMIT 500'
  const { rows } = await pool.query(sql, params)
  return rows.map((r) => mapUserForClient(r))
}

export async function createUser(client, actor, payload) {
  requirePermission(actor, 'users.create')
  const pool = client
  const orgId = actor.user.organization_id
  const email = normalizeEmail(payload.email)
  const name = String(payload.name || '').trim()
  const roleCode = String(payload.roleCode || mapLegacyRoleToCode(payload.role)).toUpperCase()
  const role = await assertCanCreateRole(pool, actor, roleCode)
  if (!email || !name) throw new AuthzError('VALIDATION_ERROR', 'Name and email required.', 422)

  const dup = await pool.query('SELECT 1 FROM users WHERE organization_id = $1 AND email = $2', [orgId, email])
  if (dup.rows.length) throw new AuthzError('DUPLICATE_USER', 'Email already exists.', 409)

  let parentId = payload.parentUserId || null
  if (payload.managedById && !parentId) {
    const { rows: pr } = await pool.query(
      'SELECT id FROM users WHERE organization_id = $1 AND legacy_directory_id = $2',
      [orgId, payload.managedById],
    )
    parentId = pr[0]?.id || null
  }
  if (!parentId && actor.user.role_code === 'MANAGER') parentId = actor.user.id

  if (parentId) {
    const inScope = await isUserInActorScope(pool, actor, parentId)
    if (!inScope) throw new AuthzError('USER_OUTSIDE_SCOPE', 'Invalid parent manager.', 403)
  }

  if (manpowerEnforced()) {
    await consumeManpower(pool, actor, roleCode, 1, null)
  }

  const dataScope = payload.dataScope || defaultScopeForRoleCode(roleCode)
  const status = mapLegacyStatus(payload.status || 'Active')
  const passwordHash = payload.passwordHash || null

  const { rows } = await pool.query(
    `INSERT INTO users (
      organization_id, email, name, phone, role_id, parent_user_id, data_scope, status,
      password_hash, email_verified, scope_label, department, position, created_by, legacy_directory_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *`,
    [
      orgId,
      email,
      name,
      payload.phone || null,
      role.id,
      parentId,
      dataScope,
      status,
      passwordHash,
      payload.emailVerified !== false,
      payload.scope || null,
      payload.department || null,
      payload.position || null,
      actor.user.id,
      Date.now(),
    ],
  )
  const created = rows[0]
  const full = await loadUserRow(pool, created.id)
  await writeAudit(pool, {
    organizationId: orgId,
    actorUserId: actor.user.id,
    action: 'user.created',
    resourceType: 'user',
    resourceId: created.id,
    metadata: { email, roleCode },
  })
  return mapUserForClient({ ...full, role_code: roleCode })
}

async function loadUserRow(pool, userId) {
  const { rows } = await pool.query(
    `SELECT u.*, r.code AS role_code, r.level AS role_level,
      p.legacy_directory_id AS parent_legacy_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN users p ON p.id = u.parent_user_id
     WHERE u.id = $1`,
    [userId],
  )
  return rows[0]
}

export async function updateUser(client, actor, userId, patch) {
  const target = await assertCanManageUser(client, actor, userId)
  const pool = client
  const fields = []
  const values = []
  let i = 1
  if (patch.name) {
    fields.push(`name = $${i++}`)
    values.push(String(patch.name).trim())
  }
  if (patch.phone !== undefined) {
    fields.push(`phone = $${i++}`)
    values.push(patch.phone)
  }
  if (patch.scope !== undefined) {
    fields.push(`scope_label = $${i++}`)
    values.push(patch.scope)
  }
  if (patch.department !== undefined) {
    fields.push(`department = $${i++}`)
    values.push(patch.department)
  }
  if (patch.status) {
    fields.push(`status = $${i++}`)
    values.push(mapLegacyStatus(patch.status))
  }
  if (patch.roleCode || patch.role) {
    const role = await assertCanCreateRole(pool, actor, patch.roleCode || mapLegacyRoleToCode(patch.role))
    fields.push(`role_id = $${i++}`)
    values.push(role.id)
  }
  if (!fields.length) return mapUserForClient(target)
  fields.push(`updated_at = now()`)
  values.push(userId)
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, values)
  const full = await loadUserRow(pool, userId)
  await writeAudit(pool, {
    organizationId: actor.user.organization_id,
    actorUserId: actor.user.id,
    action: 'user.updated',
    resourceType: 'user',
    resourceId: userId,
    metadata: patch,
  })
  return mapUserForClient(full)
}

export async function disableUser(client, actor, userId) {
  requirePermission(actor, 'users.disable')
  await assertCanManageUser(client, actor, userId)
  const pool = client
  const full = await loadUserRow(pool, userId)
  await pool.query(`UPDATE users SET status = 'INACTIVE', updated_at = now() WHERE id = $1`, [userId])
  if (manpowerEnforced() && full.status === 'ACTIVE') {
    await releaseManpower(pool, actor, full.role_code, 1, userId)
  }
  await writeAudit(pool, {
    organizationId: actor.user.organization_id,
    actorUserId: actor.user.id,
    action: 'user.disabled',
    resourceType: 'user',
    resourceId: userId,
  })
  return { ok: true }
}

export async function activateUser(client, actor, userId) {
  requirePermission(actor, 'users.update')
  await assertCanManageUser(client, actor, userId)
  const pool = client
  const full = await loadUserRow(pool, userId)
  if (manpowerEnforced()) {
    await consumeManpower(pool, actor, full.role_code, 1, userId)
  }
  await pool.query(`UPDATE users SET status = 'ACTIVE', updated_at = now() WHERE id = $1`, [userId])
  await writeAudit(pool, {
    organizationId: actor.user.organization_id,
    actorUserId: actor.user.id,
    action: 'user.activated',
    resourceType: 'user',
    resourceId: userId,
  })
  return { ok: true }
}

export async function transferUser(client, actor, userId, { parentUserId, managedById }) {
  requirePermission(actor, 'users.update')
  const target = await assertCanManageUser(client, actor, userId)
  const pool = client
  let destParent = parentUserId
  if (managedById && !destParent) {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE organization_id = $1 AND (legacy_directory_id = $2 OR id::text = $2)',
      [actor.user.organization_id, String(managedById)],
    )
    destParent = rows[0]?.id
  }
  if (!destParent) throw new AuthzError('VALIDATION_ERROR', 'Destination manager required.', 422)
  const inScope = await isUserInActorScope(pool, actor, destParent)
  if (!inScope) throw new AuthzError('USER_OUTSIDE_SCOPE', 'Destination outside scope.', 403)
  await pool.query(`UPDATE users SET parent_user_id = $1, updated_at = now() WHERE id = $2`, [destParent, userId])
  await writeAudit(pool, {
    organizationId: actor.user.organization_id,
    actorUserId: actor.user.id,
    action: 'user.transferred',
    resourceType: 'user',
    resourceId: userId,
    metadata: { parentUserId: destParent, from: target.parent_user_id },
  })
  return loadUserRow(pool, userId).then((r) => mapUserForClient(r))
}

export async function getHierarchy(client, actor, rootUserId = null) {
  requirePermission(actor, 'users.view')
  const pool = client || getPool()
  const orgId = actor.user.organization_id
  const root = rootUserId || actor.user.id
  const { rows } = await pool.query(
    `WITH RECURSIVE tree AS (
       SELECT u.id, u.parent_user_id, u.name, u.email, u.status, r.code AS role_code, 0 AS depth
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.organization_id = $2
       UNION ALL
       SELECT u.id, u.parent_user_id, u.name, u.email, u.status, r.code, tree.depth + 1
       FROM users u
       JOIN roles r ON r.id = u.role_id
       INNER JOIN tree ON u.parent_user_id = tree.id
       WHERE u.organization_id = $2
     )
     SELECT * FROM tree ORDER BY depth, name`,
    [root, orgId],
  )
  return rows
}

export async function findUsersByEmailForAuth(email) {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT u.*, r.code AS role_code, r.level AS role_level
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE lower(u.email) = $1`,
    [normalizeEmail(email)],
  )
  return rows
}

export async function updateUserPasswordAndLogin(client, userId, passwordHash, touchLogin = true) {
  const pool = client || getPool()
  if (touchLogin) {
    await pool.query(
      `UPDATE users SET password_hash = COALESCE($1, password_hash), last_login_at = now(), updated_at = now() WHERE id = $2`,
      [passwordHash, userId],
    )
  } else if (passwordHash) {
    await pool.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [passwordHash, userId])
  }
}
