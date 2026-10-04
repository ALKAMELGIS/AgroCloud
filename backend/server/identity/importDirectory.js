/**
 * Import legacy agri_admin_directory.json users into PostgreSQL.
 */
import fs from 'fs'
import { getPool, isIdentityConfigured, runMigrations } from './db.js'
import { mapLegacyRoleToCode, normalizeEmail } from './userService.js'
import { defaultScopeForRoleCode, getRoleByCode } from './authorizationService.js'

function mapStatus(raw) {
  const s = String(raw || '').toLowerCase()
  if (s === 'active') return 'ACTIVE'
  if (s.includes('pending') || s === 'invited') return 'PENDING'
  if (s === 'disabled') return 'INACTIVE'
  return 'PENDING'
}

export async function importAdminDirectory(filePath, { dryRun = false } = {}) {
  if (!isIdentityConfigured()) throw new Error('DATABASE_URL is not set')
  const pool = getPool()
  const client = await pool.connect()
  try {
    await runMigrations(client)
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const users = Array.isArray(raw.users) ? raw.users : []
    const { rows: orgRows } = await client.query(`SELECT id FROM organizations WHERE slug = 'default' LIMIT 1`)
    let orgId = orgRows[0]?.id
    if (!orgId) {
      const ins = await client.query(
        `INSERT INTO organizations (slug, name) VALUES ('default', 'Default Organization') RETURNING id`,
      )
      orgId = ins.rows[0].id
    }

    const idMap = new Map()
    if (dryRun) {
      return { dryRun: true, count: users.length, orgId }
    }

    await client.query('BEGIN')
    for (const u of users) {
      const email = normalizeEmail(u.email)
      if (!email) continue
      const roleCode = mapLegacyRoleToCode(u.role)
      const role = await getRoleByCode(client, roleCode, orgId)
      if (!role) continue
      const legacyId = typeof u.id === 'number' ? u.id : Date.now()
      const dataScope = defaultScopeForRoleCode(roleCode)
      const { rows } = await client.query(
        `INSERT INTO users (
          organization_id, legacy_directory_id, email, name, role_id, data_scope, status,
          password_hash, email_verified, scope_label, last_login_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (organization_id, email) DO UPDATE SET
          name = EXCLUDED.name,
          role_id = EXCLUDED.role_id,
          password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
          status = EXCLUDED.status,
          legacy_directory_id = EXCLUDED.legacy_directory_id
        RETURNING id, legacy_directory_id`,
        [
          orgId,
          legacyId,
          email,
          String(u.name || email),
          role.id,
          dataScope,
          mapStatus(u.status),
          u.passwordHash || null,
          u.emailVerified !== false,
          u.scope ? String(u.scope) : null,
          u.lastLogin && u.lastLogin !== 'Never' ? new Date() : null,
        ],
      )
      idMap.set(legacyId, rows[0].id)
      idMap.set(email, rows[0].id)
    }

    for (const u of users) {
      const email = normalizeEmail(u.email)
      const userId = idMap.get(email)
      if (!userId || typeof u.managedById !== 'number') continue
      const parentId = idMap.get(u.managedById)
      if (parentId) {
        await client.query('UPDATE users SET parent_user_id = $1 WHERE id = $2', [parentId, userId])
      }
    }

    const ownerEmail = String(process.env.IDENTITY_BOOTSTRAP_OWNER_EMAIL || '').trim().toLowerCase()
    if (ownerEmail) {
      const ownerRole = await getRoleByCode(client, 'OWNER', orgId)
      if (ownerRole) {
        await client.query(
          `UPDATE users SET role_id = $1, data_scope = 'ORGANIZATION' WHERE organization_id = $2 AND lower(email) = $3`,
          [ownerRole.id, orgId, ownerEmail],
        )
      }
    }

    await client.query('COMMIT')
    return { imported: users.length, orgId }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
