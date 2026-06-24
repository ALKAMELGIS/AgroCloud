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

deferAfterFirstPaint(() => {
  initClientErrorMonitoring()
}, 3000)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
