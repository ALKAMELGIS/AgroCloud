import type { Dispatch, SetStateAction } from 'react'
import { DevelopEliteCountryListPanel } from './DevelopEliteCountryListPanel'
import { DevelopEliteFarmListPanel } from './DevelopEliteFarmListPanel'
import { DevelopEliteZoneListPanel } from './DevelopEliteZoneListPanel'
import type { useDevelopEliteDashboardData } from './useDevelopEliteDashboardData'

type DashboardData = ReturnType<typeof useDevelopEliteDashboardData>

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
        <DevelopEliteFarmListPanel data={data} searchPlaceholder="Search farms" />
      </div>
    )
  }

  if (tab === 'countries') {
    return (
      <div className="develop-elite__panel develop-elite__panel--countries develop-elite-list-panels__section">
        <DevelopEliteCountryListPanel
          data={data}
          filteredCountries={filteredCountries}
          countrySearch={countrySearch}
          setCountrySearch={setCountrySearch}
          searchPlaceholder="Search countries"
        />
      </div>
    )
  }

  if (tab === 'zones') {
    return (
      <aside className="develop-elite__zones-col develop-elite-list-panels__section" aria-label="Zones">
        <DevelopEliteZoneListPanel
          data={data}
          filteredZones={filteredZones}
          zoneSearch={zoneSearch}
          setZoneSearch={setZoneSearch}
          searchPlaceholder="Search zones"
        />
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
