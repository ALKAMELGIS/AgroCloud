import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchSen2srStatus,
  formatSen2srResultNotice,
  runSen2srSuperResolution,
  Sen2srServiceError,
  type Sen2srProductMode,
  type Sen2srResult,
  type Sen2srStatus,
} from '../../../lib/agriFieldBoundary/sen2srClient'

const STATUS_POLL_MS = 30_000

export type UseSen2srControlsOptions = {
  /** When false, skip status probes (e.g. RS panel with non-S2 collection). Default true. */
  enabled?: boolean
  /** Optional AOI clip for enhance requests. */
  resolveAoi?: () =>
    | GeoJSON.Polygon
    | GeoJSON.MultiPolygon
    | GeoJSON.Feature
    | GeoJSON.FeatureCollection
    | null
}

/**
 * Shared SEN2SR UI state: status polling, RAW/SEN2SR mode, optional 1m display,
 * local GeoTIFF pick + Enhance with SEN2SR.
 */
export function useSen2srControls(opts: UseSen2srControlsOptions = {}) {
  const enabled = opts.enabled !== false
  const resolveAoiRef = useRef(opts.resolveAoi)
  resolveAoiRef.current = opts.resolveAoi

  const [status, setStatus] = useState<Sen2srStatus | null>(null)
  const [productMode, setProductMode] = useState<Sen2srProductMode>('raw')
  const [display1m, setDisplay1m] = useState(false)
  const [geotiffFile, setGeotiffFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<Sen2srResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus(null)
      return
    }
    const ac = new AbortController()
    const probe = () => {
      void fetchSen2srStatus(ac.signal).then(s => {
        if (!ac.signal.aborted) setStatus(s)
      })
    }
    probe()
    const id = window.setInterval(probe, STATUS_POLL_MS)
    return () => {
      ac.abort()
      window.clearInterval(id)
    }
  }, [enabled])

  const pickGeotiff = useCallback((file: File | null) => {
    setGeotiffFile(file)
    setError(null)
    setNotice(null)
    setResult(null)
  }, [])

  const clearGeotiff = useCallback(() => {
    setGeotiffFile(null)
  }, [])

  const enhance = useCallback(async () => {
    if (!geotiffFile) {
      setError('Select a Sentinel-2 L2A GeoTIFF before running SEN2SR.')
      return
    }
    if (status && !status.available) {
      setError(status.error || 'SEN2SR is unavailable on the field-boundary service.')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const aoi = resolveAoiRef.current?.() ?? null
      const out = await runSen2srSuperResolution({
        file: geotiffFile,
        aoi,
        display1m,
        signal: controller.signal,
      })
      setResult(out)
      setNotice(formatSen2srResultNotice(out))
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const msg =
        err instanceof Sen2srServiceError
          ? err.message
          : (err as Error)?.message || 'SEN2SR super-resolution failed.'
      setError(msg)
      setResult(null)
    } finally {
      setBusy(false)
    }
  }, [display1m, geotiffFile, status])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setProductMode('raw')
    setDisplay1m(false)
    setGeotiffFile(null)
    setBusy(false)
    setError(null)
    setNotice(null)
    setResult(null)
  }, [])

  return {
    enabled,
    status,
    available: Boolean(status?.available),
    productMode,
    setProductMode,
    display1m,
    setDisplay1m,
    geotiffFile,
    geotiffFileName: geotiffFile?.name ?? null,
    pickGeotiff,
    clearGeotiff,
    busy,
    error,
    notice,
    result,
    canEnhance: Boolean(geotiffFile) && Boolean(status?.available) && !busy,
    enhance,
    reset,
  }
}
