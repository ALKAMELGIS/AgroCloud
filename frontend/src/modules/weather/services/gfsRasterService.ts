import { apiUrl } from '@/core/api/apiOrigin'

export type GfsRasterMeta = {
  model: string
  completed: boolean
  referenceTime: string | null
  lastModified: string | null
  validTimes: string[]
  variables: string[]
  sourceLabel: string
  resolutionLabel: string
}

export function formatGfsTileTime(timeIso?: string): string | undefined {
  if (!timeIso) return undefined
  const normalized = timeIso.trim().replace(' ', 'T')
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized
}

export async function fetchGfsRasterMeta(signal?: AbortSignal): Promise<GfsRasterMeta> {
  const res = await fetch(apiUrl('/weather/gfs/meta'), { signal })
  if (!res.ok) throw new Error(`GFS meta HTTP ${res.status}`)
  return res.json() as Promise<GfsRasterMeta>
}

export function buildGfsRasterTileUrl(variable: string, timeIso?: string): string {
  const base = apiUrl(`/weather/gfs/tiles/${encodeURIComponent(variable)}/{z}/{x}/{y}.png`)
  const t = formatGfsTileTime(timeIso)
  if (!t) return base
  return `${base}?time=${encodeURIComponent(t)}`
}

export function closestGfsFrameIndex(validTimes: string[], targetIso?: string): number {
  if (!validTimes.length) return 0
  if (!targetIso) return 0
  const target = Date.parse(String(targetIso).replace(' ', 'T'))
  if (!Number.isFinite(target)) return 0
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < validTimes.length; i++) {
    const d = Math.abs(Date.parse(String(validTimes[i]).replace(' ', 'T')) - target)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  }
  return best
}
