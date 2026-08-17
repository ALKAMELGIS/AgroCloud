/**
 * Tree Detection client — `/api/tree-detection/*` → Ultralytics YOLO Detection
 * (single class `tree`). GIS layer uses box centres as Points.
 */

import { apiUrl } from '../apiOrigin'

const BASE = () => apiUrl('/api/tree-detection')

export type TreeDetectionModelId = 'yolo' | 'deepforest'

export type YoloTreeBox = {
  /** Image-pixel bounds (origin top-left of the posted mosaic). */
  xmin: number
  ymin: number
  xmax: number
  ymax: number
  /** Model confidence in [0,1]. */
  score: number
  label: string
}

export type YoloTreeInstance = {
  polygon: Array<[number, number] | number[]>
  score: number
  label: string
  area_px?: number
}

export type TreeDetectionServiceConfig = {
  configured: boolean
  online?: boolean
  model: string
  engine?: string | null
  enginesAvailable?: string[]
  modelPathConfigured?: boolean
  imgSize?: number
  iou?: number
}

export type TreePredictResult = {
  boxes: YoloTreeBox[]
  engine: string | null
}

/** Whether a tree-detection endpoint is configured and reachable. */
export async function fetchTreeDetectionConfig(signal?: AbortSignal): Promise<TreeDetectionServiceConfig> {
  try {
    const res = await fetch(`${BASE()}/config`, { signal })
    if (!res.ok) return { configured: false, model: 'yolo' }
    return (await res.json()) as TreeDetectionServiceConfig
  } catch {
    return { configured: false, model: 'yolo' }
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not encode AOI imagery to PNG.'))),
      'image/png',
    )
  })
}

/** Raised when the tree model service is offline / misconfigured. */
export class TreeDetectionServiceError extends Error {
  readonly offline: boolean
  constructor(message: string, offline = false) {
    super(message)
    this.name = 'TreeDetectionServiceError'
    this.offline = offline
  }
}

export type PredictMosaicOptions = {
  /** Confidence threshold (0..1). */
  score?: number
  /** Preferred engine (`yolo` detect). */
  engine?: TreeDetectionModelId | string
  /** Ground sample distance of the mosaic (m/px) for the Node builtin fallback. */
  metersPerPixel?: number
  signal?: AbortSignal
}

export async function predictTreeDetection(
  canvas: HTMLCanvasElement,
  options: PredictMosaicOptions = {},
): Promise<TreePredictResult> {
  const blob = await canvasToPngBlob(canvas)
  const params = new URLSearchParams()
  if (options.score != null) params.set('score', String(options.score))
  params.set('engine', String(options.engine || 'yolo'))
  if (options.metersPerPixel != null && Number.isFinite(options.metersPerPixel)) {
    params.set('mpp', String(options.metersPerPixel))
  }
  const qs = params.toString()
  let res: Response
  try {
    res = await fetch(`${BASE()}/predict${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
      signal: options.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new TreeDetectionServiceError(
      'Could not reach tree detection. Retry — canopy detect runs on the API when YOLO is offline.',
      true,
    )
  }
  const json = (await res.json().catch(() => ({}))) as {
    boxes?: YoloTreeBox[]
    engine?: string
    error?: string
  }
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    throw new TreeDetectionServiceError(
      json?.error ||
        'Tree detection is temporarily unavailable. Retry in a moment.',
      true,
    )
  }
  if (!res.ok) {
    throw new TreeDetectionServiceError(json?.error || `Tree detection failed (HTTP ${res.status}).`)
  }
  return {
    boxes: Array.isArray(json.boxes) ? json.boxes : [],
    engine: typeof json.engine === 'string' ? json.engine : 'yolo',
  }
}

/**
 * Run Ultralytics YOLO Detection on one AOI mosaic and return tree boxes
 * in that mosaic's pixel space.
 */
export async function predictTreeBoxes(
  canvas: HTMLCanvasElement,
  options: PredictMosaicOptions = {},
): Promise<YoloTreeBox[]> {
  const { boxes } = await predictTreeDetection(canvas, options)
  return boxes
}
