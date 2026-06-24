/**
 * Server-side registration, email verification, and login against the admin directory store.
 * Passwords: scrypt (new) with SHA-256 hex legacy verification + migration on login.
 */
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto'
import { readAdminDirectoryStore, writeAdminDirectoryStore } from './adminDirectoryPersistence.js'

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64
const MIN_PASSWORD_LEN = 8

const MANDATORY_SEED = {
  email: 'alkamelgis@gmail.com',
  name: 'Alkamel GIS',
  role: 'Admin',
  passwordHash: 'b03ddf3ca2e714a6548e7495e2a03f5e824eaac9837cd7f159c67b90fb4b7342',
}

const DEFAULT_ADMIN_NOTIFY_EMAIL = 'admin@eliteagrocloud.com'
const VERIFY_EMAIL_USER_MESSAGE = 'Please check your email to verify your account.'
const PENDING_ADMIN_APPROVAL_MESSAGE =
  'Your email is verified. Your account is pending approval from the administrator. You will be able to sign in once approved.'
const REGISTRATION_SUCCESS_MESSAGE = 'Account created successfully. You can sign in now.'

const STATUS_PENDING_VERIFICATION = 'Pending Verification'
const STATUS_PENDING_APPROVAL = 'Pending Approval'
const STATUS_ACTIVE = 'Active'

function isEmailVerificationRequired() {
  return String(process.env.AUTH_REQUIRE_EMAIL_VERIFICATION || '').trim().toLowerCase() === 'true'
}

function isAdminApprovalRequired() {
  const raw = String(process.env.AUTH_REQUIRE_ADMIN_APPROVAL || '').trim().toLowerCase()
  if (raw === 'false') return false
  if (raw === 'true') return true
  return isEmailVerificationRequired()
}

function normalizeAccountStatus(value) {
  return String(value || '').trim().toLowerCase()
}

function isPendingApprovalStatus(user) {
  return normalizeAccountStatus(user?.status) === STATUS_PENDING_APPROVAL.toLowerCase()
}

const DEFAULT_SELF_SIGNUP_ROLES = ['Viewer', 'Editor', 'Manager', 'Admin Manager', 'Admin']

function normalizeEmail(value) {
  let v = String(value ?? '')
  try {
    v = v.normalize('NFKC')
  } catch {
    // ignore
  }
  return v.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase()
}

function normalizeRole(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return 'Viewer'
  if (raw === 'admin') return 'Admin'
  if (raw === 'manager') return 'Manager'
  if (raw === 'admin manager' || raw === 'admin_manager' || raw === 'admin-manager') return 'Admin Manager'
  if (raw === 'editor') return 'Editor'
  if (raw === 'viewer') return 'Viewer'
  if (raw.includes('admin') && raw.includes('manager')) return 'Admin Manager'
  return 'Viewer'
}

function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
}

function hashPasswordScrypt(password) {
  const salt = randomBytes(16)
  const derived = scryptSync(String(password), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`
}

function sha256Hex(password) {
  return createHash('sha256').update(String(password), 'utf8').digest('hex')
}

function verifyPassword(password, storedHash) {
  const hash = String(storedHash || '').trim()
  if (!hash) return { ok: false, migratedHash: null }

  if (hash.startsWith('scrypt$')) {
    const parts = hash.split('$')
    if (parts.length !== 6) return { ok: false, migratedHash: null }
    const N = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    const salt = Buffer.from(parts[4], 'base64url')
    const expected = Buffer.from(parts[5], 'base64url')
    const derived = scryptSync(String(password), salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 })
    if (derived.length !== expected.length) return { ok: false, migratedHash: null }
    return { ok: timingSafeEqual(derived, expected), migratedHash: null }
  }

  if (isSha256Hex(hash)) {
    const candidate = sha256Hex(password)
    const ok = timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(hash.toLowerCase(), 'utf8'))
    return { ok, migratedHash: ok ? hashPasswordScrypt(password) : null }
  }

  return { ok: false, migratedHash: null }
}

function sanitizeUserForClient(user) {
  if (!user || typeof user !== 'object') return null
  const { passwordHash, verificationToken, verificationExpiresAt, ...rest } = user
  return rest
}

function readUsers(filePath) {
  const { data } = readAdminDirectoryStore(filePath)
  const users = Array.isArray(data.users) ? [...data.users] : []
  const auditLog = Array.isArray(data.auditLog) ? data.auditLog : []
  return { users: ensureMandatorySeed(users), auditLog, full: data }
}

function writeUsers(filePath, users, auditLog) {
  const { data } = readAdminDirectoryStore(filePath)
  writeAdminDirectoryStore(filePath, {
    ...data,
    users,
    auditLog: Array.isArray(auditLog) ? auditLog : data.auditLog || [],
  })
}

function ensureMandatorySeed(users) {
  const list = Array.isArray(users) ? [...users] : []
  const key = normalizeEmail(MANDATORY_SEED.email)
  const idx = list.findIndex((u) => normalizeEmail(u?.email) === key)
  if (idx === -1) {
    list.push({
      id: Date.now(),
      name: MANDATORY_SEED.name,
      email: MANDATORY_SEED.email,
      role: MANDATORY_SEED.role,
      status: 'Active',
      lastLogin: 'Never',
      emailVerified: true,
      passwordHash: MANDATORY_SEED.passwordHash,
    })
    return list
  }
  const existing = list[idx]
  list[idx] = {
    ...existing,
    name: String(existing?.name || MANDATORY_SEED.name),
    email: MANDATORY_SEED.email,
    role: normalizeRole(existing?.role || MANDATORY_SEED.role),
    status: 'Active',
    emailVerified: true,
    passwordHash:
      typeof existing?.passwordHash === 'string' && existing.passwordHash.trim()
        ? existing.passwordHash
        : MANDATORY_SEED.passwordHash,
  }
  return list
}

function findUserByEmail(users, email) {
  const key = normalizeEmail(email)
  return users.filter((u) => normalizeEmail(u?.email) === key)
}

function findUserByVerificationToken(users, token) {
  const t = String(token || '').trim()
  if (!t) return null
  return users.find((u) => String(u?.verificationToken || '') === t) || null
}

function isVerificationExpired(user) {
  const exp = user?.verificationExpiresAt
  if (!exp) return false
  const ms = Date.parse(String(exp))
  if (!Number.isFinite(ms)) return false
  return ms < Date.now()
}

function buildVerificationLink(baseUrl, token) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '') || 'http://localhost:3011'
  return `${base}/#/login?verify=${encodeURIComponent(token)}`
}

function appendAudit(auditLog, entry) {
  const next = Array.isArray(auditLog) ? [...auditLog] : []
  next.unshift({
    id: randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  })
  return next.slice(0, 8000)
}

function parseSelfSignupRoles(raw) {
  const fromEnv = String(raw || '')
    .split(',')
    .map((s) => normalizeRole(s.trim()))
    .filter(Boolean)
  const unique = [...new Set(fromEnv.length ? fromEnv : DEFAULT_SELF_SIGNUP_ROLES)]
  return unique
}

function selfSignupRolesAllowed(role, allowedRoles) {
  return allowedRoles.includes(normalizeRole(role))
}

function userHasActivePassword(user) {
  return typeof user?.passwordHash === 'string' && user.passwordHash.trim().length > 0
}

async function deliverVerificationEmail({ sendMail, hasSmtpConfig, appName, email, verificationLink }) {
  if (!hasSmtpConfig()) {
    throw new Error('smtp_not_configured')
  }
  const safeName = appName || 'Agro Cloud'
  const subject = `${safeName} - Confirm your email`
  const text = [
    `Welcome to ${safeName}.`,
    '',
    'Please confirm your email by opening this link:',
    verificationLink,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">${safeName}</h2>
      <p style="margin:0 0 12px">Please confirm your email to complete account registration.</p>
      <p style="margin:0 0 16px">
        <a href="${verificationLink}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;text-decoration:none;border-radius:999px">Confirm Email</a>
      </p>
      <p style="margin:0;font-size:12px;color:#64748b">If you did not request this, ignore this email.</p>
    </div>
  `
  await sendMail({ to: email, subject, text, html })
}

async function deliverAdminRegistrationNotification({
  sendMail,
  hasSmtpConfig,
  appName,
  adminEmail,
  user,
  canonicalBaseUrl,
  phase = 'registered',
}) {
  if (!hasSmtpConfig()) return
  const safeName = appName || 'Agro Cloud'
  const adminPanelLink = `${String(canonicalBaseUrl || '').trim().replace(/\/+$/, '')}/#/admin/users`
  const awaitingApproval = phase === 'verified'
  const subject = awaitingApproval
    ? `${safeName} - User verified email — approval required`
    : `${safeName} - New user registration`
  const intro = awaitingApproval
    ? 'A user verified their email and is waiting for your approval before they can sign in.'
    : 'A new user registered. They must verify their email before you can approve the account.'
  const text = [
    intro,
    '',
    `Name: ${user.name}`,
    `Email: ${user.email}`,
    `Role: ${user.role}`,
    `Status: ${user.status}`,
    `Updated at: ${new Date().toISOString()}`,
    '',
    `Approve in User Management: ${adminPanelLink}`,
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">${safeName} — ${awaitingApproval ? 'Approval required' : 'New registration'}</h2>
      <p style="margin:0 0 12px">${intro}</p>
      <ul style="margin:0 0 16px;padding-left:20px">
        <li><strong>Name:</strong> ${user.name}</li>
        <li><strong>Email:</strong> ${user.email}</li>
        <li><strong>Role:</strong> ${user.role}</li>
        <li><strong>Status:</strong> ${user.status}</li>
      </ul>
      <p style="margin:0">
        <a href="${adminPanelLink}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:999px">Open User Management</a>
      </p>
    </div>
  `
  await sendMail({ to: adminEmail, subject, text, html })
}

/**
 * @param {import('express').Express} app
 * @param {{
 *   adminDirectoryFile: string,
 *   sendMail: (opts: { to: string, subject: string, text: string, html: string }) => Promise<void>,
 *   hasSmtpConfig: () => boolean,
 *   addAuthEvent: (action: string, payload?: Record<string, unknown>) => void,
 *   appName?: string,
 *   canonicalBaseUrl?: string,
 *   selfSignupRoles?: string,
 * }} opts
 */
export function registerAuthRoutes(app, opts) {
  const filePath = opts.adminDirectoryFile
  const sendMail = opts.sendMail
  const hasSmtpConfig = opts.hasSmtpConfig
  const addAuthEvent = opts.addAuthEvent
  const appName = String(opts.appName || 'Agro Cloud').trim()
  const canonicalBaseUrl =
    String(opts.canonicalBaseUrl || process.env.VITE_APP_CANONICAL_URL || process.env.APP_ORIGIN || '').trim() ||
    'https://elite.geosyntra.org'
  const allowedSignupRoles = parseSelfSignupRoles(opts.selfSignupRoles || process.env.AUTH_SELF_SIGNUP_ROLES)
  const adminNotifyEmail = normalizeEmail(
    opts.adminNotifyEmail || process.env.AUTH_ADMIN_NOTIFY_EMAIL || DEFAULT_ADMIN_NOTIFY_EMAIL,
  )

  app.get('/api/auth/status', (_req, res) => {
    res.json({ ok: true, serverAuth: true, smtp: hasSmtpConfig() })
  })

  app.post('/api/auth/register', async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const name = String(req.body?.name || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
    const password = String(req.body?.password || '')
    const role = normalizeRole(req.body?.role)
    const inviteToken = String(req.body?.inviteToken || '').trim()

    if (!email || !name || !password) {
      addAuthEvent('register_failed', { email: email || undefined, reason: 'missing_fields' })
      return res.status(400).json({ ok: false, error: 'email, name, and password are required.' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addAuthEvent('register_failed', { email, reason: 'invalid_email' })
      return res.status(400).json({ ok: false, error: 'Email format is invalid.' })
    }
    if (password.length < MIN_PASSWORD_LEN) {
      addAuthEvent('register_failed', { email, reason: 'password_too_short' })
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters.' })
    }
    if (!selfSignupRolesAllowed(role, allowedSignupRoles)) {
      addAuthEvent('register_failed', { email, reason: 'role_not_allowed' })
      return res.status(400).json({ ok: false, error: 'Selected role is not available for self-service registration.', code: 'role_not_allowed' })
    }

    const requireEmailVerification = isEmailVerificationRequired()
    if (requireEmailVerification && !hasSmtpConfig()) {
      addAuthEvent('register_failed', { email, reason: 'smtp_not_configured' })
      return res.status(503).json({
        ok: false,
        error: 'Email delivery is not configured. Contact your administrator.',
        code: 'email_delivery_failed',
      })
    }

    const { users, auditLog } = readUsers(filePath)
    const matches = findUserByEmail(users, email)

    if (normalizeEmail(MANDATORY_SEED.email) === email) {
      addAuthEvent('register_failed', { email, reason: 'reserved_account' })
      return res.status(409).json({ ok: false, error: 'An account with this email already exists.', code: 'email_exists' })
    }

    const anyHasPassword = matches.some((m) => userHasActivePassword(m))
    if (matches.length && anyHasPassword) {
      addAuthEvent('register_failed', { email, reason: 'email_exists' })
      return res.status(409).json({ ok: false, error: 'An account with this email already exists.', code: 'email_exists' })
    }
    if (matches.length && !inviteToken) {
      addAuthEvent('register_failed', { email, reason: 'missing_invite_token' })
      return res.status(400).json({
        ok: false,
        error: 'This email already has a pending invitation. Please use your invitation link to complete signup.',
        code: 'missing_invite_token',
      })
    }
    if (matches.length && !matches.some((m) => String(m.verificationToken || '') === inviteToken)) {
      addAuthEvent('register_failed', { email, reason: 'invalid_invite_token' })
      return res.status(400).json({ ok: false, error: 'Invitation link is invalid or expired.', code: 'invalid_invite_token' })
    }

    const verificationToken = requireEmailVerification ? randomUUID() : undefined
    const verificationExpiresAt = requireEmailVerification
      ? new Date(Date.now() + VERIFICATION_TTL_MS).toISOString()
      : undefined
    const passwordHash = hashPasswordScrypt(password)
    const base = matches[0] || null
    const newUser = {
      ...(base || {}),
      id: typeof base?.id === 'number' ? base.id : Date.now(),
      name,
      email,
      role: normalizeRole(base?.role || role),
      status: requireEmailVerification ? STATUS_PENDING_VERIFICATION : STATUS_ACTIVE,
      lastLogin: base?.lastLogin || 'Never',
      passwordHash,
      emailVerified: !requireEmailVerification,
      ...(requireEmailVerification ? { verificationToken, verificationExpiresAt } : {}),
    }

    const withoutDupes = users.filter((u) => normalizeEmail(u?.email) !== email)
    withoutDupes.push(newUser)
    const nextAudit = appendAudit(auditLog, {
      entity: 'auth',
      action: 'register',
      entityId: email,
      actorEmail: email,
      meta: { role: newUser.role, status: newUser.status, emailVerification: requireEmailVerification },
    })
    writeUsers(filePath, withoutDupes, nextAudit)

    if (requireEmailVerification) {
      const verificationLink = buildVerificationLink(canonicalBaseUrl, verificationToken)
      try {
        await deliverVerificationEmail({
          sendMail,
          hasSmtpConfig,
          appName,
          email,
          verificationLink,
        })
        addAuthEvent('verification_email_sent', { email })
      } catch (error) {
        const message = error && typeof error === 'object' && typeof error.message === 'string' ? error.message : 'send_failed'
        addAuthEvent('verification_email_failed', { email, reason: message })
        writeUsers(filePath, users, auditLog)
        return res.status(503).json({
          ok: false,
          error: 'Could not send verification email. Check SMTP settings or use Resend on the login page.',
          code: 'email_delivery_failed',
        })
      }
    }

    if (hasSmtpConfig()) {
      try {
        await deliverAdminRegistrationNotification({
          sendMail,
          hasSmtpConfig,
          appName,
          adminEmail: adminNotifyEmail,
          user: newUser,
          canonicalBaseUrl,
        })
        addAuthEvent('admin_registration_notify_sent', { email, adminEmail: adminNotifyEmail })
      } catch (error) {
        const message = error && typeof error === 'object' && typeof error.message === 'string' ? error.message : 'send_failed'
        addAuthEvent('admin_registration_notify_failed', { email, adminEmail: adminNotifyEmail, reason: message })
      }
    }

    addAuthEvent('register_success', { email })
    return res.status(201).json({
      ok: true,
      user: sanitizeUserForClient(newUser),
      message: requireEmailVerification ? VERIFY_EMAIL_USER_MESSAGE : REGISTRATION_SUCCESS_MESSAGE,
    })
  })

  app.post('/api/auth/login', async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || '')

    if (!email || !password) {
      addAuthEvent('login_failed', { email: email || undefined, reason: 'missing_fields' })
      return res.status(400).json({ ok: false, error: 'email and password are required.' })
    }
    if (password.length < MIN_PASSWORD_LEN) {
      addAuthEvent('login_failed', { email, reason: 'password_too_short' })
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters.' })
    }

    const { users, auditLog } = readUsers(filePath)
    const matches = findUserByEmail(users, email)
    if (!matches.length) {
      addAuthEvent('login_failed', { email, reason: 'email_not_found' })
      return res.status(401).json({ ok: false, error: 'Invalid email or password.', code: 'invalid_credentials' })
    }

    let matched = null
    let migratedHash = null
    for (const candidate of matches) {
      const result = verifyPassword(password, candidate?.passwordHash)
      if (result.ok) {
        matched = candidate
        migratedHash = result.migratedHash
        break
      }
    }

    if (!matched) {
      if (matches.some((m) => String(m.status || '').toLowerCase() === 'invited')) {
        addAuthEvent('login_failed', { email, reason: 'invited_account_not_activated' })
        return res.status(403).json({
          ok: false,
          error: 'Account is invited but not activated. Ask your administrator to send a new invitation link.',
          code: 'invited',
        })
      }
      addAuthEvent('login_failed', { email, reason: 'password_mismatch' })
      return res.status(401).json({ ok: false, error: 'Invalid email or password.', code: 'invalid_credentials' })
    }

    if (!matched.emailVerified) {
      if (!isEmailVerificationRequired()) {
        matched = {
          ...matched,
          emailVerified: true,
          status: STATUS_ACTIVE,
          verificationToken: undefined,
          verificationExpiresAt: undefined,
        }
      } else {
        addAuthEvent('login_failed', { email, reason: 'email_not_verified' })
        return res.status(403).json({
          ok: false,
          error: VERIFY_EMAIL_USER_MESSAGE,
          code: 'email_not_verified',
        })
      }
    }

    if (isPendingApprovalStatus(matched)) {
      addAuthEvent('login_failed', { email, reason: 'pending_admin_approval' })
      return res.status(403).json({
        ok: false,
        error: PENDING_ADMIN_APPROVAL_MESSAGE,
        code: 'pending_admin_approval',
      })
    }

    if (normalizeAccountStatus(matched.status) !== STATUS_ACTIVE.toLowerCase()) {
      addAuthEvent('login_failed', { email, reason: 'account_not_active' })
      return res.status(403).json({
        ok: false,
        error: 'Account is not active. Please contact User Management.',
        code: 'account_not_active',
      })
    }

    const updatedUser = {
      ...matched,
      lastLogin: new Date().toLocaleString(),
      ...(migratedHash ? { passwordHash: migratedHash } : {}),
    }
    const nextUsers = users.map((u) => (normalizeEmail(u?.email) === email ? updatedUser : u))
    const nextAudit = appendAudit(auditLog, {
      entity: 'auth',
      action: 'login_success',
      entityId: email,
      actorEmail: email,
    })
    writeUsers(filePath, nextUsers, nextAudit)
    addAuthEvent('login_success', { email })

    return res.json({ ok: true, user: sanitizeUserForClient(updatedUser) })
  })

  app.post('/api/auth/verify-email', async (req, res) => {
    const token = String(req.body?.token || req.query?.token || '').trim()
    if (!token) {
      addAuthEvent('verify_email_failed', { reason: 'missing_token' })
      return res.status(400).json({ ok: false, error: 'Verification token is required.' })
    }

    const { users, auditLog } = readUsers(filePath)
    const user = findUserByVerificationToken(users, token)
    if (!user) {
      addAuthEvent('verify_email_failed', { reason: 'invalid_token' })
      return res.status(404).json({ ok: false, error: VERIFY_EMAIL_USER_MESSAGE, code: 'verify_failed' })
    }
    if (isVerificationExpired(user)) {
      addAuthEvent('verify_email_failed', { email: user.email, reason: 'expired_token' })
      return res.status(410).json({ ok: false, error: VERIFY_EMAIL_USER_MESSAGE, code: 'verify_expired' })
    }

    const email = normalizeEmail(user.email)
    const needsAdminApproval = isAdminApprovalRequired()
    const updatedUser = {
      ...user,
      emailVerified: true,
      status: needsAdminApproval ? STATUS_PENDING_APPROVAL : STATUS_ACTIVE,
      verificationToken: undefined,
      verificationExpiresAt: undefined,
    }
    const nextUsers = users.map((u) => (normalizeEmail(u?.email) === email ? updatedUser : u))
    const nextAudit = appendAudit(auditLog, {
      entity: 'auth',
      action: 'verify_email',
      entityId: email,
      actorEmail: email,
      meta: { pendingAdminApproval: needsAdminApproval },
    })
    writeUsers(filePath, nextUsers, nextAudit)
    addAuthEvent('verify_email_success', { email, pendingAdminApproval: needsAdminApproval })

    if (needsAdminApproval && hasSmtpConfig()) {
      try {
        await deliverAdminRegistrationNotification({
          sendMail,
          hasSmtpConfig,
          appName,
          adminEmail: adminNotifyEmail,
          user: updatedUser,
          canonicalBaseUrl,
          phase: 'verified',
        })
        addAuthEvent('admin_approval_notify_sent', { email, adminEmail: adminNotifyEmail })
      } catch (error) {
        const message = error && typeof error === 'object' && typeof error.message === 'string' ? error.message : 'send_failed'
        addAuthEvent('admin_approval_notify_failed', { email, adminEmail: adminNotifyEmail, reason: message })
      }
    }

    return res.json({
      ok: true,
      user: sanitizeUserForClient(updatedUser),
      message: needsAdminApproval ? PENDING_ADMIN_APPROVAL_MESSAGE : VERIFY_EMAIL_USER_MESSAGE,
    })
  })

  app.post('/api/auth/resend-verification', async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    if (!email) {
      addAuthEvent('resend_verification_failed', { reason: 'missing_email' })
      return res.status(400).json({ ok: false, error: 'email is required.' })
    }

    const { users, auditLog } = readUsers(filePath)
    const matches = findUserByEmail(users, email)
    if (!matches.length) {
      addAuthEvent('resend_verification_failed', { email, reason: 'email_not_found' })
      return res.status(404).json({ ok: false, error: VERIFY_EMAIL_USER_MESSAGE, code: 'email_not_found' })
    }

    const user = matches.find((m) => userHasActivePassword(m)) || matches[0]
    const statusLower = normalizeAccountStatus(user.status)
    if (user.emailVerified && statusLower === STATUS_ACTIVE.toLowerCase()) {
      addAuthEvent('resend_verification_failed', { email, reason: 'already_verified' })
      return res.status(400).json({ ok: false, error: VERIFY_EMAIL_USER_MESSAGE, code: 'already_verified' })
    }
    if (user.emailVerified && statusLower === STATUS_PENDING_APPROVAL.toLowerCase()) {
      addAuthEvent('resend_verification_failed', { email, reason: 'pending_admin_approval' })
      return res.status(400).json({
        ok: false,
        error: PENDING_ADMIN_APPROVAL_MESSAGE,
        code: 'pending_admin_approval',
      })
    }

    if (!hasSmtpConfig()) {
      addAuthEvent('resend_verification_failed', { email, reason: 'smtp_not_configured' })
      return res.status(503).json({
        ok: false,
        error: VERIFY_EMAIL_USER_MESSAGE,
        code: 'email_delivery_failed',
      })
    }

    const verificationToken = randomUUID()
    const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString()
    const updatedUser = {
      ...user,
      status: STATUS_PENDING_VERIFICATION,
      emailVerified: false,
      verificationToken,
      verificationExpiresAt,
    }
    const nextUsers = users.map((u) => (normalizeEmail(u?.email) === email ? updatedUser : u))
    writeUsers(filePath, nextUsers, auditLog)

    const verificationLink = buildVerificationLink(canonicalBaseUrl, verificationToken)
    try {
      await deliverVerificationEmail({
        sendMail,
        hasSmtpConfig,
        appName,
        email,
        verificationLink,
      })
      addAuthEvent('verification_email_sent', { email })
    } catch (error) {
      const message = error && typeof error === 'object' && typeof error.message === 'string' ? error.message : 'send_failed'
      addAuthEvent('verification_email_failed', { email, reason: message })
      return res.status(503).json({
        ok: false,
        error: VERIFY_EMAIL_USER_MESSAGE,
        code: 'email_delivery_failed',
      })
    }

    const nextAudit = appendAudit(auditLog, {
      entity: 'auth',
      action: 'resend_verification',
      entityId: email,
      actorEmail: email,
    })
    writeUsers(filePath, nextUsers, nextAudit)
    addAuthEvent('resend_verification_success', { email })

    return res.json({ ok: true })
  })
}

export const authServiceInternals = {
  normalizeEmail,
  hashPasswordScrypt,
  verifyPassword,
  isSha256Hex,
  sha256Hex,
}
