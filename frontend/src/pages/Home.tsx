import { useEffect, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './Home.css'
import { useLanguage, type AppLanguage } from '@/lib/i18n'
import { useSystemSettingsOptional } from '@/store/SystemSettingsContext'
import { startSession } from '@/lib/auth'

interface MenuItem {
  id: string
  label: Record<AppLanguage, string>
  icon: string
  color: string
  items?: SubMenuItem[]
  to?: string
}

interface SubMenuItem {
  label: Record<AppLanguage, string>
  icon: string
  to?: string
  action?: 'logout'
}

const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: { en: 'Dashboard', ar: 'لوحة التحكم' },
    icon: 'fa-solid fa-chart-line',
    color: '#F97316',
    items: [
      { label: { en: 'Develop Dashboard', ar: 'تطوير لوحة التحكم' }, icon: 'fa-solid fa-grip', to: '/dashboard/develop' },
      { label: { en: 'Agro Cloud Dashboard', ar: 'لوحة Agro Cloud' }, icon: 'fa-solid fa-chart-pie', to: '/dashboards/agro-cloud' },
      {
        label: { en: 'AgroCloud Platform', ar: 'منصة AgroCloud' },
        icon: 'fa-solid fa-seedling',
        to: '/dashboards/agro-cloud-platform',
      },
    ]
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
    id: 'satellite',
    label: { en: 'Satellite Imagery', ar: 'صور الأقمار الصناعية' },
    icon: 'fa-solid fa-satellite-dish',
    color: '#8B5CF6', // Violet
    items: [
      { label: { en: 'Satellite Intelligence', ar: 'التحليل الفضائي الذكي' }, icon: 'fa-solid fa-layer-group', to: '/satellite/indices' },
      { label: { en: 'GIS Map', ar: 'خريطة GIS' }, icon: 'fa-solid fa-map', to: '/satellite/gis' },
    ]
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
      { label: { en: 'GPS Vehicle Tracking', ar: 'تتبع مركبات GPS' }, icon: 'fa-solid fa-route', to: '/sensors/gps' },
    ]
  },
  {
    id: 'aiAgroCloud',
    label: { en: 'AI AgroCloud', ar: 'سحابة Agro الذكية' },
    icon: 'fa-solid fa-cloud-bolt',
    color: '#059669',
    to: '/dashboards/ai-agro-cloud',
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
    to: '/sensors/gps'
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
    color: '#1E293B', // Dark
    items: [
      { label: { en: 'User Management', ar: 'إدارة المستخدمين' }, icon: 'fa-solid fa-users', to: '/admin/users' },
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

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
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
    } else if (item.to) {
      navigate(item.to)
    }
  }

  const handleBack = () => {
    setActiveGroup(null)
  }

  const handleSubItemClick = (subItem: SubMenuItem) => {
    if (subItem.action === 'logout') {
      startSession(null)
      navigate('/login', { replace: true })
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
                        style={
                          {
                            '--app-accent': activeGroup.color,
                            '--app-accent-rgb': toRgbTriplet(activeGroup.color),
                          } as CSSProperties
                        }
                      >
                        <i className={`app-icon ${subItem.icon} fa-fw`} aria-hidden="true"></i>
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
          <div className="home-apps-strip">
            <div className="home-apps-list" aria-label="Applications">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`app-icon-card ${homePageSettings.cardDensity === 'compact' ? 'app-icon-card--compact' : ''}`}
                  onClick={() => handleMainClick(item)}
                  aria-label={item.label[language]}
                  data-reveal="item"
                  style={
                    {
                      '--app-accent': item.color,
                      '--app-accent-rgb': toRgbTriplet(item.color),
                    } as CSSProperties
                  }
                >
                  <i className={`app-icon ${item.icon} fa-fw`} aria-hidden="true"></i>
                  <span className="app-label">{item.label[language]}</span>
                  {homePageSettings.showItemCounts ? (
                    <span className="app-meta">
                      {item.items?.length
                        ? language === 'ar'
                          ? `${item.items.length} عناصر`
                          : `${item.items.length} items`
                        : language === 'ar'
                          ? 'فتح'
                          : 'Open'}
                    </span>
                  ) : null}
                  {homePageSettings.showCardChevron && item.items ? <i className="fa-solid fa-chevron-right mini-chev"></i> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
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
