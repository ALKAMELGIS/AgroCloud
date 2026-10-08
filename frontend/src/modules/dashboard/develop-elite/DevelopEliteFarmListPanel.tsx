import { DevelopEliteAirportFlapText } from './DevelopEliteAirportFlapText'
import { DevelopEliteListTickerViewport } from './DevelopEliteListTickerViewport'
import { DevelopEliteListSearchWithPlay } from './DevelopEliteListSearchWithPlay'
import { developEliteListItemMatchesSearch } from './developEliteListSearch'
import {
  developEliteAirportTickerRows,
  useDevelopEliteAirportListTicker,
} from './useDevelopEliteAirportListTicker'
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
  const farmRows = data.farmList
  const { playing, togglePlaying, tickerActive, listRef, viewportRef, tickerHoverHandlers } =
    useDevelopEliteAirportListTicker(data.filters.locationSearch, farmRows.length, {
      clipViewport: true,
    })
  const tickerRows = developEliteAirportTickerRows(farmRows, tickerActive)

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
      <DevelopEliteListTickerViewport
        ref={viewportRef}
        tickerActive={tickerActive}
        {...tickerHoverHandlers}
      >
        <ul
          ref={listRef}
          data-ticker-loop={tickerActive && farmRows.length >= 2 ? 'half' : undefined}
          className={`develop-elite__list develop-elite__list--scroll develop-elite__list--farms${
            tickerActive ? ' develop-elite__list--airport-ticker' : ''
          }${listClassName ? ` ${listClassName}` : ''}`}
        >
          {tickerRows.map((item, index) => (
            <li key={`${item.fieldKey}-${index}`}>
              <button
                type="button"
                className={`develop-elite__list-btn${data.filters.selectedFieldKey === item.fieldKey ? ' is-active' : ''}${
                  data.farmListFlashFieldKey === item.fieldKey ? ' is-farm-flash' : ''
                }`}
                onClick={() => data.focusFarmOnMap(item.fieldKey)}
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
      </DevelopEliteListTickerViewport>
    </>
  )
}
