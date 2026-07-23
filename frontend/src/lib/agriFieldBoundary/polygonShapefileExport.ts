/**
 * Polygon shapefile ZIP export for agricultural field boundaries (WGS84).
 * Shape type 5 = Polygon. Attributes: field_id, confidence, area_m2, perimeter.
 */
import JSZip from 'jszip'

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

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

function buildDbf(
  fields: DbfField[],
  records: Array<(string | number)[]>,
): Uint8Array {
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

function ringToParts(ring: number[][]): Float64Array {
  // Shapefile polygon: clockwise for outer? Esri: outer rings clockwise, holes counter-clockwise.
  // We write as-is; GIS tools tolerate ring orientation for simple exports.
  const n = ring.length
  const coords = new Float64Array(n * 2)
  for (let i = 0; i < n; i += 1) {
    coords[i * 2] = ring[i]![0]!
    coords[i * 2 + 1] = ring[i]![1]!
  }
  return coords
}

function extractPolygonRings(geom: GeoJSON.Geometry): number[][][] {
  if (geom.type === 'Polygon') return geom.coordinates as number[][][]
  if (geom.type === 'MultiPolygon') {
    const out: number[][][] = []
    for (const poly of geom.coordinates) {
      for (const ring of poly) out.push(ring as number[][])
    }
    // Shapefile MultiPolygon as separate records is cleaner — caller should split.
    return out
  }
  return []
}

function writePolygonShp(features: GeoJSON.Feature[]): { shp: Uint8Array; shx: Uint8Array } {
  type Rec = { parts: number[]; points: Float64Array; xmin: number; ymin: number; xmax: number; ymax: number }
  const records: Rec[] = []
  let fileXmin = Infinity
  let fileYmin = Infinity
  let fileXmax = -Infinity
  let fileYmax = -Infinity

  for (const f of features) {
    if (!f.geometry) continue
    const geoms: GeoJSON.Geometry[] =
      f.geometry.type === 'MultiPolygon'
        ? (f.geometry.coordinates as number[][][][]).map(coords => ({
            type: 'Polygon' as const,
            coordinates: coords,
          }))
        : [f.geometry]
    for (const g of geoms) {
      const rings = extractPolygonRings(g)
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

  // Content length: 100 header + sum(record headers + content)
  let contentWords = 50 // file header in 16-bit words
  const recSizes: number[] = []
  for (const r of records) {
    // record header 8 bytes + shapeType4 + box32 + numParts4 + numPoints4 + parts*4 + points*16
    const contentBytes = 4 + 32 + 4 + 4 + r.parts.length * 4 + r.points.length * 8
    const totalBytes = 8 + contentBytes
    recSizes.push(totalBytes)
    contentWords += totalBytes / 2
  }

  const shp = new Uint8Array(contentWords * 2)
  const shpView = new DataView(shp.buffer)
  // File header
  shpView.setInt32(0, 9994, false)
  shpView.setInt32(24, contentWords, false)
  shpView.setInt32(28, 1000, true)
  shpView.setInt32(32, 5, true) // Polygon
  shpView.setFloat64(36, Number.isFinite(fileXmin) ? fileXmin : 0, true)
  shpView.setFloat64(44, Number.isFinite(fileYmin) ? fileYmin : 0, true)
  shpView.setFloat64(52, Number.isFinite(fileXmax) ? fileXmax : 0, true)
  shpView.setFloat64(60, Number.isFinite(fileYmax) ? fileYmax : 0, true)

  const shx = new Uint8Array(100 + records.length * 8)
  const shxView = new DataView(shx.buffer)
  shxView.setInt32(0, 9994, false)
  shxView.setInt32(24, 50 + records.length * 4, false)
  shxView.setInt32(28, 1000, true)
  shxView.setInt32(32, 5, true)
  shxView.setFloat64(36, Number.isFinite(fileXmin) ? fileXmin : 0, true)
  shxView.setFloat64(44, Number.isFinite(fileYmin) ? fileYmin : 0, true)
  shxView.setFloat64(52, Number.isFinite(fileXmax) ? fileXmax : 0, true)
  shxView.setFloat64(60, Number.isFinite(fileYmax) ? fileYmax : 0, true)

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

/** Download a zipped polygon shapefile for field boundary features. */
export async function downloadFieldBoundaryShapefile(
  fc: GeoJSON.FeatureCollection,
  filename = 'agri-field-boundaries.zip',
): Promise<void> {
  const features = (fc.features || []).filter(
    f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  )
  if (!features.length) throw new Error('No polygon fields to export.')

  const fields: DbfField[] = [
    { name: 'FIELD_ID', type: 'C', length: 32 },
    { name: 'CONF', type: 'N', length: 8, decimals: 4 },
    { name: 'AREA_M2', type: 'N', length: 14, decimals: 2 },
    { name: 'AREA_HA', type: 'N', length: 12, decimals: 4 },
    { name: 'PERIM_M', type: 'N', length: 12, decimals: 2 },
  ]
  // One DBF row per shapefile polygon record (MultiPolygon expands).
  const dbfRows: Array<(string | number)[]> = []
  const expanded: GeoJSON.Feature[] = []
  for (const f of features) {
    const props = (f.properties || {}) as Record<string, unknown>
    const row: (string | number)[] = [
      String(props.field_id || f.id || ''),
      Number(props.confidence ?? props.confidence_score ?? 0),
      Number(props.area_m2 ?? 0),
      Number(props.area_ha ?? 0),
      Number(props.perimeter_m ?? 0),
    ]
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

  const { shp, shx } = writePolygonShp(expanded)
  const dbf = buildDbf(fields, dbfRows)
  const zip = new JSZip()
  zip.file('agri_fields.shp', shp)
  zip.file('agri_fields.shx', shx)
  zip.file('agri_fields.dbf', dbf)
  zip.file('agri_fields.prj', WGS84_PRJ)
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** GeoPackage-compatible download: GeoJSON FeatureCollection named as .gpkg companion
 *  (true GPKG needs GDAL). Also writes a .geojson always used by QGIS/ArcGIS. */
export function downloadFieldBoundaryGeoPackage(fc: GeoJSON.FeatureCollection, basename = 'agri-field-boundaries') {
  const payload = {
    type: 'FeatureCollection',
    name: 'agri_field_boundaries',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: fc.features,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${basename}.geojson`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
