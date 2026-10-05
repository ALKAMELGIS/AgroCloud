import type { Dispatch, SetStateAction } from 'react'
import { DevelopEliteAirportFlapText } from './DevelopEliteAirportFlapText'
import { DevelopEliteListSearchWithPlay } from './DevelopEliteListSearchWithPlay'
import { developEliteListItemMatchesSearch } from './developEliteListSearch'
import { useDevelopEliteAirportListTicker } from './useDevelopEliteAirportListTicker'
import type { useDevelopEliteDashboardData } from './useDevelopEliteDashboardData'

type DashboardData = ReturnType<typeof useDevelopEliteDashboardData>

type Props = {
  data: DashboardData
  filteredZones: Array<{ zoneId: string; label: string }>
  zoneSearch: string
  setZoneSearch: Dispatch<SetStateAction<string>>
  searchPlaceholder?: string
}

export function DevelopEliteZoneListPanel({
  data,
  filteredZones,
  zoneSearch,
  setZoneSearch,
  searchPlaceholder = 'Search',
}: Props) {
  const { playing, togglePlaying, tickerActive, listRef } = useDevelopEliteAirportListTicker(zoneSearch)

  return (
    <>
      <DevelopEliteListSearchWithPlay
        playing={playing}
        onTogglePlay={togglePlaying}
        searchValue={zoneSearch}
        onSearchChange={setZoneSearch}
        placeholder={searchPlaceholder}
        playAriaLabel="Play zone list ticker"
        pauseAriaLabel="Pause zone list ticker"
      />
      <ul
        ref={listRef}
        className={`develop-elite__list develop-elite__list--scroll develop-elite__list--zones${
          tickerActive ? ' develop-elite__list--airport-ticker' : ''
        }`}
      >
        {filteredZones.map(z => (
          <li key={z.zoneId}>
            <button
              type="button"
              className={`develop-elite__zone-btn${data.filters.zoneId === z.zoneId ? ' is-active' : ''}`}
              onClick={() => data.selectZone(data.filters.zoneId === z.zoneId ? 'all' : z.zoneId)}
            >
              <DevelopEliteAirportFlapText
                text={z.label}
                active={tickerActive}
                className={`develop-elite__list-title develop-elite__list-title--zone-ticker${
                  developEliteListItemMatchesSearch(`${z.label} ${z.zoneId}`, zoneSearch)
                    ? ' develop-elite__list-title--search-hit'
                    : ''
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
