import './header.css'
import './lux-theme.css'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AgroCloudMark } from './AgroCloudMark'
import { ELITE_AGRO_LOGO_WHITE_URL, ELITE_AGROCLOUD_SITE_URL, resolveEliteAgroLogoUrl } from '../lib/brandAssets'
import { normalizeHeaderLogoText } from '../services/settingsStorage'
import { useSystemSettings } from '../store/SystemSettingsContext'
import { useLanguage } from '../lib/i18n'

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

  const isDarkTheme = useMemo(() => {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
    return settings.themeMode === 'dark' || (settings.themeMode === 'system' && prefersDark)
  }, [settings.themeMode])

  const centerLogoSrc = useMemo(() => {
    let raw = ELITE_AGRO_LOGO_WHITE_URL
    if (isDarkTheme && settings.logoDark.trim()) raw = settings.logoDark.trim()
    else if (!isDarkTheme && settings.logoLight.trim()) raw = settings.logoLight.trim()
    else raw = settings.logoLight.trim() || settings.logoDark.trim() || ELITE_AGRO_LOGO_WHITE_URL
    return resolveEliteAgroLogoUrl(raw)
  }, [isDarkTheme, settings.logoLight, settings.logoDark])

  const [logoSrc, setLogoSrc] = useState(centerLogoSrc)
  useEffect(() => {
    setLogoSrc(centerLogoSrc)
  }, [centerLogoSrc])

  const centerLogoIsWhite =
    /white|light|elite-agro-logo/i.test(centerLogoSrc) || centerLogoSrc === ELITE_AGRO_LOGO_WHITE_URL
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
        <a
          className={`header-center__logo${!isDarkTheme && centerLogoIsWhite ? ' header-center__logo--invert' : ''}`}
          href={ELITE_AGROCLOUD_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={ELITE_AGROCLOUD_SITE_URL}
          aria-label={`Elite AgroCloud — ${ELITE_AGROCLOUD_SITE_URL}`}
        >
          <img
            className="brand-logo"
            src={logoSrc}
            alt="Elite AgroCloud"
            width={300}
            height={48}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            draggable={false}
            onError={() => {
              if (logoSrc !== ELITE_AGRO_LOGO_WHITE_URL) setLogoSrc(ELITE_AGRO_LOGO_WHITE_URL)
            }}
          />
        </a>
      </div>
      <div className="header-right"></div>
    </header>
  )
}
