import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '../../lib/i18n'
import JohnDeereMapEmbedFrame from '../../components/JohnDeereMapEmbedFrame'
import {
  GPS_VEHICLE_TRACKING_EMBED_CHANGED_EVENT,
  readJohnDeereTrackingEmbedSrc,
} from '../../lib/gpsVehicleTrackingStorage'
import '../sensors/sensor-integration.css'
import '../sensors/gps-in-app-browser.css'
import './john-deere-tracking.css'

/** John Deere map / sign-in — full-page embed (same URL as Dashboard Settings → GPS Vehicle Tracking). */
export default function JohnDeereTracking() {
  const { language } = useLanguage()
  const [iframeSrc, setIframeSrc] = useState(() => readJohnDeereTrackingEmbedSrc())

  const syncEmbedSrc = useCallback(() => {
    setIframeSrc(readJohnDeereTrackingEmbedSrc())
  }, [])

  useEffect(() => {
    window.addEventListener(GPS_VEHICLE_TRACKING_EMBED_CHANGED_EVENT, syncEmbedSrc)
    return () => window.removeEventListener(GPS_VEHICLE_TRACKING_EMBED_CHANGED_EVENT, syncEmbedSrc)
  }, [syncEmbedSrc])

  const iframeTitle =
    language === 'ar' ? 'تتبع John Deere — الخريطة' : 'John Deere Tracking — map'

  return (
    <main className="sensor-shell gps-in-app-browser john-deere-tracking-page" aria-label={iframeTitle}>
      <JohnDeereMapEmbedFrame iframeSrc={iframeSrc} iframeTitle={iframeTitle} />
    </main>
  )
}
