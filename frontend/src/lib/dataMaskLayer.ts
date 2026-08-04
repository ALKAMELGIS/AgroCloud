/**
 * DataMask Layer Index — paints Sentinel Hub sample `dataMask` as a selectable Layer Live band.
 * Internally every index evalscript already inputs `dataMask` for AOI alpha; this module also
 * exposes it as its own INDEX option for inspection, masking QA, and export.
 */

export const DATAMASK_LAYER_ID = 'DATAMASK'

export const DATAMASK_LAYER_LABEL = 'DataMask'

export const DATAMASK_SCIENTIFIC_NAME =
  'Sentinel Hub dataMask — valid sample presence (1 = data, 0 = no data)'

export function isDataMaskLayerId(id: string | null | undefined): boolean {
  const u = String(id || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return u === 'DATAMASK' || u === 'DATAMASKBAND' || u === 'DATA_MASK'
}

/**
 * Client EVALSCRIPT for Layer Live DATAMASK visualization.
 * Requests a spectral band + dataMask so WMS proxy layers expose the mask sample reliably,
 * and paints opaque lime for valid pixels (transparent where no data).
 */
export function buildDataMaskLayerEvalscript(): string {
  return `//VERSION=3
function setup() {
  return {
    input: ["B04", "dataMask"],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var m = s.dataMask;
  if (!m) return [0, 0, 0, 0];
  // Bright lime inside valid samples — alpha fully opaque for Mapbox raster visibility.
  return [40, 220, 90, 255];
}`
}

export type DataMaskCatalogLogInput = {
  capabilityLayers?: Array<{ name?: string; title?: string }> | null
  registeredInIndex: boolean
}

let loggedOnceKey = ''

/**
 * Report whether DataMask exists as a WMS capability layer name and why it may be hidden
 * from / restored into the Layer Index (dev console). Logged once per distinct status key.
 */
export function logDataMaskLayerAvailability(input: DataMaskCatalogLogInput): void {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return
  const layers = Array.isArray(input.capabilityLayers) ? input.capabilityLayers : []
  const matches = layers.filter(l => {
    const hay = `${l?.name ?? ''} ${l?.title ?? ''}`.toLowerCase()
    return /datamask|data.?mask/.test(hay)
  })
  const capabilityHasNamedLayer = matches.length > 0
  const key = `${capabilityHasNamedLayer ? 1 : 0}:${input.registeredInIndex ? 1 : 0}:${matches.map(m => m.name).join(',')}`
  if (key === loggedOnceKey) return
  loggedOnceKey = key
  console.info('[DataMask] Layer Index status', {
    sourceBandInEvalscripts: true,
    evalscriptInput: ['B04', 'dataMask'],
    evalscriptOutputAlpha: true,
    capabilityNamedWmsLayer: capabilityHasNamedLayer,
    capabilityMatches: matches.map(m => ({ name: m.name, title: m.title })),
    registeredInIndex: input.registeredInIndex,
    hideReason: input.registeredInIndex
      ? null
      : capabilityHasNamedLayer
        ? 'Named WMS layer exists in GetCapabilities but was filtered from Layer Index registration'
        : 'dataMask is an evalscript sample band, not a GetCapabilities WMS layer — register client DATAMASK in Core Interpretation',
  })
}

/** Dev log when DATAMASK paint path builds GEOMETRY+EVALSCRIPT chunks. */
export function logDataMaskPaintPipeline(info: {
  layerId: string
  chunkCount: number
  hasEvalscript: boolean
  proxyLayer: string
}): void {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return
  if (!isDataMaskLayerId(info.layerId)) return
  console.info('[DataMask] Paint pipeline', {
    layerId: info.layerId,
    chunkCount: info.chunkCount,
    hasEvalscript: info.hasEvalscript,
    proxyLayer: info.proxyLayer,
    ok: info.chunkCount > 0 && info.hasEvalscript,
  })
}
