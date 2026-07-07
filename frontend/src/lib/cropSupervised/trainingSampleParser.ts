import { mergeShpLikeToFeatureCollection, normalizeGeoJsonEnvelope, parseFile } from '../../utils/FileLoader'
import type { CropTrainingSample } from './types'

const CLASS_PROP_KEYS = [
  'class',
  'crop',
  'crop_type',
  'croptype',
  'class_name',
  'classname',
  'label',
  'type',
  'name',
  'cropname',
  'crop_name',
  'category',
]

function normalizeClassName(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s || s.toLowerCase() === 'null' || s === '0') return null
  return s
}

function pickClassFromProps(props: Record<string, unknown> | null | undefined): string | null {
  if (!props) return null
  for (const key of CLASS_PROP_KEYS) {
    const hit = Object.keys(props).find(k => k.toLowerCase() === key)
    if (hit) {
      const v = normalizeClassName(props[hit])
      if (v) return v
    }
  }
  return null
}

function featureToSample(
  feature: GeoJSON.Feature,
  idx: number,
  sourceFile: string,
): CropTrainingSample | null {
  const geom = feature.geometry
  if (!geom) return null
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon' && geom.type !== 'Point') return null
  const className = pickClassFromProps(feature.properties as Record<string, unknown>)
  if (!className) return null
  return {
    id: `${sourceFile}-${idx}`,
    className,
    geometry: geom as CropTrainingSample['geometry'],
    sourceFile,
  }
}

function tableRowsToSamples(
  rows: Record<string, unknown>[],
  sourceFile: string,
): CropTrainingSample[] {
  const out: CropTrainingSample[] = []
  rows.forEach((row, idx) => {
    const className = pickClassFromProps(row)
    if (!className) return
    const lat = Number(row.lat ?? row.latitude ?? row.Lat ?? row.LAT ?? row.y ?? row.Y)
    const lng = Number(row.lng ?? row.lon ?? row.longitude ?? row.Lng ?? row.LON ?? row.x ?? row.X)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    out.push({
      id: `${sourceFile}-${idx}`,
      className,
      geometry: { type: 'Point', coordinates: [lng, lat] },
      sourceFile,
    })
  })
  return out
}

function geoJsonToSamples(data: unknown, sourceFile: string): CropTrainingSample[] {
  const fc = normalizeGeoJsonEnvelope(mergeShpLikeToFeatureCollection(data))
  const samples: CropTrainingSample[] = []
  fc.features.forEach((f, idx) => {
    const s = featureToSample(f as GeoJSON.Feature, idx, sourceFile)
    if (s) samples.push(s)
  })
  return samples
}

/** Parse one or more training-sample files into labelled geometries. */
export async function parseTrainingSampleFiles(
  files: File[],
  signal?: AbortSignal,
): Promise<CropTrainingSample[]> {
  const all: CropTrainingSample[] = []
  for (const file of files) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const parsed = await parseFile(file, { signal })
    if (parsed.type === 'geojson') {
      all.push(...geoJsonToSamples(parsed.data, parsed.filename))
    } else if (parsed.type === 'table') {
      all.push(...tableRowsToSamples(parsed.data as Record<string, unknown>[], parsed.filename))
    }
  }
  return all
}
