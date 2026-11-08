import type { Dispatch, SetStateAction } from 'react'
import { DevelopEliteAirportFlapText } from './DevelopEliteAirportFlapText'
import { DevelopEliteListSearchWithPlay } from './DevelopEliteListSearchWithPlay'
import { developEliteListItemMatchesSearch } from './developEliteListSearch'
import { useDevelopEliteAirportListTicker } from './useDevelopEliteAirportListTicker'
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
  const { playing, togglePlaying, tickerActive, listRef } = useDevelopEliteAirportListTicker(countrySearch)

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
      <ul
        ref={listRef}
        className={`develop-elite__list develop-elite__list--scroll develop-elite__list--countries${
          tickerActive ? ' develop-elite__list--airport-ticker' : ''
        }`}
      >
        <li>
          <button
            type="button"
            className={`develop-elite__list-btn${data.filters.country === 'all' ? ' is-active' : ''}`}
            onClick={() => data.selectCountry('all')}
          >
            <DevelopEliteAirportFlapText
              text="All countries"
              active={tickerActive}
              className="develop-elite__list-title"
            />
          </button>
        </li>
        {filteredCountries.map(c => (
          <li key={c.code}>
            <button
              type="button"
              className={`develop-elite__list-btn${data.filters.country === c.code ? ' is-active' : ''}`}
              onClick={() => data.selectCountry(c.code)}
            >
              <DevelopEliteAirportFlapText
                text={c.label}
                active={tickerActive}
                className={`develop-elite__list-title${
                  developEliteListItemMatchesSearch(`${c.label} ${c.code}`, countrySearch)
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
