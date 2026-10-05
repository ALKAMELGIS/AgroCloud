import { useState } from 'react'
import {
  DEFAULT_WEATHER_OPERATIONS_THRESHOLDS,
  saveWeatherOperationsThresholds,
  type WeatherOperationsThresholds,
} from '../config/weatherThresholds'

type Props = {
  open: boolean
  thresholds: WeatherOperationsThresholds
  onClose: () => void
  onSave: (t: WeatherOperationsThresholds) => void
}

export function WeatherThresholdsDialog({ open, thresholds, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(thresholds)

  if (!open) return null

  return (
    <div className="weather-thresholds-dialog" role="dialog" aria-label="Weather operational thresholds">
      <div className="weather-thresholds-dialog__panel">
        <h2>Operational thresholds</h2>
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
              value={draft[key]}
              onChange={e => setDraft(d => ({ ...d, [key]: Number(e.target.value) }))}
            />
          </label>
        ))}
        <div className="weather-thresholds-dialog__actions">
          <button type="button" onClick={() => setDraft(DEFAULT_WEATHER_OPERATIONS_THRESHOLDS)}>Reset</button>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            onClick={() => {
              saveWeatherOperationsThresholds(draft)
              onSave(draft)
              onClose()
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
