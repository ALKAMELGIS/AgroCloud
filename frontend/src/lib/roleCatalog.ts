import { useEffect, useState } from 'react'
import type { Role } from './auth'
import { normalizeRole } from './auth'
import {
  DIRECTORY_ROLES_CANONICAL,
  loadSystemSettings,
  sanitizeDirectoryRoleCatalog,
  SYSTEM_SETTINGS_UPDATED_EVENT,
} from '../services/settingsStorage'

export function readDirectoryRoleCatalog(): Role[] {
  return sanitizeDirectoryRoleCatalog(loadSystemSettings().directoryRoleCatalog)
}

/** Re-read when system settings are saved (same tab) or updated in another tab. */
export function useDirectoryRoleCatalog(): Role[] {
  const [list, setList] = useState<Role[]>(readDirectoryRoleCatalog)
  useEffect(() => {
    const refresh = () => setList(readDirectoryRoleCatalog())
    window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return list
}

/** Roles a Manager/Admin may assign from the central catalog (full catalog). */
export function filterDirectoryRolesForSuperPicker(catalog: Role[]): Role[] {
  return [...catalog]
}

/** Admin Manager (and other non-super directory admins): Editor + Viewer only, intersected with catalog. */
export function filterDirectoryRolesForScopedPicker(catalog: Role[]): Role[] {
  return catalog.filter(r => r === 'Editor' || r === 'Viewer')
}

export function filterDirectoryRolesForAdminPicker(catalog: Role[], isSuperManager: boolean, isAdminManager: boolean): Role[] {
  if (isSuperManager) return filterDirectoryRolesForSuperPicker(catalog)
  if (isAdminManager) return filterDirectoryRolesForScopedPicker(catalog)
  return filterDirectoryRolesForScopedPicker(catalog)
}

export function pickDefaultAssignableRole(assignable: Role[]): Role {
  if (assignable.includes('Viewer')) return 'Viewer'
  return assignable[0] ?? 'Viewer'
}

/** When editing, keep the user's current role visible even if temporarily removed from the global catalog. */
export function rolesForUserModal(assignable: Role[], existingRole: string | undefined): Role[] {
  const r = normalizeRole(existingRole)
  if (assignable.includes(r)) return assignable
  return [...assignable, r]
}

export function sortRolesCanonically(roles: Role[]): Role[] {
  const rank = (x: Role) => DIRECTORY_ROLES_CANONICAL.indexOf(x)
  return [...roles].sort((a, b) => rank(a) - rank(b))
}

export function roleFilterOptions(
  catalog: Role[],
  isSuperManager: boolean,
  isAdminManager: boolean,
  rolesInUse: Role[],
): Role[] {
  const base = filterDirectoryRolesForAdminPicker(catalog, isSuperManager, isAdminManager)
  const extra = rolesInUse.filter(r => !base.includes(r))
  return sortRolesCanonically([...base, ...extra])
}
