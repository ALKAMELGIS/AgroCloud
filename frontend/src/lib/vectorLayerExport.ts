/**
 * Browser-side vector export: KMZ, Shapefile ZIP (Point/Polygon), XLSX.
 */
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { downloadBlob } from './hydroWatershed/geoTiffExport'

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

export type VectorExportFormat = 'kmz' | 'kml' | 'shp' | 'xlsx' | 'geojson' | 'csv'

function safeBaseName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
    .replace(/\s+/g, '_')
  return cleaned.slice(0, 80) || 'layer'
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function asFeatureCollection(input: unknown): FeatureCollection {
  if (!input || typeof input !== 'object') {
    return { type: 'FeatureCollection', features: [] }
  }
  const any = input as { type?: string; features?: Feature[]; geometry?: Geometry }
  if (any.type === 'FeatureCollection' && Array.isArray(any.features)) {
    return { type: 'FeatureCollection', features: any.features }
  }
  if (any.type === 'Feature') {
    return { type: 'FeatureCollection', features: [any as Feature] }
  }
  if (any.type && any.geometry == null && 'coordinates' in (any as object)) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: any as Geometry }],
    }
  }
  return { type: 'FeatureCollection', features: [] }
}

function featureCentroid(geom: Geometry | null | undefined): [number, number] | null {
  if (!geom) return null
  const pts: number[][] = []
  const walk = (c: unknown): void => {
    if (!c) return
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      pts.push(c as number[])
      return
    }
    if (Array.isArray(c)) c.forEach(walk)
  }
  walk((geom as { coordinates?: unknown }).coordinates)
  if (!pts.length) return null
  let sx = 0
  let sy = 0
  for (const [x, y] of pts) {
    sx += x
    sy += y
  }
  return [sx / pts.length, sy / pts.length]
}

function coordListKml(ring: number[][]): string {
  return ring.map(c => `${c[0]},${c[1]},0`).join(' ')
}

function geometryToKml(geom: Geometry): string {
  if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates as [number, number]
    return `<Point><coordinates>${lng},${lat},0</coordinates></Point>`
  }
  if (geom.type === 'MultiPoint') {
    return (geom.coordinates as number[][])
      .map(c => `<Point><coordinates>${c[0]},${c[1]},0</coordinates></Point>`)
      .join('')
  }
  if (geom.type === 'LineString') {
    return `<LineString><coordinates>${coordListKml(geom.coordinates as number[][])}</coordinates></LineString>`
  }
  if (geom.type === 'MultiLineString') {
    return `<MultiGeometry>${(geom.coordinates as number[][][])
      .map(line => `<LineString><coordinates>${coordListKml(line)}</coordinates></LineString>`)
      .join('')}</MultiGeometry>`
  }
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates as number[][][]
    const outer = rings[0] ?? []
    const holes = rings.slice(1)
    return (
      `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordListKml(outer)}</coordinates></LinearRing></outerBoundaryIs>` +
      holes
        .map(
          h =>
            `<innerBoundaryIs><LinearRing><coordinates>${coordListKml(h)}</coordinates></LinearRing></innerBoundaryIs>`,
        )
        .join('') +
      `</Polygon>`
    )
  }
  if (geom.type === 'MultiPolygon') {
    return `<MultiGeometry>${(geom.coordinates as number[][][][])
      .map(poly =>
        geometryToKml({ type: 'Polygon', coordinates: poly }),
      )
      .join('')}</MultiGeometry>`
  }
  return ''
}

function propsDescription(props: Record<string, unknown> | null | undefined): string {
  if (!props) return ''
  return Object.entries(props)
    .slice(0, 40)
    .map(([k, v]) => `<b>${escapeXml(k)}</b>: ${escapeXml(String(v ?? ''))}`)
    .join('<br/>')
}

function buildKmlDocument(input: FeatureCollection | unknown, documentName: string): string {
  const fc = asFeatureCollection(input)
  if (!fc.features.length) throw new Error('No features to export.')
  const placemarks = fc.features
    .map((f, i) => {
      if (!f.geometry) return ''
      const props = (f.properties ?? {}) as Record<string, unknown>
      const name = String(props.name ?? props.NAME ?? props.id ?? f.id ?? `Feature ${i + 1}`)
      const geom = geometryToKml(f.geometry)
      if (!geom) return ''
      return (
        `<Placemark><name>${escapeXml(name)}</name>` +
        `<description><![CDATA[${propsDescription(props)}]]></description>${geom}</Placemark>`
      )
    })
    .filter(Boolean)
    .join('')
  if (!placemarks) throw new Error('No drawable geometries for KML.')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
    `<name>${escapeXml(documentName)}</name>${placemarks}</Document></kml>`
  )
}

/** Build & download a plain KML for any geometry types. */
export function downloadVectorKml(
  input: FeatureCollection | unknown,
  fileName = 'layer.kml',
  documentName = 'AgroCloud Export',
): void {
  const kml = buildKmlDocument(input, documentName)
  downloadBlob(
    new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
    fileName.endsWith('.kml') ? fileName : `${safeBaseName(fileName)}.kml`,
  )
}

/** Build & download a KMZ (zipped KML) for any geometry types. */
export async function downloadVectorKmz(
  input: FeatureCollection | unknown,
  fileName = 'layer.kmz',
  documentName = 'AgroCloud Export',
): Promise<void> {
  const kml = buildKmlDocument(input, documentName)
  const zip = new JSZip()
  zip.file('doc.kml', kml)
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, fileName.endsWith('.kmz') ? fileName : `${safeBaseName(fileName)}.kmz`)
}

function csvEscape(value: unknown): string {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Attribute table CSV (+ lon/lat centroid columns). */
export function downloadVectorCsv(
  input: FeatureCollection | unknown,
  fileName = 'layer.csv',
): void {
  const fc = asFeatureCollection(input)
  if (!fc.features.length) throw new Error('No features to export.')

  const keySet = new Set<string>()
  for (const f of fc.features) {
    for (const k of Object.keys(f.properties ?? {})) keySet.add(k)
  }
  const keys = [...keySet].slice(0, 80)
  const header = ['FID', 'geometry', 'lon', 'lat', ...keys].map(csvEscape).join(',')
  const lines = fc.features.map((f, i) => {
    const props = (f.properties ?? {}) as Record<string, unknown>
    const c = featureCentroid(f.geometry)
    const cells = [
      i + 1,
      f.geometry?.type ?? '',
      c ? Number(c[0].toFixed(6)) : '',
      c ? Number(c[1].toFixed(6)) : '',
      ...keys.map(k => props[k] ?? ''),
    ]
    return cells.map(csvEscape).join(',')
  })
  downloadBlob(
    new Blob([`\uFEFF${[header, ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' }),
    fileName.endsWith('.csv') ? fileName : `${safeBaseName(fileName)}.csv`,
  )
}

/** Download GeoJSON FeatureCollection. */
export function downloadVectorGeoJson(
  input: FeatureCollection | unknown,
  fileName = 'layer.geojson',
): void {
  const fc = asFeatureCollection(input)
  if (!fc.features.length) throw new Error('No features to export.')
  const base = safeBaseName(fileName)
  downloadBlob(
    new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' }),
    fileName.endsWith('.geojson') || fileName.endsWith('.json') ? fileName : `${base}.geojson`,
  )
}

type DbfField =
  | { name: string; type: 'C'; length: number }
  | { name: string; type: 'N'; length: number; decimals: number }

function asciiBytes(text: string, length: number, padLeft: boolean): Uint8Array {
  const out = new Uint8Array(length).fill(0x20)
  const clean = Array.from(text)
    .map(ch => {
      const code = ch.charCodeAt(0)
      return code >= 32 && code <= 126 ? ch : '?'
    })
    .join('')
  const slice = clean.slice(0, length)
  const start = padLeft ? length - slice.length : 0
  for (let i = 0; i < slice.length; i += 1) out[start + i] = slice.charCodeAt(i)
  return out
}

function buildDbf(fields: DbfField[], records: Array<(string | number)[]>): Uint8Array {
  const recordLength = 1 + fields.reduce((sum, f) => sum + f.length, 0)
  const headerLength = 32 + 32 * fields.length + 1
  const totalLength = headerLength + recordLength * records.length + 1
  const buf = new Uint8Array(totalLength)
  const view = new DataView(buf.buffer)
  buf[0] = 0x03
  const now = new Date()
  buf[1] = now.getFullYear() - 1900
  buf[2] = now.getMonth() + 1
  buf[3] = now.getDate()
  view.setUint32(4, records.length, true)
  view.setUint16(8, headerLength, true)
  view.setUint16(10, recordLength, true)
  let offset = 32
  for (const field of fields) {
    for (let i = 0; i < 11; i += 1) buf[offset + i] = i < field.name.length ? field.name.charCodeAt(i) : 0
    buf[offset + 11] = field.type.charCodeAt(0)
    buf[offset + 16] = field.length
    buf[offset + 17] = field.type === 'N' ? field.decimals : 0
    offset += 32
  }
  buf[offset] = 0x0d
  offset += 1
  for (const values of records) {
    buf[offset] = 0x20
    offset += 1
    for (let fi = 0; fi < fields.length; fi += 1) {
      const field = fields[fi]!
      const raw = values[fi]
      let text: string
      if (field.type === 'N') {
        const n = typeof raw === 'number' ? raw : Number(raw)
        text = Number.isFinite(n) ? n.toFixed(field.decimals) : ''
      } else {
        text = String(raw ?? '')
      }
      const bytes = asciiBytes(text, field.length, field.type === 'N')
      buf.set(bytes, offset)
      offset += field.length
    }
  }
  buf[offset] = 0x1a
  return buf
}

function dbfFieldName(raw: string, used: Set<string>): string {
  let base = raw
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+/, '')
    .toUpperCase()
    .slice(0, 10)
  if (!base || !/^[A-Z]/.test(base)) base = `F_${base || 'ATTR'}`.slice(0, 10)
  let name = base
  let n = 1
  while (used.has(name)) {
    const suffix = String(n++)
    name = `${base.slice(0, Math.max(1, 10 - suffix.length))}${suffix}`
  }
  used.add(name)
  return name
}

function inferDbfSchema(features: Feature[], maxFields = 12): {
  fields: DbfField[]
  keys: string[]
} {
  const used = new Set<string>()
  const keys: string[] = []
  const fieldByKey = new Map<string, DbfField>()
  for (const f of features) {
    const props = (f.properties ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(props)) {
      if (keys.length >= maxFields && !fieldByKey.has(k)) continue
      if (!fieldByKey.has(k)) {
        keys.push(k)
        const name = dbfFieldName(k, used)
        if (typeof v === 'number' && Number.isFinite(v)) {
          fieldByKey.set(k, { name, type: 'N', length: 14, decimals: 4 })
        } else {
          fieldByKey.set(k, { name, type: 'C', length: 64 })
        }
      } else if (fieldByKey.get(k)!.type === 'N' && !(typeof v === 'number' && Number.isFinite(v)) && v != null) {
        const prev = fieldByKey.get(k)!
        fieldByKey.set(k, { name: prev.name, type: 'C', length: 64 })
      }
    }
  }
  if (!keys.length) {
    keys.push('FID')
    fieldByKey.set('FID', { name: 'FID', type: 'N', length: 10, decimals: 0 })
  }
  return { fields: keys.map(k => fieldByKey.get(k)!), keys }
}

function rowValues(f: Feature, keys: string[], index: number): (string | number)[] {
  const props = (f.properties ?? {}) as Record<string, unknown>
  return keys.map(k => {
    if (k === 'FID' && props.FID == null && props.fid == null) return index + 1
    const v = props[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (v == null) return ''
    return String(v)
  })
}

function writePointShp(
  records: Array<{ lng: number; lat: number }>,
): { shp: Uint8Array; shx: Uint8Array } {
  const RECORD_CONTENT_WORDS = 10
  const recordTotalBytes = 8 + RECORD_CONTENT_WORDS * 2
  const shp = new Uint8Array(100 + records.length * recordTotalBytes)
  const shx = new Uint8Array(100 + records.length * 8)
  const shpView = new DataView(shp.buffer)
  const shxView = new DataView(shx.buffer)
  for (const view of [shpView, shxView]) {
    view.setInt32(0, 9994, false)
    view.setInt32(28, 1000, false)
    view.setInt32(32, 1, true)
  }
  let xmin = Infinity
  let ymin = Infinity
  let xmax = -Infinity
  let ymax = -Infinity
  for (const r of records) {
    if (r.lng < xmin) xmin = r.lng
    if (r.lat < ymin) ymin = r.lat
    if (r.lng > xmax) xmax = r.lng
    if (r.lat > ymax) ymax = r.lat
  }
  for (const view of [shpView, shxView]) {
    view.setFloat64(36, xmin, true)
    view.setFloat64(44, ymin, true)
    view.setFloat64(52, xmax, true)
    view.setFloat64(60, ymax, true)
  }
  const shpFileWords = (100 + records.length * recordTotalBytes) / 2
  const shxFileWords = (100 + records.length * 8) / 2
  shpView.setInt32(24, shpFileWords, false)
  shxView.setInt32(24, shxFileWords, false)
  let shpOffset = 100
  let recordOffsetWords = 50
  for (let i = 0; i < records.length; i += 1) {
    const r = records[i]!
    shpView.setInt32(shpOffset, i + 1, false)
    shpView.setInt32(shpOffset + 4, RECORD_CONTENT_WORDS, false)
    shpView.setInt32(shpOffset + 8, 1, true)
    shpView.setFloat64(shpOffset + 12, r.lng, true)
    shpView.setFloat64(shpOffset + 20, r.lat, true)
    shpOffset += recordTotalBytes
    shxView.setInt32(100 + i * 8, recordOffsetWords, false)
    shxView.setInt32(100 + i * 8 + 4, RECORD_CONTENT_WORDS, false)
    recordOffsetWords += 4 + RECORD_CONTENT_WORDS
  }
  return { shp, shx }
}

function ringToParts(ring: number[][]): Float64Array {
  const n = ring.length
  const coords = new Float64Array(n * 2)
  for (let i = 0; i < n; i += 1) {
    coords[i * 2] = ring[i]![0]!
    coords[i * 2 + 1] = ring[i]![1]!
  }
  return coords
}

function writePolygonShp(features: Feature[]): { shp: Uint8Array; shx: Uint8Array } {
  type Rec = { parts: number[]; points: Float64Array; xmin: number; ymin: number; xmax: number; ymax: number }
  const records: Rec[] = []
  let fileXmin = Infinity
  let fileYmin = Infinity
  let fileXmax = -Infinity
  let fileYmax = -Infinity

  for (const f of features) {
    if (!f.geometry) continue
    const geoms: Geometry[] =
      f.geometry.type === 'MultiPolygon'
        ? (f.geometry.coordinates as number[][][][]).map(coords => ({
            type: 'Polygon' as const,
            coordinates: coords,
          }))
        : [f.geometry]
    for (const g of geoms) {
      if (g.type !== 'Polygon') continue
      const rings = g.coordinates as number[][][]
      if (!rings.length) continue
      const parts: number[] = []
      const pointChunks: Float64Array[] = []
      let pointCount = 0
      let xmin = Infinity
      let ymin = Infinity
      let xmax = -Infinity
      let ymax = -Infinity
      for (const ring of rings) {
        if (!ring?.length) continue
        parts.push(pointCount)
        const pts = ringToParts(ring)
        pointChunks.push(pts)
        for (let i = 0; i < pts.length; i += 2) {
          const x = pts[i]!
          const y = pts[i + 1]!
          if (x < xmin) xmin = x
          if (y < ymin) ymin = y
          if (x > xmax) xmax = x
          if (y > ymax) ymax = y
        }
        pointCount += pts.length / 2
      }
      if (!parts.length) continue
      const points = new Float64Array(pointCount * 2)
      let o = 0
      for (const chunk of pointChunks) {
        points.set(chunk, o)
        o += chunk.length
      }
      records.push({ parts, points, xmin, ymin, xmax, ymax })
      if (xmin < fileXmin) fileXmin = xmin
      if (ymin < fileYmin) fileYmin = ymin
      if (xmax > fileXmax) fileXmax = xmax
      if (ymax > fileYmax) fileYmax = ymax
    }
  }

  const recSizes = records.map(r => {
    const content = 4 + 32 + 4 + 4 + r.parts.length * 4 + r.points.length * 8
    return 8 + content
  })
  const shp = new Uint8Array(100 + recSizes.reduce((a, b) => a + b, 0))
  const shx = new Uint8Array(100 + records.length * 8)
  const shpView = new DataView(shp.buffer)
  const shxView = new DataView(shx.buffer)
  for (const view of [shpView, shxView]) {
    view.setInt32(0, 9994, false)
    view.setInt32(28, 1000, false)
    view.setInt32(32, 5, true)
    view.setFloat64(36, fileXmin, true)
    view.setFloat64(44, fileYmin, true)
    view.setFloat64(52, fileXmax, true)
    view.setFloat64(60, fileYmax, true)
  }
  shpView.setInt32(24, shp.length / 2, false)
  shxView.setInt32(24, shx.length / 2, false)

  let offset = 100
  let offsetWords = 50
  for (let ri = 0; ri < records.length; ri += 1) {
    const r = records[ri]!
    const contentBytes = recSizes[ri]! - 8
    shxView.setInt32(100 + ri * 8, offsetWords, false)
    shxView.setInt32(100 + ri * 8 + 4, contentBytes / 2, false)
    shpView.setInt32(offset, ri + 1, false)
    shpView.setInt32(offset + 4, contentBytes / 2, false)
    offset += 8
    shpView.setInt32(offset, 5, true)
    offset += 4
    shpView.setFloat64(offset, r.xmin, true)
    shpView.setFloat64(offset + 8, r.ymin, true)
    shpView.setFloat64(offset + 16, r.xmax, true)
    shpView.setFloat64(offset + 24, r.ymax, true)
    offset += 32
    shpView.setInt32(offset, r.parts.length, true)
    offset += 4
    shpView.setInt32(offset, r.points.length / 2, true)
    offset += 4
    for (const p of r.parts) {
      shpView.setInt32(offset, p, true)
      offset += 4
    }
    for (let i = 0; i < r.points.length; i += 2) {
      shpView.setFloat64(offset, r.points[i]!, true)
      shpView.setFloat64(offset + 8, r.points[i + 1]!, true)
      offset += 16
    }
    offsetWords += recSizes[ri]! / 2
  }
  return { shp, shx }
}

function classifyExportGeometry(fc: FeatureCollection): 'point' | 'polygon' | 'mixed' | 'empty' {
  let points = 0
  let polygons = 0
  let other = 0
  for (const f of fc.features) {
    const t = f.geometry?.type
    if (!t) continue
    if (t === 'Point' || t === 'MultiPoint') points += 1
    else if (t === 'Polygon' || t === 'MultiPolygon') polygons += 1
    else other += 1
  }
  if (!points && !polygons && !other) return 'empty'
  if (points && !polygons && !other) return 'point'
  if (polygons && !points && !other) return 'polygon'
  if (polygons && !points) return 'polygon'
  if (points && !polygons) return 'point'
  return 'mixed'
}

/** Download shapefile ZIP (Point or Polygon). Lines / mixed types are rejected. */
export async function downloadVectorShapefile(
  input: FeatureCollection | unknown,
  baseName = 'layer',
): Promise<void> {
  const fc = asFeatureCollection(input)
  const kind = classifyExportGeometry(fc)
  if (kind === 'empty') throw new Error('No features to export.')
  if (kind === 'mixed') {
    throw new Error('SHP export needs a single geometry family (all Points or all Polygons). Use KMZ or XLSX for mixed layers.')
  }

  const base = safeBaseName(baseName)
  const zip = new JSZip()

  if (kind === 'point') {
    const pointFeatures = fc.features.filter(
      f => f.geometry && (f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint'),
    )
    const expanded: Feature[] = []
    for (const f of pointFeatures) {
      if (f.geometry?.type === 'MultiPoint') {
        for (const c of f.geometry.coordinates as number[][]) {
          expanded.push({
            type: 'Feature',
            properties: f.properties,
            geometry: { type: 'Point', coordinates: c },
          })
        }
      } else {
        expanded.push(f)
      }
    }
    const { fields, keys } = inferDbfSchema(expanded)
    const records = expanded.map((f, i) => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number]
      return { lng, lat, values: rowValues(f, keys, i) }
    })
    const { shp, shx } = writePointShp(records)
    const dbf = buildDbf(
      fields,
      records.map(r => r.values),
    )
    zip.file(`${base}.shp`, shp)
    zip.file(`${base}.shx`, shx)
    zip.file(`${base}.dbf`, dbf)
    zip.file(`${base}.prj`, WGS84_PRJ)
  } else {
    const polyFeatures = fc.features.filter(
      f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
    )
    const expanded: Feature[] = []
    const dbfRows: Array<(string | number)[]> = []
    const { fields, keys } = inferDbfSchema(polyFeatures)
    for (let i = 0; i < polyFeatures.length; i += 1) {
      const f = polyFeatures[i]!
      const row = rowValues(f, keys, i)
      if (f.geometry?.type === 'MultiPolygon') {
        for (const coords of f.geometry.coordinates) {
          expanded.push({
            type: 'Feature',
            properties: f.properties,
            geometry: { type: 'Polygon', coordinates: coords },
          })
          dbfRows.push(row)
        }
      } else {
        expanded.push(f)
        dbfRows.push(row)
      }
    }
    if (!expanded.length) throw new Error('No polygon features to export.')
    const { shp, shx } = writePolygonShp(expanded)
    const dbf = buildDbf(fields, dbfRows)
    zip.file(`${base}.shp`, shp)
    zip.file(`${base}.shx`, shx)
    zip.file(`${base}.dbf`, dbf)
    zip.file(`${base}.prj`, WGS84_PRJ)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `${base}.zip`)
}

/** Attribute table workbook (+ lon/lat centroid columns). */
export function downloadVectorXlsx(
  input: FeatureCollection | unknown,
  fileName = 'layer.xlsx',
  sheetName = 'Features',
): void {
  const fc = asFeatureCollection(input)
  if (!fc.features.length) throw new Error('No features to export.')

  const keySet = new Set<string>()
  for (const f of fc.features) {
    for (const k of Object.keys(f.properties ?? {})) keySet.add(k)
  }
  const keys = [...keySet].slice(0, 80)
  const rows = fc.features.map((f, i) => {
    const props = (f.properties ?? {}) as Record<string, unknown>
    const c = featureCentroid(f.geometry)
    const row: Record<string, unknown> = {
      FID: i + 1,
      geometry: f.geometry?.type ?? '',
      lon: c ? Number(c[0].toFixed(6)) : '',
      lat: c ? Number(c[1].toFixed(6)) : '',
    }
    for (const k of keys) row[k] = props[k] ?? ''
    return row
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Features')
  const raw = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([raw], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, fileName.endsWith('.xlsx') ? fileName : `${safeBaseName(fileName)}.xlsx`)
}

export async function exportVectorLayer(
  input: FeatureCollection | unknown,
  format: VectorExportFormat,
  baseName = 'layer',
): Promise<void> {
  const base = safeBaseName(baseName)
  if (format === 'kmz') await downloadVectorKmz(input, `${base}.kmz`, base)
  else if (format === 'kml') downloadVectorKml(input, `${base}.kml`, base)
  else if (format === 'shp') await downloadVectorShapefile(input, base)
  else if (format === 'geojson') downloadVectorGeoJson(input, `${base}.geojson`)
  else if (format === 'csv') downloadVectorCsv(input, `${base}.csv`)
  else downloadVectorXlsx(input, `${base}.xlsx`, base)
}

export { asFeatureCollection, safeBaseName }
