/**
 * GIS / raster scope hooks (feature-flagged).
 */
import { isIdentityReady } from './db.js'
import { resolveSessionUser } from './sessionService.js'
import { hasPermission } from './authorizationService.js'

export function isGisScopeEnforced() {
  return String(process.env.GIS_SCOPE_ENFORCE || '').toLowerCase() === 'true'
}

export function isRasterAuthEnforced() {
  return String(process.env.RASTER_AUTH_ENFORCE || '').toLowerCase() === 'true'
}

export async function requireRasterAccess(req, res, next) {
  if (!isRasterAuthEnforced()) return next()
  if (!isIdentityReady()) {
    return res.status(503).json({ ok: false, error: 'Identity required for raster access.' })
  }
  const actor = await resolveSessionUser(req)
  if (!actor) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  if (!hasPermission(actor, 'raster.view')) {
    return res.status(403).json({ ok: false, error: 'Forbidden.', code: 'INSUFFICIENT_PERMISSION' })
  }
  req.identityActor = actor
  const orgId = actor.user.organization_id
  const rasterId = String(req.params?.id || '')
  req.rasterCacheKeyPrefix = `${orgId}:${rasterId}`
  return next()
}

export function rasterTileCacheKey(prefix, z, x, y) {
  if (prefix) return `${prefix}:${z}:${x}:${y}`
  return `${z}:${x}:${y}`
}

export async function filterResourcesByAssignment(client, actor, resourceType, resourceIds) {
  if (!isGisScopeEnforced() || !actor) return resourceIds
  if (actor.user.role_code === 'OWNER' || actor.user.role_code === 'DIRECTOR') return resourceIds
  const pool = client
  const { rows } = await pool.query(
    `SELECT resource_id FROM user_resource_assignments
     WHERE organization_id = $1 AND user_id = $2 AND resource_type = $3`,
    [actor.user.organization_id, actor.user.id, resourceType],
  )
  const allowed = new Set(rows.map((r) => r.resource_id))
  return resourceIds.filter((id) => allowed.has(String(id)))
}
