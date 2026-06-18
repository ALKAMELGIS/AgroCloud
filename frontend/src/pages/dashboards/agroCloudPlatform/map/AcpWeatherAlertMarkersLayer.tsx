import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import type { LngLatBBox } from '../../../../lib/siMapViewport'
import { filterWeatherMarkersForViewport, type AcpFieldWeatherLayerEntry } from './acpWeatherAlertLayerModel'
import { AcpWeatherAlertMarker } from './AcpWeatherAlertMarker'
import { debounceAcpMap } from './acpMapInteraction'
import { resolveAcpWeatherFieldEdgePlacement } from './acpMapMarkerLayout'

type MarkerEntry = {
  marker: maplibregl.Marker
  root: Root
}

export type AcpWeatherAlertMarkersLayerProps = {
  map: MapLibreMap | null
  entries: AcpFieldWeatherLayerEntry[]
  selectedFieldKey: string | null
  tickerFocusFieldKey: string | null
  viewportBbox: LngLatBBox | null
  enabled: boolean
  interactionSuspendedRef?: React.RefObject<boolean>
  onSelect: (fieldKey: string) => void
}

export function AcpWeatherAlertMarkersLayer({
  map,
  entries,
  selectedFieldKey,
  tickerFocusFieldKey,
  viewportBbox,
  enabled,
  interactionSuspendedRef,
  onSelect,
}: AcpWeatherAlertMarkersLayerProps) {
  const markersRef = useRef<globalThis.Map<string, MarkerEntry>>(new globalThis.Map())
  const [mapZoom, setMapZoom] = useState<number | null>(null)
  const [popupFieldKey, setPopupFieldKey] = useState<string | null>(null)

  useEffect(() => {
    if (!map) return
    const sync = debounceAcpMap(() => setMapZoom(map.getZoom()), 350)
    sync()
    map.on('moveend', sync)
    map.on('zoomend', sync)
    return () => {
      map.off('moveend', sync)
      map.off('zoomend', sync)
    }
  }, [map])

  useEffect(() => {
    if (tickerFocusFieldKey) setPopupFieldKey(tickerFocusFieldKey)
  }, [tickerFocusFieldKey])

  const alwaysVisibleKeys = useMemo(() => {
    const keys = new Set<string>()
    if (selectedFieldKey) keys.add(selectedFieldKey)
    if (popupFieldKey) keys.add(popupFieldKey)
    return keys
  }, [popupFieldKey, selectedFieldKey])

  const entriesRef = useRef(entries)
  entriesRef.current = entries.length > 0 ? entries : entriesRef.current
  const stableEntries = entriesRef.current

  const visibleEntries = useMemo(() => {
    if (!stableEntries.length) return []
    return filterWeatherMarkersForViewport(
      stableEntries,
      viewportBbox,
      mapZoom,
      alwaysVisibleKeys,
    )
  }, [alwaysVisibleKeys, mapZoom, stableEntries, viewportBbox])

  const handleSelect = useCallback(
    (fieldKey: string) => {
      onSelect(fieldKey)
      setPopupFieldKey(prev => (prev === fieldKey ? prev : fieldKey))
    },
    [onSelect],
  )

  useEffect(() => {
    if (interactionSuspendedRef?.current) return

    const store = markersRef.current

    const clearAll = () => {
      for (const entry of store.values()) {
        entry.root.unmount()
        entry.marker.remove()
      }
      store.clear()
    }

    if (!map || (!enabled && stableEntries.length === 0)) {
      clearAll()
      return
    }

    const activeKeys = new Set(enabled ? visibleEntries.map(r => r.fieldKey) : [])

    for (const [key, entry] of store) {
      if (!activeKeys.has(key)) {
        entry.root.unmount()
        entry.marker.remove()
        store.delete(key)
      }
    }

    if (!enabled) return

    for (const entry of visibleEntries) {
      if (!Number.isFinite(entry.lng) || !Number.isFinite(entry.lat)) continue

      const placement = resolveAcpWeatherFieldEdgePlacement(entry.geometry, [entry.lng, entry.lat])
      let markerEntry = store.get(entry.fieldKey)

      if (!markerEntry) {
        const el = document.createElement('div')
        el.classList.add('acp-weather-marker-host')
        const marker = new maplibregl.Marker({
          element: el,
          anchor: placement.anchor,
          offset: [0, 0],
        })
          .setLngLat(placement.lngLat)
          .addTo(map)
        markerEntry = { marker, root: createRoot(el) }
        store.set(entry.fieldKey, markerEntry)
      } else {
        markerEntry.marker.setLngLat(placement.lngLat)
        markerEntry.marker.setOffset([0, 0])
        markerEntry.marker.getElement().classList.remove('acp-weather-marker-host--co-located')
      }

      const hostEl = markerEntry.marker.getElement()
      hostEl.classList.toggle(
        'acp-weather-marker-host--popup-open',
        popupFieldKey === entry.fieldKey,
      )

      markerEntry.root.render(
        <AcpWeatherAlertMarker
          entry={entry}
          selected={selectedFieldKey === entry.fieldKey}
          popupOpen={popupFieldKey === entry.fieldKey}
          dimmed={Boolean(popupFieldKey && popupFieldKey !== entry.fieldKey)}
          onSelect={handleSelect}
          onClosePopup={() => setPopupFieldKey(null)}
        />,
      )
    }
  }, [
    enabled,
    handleSelect,
    interactionSuspendedRef,
    map,
    popupFieldKey,
    selectedFieldKey,
    stableEntries.length,
    visibleEntries,
  ])

  useEffect(
    () => () => {
      for (const entry of markersRef.current.values()) {
        entry.root.unmount()
        entry.marker.remove()
      }
      markersRef.current.clear()
    },
    [],
  )

  return null
}
