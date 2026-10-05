import { useCallback, useEffect, useMemo, useState } from 'react'
import { closestGfsFrameIndex, fetchGfsRasterMeta, type GfsRasterMeta } from '../services/gfsRasterService'

const META_REFRESH_MS = 30 * 60_000

function formatTimelineLabel(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 16)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function useGfsRasterTimeline() {
  const [meta, setMeta] = useState<GfsRasterMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rasterBlend, setRasterBlend] = useState(0)

  const load = useCallback((signal?: AbortSignal) => {
    void fetchGfsRasterMeta(signal)
      .then(body => {
        if (!signal?.aborted) {
          setMeta(body)
          setError(null)
        }
      })
      .catch(e => {
        if (!signal?.aborted) {
          setError(e instanceof Error ? e.message : 'GFS unavailable')
        }
      })
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    const id = window.setInterval(() => load(), META_REFRESH_MS)
    return () => {
      ac.abort()
      window.clearInterval(id)
    }
  }, [load])

  const validTimes = meta?.validTimes ?? []

  const labels = useMemo(
    () => validTimes.map(formatTimelineLabel),
    [validTimes],
  )

  const pickFrameTime = useCallback(
    (frameIndex: number) => validTimes[frameIndex] ?? validTimes[0],
    [validTimes],
  )

  const nextFrameTime = useCallback(
    (frameIndex: number) => {
      if (!validTimes.length) return undefined
      const next = (frameIndex + 1) % validTimes.length
      return validTimes[next]
    },
    [validTimes],
  )

  const syncFrameToIso = useCallback(
    (iso?: string) => closestGfsFrameIndex(validTimes, iso),
    [validTimes],
  )

  return {
    meta,
    error,
    validTimes,
    labels,
    rasterBlend,
    setRasterBlend,
    pickFrameTime,
    nextFrameTime,
    syncFrameToIso,
    refreshMeta: () => load(),
  }
}
