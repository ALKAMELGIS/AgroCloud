import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles/fonts-local.css'
import './index.css'
import './styles/gisModalSystem.css'
import './geodash-tailwind.css'
import './styles/landing-shadcn-vars.css'
import './styles/design-tokens.css'
import './styles/home-hub.css'
import './styles/app-design-system.css'
import './styles/dark-mode-unified.css'
import './styles/si-scrollbar-system.css'
import './styles/responsive-shell.css'
import './styles/tablet-responsive.css'
import './styles/mobile-app.css'
import './styles/modal-responsive.css'
import './styles/agroCloudMapboxBranding.css'
import { initClientErrorMonitoring } from './lib/clientErrorMonitoring'
import { deferAfterFirstPaint } from './lib/deferAfterFirstPaint'
import { initMobileAppShell } from './lib/initMobileAppShell'
import { isTouchDevice } from './lib/pwaInstall'
import { bootstrapMapboxAccessTokenPersistence } from './lib/mapboxAccessToken'
import { restoreBrowserApiSecretsFromVaultIntoLocalStorage } from './lib/browserApiSecretsVault'
import { ensureBrowserApiSecretsHydrated } from './lib/apiSecretsServerPersistence'
import { installApiFetchGuard } from './lib/apiFetchGuard'
import { reloadWithCacheBust } from './lib/lazyWithRetry'

// Install the global `/api/*` circuit-breaker before anything else can fire a request. On a static
// deployment without a co-located backend this short-circuits doomed internal API calls to a
// synthetic 503 instead of flooding the console with 404/405 errors.
installApiFetchGuard()

/**
 * Upgrade plain HTTP to HTTPS on the public site. Web Crypto (`crypto.subtle`) is only available
 * in secure contexts, so logging in over http://www.eliteagrocloud.com would otherwise fail (and
 * passwords would travel in cleartext). Dev hosts (localhost / LAN IPs) are intentionally skipped.
 */
if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
  const host = window.location.hostname
  const isLocalHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  if (!isLocalHost) {
    window.location.replace(window.location.href.replace(/^http:/, 'https:'))
  }
}

const safeSessionGetItem = (key: string) => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

const safeSessionSetItem = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value)
  } catch {
  }
}

const safeSessionRemoveItem = (key: string) => {
  try {
    sessionStorage.removeItem(key)
  } catch {
  }
}

/**
 * Vite fires `vite:preloadError` when a code-split chunk preload fails — almost always because a
 * new deploy changed chunk hashes and this tab still holds a stale index.html. Reload once (guarded)
 * to fetch the fresh shell + current chunk names instead of leaving the user on a dead page.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    const guardKey = 'agro_preload_error_reload'
    if (safeSessionGetItem(guardKey)) return
    safeSessionSetItem(guardKey, '1')
    // Cache-busting reload: the stale index.html is CDN-cached (max-age=600), so a plain reload
    // would re-fetch the same document pointing at deleted chunk hashes.
    reloadWithCacheBust()
  })
  window.addEventListener('load', () => {
    safeSessionRemoveItem('agro_preload_error_reload')
  })
}

const pwaEnabled = import.meta.env.VITE_ENABLE_PWA === 'true'

const registerServiceWorker = () => {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegisterError(error) {
        console.warn('[PWA] Service worker registration failed:', error)
      },
    })
  })
}

if (pwaEnabled) {
  if (isTouchDevice()) {
    deferAfterFirstPaint(registerServiceWorker, 4000)
  } else {
    registerServiceWorker()
  }
} else if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const resetKey = 'sw_reset_v2'
  const canReload = typeof window !== 'undefined' && typeof sessionStorage !== 'undefined' && !safeSessionGetItem(resetKey)
  const hadController = Boolean(navigator.serviceWorker.controller)

  const unregisterPromise =
    typeof navigator.serviceWorker.getRegistrations === 'function'
      ? navigator.serviceWorker
          .getRegistrations()
          .then((regs) => {
            const hasAny = regs.length > 0
            return Promise.all(regs.map((r) => r.unregister())).then(() => hasAny)
          })
          .catch(() => false)
      : Promise.resolve(false)

  const clearCachePromise =
    typeof window !== 'undefined' && 'caches' in window
      ? caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .then(() => true)
          .catch(() => false)
      : Promise.resolve(false)

  Promise.all([unregisterPromise, clearCachePromise]).then(([hadRegs]) => {
    if (canReload && (hadRegs || hadController)) {
      safeSessionSetItem(resetKey, '1')
      const hash = typeof window.location.hash === 'string' ? window.location.hash : ''
      const onLoginRoute = /^#\/login(\?|$|\/)/i.test(hash)
      if (!onLoginRoute) {
        window.location.reload()
      }
      return
    }
    if (typeof sessionStorage !== 'undefined') safeSessionRemoveItem(resetKey)
  })
}

initMobileAppShell()
restoreBrowserApiSecretsFromVaultIntoLocalStorage()
bootstrapMapboxAccessTokenPersistence()

// Hydrate server-stored API tokens (Mapbox + Sentinel Hub WMS instance/access token) as early as
// possible — before the first map mounts — so a configured backend (VITE_AGRI_API_SECRETS_URL)
// supplies the real credentials on EVERY device / shared link, not just the browser where they were
// saved. Fire-and-forget: when no backend is reachable this resolves to false and the app proceeds
// with build-time env / public fallbacks. Map layers also re-render on the change events it emits.
void ensureBrowserApiSecretsHydrated()

deferAfterFirstPaint(() => {
  initClientErrorMonitoring()
}, 3000)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
