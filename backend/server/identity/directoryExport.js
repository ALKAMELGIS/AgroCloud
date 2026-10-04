import { getPool, isIdentityReady } from './db.js'
import { mapUserForClient } from './userService.js'

/** Legacy admin directory shape for read-only bridge. */
export async function exportDirectorySnapshot() {
  if (!isIdentityReady()) return null
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT u.*, r.code AS role_code, p.legacy_directory_id AS parent_legacy_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN users p ON p.id = u.parent_user_id
     ORDER BY u.created_at ASC`,
  )
  const users = rows.map((r) => {
    const client = mapUserForClient(r)
    return {
      id: client.id,
      name: client.name,
      email: client.email,
      role: client.role,
      scope: client.scope,
      managedById: client.managedById,
      status: client.status,
      lastLogin: client.lastLogin,
      emailVerified: client.emailVerified,
      passwordHash: r.password_hash,
    }
  })
  const { rows: auditRows } = await pool.query(
    `SELECT id, created_at AS at, action, resource_type AS entity, resource_id AS entityId, metadata AS meta
     FROM audit_logs ORDER BY created_at DESC LIMIT 500`,
  )
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    users,
    auditLog: auditRows.map((a) => ({
      id: a.id,
      at: a.at,
      entity: a.entity,
      entityId: a.entityId,
      action: a.action,
      meta: a.meta,
    })),
    readOnly: true,
    source: 'postgresql',
  }
}
