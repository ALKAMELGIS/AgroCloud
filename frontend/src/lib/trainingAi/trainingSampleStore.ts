/**
 * Training & AI — classed GIS training sample model + defaults.
 */

export type TrainingGeometryType = 'Point' | 'Polygon'

export type TrainingClass = {
  class_id: number
  class_name: string
  color: string
}

export type TrainingSample = {
  sample_id: string
  class_id: number
  class_name: string
  geometry: GeoJSON.Geometry
  geometry_type: TrainingGeometryType
  image_id: string
  source: string
  created_at: string
}

export type TrainingDrawTool = 'point' | 'polygon' | 'rectangle' | 'circle' | 'select'

export const TRAINING_CLASS_COLORS = [
  '#eab308', // Field Boundaries
  '#0d9488', // Mangrove
  '#2563eb', // Water
  '#b45309', // Soil
  '#16a34a', // Vegetation
  '#15803d', // Tree
  '#ca8a04', // Agriculture
  '#64748b', // Urban
  '#9333ea', // Other
] as const

export const DEFAULT_TRAINING_CLASSES: TrainingClass[] = [
  { class_id: 1, class_name: 'Field Boundaries', color: TRAINING_CLASS_COLORS[0] },
  { class_id: 2, class_name: 'Mangrove', color: TRAINING_CLASS_COLORS[1] },
  { class_id: 3, class_name: 'Water', color: TRAINING_CLASS_COLORS[2] },
  { class_id: 4, class_name: 'Soil', color: TRAINING_CLASS_COLORS[3] },
  { class_id: 5, class_name: 'Vegetation', color: TRAINING_CLASS_COLORS[4] },
  { class_id: 6, class_name: 'Tree', color: TRAINING_CLASS_COLORS[5] },
  { class_id: 7, class_name: 'Agriculture', color: TRAINING_CLASS_COLORS[6] },
  { class_id: 8, class_name: 'Urban', color: TRAINING_CLASS_COLORS[7] },
  { class_id: 9, class_name: 'Other', color: TRAINING_CLASS_COLORS[8] },
]

let sampleSeq = 0
export function nextSampleId(): string {
  sampleSeq += 1
  return `tai-sample-${Date.now().toString(36)}-${sampleSeq}`
}

export function geometryTypeOf(g: GeoJSON.Geometry): TrainingGeometryType {
  if (g.type === 'Point' || g.type === 'MultiPoint') return 'Point'
  return 'Polygon'
}

export function classColorMap(classes: TrainingClass[]): Map<number, string> {
  return new Map(classes.map(c => [c.class_id, c.color]))
}

export function countByClass(
  samples: TrainingSample[],
  classes: TrainingClass[],
): Array<{ class_id: number; class_name: string; color: string; count: number }> {
  return classes.map(c => ({
    class_id: c.class_id,
    class_name: c.class_name,
    color: c.color,
    count: samples.filter(s => s.class_id === c.class_id).length,
  }))
}

export function samplesToFeatureCollection(
  samples: TrainingSample[],
  classes: TrainingClass[],
  selectedIds: ReadonlySet<string> = new Set(),
): GeoJSON.FeatureCollection {
  const colors = classColorMap(classes)
  return {
    type: 'FeatureCollection',
    features: samples.map(s => ({
      type: 'Feature',
      id: s.sample_id,
      geometry: s.geometry,
      properties: {
        sample_id: s.sample_id,
        class_id: s.class_id,
        class_name: s.class_name,
        geometry_type: s.geometry_type,
        image_id: s.image_id,
        source: s.source,
        created_at: s.created_at,
        color: colors.get(s.class_id) ?? '#888888',
        selected: selectedIds.has(s.sample_id),
      },
    })),
  }
}

/** Same-tab signal so Validation Detection can one-click Training & AI samples. */
export const TRAINING_SAMPLES_CHANGED_EVENT = 'agrocloud:training-samples'

export type LiveTrainingSamplesSnapshot = {
  samples: TrainingSample[]
  classes: TrainingClass[]
}

let liveTrainingSamples: LiveTrainingSamplesSnapshot = {
  samples: [],
  classes: [...DEFAULT_TRAINING_CLASSES],
}

export function publishLiveTrainingSamples(
  samples: TrainingSample[],
  classes: TrainingClass[] = DEFAULT_TRAINING_CLASSES,
): void {
  liveTrainingSamples = {
    samples: Array.isArray(samples) ? samples : [],
    classes: Array.isArray(classes) && classes.length ? classes : [...DEFAULT_TRAINING_CLASSES],
  }
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(TRAINING_SAMPLES_CHANGED_EVENT, { detail: liveTrainingSamples }),
  )
}

export function loadLiveTrainingSamples(): LiveTrainingSamplesSnapshot {
  return liveTrainingSamples
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function exportTrainingGeoJson(
  samples: TrainingSample[],
  classes: TrainingClass[],
  basename = 'training-samples',
) {
  const pack = {
    type: 'FeatureCollection',
    name: basename,
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    properties: {
      classes,
      count: samples.length,
      source: 'training-ai',
    },
    features: samplesToFeatureCollection(samples, classes).features,
  }
  downloadBlob(
    `${basename}.geojson`,
    new Blob([JSON.stringify(pack, null, 2)], { type: 'application/geo+json' }),
  )
}

/** Honest GeoPackage companion: GeoJSON named for GPKG workflows (no binary GPKG encoder). */
export function exportTrainingGeoPackageCompanion(
  samples: TrainingSample[],
  classes: TrainingClass[],
  basename = 'training-samples',
) {
  const pack = {
    type: 'FeatureCollection',
    name: basename,
    properties: {
      format_note: 'GeoJSON companion for GeoPackage workflows',
      classes,
      count: samples.length,
    },
    features: samplesToFeatureCollection(samples, classes).features,
  }
  downloadBlob(
    `${basename}.geojson`,
    new Blob([JSON.stringify(pack, null, 2)], { type: 'application/geo+json' }),
  )
}

export function exportTrainingPointsCsv(samples: TrainingSample[], basename = 'training-points') {
  const points = samples.filter(s => s.geometry_type === 'Point')
  const rows = ['sample_id,class_id,class_name,lon,lat,image_id,source,created_at']
  for (const s of points) {
    const g = s.geometry
    let lon = ''
    let lat = ''
    if (g.type === 'Point') {
      lon = String(g.coordinates[0])
      lat = String(g.coordinates[1])
    } else if (g.type === 'MultiPoint' && g.coordinates[0]) {
      lon = String(g.coordinates[0][0])
      lat = String(g.coordinates[0][1])
    }
    rows.push(
      [
        s.sample_id,
        s.class_id,
        JSON.stringify(s.class_name),
        lon,
        lat,
        JSON.stringify(s.image_id),
        JSON.stringify(s.source),
        s.created_at,
      ].join(','),
    )
  }
  downloadBlob(`${basename}.csv`, new Blob([rows.join('\n')], { type: 'text/csv' }))
}

/** Explicit Save action — downloads a self-contained training samples package. */
export function saveTrainingSamplesPackage(
  samples: TrainingSample[],
  classes: TrainingClass[],
  basename?: string,
) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  exportTrainingGeoJson(samples, classes, basename || `training-samples-${stamp}`)
}

export type TrainingImportResult = {
  samples: TrainingSample[]
  classes: TrainingClass[]
  importedCount: number
  warnings: string[]
}

function isGeometry(g: unknown): g is GeoJSON.Geometry {
  return Boolean(g && typeof g === 'object' && typeof (g as { type?: unknown }).type === 'string')
}

function readClassId(props: Record<string, unknown>, fallback: number): number {
  const raw = props.class_id ?? props.classId ?? props.CLASS_ID ?? props.id
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback
}

function mergeImportedClasses(
  existing: TrainingClass[],
  discovered: Array<{ class_id: number; class_name: string; color?: string }>,
): TrainingClass[] {
  const byId = new Map(existing.map(c => [c.class_id, { ...c }]))
  for (const d of discovered) {
    const prev = byId.get(d.class_id)
    if (prev) {
      if (d.class_name?.trim()) prev.class_name = d.class_name.trim()
      if (d.color?.trim()) prev.color = d.color.trim()
    } else {
      byId.set(d.class_id, {
        class_id: d.class_id,
        class_name: d.class_name?.trim() || `Class ${d.class_id}`,
        color:
          d.color?.trim() ||
          TRAINING_CLASS_COLORS[(byId.size + d.class_id) % TRAINING_CLASS_COLORS.length],
      })
    }
  }
  return [...byId.values()].sort((a, b) => a.class_id - b.class_id)
}

/** Parse Training AI GeoJSON / FeatureCollection (including Save package). */
export function parseTrainingSamplesGeoJson(
  raw: unknown,
  existingClasses: TrainingClass[] = DEFAULT_TRAINING_CLASSES,
): TrainingImportResult {
  const warnings: string[] = []
  const root = raw as {
    type?: string
    features?: unknown[]
    properties?: { classes?: unknown }
    classes?: unknown
  }
  if (!root || root.type !== 'FeatureCollection' || !Array.isArray(root.features)) {
    throw new Error('File must be a GeoJSON FeatureCollection of training samples.')
  }

  const packClassesRaw = root.properties?.classes ?? root.classes
  const packClasses: TrainingClass[] = []
  if (Array.isArray(packClassesRaw)) {
    for (const c of packClassesRaw) {
      if (!c || typeof c !== 'object') continue
      const o = c as Record<string, unknown>
      const id = Number(o.class_id ?? o.classId)
      const name = String(o.class_name ?? o.className ?? o.name ?? '').trim()
      if (!Number.isFinite(id) || id <= 0 || !name) continue
      packClasses.push({
        class_id: Math.trunc(id),
        class_name: name,
        color: String(o.color ?? TRAINING_CLASS_COLORS[(id - 1) % TRAINING_CLASS_COLORS.length]),
      })
    }
  }

  const samples: TrainingSample[] = []
  const discovered: Array<{ class_id: number; class_name: string; color?: string }> = [...packClasses]

  for (let i = 0; i < root.features.length; i++) {
    const f = root.features[i] as GeoJSON.Feature | null
    if (!f || f.type !== 'Feature' || !isGeometry(f.geometry)) {
      warnings.push(`Skipped feature #${i + 1}: missing geometry`)
      continue
    }
    if (f.geometry.type === 'GeometryCollection') {
      warnings.push(`Skipped feature #${i + 1}: GeometryCollection not supported`)
      continue
    }
    const props = (f.properties || {}) as Record<string, unknown>
    const class_id = readClassId(props, 1)
    const class_name = String(
      props.class_name ?? props.className ?? props.Name ?? props.name ?? `Class ${class_id}`,
    ).trim()
    const color = String(props.color ?? '').trim() || undefined
    discovered.push({ class_id, class_name, color })
    const sample_id = String(props.sample_id ?? props.sampleId ?? f.id ?? nextSampleId()).trim()
    samples.push({
      sample_id: sample_id || nextSampleId(),
      class_id,
      class_name: class_name || `Class ${class_id}`,
      geometry: f.geometry,
      geometry_type: geometryTypeOf(f.geometry),
      image_id: String(props.image_id ?? props.imageId ?? 'imported'),
      source: String(props.source ?? 'import'),
      created_at: String(props.created_at ?? props.createdAt ?? new Date().toISOString()),
    })
  }

  if (!samples.length) throw new Error('No valid sample features found in the GeoJSON file.')

  return {
    samples,
    classes: mergeImportedClasses(existingClasses, discovered),
    importedCount: samples.length,
    warnings,
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else if (ch === '"') {
        inQ = false
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"') {
      inQ = true
      continue
    }
    if (ch === ',') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

/** Parse points CSV exported by Training AI (or compatible lon/lat class columns). */
export function parseTrainingPointsCsv(
  text: string,
  existingClasses: TrainingClass[] = DEFAULT_TRAINING_CLASSES,
): TrainingImportResult {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
  if (lines.length < 2) throw new Error('CSV must include a header row and at least one point.')

  const header = parseCsvLine(lines[0]!).map(h => h.trim().toLowerCase())
  const idx = (names: string[]) => header.findIndex(h => names.includes(h))
  const iLon = idx(['lon', 'longitude', 'x', 'lng'])
  const iLat = idx(['lat', 'latitude', 'y'])
  const iClassId = idx(['class_id', 'classid', 'class'])
  const iClassName = idx(['class_name', 'classname', 'name'])
  const iSampleId = idx(['sample_id', 'sampleid', 'id'])
  const iImage = idx(['image_id', 'imageid'])
  const iSource = idx(['source'])
  const iCreated = idx(['created_at', 'createdat'])
  if (iLon < 0 || iLat < 0) {
    throw new Error('CSV must include lon/lat (or longitude/latitude) columns.')
  }

  const samples: TrainingSample[] = []
  const discovered: Array<{ class_id: number; class_name: string }> = []
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]!)
    const lon = Number(cols[iLon])
    const lat = Number(cols[iLat])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    const class_id =
      iClassId >= 0 && Number.isFinite(Number(cols[iClassId]))
        ? Math.trunc(Number(cols[iClassId]))
        : 1
    const class_name =
      (iClassName >= 0 ? String(cols[iClassName] || '').trim() : '') || `Class ${class_id}`
    discovered.push({ class_id, class_name })
    samples.push({
      sample_id:
        (iSampleId >= 0 ? String(cols[iSampleId] || '').trim() : '') || nextSampleId(),
      class_id,
      class_name,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      geometry_type: 'Point',
      image_id: (iImage >= 0 ? String(cols[iImage] || '').trim() : '') || 'imported',
      source: (iSource >= 0 ? String(cols[iSource] || '').trim() : '') || 'import-csv',
      created_at:
        (iCreated >= 0 ? String(cols[iCreated] || '').trim() : '') || new Date().toISOString(),
    })
  }
  if (!samples.length) throw new Error('No valid point rows found in the CSV file.')
  return {
    samples,
    classes: mergeImportedClasses(existingClasses, discovered),
    importedCount: samples.length,
    warnings: [],
  }
}

export async function readTrainingImportFile(file: File): Promise<{ kind: 'geojson' | 'csv'; text: string }> {
  const name = file.name.toLowerCase()
  const text = await file.text()
  if (name.endsWith('.csv') || file.type.includes('csv')) return { kind: 'csv', text }
  if (name.endsWith('.geojson') || name.endsWith('.json') || text.trim().startsWith('{')) {
    return { kind: 'geojson', text }
  }
  throw new Error('Unsupported file. Use GeoJSON (.geojson/.json) or CSV (.csv).')
}

export function parseTrainingImportText(
  kind: 'geojson' | 'csv',
  text: string,
  existingClasses: TrainingClass[] = DEFAULT_TRAINING_CLASSES,
): TrainingImportResult {
  if (kind === 'csv') return parseTrainingPointsCsv(text, existingClasses)
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON in GeoJSON file.')
  }
  return parseTrainingSamplesGeoJson(json, existingClasses)
}

async function readFileAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof (file as File).arrayBuffer === 'function') {
    return (file as File).arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'))
    reader.readAsArrayBuffer(file)
  })
}

/** Import training polygons/points from a shapefile ZIP (or .shp package buffer). */
export async function parseTrainingSamplesShapefile(
  file: File,
  existingClasses: TrainingClass[] = DEFAULT_TRAINING_CLASSES,
): Promise<TrainingImportResult> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.shp')) {
    throw new Error(
      'Select a ZIP that contains .shp + .dbf (+ .shx/.prj). A lone .shp file cannot be imported.',
    )
  }
  const shp = (await import('shpjs')).default
  const { mergeShpLikeToFeatureCollection } = await import('../../utils/FileLoader')
  const ab = await readFileAsArrayBuffer(file)
  let raw: unknown
  try {
    raw = await shp(ab)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Could not parse Shapefile: ${msg}`)
  }
  const fc = mergeShpLikeToFeatureCollection(raw)
  if (!fc.features.length) throw new Error('Shapefile ZIP parsed but contains no features.')
  const result = parseTrainingSamplesGeoJson(fc, existingClasses)
  return {
    ...result,
    samples: result.samples.map(s => ({
      ...s,
      source: s.source === 'import' ? 'import-shp' : s.source,
    })),
  }
}

/**
 * Import point samples from Excel (.xlsx / .xls).
 * Same columns as CSV: lon/lat (required), class_id, class_name, sample_id, …
 */
export async function parseTrainingPointsXlsx(
  file: File,
  existingClasses: TrainingClass[] = DEFAULT_TRAINING_CLASSES,
): Promise<TrainingImportResult> {
  const XLSX = await import('xlsx')
  const ab = await readFileAsArrayBuffer(file)
  const wb = XLSX.read(ab, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Excel workbook has no sheets.')
  const sheet = wb.Sheets[sheetName]
  const csv = XLSX.utils.sheet_to_csv(sheet)
  if (!String(csv || '').trim()) throw new Error('Excel sheet is empty.')
  const result = parseTrainingPointsCsv(csv, existingClasses)
  return {
    ...result,
    samples: result.samples.map(s => ({
      ...s,
      source: s.source === 'import-csv' ? 'import-xlsx' : s.source,
    })),
  }
}

/** Route any supported Training Samples import file to the right parser. */
export async function importTrainingSamplesFromFile(
  file: File,
  existingClasses: TrainingClass[] = DEFAULT_TRAINING_CLASSES,
): Promise<TrainingImportResult> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.zip') || name.endsWith('.shp')) {
    return parseTrainingSamplesShapefile(file, existingClasses)
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseTrainingPointsXlsx(file, existingClasses)
  }
  const { kind, text } = await readTrainingImportFile(file)
  return parseTrainingImportText(kind, text, existingClasses)
}

export function distinctClassCount(samples: TrainingSample[]): number {
  return new Set(samples.map(s => s.class_id)).size
}

export function samplesBbox(samples: TrainingSample[]): [number, number, number, number] | null {
  const pts: number[][] = []
  const walk = (c: unknown) => {
    if (!c) return
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      pts.push(c as number[])
      return
    }
    if (Array.isArray(c)) c.forEach(walk)
  }
  for (const s of samples) walk((s.geometry as { coordinates?: unknown }).coordinates)
  if (!pts.length) return null
  let w = Infinity
  let sMin = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [x, y] of pts) {
    if (x < w) w = x
    if (y < sMin) sMin = y
    if (x > e) e = x
    if (y > n) n = y
  }
  if (![w, sMin, e, n].every(Number.isFinite) || e <= w || n <= sMin) return null
  return [w, sMin, e, n]
}
