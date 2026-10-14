import JSZip from 'jszip'
import { downloadVectorGeoJson } from '@/modules/data-management/export/vectorLayerExport'
import {
  downloadHydroStyledLineShapefile,
  downloadStyledHydroKml,
  downloadStyledHydroKmz,
  enrichHydroVectorForExport,
  type HydroStreamModel,
} from './hydroExportSymbology'

export type { HydroStreamModel } from './hydroExportSymbology'
import { downloadBasinBasinsShapefile } from './hydroBasinVectorExport'
import { buildAoiRgbGeoTiffFromPreview, downloadBlob, downloadGeoTiffWithAux } from './geoTiffExport'
import type { HydroRasterResult, HydroStepId, HydroStepResult, HydroVectorResult } from './hydroEngine'

const BASIN_POLYGON_EXPORT_STEPS: HydroStepId[] = ['basins', 'watershed']

export type HydroExportFormat = 'geotiff' | 'kml' | 'kmz' | 'shp' | 'geojson'

export type HydroExportOptions = {
  streamModel?: HydroStreamModel
}

export const HYDRO_RASTER_EXPORT_FORMATS: Array<{ id: HydroExportFormat; label: string }> = [
  { id: 'geotiff', label: 'GeoTIFF' },
  { id: 'kmz', label: 'KMZ (Google Earth)' },
]

export const HYDRO_VECTOR_EXPORT_FORMATS: Array<{ id: HydroExportFormat; label: string }> = [
  { id: 'kml', label: 'KML' },
  { id: 'kmz', label: 'KMZ' },
  { id: 'shp', label: 'SHP (.zip)' },
  { id: 'geojson', label: 'GeoJSON' },
]

function stepBaseName(stepId: HydroStepId): string {
  return `hydro-${stepId}`
}

function escapeKmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function latLonBoxFromImageCorners(
  coords: HydroRasterResult['coordinates'],
): { north: number; south: number; east: number; west: number } {
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  }
}

async function dataUrlToPngBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  if (!res.ok) throw new Error('Could not read map preview for KMZ export.')
  const blob = await res.blob()
  if (!blob.size) throw new Error('Empty map preview — re-run analysis before exporting KMZ.')
  return blob
}

/** KMZ with a georeferenced PNG ground overlay (opens in Google Earth). */
export async function downloadHydroRasterKmz(
  result: HydroRasterResult,
  fileName: string,
  layerTitle: string,
): Promise<void> {
  if (!result.dataUrl?.startsWith('data:')) {
    throw new Error('No map preview available for KMZ export.')
  }
  const png = await dataUrlToPngBlob(result.dataUrl)
  const box = latLonBoxFromImageCorners(result.coordinates)
  const title = escapeKmlText(layerTitle)
  const kml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<kml xmlns="http://www.opengis.net/kml/2.2">` +
    `<Document><name>${title}</name>` +
    `<GroundOverlay><name>${title}</name>` +
    `<drawOrder>0</drawOrder>` +
    `<Icon><href>overlay.png</href></Icon>` +
    `<LatLonBox>` +
    `<north>${box.north}</north><south>${box.south}</south>` +
    `<east>${box.east}</east><west>${box.west}</west>` +
    `</LatLonBox></GroundOverlay></Document></kml>`

  const zip = new JSZip()
  zip.file('doc.kml', kml)
  zip.file('overlay.png', png)
  const blob = await zip.generateAsync({ type: 'blob' })
  const out = fileName.endsWith('.kmz') ? fileName : `${fileName}.kmz`
  downloadBlob(blob, out)
}

function isStyledHydroVector(result: HydroVectorResult): boolean {
  return result.render === 'streams' || result.render === 'contours'
}

async function exportStyledVector(
  result: HydroVectorResult,
  format: Exclude<HydroExportFormat, 'geotiff'>,
  base: string,
  streamModel: HydroStreamModel,
): Promise<void> {
  const fc = enrichHydroVectorForExport(result, streamModel)
  if (!fc.features.length) throw new Error('No features to export.')
  if (format === 'kml') downloadStyledHydroKml(fc, `${base}.kml`, base)
  else if (format === 'kmz') await downloadStyledHydroKmz(fc, `${base}.kmz`, base)
  else if (format === 'shp') await downloadHydroStyledLineShapefile(fc, base)
  else downloadVectorGeoJson(fc, `${base}.geojson`)
}

export async function exportHydroStep(
  stepId: HydroStepId,
  result: HydroStepResult,
  format: HydroExportFormat,
  aoiMask: Uint8Array | null,
  options?: HydroExportOptions,
): Promise<void> {
  const base = stepBaseName(stepId)
  const streamModel = options?.streamModel ?? 'strahler'

  if (result.kind === 'raster') {
    if (format === 'geotiff') {
      if (!result.band) throw new Error('No raster data to export.')
      const styled = await buildAoiRgbGeoTiffFromPreview(result.dataUrl, result.band, aoiMask)
      downloadGeoTiffWithAux(styled)
      return
    }
    if (format === 'kmz') {
      const title = result.band?.name ?? result.legend?.title ?? base
      await downloadHydroRasterKmz(result, `${base}.kmz`, title)
      return
    }
    if (format === 'shp') {
      if (!BASIN_POLYGON_EXPORT_STEPS.includes(stepId)) {
        throw new Error('Vector basin SHP is available for Drainage basins and Watershed layers only.')
      }
      const labelPrefix = stepId === 'watershed' ? 'Watershed' : 'Drainage Basin'
      await downloadBasinBasinsShapefile(result, aoiMask, base, labelPrefix)
      return
    }
    throw new Error('Raster layers export as GeoTIFF, KMZ, or basin SHP.')
  }

  if (format === 'geotiff') {
    throw new Error('Vector layers use KML, KMZ, SHP, or GeoJSON.')
  }
  if (!result.data.features.length) throw new Error('No features to export.')

  if (isStyledHydroVector(result)) {
    await exportStyledVector(result, format, base, streamModel)
    return
  }

  if (format === 'geojson') downloadVectorGeoJson(result.data, `${base}.geojson`)
  else throw new Error('This vector layer supports GeoJSON export only.')
}

export function defaultExportFormatForResult(result: HydroStepResult): HydroExportFormat {
  return result.kind === 'raster' ? 'geotiff' : 'kml'
}

export function exportFormatsForResult(result: HydroStepResult, stepId?: HydroStepId) {
  if (result.kind === 'raster') {
    if (stepId && BASIN_POLYGON_EXPORT_STEPS.includes(stepId)) {
      return [...HYDRO_RASTER_EXPORT_FORMATS, { id: 'shp' as const, label: 'SHP (basins)' }]
    }
    return HYDRO_RASTER_EXPORT_FORMATS
  }
  return HYDRO_VECTOR_EXPORT_FORMATS
}
