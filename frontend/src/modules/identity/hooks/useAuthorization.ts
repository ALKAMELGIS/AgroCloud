import { useCallback, useEffect, useState } from 'react'
import {
  fetchIdentityMe,
  fetchIdentityStatus,
  persistIdentityPermissions,
  readIdentityPermissions,
} from '../api/identityApi'
import { hasPermission as legacyHasPermission, normalizeRole, readCurrentUser } from '@/core/auth/auth'

/**
 * Identity service status probe.
 * `checked` flips true once the first probe settles so pages can show a loading state
 * instead of flashing "unavailable"; `recheck` re-runs the probe (used by Retry actions).
 */
export function useIdentityStatus() {
  const [available, setAvailable] = useState(false)
  const [checked, setChecked] = useState(false)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let alive = true
    fetchIdentityStatus().then((ok) => {
      if (!alive) return
      setAvailable(ok)
      setChecked(true)
    })
    return () => {
      alive = false
    }
  }, [nonce])
  const recheck = useCallback(() => {
    setChecked(false)
    setNonce((n) => n + 1)
  }, [])
  return { available, checked, recheck }
}

export function useIdentityAvailable() {
  return useIdentityStatus().available
}

export function useAuthorization() {
  const { available: identityAvailable, checked: identityChecked, recheck: recheckIdentity } = useIdentityStatus()
  const [permissions, setPermissions] = useState<string[]>(() => readIdentityPermissions())
  const [loading, setLoading] = useState(identityAvailable)

  useEffect(() => {
    if (!identityAvailable) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchIdentityMe()
      .then((me) => {
        if (me?.permissions?.length) {
          setPermissions(me.permissions)
          persistIdentityPermissions(me.permissions)
        }
      })
      .finally(() => setLoading(false))
  }, [identityAvailable])

  const can = useCallback(
    (code: string) => {
      if (identityAvailable && permissions.length) return permissions.includes(code)
      const user = readCurrentUser()
      return legacyHasPermission(code, user?.role ?? normalizeRole(user?.role))
    },
    [identityAvailable, permissions],
  )

  return { can, permissions, identityAvailable, identityChecked, recheckIdentity, loading }
}
