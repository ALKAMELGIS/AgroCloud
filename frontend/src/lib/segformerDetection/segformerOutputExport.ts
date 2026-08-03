/**
 * GeoJSON / Shapefile / mask downloads for SegFormer GIS Detection results.
 * Exports use the Feature_ID / Class_Name / … schema (plus DBF-friendly aliases).
 */

import JSZip from 'jszip'
import { downloadFieldBoundaryShapefile } from '../agriFieldBoundary/polygonShapefileExport'
import { downloadGeoJsonFile } from '../siLayerExport'
import {
  normalizeSegFormerFeatureCollection,
  SEGFORMER_FEATURE_SCHEMA_KEYS,
} from './segformerFeatureNormalize'

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

export function buildSegFormerExportStem(className?: string | null): string {
  const raw = (className || 'detections').trim() || 'detections'
  return `segformer-${raw.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9._-]+/g, '')}`
}

export type SegFormerExportMeta = {
  classId?: number
  className?: string | null
  date?: string | null
  provider?: string | null
}

/** Ensure Feature_ID schema keys are present before download. */
export function enrichSegFormerExportCollection(
  fc: GeoJSON.FeatureCollection,
  meta?: SegFormerExportMeta,
): GeoJSON.FeatureCollection {
  return normalizeSegFormerFeatureCollection(fc, {
    classId: meta?.classId ?? 0,
    className: meta?.className || 'detections',
    date: meta?.date,
    provider: meta?.provider,
  })
}

/**
 * Flatten SegFormer props into DBF-friendly snake_case keys used by the polygon exporter.
 * Also mirrors Feature_ID schema names so attribute tables stay consistent.
 */
export function forSegFormerShapefileExport(
  fc: GeoJSON.FeatureCollection,
  meta?: SegFormerExportMeta,
): GeoJSON.FeatureCollection {
  const enriched = enrichSegFormerExportCollection(fc, meta)
  return {
    type: 'FeatureCollection',
    features: enriched.features.map(f => {
      const p = (f.properties || {}) as Record<string, unknown>
      const objectId = String(p.Feature_ID || p.objectId || p.object_id || f.id || '')
      const className = String(p.Class_Name || p.className || p.class_name || '')
      const classId = Number(p.classId ?? p.class_id) || 0
      const confidence = Number(p.Confidence ?? p.confidence) || 0
      const areaM2 = Number(p.Area_m2 ?? p.areaM2 ?? p.area_m2) || 0
      const areaHa = Number(p.Area_Hectare ?? p.areaHa ?? p.area_ha) || 0
      const perimeterM = Number(p.Perimeter ?? p.perimeterM ?? p.perimeter_m) || 0
      const date = String(p.Date || p.date || '')
      const provider = String(p.Provider || p.provider || '')
      const cropType = String(p.Crop_Type || p.cropType || p.crop_type || '')
      const cropConfidence = Number(p.Crop_Confidence ?? p.cropConfidence ?? p.crop_confidence) || 0
      return {
        ...f,
        properties: {
          ...p,
          field_id: objectId,
          Feature_ID: objectId,
          class_name: className,
          Class_Name: className,
          class_id: classId,
          confidence,
          Confidence: confidence,
          area_m2: areaM2,
          Area_m2: areaM2,
          area_ha: areaHa,
          Area_Hectare: areaHa,
          perimeter_m: perimeterM,
          Perimeter: perimeterM,
          date,
          Date: date,
          provider,
          Provider: provider,
          Crop_Type: cropType,
          crop_type: cropType,
          Crop_Confidence: cropConfidence,
          crop_conf: cropConfidence,
        },
      }
    }),
  }
}

/** GeoJSON FeatureCollection with schema keys first for readability. */
export function forSegFormerGeoJsonExport(
  fc: GeoJSON.FeatureCollection,
  meta?: SegFormerExportMeta,
): GeoJSON.FeatureCollection {
  const enriched = enrichSegFormerExportCollection(fc, meta)
  return {
    type: 'FeatureCollection',
    features: enriched.features.map(f => {
      const p = (f.properties || {}) as Record<string, unknown>
      const ordered: Record<string, unknown> = {}
      for (const key of SEGFORMER_FEATURE_SCHEMA_KEYS) {
        if (p[key] != null) ordered[key] = p[key]
      }
      for (const [k, v] of Object.entries(p)) {
        if (!(k in ordered)) ordered[k] = v
      }
      return { ...f, properties: ordered }
    }),
  }
}

export function downloadSegFormerGeoJson(
  fc: GeoJSON.FeatureCollection,
  className?: string | null,
  meta?: SegFormerExportMeta,
): void {
  if (!fc?.features?.length) return
  const stem = buildSegFormerExportStem(className ?? meta?.className)
  const features = forSegFormerGeoJsonExport(fc, {
    classId: meta?.classId,
    className: className ?? meta?.className,
    date: meta?.date,
    provider: meta?.provider,
  }).features
  downloadGeoJsonFile(
    {
      type: 'FeatureCollection',
      name: stem,
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      features,
    },
    stem,
  )
}

export async function downloadSegFormerShapefile(
  fc: GeoJSON.FeatureCollection,
  className?: string | null,
  meta?: SegFormerExportMeta,
): Promise<void> {
  if (!fc?.features?.length) return
  const stem = buildSegFormerExportStem(className ?? meta?.className)
  const layerBaseName = stem.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32) || 'segformer'
  await downloadFieldBoundaryShapefile(
    forSegFormerShapefileExport(fc, {
      classId: meta?.classId,
      className: className ?? meta?.className,
      date: meta?.date,
      provider: meta?.provider,
    }),
    `${stem}.zip`,
    {
      layerBaseName,
      includeClassFields: true,
      includeMetaFields: true,
    },
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function maskDataUrl(maskPng: string): string {
  const raw = maskPng.trim()
  return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`
}

/** Download the raw segmentation mask as a PNG. */
export function downloadSegFormerMaskPng(
  maskPng: string | null | undefined,
  className?: string | null,
): void {
  if (!maskPng?.trim()) return
  const stem = buildSegFormerExportStem(className)
  const a = document.createElement('a')
  a.href = maskDataUrl(maskPng)
  a.download = `${stem}-mask.png`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function buildWorldFile4326(
  west: number,
  north: number,
  east: number,
  south: number,
  width: number,
  height: number,
): string {
  const sx = (east - west) / Math.max(1, width)
  const sy = (north - south) / Math.max(1, height)
  const lines = [
    sx.toFixed(12),
    '0.000000000000',
    '0.000000000000',
    (-sy).toFixed(12),
    (west + sx / 2).toFixed(12),
    (north - sy / 2).toFixed(12),
  ]
  return `${lines.join('\n')}\n`
}

async function loadMaskImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () =>
      resolve({
        width: Math.max(1, img.naturalWidth || img.width || 1),
        height: Math.max(1, img.naturalHeight || img.height || 1),
      })
    img.onerror = () => reject(new Error('Could not decode SegFormer mask PNG.'))
    img.src = dataUrl
  })
}

/**
 * Download a georeferenced mask package (PNG + world file + PRJ) for QGIS / ArcGIS.
 * Prefer this over a full GeoTIFF bake when only a mask PNG + bbox is available.
 */
export async function downloadSegFormerMaskGeoPackage(
  maskPng: string | null | undefined,
  bbox: [number, number, number, number] | null | undefined,
  className?: string | null,
): Promise<void> {
  if (!maskPng?.trim() || !bbox) return
  const [west, south, east, north] = bbox
  if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south) {
    downloadSegFormerMaskPng(maskPng, className)
    return
  }
  const dataUrl = maskDataUrl(maskPng)
  const { width, height } = await loadMaskImageSize(dataUrl)
  const res = await fetch(dataUrl)
  const pngBlob = await res.blob()
  const stem = buildSegFormerExportStem(className)
  const base = stem.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40) || 'segformer_mask'
  const zip = new JSZip()
  zip.file(`${base}.png`, pngBlob)
  zip.file(`${base}.pgw`, buildWorldFile4326(west, north, east, south, width, height))
  zip.file(`${base}.prj`, WGS84_PRJ)
  const blob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(blob, `${stem}-mask-georef.zip`)
}
