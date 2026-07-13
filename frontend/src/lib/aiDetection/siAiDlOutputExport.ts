import JSZip from 'jszip'
import { downloadTreeShapefile } from '../treeDetection/shapefileExport'
import type { AiDlDetectionSummary } from './siAiDlModelLoader'

export type AiDlOutputFormat = 'feature-layer' | 'geojson' | 'shp' | 'gpkg' | 'csv'

export type AiDlRasterBounds = {
  west: number
  south: number
  east: number
  north: number
}

export const OUTPUT_FORMAT_OPTIONS: Array<{
  id: AiDlOutputFormat
  label: string
  extension: string
}> = [
  { id: 'feature-layer', label: 'Feature Layer', extension: '' },
  { id: 'geojson', label: 'GeoJSON', extension: '.geojson' },
  { id: 'shp', label: 'Shapefile (.shp)', extension: '.zip' },
  { id: 'gpkg', label: 'GeoPackage', extension: '.gpkg' },
  { id: 'csv', label: 'CSV', extension: '.csv' },
]

export const OUTPUT_FILE_ACCEPT = '.geojson,.json,.zip,.shp,.gpkg,.csv'

const OUTPUT_SAVE_PICKER_TYPES = [
  {
    description: 'GeoJSON',
    accept: { 'application/geo+json': ['.geojson'], 'application/json': ['.json'] },
  },
  {
    description: 'CSV',
    accept: { 'text/csv': ['.csv'] },
  },
  {
    description: 'GeoPackage',
    accept: { 'application/geopackage+sqlite3': ['.gpkg'], 'application/octet-stream': ['.gpkg'] },
  },
  {
    description: 'Shapefile',
    accept: { 'application/zip': ['.zip'], 'application/x-esri-shape': ['.shp'] },
  },
]

export function inferOutputFormat(fileName: string): AiDlOutputFormat {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.csv')) return 'csv'
  if (lower.endsWith('.gpkg')) return 'gpkg'
  if (lower.endsWith('.zip') || lower.endsWith('.shp')) return 'shp'
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) return 'geojson'
  return 'geojson'
}

export function defaultOutputFileName(format: AiDlOutputFormat): string {
  const opt = OUTPUT_FORMAT_OPTIONS.find(o => o.id === format)
  const stem = 'detected_objects'
  if (!opt?.extension) return stem
  return `${stem}${opt.extension}`
}

function cellCenter(bounds: AiDlRasterBounds, index: number, total: number): [number, number] {
  const cols = Math.max(2, Math.ceil(Math.sqrt(total)))
  const row = Math.floor(index / cols)
  const col = index % cols
  const lng = bounds.west + ((col + 0.5) / cols) * (bounds.east - bounds.west)
  const lat = bounds.south + ((row + 0.5) / cols) * (bounds.north - bounds.south)
  return [lng, lat]
}

function bboxPolygon(cx: number, cy: number, spanLng: number, spanLat: number): GeoJSON.Polygon {
  const hw = spanLng / 2
  const hh = spanLat / 2
  return {
    type: 'Polygon',
    coordinates: [
      [
        [cx - hw, cy - hh],
        [cx + hw, cy - hh],
        [cx + hw, cy + hh],
        [cx - hw, cy + hh],
        [cx - hw, cy - hh],
      ],
    ],
  }
}

export function detectionSummaryToGeoJson(
  summary: AiDlDetectionSummary,
  bounds: AiDlRasterBounds,
): GeoJSON.FeatureCollection {
  const spanLng = Math.max((bounds.east - bounds.west) * 0.08, 1e-5)
  const spanLat = Math.max((bounds.north - bounds.south) * 0.08, 1e-5)
  const features: GeoJSON.Feature[] = summary.features.map((det, index) => {
    const [cx, cy] = cellCenter(bounds, index, summary.features.length)
    const geometry =
      det.geometryType === 'polygon'
        ? bboxPolygon(cx, cy, spanLng * 1.2, spanLat * 1.2)
        : bboxPolygon(cx, cy, spanLng, spanLat)
    return {
      type: 'Feature',
      properties: {
        id: det.id,
        className: det.className,
        confidence: Number(det.confidence.toFixed(4)),
        geometryType: det.geometryType,
      },
      geometry,
    }
  })
  return { type: 'FeatureCollection', features }
}

function detectionSummaryToCsv(summary: AiDlDetectionSummary, bounds: AiDlRasterBounds): string {
  const header = 'id,className,confidence,geometryType,centerLng,centerLat'
  const rows = summary.features.map((det, index) => {
    const [lng, lat] = cellCenter(bounds, index, summary.features.length)
    return [
      det.id,
      `"${det.className.replace(/"/g, '""')}"`,
      det.confidence.toFixed(4),
      det.geometryType,
      lng.toFixed(6),
      lat.toFixed(6),
    ].join(',')
  })
  return [header, ...rows].join('\n')
}

async function writeBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

async function writeToHandle(handle: FileSystemFileHandle, blob: Blob) {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

export async function pickOutputDestination(): Promise<{
  fileName: string
  format: AiDlOutputFormat
  handle: FileSystemFileHandle | null
} | null> {
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultOutputFileName('geojson'),
        types: OUTPUT_SAVE_PICKER_TYPES,
      })
      return {
        fileName: handle.name,
        format: inferOutputFormat(handle.name),
        handle,
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
    }
  }
  return null
}

export async function exportDetectionResults(input: {
  summary: AiDlDetectionSummary
  bounds: AiDlRasterBounds
  fileName: string
  format: AiDlOutputFormat
  fileHandle?: FileSystemFileHandle | null
}): Promise<void> {
  const { summary, bounds, fileName, format, fileHandle } = input
  const geojson = detectionSummaryToGeoJson(summary, bounds)

  if (format === 'csv') {
    const blob = new Blob([detectionSummaryToCsv(summary, bounds)], { type: 'text/csv;charset=utf-8' })
    if (fileHandle) await writeToHandle(fileHandle, blob)
    else await writeBlobDownload(blob, fileName)
    return
  }

  if (format === 'geojson') {
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json;charset=utf-8' })
    if (fileHandle) await writeToHandle(fileHandle, blob)
    else await writeBlobDownload(blob, fileName)
    return
  }

  if (format === 'shp') {
    const points: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: geojson.features.map(f => ({
        type: 'Feature',
        properties: {
          id: String(f.properties?.id ?? ''),
          size_class: String(f.properties?.className ?? ''),
          confidence: Number(f.properties?.confidence ?? 0),
          vigor: String(f.properties?.geometryType ?? ''),
          crown_dm: 0,
          crown_m2: 0,
          species: '',
        },
        geometry: {
          type: 'Point',
          coordinates: [
            (f.geometry as GeoJSON.Polygon).coordinates[0][0][0],
            (f.geometry as GeoJSON.Polygon).coordinates[0][0][1],
          ],
        },
      })),
    }
    const baseName = fileName.replace(/\.(zip|shp)$/i, '') || 'detected_objects'
    await downloadTreeShapefile(points, baseName)
    return
  }

  if (format === 'gpkg') {
    const zip = new JSZip()
    zip.file(
      `${fileName.replace(/\.gpkg$/i, '') || 'detected_objects'}.geojson`,
      JSON.stringify(geojson, null, 2),
    )
    const blob = await zip.generateAsync({ type: 'blob' })
    const outName = fileName.toLowerCase().endsWith('.gpkg') ? fileName.replace(/\.gpkg$/i, '.zip') : fileName
    if (fileHandle) await writeToHandle(fileHandle, blob)
    else await writeBlobDownload(blob, outName || 'detected_objects.zip')
    return
  }
}
