import { useCallback, useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { WeatherMapLayerDef } from '../config/weatherLayerCatalog'
import {
  buildViewportGrid,
  fetchOpenMeteoFieldGrid,
  type FieldGridPoint,
  type LngLatBBox,
} from './weatherFieldGrid'

export type FieldGridSamples = { current: FieldGridPoint[]; next: FieldGridPoint[] }

type Props = {
  layer: WeatherMapLayerDef
  mapTimeIso?: string
  mapTimeIsoNext?: string
  enabled: boolean
  onSamples: (samples: FieldGridSamples) => void
}

export function WeatherFieldGridLoader({
  layer,
  mapTimeIso,
  mapTimeIsoNext,
  enabled,
  onSamples,
}: Props) {
  const map = useMap()
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(() => {
    if (!enabled) {
      onSamples({ current: [], next: [] })
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const b = map.getBounds()
    const latSpan = b.getNorth() - b.getSouth()
    const lngSpan = b.getEast() - b.getWest()
    const pad = 0.12
    const bbox: LngLatBBox = {
      west: b.getWest() - lngSpan * pad,
      south: b.getSouth() - latSpan * pad,
      east: b.getEast() + lngSpan * pad,
      north: b.getNorth() + latSpan * pad,
    }
    const zoom = map.getZoom()
    const cells = zoom >= 12 ? 12 : zoom >= 10 ? 11 : zoom >= 8 ? 10 : zoom >= 6 ? 9 : 8
    const points = buildViewportGrid(bbox, cells)

    const fetchNext =
      mapTimeIsoNext && mapTimeIsoNext !== mapTimeIso
        ? fetchOpenMeteoFieldGrid(points, layer, mapTimeIsoNext, ac.signal)
        : Promise.resolve([] as FieldGridPoint[])

    void Promise.all([
      fetchOpenMeteoFieldGrid(points, layer, mapTimeIso, ac.signal),
      fetchNext,
    ])
      .then(([current, next]) => {
        if (!ac.signal.aborted) onSamples({ current, next })
      })
      .catch(() => {
        if (!ac.signal.aborted) onSamples({ current: [], next: [] })
      })
  }, [map, layer, mapTimeIso, mapTimeIsoNext, enabled, onSamples])

  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    run()
    const debounced = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(run, 520)
    }
    map.on('moveend', debounced)
    map.on('zoomend', debounced)
    return () => {
      map.off('moveend', debounced)
      map.off('zoomend', debounced)
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [map, run])

  useEffect(() => {
    run()
  }, [layer.id, mapTimeIso, mapTimeIsoNext, enabled, run])

  return null
}
