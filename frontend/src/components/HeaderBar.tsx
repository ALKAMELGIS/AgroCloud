import './header.css'
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { AgroCloudMark } from './AgroCloudMark'
import { normalizeHeaderLogoText } from '../services/settingsStorage'
import { useSystemSettings } from '../store/SystemSettingsContext'
import { useLanguage } from '../lib/i18n'

const DEFAULT_CENTER_LOGO = 'https://eliteprojects.ae/wp-content/uploads/2022/07/logo-retraced-white-03.png'

type HeaderBarProps = {
  onToggleMobileNav?: () => void
  mobileNavOpen?: boolean
}

export default function HeaderBar({ onToggleMobileNav, mobileNavOpen = false }: HeaderBarProps = {}) {
  const headerRef = useRef<HTMLElement | null>(null)
  const { settings } = useSystemSettings()
  const { language } = useLanguage()
  const logoIconSrc = settings.logoIcon.trim()
  const hs = settings.headerSettings

  const centerLogoSrc = useMemo(() => {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
    const isDark = settings.themeMode === 'dark' || (settings.themeMode === 'system' && prefersDark)
    if (isDark && settings.logoDark.trim()) return settings.logoDark.trim()
    if (!isDark && settings.logoLight.trim()) return settings.logoLight.trim()
    return settings.logoLight.trim() || settings.logoDark.trim() || DEFAULT_CENTER_LOGO
  }, [settings.themeMode, settings.logoLight, settings.logoDark])
  const usesDefaultMark =
    !logoIconSrc && !hs.logoSvg.trim().startsWith('<svg')

  const logoText = useMemo(() => {
    if (hs.useProjectName) return normalizeHeaderLogoText(String(import.meta.env.VITE_APP_NAME || 'Elite AgroCloud'))
    if (language === 'ar' && hs.logoTextAr.trim()) return normalizeHeaderLogoText(hs.logoTextAr.trim())
    return normalizeHeaderLogoText(hs.logoText.trim() || 'Elite AgroCloud')
  }, [hs.logoText, hs.logoTextAr, hs.useProjectName, language])
  const headerLogoColor = '#ffffff'

  const headerStyle = useMemo(
    () =>
      ({
        '--header-pad-x': `${hs.paddingX}px`,
        '--header-pad-y': `${hs.paddingY}px`,
        '--header-blur': `${hs.blur}px`,
        '--header-logo-font-size': `${hs.fontSize}px`,
        '--header-logo-font-weight': String(hs.fontWeight),
        '--header-logo-font-family': hs.fontFamily,
        '--header-logo-letter-spacing': `${hs.letterSpacing}em`,
        '--header-logo-color': headerLogoColor,
        '--header-logo-color-light': headerLogoColor,
        '--header-logo-color-dark': headerLogoColor,
      }) as CSSProperties,
    [hs],
  )

  useEffect(() => {
    const el = headerRef.current
    if (!el) return

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (prefersReduced || !hs.enableAnimation) return

    let raf = 0
    let lastX = 0
    let lastY = 0

    const apply = () => {
      raf = 0
      el.style.setProperty('--hx', `${lastX}%`)
      el.style.setProperty('--hy', `${lastY}%`)
    }

    const onMove = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const x = rect.width ? (ev.clientX - rect.left) / rect.width : 0.5
      const y = rect.height ? (ev.clientY - rect.top) / rect.height : 0.5
      lastX = Math.max(0, Math.min(100, x * 100))
      lastY = Math.max(0, Math.min(100, y * 100))
      if (raf) return
      raf = window.requestAnimationFrame(apply)
    }

    const onLeave = () => {
      el.style.setProperty('--hx', '50%')
      el.style.setProperty('--hy', '35%')
    }

    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave, { passive: true })
    onLeave()

    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [hs.enableAnimation])

  return (
    <header
      className={`agri-header agri-header--align-${hs.logoAlign}${hs.sticky ? ' agri-header--sticky' : ''}${hs.transparent ? ' agri-header--transparent' : ''}${hs.autoResize ? ' agri-header--auto-resize' : ''}${hs.mobileShowLogoText ? '' : ' agri-header--hide-mobile-text'}${hs.tabletShowLogoText ? '' : ' agri-header--hide-tablet-text'}`}
      ref={headerRef}
      style={headerStyle}
    >
      <div className={`header-left${hs.logoAlign === 'center' ? ' header-left--center' : ''}`}>
        {onToggleMobileNav ? (
          <button
            type="button"
            className="header-mobile-nav-toggle"
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileNavOpen}
            aria-controls="primary-nav"
            onClick={onToggleMobileNav}
          >
            <i className={`fa-solid ${mobileNavOpen ? 'fa-xmark' : 'fa-bars'}`} aria-hidden="true"></i>
          </button>
        ) : null}
        {hs.showLogoIcon || hs.showLogoText ? (
          <div className="header-brand-lockup">
            {hs.showLogoIcon ? (
              <span className={usesDefaultMark ? 'logo-icon logo-icon--mark' : 'logo-icon'}>
                {logoIconSrc ? (
                  <img className="logo-icon__img" src={logoIconSrc} alt="Brand icon" loading="lazy" decoding="async" />
                ) : hs.logoSvg.trim().startsWith('<svg') ? (
                  <span className="logo-icon__svg" aria-hidden dangerouslySetInnerHTML={{ __html: hs.logoSvg }} />
                ) : (
                  <AgroCloudMark size={22} className="logo-icon__mark" title="AgroCloud" />
                )}
              </span>
            ) : null}
            {hs.showLogoText ? <span className="logo-text">{logoText}</span> : null}
          </div>
        ) : null}
      </div>
      <div className={`header-center${hs.showCenterLogo ? '' : ' header-center--hidden'}`}>
        <img
          className="brand-logo"
          src={centerLogoSrc}
          alt="Elite Agro Projects"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="header-right"></div>
    </header>
  )
}
