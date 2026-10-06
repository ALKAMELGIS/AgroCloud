export type WeatherArcgisFooterTab = 'current' | 'hourly' | 'tabled'

const TABS: { id: WeatherArcgisFooterTab; label: string; shortLabel: string }[] = [
  { id: 'current', label: 'Current Forecast', shortLabel: 'Current' },
  { id: 'hourly', label: 'Hourly Forecast', shortLabel: 'Hourly' },
  { id: 'tabled', label: 'Tabled Hourly Forecast', shortLabel: 'Table' },
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
          title={t.label}
        >
          <span className="weather-arcgis-footer-nav__label weather-arcgis-footer-nav__label--long">
            {t.label}
          </span>
          <span className="weather-arcgis-footer-nav__label weather-arcgis-footer-nav__label--short" aria-hidden>
            {t.shortLabel}
          </span>
        </button>
      ))}
    </nav>
  )
}
