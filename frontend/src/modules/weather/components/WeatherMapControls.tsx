import { WEATHER_MAP_MODES, type WeatherMapMode } from '../config/weatherMapModes'
import { WEATHER_PRECIP_WINDOWS, WEATHER_VIZ_MODES, type WeatherPrecipWindow, type WeatherVizMode } from '../config/weatherVizModes'
import { WEATHER_MAP_LAYERS, type WeatherMapLayerId } from '../config/weatherLayerCatalog'

type Props = {
  mapMode: WeatherMapMode
  onMapModeChange: (m: WeatherMapMode) => void
  vizMode: WeatherVizMode
  onVizModeChange: (v: WeatherVizMode) => void
  activeLayerId: WeatherMapLayerId
  onLayerChange: (id: WeatherMapLayerId) => void
  precipWindow: WeatherPrecipWindow
  onPrecipWindowChange: (w: WeatherPrecipWindow) => void
  open: boolean
  onClose: () => void
}

export function WeatherMapControls({
  mapMode,
  onMapModeChange,
  vizMode,
  onVizModeChange,
  activeLayerId,
  onLayerChange,
  precipWindow,
  onPrecipWindowChange,
  open,
  onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="weather-layer-manager" role="dialog" aria-label="Layer manager">
      <div className="weather-layer-manager__head">
        <h2>Layers</h2>
        <button type="button" className="weather-layer-manager__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <label className="weather-layer-manager__field">
        Mode
        <select value={mapMode} onChange={e => onMapModeChange(e.target.value as WeatherMapMode)}>
          {WEATHER_MAP_MODES.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>
      <label className="weather-layer-manager__field">
        Viz
        <select
          value={vizMode}
          title={WEATHER_VIZ_MODES.find(v => v.id === vizMode)?.hint ?? ''}
          onChange={e => onVizModeChange(e.target.value as WeatherVizMode)}
        >
          {WEATHER_VIZ_MODES.map(v => (
            <option key={v.id} value={v.id} title={v.hint}>{v.label}</option>
          ))}
        </select>
      </label>
      <label className="weather-layer-manager__field">
        Variable
        <select value={activeLayerId} onChange={e => onLayerChange(e.target.value as WeatherMapLayerId)}>
          {WEATHER_MAP_LAYERS.map(l => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </label>
      <label className="weather-layer-manager__field">
        Precip
        <select value={precipWindow} onChange={e => onPrecipWindowChange(e.target.value as WeatherPrecipWindow)}>
          {WEATHER_PRECIP_WINDOWS.map(w => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
