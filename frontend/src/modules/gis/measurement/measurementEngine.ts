/**
 * Unified measurement engine — pure geometry + formatting for the Measurement panel.
 *
 * All map measurement modes (distance, area, perimeter, radius, circle,
 * rectangle, bearing/azimuth, coordinate, elevation, 3D distance, 3D height,
 * angle) compute through this single module so the UI, the live HUD, the map
 * overlay geometry, and the on-map labels stay consistent. No external geo
 * dependency (no turf) — spherical (WGS84) math is hand-rolled to match the rest
 * of the app (`haversineDistanceMeters`, `sphericalRingAreaM2`).
 */

export type MeasureMode =
  | 'distance'
  | 'area'
  | 'perimeter'
  | 'radius'
  | 'circle'
  | 'rectangle'
  | 'bearing'
  | 'coordinate'
  | 'elevation'
  | 'distance3d'
  | 'height3d'
  | 'angle'

export type DistanceUnit = 'm' | 'km' | 'ft' | 'mi'
export type AreaUnit = 'm2' | 'ha' | 'acre' | 'km2'

export type MeasurePoint = { lng: number; lat: number; ele?: number | null }

export type MeasureUnits = { distance: DistanceUnit; area: AreaUnit }

export type MeasureReadout = { label: string; value: string; primary?: boolean }

export type MeasureLabel = { id: string; lng: number; lat: number; text: string }

export type MeasureGeometryRole = 'fill' | 'line' | 'vertex' | 'guide'

export type MeasureComputed = {
  mode: MeasureMode
  finished: boolean
  vertexCount: number
  readouts: MeasureReadout[]
  features: Array<{
    type: 'Feature'
    properties: { role: MeasureGeometryRole; finished: boolean }
    geometry: { type: 'Polygon' | 'LineString' | 'Point'; coordinates: unknown }
  }>
  labels: MeasureLabel[]
}

export type MeasureModeSpec = {
  id: MeasureMode
  label: string
  short: string
  /** FontAwesome class. Professional / GIS glyphs only (no AI motifs). */
  icon: string
  hint: string
  group: 'planar' | 'shape' | 'point' | 'threeD'
  /** Minimum committed vertices before a result is valid / can finish. */
  minPoints: number
  /** When set, the measurement auto-completes once this many points are placed. */
  autoFinishCount?: number
  /** Geometry is a closed polygon (vs. an open path). */
  polygon?: boolean
  /** Needs terrain elevation sampling to be meaningful. */
  requiresTerrain?: boolean
}

export const MEASURE_MODES: MeasureModeSpec[] = [
  { id: 'distance', label: 'Distance', short: 'Distance', icon: 'fa-solid fa-ruler-horizontal', hint: 'Click points along a path; double-click to finish.', group: 'planar', minPoints: 2 },
  { id: 'area', label: 'Area', short: 'Area', icon: 'fa-solid fa-draw-polygon', hint: 'Click polygon corners; double-click to finish.', group: 'planar', minPoints: 3, polygon: true },
  { id: 'perimeter', label: 'Perimeter', short: 'Perimeter', icon: 'fa-solid fa-vector-square', hint: 'Click polygon corners; double-click to finish.', group: 'planar', minPoints: 3, polygon: true },
  { id: 'rectangle', label: 'Rectangle', short: 'Rectangle', icon: 'fa-regular fa-square', hint: 'Click two opposite corners.', group: 'shape', minPoints: 2, autoFinishCount: 2, polygon: true },
  { id: 'circle', label: 'Circle', short: 'Circle', icon: 'fa-regular fa-circle', hint: 'Click the center, then a point on the edge.', group: 'shape', minPoints: 2, autoFinishCount: 2, polygon: true },
  { id: 'radius', label: 'Radius', short: 'Radius', icon: 'fa-solid fa-circle-dot', hint: 'Click the center, then a point on the edge.', group: 'shape', minPoints: 2, autoFinishCount: 2, polygon: true },
  { id: 'bearing', label: 'Bearing / Azimuth', short: 'Bearing', icon: 'fa-solid fa-compass', hint: 'Click start, then end — reads azimuth from North.', group: 'planar', minPoints: 2, autoFinishCount: 2 },
  { id: 'angle', label: 'Angle', short: 'Angle', icon: 'fa-solid fa-angle-left', hint: 'Click three points — angle at the middle vertex.', group: 'planar', minPoints: 3, autoFinishCount: 3 },
  { id: 'coordinate', label: 'Coordinate', short: 'Coordinate', icon: 'fa-solid fa-location-crosshairs', hint: 'Click a point to read its coordinates.', group: 'point', minPoints: 1, autoFinishCount: 1 },
  { id: 'elevation', label: 'Elevation', short: 'Elevation', icon: 'fa-solid fa-mountain', hint: 'Click a point to read terrain elevation (3D).', group: 'point', minPoints: 1, autoFinishCount: 1, requiresTerrain: true },
  { id: 'distance3d', label: '3D Distance', short: '3D Dist', icon: 'fa-solid fa-ruler', hint: 'Click points — slope (3D) length over terrain.', group: 'threeD', minPoints: 2, requiresTerrain: true },
  { id: 'height3d', label: 'Height', short: 'Height', icon: 'fa-solid fa-arrows-up-down', hint: 'Click two points — elevation difference (3D).', group: 'threeD', minPoints: 2, autoFinishCount: 2, requiresTerrain: true },
]

const MODE_BY_ID = new Map(MEASURE_MODES.map(m => [m.id, m]))

export function getMeasureModeSpec(mode: MeasureMode): MeasureModeSpec {
  return MODE_BY_ID.get(mode) ?? MEASURE_MODES[0]
}

// ── Geometry (WGS84 spherical) ──────────────────────────────────────────────
const R = 6378137 // WGS84 equatorial radius (m)
const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export function haversineMeters(a: MeasurePoint, b: MeasurePoint): number {
  const dLat = (b.lat - a.lat) * D2R
  const dLng = (b.lng - a.lng) * D2R
  const lat1 = a.lat * D2R
  const lat2 = b.lat * D2R
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Initial bearing a→b in degrees clockwise from North [0,360). */
export function bearingDeg(a: MeasurePoint, b: MeasurePoint): number {
  const lat1 = a.lat * D2R
  const lat2 = b.lat * D2R
  const dLng = (b.lng - a.lng) * D2R
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * R2D + 360) % 360
}

/** Destination point given start, bearing (deg) and distance (m). */
function destination(p: MeasurePoint, brngDeg: number, distM: number): [number, number] {
  const d = distM / R
  const brng = brngDeg * D2R
  const lat1 = p.lat * D2R
  const lng1 = p.lng * D2R
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng))
  const lng2 =
    lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [lng2 * R2D, lat2 * R2D]
}

function ringAreaM2(ring: Array<[number, number]>): number {
  const n = ring.length
  if (n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i += 1) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[(i + 1) % n]
    total += (lng2 - lng1) * D2R * (2 + Math.sin(lat1 * D2R) + Math.sin(lat2 * D2R))
  }
  return Math.abs((total * R * R) / 2)
}

function circlePolygon(center: MeasurePoint, radiusM: number, steps = 72): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 0; i <= steps; i += 1) out.push(destination(center, (i / steps) * 360, radiusM))
  return out
}

function rectangleCorners(a: MeasurePoint, b: MeasurePoint): Array<[number, number]> {
  return [
    [a.lng, a.lat],
    [b.lng, a.lat],
    [b.lng, b.lat],
    [a.lng, b.lat],
    [a.lng, a.lat],
  ]
}

function pathLengthM(pts: MeasurePoint[]): number {
  let m = 0
  for (let i = 1; i < pts.length; i += 1) m += haversineMeters(pts[i - 1], pts[i])
  return m
}

/** 3D (slope) length, summing horizontal + elevation deltas per segment. */
function pathLength3dM(pts: MeasurePoint[]): number {
  let m = 0
  for (let i = 1; i < pts.length; i += 1) {
    const flat = haversineMeters(pts[i - 1], pts[i])
    const dz = (pts[i].ele ?? 0) - (pts[i - 1].ele ?? 0)
    m += Math.sqrt(flat * flat + dz * dz)
  }
  return m
}

function centroid(pts: Array<[number, number]>): [number, number] {
  let lng = 0
  let lat = 0
  for (const p of pts) {
    lng += p[0]
    lat += p[1]
  }
  return [lng / pts.length, lat / pts.length]
}

// ── Unit conversion + formatting ────────────────────────────────────────────
const DIST_FACTOR: Record<DistanceUnit, number> = { m: 1, km: 1 / 1000, ft: 3.280839895, mi: 1 / 1609.344 }
const DIST_LABEL: Record<DistanceUnit, string> = { m: 'm', km: 'km', ft: 'ft', mi: 'mi' }
const AREA_FACTOR: Record<AreaUnit, number> = { m2: 1, ha: 1 / 10_000, acre: 1 / 4046.8564224, km2: 1 / 1_000_000 }
const AREA_LABEL: Record<AreaUnit, string> = { m2: 'm²', ha: 'ha', acre: 'ac', km2: 'km²' }

export const DISTANCE_UNIT_OPTIONS: Array<{ id: DistanceUnit; label: string }> = [
  { id: 'm', label: 'Meters' },
  { id: 'km', label: 'Kilometers' },
  { id: 'ft', label: 'Feet' },
  { id: 'mi', label: 'Miles' },
]

export const AREA_UNIT_OPTIONS: Array<{ id: AreaUnit; label: string }> = [
  { id: 'm2', label: 'Square meters' },
  { id: 'ha', label: 'Hectares' },
  { id: 'acre', label: 'Acres' },
  { id: 'km2', label: 'Square kilometers' },
]

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  const dp = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  if (!Number.isFinite(meters) || meters <= 0) return `0 ${DIST_LABEL[unit]}`
  return `${fmtNum(meters * DIST_FACTOR[unit])} ${DIST_LABEL[unit]}`
}

export function formatArea(m2: number, unit: AreaUnit): string {
  if (!Number.isFinite(m2) || m2 <= 0) return `0 ${AREA_LABEL[unit]}`
  return `${fmtNum(m2 * AREA_FACTOR[unit])} ${AREA_LABEL[unit]}`
}

function fmtElevation(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—'
  return `${m.toLocaleString('en-US', { maximumFractionDigits: 1 })} m`
}

function fmtBearing(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const card = dirs[Math.round(deg / 22.5) % 16]
  return `${deg.toFixed(1)}° ${card}`
}

function fmtLatLng(lng: number, lat: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lng).toFixed(5)}° ${ew}`
}

// ── Core compute ────────────────────────────────────────────────────────────
function feature(
  role: MeasureGeometryRole,
  type: 'Polygon' | 'LineString' | 'Point',
  coordinates: unknown,
  finished: boolean,
): MeasureComputed['features'][number] {
  return { type: 'Feature', properties: { role, finished }, geometry: { type, coordinates } }
}

/**
 * Compute every readout + the map geometry + on-map labels for one measurement.
 * `points` are the committed vertices; `preview` (the live cursor point) is
 * appended for an unfinished multi-point sketch so results update live.
 */
export function computeMeasurement(
  mode: MeasureMode,
  points: MeasurePoint[],
  preview: MeasurePoint | null,
  units: MeasureUnits,
  finished: boolean,
  idPrefix = 'm',
): MeasureComputed | null {
  if (!points.length) return null
  const spec = getMeasureModeSpec(mode)
  const path = !finished && preview && points.length > 0 ? [...points, preview] : points
  const features: MeasureComputed['features'] = []
  const labels: MeasureLabel[] = []
  const readouts: MeasureReadout[] = []
  const fin = finished

  const pushVertices = (pts: MeasurePoint[]) => {
    for (const p of pts) features.push(feature('vertex', 'Point', [p.lng, p.lat], fin))
  }

  switch (mode) {
    case 'distance':
    case 'distance3d': {
      const lenM = pathLengthM(path)
      if (path.length >= 2) features.push(feature('line', 'LineString', path.map(p => [p.lng, p.lat]), fin))
      pushVertices(points)
      readouts.push({ label: 'Length', value: formatDistance(lenM, units.distance), primary: true })
      if (mode === 'distance3d') {
        const len3 = pathLength3dM(path)
        readouts.push({ label: '3D length', value: formatDistance(len3, units.distance), primary: true })
        readouts.push({ label: 'Planar length', value: formatDistance(lenM, units.distance) })
        const dz = (path[path.length - 1]?.ele ?? 0) - (path[0]?.ele ?? 0)
        readouts.push({ label: 'Elevation gain', value: fmtElevation(dz) })
      }
      readouts.push({ label: 'Segments', value: String(Math.max(0, path.length - 1)) })
      const end = path[path.length - 1]
      if (end && lenM > 0)
        labels.push({ id: `${idPrefix}-len`, lng: end.lng, lat: end.lat, text: formatDistance(mode === 'distance3d' ? pathLength3dM(path) : lenM, units.distance) })
      break
    }
    case 'area':
    case 'perimeter': {
      if (path.length >= 3) {
        const ring = [...path.map(p => [p.lng, p.lat] as [number, number]), [path[0].lng, path[0].lat] as [number, number]]
        features.push(feature('fill', 'Polygon', [ring], fin))
        features.push(feature('line', 'LineString', ring, fin))
      } else if (path.length >= 2) {
        features.push(feature('line', 'LineString', path.map(p => [p.lng, p.lat]), fin))
      }
      pushVertices(points)
      const closed = path.length >= 3
      const areaM2 = closed ? ringAreaM2(path.map(p => [p.lng, p.lat])) : 0
      const perimM = closed ? pathLengthM([...path, path[0]]) : pathLengthM(path)
      if (mode === 'area') {
        readouts.push({ label: 'Area', value: formatArea(areaM2, units.area), primary: true })
        readouts.push({ label: 'Perimeter', value: formatDistance(perimM, units.distance) })
      } else {
        readouts.push({ label: 'Perimeter', value: formatDistance(perimM, units.distance), primary: true })
        readouts.push({ label: 'Area', value: formatArea(areaM2, units.area) })
      }
      readouts.push({ label: 'Vertices', value: String(points.length) })
      if (closed) {
        const c = centroid(path.map(p => [p.lng, p.lat]))
        labels.push({ id: `${idPrefix}-area`, lng: c[0], lat: c[1], text: mode === 'area' ? formatArea(areaM2, units.area) : formatDistance(perimM, units.distance) })
      }
      break
    }
    case 'rectangle': {
      const a = points[0]
      const b = preview && !fin ? preview : points[1]
      if (a && b) {
        const ring = rectangleCorners(a, b)
        features.push(feature('fill', 'Polygon', [ring], fin))
        features.push(feature('line', 'LineString', ring, fin))
        const widthM = haversineMeters({ lng: a.lng, lat: a.lat }, { lng: b.lng, lat: a.lat })
        const heightM = haversineMeters({ lng: a.lng, lat: a.lat }, { lng: a.lng, lat: b.lat })
        const areaM2 = ringAreaM2(ring)
        readouts.push({ label: 'Area', value: formatArea(areaM2, units.area), primary: true })
        readouts.push({ label: 'Width', value: formatDistance(widthM, units.distance) })
        readouts.push({ label: 'Height', value: formatDistance(heightM, units.distance) })
        readouts.push({ label: 'Perimeter', value: formatDistance(2 * (widthM + heightM), units.distance) })
        const c = centroid(ring)
        labels.push({ id: `${idPrefix}-rect`, lng: c[0], lat: c[1], text: formatArea(areaM2, units.area) })
      }
      pushVertices(points)
      break
    }
    case 'circle':
    case 'radius': {
      const center = points[0]
      const edge = preview && !fin ? preview : points[1]
      if (center && edge) {
        const radiusM = haversineMeters(center, edge)
        const ring = circlePolygon(center, radiusM)
        if (mode === 'circle') features.push(feature('fill', 'Polygon', [ring], fin))
        features.push(feature('line', 'LineString', ring, fin))
        // radius guide line
        features.push(feature('guide', 'LineString', [[center.lng, center.lat], [edge.lng, edge.lat]], fin))
        const areaM2 = Math.PI * radiusM * radiusM
        readouts.push({ label: 'Radius', value: formatDistance(radiusM, units.distance), primary: true })
        if (mode === 'circle') {
          readouts.push({ label: 'Area', value: formatArea(areaM2, units.area), primary: true })
          readouts.push({ label: 'Diameter', value: formatDistance(radiusM * 2, units.distance) })
          readouts.push({ label: 'Circumference', value: formatDistance(2 * Math.PI * radiusM, units.distance) })
        } else {
          readouts.push({ label: 'Diameter', value: formatDistance(radiusM * 2, units.distance) })
        }
        labels.push({ id: `${idPrefix}-rad`, lng: edge.lng, lat: edge.lat, text: formatDistance(radiusM, units.distance) })
      }
      features.push(feature('vertex', 'Point', [center.lng, center.lat], fin))
      break
    }
    case 'bearing': {
      const a = points[0]
      const b = preview && !fin ? preview : points[1]
      if (a && b) {
        features.push(feature('line', 'LineString', [[a.lng, a.lat], [b.lng, b.lat]], fin))
        const deg = bearingDeg(a, b)
        const distM = haversineMeters(a, b)
        readouts.push({ label: 'Azimuth', value: fmtBearing(deg), primary: true })
        readouts.push({ label: 'Distance', value: formatDistance(distM, units.distance) })
        const back = (deg + 180) % 360
        readouts.push({ label: 'Back azimuth', value: fmtBearing(back) })
        labels.push({ id: `${idPrefix}-brg`, lng: (a.lng + b.lng) / 2, lat: (a.lat + b.lat) / 2, text: `${deg.toFixed(1)}°` })
      }
      pushVertices(points)
      break
    }
    case 'angle': {
      // Vertex is the middle point (b); the live cursor extends the open leg.
      const a = points[0]
      const b = points[1] ?? (preview && !fin ? preview : undefined)
      const c = points[2] ?? (points.length >= 2 && preview && !fin ? preview : undefined)
      const drawPts = points.length >= 3 ? points.slice(0, 3) : path
      if (drawPts.length >= 2) features.push(feature('line', 'LineString', drawPts.map(p => [p.lng, p.lat]), fin))
      pushVertices(points)
      if (a && b && c) {
        const b1 = bearingDeg(b, a)
        const b2 = bearingDeg(b, c)
        let ang = Math.abs(b1 - b2) % 360
        if (ang > 180) ang = 360 - ang
        readouts.push({ label: 'Angle', value: `${ang.toFixed(1)}°`, primary: true })
        readouts.push({ label: 'Leg A', value: formatDistance(haversineMeters(b, a), units.distance) })
        readouts.push({ label: 'Leg B', value: formatDistance(haversineMeters(b, c), units.distance) })
        labels.push({ id: `${idPrefix}-ang`, lng: b.lng, lat: b.lat, text: `${ang.toFixed(1)}°` })
      }
      break
    }
    case 'coordinate':
    case 'elevation': {
      const p = points[0]
      features.push(feature('vertex', 'Point', [p.lng, p.lat], fin))
      readouts.push({ label: 'Longitude', value: `${p.lng.toFixed(6)}°`, primary: true })
      readouts.push({ label: 'Latitude', value: `${p.lat.toFixed(6)}°`, primary: true })
      if (mode === 'elevation' || p.ele != null) readouts.push({ label: 'Elevation', value: fmtElevation(p.ele) })
      labels.push({
        id: `${idPrefix}-coord`,
        lng: p.lng,
        lat: p.lat,
        text: mode === 'elevation' ? fmtElevation(p.ele) : fmtLatLng(p.lng, p.lat),
      })
      break
    }
    case 'height3d': {
      const a = points[0]
      const b = preview && !fin ? preview : points[1]
      features.push(feature('vertex', 'Point', [a.lng, a.lat], fin))
      if (a && b) {
        features.push(feature('guide', 'LineString', [[a.lng, a.lat], [b.lng, b.lat]], fin))
        const dz = (b.ele ?? 0) - (a.ele ?? 0)
        const flat = haversineMeters(a, b)
        const slope = Math.sqrt(flat * flat + dz * dz)
        readouts.push({ label: 'Height Δ', value: fmtElevation(dz), primary: true })
        readouts.push({ label: 'From', value: fmtElevation(a.ele) })
        readouts.push({ label: 'To', value: fmtElevation(b.ele) })
        readouts.push({ label: 'Horizontal', value: formatDistance(flat, units.distance) })
        readouts.push({ label: 'Slope', value: formatDistance(slope, units.distance) })
        labels.push({ id: `${idPrefix}-h`, lng: b.lng, lat: b.lat, text: fmtElevation(dz) })
      }
      break
    }
    default:
      return null
  }

  return { mode, finished: fin, vertexCount: points.length, readouts, features, labels }
}
