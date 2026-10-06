import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { DrawToolsController } from '@/modules/gis/editing/DrawTools'
import { finishLeafletMapSketchSession } from '@/modules/gis/editing/leafletMapSketchInteraction'
import { SiMapDrawWidget } from '@/modules/gis/editing/SiMapDrawWidget'
import type { RemoteSensingDrawingTool } from '@/modules/gis/editing/RemoteSensingDrawingToolbar'
import '@/modules/gis/editing/SiMapDrawWidget.css'
const DRAW_SKETCH_PANE = 'develop-elite-draw-sketch'
const DRAW_ACCENT = '#4ade80'

type DrawContextValue = {
  drawingActive: boolean
  setDrawingActive: (active: boolean) => void
  toggleDrawing: () => void
  stopDrawing: () => void
  activeTool: RemoteSensingDrawingTool | null
  setActiveTool: (tool: RemoteSensingDrawingTool | null) => void
  hasClearableDrawing: boolean
  clearDrawing: () => void
  clipGeoJson: GeoJSON.FeatureCollection | null
  featureGroupRef: MutableRefObject<L.FeatureGroup | null>
  notifyDrawingChanged: (count: number) => void
}

const DevelopEliteMapDrawContext = createContext<DrawContextValue | null>(null)

export function useDevelopEliteMapDraw(): DrawContextValue | null {
  return useContext(DevelopEliteMapDrawContext)
}

function drawingToolToLeaflet(tool: RemoteSensingDrawingTool): string {
  return tool === 'point' ? 'marker' : tool
}

function leafletToolToDrawing(tool: string | null): RemoteSensingDrawingTool | null {
  if (!tool) return null
  if (tool === 'marker') return 'point'
  if (tool === 'circle' || tool === 'rectangle' || tool === 'polygon') return tool
  return null
}

/** Ensure Leaflet circle sketches carry `properties.radius` (meters) for Sentinel GEOMETRY + dataMask. */
export function enrichCircleSketchFeature(feature: GeoJSON.Feature, layer: L.Layer): GeoJSON.Feature {
  if (feature.geometry?.type !== 'Point') return feature
  const circle = layer as L.Circle
  if (typeof circle.getRadius !== 'function') return feature
  const radius = circle.getRadius()
  if (!Number.isFinite(radius) || radius <= 0) return feature
  const props =
    feature.properties && typeof feature.properties === 'object' && !Array.isArray(feature.properties)
      ? feature.properties
      : {}
  if (Number(props.radius) === radius) return feature
  return { ...feature, properties: { ...props, radius } }
}

export function syncClipFromFeatureGroup(fg: L.FeatureGroup | null): GeoJSON.FeatureCollection | null {
  if (!fg) return null
  const features: GeoJSON.Feature[] = []
  fg.eachLayer(layer => {
    if ((layer as { __isCircleCenter?: boolean }).__isCircleCenter) return
    const toGeoJSON = (layer as L.Layer & { toGeoJSON?: () => GeoJSON.Feature }).toGeoJSON
    if (typeof toGeoJSON !== 'function') return
    try {
      const feature = toGeoJSON.call(layer)
      if (feature?.type === 'Feature' && feature.geometry) {
        features.push(enrichCircleSketchFeature(feature, layer))
      }
    } catch {
      /* skip invalid sketch */
    }
  })
  if (!features.length) return null
  return { type: 'FeatureCollection', features }
}

export function DevelopEliteMapDrawProvider({ children }: { children: ReactNode }) {
  const [drawingActive, setDrawingActive] = useState(false)
  const [activeTool, setActiveTool] = useState<RemoteSensingDrawingTool | null>(null)
  const [clipGeoJson, setClipGeoJson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [hasClearableDrawing, setHasClearableDrawing] = useState(false)
  const featureGroupRef = useRef<L.FeatureGroup | null>(null)

  const refreshClip = useCallback(() => {
    startTransition(() => {
      setClipGeoJson(syncClipFromFeatureGroup(featureGroupRef.current))
    })
  }, [])

  const stopDrawing = useCallback(() => {
    setActiveTool(null)
    setDrawingActive(false)
  }, [])

  const toggleDrawing = useCallback(() => {
    setDrawingActive(current => {
      if (current) {
        setActiveTool(null)
        return false
      }
      return true
    })
  }, [])

  const clearDrawing = useCallback(() => {
    featureGroupRef.current?.clearLayers()
    setHasClearableDrawing(false)
    setClipGeoJson(null)
    setActiveTool(null)
  }, [])

  const notifyDrawingChanged = useCallback(
    (count: number) => {
      setHasClearableDrawing(count > 0)
      refreshClip()
    },
    [refreshClip],
  )

  const value = useMemo<DrawContextValue>(
    () => ({
      drawingActive,
      setDrawingActive,
      toggleDrawing,
      stopDrawing,
      activeTool,
      setActiveTool,
      hasClearableDrawing,
      clearDrawing,
      clipGeoJson,
      featureGroupRef,
      notifyDrawingChanged,
    }),
    [
      activeTool,
      clipGeoJson,
      clearDrawing,
      drawingActive,
      hasClearableDrawing,
      notifyDrawingChanged,
      stopDrawing,
      toggleDrawing,
    ],
  )

  return <DevelopEliteMapDrawContext.Provider value={value}>{children}</DevelopEliteMapDrawContext.Provider>
}

function ensureDrawSketchPane(map: L.Map) {
  if (!map.getPane(DRAW_SKETCH_PANE)) {
    const pane = map.createPane(DRAW_SKETCH_PANE)
    pane.style.zIndex = '360'
  }
}

function countSketchLayers(fg: L.FeatureGroup | null): number {
  if (!fg) return 0
  return fg.getLayers().filter(layer => !(layer as { __isCircleCenter?: boolean }).__isCircleCenter).length
}

export function DevelopEliteMapDrawEngine() {
  const map = useMap()
  const draw = useDevelopEliteMapDraw()
  const drawRef = useRef(draw)
  drawRef.current = draw

  const handleToolActivate = useCallback((tool: string | null) => {
    drawRef.current?.setActiveTool(leafletToolToDrawing(tool))
  }, [])

  const handleAOICreated = useCallback(() => {
    const current = drawRef.current
    if (!current) return
    current.setActiveTool(null)
    current.notifyDrawingChanged(countSketchLayers(current.featureGroupRef.current))
  }, [])

  const handleDrawingChanged = useCallback((count: number) => {
    drawRef.current?.notifyDrawingChanged(count)
  }, [])

  useEffect(() => {
    if (!draw) return
    ensureDrawSketchPane(map)
    if (!draw.featureGroupRef.current) {
      const fg = new L.FeatureGroup([], { pane: DRAW_SKETCH_PANE })
      map.addLayer(fg)
      draw.featureGroupRef.current = fg
    }
  }, [draw, map])

  useEffect(() => {
    if (!draw || draw.drawingActive) return
    finishLeafletMapSketchSession(map)
  }, [draw?.drawingActive, draw, map])

  if (!draw) return null

  const host = map.getContainer()
  const leafletTool = draw.activeTool ? drawingToolToLeaflet(draw.activeTool) : null

  const stopMapEvent = (event: { stopPropagation(): void }) => {
    event.stopPropagation()
  }

  return (
    <>
      {draw.drawingActive ? (
        <DrawToolsController
          activeTool={leafletTool}
          onToolActivate={handleToolActivate}
          featureGroupRef={draw.featureGroupRef}
          featureGroupPane={DRAW_SKETCH_PANE}
          shapeColor={DRAW_ACCENT}
          onAOICreated={handleAOICreated}
          onDrawingChanged={handleDrawingChanged}
        />
      ) : null}
      {draw.drawingActive && host
        ? createPortal(
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
        : null}
    </>
  )
}
