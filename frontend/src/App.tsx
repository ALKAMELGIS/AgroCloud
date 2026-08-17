import { Component, Suspense, useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, useLocation } from 'react-router-dom'
import { AppDialogProvider } from './components/AppDialogProvider'
import HeaderBar from './components/HeaderBar'
import NavMenu from './components/NavMenu'
import AppRoutes from './routes/AppRoutes'
import PersistentAgroCloudEmbed from './components/PersistentAgroCloudEmbed'
import PwaInstallPrompt from './components/PwaInstallPrompt'
import PwaInstallFab from './components/PwaInstallFab'
import {
  clearChunkReloadGuards,
  clearStaleChunkRecoveryState,
  isDynamicImportError,
  lazyWithRetry,
  purgeAndReloadForStaleDeploy,
} from './lib/lazyWithRetry'
const SplashScreen = lazyWithRetry(() => import('./components/SplashScreen'), 'SplashScreen')
import { AuthProvider, useAuth } from './state/auth'
import { LanguageProvider } from './lib/i18n'
import { SystemSettingsProvider } from './store/SystemSettingsContext'

type AppErrorState = {
  error: unknown
  kind: 'render' | 'window'
  details?: string
} | null

class AppErrorBoundary extends Component<{ children: ReactNode }, { err: AppErrorState }> {
  state: { err: AppErrorState } = { err: null }
  private onUnhandledRejection?: (e: PromiseRejectionEvent) => void
  private onErrorEvent?: (e: ErrorEvent) => void

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '')
    const stack = error instanceof Error ? error.stack : undefined
    if (AppErrorBoundary.isBenignRuntimeError(message, stack)) return null
    return { err: { error, kind: 'render' as const } }
  }

  /** Benign browser noise — must not surface the full-page error screen. */
  private static isBenignRuntimeError(message: string, stack?: string): boolean {
    if (!message) return false
    if (message.includes('Style is not done loading')) return true
    if (message.includes('ResizeObserver loop')) return true
    // Mapbox GL terrain DEM race: `_updateTerrain` reads map state before DEM is ready.
    // Already absorbed in SatelliteIntelligence map onError; also ignore window.error bubble.
    if (message.includes("reading 'get'")) {
      const stackText = stack || ''
      if (
        stackText.includes('updateTerrain') ||
        stackText.includes('_updateTerrain') ||
        stackText.includes('mapbox-gl') ||
        stackText.includes('@mapbox') ||
        /Cannot read properties of undefined \(reading 'get'\)/i.test(message)
      ) {
        return true
      }
    }
    return false
  }

  /**
   * React internal: "Should have a queue…" — almost always a hooks-order mismatch after Vite HMR
   * swapped a hook module while a large parent fiber (e.g. SatelliteIntelligence) stayed mounted.
   * A full document reload remounts hooks cleanly; showing the dead-end screen does not help.
   */
  private static isHooksMismatchError(message: string): boolean {
    return /Should have a queue/i.test(message || '')
  }

  componentDidCatch(error: unknown) {
    if (AppErrorBoundary.recoverFromStaleChunk(error)) return
    if (AppErrorBoundary.recoverFromHooksMismatch(error)) return
    try {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[AppErrorBoundary]', message, error)
    } catch {
    }
  }

  componentDidUpdate() {
    const err = this.state.err?.error
    if (!err) return
    const message = err instanceof Error ? err.message : String(err ?? '')
    if (AppErrorBoundary.isHooksMismatchError(message)) {
      AppErrorBoundary.recoverFromHooksMismatch(err)
    }
  }

  /** Stale-deploy chunk failures should self-heal with a one-time reload, not a dead-end screen. */
  private static readonly STALE_CHUNK_GUARD = 'agro_boundary_chunk_reload'
  private static readonly HOOKS_MISMATCH_GUARD = 'agro_hooks_mismatch_reload'

  private static recoverFromStaleChunk(error: unknown): boolean {
    if (typeof window === 'undefined') return false
    if (!isDynamicImportError(error)) return false
    const guardKey = AppErrorBoundary.STALE_CHUNK_GUARD
    try {
      if (sessionStorage.getItem(guardKey)) return false
      sessionStorage.setItem(guardKey, '1')
    } catch {
      return false
    }
    // Purge the service worker + caches, then cache-busting reload so the recovery fetches a FRESH
    // index.html instead of the stale precached/CDN-cached document that still references chunk
    // hashes the new deploy deleted.
    void purgeAndReloadForStaleDeploy()
    return true
  }

  private static recoverFromHooksMismatch(error: unknown): boolean {
    if (typeof window === 'undefined') return false
    const message = error instanceof Error ? error.message : String(error ?? '')
    if (!AppErrorBoundary.isHooksMismatchError(message)) return false
    const guardKey = AppErrorBoundary.HOOKS_MISMATCH_GUARD
    try {
      if (sessionStorage.getItem(guardKey)) return false
      sessionStorage.setItem(guardKey, '1')
    } catch {
      // Still attempt reload — better than a stuck error wall.
    }
    try {
      console.warn(
        '[AppErrorBoundary] Hooks mismatch (often Vite HMR). Reloading once to remount cleanly.',
        error,
      )
    } catch {
    }
    try {
      const next = new URL(window.location.href)
      next.searchParams.set('_hmr', String(Date.now()))
      window.location.replace(next.toString())
    } catch {
      window.location.reload()
    }
    return true
  }

  componentDidMount() {
    if (typeof window === 'undefined') return
    this.onUnhandledRejection = (e) => {
      const reason = (e as any).reason
      const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
      const stack = reason instanceof Error ? reason.stack : undefined
      if (AppErrorBoundary.isBenignRuntimeError(msg, stack)) return
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      if (reason instanceof Error && reason.name === 'AbortError') return
      if (AppErrorBoundary.recoverFromStaleChunk(reason)) return
      if (AppErrorBoundary.recoverFromHooksMismatch(reason)) return
      const details = reason instanceof Error ? reason.stack : undefined
      this.setState({ err: { error: reason ?? e, kind: 'window', details } })
      try {
        console.error('[unhandledrejection]', reason)
      } catch {
      }
    }
    this.onErrorEvent = (e) => {
      const err = e?.error
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : String(e?.message ?? '')
      const stack =
        (err instanceof Error ? err.stack : undefined) ||
        (typeof e?.error?.stack === 'string' ? e.error.stack : undefined) ||
        (typeof e?.filename === 'string' ? e.filename : undefined)
      if (AppErrorBoundary.isBenignRuntimeError(msg, stack)) return
      if (AppErrorBoundary.recoverFromStaleChunk(err ?? e?.message)) return
      if (AppErrorBoundary.recoverFromHooksMismatch(err ?? e?.message)) return
      const details = typeof e?.error?.stack === 'string' ? e.error.stack : undefined
      this.setState({ err: { error: e.error ?? e.message, kind: 'window', details } })
      try {
        console.error('[window.error]', e.error ?? e.message)
      } catch {
      }
    }
    window.addEventListener('unhandledrejection', this.onUnhandledRejection)
    window.addEventListener('error', this.onErrorEvent)
  }

  componentWillUnmount() {
    if (typeof window === 'undefined') return
    if (this.onUnhandledRejection) window.removeEventListener('unhandledrejection', this.onUnhandledRejection)
    if (this.onErrorEvent) window.removeEventListener('error', this.onErrorEvent)
  }

  render() {
    if (!this.state.err) return this.props.children

    const message =
      this.state.err.error instanceof Error
        ? this.state.err.error.message
        : typeof this.state.err.error === 'string'
          ? this.state.err.error
          : 'A runtime error prevented the page from loading.'

    const reset = async () => {
      try {
        localStorage.clear()
      } catch {
      }
      try {
        sessionStorage.clear()
      } catch {
      }
      try {
        if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('GisMapStore')
      } catch {
      }
      try {
        if (typeof window !== 'undefined' && 'caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        }
      } catch {
      }
      try {
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map((r) => r.unregister()))
        }
      } catch {
      }
      window.location.reload()
    }

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147483600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          overflow: 'auto',
          color: '#0f172a',
          fontFamily:
            "'Inter', 'Segoe UI', 'Tahoma', system-ui, -apple-system, sans-serif",
          background:
            'radial-gradient(1100px 560px at 12% -12%, rgba(16,185,129,0.10), transparent 60%), radial-gradient(1000px 560px at 112% 112%, rgba(56,189,248,0.10), transparent 58%), linear-gradient(160deg, #ffffff 0%, #f4f7fb 52%, #eef2f7 100%)',
        }}
      >
        <div
          role="alertdialog"
          aria-labelledby="agro-err-title"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 540,
            borderRadius: 24,
            padding: '36px 32px 28px',
            color: '#0f172a',
            background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
            border: '1px solid rgba(15,23,42,0.08)',
            boxShadow:
              '0 40px 90px -40px rgba(15,23,42,0.35), 0 4px 14px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
            textAlign: 'center',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 72,
              height: 72,
              margin: '0 auto 20px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 800,
              color: '#dc2626',
              background:
                'radial-gradient(circle at 30% 25%, #fee2e2, #fff5f5)',
              border: '1px solid rgba(220,38,38,0.28)',
              boxShadow: '0 0 0 8px rgba(220,38,38,0.05)',
            }}
          >
            <span style={{ lineHeight: 1 }}>!</span>
          </div>

          <div
            id="agro-err-title"
            dir="rtl"
            style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.01em', marginBottom: 6, color: '#0b1220' }}
          >
            حدث خطأ ومنع الصفحة من التحميل
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#475569', marginBottom: 20 }}>
            Something went wrong while loading the page
          </div>

          <div
            dir="auto"
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: '#1f2937',
              background: '#f8fafc',
              border: '1px solid rgba(15,23,42,0.08)',
              borderRadius: 14,
              padding: '13px 15px',
              marginBottom: 24,
              wordBreak: 'break-word',
            }}
          >
            {message}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginBottom: this.state.err.details ? 18 : 0,
            }}
          >
            <button
              type="button"
              onClick={() => {
                clearChunkReloadGuards()
                void purgeAndReloadForStaleDeploy()
              }}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                border: 'none',
                borderRadius: 12,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                color: '#ffffff',
                background: 'linear-gradient(180deg, #10b981, #059669)',
                boxShadow: '0 12px 26px -12px rgba(5,150,105,0.65)',
              }}
            >
              Reload Page
            </button>
            <button
              type="button"
              onClick={() => {
                void reset()
              }}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                borderRadius: 12,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                color: '#0f172a',
                background: '#ffffff',
                border: '1px solid rgba(15,23,42,0.16)',
                boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
              }}
            >
              Reset App Storage
            </button>
          </div>

          {this.state.err.details ? (
            <details style={{ textAlign: 'left', marginTop: 4 }}>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: '#475569',
                  letterSpacing: '0.02em',
                  userSelect: 'none',
                }}
              >
                Technical details
              </summary>
              <pre
                style={{
                  marginTop: 10,
                  maxHeight: 220,
                  background: '#f8fafc',
                  border: '1px solid rgba(15,23,42,0.08)',
                  borderRadius: 10,
                  padding: 12,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: '#334155',
                }}
              >
                {this.state.err.details}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    )
  }
}

function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const handleLogout = () => {
    logout()
  }

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // The app rendered successfully — drop the one-shot reload guards and strip
  // cache-bust / HMR recovery params so a FUTURE failure can self-heal again.
  useEffect(() => {
    clearStaleChunkRecoveryState(['agro_boundary_chunk_reload', 'agro_hooks_mismatch_reload'])
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.has('_hmr')) {
        url.searchParams.delete('_hmr')
        window.history.replaceState(window.history.state, '', url.toString())
      }
    } catch {
      /* noop */
    }
  }, [])

  const isOnLogin = location.pathname === '/login'
  const showChrome = !!user && !isOnLogin
  const isAgroCloudDashboard = location.pathname === '/dashboards/agro-cloud'
  const isAgroCloudPlatform = location.pathname === '/dashboards/agro-cloud-platform'
  const isDevelopDashboard = location.pathname.startsWith('/dashboard/develop')
  /** Operations nav group: irrigation, EC/pH, harvest, QHIS, production, fertigation records */
  const isOperationsDataPage = location.pathname.startsWith('/data/')
  /** Soil / weather / irrigation / camera API integration pages */
  const isSensorsPage = location.pathname.startsWith('/sensors/')
  const isHomeLanding = location.pathname === '/' || location.pathname === ''
  const isGisContentPortal = location.pathname.startsWith('/master/gis-content')
  const mainContentClass = [
    'content',
    isGisContentPortal && 'content--gis-content-portal',
    isHomeLanding && 'content--home-landing',
    isAgroCloudDashboard && 'content--agro-cloud-dashboard',
    isAgroCloudPlatform && 'content--agro-cloud-platform',
    isDevelopDashboard && 'content--develop-dashboard',
    isOperationsDataPage && 'content--operations-fit',
    isSensorsPage && 'content--sensors-fit',
  ]
    .filter(Boolean)
    .join(' ')

  const layoutChromeClass = ['layout', 'layout-sidebar', 'app-layout'].join(' ')

  if (user && isOnLogin) {
    const from = (location.state as any)?.from?.pathname
    return <Navigate to={typeof from === 'string' && from ? from : '/'} replace />
  }

  if (!user && !isOnLogin) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <>
      {showChrome ? (
        <HeaderBar
          onToggleMobileNav={() => setMobileNavOpen(v => !v)}
          mobileNavOpen={mobileNavOpen}
        />
      ) : null}
      <div className={showChrome ? layoutChromeClass : 'layout'}>
        {showChrome ? (
          <NavMenu
            onLogout={handleLogout}
            mobileNavOpen={mobileNavOpen}
            onCloseMobileNav={() => setMobileNavOpen(false)}
          />
        ) : null}
        <main className={mainContentClass}>
          <AppRoutes />
          <PersistentAgroCloudEmbed />
        </main>
      </div>
    </>
  )
}

export default function App() {
  return (
    <HashRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <LanguageProvider>
        <AuthProvider>
          <SystemSettingsProvider>
            <AppDialogProvider>
              <AppErrorBoundary>
                <AppShell />
                <Suspense fallback={null}>
                  <SplashScreen />
                </Suspense>
                <PwaInstallPrompt />
                <PwaInstallFab />
              </AppErrorBoundary>
            </AppDialogProvider>
          </SystemSettingsProvider>
        </AuthProvider>
      </LanguageProvider>
    </HashRouter>
  )
}
