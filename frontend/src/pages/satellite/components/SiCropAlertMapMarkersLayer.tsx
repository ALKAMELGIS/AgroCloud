import { memo, useEffect, useMemo, useState } from 'react'
import { useMap } from 'react-map-gl/mapbox'
import type { CropAlertFieldResult } from '../../../lib/siCropAlertEngine'
import type { LngLatBBox } from '../../../lib/siMapViewport'
import { SiCropAlertMapMarker } from './SiCropAlertMapMarker'
import { SiMapDockAwareMarker } from './SiMapDockAwareMarker'
import { filterCropAlertMarkersForViewport } from '../../../lib/siCropAlertMapMarkersFilter'

export type SiCropAlertMapMarkerIconSize = 'sm' | 'md' | 'lg'

export type SiCropAlertMapMarkersLayerProps = {
  results: CropAlertFieldResult[]
  selectedFieldKey: string | null
  popupFieldKey: string | null
  viewportBbox?: LngLatBBox | null
  iconSize?: SiCropAlertMapMarkerIconSize
  onSelect: (fieldKey: string) => void
  onClosePopup: () => void
}

function useMapZoomOnViewportChange(): number | null {
  const mapRef = useMap()
  const [zoom, setZoom] = useState<number | null>(null)

  useEffect(() => {
    const map = mapRef?.current?.getMap?.() ?? mapRef?.getMap?.()
    if (!map) return

    const sync = () => setZoom(map.getZoom())
    sync()
    map.on('load', sync)
    map.on('moveend', sync)
    map.on('zoomend', sync)
    return () => {
      map.off('load', sync)
      map.off('moveend', sync)
      map.off('zoomend', sync)
    }
  }, [mapRef])

  return zoom
}

/** Isolated alert marker layer — skips re-render when map viewState changes during pan/zoom. */
export const SiCropAlertMapMarkersLayer = memo(function SiCropAlertMapMarkersLayer({
  results,
  selectedFieldKey,
  popupFieldKey,
  viewportBbox = null,
  iconSize = 'md',
  onSelect,
  onClosePopup,
}: SiCropAlertMapMarkersLayerProps) {
  const mapZoom = useMapZoomOnViewportChange()

  const alwaysVisibleKeys = useMemo(() => {
    const keys = new Set<string>()
    if (selectedFieldKey) keys.add(selectedFieldKey)
    if (popupFieldKey) keys.add(popupFieldKey)
    return keys
  }, [popupFieldKey, selectedFieldKey])

  const visibleResults = useMemo(
    () => filterCropAlertMarkersForViewport(results, viewportBbox, mapZoom, alwaysVisibleKeys),
    [alwaysVisibleKeys, mapZoom, results, viewportBbox],
  )

  if (!visibleResults.length) return null

  return (
    <>
      {visibleResults.map(result => {
        const isPopupHost = popupFieldKey === result.fieldKey
        return (
        <SiMapDockAwareMarker
          key={`si-crop-alert-beacon-${result.fieldKey}`}
          longitude={result.centroid[0]}
          latitude={result.centroid[1]}
          anchor="center"
          className="si-crop-alert-beacon"
          popupWidth={isPopupHost ? 320 : 0}
        >
          <SiCropAlertMapMarker
            result={result}
            selected={selectedFieldKey === result.fieldKey}
            popupOpen={isPopupHost}
            dimmed={Boolean(popupFieldKey && !isPopupHost)}
            iconSize={iconSize}
            onSelect={onSelect}
            onClosePopup={onClosePopup}
          />
        </SiMapDockAwareMarker>
        )
      })}
    </>
  )
})
