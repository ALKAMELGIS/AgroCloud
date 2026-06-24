import { useMemo } from 'react'
import { useLanguage } from '../../lib/i18n'
import '../../pages/dashboards/AgroCloudDashboard.css'

type ExternalPageLinkProps = {
  url: string
  title?: string
}

/** Full-height iframe for external apps linked from System Settings page links. */
export default function ExternalPageLink({ url, title }: ExternalPageLinkProps) {
  const { language } = useLanguage()
  const copy = useMemo(
    () =>
      language === 'ar'
        ? {
            invalid: 'الرابط غير صالح (استخدم http/https)',
            fallbackTitle: 'رابط خارجي',
          }
        : {
            invalid: 'Invalid URL — use https://…',
            fallbackTitle: 'External link',
          },
    [language],
  )

  const iframeSrc = url.trim()

  return (
    <div className="page page-tight agro-cloud-page">
      <div className="agro-cloud-frame-wrap">
        {iframeSrc ? (
          <iframe
            title={title?.trim() || copy.fallbackTitle}
            src={iframeSrc}
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="agro-cloud-error">{copy.invalid}</div>
        )}
      </div>
    </div>
  )
}
