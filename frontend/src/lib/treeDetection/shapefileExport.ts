/**
 * Minimal shapefile writer for Ultralytics YOLO tree Points
 * (box centre → TREE_ID, X, Y, CONFIDENCE, DATE, IMG_SOURCE).
 *
 * Point shapefile ZIP: .shp .shx .dbf .prj (WGS84).
 */
import JSZip from 'jszip'

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

type DbfField =
  | { name: string; type: 'C'; length: number }
  | { name: string; type: 'N'; length: number; decimals: number }

type PointRecord = {
  lng: number
  lat: number
  values: (string | number)[]
}

function asciiBytes(text: string, length: number, padLeft: boolean): Uint8Array {
  const out = new Uint8Array(length).fill(0x20) // space-filled
  // Keep ASCII only; replace anything outside 32..126 with '?'.
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

function buildDbf(fields: DbfField[], records: PointRecord[]): Uint8Array {
  const recordLength = 1 + fields.reduce((sum, f) => sum + f.length, 0)
  const headerLength = 32 + 32 * fields.length + 1
  const totalLength = headerLength + recordLength * records.length + 1 // + EOF
  const buf = new Uint8Array(totalLength)
  const view = new DataView(buf.buffer)

  buf[0] = 0x03 // dBASE III without memo
  const now = new Date()
  buf[1] = now.getFullYear() - 1900
  buf[2] = now.getMonth() + 1
  buf[3] = now.getDate()
  view.setUint32(4, records.length, true)
  view.setUint16(8, headerLength, true)
  view.setUint16(10, recordLength, true)

  let offset = 32
  for (const field of fields) {
    // Field names are null-terminated (not space-padded), max 11 bytes.
    for (let i = 0; i < 11; i += 1) buf[offset + i] = i < field.name.length ? field.name.charCodeAt(i) : 0
    buf[offset + 11] = field.type.charCodeAt(0)
    buf[offset + 16] = field.length
    buf[offset + 17] = field.type === 'N' ? field.decimals : 0
    offset += 32
  }
  buf[offset] = 0x0d // header terminator
  offset += 1

  for (const rec of records) {
    buf[offset] = 0x20 // not deleted
    offset += 1
    for (let fi = 0; fi < fields.length; fi += 1) {
      const field = fields[fi]
      const raw = rec.values[fi]
      let text: string
      if (field.type === 'N') {
        const num = typeof raw === 'number' ? raw : Number(raw)
        text = Number.isFinite(num) ? num.toFixed(field.decimals) : ''
      } else {
        text = raw == null ? '' : String(raw)
      }
      const cell = asciiBytes(text, field.length, field.type === 'N')
      buf.set(cell, offset)
      offset += field.length
    }
  }
  buf[offset] = 0x1a // EOF marker
  return buf
}

function buildShpAndShx(records: PointRecord[]): { shp: Uint8Array; shx: Uint8Array } {
  const RECORD_CONTENT_WORDS = 10 // point content = 20 bytes = 10 16-bit words
  const recordTotalBytes = 8 + RECORD_CONTENT_WORDS * 2 // header + content = 28 bytes
  const shpLength = 100 + records.length * recordTotalBytes
  const shxLength = 100 + records.length * 8

  const shp = new Uint8Array(shpLength)
  const shx = new Uint8Array(shxLength)
  const shpView = new DataView(shp.buffer)
  const shxView = new DataView(shx.buffer)

  let xmin = Infinity
  let ymin = Infinity
  let xmax = -Infinity
  let ymax = -Infinity
  for (const r of records) {
    if (r.lng < xmin) xmin = r.lng
    if (r.lng > xmax) xmax = r.lng
    if (r.lat < ymin) ymin = r.lat
    if (r.lat > ymax) ymax = r.lat
  }
  if (!records.length) {
    xmin = ymin = xmax = ymax = 0
  }

  const writeHeader = (view: DataView, fileLengthBytes: number) => {
    view.setInt32(0, 9994, false) // file code
    view.setInt32(24, fileLengthBytes / 2, false) // length in 16-bit words
    view.setInt32(28, 1000, true) // version
    view.setInt32(32, 1, true) // shape type = Point
    view.setFloat64(36, xmin, true)
    view.setFloat64(44, ymin, true)
    view.setFloat64(52, xmax, true)
    view.setFloat64(60, ymax, true)
  }
  writeHeader(shpView, shpLength)
  writeHeader(shxView, shxLength)

  let shpOffset = 100
  let recordOffsetWords = 50 // first record starts right after the 100-byte header
  for (let i = 0; i < records.length; i += 1) {
    const r = records[i]
    // .shp record header (big-endian)
    shpView.setInt32(shpOffset, i + 1, false) // record number (1-based)
    shpView.setInt32(shpOffset + 4, RECORD_CONTENT_WORDS, false)
    // .shp record content (little-endian)
    shpView.setInt32(shpOffset + 8, 1, true) // shape type = Point
    shpView.setFloat64(shpOffset + 12, r.lng, true)
    shpView.setFloat64(shpOffset + 20, r.lat, true)
    shpOffset += recordTotalBytes

    // .shx index record (big-endian)
    shxView.setInt32(100 + i * 8, recordOffsetWords, false)
    shxView.setInt32(100 + i * 8 + 4, RECORD_CONTENT_WORDS, false)
    recordOffsetWords += 4 + RECORD_CONTENT_WORDS // record header (4 words) + content
  }

  return { shp, shx }
}

/**
 * Build a zipped Esri Point shapefile from a tree-detection FeatureCollection
 * and trigger a browser download.
 */
export async function downloadTreeShapefile(
  fc: GeoJSON.FeatureCollection,
  baseName = 'tree-detections',
): Promise<void> {
  const fields: DbfField[] = [
    { name: 'TREE_ID', type: 'C', length: 18 },
    { name: 'X', type: 'N', length: 12, decimals: 7 },
    { name: 'Y', type: 'N', length: 12, decimals: 7 },
    { name: 'CONFIDENCE', type: 'N', length: 8, decimals: 3 },
    { name: 'DATE', type: 'C', length: 10 },
    { name: 'IMG_SOURCE', type: 'C', length: 40 },
  ]

  const records: PointRecord[] = []
  for (const feature of fc.features) {
    if (!feature.geometry || feature.geometry.type !== 'Point') continue
    const [lng, lat] = feature.geometry.coordinates as [number, number]
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const p = (feature.properties ?? {}) as Record<string, unknown>
    records.push({
      lng,
      lat,
      values: [
        String(p.Tree_ID ?? p.id ?? ''),
        Number(p.X ?? lng),
        Number(p.Y ?? lat),
        Number(p.Confidence ?? p.confidence ?? 0),
        String(p.Date ?? ''),
        String(p.Image_Source ?? p.imageSource ?? ''),
      ],
    })
  }

  const { shp, shx } = buildShpAndShx(records)
  const dbf = buildDbf(fields, records)

  const zip = new JSZip()
  zip.file(`${baseName}.shp`, shp)
  zip.file(`${baseName}.shx`, shx)
  zip.file(`${baseName}.dbf`, dbf)
  zip.file(`${baseName}.prj`, WGS84_PRJ)
  const blob = await zip.generateAsync({ type: 'blob' })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
