import { Component, Suspense, useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, useLocation } from 'react-router-dom'
import { AppDialogProvider } from './components/AppDialogProvider'
import HeaderBar from './components/HeaderBar'
import NavMenu from './components/NavMenu'
import AppRoutes from './routes/AppRoutes'
import PersistentAgroCloudEmbed from './components/PersistentAgroCloudEmbed'
import PwaInstallPrompt from './components/PwaInstallPrompt'
import PwaInstallFab from './components/PwaInstallFab'
import { isDynamicImportError, lazyWithRetry } from './lib/lazyWithRetry'
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
    return { err: { error, kind: 'render' as const } }
  }

  componentDidCatch(error: unknown) {
    if (AppErrorBoundary.recoverFromStaleChunk(error)) return
    try {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[AppErrorBoundary]', message, error)
    } catch {
    }
  }

  /** Stale-deploy chunk failures should self-heal with a one-time reload, not a dead-end screen. */
  private static recoverFromStaleChunk(error: unknown): boolean {
    if (typeof window === 'undefined') return false
    if (!isDynamicImportError(error)) return false
    const guardKey = 'agro_boundary_chunk_reload'
    try {
      if (sessionStorage.getItem(guardKey)) return false
      sessionStorage.setItem(guardKey, '1')
    } catch {
      return false
    }
    window.location.reload()
    return true
  }

  componentDidMount() {
    if (typeof window === 'undefined') return
    this.onUnhandledRejection = (e) => {
      const reason = (e as any).reason
      const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
      if (msg.includes('Style is not done loading')) return
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      if (reason instanceof Error && reason.name === 'AbortError') return
      if (AppErrorBoundary.recoverFromStaleChunk(reason)) return
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
      if (msg.includes('Style is not done loading')) return
      if (AppErrorBoundary.recoverFromStaleChunk(err ?? e?.message)) return
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
      <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>حدث خطأ ومنع الصفحة من التحميل</div>
        <div style={{ marginBottom: 12, color: '#444' }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" className="gis-btn" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            type="button"
            className="gis-btn"
            onClick={() => {
              void reset()
            }}
          >
            Reset App Storage
          </button>
        </div>
        {this.state.err.details ? (
          <pre style={{ background: '#f6f6f6', padding: 12, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{this.state.err.details}</pre>
        ) : null}
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
