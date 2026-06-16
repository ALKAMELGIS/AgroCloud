import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../../lib/i18n'
import {
  AGRO_CLOUD_EMBED_CHANGED_EVENT,
  readAgroCloudDashboardUrl,
} from '../../lib/agroCloudDashboardStorage'
import './AgroCloudDashboard.css'

/** Inline iframe when “pin dashboard” is off — remounts when leaving the route. */
export default function AgroCloudDashboardFrame() {
  const { language } = useLanguage()
  const [embedUrl, setEmbedUrl] = useState(readAgroCloudDashboardUrl)

  useEffect(() => {
    const sync = () => setEmbedUrl(readAgroCloudDashboardUrl())
    window.addEventListener(AGRO_CLOUD_EMBED_CHANGED_EVENT, sync)
    return () => window.removeEventListener(AGRO_CLOUD_EMBED_CHANGED_EVENT, sync)
  }, [])

  const copy = useMemo(
    () =>
      language === 'ar'
        ? {
            title: 'لوحة Agro Cloud',
            invalid: 'الرابط غير صالح (استخدم http/https)',
          }
        : {
            title: 'Agro Cloud Dashboard',
            invalid: 'Invalid URL — use https://…',
          },
    [language],
  )

  const iframeSrc = embedUrl

  return (
    <div className="page page-tight agro-cloud-page">
      <div className="agro-cloud-frame-wrap">
        {iframeSrc ? (
          <iframe title={copy.title} src={iframeSrc} allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <div className="agro-cloud-error">{copy.invalid}</div>
        )}
      </div>
    </div>
  )
}
