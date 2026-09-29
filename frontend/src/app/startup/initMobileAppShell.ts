import { isPwaStandalone, isTouchDevice } from './pwaInstall'

/** Apply root classes and viewport height fix for phone / installed PWA shells. */
export function initMobileAppShell(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  const root = document.documentElement

  const syncShellClasses = () => {
    root.classList.toggle('agro-touch', isTouchDevice() || isPwaStandalone())
    root.classList.toggle('agro-standalone', isPwaStandalone())
  }

  const syncViewportHeight = () => {
    const vh = window.visualViewport?.height ?? window.innerHeight
    root.style.setProperty('--app-vh', `${Math.round(vh)}px`)
  }

  syncShellClasses()
  syncViewportHeight()

  window.addEventListener('resize', syncViewportHeight, { passive: true })
  window.visualViewport?.addEventListener('resize', syncViewportHeight, { passive: true })
  window.matchMedia('(display-mode: standalone)').addEventListener('change', syncShellClasses)
}
