import type { Dispatch, SetStateAction } from 'react'
import { DevelopEliteAirportFlapText } from './DevelopEliteAirportFlapText'
import { DevelopEliteListSearchWithPlay } from './DevelopEliteListSearchWithPlay'
import { DevelopEliteListTickerViewport } from './DevelopEliteListTickerViewport'
import { developEliteListItemMatchesSearch } from './developEliteListSearch'
import {
  developEliteAirportTickerRows,
  useDevelopEliteAirportListTicker,
} from './useDevelopEliteAirportListTicker'
import type { useDevelopEliteDashboardData } from './useDevelopEliteDashboardData'

type DashboardData = ReturnType<typeof useDevelopEliteDashboardData>

type Props = {
  data: DashboardData
  filteredCountries: Array<{ code: string; label: string }>
  countrySearch: string
  setCountrySearch: Dispatch<SetStateAction<string>>
  searchPlaceholder?: string
}

export function DevelopEliteCountryListPanel({
  data,
  filteredCountries,
  countrySearch,
  setCountrySearch,
  searchPlaceholder = 'Search',
}: Props) {
  const countryRows = [
    { key: 'all', label: 'All countries', code: 'all' as const },
    ...filteredCountries.map(c => ({ key: c.code, label: c.label, code: c.code })),
  ]
  const { playing, togglePlaying, tickerActive, viewportRef, listRef } = useDevelopEliteAirportListTicker(
    countrySearch,
    countryRows.length,
  )
  const tickerRows = developEliteAirportTickerRows(countryRows, tickerActive)

  return (
    <>
      <DevelopEliteListSearchWithPlay
        playing={playing}
        onTogglePlay={togglePlaying}
        searchValue={countrySearch}
        onSearchChange={setCountrySearch}
        placeholder={searchPlaceholder}
        playAriaLabel="Play country list ticker"
        pauseAriaLabel="Pause country list ticker"
      />
      <DevelopEliteListTickerViewport viewportRef={viewportRef} tickerActive={tickerActive}>
        <ul
          ref={listRef}
          className={`develop-elite__list develop-elite__list--scroll develop-elite__list--countries${
            tickerActive ? ' develop-elite__list--airport-ticker' : ''
          }`}
        >
          {tickerRows.map((row, index) => (
            <li key={`${row.key}-${index}`}>
              <button
                type="button"
                className={`develop-elite__list-btn${
                  data.filters.country === row.code ? ' is-active' : ''
                }`}
                onClick={() => data.selectCountry(row.code)}
              >
                <DevelopEliteAirportFlapText
                  text={row.label}
                  active={tickerActive}
                  className={`develop-elite__list-title${
                    row.code !== 'all' &&
                    developEliteListItemMatchesSearch(`${row.label} ${row.code}`, countrySearch)
                      ? ' develop-elite__list-title--search-hit'
                      : ''
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </DevelopEliteListTickerViewport>
    </>
  )
}
