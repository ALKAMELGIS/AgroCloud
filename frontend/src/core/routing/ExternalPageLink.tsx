import { useMemo } from 'react'
import { useLanguage } from '../localization/i18n'
import { resolveEmbeddedIframeSrc } from './embeddedIframeSrc'
import '@/modules/dashboards/management/AgroCloudDashboard.css'
import '@/modules/operations/other/sensors/gps-in-app-browser.css'
import './external-page-link.css'

type ExternalPageLinkProps = {
  url: string
  title?: string
  /** Full-bleed iframe inside the app shell (no URL toolbar). */
  chromeless?: boolean
}

/**
 * Embedded content inside the AgroCloud shell (Settings → Pages).
 * Loads the external app in a same-shell iframe — not a new browser tab.
 */
export default function ExternalPageLink({ url, title, chromeless = true }: ExternalPageLinkProps) {
  const { language } = useLanguage()
  const lang = language === 'ar' ? 'ar' : 'en'

  const copy = useMemo(
    () =>
      lang === 'ar'
        ? {
            invalid:
              'لم يُضبط رابط صالح. من الإعدادات → Pages افتح Irrigation Sensors وأدخل https://www.agsense365.com/farm/grid ثم احفظ.',
            fallbackTitle: 'محتوى مضمّن',
          }
        : {
            invalid:
              'No valid embed URL. In Settings → Pages set Irrigation Sensors URL to https://www.agsense365.com/farm/grid and save.',
            fallbackTitle: 'Embedded content',
          },
    [lang],
  )

  const iframeSrc = resolveEmbeddedIframeSrc(url)
  const pageTitle = title?.trim() || copy.fallbackTitle

  return (
    <div
      className={[
        'page page-tight agro-cloud-page external-page-link agro-route-fill',
        chromeless && 'external-page-link--chromeless',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="gps-in-app-browser__frame-wrap agro-cloud-frame-wrap external-page-link__frame">
        {iframeSrc ? (
          <iframe
            key={iframeSrc}
            className="embedded-content-frame"
            title={pageTitle}
            src={iframeSrc}
            allowFullScreen
            allow="fullscreen; clipboard-read; clipboard-write; geolocation; microphone; camera; payment *"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="external-page-link__status external-page-link__status--invalid" role="alert">
            <p className="external-page-link__status-text">{copy.invalid}</p>
          </div>
        )}
      </div>
    </div>
  )
}
