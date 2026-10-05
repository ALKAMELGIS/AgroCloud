import {
  GPS_VEHICLE_TRACKING_PAGE_PATH,
  findPageLinkByPath,
  resolveGpsVehicleTrackingUrl,
} from '@/core/routing/defaultPageLinks'
import { useSystemSettings } from '@/core/state/SystemSettingsContext'
import ExternalEmbeddedPage from '@/core/routing/ExternalEmbeddedPage'

/** GPS Vehicle Tracking — John Deere map login (iframe). URL from Settings → Pages. */
export default function GpsVehicleTracking() {
  const { settings } = useSystemSettings()
  const pageLink = findPageLinkByPath(settings.customPages, GPS_VEHICLE_TRACKING_PAGE_PATH)
  const url = resolveGpsVehicleTrackingUrl(settings.customPages)
  const title = pageLink?.name?.trim() || 'GPS Vehicle Tracking'

  return <ExternalEmbeddedPage title={title} externalUrl={url} chromeless />
}
