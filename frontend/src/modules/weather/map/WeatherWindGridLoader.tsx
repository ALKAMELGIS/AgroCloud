import { useCallback, useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import {
  buildViewportGrid,
  fetchOpenMeteoWindGrid,
  type LngLatBBox,
  type WindGridPoint,
} from './weatherFieldGrid'

type Props = {
  mapTimeIso?: string
  enabled: boolean
  onSamples: (samples: WindGridPoint[]) => void
}

export function WeatherWindGridLoader({ mapTimeIso, enabled, onSamples }: Props) {
  const map = useMap()
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(() => {
    if (!enabled) {
      onSamples([])
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
    const cells = zoom >= 10 ? 9 : zoom >= 8 ? 7 : 5
    const points = buildViewportGrid(bbox, cells)

    void fetchOpenMeteoWindGrid(points, mapTimeIso, ac.signal)
      .then(samples => {
        if (!ac.signal.aborted) onSamples(samples)
      })
      .catch(() => {
        if (!ac.signal.aborted) onSamples([])
      })
  }, [map, mapTimeIso, enabled, onSamples])

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
  }, [mapTimeIso, enabled, run])

  return null
}
