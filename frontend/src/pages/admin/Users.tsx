import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../pages/data-entry/EC.css'
import './Users.css'
import { hasPermission, normalizeEmail, normalizeRole, readCurrentUser, startSession } from '../../lib/auth'
import {
  filterDirectoryRolesForAdminPicker,
  pickDefaultAssignableRole,
  roleFilterOptions,
  rolesForUserModal,
  useDirectoryRoleCatalog,
} from '../../lib/roleCatalog'
import { readProfileExtra } from '../../lib/userProfilePersistence'
import { appendAuditLog, AUDIT_LOG_STORAGE_KEY, readAuditLog } from '../../lib/audit'
import {
  flushAdminDirectoryToServer,
  pullAdminDirectoryFromServer,
  scheduleAdminDirectorySync,
} from '../../lib/adminDirectoryPersistence'

type User = {
  id: number
  name: string
  email: string
  role: string
  scope?: string
  managedById?: number
  status: string
  lastLogin: string
  passwordHash?: string
   emailVerified?: boolean
   verificationToken?: string
}

type SortKey = keyof Pick<User, 'name' | 'email' | 'role' | 'scope' | 'status' | 'lastLogin'>

type SortConfig = {
  key: SortKey
  direction: 'asc' | 'desc'
}

function adminUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? ''
  return `${first}${second}`.toUpperCase()
}

function adminAvatarFallbackBg(seed: string): string {
  const s = seed || 'user'
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return `linear-gradient(145deg, hsl(${hue} 52% 44%), hsl(${(hue + 42) % 360} 56% 50%))`
}

function AdminUserAvatar({ email, name, large }: { email: string; name: string; large?: boolean }) {
  const url = readProfileExtra(email).avatarDataUrl?.trim()
  const base = 'admin-users__avatar' + (large ? ' admin-users__avatar--lg' : '')
  if (url) {
    return <img src={url} alt="" className={base} />
  }
  return (
    <div
      className={`${base} admin-users__avatar-fallback`}
      style={{ background: adminAvatarFallbackBg(email) }}
      aria-hidden
      title={name}
    >
      {adminUserInitials(name)}
    </div>
  )
}

export default function Users({ embedded }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const isEmbedded = Boolean(embedded)
  const [users, setUsers] = useState<User[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Viewer',
    scope: '',
    managedById: '' as number | '',
    status: 'Active',
    lastLogin: 'Never'
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('All')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [isAuditOpen, setIsAuditOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [batchAction, setBatchAction] = useState<'enable' | 'disable' | 'resetPassword' | 'assignRole' | 'exportCsv'>('disable')
  const [batchRole, setBatchRole] = useState<string>('Viewer')
  const [isNarrow, setIsNarrow] = useState(false)
  const [duplicateEmailKeys, setDuplicateEmailKeys] = useState<string[]>([])
  const directoryHydratedRef = useRef(false)

  const currentUser = useMemo(() => readCurrentUser(), [])
  const currentRole = useMemo(() => normalizeRole(currentUser?.role), [currentUser?.role])
  const canManageUsers = useMemo(() => hasPermission('admin.users.manage', currentRole), [currentRole])
  const isSuperManager = currentRole === 'Manager' || currentRole === 'Admin'
  const isAdminManager = currentRole === 'Admin Manager'
  const canImpersonate = currentRole === 'Admin'
  const centralRoleCatalog = useDirectoryRoleCatalog()
  const adminPickerRoles = useMemo(
    () => filterDirectoryRolesForAdminPicker(centralRoleCatalog, isSuperManager, isAdminManager),
    [centralRoleCatalog, isSuperManager, isAdminManager],
  )
  const roleFilterSelectOptions = useMemo(
    () => roleFilterOptions(centralRoleCatalog, isSuperManager, isAdminManager, users.map(u => normalizeRole(u.role))),
    [centralRoleCatalog, isSuperManager, isAdminManager, users],
  )
  const modalRoleOptions = useMemo(() => {
    const existing =
      editingId !== null ? users.find(u => u.id === editingId)?.role : undefined
    return rolesForUserModal(adminPickerRoles, existing)
  }, [adminPickerRoles, editingId, users])

  useEffect(() => {
    setBatchRole(prev => {
      const n = normalizeRole(prev)
      if (adminPickerRoles.includes(n)) return prev
      return pickDefaultAssignableRole(adminPickerRoles)
    })
  }, [adminPickerRoles])

  useEffect(() => {
    setNewUser(prev => {
      const n = normalizeRole(prev.role)
      if (modalRoleOptions.includes(n)) return prev
      return { ...prev, role: pickDefaultAssignableRole(modalRoleOptions) }
    })
  }, [modalRoleOptions])

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth <= 600)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isModalOpen])

  const normalizeUser = (raw: any): User | null => {
    if (!raw || typeof raw !== 'object') return null
    const email = String(raw.email || '').trim()
    if (!email) return null
    const id = typeof raw.id === 'number' ? raw.id : Number(raw.id || 0)
    return {
      id: Number.isFinite(id) && id > 0 ? id : Date.now(),
      name: String(raw.name || email),
      email,
      role: normalizeRole(raw.role),
      scope: raw.scope ? String(raw.scope).trim() || undefined : undefined,
      managedById: typeof raw.managedById === 'number' ? raw.managedById : undefined,
      status: String(raw.status || 'Active'),
      lastLogin: String(raw.lastLogin || 'Never'),
      passwordHash: typeof raw.passwordHash === 'string' ? raw.passwordHash : undefined,
      emailVerified: typeof raw.emailVerified === 'boolean' ? raw.emailVerified : undefined,
      verificationToken: typeof raw.verificationToken === 'string' ? raw.verificationToken : undefined,
    }
  }

  const scoreUserQuality = (u: User): number => {
    const hasPassword = typeof u.passwordHash === 'string' && u.passwordHash.length > 0 ? 8 : 0
    const verified = u.emailVerified === true ? 4 : 0
    const active = String(u.status || '').toLowerCase() === 'active' ? 2 : 0
    const hasLastLogin = String(u.lastLogin || '').toLowerCase() !== 'never' ? 1 : 0
    return hasPassword + verified + active + hasLastLogin
  }

  const consolidateUsersByEmail = (list: User[]): User[] => {
    const byEmail = new Map<string, User>()
    for (const user of list) {
      const key = normalizeEmail(user.email)
      const current = byEmail.get(key)
      if (!current || scoreUserQuality(user) >= scoreUserQuality(current)) byEmail.set(key, user)
    }
    return Array.from(byEmail.values())
  }

  const detectDuplicateEmailKeys = (list: User[]): string[] => {
    const counts = new Map<string, number>()
    for (const user of list) {
      const key = normalizeEmail(user.email)
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
      .sort((a, b) => a.localeCompare(b))
  }

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    try {
      let toast = document.getElementById('ec-notification')
      if (!toast) {
        toast = document.createElement('div')
        toast.id = 'ec-notification'
        toast.className = 'ec-notification'
        toast.setAttribute('role', 'status')
        toast.setAttribute('aria-live', 'polite')
        document.body.appendChild(toast)
      }

      toast.textContent = message
      toast.className = `ec-notification show ${type}`

      window.setTimeout(() => {
        if (!toast) return
        toast.className = `ec-notification hide ${type}`
        window.setTimeout(() => {
          if (toast) toast.className = 'ec-notification'
        }, 420)
      }, 2600)
    } catch {}
  }

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const clearSelection = () => setSelectedIds([])

  const appendUserAudit = (action: string, target?: { id?: string; email?: string }, meta?: any) => {
    if (!(currentRole === 'Manager' || currentRole === 'Admin Manager' || currentRole === 'Admin')) return
    appendAuditLog({
      entity: 'user',
      entityId: target?.id,
      action,
      meta: { targetEmail: target?.email, ...meta },
    })
  }

  const canManageUser = (u: User): boolean => {
    if (!canManageUsers) return false
    if (isSuperManager) return true
    if (isAdminManager) {
      if (currentUser?.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) return true
      const scopeOk = String(u.scope || '') === String(currentUser?.scope || '')
      const managedOk = typeof u.managedById === 'number' && typeof currentUser?.id === 'number' && u.managedById === currentUser.id
      const roleOk = u.role === 'Editor' || u.role === 'Viewer'
      return scopeOk && managedOk && roleOk
    }
    return false
  }

  const canDeleteUser = (u: User): boolean => {
    if (!canManageUser(u)) return false
    if (currentUser?.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) return false
    return true
  }

  const handleBack = () => {
    navigate('/', { state: { openGroup: 'admin' } })
  }

  const scanDuplicateAccounts = (showResultToast = false): string[] => {
    try {
      const raw = localStorage.getItem('adminUsers')
      if (!raw) {
        setDuplicateEmailKeys([])
        if (showResultToast) showToast('No duplicate accounts found.', 'success')
        return []
      }
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        setDuplicateEmailKeys([])
        if (showResultToast) showToast('No duplicate accounts found.', 'success')
        return []
      }
      const normalized = parsed.map(normalizeUser).filter(Boolean) as User[]
      const keys = detectDuplicateEmailKeys(normalized)
      setDuplicateEmailKeys(keys)
      if (showResultToast) {
        showToast(keys.length ? `Found ${keys.length} duplicate email account groups.` : 'No duplicate accounts found.', keys.length ? 'info' : 'success')
      }
      return keys
    } catch {
      if (showResultToast) showToast('Failed to scan duplicate accounts.', 'error')
      return []
    }
  }

  const handleCleanupDuplicateAccounts = () => {
    try {
      const raw = localStorage.getItem('adminUsers')
      if (!raw) {
        showToast('No duplicate accounts found.', 'success')
        setDuplicateEmailKeys([])
        return
      }
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        showToast('No duplicate accounts found.', 'success')
        setDuplicateEmailKeys([])
        return
      }
      const normalized = parsed.map(normalizeUser).filter(Boolean) as User[]
      const duplicateKeys = detectDuplicateEmailKeys(normalized)
      if (!duplicateKeys.length) {
        showToast('No duplicate accounts found.', 'success')
        setDuplicateEmailKeys([])
        return
      }
      const consolidated = consolidateUsersByEmail(normalized)
      localStorage.setItem('adminUsers', JSON.stringify(consolidated))
      setUsers(consolidated)
      setDuplicateEmailKeys([])
      appendUserAudit('cleanup_duplicate_accounts', undefined, {
        duplicateEmailGroups: duplicateKeys.length,
        removedRecords: Math.max(0, normalized.length - consolidated.length),
      })
      showToast(`Cleaned ${duplicateKeys.length} duplicate email account groups.`, 'success')
    } catch {
      showToast('Failed to clean duplicate accounts.', 'error')
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let loadedUsers: User[] = []
      const remote = await pullAdminDirectoryFromServer()
      if (cancelled) return

      if (remote && Array.isArray(remote.users) && remote.users.length > 0) {
        try {
          const normalized = remote.users.map(normalizeUser).filter(Boolean) as User[]
          setDuplicateEmailKeys(detectDuplicateEmailKeys(normalized))
          loadedUsers = consolidateUsersByEmail(normalized)
          localStorage.setItem('adminUsers', JSON.stringify(loadedUsers))
          if (Array.isArray(remote.auditLog) && remote.auditLog.length) {
            try {
              localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(remote.auditLog))
            } catch {
              /* ignore */
            }
          }
        } catch {
          loadedUsers = []
        }
      } else {
        const stored = localStorage.getItem('adminUsers')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed)) {
              const normalized = parsed.map(normalizeUser).filter(Boolean) as User[]
              setDuplicateEmailKeys(detectDuplicateEmailKeys(normalized))
              loadedUsers = consolidateUsersByEmail(normalized)
            }
          } catch {
            /* ignore */
          }
        }
      }

      const storedCurrent = localStorage.getItem('currentUser')
      if (storedCurrent) {
        try {
          const parsedCurrent = JSON.parse(storedCurrent) as { id?: number; name?: string; email?: string; role?: string; scope?: string }
          if (parsedCurrent && parsedCurrent.email) {
            const exists = loadedUsers.some(u => normalizeEmail(u.email) === normalizeEmail(parsedCurrent.email))
            if (!exists) {
              const seededUser: User = {
                id: parsedCurrent.id || Date.now(),
                name: parsedCurrent.name || parsedCurrent.email,
                email: String(parsedCurrent.email).trim(),
                role: normalizeRole(parsedCurrent.role),
                scope: parsedCurrent.scope ? String(parsedCurrent.scope).trim() || undefined : undefined,
                status: 'Active',
                lastLogin: 'Never',
                emailVerified: true
              }
              loadedUsers = [...loadedUsers, seededUser]
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (loadedUsers.length) {
        setUsers(loadedUsers)
        try {
          localStorage.setItem('adminUsers', JSON.stringify(loadedUsers))
        } catch {
          /* ignore */
        }
        if (!remote || !remote.users.length) {
          void flushAdminDirectoryToServer()
        }
      }

      directoryHydratedRef.current = true
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!directoryHydratedRef.current) return
    try {
      localStorage.setItem('adminUsers', JSON.stringify(users))
    } catch {
      /* ignore */
    }
    scheduleAdminDirectorySync()
  }, [users])

  const validateEmail = (email: string) => {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return pattern.test(email)
  }
  const hashPassword = async (password: string) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const buffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(buffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManageUsers) {
      showToast('Unauthorized.', 'error')
      appendUserAudit('unauthorized_create', undefined, { reason: 'no_permission' })
      return
    }
    const nextName = newUser.name.trim()
    const nextEmail = newUser.email.trim()
    if (!nextName || !nextEmail) {
      showToast('Name and email are required.', 'error')
      return
    }
    if (!validateEmail(nextEmail)) {
      showToast('Email format is invalid.', 'error')
      return
    }
    const exists = users.some(u => normalizeEmail(u.email) === normalizeEmail(nextEmail) && u.id !== editingId)
    if (exists) {
      showToast('A user with this email already exists.', 'error')
      return
    }

    const roleNorm = normalizeRole(newUser.role)
    if (!modalRoleOptions.includes(roleNorm)) {
      showToast('Selected role is not allowed by the system role catalog.', 'error')
      return
    }

    if (editingId !== null) {
      const existing = users.find(u => u.id === editingId)
      if (!existing) {
        showToast('User not found.', 'error')
        return
      }
      if (!canManageUser(existing)) {
        showToast('Unauthorized.', 'error')
        appendUserAudit('unauthorized_update', { id: String(existing.id), email: existing.email }, { reason: 'scope_or_hierarchy' })
        return
      }
      if (newUser.password && newUser.password.length < 8) {
        showToast('Password must be at least 8 characters.', 'error')
        return
      }
      const passwordHash = newUser.password ? await hashPassword(newUser.password) : existing.passwordHash

      const nextRole = isAdminManager && existing.role === 'Admin Manager' ? existing.role : newUser.role
      const nextScope =
        isAdminManager
          ? String(currentUser?.scope || existing.scope || '')
          : newUser.role === 'Admin Manager'
            ? newUser.scope.trim()
            : newUser.scope.trim()
      const nextManagedById =
        isAdminManager
          ? typeof currentUser?.id === 'number'
            ? currentUser.id
            : existing.managedById
          : typeof newUser.managedById === 'number'
            ? newUser.managedById
            : undefined

      if (!isAdminManager && nextRole === 'Admin Manager' && !String(nextScope || '').trim()) {
        showToast('Scope is required for Admin Manager.', 'error')
        return
      }

      setUsers(prev =>
        prev.map(user =>
          user.id === editingId
            ? {
                ...user,
                name: nextName,
                email: nextEmail,
                role: normalizeRole(nextRole),
                scope: nextScope || undefined,
                managedById: nextManagedById,
                status: newUser.status,
                lastLogin: newUser.lastLogin || user.lastLogin || 'Never',
                passwordHash
              }
            : user
        )
      )
      appendUserAudit('update', { id: String(existing.id), email: newUser.email }, { role: nextRole, scope: nextScope, managedById: nextManagedById })
      showToast('User updated.', 'success')
    } else {
      if (newUser.password && newUser.password.length < 8) {
        showToast('Password must be at least 8 characters.', 'error')
        return
      }
      const creatingRole = isAdminManager ? (newUser.role === 'Editor' || newUser.role === 'Viewer' ? newUser.role : 'Viewer') : newUser.role

      const creatingScope =
        isAdminManager
          ? String(currentUser?.scope || '').trim()
          : creatingRole === 'Admin Manager'
            ? newUser.scope.trim()
            : newUser.scope.trim()

      if (creatingRole === 'Admin Manager' && !creatingScope) {
        showToast('Scope is required for Admin Manager.', 'error')
        return
      }

      const creatingManagedById =
        isAdminManager
          ? typeof currentUser?.id === 'number'
            ? currentUser.id
            : undefined
          : typeof newUser.managedById === 'number'
            ? newUser.managedById
            : undefined
      const hasPassword = Boolean(newUser.password)
      const passwordHash = hasPassword ? await hashPassword(newUser.password) : undefined
      const verificationToken =
        !hasPassword
          ? typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function'
            ? window.crypto.randomUUID()
            : String(Date.now())
          : undefined
      const user: User = {
        id: Date.now(),
        name: nextName,
        email: nextEmail,
        role: normalizeRole(creatingRole),
        scope: creatingScope || undefined,
        managedById: creatingManagedById,
        status: hasPassword ? newUser.status : 'Invited',
        lastLogin: newUser.lastLogin || 'Never',
        passwordHash,
        emailVerified: hasPassword ? true : false,
        verificationToken
      }
      setUsers([...users, user])
      appendUserAudit(hasPassword ? 'create' : 'invite', { id: String(user.id), email: user.email }, { role: creatingRole, scope: creatingScope, managedById: creatingManagedById })
      if (hasPassword) {
        showToast('User created.', 'success')
      } else {
        const base = typeof window !== 'undefined' ? window.location.origin : ''
        const inviteLink = `${base}/login?invite=1&token=${encodeURIComponent(verificationToken || '')}&email=${encodeURIComponent(user.email)}`
        showToast(`Invite link generated for ${user.email}.`, 'success')
        try {
          navigator.clipboard?.writeText?.(inviteLink)
        } catch {}
      }
    }
    setIsModalOpen(false)
    setEditingId(null)
    setNewUser({
      name: '',
      email: '',
      password: '',
      role: pickDefaultAssignableRole(adminPickerRoles),
      scope: '',
      managedById: '',
      status: 'Active',
      lastLogin: 'Never',
    })
    setCurrentPage(1)
  }

  const handleRequestDelete = (id: number) => {
    const target = users.find(u => u.id === id)
    if (!target) return
    if (!canDeleteUser(target)) {
      showToast('Unauthorized.', 'error')
      appendUserAudit('unauthorized_delete', { id: String(target.id), email: target.email }, { reason: 'scope_or_hierarchy' })
      return
    }
    setConfirmDeleteId(id)
  }

  const handleConfirmDelete = () => {
    if (confirmDeleteId === null) return
    const target = users.find(u => u.id === confirmDeleteId)
    if (target) {
      if (!canDeleteUser(target)) {
        showToast('Unauthorized.', 'error')
        appendUserAudit('unauthorized_delete', { id: String(target.id), email: target.email }, { reason: 'scope_or_hierarchy' })
        setConfirmDeleteId(null)
        return
      }
      setUsers(prev => prev.filter(u => u.id !== confirmDeleteId))
      appendUserAudit('delete', { id: String(target.id), email: target.email })
      showToast('User deleted.', 'success')
    }
    setConfirmDeleteId(null)
  }

  const handleClearAll = () => {
    setUsers([])
    localStorage.removeItem('adminUsers')
  }

  const handleEditUser = (user: User) => {
    if (!canManageUser(user)) {
      showToast('Unauthorized.', 'error')
      appendUserAudit('unauthorized_update', { id: String(user.id), email: user.email }, { reason: 'scope_or_hierarchy' })
      return
    }
    setNewUser({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      scope: String(user.scope || ''),
      managedById: typeof user.managedById === 'number' ? user.managedById : '',
      status: user.status,
      lastLogin: user.lastLogin || 'Never'
    })
    setEditingId(user.id)
    setIsModalOpen(true)
  }

  const handleResetPassword = (user: User) => {
    if (!canManageUser(user)) {
      showToast('Unauthorized.', 'error')
      appendUserAudit('unauthorized_reset_password', { id: String(user.id), email: user.email }, { reason: 'scope_or_hierarchy' })
      return
    }
    appendUserAudit('reset_password', { id: String(user.id), email: user.email })
    showToast(`Password reset link sent to ${user.email}`, 'success')
  }

  const handleToggleStatus = (user: User) => {
    if (!canManageUser(user)) {
      showToast('Unauthorized.', 'error')
      appendUserAudit('unauthorized_toggle_status', { id: String(user.id), email: user.email }, { reason: 'scope_or_hierarchy' })
      return
    }
    setUsers(prev =>
      prev.map(u =>
        u.id === user.id
          ? {
              ...u,
              status: u.status === 'Active' ? 'Inactive' : 'Active'
            }
          : u
      )
    )
    appendUserAudit(user.status === 'Active' ? 'deactivate' : 'activate', { id: String(user.id), email: user.email })
    showToast(user.status === 'Active' ? 'User deactivated.' : 'User activated.', 'success')
  }

  const handleImpersonate = (user: User) => {
    if (!canImpersonate) return
    if (!user || !user.email) return
    const actor = readCurrentUser()
    if (!actor) return
    if (actor.email && actor.email.toLowerCase() === user.email.toLowerCase()) {
      showToast('You are already signed in as this user.', 'info')
      return
    }
    appendAuditLog({
      entity: 'user',
      action: 'impersonate',
      entityId: String(user.id),
      meta: { targetEmail: user.email, actorEmail: actor.email },
    })
    try {
      localStorage.setItem('impersonation_v1', JSON.stringify({ actor, target: { id: user.id, email: user.email } }))
    } catch {}
    const nextUser = { id: user.id, name: user.name, email: user.email, role: user.role, scope: user.scope }
    startSession(nextUser as any)
    try {
      localStorage.setItem('currentUser', JSON.stringify(nextUser))
    } catch {}
    navigate('/', { replace: true })
  }

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const visibleUsers = useMemo(() => {
    if (!canManageUsers) return []
    if (isSuperManager) return users
    if (isAdminManager) {
      const me = currentUser?.email ? currentUser.email.toLowerCase() : ''
      const scope = String(currentUser?.scope || '')
      return users.filter(u => {
        if (me && u.email.toLowerCase() === me) return true
        const scopeOk = String(u.scope || '') === scope
        const managedOk = typeof u.managedById === 'number' && typeof currentUser?.id === 'number' && u.managedById === currentUser.id
        const roleOk = u.role === 'Editor' || u.role === 'Viewer'
        return scopeOk && managedOk && roleOk
      })
    }
    return []
  }, [users, canManageUsers, isSuperManager, isAdminManager, currentUser?.email, currentUser?.id, currentUser?.scope])

  const adminManagers = useMemo(() => visibleUsers.filter(u => u.role === 'Admin Manager'), [visibleUsers])
  const knownScopes = useMemo(() => {
    const set = new Set<string>()
    for (const u of users) {
      const s = String(u.scope || '').trim()
      if (s) set.add(s)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [users])

  const handleExportCsv = (list: User[] = filteredAndSorted) => {
    if (!list.length) {
      showToast('No users to export.', 'info')
      return
    }
    const headers = ['Name', 'Email', 'Role', 'Scope', 'Status', 'Last Login', 'Managed By Id']
    const rows = list.map(u => [
      u.name,
      u.email,
      u.role,
      u.scope || '',
      u.status,
      u.lastLogin || 'Never',
      typeof u.managedById === 'number' ? String(u.managedById) : ''
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'users.csv'
    link.click()
    URL.revokeObjectURL(url)
    appendUserAudit('export_csv', undefined, { count: list.length })
    showToast('Exported CSV.', 'success')
  }

  const filteredAndSorted = useMemo(() => {
    const term = searchTerm.toLowerCase()
    let result = visibleUsers.filter(user => {
      const matchesSearch =
        !term ||
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      const matchesRole = roleFilter === 'All' || user.role === roleFilter
      const matchesStatus = statusFilter === 'All' || user.status === statusFilter
      return matchesSearch && matchesRole && matchesStatus
    })
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aValue = a[sortConfig.key] || ''
        const bValue = b[sortConfig.key] || ''
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return result
  }, [visibleUsers, searchTerm, roleFilter, statusFilter, sortConfig])

  const itemsPerPage = 10
  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / itemsPerPage))

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredAndSorted.slice(start, start + itemsPerPage)
  }, [filteredAndSorted, currentPage])

  const applyBatchAction = async () => {
    if (!selectedIds.length) return
    const selected = users.filter(u => selectedIds.includes(u.id))
    const manageable = selected.filter(canManageUser)
    if (!manageable.length) {
      showToast('No selected users can be managed.', 'error')
      return
    }

    if (batchAction === 'exportCsv') {
      handleExportCsv(manageable)
      clearSelection()
      return
    }

    if (batchAction === 'assignRole') {
      const br = normalizeRole(batchRole)
      if (!adminPickerRoles.includes(br)) {
        showToast('Selected role is not allowed by the system role catalog.', 'error')
        return
      }
      setUsers(prev => prev.map(u => (manageable.some(m => m.id === u.id) ? { ...u, role: normalizeRole(batchRole) } : u)))
      manageable.forEach(u => appendUserAudit('role_change', { id: String(u.id), email: u.email }, { to: batchRole }))
      showToast(`Role updated for ${manageable.length} users.`, 'success')
      clearSelection()
      return
    }

    if (batchAction === 'enable' || batchAction === 'disable') {
      const nextStatus = batchAction === 'enable' ? 'Active' : 'Inactive'
      setUsers(prev => prev.map(u => (manageable.some(m => m.id === u.id) ? { ...u, status: nextStatus } : u)))
      manageable.forEach(u => appendUserAudit('status_change', { id: String(u.id), email: u.email }, { to: nextStatus }))
      showToast(`Status updated for ${manageable.length} users.`, 'success')
      clearSelection()
      return
    }

    if (batchAction === 'resetPassword') {
      manageable.forEach(u => handleResetPassword(u))
      clearSelection()
      return
    }
  }

  const statusSlug = (status: string) =>
    String(status || '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') || 'unknown'

  const roleSlug = (role: string) =>
    String(role || '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') || 'viewer'

  const renderStatusPill = (status: string) => (
    <span className={`admin-users-pill admin-users-pill--status admin-users-pill--status-${statusSlug(status)}`}>{status}</span>
  )

  const renderRolePill = (role: string) => (
    <span className={`admin-users-pill admin-users-pill--role admin-users-pill--role-${roleSlug(role)}`}>{role}</span>
  )

  const hasUsers = filteredAndSorted.length > 0

  const auditEntries = useMemo(() => {
    const all = readAuditLog().filter(e => e && e.entity === 'user')
    if (isSuperManager) return all
    if (isAdminManager) {
      const me = currentUser?.email ? currentUser.email.toLowerCase() : ''
      return all.filter(e => (e.actorEmail || '').toLowerCase() === me)
    }
    return []
  }, [isSuperManager, isAdminManager, currentUser?.email, users.length])

  const canAddUser = canManageUsers
  const canSeeAudit = canManageUsers

  if (!canManageUsers) {
    return (
      <div className="ec-page">
        <div className="ec-container ec-animate-in">
          <div className="ec-card">
            <div className="ec-card-body" style={{ color: '#64748b', fontSize: 14 }}>
              Unauthorized.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={['admin-users', isEmbedded ? 'admin-users--embedded' : 'page'].filter(Boolean).join(' ')}
      style={{ width: '100%', maxWidth: 'none', margin: isEmbedded ? '0' : 0 }}
    >
      <div className="admin-users__toolbar">
        <div className="admin-users__toolbar-left">
          {!isEmbedded ? (
            <button type="button" className="back-btn" onClick={handleBack} aria-label="Back" title="Back">
              <i className="fa-solid fa-chevron-left"></i>
            </button>
          ) : null}
          <h1 className="admin-users__title">User Management</h1>
        </div>
        <div className="admin-users__toolbar-actions">
          <button
            type="button"
            className="admin-users__btn admin-users__btn--ghost"
            onClick={() => canSeeAudit && setIsAuditOpen(true)}
            disabled={!canSeeAudit}
          >
            <i className="fa-solid fa-clipboard-list"></i>
            Audit Log
          </button>
          <button
            type="button"
            className="admin-users__btn admin-users__btn--accent"
            onClick={() => handleExportCsv()}
            disabled={!hasUsers}
          >
            <i className="fa-solid fa-file-export"></i>
            Export CSV
          </button>
          <button
            type="button"
            className={'admin-users__btn admin-users__btn--ghost' + (duplicateEmailKeys.length ? ' admin-users__btn--warn' : '')}
            onClick={() => scanDuplicateAccounts(true)}
            title={duplicateEmailKeys.length ? `${duplicateEmailKeys.length} duplicate groups detected` : 'Scan duplicate accounts'}
          >
            <i className="fa-solid fa-triangle-exclamation"></i>
            {duplicateEmailKeys.length ? `Duplicates: ${duplicateEmailKeys.length}` : 'Scan Duplicates'}
          </button>
          <button
            type="button"
            className="admin-users__btn admin-users__btn--warn"
            onClick={handleCleanupDuplicateAccounts}
            disabled={!duplicateEmailKeys.length}
            title="Keep best account record per email and remove duplicates"
          >
            <i className="fa-solid fa-broom"></i>
            Clean Duplicates
          </button>
          <button
            type="button"
            className="admin-users__btn admin-users__btn--primary"
            onClick={() => {
              if (!canAddUser) return
              setEditingId(null)
              const baseScope = isAdminManager ? String(currentUser?.scope || '') : ''
              setNewUser({
                name: '',
                email: '',
                password: '',
                role: pickDefaultAssignableRole(adminPickerRoles),
                scope: baseScope,
                managedById: isAdminManager && typeof currentUser?.id === 'number' ? currentUser.id : '',
                status: 'Active',
                lastLogin: 'Never',
              })
              setIsModalOpen(true)
            }}
            disabled={!canAddUser}
          >
            <i className="fa-solid fa-user-plus"></i>
            Add User
          </button>
        </div>
      </div>

      <div className="admin-users__filters">
        <input
          type="text"
          className="admin-users__search"
          placeholder="Search by name or email"
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value)
            setCurrentPage(1)
          }}
        />
        <select
          className="admin-users__select"
          value={roleFilter}
          onChange={e => {
            setRoleFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="All">All Roles</option>
          {roleFilterSelectOptions.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="admin-users__select"
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Suspended">Suspended</option>
          <option value="Invited">Invited</option>
          <option value="Deleted">Deleted</option>
        </select>
      </div>

      {selectedIds.length ? (
        <div className="admin-users__batch" aria-label="Batch actions">
          <div className="admin-users__batch-count">{selectedIds.length} selected</div>
          <select
            className="admin-users__select admin-users__select--sm"
            value={batchAction}
            onChange={e => setBatchAction(e.target.value as any)}
            aria-label="Batch action"
          >
            <option value="enable">Enable</option>
            <option value="disable">Disable</option>
            <option value="resetPassword">Reset password</option>
            <option value="assignRole">Assign role</option>
            <option value="exportCsv">Export CSV</option>
          </select>
          {batchAction === 'assignRole' ? (
            <select
              className="admin-users__select admin-users__select--sm"
              value={batchRole}
              onChange={e => setBatchRole(e.target.value)}
              aria-label="Role"
            >
              {adminPickerRoles.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="ec-btn ec-btn-primary" onClick={applyBatchAction}>
            Apply
          </button>
          <button type="button" className="ec-btn ec-btn-ghost" onClick={clearSelection}>
            Clear
          </button>
        </div>
      ) : null}

      {paginatedUsers.length > 0 ? (
        <>
          {isNarrow ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {paginatedUsers.map((user) => {
                const manageable = canManageUser(user)
                const checked = selectedIds.includes(user.id)
                return (
                  <div key={user.id} className="card admin-users__mobile-card">
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!manageable}
                        onChange={() => toggleSelected(user.id)}
                        aria-label={`Select ${user.email}`}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <AdminUserAvatar email={user.email} name={user.name} large />
                        <div style={{ minWidth: 0 }}>
                          <div className="admin-users__cell-name">{user.name}</div>
                          <div className="admin-users__cell-email">{user.email}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {renderRolePill(user.role)}
                        {renderStatusPill(user.status || 'Active')}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div className="admin-users__meta">Last login: {user.lastLogin || 'Never'}</div>
                      <div className="admin-users__row-actions">
                        {canImpersonate ? (
                          <button
                            type="button"
                            className="admin-users__icon-btn admin-users__icon-btn--impersonate"
                            title="Impersonate"
                            onClick={() => handleImpersonate(user)}
                          >
                            <i className="fa-solid fa-user-secret"></i>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={'admin-users__icon-btn' + (manageable ? '' : ' admin-users__icon-btn--disabled')}
                          title="Edit"
                          onClick={() => handleEditUser(user)}
                          disabled={!manageable}
                        >
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        <button
                          type="button"
                          className={
                            'admin-users__icon-btn admin-users__icon-btn--danger' + (canDeleteUser(user) ? '' : ' admin-users__icon-btn--disabled')
                          }
                          title={canDeleteUser(user) ? 'Delete' : 'Not allowed'}
                          onClick={() => handleRequestDelete(user.id)}
                          disabled={!canDeleteUser(user)}
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                        <button
                          type="button"
                          className={'admin-users__icon-btn' + (manageable ? '' : ' admin-users__icon-btn--disabled')}
                          title="Reset Password"
                          onClick={() => handleResetPassword(user)}
                          disabled={!manageable}
                        >
                          <i className="fa-solid fa-key"></i>
                        </button>
                        <button
                          type="button"
                          className={'admin-users__icon-btn admin-users__icon-btn--toggle' + (manageable ? '' : ' admin-users__icon-btn--disabled')}
                          title={user.status === 'Active' ? 'Deactivate User' : 'Activate User'}
                          onClick={() => handleToggleStatus(user)}
                          disabled={!manageable}
                        >
                          <i className={user.status === 'Active' ? 'fa-solid fa-user-slash' : 'fa-solid fa-user-check'}></i>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="card admin-users__table-wrap">
              <table className="admin-users__table">
                <thead>
                  <tr className="admin-users__thead-row">
                    <th className="admin-users__th admin-users__th--check">
                      <input
                        type="checkbox"
                        checked={paginatedUsers.length > 0 && paginatedUsers.every(u => selectedIds.includes(u.id))}
                        onChange={() => {
                          const pageIds = paginatedUsers.map(u => u.id)
                          const allSelected = pageIds.every(id => selectedIds.includes(id))
                          if (allSelected) {
                            setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)))
                          } else {
                            setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds.filter(id => !prev.includes(id))])))
                          }
                        }}
                        aria-label="Select all users on this page"
                      />
                    </th>
                    <th className="admin-users__th">Avatar</th>
                    <th className="admin-users__th admin-users__th--sort" onClick={() => handleSort('name')}>
                      Name
                    </th>
                    <th className="admin-users__th admin-users__th--sort" onClick={() => handleSort('email')}>
                      Email
                    </th>
                    <th className="admin-users__th admin-users__th--sort" onClick={() => handleSort('role')}>
                      Role
                    </th>
                    <th className="admin-users__th admin-users__th--sort" onClick={() => handleSort('status')}>
                      Status
                    </th>
                    <th className="admin-users__th admin-users__th--sort" onClick={() => handleSort('lastLogin')}>
                      Last Login
                    </th>
                    <th className="admin-users__th admin-users__th--actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map(user => {
                    const manageable = canManageUser(user)
                    return (
                      <tr key={user.id} className="admin-users__tbody-row">
                        <td className="admin-users__td">
                          <input type="checkbox" checked={selectedIds.includes(user.id)} disabled={!manageable} onChange={() => toggleSelected(user.id)} aria-label={`Select ${user.email}`} />
                        </td>
                        <td className="admin-users__td">
                          <AdminUserAvatar email={user.email} name={user.name} />
                        </td>
                        <td className="admin-users__td admin-users__td--strong">{user.name}</td>
                        <td className="admin-users__td admin-users__td--strong">{user.email}</td>
                        <td className="admin-users__td">{renderRolePill(user.role)}</td>
                        <td className="admin-users__td">{renderStatusPill(user.status || 'Active')}</td>
                        <td className="admin-users__td admin-users__td--muted">{user.lastLogin || 'Never'}</td>
                        <td className="admin-users__td admin-users__td--actions">
                          <div className="admin-users__row-actions">
                            {canImpersonate ? (
                              <button
                                type="button"
                                className="admin-users__icon-btn admin-users__icon-btn--impersonate"
                                title="Impersonate"
                                onClick={() => handleImpersonate(user)}
                              >
                                <i className="fa-solid fa-user-secret"></i>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={'admin-users__icon-btn' + (manageable ? '' : ' admin-users__icon-btn--disabled')}
                              title="Edit"
                              onClick={() => handleEditUser(user)}
                              disabled={!manageable}
                            >
                              <i className="fa-solid fa-pen"></i>
                            </button>
                            <button
                              type="button"
                              className={
                                'admin-users__icon-btn admin-users__icon-btn--danger' +
                                (canDeleteUser(user) ? '' : ' admin-users__icon-btn--disabled')
                              }
                              title={canDeleteUser(user) ? 'Delete' : 'Not allowed'}
                              onClick={() => handleRequestDelete(user.id)}
                              disabled={!canDeleteUser(user)}
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                            <button
                              type="button"
                              className={'admin-users__icon-btn' + (manageable ? '' : ' admin-users__icon-btn--disabled')}
                              title="Reset Password"
                              onClick={() => handleResetPassword(user)}
                              disabled={!manageable}
                            >
                              <i className="fa-solid fa-key"></i>
                            </button>
                            <button
                              type="button"
                              className={'admin-users__icon-btn admin-users__icon-btn--toggle' + (manageable ? '' : ' admin-users__icon-btn--disabled')}
                              title={user.status === 'Active' ? 'Deactivate User' : 'Activate User'}
                              onClick={() => handleToggleStatus(user)}
                              disabled={!manageable}
                            >
                              <i className={user.status === 'Active' ? 'fa-solid fa-user-slash' : 'fa-solid fa-user-check'}></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="admin-users__pager">
              <span className="admin-users__pager-meta">
                Page {currentPage} of {totalPages}
              </span>
              <div className="admin-users__pager-btns">
                <button
                  type="button"
                  className="admin-users__pager-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="admin-users__pager-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card admin-users__empty">
          No users found. Use Add User to create the first user.
        </div>
      )}

      {isModalOpen && (
        <div
          className="users-modal-overlay"
          role="presentation"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="users-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="users-modal-heading"
            onClick={e => e.stopPropagation()}
          >
            <div className="users-modal-header">
              <h2 className="users-modal-title" id="users-modal-heading">
                <i className="fa-solid fa-user-plus" style={{ color: '#047857' }}></i>
                {editingId !== null ? 'Edit User' : 'Add New User'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="users-modal-close-btn"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="users-modal-body">
              <form
                onSubmit={handleAddUser}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              >
                <div className="ec-grid-2-col-wide">
                  <div className="ec-input-group">
                    <label className="ec-label">Name *</label>
                    <input
                      type="text"
                      required
                      value={newUser.name}
                      onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                      className="ec-input"
                    />
                  </div>

                  <div className="ec-input-group">
                    <label className="ec-label">Email *</label>
                    <input
                      type="email"
                      required
                      value={newUser.email}
                      onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                      className="ec-input"
                    />
                  </div>

                  <div className="ec-input-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="ec-label">Password</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                      className="ec-input"
                    />
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--ec-text-secondary)',
                        marginTop: '0.25rem'
                      }}
                    >
                      Must be at least 8 characters. Leave blank to send an invite link.
                    </span>
                  </div>

                  <div className="ec-input-group">
                    <label className="ec-label">Role</label>
                    <select
                      value={newUser.role}
                      onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                      className="ec-input"
                    >
                      {modalRoleOptions.map(r => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="ec-input-group">
                    <label className="ec-label">Scope</label>
                    <input
                      type="text"
                      value={newUser.scope}
                      onChange={e => setNewUser({ ...newUser, scope: e.target.value })}
                      placeholder={isAdminManager ? String(currentUser?.scope || '') : 'Region / Department'}
                      className="ec-input"
                      list="user-scope-options"
                      disabled={isAdminManager}
                    />
                    <datalist id="user-scope-options">
                      {knownScopes.map(s => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div className="ec-input-group">
                    <label className="ec-label">Managed By</label>
                    <select
                      value={typeof newUser.managedById === 'number' ? String(newUser.managedById) : ''}
                      onChange={e => {
                        const v = e.target.value ? Number(e.target.value) : ''
                        setNewUser(prev => {
                          const mgr = typeof v === 'number' ? users.find(u => u.id === v) : null
                          const nextScope = String(prev.scope || '').trim() ? prev.scope : String(mgr?.scope || '')
                          return { ...prev, managedById: v, scope: nextScope }
                        })
                      }}
                      className="ec-input"
                      disabled={isAdminManager || !(newUser.role === 'Editor' || newUser.role === 'Viewer') || !isSuperManager}
                    >
                      <option value="">—</option>
                      {users
                        .filter(u => u.role === 'Admin Manager')
                        .map(u => (
                          <option key={u.id} value={String(u.id)}>
                            {u.name} {u.scope ? `(${u.scope})` : ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="ec-input-group">
                    <label className="ec-label">Status</label>
                    <select
                      value={newUser.status}
                      onChange={e => setNewUser({ ...newUser, status: e.target.value })}
                      className="ec-input"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>

                  <div className="ec-input-group">
                    <label className="ec-label">Last Login</label>
                    <input
                      type="text"
                      value={newUser.lastLogin}
                      onChange={e => setNewUser({ ...newUser, lastLogin: e.target.value })}
                      placeholder="Never"
                      className="ec-input"
                    />
                  </div>
                </div>

                <div className="users-modal-footer">
                  <button
                    type="button"
                    className="ec-btn ec-btn-secondary"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ec-btn ec-btn-primary"
                  >
                    {editingId !== null ? 'Save Changes' : 'Add user'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId !== null && (
        <div className="ec-modal-overlay ec-modal-active admin-users__mini-overlay" role="presentation">
          <div className="ec-modal admin-users__mini-dialog" role="dialog" aria-modal="true" aria-labelledby="users-delete-heading">
            <h2 id="users-delete-heading" className="admin-users__mini-title">
              Confirm Delete
            </h2>
            <p className="admin-users__mini-text">
              Are you sure you want to delete this user? This action cannot be undone.
            </p>
            <div className="admin-users__mini-actions">
              <button type="button" className="admin-users__mini-btn admin-users__mini-btn--cancel" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
              <button type="button" className="admin-users__mini-btn admin-users__mini-btn--danger" onClick={handleConfirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {isAuditOpen && (
        <div className="ec-modal-overlay ec-modal-active admin-users__mini-overlay" role="presentation">
          <div className="ec-modal admin-users__mini-dialog admin-users__audit-dialog" role="dialog" aria-modal="true" aria-labelledby="users-audit-heading">
            <div className="admin-users__audit-head">
              <h2 id="users-audit-heading" className="admin-users__mini-title admin-users__mini-title--plain">
                Audit Log
              </h2>
              <button type="button" className="admin-users__audit-close" onClick={() => setIsAuditOpen(false)} aria-label="Close audit log">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            {auditEntries.length === 0 ? (
              <p className="admin-users__mini-text">No activity recorded yet.</p>
            ) : (
              <table className="admin-users__audit-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map(entry => (
                    <tr key={entry.id}>
                      <td className="admin-users__audit-muted">{new Date(entry.at).toLocaleString()}</td>
                      <td>{entry.actorEmail || '—'}</td>
                      <td>{entry.action}</td>
                      <td>
                        {typeof entry.meta?.['targetEmail'] === 'string' ? String(entry.meta['targetEmail']) : entry.entityId || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
