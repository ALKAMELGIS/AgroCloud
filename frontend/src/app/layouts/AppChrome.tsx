/**
 * App shell (the 21st.dev dashboard-sidebar layout, applied to the whole system):
 *
 *   ┌──────────┬───────────────────────────────────────────────┐
 *   │ sidebar  │ top bar: ◧  Elite AgroCloud / Page   🔍 🔔 ☾ 🌐 👤 │
 *   │ (brand,  ├───────────────────────────────────────────────┤
 *   │  nav,    │ page                                          │
 *   │  account)│                                               │
 *   └──────────┴───────────────────────────────────────────────┘
 *
 * - Sidebar: every destination from homeMenu.ts; collapsible on desktop (remembered per browser),
 *   a slide-in panel below 1024px.
 * - Top bar: sidebar toggle, breadcrumb, search (Ctrl/⌘+K anywhere), and the existing
 *   notifications / theme / language / account controls (NavMenu in `utilitiesOnly` mode).
 * - The top bar publishes its height as --header-height / --app-header-block, which full-screen
 *   pages (maps, dashboards) use to size themselves.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { SidebarNav } from '@/components/ui/dashboard-sidebar'
import { useLanguage } from '@/core/localization/i18n'
import { AuthContextOptional } from '@/core/state/auth'
import { useSystemSettingsOptional } from '@/core/state/SystemSettingsContext'
import NavMenu from './NavMenu'
import { menuItems } from './homeMenu'
import { buildHomeNavigation, HomeCommandPalette, type HomeNavEntry } from './HomeNavigation'

const SIDEBAR_KEY = 'agro_app_sidebar'
const DESKTOP_QUERY = '(min-width: 1024px)'

function useIsDesktop() {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(DESKTOP_QUERY).matches
  const [desktop, setDesktop] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY)
    if (!mq) return
    const on = () => setDesktop(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return desktop
}

/** The menu entry for the current URL: exact match, else the longest route that prefixes it. */
export function activeNavEntry(entries: HomeNavEntry[], pathname: string): HomeNavEntry | undefined {
  let best: HomeNavEntry | undefined
  for (const e of entries) {
    if (e.action.kind !== 'route') continue
    const to = e.action.to
    if (to === pathname) return e
    if (to !== '/' && pathname.startsWith(`${to}/`) && (!best || to.length > (best.action as { to: string }).to.length)) {
      best = e
    }
  }
  return best
}

export default function AppChrome({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useContext(AuthContextOptional)
  const systemSettings = useSystemSettingsOptional()
  const isDesktop = useIsDesktop()
  const topBarRef = useRef<HTMLElement | null>(null)

  const nav = useMemo(() => buildHomeNavigation(menuItems, language), [language])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) !== 'closed'
    } catch {
      return true
    }
  })

  const toggleSidebar = () => {
    if (!isDesktop) {
      setMobileOpen(true)
      return
    }
    setSidebarOpen((open) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, open ? 'closed' : 'open')
      } catch {
        /* per-browser convenience only */
      }
      return !open
    })
  }

  // Close the phone panel after navigating.
  useEffect(() => setMobileOpen(false), [location.pathname])

  // Ctrl/⌘+K opens search anywhere; Esc closes the phone panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (e.key === 'Escape') {
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Full-screen pages size themselves with these (they used to come from the old green header).
  useEffect(() => {
    const el = topBarRef.current
    if (!el) return
    const sync = () => {
      const h = Math.max(40, Math.round(el.getBoundingClientRect().height))
      document.documentElement.style.setProperty('--header-height', `${h}px`)
      document.documentElement.style.setProperty('--app-header-block', `${h}px`)
    }
    sync()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  const runNav = useCallback(
    (id: string) => {
      const action = nav.actions.get(id)
      if (!action) return
      setMobileOpen(false)
      if (action.kind === 'search') setPaletteOpen(true)
      else if (action.kind === 'external') window.open(action.url, '_blank', 'noopener,noreferrer')
      else if (action.kind === 'logout') onLogout()
      else navigate(action.to)
    },
    [nav, navigate, onLogout],
  )

  const pathname = location.pathname || '/'
  const current = pathname === '/' ? undefined : activeNavEntry(nav.entries, pathname)
  const activeId = pathname === '/' ? '/' : current?.id ?? ''
  const brand =
    (ar ? systemSettings?.settings.headerSettings?.logoTextAr?.trim() : '') ||
    systemSettings?.settings.headerSettings?.logoText?.trim() ||
    'Elite AgroCloud'
  const logoSrc = systemSettings?.settings.logoIcon?.trim() || `${import.meta.env.BASE_URL}agrocloud-logo-leaf.png`
  const workspaces = [
    { name: brand, subtitle: String(auth?.user?.role || auth?.user?.email || '').trim() || undefined, logoSrc },
  ]
  const pageTitle = pathname === '/' ? (ar ? 'الرئيسية' : 'Home') : current?.title ?? ''
  const sidebarLabel = ar ? 'التنقل الرئيسي' : 'Main navigation'

  const sidebar = (className: string) => (
    <SidebarNav
      className={className}
      groups={nav.groups}
      bottomItems={nav.bottomItems}
      workspaces={workspaces}
      activeId={activeId}
      onSelect={runNav}
      ariaLabel={sidebarLabel}
      // Remount when the page changes so the group holding the active page opens.
      key={activeId}
    />
  )

  const desktopOpen = isDesktop && sidebarOpen

  return (
    <div className="app-chrome flex h-[100dvh] w-full overflow-hidden">
      <aside
        className={`hidden h-full shrink-0 overflow-hidden border-e border-border/50 bg-card transition-[width] duration-300 ease-in-out lg:block ${
          sidebarOpen ? 'w-[260px]' : 'w-0 border-e-0'
        }`}
        aria-hidden={!desktopOpen}
        {...((!desktopOpen ? { inert: '' } : {}) as Record<string, string>)}
      >
        {sidebar('w-[260px] border-none bg-transparent')}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          ref={topBarRef}
          className="app-topbar relative z-[1200] flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-card px-3 sm:px-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
              aria-label={
                !isDesktop
                  ? ar
                    ? 'فتح القائمة'
                    : 'Open menu'
                  : sidebarOpen
                    ? ar
                      ? 'إخفاء القائمة'
                      : 'Hide sidebar'
                    : ar
                      ? 'إظهار القائمة'
                      : 'Show sidebar'
              }
              aria-expanded={isDesktop ? sidebarOpen : mobileOpen}
            >
              {!isDesktop ? (
                <Menu className="h-[18px] w-[18px]" strokeWidth={1.5} />
              ) : sidebarOpen ? (
                <PanelLeftClose className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.5} />
              ) : (
                <PanelLeftOpen className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.5} />
              )}
            </button>
            <nav aria-label={ar ? 'مسار الصفحة' : 'Breadcrumb'} className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden truncate sm:inline">{brand}</span>
              {current?.group ? (
                <>
                  <span className="hidden sm:inline" aria-hidden>
                    /
                  </span>
                  <span className="hidden truncate md:inline">{current.group}</span>
                </>
              ) : null}
              {pageTitle ? (
                <>
                  <span className="hidden sm:inline" aria-hidden>
                    /
                  </span>
                  <span className="truncate font-medium text-foreground" aria-current="page">
                    {pageTitle}
                  </span>
                </>
              ) : null}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-8 w-72 items-center gap-2 rounded-md border-0 bg-black/5 px-3 text-start text-[13px] text-muted-foreground transition-colors hover:text-foreground dark:bg-white/5 md:inline-flex"
            >
              <Search className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{ar ? 'ابحث عن صفحة أو تطبيق…' : 'Search pages and apps…'}</span>
              <kbd className="inline-flex h-5 items-center rounded-[4px] border border-border/60 bg-background/60 px-1.5 font-mono text-[10px]">
                Ctrl K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 md:hidden"
              aria-label={ar ? 'بحث' : 'Search'}
            >
              <Search className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </button>
            <div className="app-topbar-utilities">
              <NavMenu utilitiesOnly onLogout={onLogout} />
            </div>
          </div>
        </header>

        {children}
      </div>

      {/* Below 1024px: the same sidebar as a slide-in panel. */}
      {mobileOpen && !isDesktop ? (
        <div className="fixed inset-0 z-[12000]" role="dialog" aria-modal="true" aria-label={sidebarLabel}>
          <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 start-0 flex max-w-[85vw] bg-card shadow-2xl animate-in slide-in-from-left duration-200 rtl:slide-in-from-right">
            {sidebar('h-full max-w-full border-none bg-transparent')}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute end-[-44px] top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-card text-foreground shadow"
              aria-label={ar ? 'إغلاق القائمة' : 'Close menu'}
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : null}

      <HomeCommandPalette
        open={paletteOpen}
        entries={nav.entries}
        language={language}
        onClose={() => setPaletteOpen(false)}
        onPick={(entry) => runNav(entry.id)}
      />
    </div>
  )
}
