import { useCallback, useMemo } from 'react'
import { useAcpPlatform } from '../acpPlatformContext'
import type { AcpFieldWeatherLayerEntry } from './acpWeatherAlertLayerModel'
import { resolveAcpWeatherTickerScrollDurationS } from './acpWeatherAlertTickerModel'
import { useAcpWeatherFieldData } from './AcpWeatherFieldProvider'

function formatTemp(snapshot: AcpFieldWeatherLayerEntry['snapshot']): string {
  return snapshot.temperatureC != null && Number.isFinite(snapshot.temperatureC)
    ? `${Math.round(snapshot.temperatureC)}°C`
    : '—'
}

function TickerFieldBlock({
  entry,
  onFocusField,
}: {
  entry: AcpFieldWeatherLayerEntry
  onFocusField: (entry: AcpFieldWeatherLayerEntry) => void
}) {
  const { snapshot, displayName, country, level } = entry
  const rain =
    snapshot.precipMm != null && Number.isFinite(snapshot.precipMm)
      ? `${snapshot.precipMm.toFixed(1)} mm`
      : '—'
  const rh =
    snapshot.humidityPct != null && Number.isFinite(snapshot.humidityPct)
      ? `${Math.round(snapshot.humidityPct)}%`
      : '—'
  const wind =
    snapshot.windSpeedKmh != null && Number.isFinite(snapshot.windSpeedKmh)
      ? `${Math.round(snapshot.windSpeedKmh)} km/h ${snapshot.windDirectionLabel}`
      : '—'
  const alertActive = level !== 'none'

  return (
    <button
      type="button"
      className={[
        'acp-weather-ticker__item',
        alertActive ? `acp-weather-ticker__item--${level}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onFocusField(entry)}
      title={`Focus ${displayName} on map`}
      aria-label={`${displayName}, ${country}, ${formatTemp(snapshot)}, focus on map`}
    >
      {alertActive ? (
        <span className={`acp-weather-ticker__alert acp-weather-ticker__alert--${level}`}>
          ALERT
        </span>
      ) : null}
      <strong className="acp-weather-ticker__field-name">{displayName}</strong>
      <span className="acp-weather-ticker__dot" aria-hidden>
        ·
      </span>
      <span className="acp-weather-ticker__country">{country}</span>
      <span className="acp-weather-ticker__dot" aria-hidden>
        ·
      </span>
      <i className={`acp-weather-ticker__wx-icon ${entry.weatherIconClass}`} aria-hidden />
      <span className="acp-weather-ticker__temp">{formatTemp(snapshot)}</span>
      <span className="acp-weather-ticker__dot" aria-hidden>
        ·
      </span>
      <span>Rain {rain}</span>
      <span className="acp-weather-ticker__dot" aria-hidden>
        ·
      </span>
      <span>RH {rh}</span>
      <span className="acp-weather-ticker__dot" aria-hidden>
        ·
      </span>
      <span>Wind {wind}</span>
    </button>
  )
}

function TickerTrack({
  entries,
  onFocusField,
  durationS,
  duplicate,
}: {
  entries: AcpFieldWeatherLayerEntry[]
  onFocusField: (entry: AcpFieldWeatherLayerEntry) => void
  durationS: number
  duplicate?: boolean
}) {
  const list = duplicate ? [...entries, ...entries] : entries

  return (
    <div
      className={`acp-weather-ticker__track${duplicate ? ' acp-weather-ticker__track--loop' : ''}`}
      style={{ ['--acp-ticker-duration' as string]: `${durationS}s` }}
    >
      {list.map((entry, index) => (
        <span key={`${entry.fieldKey}-${duplicate ? 'dup' : 'once'}-${index}`} className="acp-weather-ticker__group">
          <TickerFieldBlock entry={entry} onFocusField={onFocusField} />
          {index < list.length - 1 ? (
            <span className="acp-weather-ticker__field-separator" aria-hidden>
              ◆
            </span>
          ) : null}
        </span>
      ))}
    </div>
  )
}

export function AcpWeatherAlertTicker() {
  const acp = useAcpPlatform()
  const { fields, entries, error } = useAcpWeatherFieldData()

  const scrollDurationS = useMemo(
    () => resolveAcpWeatherTickerScrollDurationS(entries.length),
    [entries.length],
  )

  const focusFieldOnMap = useCallback(
    (entry: AcpFieldWeatherLayerEntry) => {
      acp.requestFieldLocate(entry.fieldKey)
      acp.setWeatherTickerFocusFieldKey(entry.fieldKey)
    },
    [acp],
  )

  if (!fields.length) return null

  if (!entries.length) {
    if (!error) return null
    return (
      <div className="acp-weather-ticker" role="status" aria-live="polite">
        <span className="acp-weather-ticker__badge">
          <i className="fa-solid fa-cloud-bolt" aria-hidden />
          Alert Weather
        </span>
        <div className="acp-weather-ticker__viewport">
          <p className="acp-weather-ticker__fallback">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="acp-weather-ticker" role="region" aria-label="Weather alert ticker">
      <span className="acp-weather-ticker__badge">
        <i className="fa-solid fa-cloud-bolt" aria-hidden />
        Alert Weather
      </span>
      <div className="acp-weather-ticker__viewport">
        <TickerTrack
          entries={entries}
          onFocusField={focusFieldOnMap}
          durationS={scrollDurationS}
          duplicate
        />
      </div>
    </div>
  )
}
