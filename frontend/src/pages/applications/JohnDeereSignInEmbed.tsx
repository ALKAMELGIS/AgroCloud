import { useCallback, useMemo } from 'react'
import { useLanguage } from '../../lib/i18n'
import { useSystemSettings } from '../../store/SystemSettingsContext'
import { readJohnDeereSignInEmbedSrc } from '../../lib/johnDeereSignInEmbed'
import '../sensors/sensor-integration.css'
import '../sensors/gps-in-app-browser.css'
import './john-deere-sign-in-embed.css'

/** John Deere Okta sign-in — in-app iframe (separate from map / GPS tracking). */
export default function JohnDeereSignInEmbed() {
  const { language } = useLanguage()
  const { settings } = useSystemSettings()

  const iframeSrc = useMemo(
    () => readJohnDeereSignInEmbedSrc(settings.customPages),
    [settings.customPages],
  )

  const iframeTitle =
    language === 'ar' ? 'تسجيل دخول John Deere' : 'John Deere Sign-In'

  const openInPage = useCallback(() => {
    window.location.assign(iframeSrc)
  }, [iframeSrc])

  const hint =
    language === 'ar'
      ? 'إن ظهرت صفحة فارغة أو «Contact Us» فقط، افتح تسجيل الدخول في نفس التبويب (مطلوب للكوكيز).'
      : 'If you only see a blank page or “Contact Us”, open sign-in in this tab (cookies).'

  const openLabel = language === 'ar' ? 'فتح تسجيل الدخول' : 'Open sign-in'

  return (
    <main
      className="sensor-shell gps-in-app-browser john-deere-sign-in-embed-page"
      aria-label={iframeTitle}
    >
      <div className="gps-in-app-browser__frame-wrap">
        <iframe
          key={iframeSrc}
          title={iframeTitle}
          src={iframeSrc}
          allow="storage-access *; geolocation; clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <p className="gps-in-app-browser__hint john-deere-signin-fallback">
        {hint}{' '}
        <button type="button" className="john-deere-signin-fallback__btn" onClick={openInPage}>
          {openLabel}
        </button>
      </p>
    </main>
  )
}
