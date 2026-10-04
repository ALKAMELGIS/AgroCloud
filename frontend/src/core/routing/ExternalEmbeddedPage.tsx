import { sanitizeExternalUrl } from '@/core/services/settingsStorage'
import ExternalPageLink from './ExternalPageLink'
import '@/modules/operations/other/sensors/gps-in-app-browser.css'

type Props = {
  title: string
  externalUrl?: string
  /** Hide URL toolbar (e.g. Irrigation Sensors home card). */
  chromeless?: boolean
}

/** Settings → Pages route: full-height in-app iframe. */
export default function ExternalEmbeddedPage({ title, externalUrl, chromeless = true }: Props) {
  const url = sanitizeExternalUrl(externalUrl)

  return (
    <main className="sensor-shell gps-in-app-browser external-embed-shell" aria-label={title}>
      <ExternalPageLink url={url} title={title} chromeless={chromeless} />
    </main>
  )
}
