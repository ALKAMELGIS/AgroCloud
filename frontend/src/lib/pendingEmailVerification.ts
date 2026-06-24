import { normalizeEmail } from './auth'

const STORAGE_KEY = 'agroPendingEmailVerification'
const TTL_MS = 30 * 60 * 1000

export type PendingEmailVerification = {
  email: string
  password: string
  expiresAt: number
}

export function savePendingEmailVerification(email: string, password: string): void {
  try {
    const payload: PendingEmailVerification = {
      email: normalizeEmail(email),
      password: String(password),
      expiresAt: Date.now() + TTL_MS,
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

export function readPendingEmailVerification(): PendingEmailVerification | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingEmailVerification>
    const email = normalizeEmail(parsed.email)
    const password = typeof parsed.password === 'string' ? parsed.password : ''
    const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0
    if (!email || !password || !expiresAt || expiresAt < Date.now()) {
      clearPendingEmailVerification()
      return null
    }
    return { email, password, expiresAt }
  } catch {
    return null
  }
}

export function clearPendingEmailVerification(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
