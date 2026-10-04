/** Clip the After basemap so only the strip to the right of the divider is visible. */
export function developEliteSwipeClipPath(widthPx: number, ratio: number): string {
  const width = Number.isFinite(widthPx) ? Math.max(0, widthPx) : 0
  const t = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0.5
  const x = Math.round(t * width)
  return `inset(0 0 0 ${x}px)`
}

/** Clip the Before Sentinel side to the left of the divider (ratio 0–1). */
export function developEliteSwipeBeforeClipPath(widthPx: number, ratio: number): string {
  const width = Number.isFinite(widthPx) ? Math.max(0, widthPx) : 0
  const t = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0.5
  const x = Math.round(t * width)
  const rightInset = Math.max(0, width - x)
  return `inset(0 ${rightInset}px 0 0)`
}

export type DevelopEliteWeatherVizMode = 'clear' | 'cloud' | 'rain' | 'snow' | 'storm'

/** Map an Open-Meteo tone onto the dashboard weather canvas. */
export function developEliteWeatherVizMode(tone: string): DevelopEliteWeatherVizMode {
  if (tone === 'snow') return 'snow'
  if (tone === 'storm') return 'storm'
  if (tone === 'rain' || tone === 'drizzle') return 'rain'
  if (tone === 'clear' || tone === 'partly') return 'clear'
  return 'cloud'
}
