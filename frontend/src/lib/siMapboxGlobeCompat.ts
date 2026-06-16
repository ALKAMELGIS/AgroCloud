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
