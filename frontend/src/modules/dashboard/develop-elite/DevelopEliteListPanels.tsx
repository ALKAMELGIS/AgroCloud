import type { Dispatch, SetStateAction } from 'react'
import { developEliteListItemMatchesSearch } from './developEliteListSearch'
import type { useDevelopEliteDashboardData } from './useDevelopEliteDashboardData'

type DashboardData = ReturnType<typeof useDevelopEliteDashboardData>

function developEliteFarmSearchHaystack(item: { title: string; subtitle?: string }) {
  return `${item.title} ${item.subtitle ?? ''}`
}

export type DevelopEliteListPanelTab = 'farms' | 'zones' | 'countries' | 'structures'

type Props = {
  tab: DevelopEliteListPanelTab
  data: DashboardData
  filteredCountries: Array<{ code: string; label: string }>
  filteredZones: Array<{ zoneId: string; label: string }>
  countrySearch: string
  setCountrySearch: Dispatch<SetStateAction<string>>
  zoneSearch: string
  setZoneSearch: Dispatch<SetStateAction<string>>
}

export function DevelopEliteListPanels({
  tab,
  data,
  filteredCountries,
  filteredZones,
  countrySearch,
  setCountrySearch,
  zoneSearch,
  setZoneSearch,
}: Props) {
  if (tab === 'farms') {
    return (
      <div className="develop-elite__panel develop-elite__panel--farms develop-elite-list-panels__section">
        <label className="develop-elite__search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
          <input
            type="search"
            placeholder="Search farms"
            value={data.filters.locationSearch}
            onChange={e => data.setLocationSearch(e.target.value)}
          />
        </label>
        <ul className="develop-elite__list develop-elite__list--scroll">
          {data.farmList.map(item => (
            <li key={item.fieldKey}>
              <button
                type="button"
                className={`develop-elite__list-btn${data.filters.selectedFieldKey === item.fieldKey ? ' is-active' : ''}`}
                onClick={() =>
                  data.selectFarm(data.filters.selectedFieldKey === item.fieldKey ? null : item.fieldKey)
                }
              >
                <span
                  className={`develop-elite__list-title${
                    developEliteListItemMatchesSearch(
                      developEliteFarmSearchHaystack(item),
                      data.filters.locationSearch,
                    )
                      ? ' develop-elite__list-title--search-hit'
                      : ''
                  }`}
                >
                  {item.title}
                </span>
                {item.subtitle ? <span className="develop-elite__list-sub">{item.subtitle}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (tab === 'countries') {
    return (
      <div className="develop-elite__panel develop-elite__panel--countries develop-elite-list-panels__section">
        <label className="develop-elite__search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
          <input
            type="search"
            placeholder="Search countries"
            value={countrySearch}
            onChange={e => setCountrySearch(e.target.value)}
          />
        </label>
        <ul className="develop-elite__list develop-elite__list--scroll">
          <li>
            <button
              type="button"
              className={`develop-elite__list-btn${data.filters.country === 'all' ? ' is-active' : ''}`}
              onClick={() => data.selectCountry('all')}
            >
              All countries
            </button>
          </li>
          {filteredCountries.map(c => (
            <li key={c.code}>
              <button
                type="button"
                className={`develop-elite__list-btn${data.filters.country === c.code ? ' is-active' : ''}`}
                onClick={() => data.selectCountry(c.code)}
              >
                <span
                  className={`develop-elite__list-title${
                    developEliteListItemMatchesSearch(`${c.label} ${c.code}`, countrySearch)
                      ? ' develop-elite__list-title--search-hit'
                      : ''
                  }`}
                >
                  {c.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (tab === 'zones') {
    return (
      <aside className="develop-elite__zones-col develop-elite-list-panels__section" aria-label="Zones">
        <label className="develop-elite__search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
          <input
            type="search"
            placeholder="Search zones"
            value={zoneSearch}
            onChange={e => setZoneSearch(e.target.value)}
          />
        </label>
        <ul className="develop-elite__list develop-elite__list--scroll">
          {filteredZones.map(z => (
            <li key={z.zoneId}>
              <button
                type="button"
                className={`develop-elite__zone-btn${data.filters.zoneId === z.zoneId ? ' is-active' : ''}`}
                onClick={() => data.selectZone(data.filters.zoneId === z.zoneId ? 'all' : z.zoneId)}
              >
                <span
                  className={`develop-elite__list-title${
                    developEliteListItemMatchesSearch(`${z.label} ${z.zoneId}`, zoneSearch)
                      ? ' develop-elite__list-title--search-hit'
                      : ''
                  }`}
                >
                  {z.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    )
  }

  return (
    <div
      className="develop-elite__structure-stack develop-elite-list-panels__section develop-elite-list-panels__structures"
      aria-label="Structure counts"
    >
      <div className="develop-elite__structure-box develop-elite__structure-box--glasshouse">
        <span className="develop-elite__structure-label">Glasshouse</span>
        <div className="develop-elite__structure-metric">
          <i className="fa-solid fa-house develop-elite__structure-icon" aria-hidden />
          <strong>{data.sideCounts.glasshouse}</strong>
        </div>
      </div>
      <div className="develop-elite__structure-box develop-elite__structure-box--nethouse">
        <span className="develop-elite__structure-label">Nethouse</span>
        <div className="develop-elite__structure-metric">
          <i className="fa-solid fa-house develop-elite__structure-icon" aria-hidden />
          <strong>{data.sideCounts.nethouse}</strong>
        </div>
      </div>
      <div className="develop-elite__structure-box develop-elite__structure-box--greenhouse">
        <span className="develop-elite__structure-label">Greenhouse</span>
        <div className="develop-elite__structure-metric">
          <i className="fa-solid fa-house develop-elite__structure-icon" aria-hidden />
          <strong>{data.sideCounts.greenhouse}</strong>
        </div>
      </div>
    </div>
  )
}
