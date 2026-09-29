/**
 * Browser-only secret values for user-defined API token slots (System Settings → API Tokens → Add).
 * Slot metadata lives in system settings JSON; secrets stay in separate keys.
 */

const LS_PREFIX = 'agri_user_api_token_v1_'

function keyForSlot(slotId: string): string {
  return `${LS_PREFIX}${slotId}`
}

export function getUserApiTokenValue(slotId: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(keyForSlot(slotId))
    return typeof raw === 'string' ? raw : ''
  } catch {
    return ''
  }
}

export function persistUserApiTokenValue(slotId: string, value: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const v = value.trim()
  try {
    if (!v) window.localStorage.removeItem(keyForSlot(slotId))
    else window.localStorage.setItem(keyForSlot(slotId), v)
  } catch {
    console.warn('[customUserApiTokens] Could not persist value')
  }
}

export function clearUserApiTokenValue(slotId: string): void {
  persistUserApiTokenValue(slotId, '')
}
