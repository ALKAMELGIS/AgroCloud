import { memo, useMemo, type CSSProperties } from 'react'
import { wmoWeatherIconClass } from '../../../../lib/openMeteoWeather'
import type { AcpFieldWeatherLayerEntry } from './acpWeatherAlertLayerModel'
import { ACP_WEATHER_LEVEL_COLORS } from './acpWeatherAlertLayerModel'
import { resolveAcpWeatherMarkerVisual } from './acpWeatherMarkerVisual'
import './AcpWeatherAlertMarker.css'

export type AcpWeatherAlertPopupProps = {
  entry: AcpFieldWeatherLayerEntry
  onClose: () => void
}

export function AcpWeatherAlertPopup({ entry, onClose }: AcpWeatherAlertPopupProps) {
  const { snapshot, displayName, country, level, levelLabel, alertTypes } = entry
  const levelColor = ACP_WEATHER_LEVEL_COLORS[level === 'none' ? 'yellow' : level]

  return (
    <div className="acp-weather-popup" role="dialog" aria-label={`Weather alert for ${displayName}`}>
      <div className="acp-weather-popup__header">
        <div>
          <strong>{displayName}</strong>
          <span className="acp-weather-popup__country">{country}</span>
        </div>
        <button type="button" className="acp-weather-popup__close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>
      <div
        className="acp-weather-popup__level"
        style={{ '--acp-weather-level': levelColor } as CSSProperties}
      >
        {levelLabel}
      </div>
      <ul className="acp-weather-popup__alerts">
        {alertTypes.map(alert => (
          <li key={`${alert.type}-${alert.label}`}>
            <i className={alert.iconClass} aria-hidden />
            <span>{alert.label}</span>
          </li>
        ))}
      </ul>
      <dl className="acp-weather-popup__metrics">
        <div>
          <dt>Temp</dt>
          <dd>{snapshot.temperatureC != null ? `${Math.round(snapshot.temperatureC)}°C` : '—'}</dd>
        </div>
        <div>
          <dt>Rain</dt>
          <dd>{snapshot.precipMm != null ? `${snapshot.precipMm.toFixed(1)} mm` : '—'}</dd>
        </div>
        <div>
          <dt>Humidity</dt>
          <dd>{snapshot.humidityPct != null ? `${Math.round(snapshot.humidityPct)}%` : '—'}</dd>
        </div>
        <div>
          <dt>Wind</dt>
          <dd>
            {snapshot.windSpeedKmh != null
              ? `${Math.round(snapshot.windSpeedKmh)} km/h ${snapshot.windDirectionLabel}`
              : '—'}
          </dd>
        </div>
      </dl>
      <p className="acp-weather-popup__condition">
        <i className={wmoWeatherIconClass(snapshot.weatherCode)} aria-hidden />
        {snapshot.conditionLabel}
      </p>
    </div>
  )
}

export type AcpWeatherAlertMarkerProps = {
  entry: AcpFieldWeatherLayerEntry
  selected: boolean
  popupOpen?: boolean
  dimmed?: boolean
  onSelect: (fieldKey: string) => void
  onClosePopup?: () => void
}

export const AcpWeatherAlertMarker = memo(function AcpWeatherAlertMarker({
  entry,
  selected,
  popupOpen = false,
  dimmed = false,
  onSelect,
  onClosePopup,
}: AcpWeatherAlertMarkerProps) {
  const level = entry.level === 'none' ? 'yellow' : entry.level
  const visual = useMemo(() => resolveAcpWeatherMarkerVisual(entry.snapshot), [entry.snapshot])

  return (
    <div
      className={[
        'acp-weather-marker-root',
        popupOpen ? 'acp-weather-marker-root--popup-open' : '',
        dimmed ? 'acp-weather-marker-root--dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="acp-weather-marker-root__column">
        {popupOpen && onClosePopup ? (
          <AcpWeatherAlertPopup entry={entry} onClose={onClosePopup} />
        ) : null}
        <button
          type="button"
          className={[
            'acp-weather-marker',
            visual.conditionClass,
            entry.level !== 'none' ? `acp-weather-marker--${level}` : '',
            selected ? 'acp-weather-marker--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={`${entry.displayName}: ${visual.temperatureLabel} · ${entry.snapshot.conditionLabel}`}
          aria-label={`${entry.displayName}: ${visual.ariaLabel}`}
          onClick={e => {
            e.stopPropagation()
            onSelect(entry.fieldKey)
          }}
        >
          <i className={`acp-weather-marker__icon ${visual.iconClass}`} aria-hidden />
          <span className="acp-weather-marker__temp">{visual.temperatureLabel}</span>
        </button>
      </div>
    </div>
  )
})
