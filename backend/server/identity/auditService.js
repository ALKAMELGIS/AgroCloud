import { getPool } from './db.js'

export async function writeAudit(client, entry) {
  const pool = client || getPool()
  const {
    organizationId,
    actorUserId,
    action,
    resourceType = '',
    resourceId = null,
    metadata = {},
    ipAddress = null,
    userAgent = null,
  } = entry
  await pool.query(
    `INSERT INTO audit_logs (organization_id, actor_user_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      organizationId || null,
      actorUserId || null,
      action,
      resourceType,
      resourceId != null ? String(resourceId) : null,
      JSON.stringify(metadata || {}),
      ipAddress,
      userAgent,
    ],
  )
}
