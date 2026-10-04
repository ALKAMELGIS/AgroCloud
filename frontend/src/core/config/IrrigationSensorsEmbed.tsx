import {
  IRRIGATION_SENSORS_PAGE_PATH,
  findPageLinkByPath,
  resolveIrrigationSensorsUrl,
} from '../routing/defaultPageLinks'
import { useSystemSettings } from '../state/SystemSettingsContext'
import ExternalEmbeddedPage from '../routing/ExternalEmbeddedPage'

/** Irrigation Sensors — in-app iframe (default: AgSense 365 farm grid). URL from Settings → Pages. */
export default function IrrigationSensorsEmbed() {
  const { settings } = useSystemSettings()
  const pageLink = findPageLinkByPath(settings.customPages, IRRIGATION_SENSORS_PAGE_PATH)
  const url = resolveIrrigationSensorsUrl(settings.customPages)
  const title = pageLink?.name?.trim() || 'Irrigation Sensors'

  return <ExternalEmbeddedPage title={title} externalUrl={url} chromeless />
}
