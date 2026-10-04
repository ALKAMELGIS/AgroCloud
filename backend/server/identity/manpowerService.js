import { getPool } from './db.js'
import { AuthzError, requirePermission } from './authorizationService.js'
import { writeAudit } from './auditService.js'

function available(row) {
  return Math.max(0, Number(row.total) - Number(row.used) - Number(row.reserved))
}

export async function listAllocations(client, organizationId) {
  const pool = client || getPool()
  const { rows } = await pool.query(
    `SELECT *, (total - used - reserved) AS available
     FROM manpower_allocations
     WHERE organization_id = $1
     ORDER BY role_code, holder_user_id NULLS FIRST`,
    [organizationId],
  )
  return rows.map((r) => ({ ...r, available: available(r) }))
}

export async function getOrgManpowerSummary(client, organizationId) {
  const rows = await listAllocations(client, organizationId)
  const sum = rows.reduce(
    (acc, r) => {
      acc.total += Number(r.total)
      acc.used += Number(r.used)
      acc.reserved += Number(r.reserved)
      acc.available += available(r)
      return acc
    },
    { total: 0, used: 0, reserved: 0, available: 0 },
  )
  return { ...sum, byRole: rows }
}

export async function ensureAllocationRow(client, organizationId, roleCode, holderUserId = null) {
  const pool = client || getPool()
  const { rows } = await pool.query(
    `INSERT INTO manpower_allocations (organization_id, holder_user_id, role_code, total, used, reserved)
     VALUES ($1, $2, $3, 0, 0, 0)
     ON CONFLICT (organization_id, role_code, holder_user_id) DO NOTHING
     RETURNING *`,
    [organizationId, holderUserId, roleCode],
  )
  if (rows[0]) return rows[0]
  const existing = await pool.query(
    `SELECT * FROM manpower_allocations
     WHERE organization_id = $1 AND role_code = $2 AND holder_user_id IS NOT DISTINCT FROM $3`,
    [organizationId, roleCode, holderUserId],
  )
  return existing.rows[0]
}

export async function consumeManpower(client, actor, roleCode, quantity = 1, targetUserId = null) {
  const pool = client
  const orgId = actor.user.organization_id
  const row = await ensureAllocationRow(pool, orgId, roleCode, null)
  const { rows } = await pool.query(
    `UPDATE manpower_allocations
     SET used = used + $1, updated_at = now()
     WHERE id = $2 AND (total - used - reserved) >= $1
     RETURNING *`,
    [quantity, row.id],
  )
  if (!rows[0]) {
    throw new AuthzError('MANPOWER_LIMIT_REACHED', 'No available manpower for this role.', 409)
  }
  await writeAudit(pool, {
    organizationId: orgId,
    actorUserId: actor.user.id,
    action: 'manpower.consume',
    resourceType: 'manpower',
    resourceId: row.id,
    metadata: { roleCode, quantity, targetUserId },
  })
  await pool.query(
    `INSERT INTO manpower_transactions (organization_id, actor_user_id, target_user_id, role_code, type, quantity, previous_value, new_value)
     VALUES ($1, $2, $3, $4, 'CONSUME', $5, $6, $7)`,
    [orgId, actor.user.id, targetUserId, roleCode, quantity, row.used, rows[0].used],
  )
  return rows[0]
}

export async function releaseManpower(client, actor, roleCode, quantity = 1, targetUserId = null) {
  const pool = client
  const orgId = actor.user.organization_id
  const row = await ensureAllocationRow(pool, orgId, roleCode, null)
  const { rows } = await pool.query(
    `UPDATE manpower_allocations
     SET used = GREATEST(0, used - $1), updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [quantity, row.id],
  )
  await pool.query(
    `INSERT INTO manpower_transactions (organization_id, actor_user_id, target_user_id, role_code, type, quantity, previous_value, new_value)
     VALUES ($1, $2, $3, $4, 'RELEASE', $5, $6, $7)`,
    [orgId, actor.user.id, targetUserId, roleCode, quantity, row.used, rows[0]?.used ?? 0],
  )
  return rows[0]
}

export async function allocateManpower(client, actor, { roleCode, total, holderUserId = null, reason = '' }) {
  const pool = client
  requirePermission(actor, 'manpower.allocate')
  const orgId = actor.user.organization_id
  const row = await ensureAllocationRow(pool, orgId, roleCode, holderUserId)
  const prev = Number(row.total)
  const next = Number(total)
  if (next < Number(row.used) + Number(row.reserved)) {
    throw new AuthzError('VALIDATION_ERROR', 'Total cannot be less than used + reserved.', 422)
  }
  const { rows } = await pool.query(
    `UPDATE manpower_allocations SET total = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [next, row.id],
  )
  await pool.query(
    `INSERT INTO manpower_transactions (organization_id, actor_user_id, role_code, type, quantity, previous_value, new_value, reason)
     VALUES ($1, $2, $3, 'ALLOCATE', $4, $5, $6, $7)`,
    [orgId, actor.user.id, roleCode, next - prev, prev, next, reason],
  )
  await writeAudit(pool, {
    organizationId: orgId,
    actorUserId: actor.user.id,
    action: 'manpower.allocate',
    resourceType: 'manpower',
    resourceId: row.id,
    metadata: { roleCode, total: next },
  })
  return rows[0]
}

export async function listTransactions(client, organizationId, limit = 100) {
  const pool = client || getPool()
  const { rows } = await pool.query(
    `SELECT * FROM manpower_transactions
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [organizationId, limit],
  )
  return rows
}
