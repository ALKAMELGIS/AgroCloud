import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import { flyToLatLng } from '@/modules/dashboard/develop-elite/developEliteMapFly'
import { listDevelopEliteBasemapEntries } from '@/modules/gis/map/BasemapGallery'
import { buildBasemapCatalog, getBasemapThumbnail, resolveBasemapId } from '@/modules/gis/map/basemapCatalog'
import { searchPlaces, type MapSearchResult } from '@/modules/gis/map/mapSearchGeocode'
import { parseLatLngQuery } from '@/modules/remote-sensing/weather/openMeteoWeather'

type Props = {
  openMeteoActive: boolean
  onOpenMeteoActiveChange: (active: boolean) => void
  basemapId: string
  onBasemapChange: (id: string) => void
}

export function WeatherMapInsightRail({
  openMeteoActive,
  onOpenMeteoActiveChange,
  basemapId,
  onBasemapChange,
}: Props) {
  const map = useMap()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<MapSearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [basemapOpen, setBasemapOpen] = useState(false)
  const [searchStatus, setSearchStatus] = useState('')
  const searchSeq = useRef(0)

  const catalog = useMemo(() => buildBasemapCatalog(''), [])
  const basemapEntries = useMemo(() => listDevelopEliteBasemapEntries(catalog), [catalog])
  const activeBasemapId = useMemo(() => resolveBasemapId(basemapId), [basemapId])

  const runSearch = useCallback(
    async (raw: string) => {
      const q = raw.trim()
      if (!q) {
        setHits([])
        setSearchStatus('')
        return
      }
      const direct = parseLatLngQuery(q)
      if (direct) {
        flyToLatLng(map, direct.lat, direct.lng, 10)
        setSearchStatus('Coordinates')
        setHits([])
        setSearchOpen(false)
        return
      }
      const seq = ++searchSeq.current
      setSearchStatus('Searching…')
      try {
        const center = map.getCenter()
        const results = await searchPlaces(q, {
          proximity: [center.lng, center.lat],
          limit: 6,
        })
        if (seq !== searchSeq.current) return
        setHits(results)
        setSearchStatus(results.length ? '' : 'No results')
        if (results.length === 1) {
          const r = results[0]
          flyToLatLng(map, r.lat, r.lng, 11)
          setSearchOpen(false)
        }
      } catch {
        if (seq !== searchSeq.current) return
        setHits([])
        setSearchStatus('Search unavailable')
      }
    },
    [map],
  )

  useEffect(() => {
    if (!searchOpen) return
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setSearchStatus('')
      return
    }
    const id = window.setTimeout(() => void runSearch(q), 320)
    return () => window.clearTimeout(id)
  }, [query, searchOpen, runSearch])

  const onPickHit = (r: MapSearchResult) => {
    flyToLatLng(map, r.lat, r.lng, 11)
    setQuery(r.label)
    setSearchOpen(false)
    setHits([])
  }

  const toggleSearch = () => {
    setSearchOpen(v => !v)
    setBasemapOpen(false)
  }

  const toggleBasemap = () => {
    setBasemapOpen(v => !v)
    setSearchOpen(false)
  }

  const toggleOpenMeteo = () => {
    onOpenMeteoActiveChange(!openMeteoActive)
    setBasemapOpen(false)
    setSearchOpen(false)
  }

  return (
    <div className="weather-map-stage__insight-rail" role="toolbar" aria-label="Map tools">
      <div className="weather-map-stage__map-tool-stack">
        <div className="weather-map-stage__map-tool-anchor">
          <div className="weather-map-stage__map-tool-buttons">
            <button
              type="button"
              className={`weather-map-stage__map-tool-btn${searchOpen ? ' is-active' : ''}`}
              title="Search map"
              aria-label="Search map"
              aria-pressed={searchOpen}
              onClick={toggleSearch}
            >
              <i className="fa-solid fa-magnifying-glass" aria-hidden />
            </button>
            <button
              type="button"
              className={`weather-map-stage__map-tool-btn${basemapOpen ? ' is-active' : ''}`}
              title="Basemap gallery"
              aria-label="Basemap gallery"
              aria-pressed={basemapOpen}
              onClick={toggleBasemap}
            >
              <i className="fa-solid fa-map" aria-hidden />
            </button>
            <button
              type="button"
              className={`weather-map-stage__map-tool-btn weather-map-stage__map-tool-btn--meteo${openMeteoActive ? ' is-active' : ''}`}
              title="Open-Meteo | Weather Intelligence — click map to sample live weather"
              aria-label="Open-Meteo map pick"
              aria-pressed={openMeteoActive}
              onClick={toggleOpenMeteo}
            >
              <i className="fa-solid fa-temperature-half" aria-hidden />
            </button>
          </div>

          {searchOpen ? (
            <div
              className="weather-map-stage__map-search weather-map-stage__map-search--flyout"
              role="search"
            >
              <input
                type="search"
                className="weather-map-stage__map-search-input"
                placeholder="Search place or lat,lng…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void runSearch(query)
                }}
                aria-label="Search map"
                autoFocus
              />
              {searchStatus ? <p className="weather-map-stage__map-search-status">{searchStatus}</p> : null}
              {hits.length > 0 ? (
                <ul className="weather-map-stage__map-search-hits">
                  {hits.map(h => (
                    <li key={h.id}>
                      <button type="button" onClick={() => onPickHit(h)}>
                        <span>{h.label}</span>
                        {h.subtitle ? <small>{h.subtitle}</small> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {basemapOpen ? (
            <div
              className="weather-map-stage__basemap-panel weather-map-stage__basemap-panel--flyout"
              role="listbox"
              aria-label="Basemap gallery"
            >
              <p className="weather-map-stage__basemap-panel-title">Basemap gallery</p>
              <ul className="weather-map-stage__basemap-list">
                {basemapEntries.map(entry => {
                  const selected = activeBasemapId === entry.id
                  const thumb = getBasemapThumbnail(entry, '')
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`weather-map-stage__basemap-item${selected ? ' is-selected' : ''}`}
                        onClick={() => {
                          onBasemapChange(entry.id)
                          setBasemapOpen(false)
                        }}
                      >
                        <img src={thumb} alt="" loading="lazy" />
                        <span>{entry.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
