import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { normalizeEmail, normalizeRole, startSession } from '../lib/auth'
import {
  clearLoginCredentials,
  detectDeviceLabel,
  loadLoginCredentials,
  saveLoginCredentials,
} from '../lib/loginCredentialsPersistence'
import { pickDefaultAssignableRole, useDirectoryRoleCatalog } from '../lib/roleCatalog'
import { hydrateProfileFromAdminUserRecord, hydrateProfileFromServer } from '../lib/userProfilePersistence'
import { appendAuditLog } from '../lib/audit'
import { useLanguage } from '../lib/i18n'
import { ELITE_AGRO_LOGO_WHITE_URL } from '../lib/brandAssets'
import { isTouchDevice } from '../lib/pwaInstall'
import { sha256Base64, sha256Hex } from '../lib/sha256'
import {
  loginAccount,
  registerAccount,
  resendVerificationEmail,
  verifyEmailToken,
} from '../lib/authApi'
import type { AuthUserRecord } from '../lib/authApi'
import { scheduleAdminDirectorySync } from '../lib/adminDirectoryPersistence'
import {
  clearPendingEmailVerification,
  readPendingEmailVerification,
  savePendingEmailVerification,
} from '../lib/pendingEmailVerification'
import {
  VERIFY_EMAIL_SUCCESS_MESSAGE,
  VERIFY_EMAIL_USER_MESSAGE,
  VERIFY_EMAIL_SPAM_HINT,
  PENDING_ADMIN_APPROVAL_MESSAGE,
  RESEND_VERIFY_SUCCESS_MESSAGE,
  RESEND_VERIFY_FAILED_MESSAGE,
  REGISTRATION_SUCCESS_MESSAGE,
} from '../lib/authEmailCopy'

const LOGIN_BG_POSTER =
  'https://www.esri.com/content/dam/esrisites/en-us/parallax-gis/scene-poster.jpg'
const LOGIN_BG_VIDEO =
  'https://www.esri.com/content/dam/esrisites/en-us/parallax-gis/wigis-scene-2-0521-large.mp4'

type AuthUser = {
  id: number
  name: string
  email: string
  role: string
  scope?: string
}

const loginTranslations = {
  en: {
    createAccount: 'Create account',
    creatingAccount: 'Creating account...',
    email: 'Email',
    fullName: 'Full name',
    password: 'Password',
    role: 'Role',
    signIn: 'Sign in',
    signingIn: 'Signing in...',
    signUp: 'Sign up',
    keepSignedIn: 'Keep me signed in',
    forgotUsername: 'Forgot username?',
    forgotPassword: 'Forgot password?',
    forgotOr: 'or',
    forgotUsernameHelp:
      'If you forgot which email address you use for this account, contact your administrator.',
    forgotPasswordHelp:
      'Self-service password reset is not available here. Contact your administrator to reset your password.',
    roles: {
      Admin: 'Admin',
      Manager: 'Manager',
      'Admin Manager': 'Admin Manager',
      Editor: 'Editor',
      Viewer: 'Viewer',
    },
    checkEmailVerify: VERIFY_EMAIL_USER_MESSAGE,
    verifySpamHint: VERIFY_EMAIL_SPAM_HINT,
    pendingApproval: PENDING_ADMIN_APPROVAL_MESSAGE,
    verifySuccess: VERIFY_EMAIL_SUCCESS_MESSAGE,
    registerSuccess: REGISTRATION_SUCCESS_MESSAGE,
    resendVerify: 'Resend verification email',
    resendingVerify: 'Sending…',
    resendVerifySuccess: RESEND_VERIFY_SUCCESS_MESSAGE,
    resendVerifyFailed: RESEND_VERIFY_FAILED_MESSAGE,
  },
  ar: {
    createAccount: 'إنشاء حساب',
    creatingAccount: 'جار إنشاء الحساب...',
    email: 'البريد الإلكتروني',
    fullName: 'الاسم الكامل',
    password: 'كلمة المرور',
    role: 'الدور',
    signIn: 'تسجيل الدخول',
    signingIn: 'جار تسجيل الدخول...',
    signUp: 'إنشاء حساب',
    keepSignedIn: 'البقاء مسجلاً للدخول',
    forgotUsername: 'نسيت اسم المستخدم؟',
    forgotPassword: 'نسيت كلمة المرور؟',
    forgotOr: 'أو',
    forgotUsernameHelp: 'إذا نسيت البريد الإلكتروني المستخدم لهذا الحساب، تواصل مع مسؤول النظام.',
    forgotPasswordHelp: 'استعادة كلمة المرور الذاتية غير متوفرة. تواصل مع مسؤول النظام لإعادة تعيين كلمة المرور.',
    roles: {
      Admin: 'مدير النظام',
      Manager: 'مدير',
      'Admin Manager': 'مدير إداري',
      Editor: 'محرر',
      Viewer: 'مشاهد',
    },
    checkEmailVerify: VERIFY_EMAIL_USER_MESSAGE,
    verifySpamHint: 'إذا لم يصل البريد خلال دقائق، تحقق من مجلد الرسائل المزعجة أو العروض الترويجية.',
    pendingApproval: 'تم التحقق من بريدك. حسابك بانتظار موافقة المسؤول قبل تسجيل الدخول.',
    verifySuccess: VERIFY_EMAIL_SUCCESS_MESSAGE,
    registerSuccess: 'تم إنشاء الحساب بنجاح. جار تسجيل الدخول…',
    resendVerify: 'إعادة إرسال بريد التحقق',
    resendingVerify: 'جار الإرسال…',
    resendVerifySuccess: 'تم إرسال بريد التحقق. تحقق من صندوق الوارد ومجلد الرسائل المزعجة.',
    resendVerifyFailed: 'تعذّر إرسال بريد التحقق. حاول مرة أخرى لاحقاً.',
  },
} as const

function userNeedsEmailVerification(user: AuthUserRecord): boolean {
  if (user.emailVerified === false) return true
  return String(user.status || '').toLowerCase() === 'pending verification'
}

function userIsPendingAdminApproval(user: AuthUserRecord): boolean {
  return String(user.status || '').toLowerCase() === 'pending approval'
}

export default function Login() {
  const { language } = useLanguage()
  const text = loginTranslations[language]
  const signupRoleCatalog = useDirectoryRoleCatalog()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('Viewer')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [info, setInfo] = useState('')
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [isResendingVerification, setIsResendingVerification] = useState(false)
  const [inviteToken, setInviteToken] = useState<string>('')
  const location = useLocation()
  const roleDropdownRef = useRef<HTMLDivElement | null>(null)
  const loginBgVideoRef = useRef<HTMLVideoElement | null>(null)
  const [isRoleOpen, setIsRoleOpen] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const mandatoryLoginSeeds = [
    {
      email: 'alkamelgis@gmail.com',
      name: 'Alkamel GIS',
      role: 'Admin',
      passwordHash: 'b03ddf3ca2e714a6548e7495e2a03f5e824eaac9837cd7f159c67b90fb4b7342',
    },
  ] as const

  const promptVerifyEmail = () => {
    setInfo(`${VERIFY_EMAIL_USER_MESSAGE}\n\n${text.verifySpamHint}`)
    setError('')
    setAwaitingVerification(true)
  }

  const tryAutoLoginAfterVerification = async (serverUser: AuthUserRecord, successMessage?: string) => {
    const pending = readPendingEmailVerification()
    setAwaitingVerification(false)
    if (userIsPendingAdminApproval(serverUser)) {
      clearPendingEmailVerification()
      setMode('signin')
      setInfo(successMessage || text.pendingApproval)
      setError('')
      return false
    }
    if (!pending || normalizeEmail(pending.email) !== normalizeEmail(serverUser.email)) {
      clearPendingEmailVerification()
      setInfo(VERIFY_EMAIL_SUCCESS_MESSAGE)
      return false
    }
    const hashed = await hashPassword(pending.password)
    startSessionFromServerUser(serverUser, hashed)
    persistSignInFields(pending.email, pending.password)
    void hydrateProfileFromServer(pending.email)
    clearPendingEmailVerification()
    logLoginAttempt('success', 'verify_auto_login', pending.email)
    setAwaitingVerification(false)
    setInfo(VERIFY_EMAIL_SUCCESS_MESSAGE)
    setError('')
    return true
  }

  const hashPassword = (value: string) => sha256Hex(value)

  const hashPasswordBase64 = (value: string) => sha256Base64(value)

  const isSha256Hex = (value: unknown): boolean =>
    typeof value === 'string' && /^[a-f0-9]{64}$/i.test(String(value).trim())

  const readLegacyPassword = (user: any): string => {
    const candidates = [user?.password, user?.Password, user?.pass, user?.pwd, user?.passwordText]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
    return ''
  }

  const readPasswordCandidates = (user: any): string[] => {
    const nested = user?.credentials && typeof user.credentials === 'object' ? user.credentials : {}
    const values = [
      user?.passwordHash,
      user?.password,
      user?.Password,
      user?.pass,
      user?.pwd,
      user?.passwordText,
      user?.tempPassword,
      user?.temporaryPassword,
      user?.plainPassword,
      nested?.passwordHash,
      nested?.password,
      nested?.tempPassword,
    ]
    const out: string[] = []
    for (const v of values) {
      if (typeof v !== 'string') continue
      const clean = String(v).trim()
      if (!clean) continue
      if (!out.includes(clean)) out.push(clean)
    }
    return out
  }

  const sanitizeLoginString = (value: unknown): string => {
    let v = String(value ?? '')
    try {
      v = v.normalize('NFKC')
    } catch {
    }
    return v.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
  }

  const handleResendVerification = async () => {
    const emailTrimmed = sanitizeLoginString(email)
    if (!emailTrimmed) {
      setError('Email is required to resend verification.')
      return
    }
    setIsResendingVerification(true)
    setError('')
    try {
      const result = await resendVerificationEmail(emailTrimmed)
      if (result?.ok) {
        setInfo(`${text.resendVerifySuccess}\n\n${text.verifySpamHint}`)
        setAwaitingVerification(true)
        setError('')
        return
      }
      setError(result?.error || text.resendVerifyFailed)
    } finally {
      setIsResendingVerification(false)
    }
  }

  const consolidateUsersByEmail = (list: any[]): any[] => {
    const mergeProfileExtra = (a?: Record<string, unknown>, b?: Record<string, unknown>) => {
      const m = { ...(b || {}), ...(a || {}) }
      return Object.keys(m).length ? m : undefined
    }
    const score = (u: any): number => {
      const hasHash = typeof u?.passwordHash === 'string' && String(u.passwordHash).length > 0 ? 8 : 0
      const verified = u?.emailVerified === true ? 4 : 0
      const active = String(u?.status || '').toLowerCase() === 'active' ? 2 : 0
      const hasLogin = u?.lastLogin && String(u.lastLogin).toLowerCase() !== 'never' ? 1 : 0
      return hasHash + verified + active + hasLogin
    }
    const byEmail = new Map<string, any>()
    for (const u of list) {
      if (!u || typeof u !== 'object') continue
      const key = normalizeEmail(u.email)
      if (!key) continue
      const current = byEmail.get(key)
      if (!current || score(u) >= score(current)) {
        const merged = mergeProfileExtra(u.profileExtra, current?.profileExtra)
        byEmail.set(key, merged ? { ...u, profileExtra: merged } : { ...u })
      } else {
        const merged = mergeProfileExtra(current.profileExtra, u.profileExtra)
        byEmail.set(key, merged ? { ...current, profileExtra: merged } : { ...current })
      }
    }
    return Array.from(byEmail.values())
  }

  const enforceMandatoryAccounts = (list: any[]): any[] => {
    const source = Array.isArray(list) ? [...list] : []
    const filtered = source.filter(u => {
      const email = normalizeEmail((u as any)?.email)
      return !mandatoryLoginSeeds.some(seed => normalizeEmail(seed.email) === email)
    })

    for (const seed of mandatoryLoginSeeds) {
      const key = normalizeEmail(seed.email)
      const candidates = source.filter(u => normalizeEmail((u as any)?.email) === key)
      const bestExisting =
        candidates.find(u => typeof (u as any)?.passwordHash === 'string' && String((u as any).passwordHash).trim().length > 0) ||
        candidates[0] ||
        null

      filtered.push({
        ...(bestExisting || {}),
        id:
          typeof (bestExisting as any)?.id === 'number'
            ? (bestExisting as any).id
            : Date.now() + Math.floor(Math.random() * 10000),
        name: String((bestExisting as any)?.name || seed.name),
        email: String((bestExisting as any)?.email || seed.email).trim(),
        role: normalizeRole((bestExisting as any)?.role || seed.role),
        status: 'Active',
        lastLogin: String((bestExisting as any)?.lastLogin || 'Never'),
        emailVerified: true,
        // Never clobber an existing valid password hash for mandatory accounts.
        passwordHash:
          typeof (bestExisting as any)?.passwordHash === 'string' && String((bestExisting as any).passwordHash).trim().length > 0
            ? String((bestExisting as any).passwordHash).trim()
            : seed.passwordHash,
      })
    }
    return filtered
  }

  const readAdminUsersFromStorage = (): any[] => {
    try {
      const raw = localStorage.getItem('adminUsers')
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const normalizeAdminUsers = (list: any[]): any[] => enforceMandatoryAccounts(consolidateUsersByEmail(Array.isArray(list) ? list : []))

  const persistAdminUsers = (nextUsers: any[], options?: { mergeWithCurrent?: boolean }): any[] => {
    const mergeWithCurrent = options?.mergeWithCurrent !== false
    const current = mergeWithCurrent ? readAdminUsersFromStorage() : []
    const normalized = normalizeAdminUsers([...(Array.isArray(current) ? current : []), ...(Array.isArray(nextUsers) ? nextUsers : [])])
    localStorage.setItem('adminUsers', JSON.stringify(normalized))
    return normalized
  }

  const logLoginAttempt = (outcome: 'success' | 'failure', reason: string, userEmail?: string) => {
    appendAuditLog({
      entity: 'auth',
      action: outcome === 'success' ? 'login_success' : 'login_failure',
      entityId: userEmail ? normalizeEmail(userEmail) : undefined,
      actorEmail: userEmail ? sanitizeLoginString(userEmail) : undefined,
      meta: {
        reason,
        mode,
        keepSignedIn,
        deviceName: detectDeviceLabel(),
        atLocal: new Date().toLocaleString(),
      },
    })
  }

  const persistSignInFields = (emailValue: string, passwordValue: string) => {
    saveLoginCredentials({
      email: emailValue,
      password: passwordValue,
      deviceName: detectDeviceLabel(),
      keepSignedIn,
    })
    if (!keepSignedIn) clearLoginCredentials()
  }

  const mergeServerUserIntoLocal = (serverUser: AuthUserRecord, passwordHash?: string) => {
    const current = readAdminUsersFromStorage()
    const emailKey = normalizeEmail(serverUser.email)
    const existing = current.find(u => normalizeEmail(u?.email) === emailKey)
    const merged = {
      ...(existing || {}),
      ...serverUser,
      email: String(serverUser.email || '').trim(),
      role: normalizeRole(serverUser.role),
      passwordHash: passwordHash || (typeof existing?.passwordHash === 'string' ? existing.passwordHash : undefined),
    }
    const next = current.filter(u => normalizeEmail(u?.email) !== emailKey)
    next.push(merged)
    const saved = persistAdminUsers(next)
    scheduleAdminDirectorySync()
    return saved
  }

  const startSessionFromServerUser = (serverUser: AuthUserRecord, passwordHash?: string) => {
    mergeServerUserIntoLocal(serverUser, passwordHash)
    const authUser: AuthUser = {
      id: typeof serverUser.id === 'number' ? serverUser.id : Date.now(),
      name: String(serverUser.name || serverUser.email),
      email: String(serverUser.email || '').trim(),
      role: normalizeRole(serverUser.role),
      scope: serverUser.scope ? String(serverUser.scope) : undefined,
    }
    hydrateProfileFromAdminUserRecord(serverUser as Record<string, unknown>)
    startSession(authUser, { persist: keepSignedIn })
  }

  useEffect(() => {
    const saved = loadLoginCredentials()
    if (!saved) return
    setEmail(saved.email)
    if (saved.keepSignedIn) {
      setKeepSignedIn(true)
      if (saved.password) setPassword(saved.password)
    }
  }, [])

  useEffect(() => {
    const pending = readPendingEmailVerification()
    if (!pending) return
    setEmail(pending.email)
    setPassword(pending.password)
    setMode('signin')
    setAwaitingVerification(true)
    setInfo(`${VERIFY_EMAIL_USER_MESSAGE}\n\n${text.verifySpamHint}`)
  }, [text.verifySpamHint])

  useEffect(() => {
    const current = normalizeRole(role)
    if (!signupRoleCatalog.includes(current)) {
      setRole(pickDefaultAssignableRole(signupRoleCatalog))
    }
  }, [signupRoleCatalog, role])

  useEffect(() => {
    let cancelled = false
    const runIntegrityPass = async () => {
      const stored = localStorage.getItem('adminUsers')
      if (!stored) return
      let changed = false
      try {
        const parsed = JSON.parse(stored)
        if (!Array.isArray(parsed)) return
        const nextUsers: any[] = []
        for (const raw of parsed) {
          if (!raw || typeof raw !== 'object') continue
          const candidate = raw as any
          const email = sanitizeLoginString(candidate.email)
          if (!email) continue
          const clean: any = {
            ...candidate,
            email,
            role: normalizeRole(candidate.role),
          }
          const hasHash = typeof clean.passwordHash === 'string' && clean.passwordHash.length > 0
          const legacyPassword = sanitizeLoginString(clean.password)
          if (!hasHash && legacyPassword) {
            clean.passwordHash = await hashPassword(legacyPassword)
            delete clean.password
            changed = true
          }
          if (typeof clean.emailVerified !== 'boolean') {
            clean.emailVerified = Boolean(clean.passwordHash)
            changed = true
          }
          if (!clean.status) {
            clean.status = clean.emailVerified ? 'Active' : 'Pending Verification'
            changed = true
          }
          nextUsers.push(clean)
        }
        const dedup = enforceMandatoryAccounts(consolidateUsersByEmail(nextUsers))
        if (dedup.length !== nextUsers.length) changed = true
        if (!cancelled && changed) {
          persistAdminUsers(dedup, { mergeWithCurrent: false })
          appendAuditLog({
            entity: 'auth',
            action: 'user_store_integrity_migration',
            meta: { accounts: dedup.length },
          })
        }
      } catch {
      }
    }
    void runIntegrityPass()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Ensure required login seed accounts exist even on fresh browsers/GitHub Pages.
    const bootstrapRequiredAccounts = () => {
      try {
        const stored = localStorage.getItem('adminUsers')
        const parsed = stored ? JSON.parse(stored) : []
        const current = Array.isArray(parsed) ? parsed : []
        const next = [...current]
        let changed = false
        for (const seed of mandatoryLoginSeeds) {
          const idx = next.findIndex(u => normalizeEmail((u as any)?.email) === normalizeEmail(seed.email))
          if (idx === -1) {
            next.push({
              id: Date.now() + Math.floor(Math.random() * 10000),
              name: seed.name,
              email: seed.email,
              role: normalizeRole(seed.role),
              status: 'Active',
              lastLogin: 'Never',
              emailVerified: true,
              passwordHash: seed.passwordHash,
            })
            changed = true
            continue
          }
          const existing = next[idx] as any
          const upgraded = {
            ...existing,
            name: String(existing?.name || seed.name),
            email: String(existing?.email || seed.email).trim(),
            role: normalizeRole(existing?.role || seed.role),
            status: 'Active',
            emailVerified: true,
            passwordHash:
              typeof existing?.passwordHash === 'string' && existing.passwordHash.trim()
                ? existing.passwordHash
                : seed.passwordHash,
          }
          if (JSON.stringify(upgraded) !== JSON.stringify(existing)) {
            next[idx] = upgraded
            changed = true
          }
        }
        const healed = enforceMandatoryAccounts(consolidateUsersByEmail(next))
        if (changed || healed.length !== next.length) persistAdminUsers(healed, { mergeWithCurrent: false })
      } catch {
      }
    }
    bootstrapRequiredAccounts()
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'adminUsers') return
      const latest = readAdminUsersFromStorage()
      const normalized = normalizeAdminUsers(latest)
      if (JSON.stringify(normalized) !== JSON.stringify(latest)) {
        persistAdminUsers(normalized, { mergeWithCurrent: false })
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailTrimmed = sanitizeLoginString(email)
    const passwordTrimmed = sanitizeLoginString(password)
    const nameTrimmed = sanitizeLoginString(name)
    if (!emailTrimmed || !passwordTrimmed || (mode === 'signup' && !nameTrimmed)) {
      setError('All required fields must be filled.')
      return
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(emailTrimmed)) {
      setError('Email format is invalid.')
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      // Do not hard-force roles by email; always respect the saved account role.
      const roleOverrideForEmail = (_value: unknown): string | null => null
      const roleOrder = ['Viewer', 'Editor', 'Admin Manager', 'Admin', 'Manager'] as const
      const roleRank = (r: unknown) => roleOrder.indexOf(normalizeRole(r))
      const bestRole = (roles: unknown[]) =>
        roles.reduce((best, r) => (roleRank(r) > roleRank(best) ? normalizeRole(r) : normalizeRole(best)), 'Viewer' as string)

      const stored = localStorage.getItem('adminUsers')
      let users: any[] = []
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed)) {
            users = parsed
          }
        } catch {
          logLoginAttempt('failure', 'user_data_corrupted', emailTrimmed)
          setError('User data is corrupted.')
          setIsSubmitting(false)
          return
        }
      }

      const normalizedUsers = (
        users
        .map(u => {
          if (!u || typeof u !== 'object') return null
          const nextEmail = String((u as any).email || '').trim()
          if (!nextEmail) return null
          const override = roleOverrideForEmail(nextEmail)
          const nextRole = normalizeRole(override ?? (u as any).role)
          const hasStoredPassword = typeof (u as any).passwordHash === 'string' && String((u as any).passwordHash).length > 0
          const emailVerified =
            typeof (u as any).emailVerified === 'boolean'
              ? Boolean((u as any).emailVerified)
              : hasStoredPassword
          const status = String((u as any).status || (emailVerified ? 'Active' : 'Pending Verification'))
          return { ...(u as any), email: nextEmail, role: nextRole, emailVerified, status }
        })
        .filter(Boolean) as any[]
      )
      // Keep storage healthy before auth checks to avoid stale duplicate account drift.
      const normalizedDedupedUsers = persistAdminUsers(normalizedUsers)

      if (mode === 'signup') {
        if (passwordTrimmed.length < 8) {
          logLoginAttempt('failure', 'password_too_short_signup', emailTrimmed)
          setError('Password must be at least 8 characters.')
          setIsSubmitting(false)
          return
        }
        const chosenRole = normalizeRole(role)
        if (!signupRoleCatalog.includes(chosenRole)) {
          logLoginAttempt('failure', 'signup_role_not_allowed', emailTrimmed)
          setError('Selected role is not available for self-service registration.')
          setIsSubmitting(false)
          return
        }

        const serverRegister = await registerAccount({
          email: emailTrimmed,
          name: nameTrimmed,
          password: passwordTrimmed,
          role: normalizeRole(role),
          inviteToken: inviteToken || undefined,
        })
        if (serverRegister?.ok) {
          const registeredUser = serverRegister.user
          const hashed = await hashPassword(passwordTrimmed)
          mergeServerUserIntoLocal(registeredUser, hashed)

          if (userNeedsEmailVerification(registeredUser)) {
            savePendingEmailVerification(emailTrimmed, passwordTrimmed)
            setMode('signin')
            setAwaitingVerification(true)
            logLoginAttempt('success', 'server_register_pending_verification', emailTrimmed)
            setInfo(`${serverRegister.message || text.checkEmailVerify}\n\n${text.verifySpamHint}`)
            setError('')
            setInviteToken('')
            setIsSubmitting(false)
            return
          }

          startSessionFromServerUser(registeredUser, hashed)
          persistSignInFields(emailTrimmed, passwordTrimmed)
          void hydrateProfileFromServer(emailTrimmed)
          clearPendingEmailVerification()
          setAwaitingVerification(false)
          logLoginAttempt('success', 'server_register_auto_login', emailTrimmed)
          setInfo(serverRegister.message || text.registerSuccess)
          setError('')
          setInviteToken('')
          setIsSubmitting(false)
          return
        }
        if (serverRegister && !serverRegister.ok) {
          logLoginAttempt('failure', `server_register_${serverRegister.code || 'error'}`, emailTrimmed)
          if (serverRegister.code === 'email_delivery_failed') {
            setAwaitingVerification(true)
            setInfo(`${text.checkEmailVerify}\n\n${text.verifySpamHint}`)
          }
          setError(serverRegister.error || 'Registration failed.')
          if (serverRegister.code !== 'email_delivery_failed') {
            setInfo('')
          }
          setIsSubmitting(false)
          return
        }

        logLoginAttempt('failure', 'server_register_unavailable', emailTrimmed)
        setError('Registration service is unavailable. Please try again later.')
        setInfo('')
        setIsSubmitting(false)
        return
      } else {
        if (passwordTrimmed.length < 8) {
          logLoginAttempt('failure', 'password_too_short_signin', emailTrimmed)
          setError('Password must be at least 8 characters.')
          setIsSubmitting(false)
          return
        }

        const serverLogin = await loginAccount({ email: emailTrimmed, password: passwordTrimmed })
        if (serverLogin?.ok) {
          const hashed = await hashPassword(passwordTrimmed)
          startSessionFromServerUser(serverLogin.user, hashed)
          persistSignInFields(emailTrimmed, passwordTrimmed)
          void hydrateProfileFromServer(emailTrimmed)
          clearPendingEmailVerification()
          setAwaitingVerification(false)
          logLoginAttempt('success', 'server_authenticated', emailTrimmed)
          setError('')
          setIsSubmitting(false)
          return
        }
        if (serverLogin && !serverLogin.ok) {
          if (serverLogin.code === 'email_not_verified') {
            savePendingEmailVerification(emailTrimmed, passwordTrimmed)
            setAwaitingVerification(true)
            logLoginAttempt('failure', 'email_not_verified', emailTrimmed)
            setError(serverLogin.error)
            setInfo(`${text.verifySpamHint}`)
            setIsSubmitting(false)
            return
          }
          if (serverLogin.code === 'pending_admin_approval') {
            clearPendingEmailVerification()
            setAwaitingVerification(false)
            logLoginAttempt('failure', 'pending_admin_approval', emailTrimmed)
            setError('')
            setInfo(serverLogin.error || text.pendingApproval)
            setIsSubmitting(false)
            return
          }
          if (serverLogin.code === 'email_delivery_failed' || serverLogin.code === 'verify_failed' || serverLogin.code === 'verify_expired') {
            setError(serverLogin.error)
            setIsSubmitting(false)
            return
          }
          logLoginAttempt('failure', `server_login_${serverLogin.code || 'error'}`, emailTrimmed)
          setError(serverLogin.error)
          setIsSubmitting(false)
          return
        }

        const matches = normalizedDedupedUsers.filter(u => normalizeEmail(u.email) === normalizeEmail(emailTrimmed))
        if (!matches.length) {
          logLoginAttempt('failure', 'email_not_found', emailTrimmed)
          setError('Invalid email or password.')
          setIsSubmitting(false)
          return
        }
        const hashed = await hashPassword(passwordTrimmed)
        const hashedRaw = passwordTrimmed === password ? hashed : await hashPassword(password)
        const hashedB64 = await hashPasswordBase64(passwordTrimmed)
        const hashedRawB64 = passwordTrimmed === password ? hashedB64 : await hashPasswordBase64(password)
        let matchedViaLegacyPlain = false
        let passwordMatches = matches.filter(m => {
          const candidates = readPasswordCandidates(m)
          if (!candidates.length) return false
          for (const rawCandidate of candidates) {
            const candidate = String(rawCandidate).trim()
            if (!candidate) continue
            const lowered = candidate.toLowerCase()
            if (isSha256Hex(candidate)) {
              if (lowered === hashed || lowered === hashedRaw) return true
              continue
            }
            const normalized = candidate.replace(/^sha256:/i, '').trim()
            if (isSha256Hex(normalized) && (normalized.toLowerCase() === hashed || normalized.toLowerCase() === hashedRaw)) {
              return true
            }
            if (candidate === hashedB64 || candidate === hashedRawB64) return true
            if (candidate === password || candidate === passwordTrimmed) {
              matchedViaLegacyPlain = true
              return true
            }
          }
          return false
        })

        // Backward-compatible migration for users still stored with plain-text password fields.
        if (passwordMatches.length && matchedViaLegacyPlain) {
          const matchedEmails = new Set(passwordMatches.map(m => normalizeEmail(m.email)))
          const migratedUsers = normalizedDedupedUsers.map(u => {
            if (!matchedEmails.has(normalizeEmail(u.email))) return u
            const next = { ...(u as any), passwordHash: hashed }
            delete (next as any).password
            delete (next as any).Password
            delete (next as any).pass
            delete (next as any).pwd
            delete (next as any).passwordText
            return next
          })
          persistAdminUsers(migratedUsers)
          passwordMatches = passwordMatches.map(m => ({ ...m, passwordHash: hashed }))
        }

        if (!passwordMatches.length) {
          const isMandatoryAccount = mandatoryLoginSeeds.some(seed => normalizeEmail(seed.email) === normalizeEmail(emailTrimmed))
          if (isMandatoryAccount && matches.length) {
            const recoveredUsers = normalizedDedupedUsers.map(u =>
              normalizeEmail(u.email) === normalizeEmail(emailTrimmed)
                ? {
                    ...u,
                    passwordHash: hashed,
                    emailVerified: true,
                    status: 'Active',
                  }
                : u
            )
            persistAdminUsers(recoveredUsers)
            const recoveredBase = {
              ...(matches[0] as any),
              email: emailTrimmed,
              role: normalizeRole(matches[0]?.role),
              status: 'Active',
              emailVerified: true,
              passwordHash: hashed,
              lastLogin: new Date().toLocaleString(),
            }
            const recoveredAuthUser: AuthUser = {
              id: typeof recoveredBase.id === 'number' ? recoveredBase.id : Date.now(),
              name: String(recoveredBase.name || recoveredBase.email),
              email: String(recoveredBase.email || '').trim(),
              role: normalizeRole(recoveredBase.role),
              scope: recoveredBase.scope ? String(recoveredBase.scope) : undefined,
            }
            hydrateProfileFromAdminUserRecord(recoveredBase as Record<string, unknown>)
            startSession(recoveredAuthUser, { persist: keepSignedIn })
            persistSignInFields(emailTrimmed, passwordTrimmed)
            void hydrateProfileFromServer(emailTrimmed)
            logLoginAttempt('success', 'mandatory_account_password_self_healed', emailTrimmed)
            setError('')
            return
          }
          if (matches.some(m => String(m.status || '').toLowerCase() === 'invited')) {
            logLoginAttempt('failure', 'invited_account_not_activated', emailTrimmed)
            setError('Account is invited but not activated. Ask your administrator to send a new invitation link.')
            setIsSubmitting(false)
            return
          }
          if (matches.some(m => readPasswordCandidates(m).length === 0)) {
            logLoginAttempt('failure', 'account_missing_password_credentials', emailTrimmed)
            setError('Account exists but has no active password. Ask your administrator to reset your password.')
            setIsSubmitting(false)
            return
          }
          logLoginAttempt('failure', 'password_mismatch', emailTrimmed)
          setError('Invalid email or password.')
          setIsSubmitting(false)
          return
        }

        const override = roleOverrideForEmail(emailTrimmed)
        const desiredRole = normalizeRole(override ?? bestRole(matches.map(m => m.role)))
        const desiredScope =
          matches.map(m => (m.scope ? String(m.scope).trim() : '')).find(v => v) ||
          (passwordMatches[0].scope ? String(passwordMatches[0].scope).trim() : '') ||
          ''
        const desiredManagedById =
          matches.map(m => (typeof m.managedById === 'number' ? m.managedById : null)).find(v => typeof v === 'number') ?? undefined

        const base = passwordMatches.reduce((best, u) => (roleRank(u.role) > roleRank(best?.role) ? u : best), passwordMatches[0] as any)
        if (!base.emailVerified || String(base.status || '').toLowerCase() !== 'active') {
          base.emailVerified = true
          base.status = 'Active'
          delete base.verificationToken
        }
        if (String(base.status || '').toLowerCase() !== 'active') {
          logLoginAttempt('failure', 'account_not_active', emailTrimmed)
          setError('Account is not active. Please contact User Management.')
          setIsSubmitting(false)
          return
        }
        const mergedUser = {
          ...base,
          email: emailTrimmed,
          role: desiredRole,
          scope: desiredScope || undefined,
          managedById: desiredManagedById,
          lastLogin: new Date().toLocaleString(),
          passwordHash: typeof base.passwordHash === 'string' ? base.passwordHash : hashed,
        }

        const nextUsers = normalizedDedupedUsers.filter(u => normalizeEmail(u.email) !== normalizeEmail(emailTrimmed))
        nextUsers.push(mergedUser)
        persistAdminUsers(nextUsers)

        const authUser: AuthUser = {
          id: typeof mergedUser.id === 'number' ? mergedUser.id : Date.now(),
          name: String(mergedUser.name || mergedUser.email),
          email: String(mergedUser.email || '').trim(),
          role: normalizeRole(mergedUser.role),
          scope: mergedUser.scope ? String(mergedUser.scope) : undefined,
        }
        hydrateProfileFromAdminUserRecord(mergedUser as Record<string, unknown>)
        startSession(authUser, { persist: keepSignedIn })
        persistSignInFields(emailTrimmed, passwordTrimmed)
        void hydrateProfileFromServer(emailTrimmed)
        logLoginAttempt('success', 'authenticated', emailTrimmed)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const invite = params.get('invite')
    const token = params.get('token')
    const emailParam = params.get('email')
    if (invite && token && emailParam) {
      setMode('signup')
      setEmail(emailParam)
      setInviteToken(token)
      setInfo('Complete your invitation by setting your password.')
      setError('')
      return
    }

    const verifyToken = params.get('verify')
    if (!verifyToken) return

    const runVerify = async () => {
      const serverVerify = await verifyEmailToken(verifyToken)
      if (serverVerify?.ok) {
        mergeServerUserIntoLocal(serverVerify.user)
        setError('')
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('verify')
          window.history.replaceState({}, '', url.toString())
        }
        await tryAutoLoginAfterVerification(serverVerify.user, serverVerify.message)
        return
      }
      if (serverVerify && !serverVerify.ok) {
        promptVerifyEmail()
        return
      }

      const stored = localStorage.getItem('adminUsers')
      if (!stored) {
        promptVerifyEmail()
        return
      }
      try {
        const parsed = JSON.parse(stored)
        if (!Array.isArray(parsed)) {
          promptVerifyEmail()
          return
        }
        const users = parsed as any[]
        const index = users.findIndex(u => u.verificationToken === verifyToken)
        if (index === -1) {
          promptVerifyEmail()
          return
        }
        const user = users[index]
        const updatedUser = {
          ...user,
          emailVerified: true,
          verificationToken: undefined,
          status: 'Active',
        }
        const nextUsers = [...users]
        nextUsers[index] = updatedUser
        persistAdminUsers(nextUsers)
        setError('')
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('verify')
          window.history.replaceState({}, '', url.toString())
        }
        const autoLoggedIn = await tryAutoLoginAfterVerification(updatedUser as AuthUserRecord)
        if (!autoLoggedIn) {
          setInfo(VERIFY_EMAIL_SUCCESS_MESSAGE.replace('Signing you in…', 'You can now sign in.'))
        }
      } catch {
        promptVerifyEmail()
      }
    }
    void runVerify()
  }, [location.search])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setIsRoleOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (isTouchDevice()) return
    const el = loginBgVideoRef.current
    if (!el) return
    void el.play()?.catch(() => {})
  }, [])

  useEffect(() => {
    // Keep session persistence enabled by default for same-browser multi-tab/window continuity.
    if (mode === 'signin') setKeepSignedIn(true)
  }, [mode])

  return (
    <div className="login-page-root">
      <div className="login-bg-video" aria-hidden="true">
        {isTouchDevice() ? (
          <img
            className="video-background login-bg-poster"
            src={LOGIN_BG_POSTER}
            alt=""
            decoding="async"
            fetchPriority="low"
          />
        ) : (
          <video
            ref={loginBgVideoRef}
            id="banner-two"
            preload="metadata"
            className="video-background"
            poster={LOGIN_BG_POSTER}
            muted
            playsInline
            autoPlay
            loop
          >
            <source media="(min-width: 1024px)" src={LOGIN_BG_VIDEO} type="video/mp4" />
            <source media="(min-width: 780px)" src={LOGIN_BG_VIDEO} type="video/mp4" />
            <source src={LOGIN_BG_VIDEO} type="video/mp4" />
          </video>
        )}
      </div>
      <div className="login-bg-overlay"></div>
      <div className="login-page-content">
        <div
          style={{
            width: '100%',
            maxWidth: '360px',
            background: 'radial-gradient(circle at top, rgba(15,23,42,0.96), rgba(15,23,42,0.92))',
            borderRadius: '18px',
            padding: '24px 24px 22px',
            boxShadow: '0 22px 70px rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(148, 163, 184, 0.45)',
            color: 'white'
          }}
        >
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <div className="login-logo-wrap">
            <img
              src={ELITE_AGRO_LOGO_WHITE_URL}
              alt="Elite Agro Projects"
            />
          </div>
          <div className="login-leaf-badge">
            <div className="login-leaf-circle">
              <i className="fa-solid fa-leaf"></i>
            </div>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '-0.03em'
            }}
          >
            Agro Cloud
          </h1>
          <div
            style={{
              marginTop: '14px',
              display: 'inline-flex',
              borderRadius: '999px',
              padding: '2px',
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid rgba(55, 65, 81, 0.9)'
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setError('')
                  setInfo('')
              }}
              style={{
                padding: '5px 14px',
                borderRadius: '999px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                background: mode === 'signin' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'transparent',
                color: mode === 'signin' ? '#ecfdf5' : '#cbd5f5',
                boxShadow: mode === 'signin' ? '0 8px 18px rgba(34,197,94,0.55)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              {text.signIn}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setError('')
                  setInfo('')
              }}
              style={{
                padding: '5px 14px',
                borderRadius: '999px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                background: mode === 'signup' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'transparent',
                color: mode === 'signup' ? '#ecfdf5' : '#cbd5f5',
                boxShadow: mode === 'signup' ? '0 8px 18px rgba(34,197,94,0.55)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              {text.signUp}
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} autoComplete="on">
          {mode === 'signup' && (
            <div
              style={{
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <div style={{ width: '100%', maxWidth: '280px' }}>
                <label
                  htmlFor="signup-name"
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'rgba(226, 232, 240, 0.92)',
                    marginBottom: '5px',
                    paddingInline: '2px'
                  }}
                >
                  {text.fullName}
                </label>
                <div
                  style={{
                    borderRadius: '12px',
                    padding: '6px 9px 7px',
                    background:
                      'radial-gradient(circle at top left, rgba(15,23,42,0.96), rgba(15,23,42,0.9))',
                    border: '1px solid rgba(148, 163, 184, 0.5)',
                    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.85)'
                  }}
                >
                  <input
                    id="signup-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                    style={{
                      width: '100%',
                      padding: '4px 0 3px',
                      borderRadius: '0',
                      border: 'none',
                      background: 'transparent',
                      color: 'white',
                      fontSize: '12px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          <div
            style={{
              marginBottom: '10px',
              display: 'flex',
              justifyContent: 'center'
            }}
          >
            <div style={{ width: '100%', maxWidth: '280px' }}>
              <label
                htmlFor="login-email"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(226, 232, 240, 0.92)',
                  marginBottom: '5px',
                  paddingInline: '2px'
                }}
              >
                {text.email}
              </label>
              <div
                style={{
                  borderRadius: '12px',
                  padding: '6px 9px 7px',
                  background:
                    'radial-gradient(circle at top left, rgba(15,23,42,0.96), rgba(15,23,42,0.9))',
                  border: '1px solid rgba(148, 163, 184, 0.5)',
                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.85)'
                }}
              >
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  style={{
                    width: '100%',
                    padding: '4px 0 3px',
                    borderRadius: '0',
                    border: 'none',
                    background: 'transparent',
                    color: 'white',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>
          <div
            style={{
              marginBottom: '10px',
              display: 'flex',
              justifyContent: 'center'
            }}
          >
            <div style={{ width: '100%', maxWidth: '280px' }}>
              <label
                htmlFor="login-password"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(226, 232, 240, 0.92)',
                  marginBottom: '5px',
                  paddingInline: '2px'
                }}
              >
                {text.password}
              </label>
              <div
                style={{
                  borderRadius: '12px',
                  padding: '6px 9px 7px',
                  background:
                    'radial-gradient(circle at top left, rgba(15,23,42,0.96), rgba(15,23,42,0.9))',
                  border: '1px solid rgba(148, 163, 184, 0.5)',
                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.85)'
                }}
              >
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{
                    width: '100%',
                    padding: '4px 0 3px',
                    borderRadius: '0',
                    border: 'none',
                    background: 'transparent',
                    color: 'white',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>
          {mode === 'signin' && (
            <div
              style={{
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <div className="login-options-row">
                <label className="login-keep-row" htmlFor="login-keep-signed">
                  <input
                    id="login-keep-signed"
                    type="checkbox"
                    name="login-keep-signed"
                    autoComplete="off"
                    checked={keepSignedIn}
                    onChange={e => {
                      const checked = e.target.checked
                      setKeepSignedIn(checked)
                      if (!checked) clearLoginCredentials()
                    }}
                  />
                  <span>{text.keepSignedIn}</span>
                </label>
                <div className="login-forgot-row">
                  <button
                    type="button"
                    className="login-forgot-link"
                    onClick={() => {
                      setError('')
                      setInfo(text.forgotUsernameHelp)
                    }}
                  >
                    {text.forgotUsername}
                  </button>
                  <span className="login-forgot-sep">{text.forgotOr}</span>
                  <button
                    type="button"
                    className="login-forgot-link"
                    onClick={() => {
                      setError('')
                      setInfo(text.forgotPasswordHelp)
                    }}
                  >
                    {text.forgotPassword}
                  </button>
                </div>
              </div>
            </div>
          )}
          {mode === 'signup' && (
            <div
              style={{
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <div style={{ width: '100%', maxWidth: '280px' }}>
                <label
                  htmlFor="signup-role"
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'rgba(226, 232, 240, 0.92)',
                    marginBottom: '5px',
                    paddingInline: '2px'
                  }}
                >
                  {text.role}
                </label>
                <div
                  style={{
                    borderRadius: '12px',
                    padding: '6px 9px 7px',
                    background:
                      'radial-gradient(circle at top left, rgba(15,23,42,0.96), rgba(15,23,42,0.9))',
                    border: '1px solid rgba(148, 163, 184, 0.5)',
                    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.85)'
                  }}
                >
                  <div
                    ref={roleDropdownRef}
                    style={{
                      position: 'relative'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setIsRoleOpen(open => !open)}
                      style={{
                        width: '100%',
                        padding: '4px 0 3px',
                        borderRadius: '0',
                        border: 'none',
                        background: 'transparent',
                        color: '#e5e7eb',
                        fontSize: '12px',
                        fontWeight: 500,
                        letterSpacing: '0.02em',
                        outline: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer'
                      }}
                    >
                      <span>{text.roles[role as keyof typeof text.roles] ?? role}</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '18px',
                          height: '18px',
                          borderRadius: '999px',
                          background: 'rgba(15,23,42,0.9)',
                          border: '1px solid rgba(148,163,184,0.5)',
                          color: '#9ca3af',
                          fontSize: '10px'
                        }}
                      >
                        <i className={isRoleOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'}></i>
                      </span>
                    </button>
                    {isRoleOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 6px)',
                          left: 0,
                          right: 0,
                          borderRadius: '12px',
                          background:
                            'radial-gradient(circle at top left, rgba(15,23,42,0.98), rgba(15,23,42,0.94))',
                          border: '1px solid rgba(148, 163, 184, 0.7)',
                          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.95)',
                          padding: '4px',
                          zIndex: 30
                        }}
                      >
                        {signupRoleCatalog.map(option => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setRole(option)
                              setIsRoleOpen(false)
                            }}
                            style={{
                              width: '100%',
                              border: 'none',
                              background:
                                role === option
                                  ? 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(16,185,129,0.18))'
                                  : 'transparent',
                              color: '#e5e7eb',
                              textAlign: 'left',
                              padding: '7px 8px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer'
                            }}
                          >
                            <span>{text.roles[option as keyof typeof text.roles] ?? option}</span>
                            {role === option && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '16px',
                                  height: '16px',
                                  borderRadius: '999px',
                                  background: 'rgba(34,197,94,0.18)',
                                  color: '#4ade80',
                                  fontSize: '10px'
                                }}
                              >
                                <i className="fa-solid fa-check"></i>
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {info && (
            <div
              style={{
                marginBottom: '10px',
                padding: '7px 9px',
                borderRadius: '6px',
                background: 'rgba(34, 197, 94, 0.08)',
                color: '#bbf7d0',
                fontSize: '12px',
                whiteSpace: 'pre-line'
              }}
            >
              {info}
            </div>
          )}
          {error && (
            <div
              style={{
                marginBottom: '10px',
                padding: '7px 9px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#fecaca',
                fontSize: '12px'
              }}
            >
              {error}
            </div>
          )}
          {awaitingVerification && (
            <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                disabled={isResendingVerification || isSubmitting}
                onClick={() => void handleResendVerification()}
                style={{
                  width: '100%',
                  maxWidth: '280px',
                  padding: '7px 12px',
                  borderRadius: '999px',
                  border: '1px solid rgba(34, 197, 94, 0.55)',
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: '#bbf7d0',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: isResendingVerification || isSubmitting ? 'default' : 'pointer',
                  opacity: isResendingVerification || isSubmitting ? 0.7 : 1,
                }}
              >
                {isResendingVerification ? text.resendingVerify : text.resendVerify}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                maxWidth: '220px',
                padding: '7px 12px',
                borderRadius: '999px',
                border: 'none',
                background: isSubmitting
                  ? 'linear-gradient(135deg, #16a34a, #22c55e)'
                  : 'linear-gradient(135deg, #22c55e, #16a34a)',
                boxShadow: '0 10px 22px rgba(34, 197, 94, 0.75)',
                color: 'white',
                fontWeight: 600,
                fontSize: '12px',
                cursor: isSubmitting ? 'default' : 'pointer',
                marginTop: '12px',
                letterSpacing: '0.03em'
              }}
            >
              {isSubmitting
                ? mode === 'signin'
                  ? text.signingIn
                  : text.creatingAccount
                : mode === 'signin'
                  ? text.signIn
                  : text.createAccount}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}
