import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildDemGrid } from '../hydro-watershed/terrainTiles'
import { lngLatToWorldPx } from '@/modules/ai/detection/tree/webMercatorTiles'
import {
  buildElevationProfile,
  lineFromGeometry,
  type ElevationProfile,
} from './elevationProfile'
import type { DemGrid } from '../hydro-watershed/terrainTiles'

export type ElevationProfileColors = {
  line: string
  graph: string
  highlight: string
}

export type ElevationProfileStatKey = 'min' | 'avg' | 'max' | 'change' | 'slopeMax' | 'slopeAvg'

const DEFAULT_STATS: Record<ElevationProfileStatKey, boolean> = {
  min: true,
  avg: true,
  max: true,
  change: true,
  slopeMax: true,
  slopeAvg: true,
}

function sampleDem(dem: DemGrid, lng: number, lat: number): number | null {
  const [wx, wy] = lngLatToWorldPx(lng, lat, dem.zoom)
  const fx = wx - dem.originWorldPxX
  const fy = wy - dem.originWorldPxY
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  if (x0 < 0 || y0 < 0 || x0 >= dem.width - 1 || y0 >= dem.height - 1) {
    const x = Math.max(0, Math.min(dem.width - 1, Math.round(fx)))
    const y = Math.max(0, Math.min(dem.height - 1, Math.round(fy)))
    const z = dem.elev[y * dem.width + x]
    return z != null && Number.isFinite(z) ? z : null
  }
  const tx = fx - x0
  const ty = fy - y0
  const at = (x: number, y: number) => dem.elev[y * dem.width + x] ?? NaN
  const z =
    at(x0, y0) * (1 - tx) * (1 - ty) +
    at(x0 + 1, y0) * tx * (1 - ty) +
    at(x0, y0 + 1) * (1 - tx) * ty +
    at(x0 + 1, y0 + 1) * tx * ty
  return Number.isFinite(z) ? z : null
}

function bboxOf(coords: [number, number][]) {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lng, lat] of coords) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  const padLng = Math.max(0.002, (east - west) * 0.15)
  const padLat = Math.max(0.002, (north - south) * 0.15)
  return { west: west - padLng, south: south - padLat, east: east + padLng, north: north + padLat }
}

type Options = {
  enabled: boolean
  sampleTerrain?: (lng: number, lat: number) => number | null
  sketchGeometry?: GeoJSON.Geometry | GeoJSON.Feature | null
}

export function useElevationProfile({ enabled, sampleTerrain, sketchGeometry }: Options) {
  const [vertices, setVertices] = useState<[number, number][]>([])
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [profile, setProfile] = useState<ElevationProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'create' | 'properties'>('create')
  const [method, setMethod] = useState<'interactive' | 'layer'>('interactive')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [colors, setColors] = useState<ElevationProfileColors>({
    line: '#1d4ed8',
    graph: '#5b21b6',
    highlight: '#22d3ee',
  })
  const [statsOn, setStatsOn] = useState(DEFAULT_STATS)
  const [layerId, setLayerId] = useState('sketch')

  const sketchLine = useMemo(() => lineFromGeometry(sketchGeometry), [sketchGeometry])

  const compute = useCallback(
    async (coords: [number, number][]) => {
      if (coords.length < 2) return
      setBusy(true)
      setError(null)
      try {
        const terrainProfile = buildElevationProfile(coords, (lng, lat) => sampleTerrain?.(lng, lat) ?? null)
        const finite = terrainProfile?.samples.length ?? 0
        if (terrainProfile && finite > 8) {
          setProfile(terrainProfile)
          return
        }
        const dem = await buildDemGrid({ bbox: bboxOf(coords), maxTiles: 10, maxZoom: 14, minZoom: 8 })
        if (!dem) {
          setProfile(terrainProfile)
          if (!terrainProfile) setError('Elevation is not available along this line.')
          return
        }
        const fromDem = buildElevationProfile(coords, (lng, lat) => sampleDem(dem, lng, lat))
        setProfile(fromDem ?? terrainProfile)
        if (!fromDem && !terrainProfile) setError('Elevation is not available along this line.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not build the elevation profile.')
      } finally {
        setBusy(false)
      }
    },
    [sampleTerrain],
  )

  useEffect(() => {
    if (!enabled) {
      setDrawing(false)
      setCursor(null)
      return
    }
    if (method === 'interactive' && vertices.length === 0 && !profile) setDrawing(true)
  }, [enabled])

  const armInteractive = useCallback(() => {
    setMethod('interactive')
    setVertices([])
    setProfile(null)
    setError(null)
    setHoverIndex(null)
    setCursor(null)
    setDrawing(true)
  }, [])

  const addVertex = useCallback((lng: number, lat: number) => {
    if (!enabled || !drawing || method !== 'interactive') return
    setVertices(prev => {
      const last = prev[prev.length - 1]
      if (last && Math.abs(last[0] - lng) < 1e-7 && Math.abs(last[1] - lat) < 1e-7) return prev
      return [...prev, [lng, lat]]
    })
  }, [enabled, drawing, method])

  const finish = useCallback(() => {
    setVertices(prev => {
      let next = prev
      if (next.length >= 2) {
        const a = next[next.length - 1]!
        const b = next[next.length - 2]!
        if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) next = next.slice(0, -1)
      }
      if (next.length >= 2) {
        setDrawing(false)
        setCursor(null)
        void compute(next)
      }
      return next
    })
  }, [compute])

  const undo = useCallback(() => {
    if (!drawing) return
    setVertices(prev => prev.slice(0, -1))
  }, [drawing])

  const clear = useCallback(() => {
    setVertices([])
    setCursor(null)
    setProfile(null)
    setError(null)
    setHoverIndex(null)
    setDrawing(enabled && method === 'interactive')
  }, [enabled, method])

  const reverse = useCallback(() => {
    setVertices(prev => {
      const next = [...prev].reverse()
      if (next.length >= 2) void compute(next)
      return next
    })
  }, [compute])

  const applySketch = useCallback(() => {
    if (!sketchLine || sketchLine.length < 2) {
      setError('Draw a line or an AOI first, then apply it.')
      return
    }
    setMethod('layer')
    setVertices(sketchLine)
    setDrawing(false)
    setCursor(null)
    void compute(sketchLine)
  }, [compute, sketchLine])

  const exportCsv = useCallback(() => {
    if (!profile) return
    const lines = ['distance_m,elevation_m,slope_pct,lng,lat']
    for (const s of profile.samples) {
      lines.push([s.distanceM.toFixed(2), s.elevationM.toFixed(3), s.slopePct.toFixed(3), s.lng.toFixed(6), s.lat.toFixed(6)].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'elevation-profile.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [profile])

  const toggleStat = useCallback((key: ElevationProfileStatKey) => {
    setStatsOn(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  return {
    enabled,
    vertices,
    cursor,
    drawing: enabled && drawing && method === 'interactive',
    profile,
    busy,
    error,
    tab,
    setTab,
    method,
    setMethod,
    hoverIndex,
    setHoverIndex,
    colors,
    setColors,
    statsOn,
    toggleStat,
    layerId,
    setLayerId,
    sketchLine,
    setCursor,
    addVertex,
    finish,
    undo,
    clear,
    reverse,
    applySketch,
    exportCsv,
    armInteractive,
  }
}

export type UseElevationProfileReturn = ReturnType<typeof useElevationProfile>
