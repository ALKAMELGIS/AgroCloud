import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import type { CropAlertFieldResult } from '../../../../lib/siCropAlertEngine'
import { filterCropAlertMarkersForViewport } from '../../../../lib/siCropAlertMapMarkersFilter'
import type { LngLatBBox } from '../../../../lib/siMapViewport'
import { SiCropAlertMapMarker } from '../../../satellite/components/SiCropAlertMapMarker'
import { debounceAcpMap } from './acpMapInteraction'
import { resolveAcpCoMarkerPixelOffset } from './acpMapMarkerLayout'

type MarkerEntry = {
  marker: maplibregl.Marker
  root: Root
}

export type AcpAlertMarkersLayerProps = {
  map: MapLibreMap | null
  results: CropAlertFieldResult[]
  selectedFieldKey: string | null
  viewportBbox: LngLatBBox | null
  enabled: boolean
  coLocatedFieldKeys?: ReadonlySet<string>
  interactionSuspendedRef?: React.RefObject<boolean>
  onSelect: (fieldKey: string) => void
}

export function AcpAlertMarkersLayer({
  map,
  results,
  selectedFieldKey,
  viewportBbox,
  enabled,
  coLocatedFieldKeys,
  interactionSuspendedRef,
  onSelect,
}: AcpAlertMarkersLayerProps) {
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

  const alwaysVisibleKeys = useMemo(() => {
    const keys = new Set<string>()
    if (selectedFieldKey) keys.add(selectedFieldKey)
    if (popupFieldKey) keys.add(popupFieldKey)
    return keys
  }, [popupFieldKey, selectedFieldKey])

  const resultsRef = useRef(results)
  resultsRef.current = results.length > 0 ? results : resultsRef.current

  const stableResults = resultsRef.current

  const visibleResults = useMemo(() => {
    if (!stableResults.length) return []
    return filterCropAlertMarkersForViewport(
      stableResults,
      viewportBbox,
      mapZoom,
      alwaysVisibleKeys,
    )
  }, [alwaysVisibleKeys, mapZoom, stableResults, viewportBbox])

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

    if (!map || (!enabled && stableResults.length === 0)) {
      clearAll()
      return
    }

    const activeKeys = new Set(visibleResults.map(r => r.fieldKey))

    for (const [key, entry] of store) {
      if (!activeKeys.has(key)) {
        entry.root.unmount()
        entry.marker.remove()
        store.delete(key)
      }
    }

    for (const result of visibleResults) {
      const [lng, lat] = result.centroid
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue

      let entry = store.get(result.fieldKey)
      const coLocated = Boolean(coLocatedFieldKeys?.has(result.fieldKey))
      const markerOffset = resolveAcpCoMarkerPixelOffset('chas', coLocated)

      if (!entry) {
        const el = document.createElement('div')
        el.classList.add('acp-alert-marker-host')
        if (coLocated) el.classList.add('acp-alert-marker-host--co-located')
        const marker = new maplibregl.Marker({ element: el, anchor: 'center', offset: markerOffset })
          .setLngLat([lng, lat])
          .addTo(map)
        entry = { marker, root: createRoot(el) }
        store.set(result.fieldKey, entry)
      } else {
        entry.marker.setLngLat([lng, lat])
        entry.marker.setOffset(markerOffset)
        entry.marker.getElement().classList.toggle('acp-alert-marker-host--co-located', coLocated)
      }

      const hostEl = entry.marker.getElement()
      hostEl.classList.add('acp-alert-marker-host')
      hostEl.classList.toggle('acp-alert-marker-host--popup-open', popupFieldKey === result.fieldKey)

      entry.root.render(
        <SiCropAlertMapMarker
          result={result}
          selected={selectedFieldKey === result.fieldKey}
          popupOpen={popupFieldKey === result.fieldKey}
          dimmed={Boolean(popupFieldKey && popupFieldKey !== result.fieldKey)}
          iconSize="md"
          onSelect={handleSelect}
          onClosePopup={() => setPopupFieldKey(null)}
        />,
      )
    }
  }, [
    coLocatedFieldKeys,
    enabled,
    handleSelect,
    interactionSuspendedRef,
    map,
    popupFieldKey,
    selectedFieldKey,
    stableResults.length,
    visibleResults,
  ])

  useEffect(() => () => {
    for (const entry of markersRef.current.values()) {
      entry.root.unmount()
      entry.marker.remove()
    }
    markersRef.current.clear()
  }, [])

  return null
}
