export type WeatherArcgisFooterTab = 'current' | 'hourly' | 'tabled'

const TABS: { id: WeatherArcgisFooterTab; label: string }[] = [
  { id: 'current', label: 'Current Forecast' },
  { id: 'hourly', label: 'Hourly Forecast' },
  { id: 'tabled', label: 'Tabled Hourly Forecast' },
]

type Props = {
  value: WeatherArcgisFooterTab
  onChange: (tab: WeatherArcgisFooterTab) => void
}

export function WeatherArcgisFooterNav({ value, onChange }: Props) {
  return (
    <nav className="weather-arcgis-footer-nav" aria-label="Forecast views">
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          className={`weather-arcgis-footer-nav__btn${value === t.id ? ' is-active' : ''}`}
          aria-current={value === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
