import { useCallback, useContext, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTheme } from '@mui/material/styles'
import { useLocation, useNavigate } from 'react-router-dom'
import './Home.css'
import { useLanguage, type AppLanguage } from '@/core/localization/i18n'
import { useSystemSettingsOptional } from '@/core/state/SystemSettingsContext'
import { AuthContextOptional } from '@/core/state/auth'
import { startSession } from '@/core/auth/auth'
import { GPS_VEHICLE_TRACKING_SIGNIN_URL } from '@/core/routing/defaultPageLinks'
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { SidebarNav } from '@/components/ui/dashboard-sidebar'
import {
  buildHomeNavigation,
  HomeCommandPalette,
  type HomeMenuItem,
  type HomeNavEntry,
  type HomeSubMenuItem,
} from './HomeNavigation'

type MenuItem = HomeMenuItem
type SubMenuItem = HomeSubMenuItem

const HOME_SIDEBAR_KEY = 'agro_home_sidebar'

function openExternalApp(url: string): void {
  const trimmed = url.trim()
  if (!trimmed) return
  window.open(trimmed, '_blank', 'noopener,noreferrer')
}

const menuItems: MenuItem[] = [
  // Main apps open directly from the home page (they used to sit inside "Dashboard" and
  // "Satellite Imagery" groups, one extra click away).
  {
    id: 'develop-dashboard',
    label: { en: 'Develop Dashboard', ar: 'تطوير لوحة التحكم' },
    icon: 'fa-solid fa-grip',
    color: '#F97316',
    to: '/dashboard/develop',
  },
  {
    id: 'agro-cloud-dashboard',
    label: { en: 'Agro Cloud Dashboard', ar: 'لوحة Agro Cloud' },
    icon: 'fa-solid fa-chart-pie',
    color: '#F97316',
    to: '/dashboards/agro-cloud',
  },
  {
    id: 'satellite-intelligence',
    label: { en: 'Satellite Intelligence', ar: 'التحليل الفضائي الذكي' },
    icon: 'fa-solid fa-layer-group',
    color: '#8B5CF6', // Violet
    to: '/satellite/indices',
  },
  {
    id: 'application',
    label: { en: 'Application', ar: 'التطبيقات' },
    icon: 'fa-solid fa-cubes',
    color: '#0EA5E9',
    items: [
      {
        label: { en: 'AgroCloud Management', ar: 'إدارة AgroCloud' },
        icon: 'fa-solid fa-building-user',
        to: '/applications/agrocloud-management',
      },
      {
        label: { en: 'AgroCloud Platform', ar: 'منصة AgroCloud' },
        icon: 'fa-solid fa-seedling',
        to: '/dashboards/agro-cloud-platform',
      },
    ],
  },
  {
    id: 'data',
    label: { en: 'Operations', ar: 'العمليات' },
    icon: 'fa-solid fa-screwdriver-wrench',
    color: '#F59E0B', // Amber
    items: [
      {
        label: { en: 'EC/PH', ar: 'الملوحة والحموضة' },
        icon: 'fa-solid fa-droplet',
        to: '/data/ec-ph',
      },
      {
        label: { en: 'Irrigation Scheduling', ar: 'جدولة الري' },
        icon: 'fa-solid fa-water',
        to: '/data/irrigation',
      },
      {
        label: { en: 'Harvest Logging', ar: 'تسجيل الحصاد' },
        icon: 'fa-solid fa-tractor',
        to: '/data/harvest',
      },
      {
        label: { en: 'QHIS', ar: 'الجودة والسلامة' },
        icon: 'fa-solid fa-shield-halved',
        to: '/data/qhis',
      },
      {
        label: { en: 'Product & Sales Tracking', ar: 'تتبع المنتجات والمبيعات' },
        icon: 'fa-solid fa-boxes-stacked',
        to: '/data/production',
      },
    ],
  },
  {
    id: 'sensors',
    label: { en: 'Sensors', ar: 'الحساسات' },
    icon: 'fa-solid fa-microchip',
    color: '#0EA5E9', // Sky
    items: [
      { label: { en: 'Soil Sensors', ar: 'حساسات التربة' }, icon: 'fa-solid fa-seedling', to: '/sensors/soil' },
      { label: { en: 'Weather Sensors', ar: 'حساسات الطقس' }, icon: 'fa-solid fa-cloud-sun', to: '/sensors/weather' },
      { label: { en: 'Irrigation Sensors', ar: 'حساسات الري' }, icon: 'fa-solid fa-faucet-drip', to: '/sensors/irrigation' },
      { label: { en: 'Camera', ar: 'الكاميرا' }, icon: 'fa-solid fa-camera', to: '/sensors/camera' },
      {
        label: { en: 'GPS Vehicle Tracking', ar: 'تتبع مركبات GPS' },
        icon: 'fa-solid fa-route',
        to: '/sensors/gps',
        externalUrl: GPS_VEHICLE_TRACKING_SIGNIN_URL,
      },
    ]
  },
  {
    id: 'weather',
    label: { en: 'Weather', ar: 'الطقس' },
    icon: 'fa-solid fa-cloud-sun',
    color: '#22D3EE',
    to: '/weather/intelligence',
  },
  {
    id: 'camera-direct',
    label: { en: 'Camera', ar: 'الكاميرا' },
    icon: 'fa-solid fa-camera',
    color: '#0EA5E9',
    to: '/sensors/camera'
  },
  {
    id: 'gps-direct',
    label: { en: 'GPS Vehicle Tracking', ar: 'تتبع مركبات GPS' },
    icon: 'fa-solid fa-route',
    color: '#10B981',
    to: '/sensors/gps',
    externalUrl: GPS_VEHICLE_TRACKING_SIGNIN_URL,
  },
  {
    id: 'master',
    label: { en: 'Master Data', ar: 'البيانات الرئيسية' },
    icon: 'fa-solid fa-gear',
    color: '#64748B',
    items: [
      { label: { en: 'Data Management', ar: 'إدارة البيانات' }, icon: 'fa-solid fa-database', to: '/master/workflow-settings' },
      { label: { en: 'Dashboard Settings', ar: 'إعدادات لوحة التحكم' }, icon: 'fa-solid fa-link', to: '/master/dashboard-settings' },
      { label: { en: 'GIS Content', ar: 'محتوى GIS' }, icon: 'fa-solid fa-map-location-dot', to: '/master/gis-content' },
    ]
  },
  {
    id: 'admin',
    label: { en: 'Settings', ar: 'الإعدادات' },
    icon: 'fa-solid fa-user-shield',
    color: '#6366F1',
    items: [
      { label: { en: 'User Management', ar: 'إدارة المستخدمين' }, icon: 'fa-solid fa-users', to: '/admin/users' },
      { label: { en: 'Manpower', ar: 'القوى العاملة' }, icon: 'fa-solid fa-people-group', to: '/admin/manpower' },
      { label: { en: 'Credits', ar: 'الرصيد' }, icon: 'fa-solid fa-coins', to: '/admin/credits' },
      { label: { en: 'Roles & Permissions', ar: 'الأدوار والصلاحيات' }, icon: 'fa-solid fa-shield-halved', to: '/admin/roles' },
      { label: { en: 'Hierarchy', ar: 'التسلسل الهرمي' }, icon: 'fa-solid fa-sitemap', to: '/admin/hierarchy' },
      { label: { en: 'GitHub Integration', ar: 'تكامل GitHub' }, icon: 'fa-brands fa-github', to: '/admin/github' },
      { label: { en: 'System Settings', ar: 'إعدادات النظام' }, icon: 'fa-solid fa-sliders', to: '/admin/system-settings' },
    ]
  },
  {
    id: 'account',
    label: { en: 'Account', ar: 'الحساب' },
    icon: 'fa-solid fa-circle-user',
    color: '#0EA5E9',
    items: [
      { label: { en: 'Settings', ar: 'الإعدادات' }, icon: 'fa-solid fa-gear', to: '/account/settings' },
      { label: { en: 'Logout', ar: 'تسجيل الخروج' }, icon: 'fa-solid fa-arrow-right-from-bracket', action: 'logout' },
    ]
  }
]

function homeIconAccentColor(hexColor: string, darkCanvas: boolean): string {
  if (!darkCanvas) return hexColor
  const triplet = toRgbTriplet(hexColor).split(' ').map(Number)
  if (triplet.length !== 3 || triplet.some(n => Number.isNaN(n))) return hexColor
  const [r, g, b] = triplet
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  if (lum >= 0.42) return hexColor
  const mix = 0.68
  const lr = Math.round(r + (226 - r) * mix)
  const lg = Math.round(g + (232 - g) * mix)
  const lb = Math.round(b + (240 - b) * mix)
  return `#${[lr, lg, lb].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function homeCardAccentStyle(accentHex: string, darkCanvas: boolean): CSSProperties {
  const accent = homeIconAccentColor(accentHex, darkCanvas)
  return {
    '--app-accent': accent,
    '--app-accent-rgb': toRgbTriplet(accent),
  } as CSSProperties
}

function homeGreeting(language: AppLanguage, now: Date): string {
  const h = now.getHours()
  if (language === 'ar') return h < 12 ? 'صباح الخير' : h < 18 ? 'مساء الخير' : 'مساء الخير'
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function HomeWelcome({ language }: { language: AppLanguage }) {
  const auth = useContext(AuthContextOptional)
  const now = new Date()
  const firstName = String(auth?.user?.name || '').trim().split(/\s+/)[0]
  const dateLabel = now.toLocaleDateString(language === 'ar' ? 'ar' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return (
    <header className="home-welcome">
      <p className="home-welcome__date">{dateLabel}</p>
      <h1 className="home-welcome__title">
        {homeGreeting(language, now)}
        {firstName ? `, ${firstName}` : ''}
      </h1>
      <p className="home-welcome__sub">
        {language === 'ar'
          ? 'اختر مساحة العمل للبدء — الخرائط، صور الأقمار الصناعية، العمليات والتقارير.'
          : 'Pick a workspace to get started — maps, satellite imagery, field operations and reports.'}
      </p>
    </header>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const muiTheme = useTheme()
  const darkHomeCanvas = muiTheme.palette.mode === 'dark'
  const systemSettings = useSystemSettingsOptional()
  const [activeGroup, setActiveGroup] = useState<MenuItem | null>(null)
  const [sublistOpen, setSublistOpen] = useState(true)
  const { language } = useLanguage()
  const homePageSettings = systemSettings?.settings.homePage ?? {
    showItemCounts: true,
    showCardChevron: true,
    cardDensity: 'comfortable' as const,
    backgroundMode: 'default' as const,
    backgroundColor: '#0b1220',
    backgroundGradientFrom: '#0f172a',
    backgroundGradientTo: '#14532d',
    backgroundImage: '',
  }
  const homeBackgroundStyle: CSSProperties =
    homePageSettings.backgroundMode === 'solid'
      ? { background: homePageSettings.backgroundColor }
      : homePageSettings.backgroundMode === 'gradient'
        ? {
            background: `linear-gradient(160deg, ${homePageSettings.backgroundGradientFrom}, ${homePageSettings.backgroundGradientTo})`,
          }
        : homePageSettings.backgroundMode === 'image' && homePageSettings.backgroundImage
          ? {
              backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.42), rgba(2, 6, 23, 0.52)), url(${homePageSettings.backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : {}

  const handleMainClick = (item: MenuItem) => {
    if (item.items?.length) {
      setActiveGroup(item)
      setSublistOpen(true)
    } else if (item.externalUrl) {
      openExternalApp(item.externalUrl)
    } else if (item.to) {
      navigate(item.to)
    }
  }

  // --- Sidebar navigation + command palette -------------------------------------------------
  const auth = useContext(AuthContextOptional)
  const nav = useMemo(() => buildHomeNavigation(menuItems, language), [language])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(HOME_SIDEBAR_KEY) !== 'closed'
    } catch {
      return true
    }
  })

  const toggleSidebar = () => {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem(HOME_SIDEBAR_KEY, open ? 'closed' : 'open')
      } catch {
        /* per-browser convenience only */
      }
      return !open
    })
  }

  const runNav = useCallback(
    (id: string) => {
      const action = nav.actions.get(id)
      if (!action) return
      setMobileNavOpen(false)
      if (action.kind === 'search') setPaletteOpen(true)
      else if (action.kind === 'external') openExternalApp(action.url)
      else if (action.kind === 'logout') {
        startSession(null)
        navigate('/login', { replace: true })
      } else if (action.to === '/') {
        setActiveGroup(null)
      } else navigate(action.to)
    },
    [nav, navigate],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (e.key === 'Escape') {
        setMobileNavOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const workspaces = [
    {
      name: 'Elite AgroCloud',
      subtitle: String(auth?.user?.role || auth?.user?.email || '').trim() || undefined,
      logoSrc: `${import.meta.env.BASE_URL}agrocloud-logo-core.png`,
    },
  ]
  const sidebarLabel = language === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'
  // Main view: apps that open directly first, then the groups (each opens its own list).
  const homeSections = [
    {
      id: 'apps',
      title: language === 'ar' ? 'وصول سريع' : 'Quick access',
      items: menuItems.filter((i) => !i.items?.length),
    },
    {
      id: 'workspaces',
      title: language === 'ar' ? 'مساحات العمل' : 'Workspaces',
      items: menuItems.filter((i) => i.items?.length),
    },
  ].filter((section) => section.items.length)
  const sidebar = (className: string) => (
    <SidebarNav
      className={className}
      groups={nav.groups}
      bottomItems={nav.bottomItems}
      workspaces={workspaces}
      activeId={activeGroup ? `group:${activeGroup.id}` : '/'}
      onSelect={runNav}
      ariaLabel={sidebarLabel}
    />
  )

  const handleBack = () => {
    setActiveGroup(null)
  }

  const handleSubItemClick = (subItem: SubMenuItem) => {
    if (subItem.action === 'logout') {
      startSession(null)
      navigate('/login', { replace: true })
      return
    }
    if (subItem.externalUrl) {
      openExternalApp(subItem.externalUrl)
      return
    }
    if (subItem.to) navigate(subItem.to)
  }

  useEffect(() => {
    const state = location.state as { openGroup?: string } | null
    if (!state?.openGroup) return
    const group = menuItems.find(i => i.id === state.openGroup && i.items?.length)
    if (group) setActiveGroup(group)
  }, [location.state])

  useEffect(() => {
    if (activeGroup) setSublistOpen(true)
  }, [activeGroup?.id])

  useEffect(() => {
    const root = document.querySelector('.home-page')
    if (!root) return

    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    for (let i = 0; i < items.length; i += 1) {
      const el = items[i]
      el.style.setProperty('--enter-delay', `${Math.min(900, i * 90)}ms`)
      el.classList.add('reveal-ready')
      el.classList.remove('is-visible')
    }

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (prefersReduced) {
      for (const el of items) el.classList.add('is-visible')
      return
    }

    if (!('IntersectionObserver' in window)) {
      requestAnimationFrame(() => {
        for (const el of items) el.classList.add('is-visible')
      })
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          ;(entry.target as HTMLElement).classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -10% 0px' }
    )

    for (const el of items) observer.observe(el)
    return () => observer.disconnect()
  }, [activeGroup])

  return (
    <div className="page home-page" style={homeBackgroundStyle}>
      <div className="flex items-start gap-5">
        {/* Desktop sidebar: collapsible, remembered per browser. */}
        <aside
          className={`sticky top-4 hidden shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out lg:block ${
            sidebarOpen ? 'w-[260px] opacity-100' : 'w-0 opacity-0'
          }`}
          aria-hidden={!sidebarOpen}
          {...((!sidebarOpen ? { inert: '' } : {}) as Record<string, string>)}
        >
          <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
            {sidebar('h-[calc(100vh-150px)] min-h-[460px] border-none')}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
              aria-label={sidebarOpen ? (language === 'ar' ? 'إخفاء القائمة' : 'Hide sidebar') : language === 'ar' ? 'إظهار القائمة' : 'Show sidebar'}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.5} />
              ) : (
                <PanelLeftOpen className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.5} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground transition-colors hover:text-foreground lg:hidden"
              aria-label={language === 'ar' ? 'فتح القائمة' : 'Open menu'}
              aria-expanded={mobileNavOpen}
            >
              <Menu className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="inline-flex h-9 min-w-0 max-w-[340px] flex-1 items-center gap-2 rounded-lg border border-border/60 bg-card px-3 text-start text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:flex-none sm:w-[300px]"
              aria-label={language === 'ar' ? 'بحث' : 'Search'}
            >
              <Search className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {language === 'ar' ? 'ابحث عن صفحة أو تطبيق…' : 'Search pages and apps…'}
              </span>
              <kbd className="hidden h-5 items-center rounded-[4px] border border-border/60 bg-background/60 px-1.5 font-mono text-[10px] sm:inline-flex">
                Ctrl K
              </kbd>
            </button>
          </div>
      {activeGroup ? (
        <div className="home-sublist-view fade-in">
          <div className="home-header">
            <div className="home-header-row">
              <button className="back-btn" onClick={handleBack} aria-label="Back">
                <i className="fa-solid fa-chevron-left" aria-hidden="true"></i>
              </button>
              <div className="header-title">
                <span
                  className="header-icon"
                  style={
                    {
                      '--header-accent': activeGroup.color,
                      '--header-accent-rgb': toRgbTriplet(activeGroup.color),
                    } as CSSProperties
                  }
                >
                  <i className={activeGroup.icon} aria-hidden="true"></i>
                </span>
                <h2>{activeGroup.label[language]}</h2>
              </div>
              <button
                type="button"
                className="sublist-toggle"
                aria-expanded={sublistOpen}
                aria-controls={`home-sublist-${activeGroup.id}`}
                onClick={() => setSublistOpen(v => !v)}
              >
                <i className={`fa-solid ${sublistOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true"></i>
              </button>
            </div>

            <div
              id={`home-sublist-${activeGroup.id}`}
              className={sublistOpen ? 'sublist-page-area' : 'sublist-page-area sublist-page-area--closed'}
              role="region"
              aria-label={`${activeGroup.label[language]} submenu`}
              hidden={!sublistOpen}
            >
              <div className="home-modern">
                <div className="home-apps-strip">
                  <div className="home-apps-list">
                    {activeGroup.items?.map(subItem => (
                      <button
                        key={subItem.to || `${activeGroup.id}-${subItem.action || subItem.label.en}`}
                        type="button"
                        className={`app-icon-card ${homePageSettings.cardDensity === 'compact' ? 'app-icon-card--compact' : ''}`}
                        onClick={() => handleSubItemClick(subItem)}
                        aria-label={subItem.label[language]}
                        style={homeCardAccentStyle(activeGroup.color, darkHomeCanvas)}
                      >
                        <span className="app-icon-tile" aria-hidden="true">
                          <i className={`app-icon ${subItem.icon} fa-fw`}></i>
                        </span>
                        <span className="app-label">{subItem.label[language]}</span>
                        {homePageSettings.showItemCounts ? (
                          <span className="app-meta">
                            {subItem.action === 'logout'
                              ? language === 'ar'
                                ? 'خروج'
                                : 'Sign out'
                              : language === 'ar'
                                ? 'فتح'
                                : 'Open'}
                          </span>
                        ) : null}
                        {homePageSettings.showCardChevron ? (
                          <i className="fa-solid fa-chevron-right mini-chev" aria-hidden="true"></i>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="home-modern">
          <HomeWelcome language={language} />
          {homeSections.map((section) => (
            <section key={section.id} className="home-section" aria-labelledby={`home-section-${section.id}`}>
              <div className="home-section-head">
                <h2 id={`home-section-${section.id}`} className="home-section-title">
                  {section.title}
                </h2>
                <span className="home-section-count">{section.items.length}</span>
              </div>
              <div className="home-apps-strip">
                <div className="home-apps-list">
                  {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`app-icon-card ${homePageSettings.cardDensity === 'compact' ? 'app-icon-card--compact' : ''}`}
                  onClick={() => handleMainClick(item)}
                  aria-label={item.label[language]}
                  data-reveal="item"
                  style={homeCardAccentStyle(item.color, darkHomeCanvas)}
                >
                  <span className="app-icon-tile" aria-hidden="true">
                    <i className={`app-icon ${item.icon} fa-fw`}></i>
                  </span>
                  <span className="app-label">{item.label[language]}</span>
                  {homePageSettings.showItemCounts ? (
                    <span className="app-meta">
                      {item.items?.length
                        ? language === 'ar'
                          ? `${item.items.length} عناصر`
                          : `${item.items.length} ${item.items.length === 1 ? 'item' : 'items'}`
                        : language === 'ar'
                          ? 'فتح'
                          : 'Open'}
                    </span>
                  ) : null}
                  {homePageSettings.showCardChevron && item.items ? <i className="fa-solid fa-chevron-right mini-chev" aria-hidden="true"></i> : null}
                </button>
              ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
        </div>
      </div>

      {/* Phone / tablet: the same sidebar as a slide-in panel. */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[12000] lg:hidden" role="dialog" aria-modal="true" aria-label={sidebarLabel}>
          <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={() => setMobileNavOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 start-0 flex max-w-[85vw] bg-card shadow-2xl animate-in slide-in-from-left duration-200 rtl:slide-in-from-right">
            {sidebar('h-full max-w-full')}
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="absolute end-[-44px] top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-card text-foreground shadow"
              aria-label={language === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
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
        onPick={(entry: HomeNavEntry) => runNav(entry.id)}
      />
    </div>
  )
}

function toRgbTriplet(hexColor: string) {
  const hex = hexColor.replace(/^#/, '')
  if (hex.length !== 6) return '0 0 0'

  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)

  return `${r} ${g} ${b}`
}
