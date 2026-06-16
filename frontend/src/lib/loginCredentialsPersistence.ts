/** Saved sign-in fields for this browser (when "Keep me signed in" is enabled). */

export const LOGIN_CREDENTIALS_STORAGE_KEY = 'agro_login_credentials_v1'

export type SavedLoginCredentials = {
  version: 1
  email: string
  password: string
  deviceName: string
  keepSignedIn: boolean
  savedAt: string
}

export function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown device'
  const ua = navigator.userAgent || ''
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform?.trim() ||
    navigator.platform?.trim() ||
    ''

  let os = platform || 'Device'
  if (/windows/i.test(ua) || /win32|win64/i.test(platform)) os = 'Windows'
  else if (/mac/i.test(ua) || /macOS/i.test(platform)) os = 'macOS'
  else if (/iphone|ipad|ipod/i.test(ua)) os = /ipad/i.test(ua) ? 'iPad' : 'iPhone'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/linux/i.test(ua)) os = 'Linux'

  let browser = 'Browser'
  if (/edg\//i.test(ua)) browser = 'Edge'
  else if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome'
  else if (/firefox/i.test(ua)) browser = 'Firefox'
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari'

  return `${os} · ${browser}`
}

export function loadLoginCredentials(): SavedLoginCredentials | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LOGIN_CREDENTIALS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedLoginCredentials>
    if (parsed?.version !== 1) return null
    const email = String(parsed.email ?? '').trim()
    if (!email) return null
    return {
      version: 1,
      email,
      password: typeof parsed.password === 'string' ? parsed.password : '',
      deviceName: String(parsed.deviceName ?? '').trim() || detectDeviceLabel(),
      keepSignedIn: parsed.keepSignedIn !== false,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function saveLoginCredentials(input: {
  email: string
  password: string
  deviceName: string
  keepSignedIn: boolean
}): void {
  if (typeof window === 'undefined') return
  try {
    const email = String(input.email ?? '').trim()
    if (!email) return
    if (!input.keepSignedIn) {
      localStorage.removeItem(LOGIN_CREDENTIALS_STORAGE_KEY)
      return
    }
    const payload: SavedLoginCredentials = {
      version: 1,
      email,
      password: String(input.password ?? ''),
      deviceName: String(input.deviceName ?? '').trim() || detectDeviceLabel(),
      keepSignedIn: true,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(LOGIN_CREDENTIALS_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function clearLoginCredentials(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(LOGIN_CREDENTIALS_STORAGE_KEY)
  } catch {
  }
}
