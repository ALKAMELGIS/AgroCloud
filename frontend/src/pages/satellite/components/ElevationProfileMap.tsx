import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Layer, Source, useMap } from 'react-map-gl/mapbox'
import { ElevationProfileChart } from './ElevationProfileChart'
import type { UseElevationProfileReturn } from './useElevationProfile'
import './ElevationProfilePanel.css'

type Props = {
  model: UseElevationProfileReturn
}

export function ElevationProfileMap({ model }: Props) {
  const maps = useMap()
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let frames = 0
    let raf = 0
    const attach = () => {
      const map = maps.current?.getMap?.()
      const el = map?.getContainer?.() ?? null
      if (el) {
        setContainer(el)
        return
      }
      if (frames < 24) {
        frames += 1
        raf = window.requestAnimationFrame(attach)
      }
    }
    attach()
    return () => window.cancelAnimationFrame(raf)
  }, [maps])

  useEffect(() => {
    const map = maps.current?.getMap?.()
    const canvas = map?.getCanvas?.() as HTMLCanvasElement | undefined
    if (!map || !canvas || !model.drawing) return
    const previous = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    try {
      map.doubleClickZoom?.disable?.()
    } catch {
      /* ignore */
    }
    return () => {
      canvas.style.cursor = previous
      try {
        map.doubleClickZoom?.enable?.()
      } catch {
        /* ignore */
      }
    }
  }, [maps, model.drawing])

  if (!model.enabled) return null
  const coords = model.drawing && model.cursor ? [...model.vertices, model.cursor] : model.vertices
  const line =
    coords.length >= 2
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: coords },
        }
      : null
  const vertices = {
    type: 'FeatureCollection' as const,
    features: model.vertices.map((c, i) => ({
      type: 'Feature' as const,
      properties: { i },
      geometry: { type: 'Point' as const, coordinates: c },
    })),
  }
  const hover = model.hoverIndex != null ? model.profile?.samples[model.hoverIndex] : null

  return (
    <>
      {line ? (
        <Source id="elev-profile-line-src" type="geojson" data={line}>
          <Layer
            id="elev-profile-line"
            type="line"
            paint={{ 'line-color': model.colors.line, 'line-width': 3 }}
          />
        </Source>
      ) : null}
      {vertices.features.length ? (
        <Source id="elev-profile-verts-src" type="geojson" data={vertices}>
          <Layer
            id="elev-profile-verts"
            type="circle"
            paint={{
              'circle-radius': 4.5,
              'circle-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-stroke-color': model.colors.line,
            }}
          />
        </Source>
      ) : null}
      {hover ? (
        <Source
          id="elev-profile-hover-src"
          type="geojson"
          data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [hover.lng, hover.lat] } }}
        >
          <Layer
            id="elev-profile-hover"
            type="circle"
            paint={{
              'circle-radius': 6,
              'circle-color': model.colors.highlight,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            }}
          />
        </Source>
      ) : null}
      {container && model.profile
        ? createPortal(
            <ElevationProfileChart
              profile={model.profile}
              colors={model.colors}
              statsOn={model.statsOn}
              onHover={model.setHoverIndex}
              onReverse={model.reverse}
              onExport={model.exportCsv}
              onClose={model.clear}
            />,
            container,
          )
        : null}
    </>
  )
}
