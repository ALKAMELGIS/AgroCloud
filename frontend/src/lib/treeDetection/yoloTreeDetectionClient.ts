/**
 * Tree Detection client — talks to `/api/tree-detection/*` which forwards AOI
 * imagery to backend/services/tree-detection (DeepForest / YOLO tree models).
 */

const BASE = '/api/tree-detection'

export type TreeDetectionModelId = 'deepforest' | 'yolo'

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

/** Whether a tree-detection endpoint is configured and reachable. */
export async function fetchTreeDetectionConfig(signal?: AbortSignal): Promise<TreeDetectionServiceConfig> {
  try {
    const res = await fetch(`${BASE}/config`, { signal })
    if (!res.ok) return { configured: false, model: 'deepforest' }
    return (await res.json()) as TreeDetectionServiceConfig
  } catch {
    return { configured: false, model: 'deepforest' }
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
  /** Preferred engine on the microservice (`deepforest` | `yolo` | …). */
  engine?: TreeDetectionModelId | string
  signal?: AbortSignal
}

/**
 * Run the Tree Detection Model on one AOI imagery mosaic and return tree boxes
 * in that mosaic's pixel space.
 */
export async function predictTreeBoxes(
  canvas: HTMLCanvasElement,
  options: PredictMosaicOptions = {},
): Promise<YoloTreeBox[]> {
  const blob = await canvasToPngBlob(canvas)
  const params = new URLSearchParams()
  if (options.score != null) params.set('score', String(options.score))
  if (options.engine) params.set('engine', String(options.engine))
  const qs = params.toString()
  let res: Response
  try {
    res = await fetch(`${BASE}/predict${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
      signal: options.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new TreeDetectionServiceError(
      'Could not reach the Tree Detection Model. Start backend/services/tree-detection (DeepForest).',
      true,
    )
  }
  const json = (await res.json().catch(() => ({}))) as { boxes?: YoloTreeBox[]; error?: string }
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    throw new TreeDetectionServiceError(
      json?.error ||
        'Tree Detection Model is offline — run backend/services/tree-detection/start-local.ps1.',
      true,
    )
  }
  if (!res.ok) {
    throw new TreeDetectionServiceError(json?.error || `Tree detection failed (HTTP ${res.status}).`)
  }
  return Array.isArray(json.boxes) ? json.boxes : []
}
