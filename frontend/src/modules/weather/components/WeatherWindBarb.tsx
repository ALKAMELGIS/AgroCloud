import { windDirectionLabel } from '@/modules/remote-sensing/weather/openMeteoWeather'

export const WEATHER_ARCGIS_WIND_BARB_SIZE = 44

type Props = {
  directionDeg: number | null | undefined
  size?: number
  className?: string
  strokeWidth?: number
  /** ArcGIS dashboard: larger stroke + station circle. */
  variant?: 'default' | 'arcgis'
}

/** Meteorological wind barb (points where wind blows from). */
export function WeatherWindBarb({
  directionDeg,
  size,
  className = '',
  strokeWidth,
  variant = 'default',
}: Props) {
  const isArcgis = variant === 'arcgis' || className.includes('arcgis')
  const resolvedSize = size ?? (isArcgis ? WEATHER_ARCGIS_WIND_BARB_SIZE : 22)
  const resolvedStroke = strokeWidth ?? (isArcgis ? 3.35 : 1.5)
  const deg = directionDeg != null && Number.isFinite(directionDeg) ? directionDeg : null
  const rot = deg != null ? deg : 0
  const cap = { strokeLinecap: 'butt' as const }
  return (
    <span
      className={`weather-wind-barb${isArcgis ? ' weather-wind-barb--arcgis' : ''}${className ? ` ${className}` : ''}`}
      title={deg != null ? `Wind from ${windDirectionLabel(deg)} (${Math.round(deg)}°)` : 'Wind direction unknown'}
      aria-hidden
    >
      <svg
        width={resolvedSize}
        height={resolvedSize}
        viewBox="0 0 24 24"
        style={{ transform: `rotate(${rot}deg)` }}
      >
        {isArcgis ? (
          <>
            <circle
              cx="12"
              cy="5.75"
              r="2.55"
              fill="none"
              stroke="currentColor"
              strokeWidth={resolvedStroke}
              strokeLinecap="round"
            />
            <line
              x1="12"
              y1="8.75"
              x2="12"
              y2="20.25"
              stroke="currentColor"
              strokeWidth={resolvedStroke}
              {...cap}
            />
            <line
              x1="12"
              y1="19.25"
              x2="16.1"
              y2="15.15"
              stroke="currentColor"
              strokeWidth={resolvedStroke}
              {...cap}
            />
          </>
        ) : (
          <>
            <line x1="12" y1="20" x2="12" y2="6" stroke="currentColor" strokeWidth={resolvedStroke} {...cap} />
            <line x1="12" y1="6" x2="16" y2="10" stroke="currentColor" strokeWidth={resolvedStroke} {...cap} />
            <line
              x1="12"
              y1="9"
              x2="15"
              y2="12"
              stroke="currentColor"
              strokeWidth={resolvedStroke * 0.85}
              {...cap}
            />
          </>
        )}
      </svg>
    </span>
  )
}

export function kmhToKnots(kmh: number | null | undefined): number | null {
  if (kmh == null || !Number.isFinite(kmh)) return null
  return kmh / 1.852
}
