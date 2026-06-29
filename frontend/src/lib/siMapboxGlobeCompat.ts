/**
 * Satellite Intelligence (Mapbox GL): Globe projection is heavier than Mercator and can fail
 * (blank canvas) on some Microsoft Edge / GPU combinations while the same build works in Chrome.
 */

export function siBrowserReportsMicrosoftEdge(): boolean {
  if (typeof navigator === 'undefined') return false
  return /\bEdg\//i.test(navigator.userAgent || '')
}

export function siWebglContextLikelyAvailable(): boolean {
  if (typeof document === 'undefined') return true
  try {
    const c = document.createElement('canvas')
    const gl2 = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
    if (gl2) return true
    const gl =
      c.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ||
      (c as unknown as { getContext?: (t: string, o?: object) => unknown }).getContext?.('experimental-webgl', {
        failIfMajorPerformanceCaveat: false,
      })
    return Boolean(gl)
  } catch {
    return false
  }
}

/**
 * Initial value for the Satellite “3D Globe” toggle: prefer flat Mercator when Edge or WebGL is missing,
 * so the map paints reliably; users can still turn Globe on from the UI.
 */
export function siDefaultSatelliteGlobeEnabled(): boolean {
  if (siBrowserReportsMicrosoftEdge()) return false
  return siWebglContextLikelyAvailable()
}

/** Mapbox / browser error text — if true while in globe mode, app should fall back to Mercator once. */
export function siMapErrorSuggestsGlobeOrWebglFailure(message: string): boolean {
  const m = message.toLowerCase()
  if (!m.trim()) return false
  return (
    m.includes('webgl') ||
    m.includes('webgpu') ||
    m.includes('context lost') ||
    m.includes('globe') ||
    m.includes('shader') ||
    m.includes('gpu') ||
    m.includes('lost context') ||
    m.includes('failed to compile')
  )
}

/**
 * Exponential backoff with full jitter, used for automatic map / imagery retries.
 * `attempt` is 0-based (first retry = attempt 0). The delay is capped at `maxMs`.
 */
export function siNextBackoffDelayMs(
  attempt: number,
  options?: { baseMs?: number; maxMs?: number; jitter?: boolean },
): number {
  const baseMs = options?.baseMs ?? 400
  const maxMs = options?.maxMs ?? 8000
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt))
  if (options?.jitter === false) return exp
  // Full jitter: random in [baseMs, exp] so concurrent retries don't stampede.
  return Math.round(baseMs + Math.random() * Math.max(0, exp - baseMs))
}

type MinimalMapboxLike = {
  getCanvas?: () => HTMLCanvasElement | null | undefined
  getContainer?: () => HTMLElement | null | undefined
}

/**
 * Install genuine WebGL context-loss / context-restored handling on a Mapbox GL map.
 *
 * Mapbox GL only emits a generic `error` event on GPU context loss (and not reliably),
 * so the "black globe" that happens when the browser/driver drops the WebGL context
 * (tab backgrounding, GPU reset, memory pressure — common on Edge / low-VRAM machines)
 * is otherwise unrecoverable. Calling `preventDefault()` on `webglcontextlost` tells the
 * browser we intend to restore, and the `webglcontextrestored` callback lets the caller
 * re-apply the style, globe projection, fog, camera and overlays so the globe reappears.
 *
 * Returns a cleanup function (safe to call multiple times). No-op outside the browser or
 * when the canvas isn't available yet.
 */
export function installSiGlobeWebglContextRecovery(
  map: MinimalMapboxLike | null | undefined,
  handlers: { onContextLost?: () => void; onContextRestored?: () => void },
): () => void {
  if (typeof window === 'undefined' || !map || typeof map.getCanvas !== 'function') {
    return () => {}
  }
  let canvas: HTMLCanvasElement | null = null
  try {
    canvas = map.getCanvas() ?? null
  } catch {
    canvas = null
  }
  if (!canvas) return () => {}

  const onLost = (event: Event) => {
    // Signal the browser we will restore the context (otherwise it may never fire restored).
    try {
      event.preventDefault()
    } catch {
      /* ignore */
    }
    try {
      handlers.onContextLost?.()
    } catch {
      /* ignore */
    }
  }
  const onRestored = () => {
    try {
      handlers.onContextRestored?.()
    } catch {
      /* ignore */
    }
  }

  canvas.addEventListener('webglcontextlost', onLost, false)
  canvas.addEventListener('webglcontextrestored', onRestored, false)

  return () => {
    try {
      canvas?.removeEventListener('webglcontextlost', onLost, false)
      canvas?.removeEventListener('webglcontextrestored', onRestored, false)
    } catch {
      /* ignore */
    }
  }
}
