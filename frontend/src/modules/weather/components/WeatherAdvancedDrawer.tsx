import { Suspense, lazy, useState } from 'react'
import { ResponsiveDrawer } from '@/components/overlays/ResponsiveDrawer'
import type { WeatherLocation } from '@/modules/remote-sensing/weather/WeatherIntelligencePanel'

const WeatherIntelligencePanel = lazy(() =>
  import('@/modules/remote-sensing/weather/WeatherIntelligencePanel').then(m => ({
    default: m.WeatherIntelligencePanel,
  })),
)

type Props = {
  open: boolean
  onClose: () => void
  location: WeatherLocation
  onLocationChange: (loc: WeatherLocation) => void
}

export function WeatherAdvancedDrawer({ open, onClose, location, onLocationChange }: Props) {
  const [mapPickActive, setMapPickActive] = useState(false)

  return (
    <ResponsiveDrawer open={open} onClose={onClose} anchor="bottom">
      <div className="weather-advanced-drawer">
        <header className="weather-advanced-drawer__head">
          <h2>Advanced climate &amp; reports</h2>
          <p>Historical archive and exports — not live forecast.</p>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <Suspense fallback={<p>Loading weather tools…</p>}>
          <WeatherIntelligencePanel
            open={open}
            onClose={onClose}
            location={location}
            onLocationChange={onLocationChange}
            mapPickActive={mapPickActive}
            onMapPickToggle={setMapPickActive}
            layout="acp-compact"
          />
        </Suspense>
      </div>
    </ResponsiveDrawer>
  )
}
