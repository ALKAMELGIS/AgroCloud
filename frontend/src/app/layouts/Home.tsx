import { useEffect, useState, type CSSProperties } from 'react'
import { useTheme } from '@mui/material/styles'
import { useLocation, useNavigate } from 'react-router-dom'
import './Home.css'
import { useLanguage } from '@/core/localization/i18n'
import { useSystemSettingsOptional } from '@/core/state/SystemSettingsContext'
import { startSession } from '@/core/auth/auth'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { HomeMenuIcon } from './HomeNavigation'
import { menuItems } from './homeMenu'
import type { HomeMenuItem, HomeSubMenuItem } from './HomeNavigation'

type MenuItem = HomeMenuItem
type SubMenuItem = HomeSubMenuItem

function openExternalApp(url: string): void {
  const trimmed = url.trim()
  if (!trimmed) return
  window.open(trimmed, '_blank', 'noopener,noreferrer')
}


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
      {/* Page heading for screen readers and outline; the visible page opens straight on the cards. */}
      <h1 className="sr-only">{language === 'ar' ? 'الرئيسية' : 'Home'}</h1>
      {activeGroup ? (
        <div className="home-sublist-view fade-in">
          <div className="home-header">
            <div className="home-header-row">
              <button className="back-btn" onClick={handleBack} aria-label="Back">
                <ChevronLeft className="home-lucide home-back-icon" strokeWidth={2} aria-hidden="true" />
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
                  <HomeMenuIcon faClass={activeGroup.icon} className="home-lucide" />
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
                {sublistOpen ? <ChevronUp className="home-lucide" strokeWidth={2} aria-hidden="true" /> : <ChevronDown className="home-lucide" strokeWidth={2} aria-hidden="true" />}
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
                          <HomeMenuIcon faClass={subItem.icon} className="app-icon app-icon--lucide" />
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
                          <ChevronRight className="mini-chev home-lucide" strokeWidth={2} aria-hidden="true" />
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
                    <HomeMenuIcon faClass={item.icon} className="app-icon app-icon--lucide" />
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
                  {homePageSettings.showCardChevron && item.items ? <ChevronRight className="mini-chev home-lucide" strokeWidth={2} aria-hidden="true" /> : null}
                </button>
              ))}
                </div>
              </div>
            </section>
          ))}
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
