export type WeatherMapSourceTab = 'map' | 'windy'

const TABS: { id: WeatherMapSourceTab; label: string; shortLabel: string }[] = [
  { id: 'map', label: 'AgroCloud map', shortLabel: 'Map' },
  { id: 'windy', label: 'Windy (ECMWF)', shortLabel: 'Windy' },
]

type Props = {
  value: WeatherMapSourceTab
  onChange: (tab: WeatherMapSourceTab) => void
}

export function WeatherMapSourceTabs({ value, onChange }: Props) {
  return (
    <nav className="weather-map-source-tabs" aria-label="Map source">
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          className={`weather-map-source-tabs__btn${value === t.id ? ' is-active' : ''}`}
          aria-current={value === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
          title={t.label}
        >
          <span className="weather-map-source-tabs__label weather-map-source-tabs__label--long">
            {t.label}
          </span>
          <span className="weather-map-source-tabs__label weather-map-source-tabs__label--short" aria-hidden>
            {t.shortLabel}
          </span>
        </button>
      ))}
    </nav>
  )
}
