import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useGisContentPortal } from '../../../../lib/gisContentPortalStore'
import { useAcpPlatform } from '../acpPlatformContext'
import { addAcpGisPortalRowToMap } from './acpGisPortalActions'
import { AcpMapPanel } from './AcpMapPanel'
import {
  searchAcpPlaces,
  searchAcpPortalLayers,
  searchAcpStructureFields,
  type AcpMapSearchHit,
} from './acpMapSearch'
import { isAcpExcludedPortalMapRow } from './acpPortalMapLayers'

type Props = {
  onClose: () => void
}

type SearchGroup = {
  id: string
  title: string
  hits: AcpMapSearchHit[]
}

function groupIcon(hit: AcpMapSearchHit): string {
  if (hit.kind === 'field') return 'fa-seedling'
  if (hit.kind === 'layer') return 'fa-layer-group'
  return 'fa-location-dot'
}

export function AcpMapSearchPanel({ onClose }: Props) {
  const acp = useAcpPlatform()
  const portal = useGisContentPortal()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchSeqRef = useRef(0)
  const listboxId = useId()

  const [query, setQuery] = useState('')
  const [placeHits, setPlaceHits] = useState<AcpMapSearchHit[]>([])
  const [loadingPlaces, setLoadingPlaces] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const portalRows = useMemo(
    () => portal.rows.filter(row => row.type === 'feature-layer' && !isAcpExcludedPortalMapRow(row)),
    [portal.rows],
  )

  const fieldHits = useMemo(
    () => searchAcpStructureFields(query, acp.aoiMask, acp.countryDescriptionMap),
    [query, acp.aoiMask, acp.countryDescriptionMap],
  )

  const layerHits = useMemo(() => searchAcpPortalLayers(query, portalRows), [query, portalRows])

  const groups = useMemo<SearchGroup[]>(() => {
    const next: SearchGroup[] = []
    if (fieldHits.length) next.push({ id: 'fields', title: 'Agro Structures', hits: fieldHits })
    if (layerHits.length) next.push({ id: 'layers', title: 'Layers', hits: layerHits })
    if (placeHits.length) next.push({ id: 'places', title: 'Places', hits: placeHits })
    return next
  }, [fieldHits, layerHits, placeHits])

  const flatHits = useMemo(() => groups.flatMap(group => group.hits), [groups])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(flatHits.length ? 0 : -1)
  }, [flatHits])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setPlaceHits([])
      setLoadingPlaces(false)
      return
    }

    const seq = ++searchSeqRef.current
    const timer = window.setTimeout(() => {
      setLoadingPlaces(true)
      void searchAcpPlaces(q)
        .then(hits => {
          if (searchSeqRef.current !== seq) return
          setPlaceHits(hits)
        })
        .catch(() => {
          if (searchSeqRef.current !== seq) return
          setPlaceHits([])
        })
        .finally(() => {
          if (searchSeqRef.current === seq) setLoadingPlaces(false)
        })
    }, 280)

    return () => window.clearTimeout(timer)
  }, [query])

  const activateHit = useCallback(
    (hit: AcpMapSearchHit) => {
      setStatus(null)
      if (hit.kind === 'field') {
        acp.requestFieldLocate(hit.fieldKey)
        onClose()
        return
      }
      if (hit.kind === 'place') {
        acp.mapFlyToRef.current?.(hit.lng, hit.lat, 12, { label: hit.label, meta: hit.meta })
        onClose()
        return
      }

      const row = portalRows.find(entry => entry.id === hit.layerId)
      if (!row) {
        setStatus('Layer not found.')
        return
      }

      void (async () => {
        try {
          acp.setPortalLayerVisible(hit.layerId, true)
          const result = await addAcpGisPortalRowToMap(row)
          if (result.isAgroStructures) acp.refreshEngine()
          else if (result.geojson) acp.mapFocusGeoJsonRef.current?.(result.geojson)
          setStatus(result.message)
          onClose()
        } catch (err) {
          setStatus(err instanceof Error ? err.message : `Failed to load "${hit.layerTitle}".`)
        }
      })()
    },
    [acp, onClose, portalRows],
  )

  const onInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!flatHits.length) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex(index => (index + 1) % flatHits.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex(index => (index <= 0 ? flatHits.length - 1 : index - 1))
      } else if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault()
        const hit = flatHits[activeIndex]
        if (hit) activateHit(hit)
      }
    },
    [activeIndex, activateHit, flatHits],
  )

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const option = listRef.current.querySelector<HTMLElement>(`[data-search-index="${activeIndex}"]`)
    option?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const trimmed = query.trim()
  const showEmpty = trimmed.length > 0 && !flatHits.length && !loadingPlaces

  return (
    <AcpMapPanel title="Search map" onClose={onClose} className="acp-map-search-panel">
      <div className="acp-map-search">
        <div className="acp-map-search__input-wrap">
          <i className="fa-solid fa-magnifying-glass acp-map-search__input-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            className="acp-map-search__input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search places, fields, or layers…"
            aria-label="Search map"
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          {loadingPlaces ? <span className="acp-map-search__spinner" aria-hidden="true" /> : null}
        </div>

        <div ref={listRef} id={listboxId} className="acp-map-search__results" role="listbox" aria-label="Search results">
          {!trimmed ? (
            <p className="acp-map-search__hint">
              Find cities and coordinates, Agro_Structures fields, or hosted GIS layers.
            </p>
          ) : null}

          {groups.map(group => (
            <section key={group.id} className="acp-map-search__group" aria-label={group.title}>
              <h4 className="acp-map-search__group-title">{group.title}</h4>
              <ul className="acp-map-search__list">
                {group.hits.map(hit => {
                  const index = flatHits.indexOf(hit)
                  return (
                    <li key={hit.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        data-search-index={index}
                        className={`acp-map-search__option${index === activeIndex ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => activateHit(hit)}
                      >
                        <i className={`fa-solid ${groupIcon(hit)} acp-map-search__option-icon`} aria-hidden="true" />
                        <span className="acp-map-search__option-text">
                          <span className="acp-map-search__option-label">{hit.label}</span>
                          {hit.meta ? <span className="acp-map-search__option-meta">{hit.meta}</span> : null}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {showEmpty ? (
            <p className="acp-map-search__empty">No matches for &ldquo;{trimmed}&rdquo;</p>
          ) : null}
        </div>

        {status ? (
          <p className="acp-map-search__status" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </AcpMapPanel>
  )
}
