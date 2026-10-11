import { getPool, isIdentityReady } from './db.js'
import { AuthzError, requirePermission } from './authorizationService.js'
import { writeAudit } from './auditService.js'

const ALLOWED_TYPES = new Set([
  'welcome_bonus',
  'purchase',
  'subscription',
  'usage',
  'refund',
  'admin_adjustment',
  'promotional',
  'expiration',
])

export class CreditsError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function ensureWallet(client, userId) {
  const pool = client || getPool()
  const { rows } = await pool.query(
    `INSERT INTO wallets (user_id, balance)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = wallets.updated_at
     RETURNING *`,
    [userId],
  )
  return rows[0]
}

export async function getWalletForUser(userId) {
  if (!isIdentityReady()) return null
  return ensureWallet(null, userId)
}

export async function listCreditTransactions(userId, { limit = 50, offset = 0 } = {}) {
  if (!isIdentityReady()) return []
  const pool = getPool()
  const lim = Math.min(200, Math.max(1, Number(limit) || 50))
  const off = Math.max(0, Number(offset) || 0)
  const { rows } = await pool.query(
    `SELECT id, user_id, wallet_id, amount, balance_after, type, reason, reference_id, metadata, actor_user_id, created_at
     FROM credit_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, lim, off],
  )
  return rows
}

/**
 * Apply a signed credit delta atomically (positive = credit, negative = debit).
 */
export async function applyCreditDelta(
  client,
  {
    userId,
    amount,
    type,
    reason = '',
    referenceId = null,
    metadata = {},
    actorUserId = null,
    allowNegativeBalance = false,
  },
) {
  const pool = client
  const delta = BigInt(Math.trunc(Number(amount)))
  if (delta === 0n) {
    throw new CreditsError('VALIDATION_ERROR', 'Amount must be non-zero.', 422)
  }
  const txType = String(type || '').trim()
  if (!ALLOWED_TYPES.has(txType)) {
    throw new CreditsError('VALIDATION_ERROR', 'Invalid transaction type.', 422)
  }

  const wallet = await ensureWallet(pool, userId)
  const { rows: locked } = await pool.query(`SELECT * FROM wallets WHERE id = $1 FOR UPDATE`, [wallet.id])
  const w = locked[0]
  if (!w) throw new CreditsError('NOT_FOUND', 'Wallet not found.', 404)

  const prev = BigInt(w.balance)
  const next = prev + delta
  if (next < 0n && !allowNegativeBalance) {
    throw new CreditsError('INSUFFICIENT_CREDITS', 'Insufficient credits.', 409)
  }
  if (next < 0n) {
    throw new CreditsError('INSUFFICIENT_CREDITS', 'Insufficient credits.', 409)
  }

  const { rows: updated } = await pool.query(
    `UPDATE wallets SET balance = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [next.toString(), w.id],
  )

  const { rows: txRows } = await pool.query(
    `INSERT INTO credit_transactions
       (user_id, wallet_id, amount, balance_after, type, reason, reference_id, metadata, actor_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING *`,
    [
      userId,
      w.id,
      delta.toString(),
      next.toString(),
      txType,
      String(reason || '').slice(0, 2000),
      referenceId,
      JSON.stringify(metadata || {}),
      actorUserId,
    ],
  )

  return { wallet: updated[0], transaction: txRows[0] }
}

export async function adminAdjustCredits(client, actor, targetUserId, amount, reason) {
  requirePermission(actor, amount >= 0 ? 'credits.add' : 'credits.remove')
  const orgId = actor.user.organization_id
  const delta = Math.trunc(Number(amount))
  if (!Number.isFinite(delta) || delta === 0) {
    throw new CreditsError('VALIDATION_ERROR', 'Amount must be a non-zero integer.', 422)
  }
  const result = await applyCreditDelta(client, {
    userId: targetUserId,
    amount: delta,
    type: 'admin_adjustment',
    reason: reason || 'Admin adjustment',
    actorUserId: actor.user.id,
    metadata: { adminId: actor.user.id },
  })
  await writeAudit(client, {
    organizationId: orgId,
    actorUserId: actor.user.id,
    action: delta > 0 ? 'credits.added' : 'credits.removed',
    resourceType: 'user',
    resourceId: targetUserId,
    metadata: { amount: delta, transactionId: result.transaction.id },
  })
  return result
}

export async function debitCreditsForUsage(client, userId, creditsUsed, { service, action, referenceId, metadata } = {}) {
  const cost = Math.trunc(Number(creditsUsed))
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new CreditsError('VALIDATION_ERROR', 'Invalid usage cost.', 422)
  }
  return applyCreditDelta(client, {
    userId,
    amount: -cost,
    type: 'usage',
    reason: `${service || 'service'}:${action || 'action'}`,
    referenceId,
    metadata: { service, action, ...(metadata || {}) },
  })
}
