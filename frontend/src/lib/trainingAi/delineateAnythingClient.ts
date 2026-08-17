/**
 * Delineate Anything / FBIS field-boundary client (Training AI Infer).
 */

const BASE = '/api/delineate-anything'

export type DelineateModelKey = 'large' | 'large_v2' | 'fbis22m' | 'fbis73m' | 'v1' | 'v2' | 'small'

export type DelineateAnythingResult = {
  geojson: GeoJSON.FeatureCollection
  count: number
  engine: string
  model?: string
  model_key?: string
  device?: string
  stats?: { field: number }
  score?: number
}

export class DelineateAnythingServiceError extends Error {
  readonly offline: boolean
  constructor(message: string, offline = false) {
    super(message)
    this.name = 'DelineateAnythingServiceError'
    this.offline = offline
  }
}

export async function fetchDelineateAnythingConfig(signal?: AbortSignal): Promise<{
  configured: boolean
  online?: boolean
  model?: string
}> {
  try {
    const res = await fetch(`${BASE}/config`, { signal })
    if (!res.ok) return { configured: false }
    return (await res.json()) as { configured: boolean; online?: boolean; model?: string }
  } catch {
    return { configured: false }
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not encode mosaic PNG.'))),
      'image/png',
    )
  })
}

export async function loadImageToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not decode capture for Delineate Anything.'))
    el.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable.')
  ctx.drawImage(img, 0, 0)
  return canvas
}

export type PredictDelineateArgs = {
  imageDataUrl: string
  bbox: [number, number, number, number]
  confidence?: number
  model?: DelineateModelKey | string
  minAreaM2?: number
  signal?: AbortSignal
}

/** Run Delineate Anything on a map capture; returns georeferenced field polygons. */
export async function predictDelineateAnything(
  args: PredictDelineateArgs,
): Promise<DelineateAnythingResult> {
  const canvas = await loadImageToCanvas(args.imageDataUrl)
  const blob = await canvasToPngBlob(canvas)
  const [west, south, east, north] = args.bbox
  const conf = Number.isFinite(args.confidence) ? Number(args.confidence) : 0.25
  const params = new URLSearchParams({
    conf: String(Math.max(0.08, Math.min(0.9, conf))),
    score: String(Math.max(0.08, Math.min(0.9, conf))),
    model: String(args.model || 'v2'),
    min_area_m2: String(args.minAreaM2 ?? 50),
    imgsz: '1280',
    iou: '0.5',
    west: String(west),
    south: String(south),
    east: String(east),
    north: String(north),
  })

  let res: Response
  try {
    res = await fetch(`${BASE}/predict?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
      signal: args.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new DelineateAnythingServiceError(
      'Could not reach Delineate Anything. Start: cd backend/services/delineate-anything; .\\start-local.ps1',
      true,
    )
  }

  const json = (await res.json().catch(() => ({}))) as DelineateAnythingResult & {
    error?: string
    detail?: string
  }
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    throw new DelineateAnythingServiceError(
      json.error ||
        'Delineate Anything offline. Start: cd backend/services/delineate-anything; .\\start-local.ps1',
      true,
    )
  }
  if (!res.ok) {
    throw new DelineateAnythingServiceError(
      json.error || json.detail || `Delineate Anything failed (HTTP ${res.status}).`,
    )
  }

  const fc =
    json.geojson?.type === 'FeatureCollection'
      ? json.geojson
      : ({ type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection)

  return {
    geojson: fc,
    count: Array.isArray(fc.features) ? fc.features.length : Number(json.count || 0),
    engine: json.engine || 'delineate-anything',
    model: json.model,
    model_key: json.model_key,
    device: json.device,
    stats: json.stats || { field: fc.features?.length || 0 },
    score: json.score,
  }
}
