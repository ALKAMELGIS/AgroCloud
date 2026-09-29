const DISMISS_KEY = 'agro_pwa_install_dismissed_v1'
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000

export const PWA_INSTALL_OPEN_EVENT = 'agro:open-pwa-install'

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

/** iPadOS 13+ often reports MacIntel + touch; classic iPad still has "iPad" in UA. */
export function isIpadosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPad/i.test(navigator.userAgent)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Any Apple mobile/tablet OS — incl. iPad desktop UA. */
export function isIosInstallContext(): boolean {
  if (typeof navigator === 'undefined') return false
  return isIpadosDevice() || /iPhone|iPod/i.test(navigator.userAgent)
}

/** @deprecated Use {@link isIosInstallContext} */
export function isIosSafariInstallContext(): boolean {
  return isIosInstallContext()
}

/** Add to Home Screen on iOS/iPadOS is Safari-only (not Chrome/Firefox/Edge wrappers). */
export function isSafariOnAppleMobile(): boolean {
  if (!isIosInstallContext()) return false
  const ua = navigator.userAgent
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\//i.test(ua)) return false
  return /Safari/i.test(ua) || (!/Chrome|Chromium/i.test(ua) && isIpadosDevice())
}

export function isInstallEligible(): boolean {
  if (typeof window === 'undefined') return false
  if (isPwaStandalone()) return false
  if (isIosInstallContext()) return true
  if (isAndroidInstallContext()) return true
  return isMobileInstallContext()
}

/** Coarse pointer + narrow viewport, or common mobile UA — desktop unchanged. */
export function isMobileInstallContext(): boolean {
  if (typeof window === 'undefined') return false
  if (isPwaStandalone()) return false
  if (isIosInstallContext() || isAndroidInstallContext()) return true
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.matchMedia('(max-width: 1024px)').matches
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  )
  return (coarse && narrow) || mobileUa
}

/** Android phones/tablets — Chrome may fire beforeinstallprompt; others use the browser menu. */
export function isAndroidInstallContext(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/** Phone / tablet touch devices (incl. iPad) — for boot performance tuning. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  if (isIpadosDevice()) return true
  if (window.matchMedia('(pointer: coarse)').matches) return true
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export function isInstallPromptDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_MS
  } catch {
    return false
  }
}

export function dismissInstallPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

export function clearInstallPromptDismiss(): void {
  try {
    localStorage.removeItem(DISMISS_KEY)
  } catch {
    // ignore
  }
}

export function openPwaInstallPrompt(): void {
  if (typeof window === 'undefined') return
  clearInstallPromptDismiss()
  window.dispatchEvent(new CustomEvent(PWA_INSTALL_OPEN_EVENT))
}

export function resolvePwaInstallMode(): 'native' | 'ios' | 'ios-ipad' | 'ios-safari' | 'android' {
  if (isAndroidInstallContext()) return 'android'
  if (!isIosInstallContext()) return 'native'
  if (!isSafariOnAppleMobile()) return 'ios-safari'
  return isIpadosDevice() ? 'ios-ipad' : 'ios'
}
