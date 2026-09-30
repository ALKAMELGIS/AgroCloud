/**
 * ArcGIS Pro–style Training Samples Manager for AI SAM Detection.
 * Classes + Point/Line/Polygon/Mask samples, stats, and export packs
 * for SAM/SAM2, YOLO, U-Net, and SegFormer.
 */

import { useCallback, useMemo, useState } from 'react'

export type SamTrainGeomKind = 'point' | 'line' | 'polygon' | 'mask'
export type SamTrainDrawTool = 'point' | 'polyline' | 'polygon' | 'rectangle' | 'circle' | 'freehand' | 'select'
export type SamTrainExportTarget = 'geojson' | 'sam' | 'yolo' | 'unet' | 'segformer'

export type SamTrainClass = {
  id: string
  name: string
  value: number
  color: string
}

export type SamTrainSample = {
  id: string
  classId: string
  kind: SamTrainGeomKind
  geometry: GeoJSON.Geometry
  /** Optional area share proxy (polygon/mask pixel weight). */
  weight?: number
  createdAt: number
}

export const SAM_TRAIN_CLASS_COLORS = [
  '#5475A8', // Water
  '#E8C5C5', // Developed
  '#D2CDC0', // Barren
  '#38814E', // Forest
  '#AF963C', // Shrubland
  '#DCD939', // Herbaceous
  '#E3E338', // Planted / Cultivated
  '#7A87C0', // Wetlands
  '#C8E6F5',
  '#B28653',
  '#6B8E23',
  '#CD5C5C',
] as const

/** Default NLCD-style land-cover schema (ArcGIS Training Samples Manager look). */
export const DEFAULT_SAM_TRAIN_SCHEMA: Omit<SamTrainClass, 'id'>[] = [
  { name: 'Water', value: 11, color: '#5475A8' },
  { name: 'Developed', value: 21, color: '#E8C5C5' },
  { name: 'Barren', value: 31, color: '#D2CDC0' },
  { name: 'Forest', value: 41, color: '#38814E' },
  { name: 'Shrubland', value: 51, color: '#AF963C' },
  { name: 'Herbaceous', value: 71, color: '#DCD939' },
  { name: 'Planted / Cultivated', value: 81, color: '#E3E338' },
  { name: 'Wetlands', value: 90, color: '#7A87C0' },
]

let classSeq = 0
let sampleSeq = 0
function nextClassId() {
  classSeq += 1
  return `sts-class-${Date.now().toString(36)}-${classSeq}`
}
function nextSampleId() {
  sampleSeq += 1
  return `sts-sample-${Date.now().toString(36)}-${sampleSeq}`
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function geomKindOf(g: GeoJSON.Geometry): SamTrainGeomKind {
  if (g.type === 'Point' || g.type === 'MultiPoint') return 'point'
  if (g.type === 'LineString' || g.type === 'MultiLineString') return 'line'
  return 'polygon'
}

/** Rough spherical area (m²) for polygon rings — enough for relative % stats. */
function roughAreaM2(geom: GeoJSON.Geometry): number {
  const rings: number[][][] = []
  if (geom.type === 'Polygon') rings.push(...geom.coordinates)
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(p => rings.push(...p))
  else return 1
  let area = 0
  for (const ring of rings) {
    if (ring.length < 3) continue
    let sum = 0
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[i + 1]
      sum += x1 * y2 - x2 * y1
    }
    area += Math.abs(sum) * 0.5
  }
  // degrees² → rough m² at mid-latitudes
  return Math.max(area * 111_320 * 111_320, 1)
}

function bboxOf(geom: GeoJSON.Geometry): [number, number, number, number] | null {
  const coords: number[][] = []
  const walk = (c: any) => {
    if (!c) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') coords.push(c as number[])
    else if (Array.isArray(c)) c.forEach(walk)
  }
  walk((geom as any).coordinates)
  if (!coords.length) return null
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity
  for (const [x, y] of coords) {
    if (x < w) w = x
    if (y < s) s = y
    if (x > e) e = x
    if (y > n) n = y
  }
  return [w, s, e, n]
}

export type SamTrainClassStat = {
  classId: string
  name: string
  color: string
  sampleCount: number
  pixelPct: number
}

export function useSamTrainingSamples() {
  const [schemaName, setSchemaName] = useState('NLCD2011')
  const [classes, setClasses] = useState<SamTrainClass[]>(() =>
    DEFAULT_SAM_TRAIN_SCHEMA.map((c, i) => ({ ...c, id: `sts-default-${i}` })),
  )
  const [activeClassId, setActiveClassId] = useState<string | null>(() => `sts-default-0`)
  const [samples, setSamples] = useState<SamTrainSample[]>([])
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>([])
  const [drawTool, setDrawTool] = useState<SamTrainDrawTool>('polygon')

  const activeClass = useMemo(
    () => classes.find(c => c.id === activeClassId) ?? null,
    [classes, activeClassId],
  )

  const addClass = useCallback((name?: string) => {
    setClasses(prev => {
      const idx = prev.length
      const cls: SamTrainClass = {
        id: nextClassId(),
        name: name?.trim() || `Class ${idx + 1}`,
        value: (prev[prev.length - 1]?.value ?? 0) + 10,
        color: SAM_TRAIN_CLASS_COLORS[idx % SAM_TRAIN_CLASS_COLORS.length],
      }
      setActiveClassId(cls.id)
      return [...prev, cls]
    })
  }, [])

  const removeClass = useCallback((id: string) => {
    setClasses(prev => prev.filter(c => c.id !== id))
    setSamples(prev => prev.filter(s => s.classId !== id))
    setActiveClassId(prev => (prev === id ? null : prev))
  }, [])

  const renameClass = useCallback((id: string, name: string) => {
    const n = name.trim()
    if (!n) return
    setClasses(prev => prev.map(c => (c.id === id ? { ...c, name: n } : c)))
  }, [])

  const setClassColor = useCallback((id: string, color: string) => {
    setClasses(prev => prev.map(c => (c.id === id ? { ...c, color } : c)))
  }, [])

  const resetSchema = useCallback(() => {
    const next = DEFAULT_SAM_TRAIN_SCHEMA.map((c, i) => ({ ...c, id: `sts-default-${Date.now()}-${i}` }))
    setClasses(next)
    setActiveClassId(next[0]?.id ?? null)
    setSamples([])
    setSelectedSampleIds([])
    setSchemaName('NLCD2011')
  }, [])

  const addSample = useCallback(
    (geometry: GeoJSON.Geometry, kind?: SamTrainGeomKind, classId?: string) => {
      const cid = classId ?? activeClassId
      if (!cid || !geometry) return null
      const sample: SamTrainSample = {
        id: nextSampleId(),
        classId: cid,
        kind: kind ?? geomKindOf(geometry),
        geometry,
        weight: geomKindOf(geometry) === 'point' || geomKindOf(geometry) === 'line' ? 1 : roughAreaM2(geometry),
        createdAt: Date.now(),
      }
      setSamples(prev => [...prev, sample])
      return sample
    },
    [activeClassId],
  )

  /** Promote SAM GeoJSON features into labeled training samples for the active class. */
  const addFromSamFeatures = useCallback(
    (features: GeoJSON.Feature[], asMask = false) => {
      const cid = activeClassId
      if (!cid || !features.length) return 0
      let n = 0
      setSamples(prev => {
        const next = [...prev]
        for (const f of features) {
          if (!f.geometry) continue
          const kind: SamTrainGeomKind = asMask ? 'mask' : geomKindOf(f.geometry)
          next.push({
            id: nextSampleId(),
            classId: cid,
            kind,
            geometry: f.geometry,
            weight: kind === 'point' || kind === 'line' ? 1 : roughAreaM2(f.geometry),
            createdAt: Date.now(),
          })
          n += 1
        }
        return next
      })
      return n
    },
    [activeClassId],
  )

  const removeSamples = useCallback((ids: string[]) => {
    if (!ids.length) return
    const set = new Set(ids)
    setSamples(prev => prev.filter(s => !set.has(s.id)))
    setSelectedSampleIds(prev => prev.filter(id => !set.has(id)))
  }, [])

  const clearSamples = useCallback(() => {
    setSamples([])
    setSelectedSampleIds([])
  }, [])

  const toggleSelectSample = useCallback((id: string) => {
    setSelectedSampleIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }, [])

  const mergeSelectedIntoActive = useCallback(() => {
    if (!activeClassId || selectedSampleIds.length < 2) return
    setSamples(prev =>
      prev.map(s => (selectedSampleIds.includes(s.id) ? { ...s, classId: activeClassId } : s)),
    )
  }, [activeClassId, selectedSampleIds])

  const classStats = useMemo<SamTrainClassStat[]>(() => {
    const totalWeight = samples.reduce((a, s) => a + (s.weight ?? 1), 0) || 1
    return classes.map(c => {
      const classSamples = samples.filter(s => s.classId === c.id)
      const w = classSamples.reduce((a, s) => a + (s.weight ?? 1), 0)
      return {
        classId: c.id,
        name: c.name,
        color: c.color,
        sampleCount: classSamples.length,
        pixelPct: Math.round((w / totalWeight) * 1000) / 10,
      }
    })
  }, [classes, samples])

  const samplesGeojson = useMemo<GeoJSON.FeatureCollection>(() => {
    const byId = new Map(classes.map(c => [c.id, c]))
    return {
      type: 'FeatureCollection',
      features: samples.map(s => {
        const cls = byId.get(s.classId)
        return {
          type: 'Feature',
          id: s.id,
          geometry: s.geometry,
          properties: {
            id: s.id,
            classId: s.classId,
            className: cls?.name ?? 'Unknown',
            classValue: cls?.value ?? 0,
            color: cls?.color ?? '#888888',
            kind: s.kind,
            selected: selectedSampleIds.includes(s.id),
          },
        }
      }),
    }
  }, [samples, classes, selectedSampleIds])

  const exportDataset = useCallback(
    (target: SamTrainExportTarget) => {
      const byId = new Map(classes.map(c => [c.id, c]))
      const features = samples.map(s => {
        const cls = byId.get(s.classId)
        return {
          type: 'Feature' as const,
          geometry: s.geometry,
          properties: {
            class_id: cls?.value ?? 0,
            class_name: cls?.name ?? 'Unknown',
            class_color: cls?.color ?? '#888',
            sample_kind: s.kind,
            sample_id: s.id,
          },
        }
      })

      if (target === 'geojson' || target === 'sam' || target === 'unet' || target === 'segformer') {
        const pack = {
          type: 'FeatureCollection',
          name: `${schemaName}_training_samples`,
          crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
          properties: {
            schema: schemaName,
            target_model: target,
            classes: classes.map(c => ({ id: c.value, name: c.name, color: c.color })),
            count: features.length,
          },
          features,
        }
        downloadBlob(
          `${schemaName.toLowerCase().replace(/\s+/g, '-')}-${target}-samples.geojson`,
          new Blob([JSON.stringify(pack, null, 2)], { type: 'application/geo+json' }),
        )
        return
      }

      // YOLO: one line per sample — class_id + normalized bbox (cx cy w h) in 0..1 over dataset extent
      let W = Infinity,
        S = Infinity,
        E = -Infinity,
        N = -Infinity
      for (const f of features) {
        const b = bboxOf(f.geometry)
        if (!b) continue
        W = Math.min(W, b[0])
        S = Math.min(S, b[1])
        E = Math.max(E, b[2])
        N = Math.max(N, b[3])
      }
      const spanX = Math.max(E - W, 1e-9)
      const spanY = Math.max(N - S, 1e-9)
      const lines: string[] = [`# ${schemaName} YOLO labels (class_id cx cy w h) CRS84-normalized`]
      for (const f of features) {
        const b = bboxOf(f.geometry)
        if (!b) continue
        const cx = ((b[0] + b[2]) / 2 - W) / spanX
        const cy = (N - (b[1] + b[3]) / 2) / spanY
        const bw = (b[2] - b[0]) / spanX
        const bh = (b[3] - b[1]) / spanY
        const cid = Number(f.properties.class_id) || 0
        lines.push(`${cid} ${cx.toFixed(6)} ${cy.toFixed(6)} ${bw.toFixed(6)} ${bh.toFixed(6)}`)
      }
      const classesTxt = classes.map(c => `${c.value},${c.name},${c.color}`).join('\n')
      downloadBlob(
        `${schemaName.toLowerCase().replace(/\s+/g, '-')}-yolo-classes.txt`,
        new Blob([`# id,name,color\n${classesTxt}\n`], { type: 'text/plain' }),
      )
      downloadBlob(
        `${schemaName.toLowerCase().replace(/\s+/g, '-')}-yolo-labels.txt`,
        new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }),
      )
    },
    [classes, samples, schemaName],
  )

  const importSchemaJson = useCallback(async (file: File) => {
    const text = await file.text()
    const json = JSON.parse(text) as any
    const list = Array.isArray(json) ? json : json.classes || json.schema || []
    if (!Array.isArray(list) || !list.length) throw new Error('No classes found in file.')
    const next: SamTrainClass[] = list.map((c: any, i: number) => ({
      id: nextClassId(),
      name: String(c.name || c.class || `Class ${i + 1}`),
      value: Number(c.value ?? c.id ?? i + 1) || i + 1,
      color: String(c.color || SAM_TRAIN_CLASS_COLORS[i % SAM_TRAIN_CLASS_COLORS.length]),
    }))
    setClasses(next)
    setActiveClassId(next[0]?.id ?? null)
    if (typeof json.name === 'string') setSchemaName(json.name)
  }, [])

  const importSamplesGeojson = useCallback(async (file: File) => {
    const text = await file.text()
    const json = JSON.parse(text) as GeoJSON.FeatureCollection
    if (!json?.features?.length) throw new Error('No features in GeoJSON.')
    setSamples(prev => {
      const next = [...prev]
      for (const f of json.features) {
        if (!f.geometry) continue
        const props = (f.properties || {}) as Record<string, unknown>
        let classId = activeClassId
        const byName = classes.find(
          c => c.name === props.class_name || c.name === props.className || c.value === Number(props.class_id),
        )
        if (byName) classId = byName.id
        if (!classId) continue
        next.push({
          id: nextSampleId(),
          classId,
          kind: (props.sample_kind as SamTrainGeomKind) || geomKindOf(f.geometry),
          geometry: f.geometry,
          weight: geomKindOf(f.geometry) === 'point' || geomKindOf(f.geometry) === 'line' ? 1 : roughAreaM2(f.geometry),
          createdAt: Date.now(),
        })
      }
      return next
    })
  }, [activeClassId, classes])

  const saveSchema = useCallback(() => {
    const pack = {
      name: schemaName,
      classes: classes.map(c => ({ name: c.name, value: c.value, color: c.color })),
    }
    downloadBlob(
      `${schemaName.toLowerCase().replace(/\s+/g, '-')}-schema.json`,
      new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }),
    )
  }, [classes, schemaName])

  return {
    schemaName,
    setSchemaName,
    classes,
    activeClassId,
    setActiveClassId,
    activeClass,
    samples,
    selectedSampleIds,
    drawTool,
    setDrawTool,
    classStats,
    samplesGeojson,
    sampleCount: samples.length,
    addClass,
    removeClass,
    renameClass,
    setClassColor,
    resetSchema,
    addSample,
    addFromSamFeatures,
    removeSamples,
    clearSamples,
    toggleSelectSample,
    setSelectedSampleIds,
    mergeSelectedIntoActive,
    exportDataset,
    importSchemaJson,
    importSamplesGeojson,
    saveSchema,
  }
}

export type UseSamTrainingSamplesReturn = ReturnType<typeof useSamTrainingSamples>
