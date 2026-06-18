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
  tickerFocusFieldKey: string | null
  viewportBbox: LngLatBBox | null
  enabled: boolean
  interactionSuspendedRef?: React.RefObject<boolean>
  mapInteractEpoch?: number
}

export function AcpWeatherAlertMarkersLayer({
  map,
  entries,
  tickerFocusFieldKey,
  viewportBbox,
  enabled,
  interactionSuspendedRef,
  mapInteractEpoch = 0,
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
    if (popupFieldKey) keys.add(popupFieldKey)
    if (tickerFocusFieldKey) keys.add(tickerFocusFieldKey)
    return keys
  }, [popupFieldKey, tickerFocusFieldKey])

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

  const handleWeatherOpen = useCallback((fieldKey: string) => {
    setPopupFieldKey(prev => (prev === fieldKey ? null : fieldKey))
  }, [])

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
          offset: placement.pixelOffset,
        })
          .setLngLat(placement.lngLat)
          .addTo(map)
        markerEntry = { marker, root: createRoot(el) }
        store.set(entry.fieldKey, markerEntry)
      } else {
        markerEntry.marker.setLngLat(placement.lngLat)
        markerEntry.marker.setOffset(placement.pixelOffset)
      }

      const hostEl = markerEntry.marker.getElement()
      hostEl.classList.toggle(
        'acp-weather-marker-host--popup-open',
        popupFieldKey === entry.fieldKey,
      )

      markerEntry.root.render(
        <AcpWeatherAlertMarker
          entry={entry}
          selected={popupFieldKey === entry.fieldKey}
          popupOpen={popupFieldKey === entry.fieldKey}
          dimmed={Boolean(popupFieldKey && popupFieldKey !== entry.fieldKey)}
          onSelect={handleWeatherOpen}
          onClosePopup={() => setPopupFieldKey(null)}
        />,
      )
    }
  }, [
    enabled,
    interactionSuspendedRef,
    map,
    popupFieldKey,
    stableEntries.length,
    visibleEntries,
    mapInteractEpoch,
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
