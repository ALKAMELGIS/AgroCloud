import JSZip from 'jszip'
import {
  buildStyledHydroPlacemarksXml,
  enrichHydroVectorForExport,
  type HydroStreamModel,
} from './hydroExportSymbology'
import { downloadBlob } from './geoTiffExport'
import type { HydroRasterResult, HydroStepId, HydroStepResult, HydroVectorResult } from './hydroEngine'

/** Same order as the Hydro Watershed panel cards. */
export const HYDRO_BUNDLE_STEP_ORDER: HydroStepId[] = [
  'dem',
  'hillshade',
  'slope',
  'flow-direction',
  'flow-accum',
  'streams',
  'contours',
  'watershed',
  'basins',
]

export const HYDRO_BUNDLE_LAYER_LABELS: Record<HydroStepId, string> = {
  dem: 'Elevation',
  hillshade: 'Hillshade',
  slope: 'Slope',
  'flow-direction': 'Flow direction',
  'flow-accum': 'Flow accumulation',
  streams: 'Stream network',
  contours: 'Contours',
  watershed: 'Watershed',
  basins: 'Drainage basins',
  mesh: 'Mesh',
}

type StepLike = { status: string; result: HydroStepResult | null }

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
  if (!blob.size) throw new Error('Empty map preview — re-run analysis before exporting.')
  return blob
}

export function canBundleExportLayer(result: HydroStepResult): boolean {
  if (result.kind === 'raster') return !!result.band && !!result.dataUrl?.startsWith('data:')
  if (result.kind === 'vector') {
    if (!result.data.features.length) return false
    return result.render === 'streams' || result.render === 'contours'
  }
  return false
}

function isStyledHydroVector(result: HydroVectorResult): boolean {
  return result.render === 'streams' || result.render === 'contours'
}

function rasterGroundOverlayKml(
  layerTitle: string,
  pngHref: string,
  box: ReturnType<typeof latLonBoxFromImageCorners>,
  drawOrder: number,
): string {
  const title = escapeKmlText(layerTitle)
  return (
    `<GroundOverlay><name>${title}</name>` +
    `<drawOrder>${drawOrder}</drawOrder>` +
    `<Icon><href>${pngHref}</href></Icon>` +
    `<LatLonBox>` +
    `<north>${box.north}</north><south>${box.south}</south>` +
    `<east>${box.east}</east><west>${box.west}</west>` +
    `</LatLonBox></GroundOverlay>`
  )
}

export type HydroBundleKmzResult = {
  included: number
  skipped: Array<{ stepId: HydroStepId; reason: string }>
}

/**
 * One KMZ for Google Earth — each completed layer in its own folder (raster ground overlays + styled vectors).
 */
export async function exportAllHydroLayersKmz(
  steps: Partial<Record<HydroStepId, StepLike>>,
  options?: { streamModel?: HydroStreamModel; aoiName?: string },
): Promise<HydroBundleKmzResult> {
  const streamModel = options?.streamModel ?? 'strahler'
  const zip = new JSZip()
  const folderParts: string[] = []
  const skipped: HydroBundleKmzResult['skipped'] = []
  let included = 0
  let drawOrder = 0

  for (const stepId of HYDRO_BUNDLE_STEP_ORDER) {
    const st = steps[stepId]
    const label = HYDRO_BUNDLE_LAYER_LABELS[stepId] ?? stepId
    if (!st || st.status !== 'done' || !st.result) {
      skipped.push({ stepId, reason: 'Not completed' })
      continue
    }
    const result = st.result
    if (!canBundleExportLayer(result)) {
      skipped.push({ stepId, reason: 'No exportable preview or features' })
      continue
    }

    if (result.kind === 'raster') {
      const png = await dataUrlToPngBlob(result.dataUrl)
      const pngName = `overlays/${stepId}.png`
      zip.file(pngName, png)
      const box = latLonBoxFromImageCorners(result.coordinates)
      drawOrder += 1
      folderParts.push(
        `<Folder><name>${escapeKmlText(label)}</name>` +
          rasterGroundOverlayKml(label, pngName, box, drawOrder) +
          `</Folder>`,
      )
      included += 1
      continue
    }

    if (isStyledHydroVector(result)) {
      const fc = enrichHydroVectorForExport(result, streamModel)
      try {
        const placemarks = buildStyledHydroPlacemarksXml(fc)
        folderParts.push(
          `<Folder><name>${escapeKmlText(label)}</name>${placemarks}</Folder>`,
        )
        included += 1
      } catch {
        skipped.push({ stepId, reason: 'Could not build vector KML' })
      }
    }
  }

  if (!included) {
    throw new Error('No completed layers to export. Run analysis steps first.')
  }

  const docTitle = escapeKmlText(
    options?.aoiName?.trim()
      ? `Hydro Watershed — ${options.aoiName.trim()}`
      : 'Hydro Watershed — All Layers',
  )
  const kml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<kml xmlns="http://www.opengis.net/kml/2.2">` +
    `<Document><name>${docTitle}</name>` +
    `<description>AgroCloud Hydro Watershed — one folder per analysis layer. Toggle folders in Google Earth.</description>` +
    folderParts.join('') +
    `</Document></kml>`

  zip.file('doc.kml', kml)
  const blob = await zip.generateAsync({ type: 'blob' })
  const safe = (options?.aoiName ?? 'Hydro_AOI').replace(/[^\w.-]+/g, '_').slice(0, 36)
  downloadBlob(blob, `Hydro_All_Layers_${safe}.kmz`)
  return { included, skipped }
}
