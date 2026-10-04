/**
 * Dashboard data scope adapter (feature-flagged via backend GIS_SCOPE_ENFORCE).
 * When enforcement is off, returns inputs unchanged.
 */
import { readCurrentUser } from '@/core/auth/auth'

export type ScopedQuery = {
  organizationId?: string
  userId?: string
  dataScope?: string
}

export function readDashboardScope(): ScopedQuery {
  const user = readCurrentUser()
  return {
    userId: user?.id != null ? String(user.id) : undefined,
    dataScope: (user as { dataScope?: string })?.dataScope,
  }
}

export function applyDashboardScope<T extends Record<string, unknown>>(filters: T): T {
  const scope = readDashboardScope()
  if (!scope.userId) return filters
  return { ...filters, _scopeUserId: scope.userId, _dataScope: scope.dataScope }
}
