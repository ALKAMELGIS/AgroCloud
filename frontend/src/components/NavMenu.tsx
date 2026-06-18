import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import './navmenu.css'
import { hasPermission, normalizeRole, readCurrentUser } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import type { MergedGroup } from '../nav/navManifest'
import { normalizeAppPath } from '../services/settingsStorage'
import type { ThemeMode } from '../types/systemSettings'
import { useMergedNavigation, useSystemSettings } from '../store/SystemSettingsContext'

function resolveThemeIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light' || mode === 'custom') return false
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

type NavMenuProps = {
  onLogout?: () => void
  mobileNavOpen?: boolean
  onCloseMobileNav?: () => void
}

type AppNotification = {
  id: number
  title: string
  body: string
  at: string
  read: boolean
}

const navTranslations = {
  en: {
    account: 'Account',
    admin: 'Settings',
    arabic: 'Arabic',
    camera: 'Camera',
    clearAll: 'Clear all',
    closeMenu: 'Close navigation menu',
    dashboard: 'Dashboard',
    agroCloudDashboard: 'Agro Cloud Dashboard',
    agroCloudPlatform: 'AgroCloud Platform',
    aiAgroCloud: 'AI AgroCloud',
    aiAgroChat: 'AI Agro-Chat',
    developDashboard: 'Develop Dashboard',
    ecph: 'EC/PH',
    english: 'English',
    gisContent: 'GIS Content',
    gisMap: 'GIS Map',
    githubIntegration: 'GitHub Integration',
    harvest: 'Harvest Logging',
    home: 'Home',
    irrigation: 'Irrigation Scheduling',
    irrigationSensors: 'Irrigation Sensors',
    language: 'Language',
    theme: 'Theme',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    switchToArabic: 'Switch to Arabic',
    switchToEnglish: 'Switch to English',
    systemTheme: 'System Theme',
    logout: 'Logout',
    masterData: 'Master Data',
    noNotifications: 'No notifications',
    notifications: 'Notifications',
    notificationsUnread: (count: number) => `${count} unread notification${count === 1 ? '' : 's'}`,
    openMenu: 'Open navigation menu',
    operations: 'Operations',
    productTracking: 'Product & Sales Tracking',
    profile: 'Profile',
    qhis: 'QHIS',
    satelliteImagery: 'Satellite Imagery',
    satelliteIntelligence: 'Satellite Intelligence',
    sensors: 'Sensors',
    soilSensors: 'Soil Sensors',
    userManagement: 'User Management',
    weatherSensors: 'Weather Sensors',
    gpsVehicleTracking: 'GPS Vehicle Tracking',
    workflowDataSources: 'Data Management',
    dashboardSettings: 'Dashboard Settings',
    systemSettings: 'System Settings',
    customPage: 'Custom page',
  },
  ar: {
    account: 'الحساب',
    admin: 'الإعدادات',
    arabic: 'العربية',
    camera: 'الكاميرا',
    clearAll: 'مسح الكل',
    closeMenu: 'إغلاق قائمة التنقل',
    dashboard: 'لوحة التحكم',
    agroCloudDashboard: 'لوحة Agro Cloud',
    agroCloudPlatform: 'منصة AgroCloud',
    aiAgroCloud: 'سحابة Agro الذكية',
    aiAgroChat: 'محادثة Agro الذكية',
    developDashboard: 'تطوير لوحة التحكم',
    ecph: 'الملوحة والحموضة',
    english: 'الإنجليزية',
    gisContent: 'محتوى نظم المعلومات الجغرافية',
    gisMap: 'خريطة GIS',
    githubIntegration: 'تكامل GitHub',
    harvest: 'تسجيل الحصاد',
    home: 'الرئيسية',
    irrigation: 'جدولة الري',
    irrigationSensors: 'حساسات الري',
    language: 'اللغة',
    theme: 'المظهر',
    lightMode: 'الوضع الفاتح',
    darkMode: 'الوضع الداكن',
    switchToLight: 'التبديل إلى الوضع الفاتح',
    switchToDark: 'التبديل إلى الوضع الداكن',
    switchToArabic: 'التبديل إلى العربية',
    switchToEnglish: 'التبديل إلى الإنجليزية',
    systemTheme: 'نسق النظام',
    logout: 'تسجيل الخروج',
    masterData: 'البيانات الرئيسية',
    noNotifications: 'لا توجد إشعارات',
    notifications: 'الإشعارات',
    notificationsUnread: (count: number) =>
      count === 1 ? 'إشعار واحد غير مقروء' : `${count} إشعارات غير مقروءة`,
    openMenu: 'فتح قائمة التنقل',
    operations: 'العمليات',
    productTracking: 'تتبع المنتجات والمبيعات',
    profile: 'الملف الشخصي',
    qhis: 'الجودة والسلامة',
    satelliteImagery: 'صور الأقمار الصناعية',
    satelliteIntelligence: 'التحليل الفضائي الذكي',
    sensors: 'الحساسات',
    soilSensors: 'حساسات التربة',
    userManagement: 'إدارة المستخدمين',
    weatherSensors: 'حساسات الطقس',
    gpsVehicleTracking: 'تتبع مركبات GPS',
    workflowDataSources: 'إدارة البيانات',
    dashboardSettings: 'إعدادات لوحة التحكم',
    systemSettings: 'إعدادات النظام',
    customPage: 'صفحة مخصصة',
  },
} as const

export default function NavMenu({ onLogout, mobileNavOpen = false, onCloseMobileNav }: NavMenuProps) {
  const getViewport = (): 'desktop' | 'tablet' | 'mobile' => {
    if (typeof window === 'undefined') return 'desktop'
    const w = window.innerWidth
    if (w < 768) return 'mobile'
    if (w < 1024) return 'tablet'
    return 'desktop'
  }
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>(getViewport)
  const [isMobile, setIsMobile] = useState(() => getViewport() === 'mobile')
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('navCollapsed') === 'true'
  })
  const [openGroup, setOpenGroup] = useState<
    | 'dashboard'
    | 'aiAgroCloud'
    | 'satellite'
    | 'data'
    | 'sensors'
    | 'master'
    | 'admin'
    | 'notifications'
    | 'account'
    | string
    | null
  >(null)
  const location = useLocation()
  const navRef = useRef<HTMLElement | null>(null)
  const groupContainerRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const groupHeaderRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const groupFirstItemRefs = useRef<Record<string, HTMLElement | null>>({})

  const { language, setLanguage } = useLanguage()

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('appNotifications') : null
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed as AppNotification[]
      } catch {
      }
    }
    return [
      { id: Date.now() - 2, title: 'Welcome', body: 'Your account is ready.', at: new Date().toLocaleString(), read: false },
      { id: Date.now() - 1, title: 'Tip', body: 'Use Settings → User Management to manage users.', at: new Date().toLocaleString(), read: false }
    ]
  })

  const role = normalizeRole(readCurrentUser()?.role)

  const canSeeMaster = true
  const canSeeAdmin = hasPermission('admin.users.manage', role)

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])
  const t = navTranslations[language]
  const notificationsLabel = useMemo(() => {
    if (unreadCount <= 0) return t.notifications
    return `${t.notifications}, ${t.notificationsUnread(unreadCount)}`
  }, [t, unreadCount])

  const { home: mergedHome, groups: mergedGroups } = useMergedNavigation()
  const { settings: systemSettings, setSettings } = useSystemSettings()
  const themeIsDark = useMemo(() => resolveThemeIsDark(systemSettings.themeMode), [systemSettings.themeMode])

  const toggleThemeMode = () => {
    setSettings({
      ...systemSettings,
      themeMode: themeIsDark ? 'light' : 'dark',
    })
  }

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en')
  }

  const languageSwitchHint = language === 'en' ? t.switchToArabic : t.switchToEnglish
  const languageMark = language === 'en' ? 'A' : 'E'

  const navLabel = (leaf: { i18nKey: keyof typeof navTranslations.en; labelEn: string; labelAr: string }) => {
    if (language === 'ar') return leaf.labelAr || t[leaf.i18nKey]
    return leaf.labelEn || t[leaf.i18nKey]
  }

  const renderMergedGroup = (group: MergedGroup) => (
    <li
      key={group.id}
      className={openGroup === group.id ? 'group open' : 'group'}
      ref={el => {
        groupContainerRefs.current[group.id] = el
      }}
    >
      <button
        className={
          activeGroup === group.id
            ? `group-header active ${group.headerClass}`
            : `group-header ${group.headerClass}`
        }
        type="button"
        aria-haspopup="true"
        aria-label={navLabel(group)}
        title={navLabel(group)}
        aria-expanded={openGroup === group.id}
        aria-controls={`nav-group-${group.id}`}
        onClick={() => toggleGroup(group.id)}
        onMouseEnter={() => {
          if (flyoutMode) positionFlyout(group.id)
        }}
        onFocus={() => {
          if (flyoutMode) positionFlyout(group.id)
        }}
        onKeyDown={onGroupKeyDown(group.id)}
        ref={el => {
          groupHeaderRefs.current[group.id] = el
        }}
      >
        <span className="icon">
          <i className={group.iconClass}></i>
        </span>
        <span className="label">{navLabel(group)}</span>
        <i className={`chev fa-solid ${openGroup === group.id ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
      </button>
      <div
        id={`nav-group-${group.id}`}
        className={openGroup === group.id ? 'sublist open' : 'sublist'}
      >
        <div className="navmenu-sublist-title">{navLabel(group)}</div>
        {group.children.map((leaf, ix) => (
          <NavLink
            key={leaf.id}
            to={leaf.path}
            onClick={handleNavigate}
            className={({ isActive }) => (isActive ? `subitem active ${leaf.subitemClass}` : `subitem ${leaf.subitemClass}`)}
            ref={el => {
              if (ix === 0) groupFirstItemRefs.current[group.id] = el
            }}
          >
            <span className="icon">
              <i className={leaf.iconClass}></i>
            </span>
            <span className="label">{navLabel(leaf)}</span>
          </NavLink>
        ))}
      </div>
    </li>
  )

  const closeAllGroups = () => setOpenGroup(null)
  const closeAll = () => {
    setOpenGroup(null)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => {
      const next = getViewport()
      setViewport(next)
      setIsMobile(next === 'mobile')
    }
    update()
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('navCollapsed', collapsed ? 'true' : 'false')
  }, [collapsed])

  useEffect(() => {
    setOpenGroup(null)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('appNotifications', JSON.stringify(notifications))
    }
  }, [notifications])

  useEffect(() => {
    if (openGroup !== 'notifications') return
    setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })))
  }, [openGroup])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body
    const isMobileViewport = viewport === 'mobile'
    const drawerOpen = isMobileViewport && mobileNavOpen
    body.classList.toggle('nav-drawer-viewport', isMobileViewport)
    body.classList.toggle('nav-drawer-open', drawerOpen)
    return () => {
      body.classList.remove('nav-drawer-viewport')
      body.classList.remove('nav-drawer-open')
    }
  }, [viewport, mobileNavOpen])

  useEffect(() => {
    const handleAnyPointerDown = (e: Event) => {
      if (e.type === 'mousedown' && typeof window !== 'undefined' && 'PointerEvent' in window) return
      if (e.type === 'touchstart' && typeof window !== 'undefined' && 'PointerEvent' in window) return
      if (!navRef.current) return
      const target = e.target as Node | null
      if (!target) return

      const navEl = navRef.current

      if (!navEl.contains(target)) {
        closeAll()
        return
      }

      if (openGroup) {
        const openContainer = groupContainerRefs.current[openGroup]
        if (openContainer && !openContainer.contains(target)) {
          setOpenGroup(null)
        }
      }
    }

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      closeAll()
    }

    document.addEventListener('pointerdown', handleAnyPointerDown, { capture: true })
    document.addEventListener('mousedown', handleAnyPointerDown, { capture: true })
    document.addEventListener('touchstart', handleAnyPointerDown, { capture: true })
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleAnyPointerDown, { capture: true } as any)
      document.removeEventListener('mousedown', handleAnyPointerDown, { capture: true } as any)
      document.removeEventListener('touchstart', handleAnyPointerDown, { capture: true } as any)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openGroup])

  const activeGroup = useMemo(() => {
    const path = location.pathname
    const custom = systemSettings.customPages.find(p => {
      const n = normalizeAppPath(p.path)
      return path === n || path.startsWith(`${n}/`)
    })
    if (custom?.navGroupId) return custom.navGroupId
    if (path.startsWith('/dashboards/ai-agro-')) return 'aiAgroCloud'
    if (path.startsWith('/dashboard')) return 'dashboard'
    if (path.startsWith('/satellite/')) return 'satellite'
    if (path.startsWith('/data/')) return 'data'
    if (path.startsWith('/sensors/')) return 'sensors'
    if (path.startsWith('/master/')) return 'master'
    if (path.startsWith('/admin/')) return 'admin'
    if (path.startsWith('/account/')) return 'account'
    return null
  }, [location.pathname, systemSettings.customPages])

  const toggleGroup = (group: NonNullable<typeof openGroup>) => {
    setOpenGroup(prev => (prev === group ? null : group))
  }

  const flyoutMode = false

  const positionFlyout = (group: NonNullable<typeof openGroup>) => {
    if (typeof window === 'undefined') return
    const header = groupHeaderRefs.current[group]
    const container = groupContainerRefs.current[group]
    if (!header || !container) return
    const rect = header.getBoundingClientRect()
    const pad = 10
    const top = Math.max(8, Math.min(rect.top - 10, window.innerHeight - 8))
    const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
    container.style.setProperty('--nav-flyout-top', `${top}px`)
    if (isRtl) {
      const right = Math.max(8, window.innerWidth - rect.left + pad)
      container.style.setProperty('--nav-flyout-right', `${right}px`)
      container.style.removeProperty('--nav-flyout-left')
    } else {
      const left = Math.max(8, rect.right + pad)
      container.style.setProperty('--nav-flyout-left', `${left}px`)
      container.style.removeProperty('--nav-flyout-right')
    }
  }

  useEffect(() => {
    if (!flyoutMode) return
    if (!openGroup) return
    const id = window.requestAnimationFrame(() => {
      positionFlyout(openGroup)
    })
    return () => window.cancelAnimationFrame(id)
  }, [flyoutMode, openGroup])

  const openGroupAndFocusFirst = (group: NonNullable<typeof openGroup>) => {
    setOpenGroup(group)
    requestAnimationFrame(() => {
      groupFirstItemRefs.current[group]?.focus()
    })
  }

  const onGroupKeyDown = (group: NonNullable<typeof openGroup>) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleGroup(group)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      openGroupAndFocusFirst(group)
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      closeAll()
    }
  }

  const handleNavigate = () => {
    closeAll()
    if (isMobile && onCloseMobileNav) onCloseMobileNav()
  }

  return (
    <>
      {isMobile && mobileNavOpen ? (
        <div
          className="navmenu-backdrop"
          aria-hidden="true"
          onClick={() => onCloseMobileNav?.()}
        />
      ) : null}
      <nav
        className={[
          'navmenu',
          !isMobile ? 'navmenu--compact' : '',
          isMobile && mobileNavOpen ? 'navmenu-open' : '',
          isMobile ? 'navmenu--mobile' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Primary"
        aria-hidden={isMobile && !mobileNavOpen ? true : undefined}
        ref={navRef}
        data-viewport={viewport}
      >
      {isMobile ? (
        <button
          type="button"
          className="navmenu-close"
          aria-label="Close navigation menu"
          onClick={() => onCloseMobileNav?.()}
        >
          <i className="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      ) : null}
      <button
        className="nav-collapse-toggle"
        type="button"
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-pressed={collapsed}
        aria-controls="primary-nav"
        onClick={() => {
          setCollapsed(v => !v)
          closeAllGroups()
        }}
      >
        <i className={collapsed ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left'}></i>
      </button>
      <ul
        id="primary-nav"
        className="navmenu-list"
        data-open={isMobile ? 'true' : undefined}
        aria-hidden={isMobile ? false : undefined}
      >
        {mergedHome.visible ? (
          <li className="navmenu-li">
            <NavLink
              to="/"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'item active nav-item-home' : 'item nav-item-home')}
              aria-label={navLabel(mergedHome)}
              title={navLabel(mergedHome)}
            >
              <span className="icon">
                <i className={mergedHome.iconClass}></i>
              </span>
              <span className="label">{navLabel(mergedHome)}</span>
            </NavLink>
          </li>
        ) : null}

        {mergedGroups.map(group => {
          if (group.id === 'master' && !canSeeMaster) return null
          if (group.id === 'admin' && !canSeeAdmin) return null
          return renderMergedGroup(group)
        })}

        <li
          className={
            openGroup === 'notifications'
              ? 'group open navmenu-account navmenu-utility navmenu-utility-first'
              : 'group navmenu-account navmenu-utility navmenu-utility-first'
          }
          ref={el => {
            groupContainerRefs.current.notifications = el
          }}
        >
          <button
            className="group-header nav-header-notifications navmenu-icon-only"
            type="button"
            aria-haspopup="true"
            aria-label={notificationsLabel}
            aria-expanded={openGroup === 'notifications'}
            aria-controls="nav-group-notifications"
            title={notificationsLabel}
            onClick={() => toggleGroup('notifications')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('notifications')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('notifications')
            }}
            onKeyDown={onGroupKeyDown('notifications')}
            ref={el => {
              groupHeaderRefs.current.notifications = el
            }}
          >
            <span className="nav-notifications-chrome">
              <span className="icon" aria-hidden="true">
                <i className="fa-solid fa-bell"></i>
              </span>
              {unreadCount > 0 ? (
                <span className="nav-notifications-count" aria-hidden="true">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </span>
          </button>
          <div
            id="nav-group-notifications"
            className={
              openGroup === 'notifications'
                ? 'sublist open navmenu-utility-popover navmenu-utility-popover--notifications'
                : 'sublist navmenu-utility-popover navmenu-utility-popover--notifications'
            }
          >
            <div className="navmenu-sublist-title navmenu-utility-popover__title">{t.notifications}</div>
            {notifications.length ? (
              <>
                {notifications.slice(0, 6).map((n, idx) => (
                  <button
                    key={n.id}
                    type="button"
                    className="subitem nav-item-notifications"
                    onClick={() => {
                      setNotifications(prev => prev.map(p => (p.id === n.id ? { ...p, read: true } : p)))
                      setOpenGroup(null)
                    }}
                    ref={el => {
                      if (idx === 0) groupFirstItemRefs.current.notifications = el
                    }}
                  >
                    <span className="icon">
                      <i className="fa-solid fa-circle-info"></i>
                    </span>
                    <span className="label">
                      <span className="navmenu-subitem-title">{n.title}</span>
                      <span className="navmenu-subitem-meta">{n.at}</span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="subitem nav-item-notifications"
                  onClick={() => setNotifications([])}
                >
                  <span className="icon">
                    <i className="fa-solid fa-trash"></i>
                  </span>
                  <span className="label">{t.clearAll}</span>
                </button>
              </>
            ) : (
              <div className="navmenu-sublist-empty">{t.noNotifications}</div>
            )}
          </div>
        </li>

        <li className="navmenu-utility navmenu-utility-theme">
          <button
            className="group-header nav-header-theme navmenu-icon-only"
            type="button"
            aria-label={themeIsDark ? t.switchToLight : t.switchToDark}
            title={themeIsDark ? t.switchToLight : t.switchToDark}
            onClick={toggleThemeMode}
          >
            <span className="icon">
              <i className={themeIsDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun'} aria-hidden />
            </span>
          </button>
        </li>

        <li className="navmenu-utility navmenu-utility-lang">
          <button
            className="group-header nav-header-language navmenu-icon-only"
            type="button"
            aria-label={languageSwitchHint}
            title={languageSwitchHint}
            onClick={toggleLanguage}
          >
            <span className="icon nav-lang-icon">
              <i className="fa-solid fa-globe" aria-hidden />
              <span className="nav-lang-icon__mark" aria-hidden>
                {languageMark}
              </span>
            </span>
          </button>
        </li>

        <li
          className={openGroup === 'account' ? 'group open navmenu-utility navmenu-utility-last' : 'group navmenu-utility navmenu-utility-last'}
          ref={el => {
            groupContainerRefs.current.account = el
          }}
        >
          <button
            className={
              activeGroup === 'account'
                ? 'group-header active nav-header-account navmenu-icon-only'
                : 'group-header nav-header-account navmenu-icon-only'
            }
            type="button"
            aria-haspopup="true"
            aria-label={t.account}
            aria-expanded={openGroup === 'account'}
            aria-controls="nav-group-account"
            title={t.account}
            onClick={() => toggleGroup('account')}
            onMouseEnter={() => {
              if (flyoutMode) positionFlyout('account')
            }}
            onFocus={() => {
              if (flyoutMode) positionFlyout('account')
            }}
            onKeyDown={onGroupKeyDown('account')}
            ref={el => {
              groupHeaderRefs.current.account = el
            }}
          >
            <span className="icon">
              <i className="fa-solid fa-user-astronaut"></i>
            </span>
          </button>
          <div
            id="nav-group-account"
            className={
              openGroup === 'account'
                ? 'sublist open navmenu-utility-popover navmenu-utility-popover--account'
                : 'sublist navmenu-utility-popover navmenu-utility-popover--account'
            }
          >
            <NavLink
              to="/account/profile"
              onClick={handleNavigate}
              className={({ isActive }) => (isActive ? 'subitem active nav-item-account' : 'subitem nav-item-account')}
              ref={el => {
                groupFirstItemRefs.current.account = el
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-user-gear"></i>
              </span>
              <span className="label">{t.profile}</span>
            </NavLink>
            <button
              className="subitem nav-item-account"
              type="button"
              onClick={() => {
                closeAll()
                if (onLogout) {
                  onLogout()
                } else {
                  window.location.href = '/'
                }
              }}
            >
              <span className="icon">
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
              </span>
              <span className="label">{t.logout}</span>
            </button>
          </div>
        </li>

      </ul>
      </nav>
    </>
  )
}
