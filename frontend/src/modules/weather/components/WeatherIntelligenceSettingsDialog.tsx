import { useEffect, useState } from 'react'
import {
  DEFAULT_WEATHER_OPERATIONS_THRESHOLDS,
  saveWeatherOperationsThresholds,
  type WeatherOperationsThresholds,
} from '../config/weatherThresholds'
import {
  WEATHER_ARCGIS_DATA_LAYER_GROUPS,
  WEATHER_ARCGIS_DATA_LAYERS,
} from '../config/weatherArcgisDataLayers'
import {
  patchWeatherArcgisDataLayerPref,
  saveWeatherArcgisDataLayerPrefs,
  type WeatherArcgisDataLayerPrefs,
} from '../config/weatherArcgisDataLayerPrefs'

type SettingsSection = 'alerts' | 'data-layers'

type Props = {
  open: boolean
  thresholds: WeatherOperationsThresholds
  arcgisDataLayerPrefs: WeatherArcgisDataLayerPrefs
  onClose: () => void
  onSaveThresholds: (t: WeatherOperationsThresholds) => void
  onSaveArcgisDataLayers: (prefs: WeatherArcgisDataLayerPrefs) => void
}

export function WeatherIntelligenceSettingsDialog({
  open,
  thresholds,
  arcgisDataLayerPrefs,
  onClose,
  onSaveThresholds,
  onSaveArcgisDataLayers,
}: Props) {
  const [section, setSection] = useState<SettingsSection>('data-layers')
  const [thresholdDraft, setThresholdDraft] = useState(thresholds)
  const [layerDraft, setLayerDraft] = useState(arcgisDataLayerPrefs)

  useEffect(() => {
    if (!open) return
    setThresholdDraft(thresholds)
    setLayerDraft(arcgisDataLayerPrefs)
  }, [open, thresholds, arcgisDataLayerPrefs])

  if (!open) return null

  const saveAll = () => {
    saveWeatherOperationsThresholds(thresholdDraft)
    onSaveThresholds(thresholdDraft)
    saveWeatherArcgisDataLayerPrefs(layerDraft)
    onSaveArcgisDataLayers(layerDraft)
    onClose()
  }

  return (
    <div className="weather-thresholds-dialog" role="dialog" aria-label="Weather dashboard settings">
      <div className="weather-settings-dialog__panel">
        <header className="weather-settings-dialog__head">
          <h2>Settings</h2>
          <button type="button" className="weather-settings-dialog__close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <nav className="weather-settings-dialog__nav" aria-label="Settings sections">
          <button
            type="button"
            className={`weather-settings-dialog__nav-btn${section === 'data-layers' ? ' is-active' : ''}`}
            onClick={() => setSection('data-layers')}
          >
            Data
          </button>
          <button
            type="button"
            className={`weather-settings-dialog__nav-btn${section === 'alerts' ? ' is-active' : ''}`}
            onClick={() => setSection('alerts')}
          >
            Alerts
          </button>
        </nav>

        {section === 'data-layers' ? (
          <div className="weather-settings-dialog__body">
            <p className="weather-settings-dialog__intro">
              <strong>Data → Layers</strong> — choose layers from the header <strong>Display</strong> menu (each
              layer by name). Adjust opacity here for ArcGIS overlays when they are active.
            </p>
            {WEATHER_ARCGIS_DATA_LAYER_GROUPS.map(group => {
              const layers = WEATHER_ARCGIS_DATA_LAYERS.filter(l => l.group === group.id)
              if (!layers.length) return null
              return (
                <section key={group.id} className="weather-settings-dialog__layer-group">
                  <h3 className="weather-settings-dialog__layer-group-title">{group.label}</h3>
                  <ul className="weather-settings-dialog__layer-list">
                    {layers.map(layer => {
                      const pref = layerDraft[layer.id]
                      return (
                        <li key={layer.id} className="weather-settings-dialog__layer-row">
                          <span className="weather-settings-dialog__layer-label">
                            {layer.label}
                            {layer.hotspot ? (
                              <span className="weather-settings-dialog__hotspot">Hot spot</span>
                            ) : null}
                          </span>
                          <label className="weather-settings-dialog__opacity">
                            <span>Opacity</span>
                            <input
                              type="range"
                              min={0.1}
                              max={1}
                              step={0.05}
                              value={pref.opacity}
                              onChange={e =>
                                setLayerDraft(prev =>
                                  patchWeatherArcgisDataLayerPref(prev, layer.id, {
                                    opacity: Number(e.target.value),
                                  }),
                                )
                              }
                            />
                          </label>
                          <p className="weather-settings-dialog__layer-desc">{layer.description}</p>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="weather-settings-dialog__body">
            <h3 className="weather-settings-dialog__layer-group-title">Operational thresholds</h3>
            <p className="weather-side__disclaimer">Stored locally until System Settings section is saved.</p>
            {(
              [
                ['windSprayWarningKmh', 'Spray warning wind (km/h)'],
                ['windSprayCautionKmh', 'Spray caution wind (km/h)'],
                ['heatStressC', 'Heat stress (°C)'],
                ['frostC', 'Frost (°C)'],
                ['highWindAlertKmh', 'High wind alert (km/h)'],
                ['heavyRainMm6h', 'Heavy rain 6h (mm)'],
                ['highHumidityPct', 'High humidity (%)'],
                ['lowHumidityPct', 'Low humidity (%)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="weather-thresholds-dialog__row">
                <span>{label}</span>
                <input
                  type="number"
                  value={thresholdDraft[key]}
                  onChange={e => setThresholdDraft(d => ({ ...d, [key]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
        )}

        <div className="weather-thresholds-dialog__actions">
          {section === 'alerts' ? (
            <button type="button" onClick={() => setThresholdDraft(DEFAULT_WEATHER_OPERATIONS_THRESHOLDS)}>
              Reset alerts
            </button>
          ) : null}
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={saveAll}>Save</button>
        </div>
      </div>
    </div>
  )
}
