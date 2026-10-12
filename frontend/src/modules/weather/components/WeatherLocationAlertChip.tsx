import { useMemo } from 'react'
import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'
import { resolveWeatherLocationAlert } from '../insights/buildWeatherLocationAlert'

type Props = {
  row: WeatherLocationRow
  /** Compact: emoji only (map-style). Table: emoji + short label. */
  variant?: 'compact' | 'inline'
  className?: string
}

export function WeatherLocationAlertChip({ row, variant = 'inline', className }: Props) {
  const alert = useMemo(() => resolveWeatherLocationAlert(row), [row])

  if (!alert) return null

  return (
    <span
      className={[
        'weather-loc-alert',
        `weather-loc-alert--${alert.severity}`,
        `weather-loc-alert--${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title={alert.title}
      aria-label={alert.title}
    >
      <span
        className={`weather-loc-alert__emoji weather-loc-marker__emoji--${alert.anim}`}
        aria-hidden
      >
        {alert.emoji}
      </span>
      {variant === 'inline' ? (
        <span className="weather-loc-alert__label">{alert.shortLabel}</span>
      ) : null}
    </span>
  )
}
