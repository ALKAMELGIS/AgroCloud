import JSZip from 'jszip'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { downloadBlob } from './geoTiffExport'
import { contourElevationStrokeColor, type HydroVectorResult } from './hydroEngine'

export type HydroStreamModel = 'strahler' | 'shreve'

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ]
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function lerpHex(c0: string, c1: string, t: number): string {
  const [r0, g0, b0] = parseHex(c0)
  const [r1, g1, b1] = parseHex(c1)
  const r = lerpChannel(r0, r1, t)
  const g = lerpChannel(g0, g1, t)
  const b = lerpChannel(b0, b1, t)
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`
}

/** Same ramp as SatelliteIntelligence stream line paint. */
export function streamLineColor(value: number, model: HydroStreamModel, maxVal: number): string {
  const max = Math.max(2, maxVal)
  const mid = 1 + (max - 1) / 2
  const v = Math.min(max, Math.max(1, value))
  const stops =
    model === 'shreve'
      ? [
          [1, '#bae6fd'],
          [mid, '#2563eb'],
          [max, '#f97316'],
        ]
      : [
          [1, '#93c5fd'],
          [mid, '#2563eb'],
          [max, '#dc2626'],
        ]
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [a, c0] = stops[i]!
    const [b, c1] = stops[i + 1]!
    if (v <= b) {
      const t = b === a ? 0 : (v - a) / (b - a)
      return lerpHex(c0, c1, Math.min(1, Math.max(0, t)))
    }
  }
  return stops[stops.length - 1]![1]!
}

export function hexToKmlAbgr(hex: string, alpha = 255): string {
  const [r, g, b] = parseHex(hex)
  const aa = alpha.toString(16).padStart(2, '0')
  const bb = b.toString(16).padStart(2, '0')
  const gg = g.toString(16).padStart(2, '0')
  const rr = r.toString(16).padStart(2, '0')
  return `${aa}${bb}${gg}${rr}`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function coordListKml(ring: number[][]): string {
  return ring.map(c => `${c[0]},${c[1]},0`).join(' ')
}

function geometryToKml(geom: Geometry): string {
  if (geom.type === 'LineString') {
    return `<LineString><coordinates>${coordListKml(geom.coordinates as number[][])}</coordinates></LineString>`
  }
  if (geom.type === 'MultiLineString') {
    return `<MultiGeometry>${(geom.coordinates as number[][][])
      .map(line => `<LineString><coordinates>${coordListKml(line)}</coordinates></LineString>`)
      .join('')}</MultiGeometry>`
  }
  if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates as [number, number]
    return `<Point><coordinates>${lng},${lat},0</coordinates></Point>`
  }
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates as number[][][]
    const outer = rings[0] ?? []
    return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordListKml(outer)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
  }
  return ''
}

export type StyledLineProps = {
  stroke: string
  stroke_width: number
  color_r: number
  color_g: number
  color_b: number
}

export function styledPropsForHydroFeature(
  result: HydroVectorResult,
  feature: Feature,
  streamModel: HydroStreamModel,
): StyledLineProps | null {
  const props = feature.properties ?? {}
  if (result.render === 'streams') {
    const prop = streamModel === 'shreve' ? 'shreve' : 'strahler'
    const maxVal =
      streamModel === 'shreve' ? Math.max(2, result.maxShreve ?? 1) : Math.max(2, result.maxStrahler ?? 1)
    const stroke = streamLineColor(Number(props[prop] ?? 1), streamModel, maxVal)
    const [r, g, b] = parseHex(stroke)
    return { stroke, stroke_width: 2, color_r: r, color_g: g, color_b: b }
  }
  if (result.render === 'contours') {
    const elev = Number(props.elev)
    let eMin = result.elevMin
    let eMax = result.elevMax
    if (!Number.isFinite(eMin) || !Number.isFinite(eMax)) {
      eMin = elev
      eMax = elev
    }
    const stroke = contourElevationStrokeColor(elev, eMin!, eMax!)
    const stroke_width = props.index === 1 ? 2.4 : 1.15
    const [r, g, b] = parseHex(stroke)
    return { stroke, stroke_width, color_r: r, color_g: g, color_b: b }
  }
  return null
}

export function enrichHydroVectorForExport(
  result: HydroVectorResult,
  streamModel: HydroStreamModel,
): FeatureCollection {
  const features = result.data.features.map(f => {
    const styled = styledPropsForHydroFeature(result, f, streamModel)
    if (!styled) return f
    return {
      ...f,
      properties: {
        ...(f.properties ?? {}),
        stroke: styled.stroke,
        stroke_width: styled.stroke_width,
        color_r: styled.color_r,
        color_g: styled.color_g,
        color_b: styled.color_b,
      },
    }
  })
  return { type: 'FeatureCollection', features }
}

export function buildStyledHydroPlacemarksXml(fc: FeatureCollection): string {
  if (!fc.features.length) throw new Error('No features to export.')
  const placemarks = fc.features
    .map((f, i) => {
      if (!f.geometry) return ''
      const props = (f.properties ?? {}) as Record<string, unknown>
      const name = String(props.name ?? props.elev ?? props.order ?? props.strahler ?? `Feature ${i + 1}`)
      const geom = geometryToKml(f.geometry)
      if (!geom) return ''
      const stroke = typeof props.stroke === 'string' ? props.stroke : '#2563eb'
      const width = Number(props.stroke_width ?? 1.5)
      const kmlColor = hexToKmlAbgr(stroke)
      return (
        `<Placemark><name>${escapeXml(name)}</name>` +
        `<Style><LineStyle><color>${kmlColor}</color><width>${width}</width></LineStyle></Style>` +
        geom +
        `</Placemark>`
      )
    })
    .filter(Boolean)
    .join('')
  if (!placemarks) throw new Error('No drawable geometries for KML.')
  return placemarks
}

export function buildStyledHydroKmlDocument(fc: FeatureCollection, documentName: string): string {
  const placemarks = buildStyledHydroPlacemarksXml(fc)
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
    `<name>${escapeXml(documentName)}</name>${placemarks}</Document></kml>`
  )
}

export function downloadStyledHydroKml(fc: FeatureCollection, fileName: string, documentName: string): void {
  const kml = buildStyledHydroKmlDocument(fc, documentName)
  downloadBlob(
    new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
    fileName.endsWith('.kml') ? fileName : `${fileName}.kml`,
  )
}

export async function downloadStyledHydroKmz(
  fc: FeatureCollection,
  fileName: string,
  documentName: string,
): Promise<void> {
  const kml = buildStyledHydroKmlDocument(fc, documentName)
  const zip = new JSZip()
  zip.file('doc.kml', kml)
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, fileName.endsWith('.kmz') ? fileName : `${fileName}.kmz`)
}

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

function writePolylineShp(features: Feature[]): { shp: Uint8Array; shx: Uint8Array } {
  type Rec = { points: Float64Array; xmin: number; ymin: number; xmax: number; ymax: number }
  const records: Rec[] = []
  let fileXmin = Infinity
  let fileYmin = Infinity
  let fileXmax = -Infinity
  let fileYmax = -Infinity

  for (const f of features) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue
    const line = f.geometry.coordinates as number[][]
    if (line.length < 2) continue
    const points = new Float64Array(line.length * 2)
    let xmin = Infinity
    let ymin = Infinity
    let xmax = -Infinity
    let ymax = -Infinity
    for (let i = 0; i < line.length; i += 1) {
      const lng = line[i]![0]!
      const lat = line[i]![1]!
      points[i * 2] = lng
      points[i * 2 + 1] = lat
      if (lng < xmin) xmin = lng
      if (lat < ymin) ymin = lat
      if (lng > xmax) xmax = lng
      if (lat > ymax) ymax = lat
    }
    records.push({ points, xmin, ymin, xmax, ymax })
    if (xmin < fileXmin) fileXmin = xmin
    if (ymin < fileYmin) fileYmin = ymin
    if (xmax > fileXmax) fileXmax = xmax
    if (ymax > fileYmax) fileYmax = ymax
  }

  if (!records.length) throw new Error('No line features to export.')

  const recSizes = records.map(r => {
    const content = 4 + 32 + 4 + 4 + 4 + r.points.length * 8
    return 8 + content
  })
  const shp = new Uint8Array(100 + recSizes.reduce((a, b) => a + b, 0))
  const shx = new Uint8Array(100 + records.length * 8)
  const shpView = new DataView(shp.buffer)
  const shxView = new DataView(shx.buffer)
  for (const view of [shpView, shxView]) {
    view.setInt32(0, 9994, false)
    view.setInt32(28, 1000, false)
    view.setInt32(32, 3, true)
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
    shpView.setInt32(offset, 3, true)
    offset += 4
    shpView.setFloat64(offset, r.xmin, true)
    shpView.setFloat64(offset + 8, r.ymin, true)
    shpView.setFloat64(offset + 16, r.xmax, true)
    shpView.setFloat64(offset + 24, r.ymax, true)
    offset += 32
    shpView.setInt32(offset, 1, true)
    offset += 4
    shpView.setInt32(offset, r.points.length / 2, true)
    offset += 4
    shpView.setInt32(offset, 0, true)
    offset += 4
    for (let i = 0; i < r.points.length; i += 2) {
      shpView.setFloat64(offset, r.points[i]!, true)
      shpView.setFloat64(offset + 8, r.points[i + 1]!, true)
      offset += 16
    }
    offsetWords += recSizes[ri]! / 2
  }
  return { shp, shx }
}

function dbfFieldName(key: string, used: Set<string>): string {
  let base = key.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 10) || 'FIELD'
  if (/^[0-9]/.test(base)) base = `F_${base}`.slice(0, 10)
  let name = base
  let n = 1
  while (used.has(name.toUpperCase())) {
    const suffix = String(n)
    name = `${base.slice(0, 10 - suffix.length)}${suffix}`
    n += 1
  }
  used.add(name.toUpperCase())
  return name
}

function buildMinimalDbf(
  features: Feature[],
  keys: string[],
): Uint8Array {
  const used = new Set<string>()
  const fields = keys.map(k => ({ key: k, name: dbfFieldName(k, used), len: 50 }))
  const headerSize = 32 + fields.length * 32 + 1
  const recordSize = 1 + fields.reduce((s, f) => s + f.len, 0)
  const buf = new Uint8Array(headerSize + features.length * recordSize)
  const view = new DataView(buf.buffer)
  view.setUint8(0, 0x03)
  const now = new Date()
  view.setUint8(1, now.getFullYear() - 1900)
  view.setUint8(2, now.getMonth() + 1)
  view.setUint8(3, now.getDate())
  view.setInt32(4, buf.length, true)
  view.setInt16(8, headerSize, true)
  view.setInt16(10, recordSize, true)
  let off = 32
  for (const f of fields) {
    for (let i = 0; i < f.name.length; i += 1) view.setUint8(off + i, f.name.charCodeAt(i))
    view.setUint8(off + 11, 67)
    view.setUint8(off + 16, f.len)
    off += 32
  }
  view.setUint8(off, 0x0d)
  let recOff = headerSize
  for (const f of features) {
    view.setUint8(recOff, 0x20)
    recOff += 1
    const props = (f.properties ?? {}) as Record<string, unknown>
    for (const field of fields) {
      const raw = String(props[field.key] ?? '').slice(0, field.len)
      for (let i = 0; i < field.len; i += 1) {
        view.setUint8(recOff + i, i < raw.length ? raw.charCodeAt(i) : 0x20)
      }
      recOff += field.len
    }
  }
  return buf
}

/** Polyline SHP with RGB + width attributes for symbology in desktop GIS. */
export async function downloadHydroStyledLineShapefile(
  fc: FeatureCollection,
  baseName: string,
): Promise<void> {
  const lineFeatures = fc.features.filter(f => f.geometry?.type === 'LineString')
  if (!lineFeatures.length) throw new Error('No line features to export.')
  const keys = ['elev', 'index', 'strahler', 'shreve', 'order', 'accum', 'stroke', 'stroke_width', 'color_r', 'color_g', 'color_b']
  const { shp, shx } = writePolylineShp(lineFeatures)
  const dbf = buildMinimalDbf(lineFeatures, keys)
  const zip = new JSZip()
  const base = baseName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'hydro'
  zip.file(`${base}.shp`, shp)
  zip.file(`${base}.shx`, shx)
  zip.file(`${base}.dbf`, dbf)
  zip.file(`${base}.prj`, WGS84_PRJ)
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `${base}.zip`)
}
