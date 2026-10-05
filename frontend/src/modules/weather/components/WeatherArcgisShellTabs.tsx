export type WeatherArcgisShellView = 'map' | 'locations' | 'charts'

const TABS: { id: WeatherArcgisShellView; label: string; icon: string }[] = [
  { id: 'map', label: 'Map', icon: 'fa-solid fa-map' },
  { id: 'charts', label: 'Charts', icon: 'fa-solid fa-chart-line' },
  { id: 'locations', label: 'Locations', icon: 'fa-solid fa-location-dot' },
]

type Props = {
  value: WeatherArcgisShellView
  onChange: (view: WeatherArcgisShellView) => void
}

export function WeatherArcgisShellTabs({ value, onChange }: Props) {
  return (
    <nav className="weather-arcgis-shell-tabs" aria-label="Dashboard panels">
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          className={`weather-arcgis-shell-tabs__btn${value === t.id ? ' is-active' : ''}`}
          aria-current={value === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <i className={t.icon} aria-hidden />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
