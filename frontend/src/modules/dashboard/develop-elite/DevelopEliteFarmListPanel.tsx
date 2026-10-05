import { DevelopEliteAirportFlapText } from './DevelopEliteAirportFlapText'
import { DevelopEliteListSearchWithPlay } from './DevelopEliteListSearchWithPlay'
import { developEliteListItemMatchesSearch } from './developEliteListSearch'
import { useDevelopEliteAirportListTicker } from './useDevelopEliteAirportListTicker'
import type { useDevelopEliteDashboardData } from './useDevelopEliteDashboardData'

type DashboardData = ReturnType<typeof useDevelopEliteDashboardData>

function developEliteFarmSearchHaystack(item: { title: string; subtitle?: string }) {
  return `${item.title} ${item.subtitle ?? ''}`
}

type Props = {
  data: DashboardData
  searchPlaceholder?: string
  listClassName?: string
}

export function DevelopEliteFarmListPanel({
  data,
  searchPlaceholder = 'Search',
  listClassName,
}: Props) {
  const { playing, togglePlaying, tickerActive, listRef } = useDevelopEliteAirportListTicker(
    data.filters.locationSearch,
  )

  return (
    <>
      <DevelopEliteListSearchWithPlay
        playing={playing}
        onTogglePlay={togglePlaying}
        searchValue={data.filters.locationSearch}
        onSearchChange={data.setLocationSearch}
        placeholder={searchPlaceholder}
        playAriaLabel="Play farm list ticker"
        pauseAriaLabel="Pause farm list ticker"
      />
      <ul
        ref={listRef}
        className={`develop-elite__list develop-elite__list--scroll develop-elite__list--farms${
          tickerActive ? ' develop-elite__list--airport-ticker' : ''
        }${listClassName ? ` ${listClassName}` : ''}`}
      >
        {data.farmList.map(item => (
          <li key={item.fieldKey}>
            <button
              type="button"
              className={`develop-elite__list-btn${data.filters.selectedFieldKey === item.fieldKey ? ' is-active' : ''}`}
              onClick={() =>
                data.selectFarm(data.filters.selectedFieldKey === item.fieldKey ? null : item.fieldKey)
              }
            >
              <DevelopEliteAirportFlapText
                text={item.title}
                active={tickerActive}
                className={`develop-elite__list-title${
                  developEliteListItemMatchesSearch(
                    developEliteFarmSearchHaystack(item),
                    data.filters.locationSearch,
                  )
                    ? ' develop-elite__list-title--search-hit'
                    : ''
                }`}
              />
              {item.subtitle ? (
                <DevelopEliteAirportFlapText
                  text={item.subtitle}
                  active={tickerActive}
                  className="develop-elite__list-sub"
                />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
