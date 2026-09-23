import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useLanguage } from '../../lib/i18n'
import {
  GPS_VEHICLE_TRACKING_EMBED_CHANGED_EVENT,
  readGpsVehicleTrackingEmbedSrc,
} from '../../lib/gpsVehicleTrackingStorage'
import { fetchJohnDeereMapEmbedHealth } from '../../lib/johnDeereTrackingApi'
import JohnDeereMapEmbedFrame from '../../components/JohnDeereMapEmbedFrame'
import './sensor-integration.css'
import './gps-in-app-browser.css'

export default function GpsVehicleTracking() {
  const { language } = useLanguage()
  const location = useLocation()
  const [iframeSrc, setIframeSrc] = useState(() => readGpsVehicleTrackingEmbedSrc())
  const [embedReady, setEmbedReady] = useState(true)

  const syncEmbedSrc = useCallback(() => {
    setIframeSrc(readGpsVehicleTrackingEmbedSrc())
  }, [])

  useEffect(() => {
    window.addEventListener(GPS_VEHICLE_TRACKING_EMBED_CHANGED_EVENT, syncEmbedSrc)
    return () => window.removeEventListener(GPS_VEHICLE_TRACKING_EMBED_CHANGED_EVENT, syncEmbedSrc)
  }, [syncEmbedSrc])

  useEffect(() => {
    fetchJohnDeereMapEmbedHealth()
      .then(r => setEmbedReady(Boolean(r.ok)))
      .catch(() => setEmbedReady(false))
  }, [])

  const oauthBanner = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const err = params.get('error')
    const connected = params.get('connected')
    if (language === 'ar') {
      if (err) return `فشل ربط John Deere: ${decodeURIComponent(err)}`
      if (connected === '1') return 'تم ربط John Deere API. سجّل الدخول في الخريطة أدناه لعرض الآليات.'
    } else {
      if (err) return `John Deere link failed: ${decodeURIComponent(err)}`
      if (connected === '1') return 'John Deere API linked. Sign in on the map below to track machines.'
    }
    return null
  }, [language, location.search])

  const iframeTitle =
    language === 'ar' ? 'تتبع مركبات GPS — John Deere' : 'GpsVehicleTracking — iframe'

  const backendHint =
    language === 'ar'
      ? 'خادم AgroCloud (3011) غير متصل — شغّل npm run dev:server:clean ثم حدّث الصفحة.'
      : 'AgroCloud backend (3011) is not reachable — run npm run dev:server:clean and refresh.'

  return (
    <main className="sensor-shell gps-in-app-browser" aria-label={iframeTitle}>
      {!embedReady ? (
        <p className="gps-in-app-browser__hint gps-in-app-browser__hint--alert" role="alert">
          {backendHint}{' '}
          <Link to="/master/dashboard-settings">{language === 'ar' ? 'الإعدادات' : 'Settings'}</Link>
        </p>
      ) : null}
      {oauthBanner ? (
        <p className="gps-in-app-browser__hint" role="status">
          {oauthBanner}
        </p>
      ) : null}
      <JohnDeereMapEmbedFrame iframeSrc={iframeSrc} iframeTitle={iframeTitle} />
    </main>
  )
}
