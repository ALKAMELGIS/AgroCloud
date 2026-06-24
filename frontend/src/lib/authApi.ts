/**
 * Server-side auth API (register, login, verify, resend).
 */

export type AuthUserRecord = {
  id: number
  name: string
  email: string
  role: string
  status?: string
  scope?: string
  managedById?: number
  emailVerified?: boolean
  lastLogin?: string
}

export type AuthApiError = {
  ok: false
  error: string
  code?: string
}

export type RegisterResult = { ok: true; user: AuthUserRecord; message?: string } | AuthApiError

export type LoginResult = { ok: true; user: AuthUserRecord } | AuthApiError

export type VerifyEmailResult = { ok: true; user: AuthUserRecord; message?: string } | AuthApiError

export type ResendVerificationResult = { ok: true } | AuthApiError

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function isServerAuthAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/status', { method: 'GET' })
    if (!res.ok) return false
    const data = await parseJson<{ ok?: boolean; serverAuth?: boolean }>(res)
    return Boolean(data?.ok && data?.serverAuth)
  } catch {
    return false
  }
}

export async function registerAccount(payload: {
  email: string
  name: string
  password: string
  role: string
  inviteToken?: string
}): Promise<RegisterResult | null> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await parseJson<RegisterResult>(res)
    if (!data) return null
    if (!res.ok && data.ok === false) return data
    if (data.ok) return data
    return null
  } catch {
    return null
  }
}

export async function loginAccount(payload: {
  email: string
  password: string
}): Promise<LoginResult | null> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await parseJson<LoginResult>(res)
    if (!data) return null
    if (!res.ok && data.ok === false) return data
    if (data.ok) return data
    return null
  } catch {
    return null
  }
}

export async function verifyEmailToken(token: string): Promise<VerifyEmailResult | null> {
  try {
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await parseJson<VerifyEmailResult>(res)
    if (!data) return null
    if (!res.ok && data.ok === false) return data
    if (data.ok) return data
    return null
  } catch {
    return null
  }
}

export async function resendVerificationEmail(email: string): Promise<ResendVerificationResult | null> {
  try {
    const res = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await parseJson<ResendVerificationResult>(res)
    if (!data) return null
    if (!res.ok && data.ok === false) return data
    if (data.ok) return data
    return null
  } catch {
    return null
  }
}
