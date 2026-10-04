import { useCallback, useEffect, useState } from 'react'
import {
  fetchIdentityMe,
  fetchIdentityStatus,
  persistIdentityPermissions,
  readIdentityPermissions,
} from '../api/identityApi'
import { hasPermission as legacyHasPermission, normalizeRole, readCurrentUser } from '@/core/auth/auth'

export function useIdentityAvailable() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    fetchIdentityStatus().then(setAvailable)
  }, [])
  return available
}

export function useAuthorization() {
  const identityAvailable = useIdentityAvailable()
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

  return { can, permissions, identityAvailable, loading }
}
