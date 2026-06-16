import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage } from '../lib/i18n'
import {
  AGRO_CLOUD_EMBED_CHANGED_EVENT,
  readAgroCloudDashboardUrl,
} from '../lib/agroCloudDashboardStorage'
import '../pages/dashboards/AgroCloudDashboard.css'

const AGRO_CLOUD_PATH = '/dashboards/agro-cloud'

/**
 * When “pin dashboard” is enabled: keeps the ArcGIS iframe mounted once visited so navigating away
 * and back does not reload the embedded dashboard.
 */
export default function PersistentAgroCloudEmbed() {
  const location = useLocation()
  const { language } = useLanguage()
  const active = location.pathname === AGRO_CLOUD_PATH
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
    <div
      className={`persistent-agro-cloud-layer ${active ? 'persistent-agro-cloud-layer--active' : ''}`}
      aria-hidden={!active}
    >
      <div className="page page-tight agro-cloud-page persistent-agro-cloud-layer-inner">
        <div className="agro-cloud-frame-wrap">
          {iframeSrc ? (
            <iframe
              title={copy.title}
              src={iframeSrc}
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="agro-cloud-error">{copy.invalid}</div>
          )}
        </div>
      </div>
    </div>
  )
}
