import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'
import { SiMapDrawWidget } from '@/modules/gis/editing/SiMapDrawWidget'
import type { RemoteSensingDrawingTool } from '@/modules/gis/editing/RemoteSensingDrawingToolbar'
import {
  bboxToPolygonFeature,
  circleFromEdgeFeature,
  offsetWgs84Meters,
  SKETCH_MIN_DRAG_METERS,
} from '@/modules/gis/editing/drawingUtils'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import {
  raiseDevelopEliteMapLibreSketchLayers,
  syncDevelopEliteMapLibreSketchData,
} from './developEliteMapLibreSketchLayers'

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features }
}

function fitMapToFeature(map: MaplibreMap, feature: GeoJSON.Feature) {
  const geom = feature.geometry
  if (!geom) return
  const coords: number[][] = []
  const pushCoord = (c: number[]) => coords.push(c)
  if (geom.type === 'Point') pushCoord(geom.coordinates as number[])
  else if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) for (const c of ring) pushCoord(c as number[])
  } else if (geom.type === 'LineString') {
    for (const c of geom.coordinates) pushCoord(c as number[])
  }
  if (!coords.length) return
  let minLng = coords[0][0]
  let maxLng = coords[0][0]
  let minLat = coords[0][1]
  let maxLat = coords[0][1]
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  try {
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 48, maxZoom: 18, duration: 600 })
  } catch {
    /* ignore */
  }
}

export function DevelopEliteMapLibreDrawEngine() {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()
  const draw = useDevelopEliteMapDraw()
  const drawRef = useRef(draw)
  drawRef.current = draw

  const [previewFeatures, setPreviewFeatures] = useState<GeoJSON.Feature[]>([])
  const polygonRingRef = useRef<[number, number][]>([])
  const dragRef = useRef<null | { kind: 'rectangle' | 'circle'; start: [number, number] }>(null)

  const syncSketchLayers = useCallback(() => {
    const map = mapRef.current
    const d = drawRef.current
    if (!map || !d) return
    const committed = fc([...d.sketchFeaturesRef.current])
    syncDevelopEliteMapLibreSketchData(map, committed, fc(previewFeatures))
    raiseDevelopEliteMapLibreSketchLayers(map)
  }, [mapRef, previewFeatures])

  useEffect(() => {
    if (!mapReady) return
    syncSketchLayers()
  }, [mapReady, previewFeatures, draw?.clipGeoJson, syncSketchLayers])

  const commitFeature = useCallback(
    (feature: GeoJSON.Feature) => {
      const d = drawRef.current
      const map = mapRef.current
      if (!d) return
      d.sketchFeaturesRef.current.push(feature)
      d.setActiveTool(null)
      d.notifyDrawingChanged(d.sketchFeaturesRef.current.length)
      setPreviewFeatures([])
      polygonRingRef.current = []
      dragRef.current = null
      if (map) {
        syncDevelopEliteMapLibreSketchData(map, fc(d.sketchFeaturesRef.current), fc([]))
        raiseDevelopEliteMapLibreSketchLayers(map)
        fitMapToFeature(map, feature)
      }
    },
    [mapRef],
  )

  useEffect(() => {
    const map = mapRef.current
    const d = drawRef.current
    if (!map || !mapReady || !d?.drawingActive) {
      map?.getCanvas()?.classList.remove('develop-elite-map--drawing-sketch')
      return
    }

    const container = map.getContainer()
    const tool = d.activeTool

    const panLocked =
      tool === 'polygon' || tool === 'rectangle' || tool === 'circle' || tool === 'point'
    if (panLocked) {
      map.dragPan.disable()
      map.doubleClickZoom.disable()
      container.classList.add('develop-elite-map--drawing-sketch')
    } else {
      map.dragPan.enable()
      map.doubleClickZoom.enable()
      container.classList.remove('develop-elite-map--drawing-sketch')
    }

    const lngLatFromEvent = (e: MapMouseEvent): [number, number] => [e.lngLat.lng, e.lngLat.lat]

    const onMapClick = (e: MapMouseEvent) => {
      if (!drawRef.current?.drawingActive) return
      const active = drawRef.current.activeTool
      if (active === 'point') {
        e.preventDefault()
        commitFeature({
          type: 'Feature',
          properties: { label: 'Drawn point' },
          geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] },
        })
        return
      }
      if (active === 'polygon') {
        const ring = polygonRingRef.current
        ring.push([e.lngLat.lng, e.lngLat.lat])
        const line: GeoJSON.Feature = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: ring },
        }
        setPreviewFeatures(ring.length >= 2 ? [line] : [])
      }
    }

    const onDblClick = (e: MapMouseEvent) => {
      if (drawRef.current?.activeTool !== 'polygon') return
      e.preventDefault()
      const ring = polygonRingRef.current
      if (ring.length < 3) return
      const closed = [...ring, ring[0]]
      commitFeature({
        type: 'Feature',
        properties: { label: 'Drawn polygon' },
        geometry: { type: 'Polygon', coordinates: [closed] },
      })
    }

    const onDown = (e: MapMouseEvent) => {
      const active = drawRef.current?.activeTool
      if (active !== 'rectangle' && active !== 'circle') return
      if (e.originalEvent.button !== 0) return
      dragRef.current = { kind: active, start: lngLatFromEvent(e) }
      map.dragPan.disable()
    }

    const onMove = (e: MapMouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const end = lngLatFromEvent(e)
      if (drag.kind === 'rectangle') {
        setPreviewFeatures([bboxToPolygonFeature(drag.start[0], drag.start[1], end[0], end[1])])
      } else {
        setPreviewFeatures([circleFromEdgeFeature(drag.start[0], drag.start[1], end[0], end[1], 96)])
      }
    }

    const onUp = (e: MapMouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      let end = lngLatFromEvent(e)
      let [lng1, lat1] = drag.start
      let [lng2, lat2] = end
      if (Math.abs(lng2 - lng1) < 1e-8 && Math.abs(lat2 - lat1) < 1e-8) {
        if (drag.kind === 'circle') {
          ;[lng2, lat2] = offsetWgs84Meters(lng1, lat1, SKETCH_MIN_DRAG_METERS, 0)
        } else {
          ;[lng2, lat2] = offsetWgs84Meters(lng1, lat1, SKETCH_MIN_DRAG_METERS, SKETCH_MIN_DRAG_METERS)
        }
      }
      const feature =
        drag.kind === 'circle'
          ? circleFromEdgeFeature(lng1, lat1, lng2, lat2, 128, 'Drawn circle')
          : bboxToPolygonFeature(lng1, lat1, lng2, lat2, 'Drawn rectangle')
      dragRef.current = null
      commitFeature(feature)
    }

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter') return
      if (drawRef.current?.activeTool !== 'polygon') return
      const ring = polygonRingRef.current
      if (ring.length < 3) return
      ev.preventDefault()
      const closed = [...ring, ring[0]]
      commitFeature({
        type: 'Feature',
        properties: { label: 'Drawn polygon' },
        geometry: { type: 'Polygon', coordinates: [closed] },
      })
    }

    map.on('click', onMapClick)
    map.on('dblclick', onDblClick)
    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)
    window.addEventListener('keydown', onKey)

    return () => {
      map.off('click', onMapClick)
      map.off('dblclick', onDblClick)
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
      window.removeEventListener('keydown', onKey)
      map.dragPan.enable()
      map.doubleClickZoom.enable()
      container.classList.remove('develop-elite-map--drawing-sketch')
      polygonRingRef.current = []
      dragRef.current = null
      setPreviewFeatures([])
    }
  }, [commitFeature, draw?.activeTool, draw?.drawingActive, mapReady, mapRef])

  useEffect(() => {
    if (!draw?.drawingActive) {
      polygonRingRef.current = []
      dragRef.current = null
      setPreviewFeatures([])
    }
  }, [draw?.drawingActive, draw?.activeTool])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const onStyle = () => syncSketchLayers()
    map.on('style.load', onStyle)
    return () => {
      map.off('style.load', onStyle)
    }
  }, [mapReady, mapRef, syncSketchLayers])

  if (!draw) return null
  const map = mapRef.current
  const host = map?.getContainer()
  if (!draw.drawingActive || !host) return null

  const stopMapEvent = (event: { stopPropagation(): void }) => {
    event.stopPropagation()
  }

  return createPortal(
    <div
      className="develop-elite-map__draw-widget-host"
      onPointerDown={stopMapEvent}
      onClick={stopMapEvent}
      onDoubleClick={stopMapEvent}
    >
      <SiMapDrawWidget
        active
        activeTool={draw.activeTool}
        onToolChange={draw.setActiveTool}
        hasClearableDrawing={draw.hasClearableDrawing}
        onClearDrawing={draw.clearDrawing}
        onDeactivate={() => draw.stopDrawing()}
      />
    </div>,
    host,
  )
}
