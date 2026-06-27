/**
 * YOLO tree-detection client — talks to the backend tree-detection proxy
 * (`/api/tree-detection/*`), which forwards the AOI imagery to a hosted YOLO
 * tree-crown model and returns predicted boxes in image-pixel coordinates.
 *
 * The reference model is the single-class ("tree") YOLOv5 detector from
 * https://anapgit.scanlab.gr/yolo-trees/ai-tree-detection (best.pt / best.onnx).
 * A ready-to-run FastAPI service for it ships in
 * backend/services/tree-detection/. All detection comes from this model — there
 * is no in-browser fallback detector.
 */

const BASE = '/api/tree-detection'

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
  model: string
  imgSize?: number
  iou?: number
}

/** Whether a YOLO endpoint is configured on the backend. */
export async function fetchTreeDetectionConfig(signal?: AbortSignal): Promise<TreeDetectionServiceConfig> {
  try {
    const res = await fetch(`${BASE}/config`, { signal })
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

/** Raised when no YOLO endpoint is configured / reachable. */
export class TreeDetectionServiceError extends Error {
  readonly offline: boolean
  constructor(message: string, offline = false) {
    super(message)
    this.name = 'TreeDetectionServiceError'
    this.offline = offline
  }
}

export type PredictMosaicOptions = {
  /** Confidence threshold passed to YOLO (0..1). */
  score?: number
  signal?: AbortSignal
}

/**
 * Run the YOLO model on ONE prepared imagery mosaic (a chunk of a tiled AOI
 * scan) and return the predicted tree boxes in that mosaic's pixel space.
 */
export async function predictTreeBoxes(
  canvas: HTMLCanvasElement,
  options: PredictMosaicOptions = {},
): Promise<YoloTreeBox[]> {
  const blob = await canvasToPngBlob(canvas)
  const params = new URLSearchParams()
  if (options.score != null) params.set('score', String(options.score))
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
      'Could not reach the YOLO model service. Check your connection or the model endpoint.',
      true,
    )
  }
  const json = (await res.json().catch(() => ({}))) as { boxes?: YoloTreeBox[]; error?: string }
  if (res.status === 503) {
    throw new TreeDetectionServiceError(
      json?.error ||
          'YOLO model is offline — run backend/services/tree-detection and set TREE_DETECTION_URL on the backend to enable tree detection.',
      true,
    )
  }
  if (!res.ok) {
    throw new TreeDetectionServiceError(json?.error || `Tree detection failed (HTTP ${res.status}).`)
  }
  return Array.isArray(json.boxes) ? json.boxes : []
}
