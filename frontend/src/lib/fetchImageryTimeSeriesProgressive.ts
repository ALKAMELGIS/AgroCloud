import type { CropAlertFieldInput } from './siCropAlertEngine'
import { mapPool } from './siCropAlertSentinelLive'
import {
  fetchSentinelFieldIndexTimeSeriesForRange,
  fetchSentinelHubStatisticsProxyStatus,
  hasValidIndexDaily,
  imageryStatisticsFetchNeedsSnowNdsi,
  isSentinelHubStatisticsConfigured,
  mergeDailyIndexSeries,
  parseSentinelHubStatsResponse,
  resolveImageryStatisticsFetchMode,
  simplifyGeometryForSentinelStats,
  type SentinelHubDailyIndexMeans,
} from './sentinelHubStatisticsApi'
import { isBackendKnownUnavailable, isStaticDeploymentWithoutBackend } from './apiOrigin'
import {
  isSentinelHubWmsClientStatisticsAvailable,
  postSentinelStatisticsViaWmsClient,
} from './sentinelHubWmsStatisticsClient'
import { addDaysToIso } from './siSentinelImageryDate'
import {
  buildNdsiSnowTimeSeriesDebugReport,
  logNdsiSnowTimeSeriesDebug,
} from './ndsiSnowTimeSeriesDebug'
import {
  buildImageryTsCacheKey,
  buildImageryTsChunkCacheKey,
  geometryHashForImageryCache,
  isImageryTsCacheFresh,
  isImageryTsCacheStaleButUsable,
  readImageryTsCache,
  readImageryTsChunkCache,
  writeImageryTsCache,
  writeImageryTsChunkCache,
} from './imageryTimeSeriesCache'

export const DEFAULT_IMAGERY_TS_CLOUD_FILTER = 65
export const IMAGERY_TS_CHUNK_DAYS = 90
/** Smallest first window for fast chart paint (~1–2 s target). */
export const IMAGERY_TS_PREVIEW_DAYS = 14
/** Smaller chunks when the server uses WMS zonal fallback (many per-scene GetMap calls). */
export const IMAGERY_TS_WMS_CHUNK_DAYS = 56
export const IMAGERY_TS_FETCH_CONCURRENCY = 4
export const IMAGERY_TS_WMS_FETCH_CONCURRENCY = 6
export const IMAGERY_TS_PROXY_STATUS_TIMEOUT_MS = 250

export type ImageryDateChunk = { fromIso: string; toIso: string }

export type ImageryTimeSeriesProgress = {
  phase: 'idle' | 'cache' | 'fetching' | 'complete' | 'error' | 'aborted'
  message: string
  chunksDone: number
  chunksTotal: number
  observations: number
  percent: number
  fromCache: boolean
  refreshing: boolean
}

export type ImageryTimeSeriesProgressPayload = {
  daily: SentinelHubDailyIndexMeans[]
  progress: ImageryTimeSeriesProgress
}

function addDaysToIso(iso: string, days: number): string {
  const d = new Date(`${iso.trim().slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetweenInclusive(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T12:00:00Z`)
  const to = Date.parse(`${toIso}T12:00:00Z`)
  return Math.max(1, Math.ceil((to - from) / 86400000) + 1)
}

/** Split a range into chunks — preview window first, then older ranges. */
export function planImageryDateChunks(
  fromIso: string,
  toIso: string,
  maxChunkDays = IMAGERY_TS_CHUNK_DAYS,
  previewDays = IMAGERY_TS_PREVIEW_DAYS,
): ImageryDateChunk[] {
  const from = fromIso.trim().slice(0, 10)
  const to = toIso.trim().slice(0, 10)
  if (!from || !to || from >= to) return []
  const totalDays = daysBetweenInclusive(from, to)
  if (totalDays <= maxChunkDays && totalDays <= previewDays) {
    return [{ fromIso: from, toIso: to }]
  }

  const chunks: ImageryDateChunk[] = []

  if (previewDays > 0 && totalDays > previewDays) {
    const previewFrom = addDaysToIso(to, -(previewDays - 1))
    const previewStart = previewFrom < from ? from : previewFrom
    chunks.push({ fromIso: previewStart, toIso: to })
  }

  let cursorEnd = chunks.length
    ? addDaysToIso(chunks[0]!.fromIso, -1)
    : to

  if (cursorEnd < from) {
    return chunks.length ? chunks : [{ fromIso: from, toIso: to }]
  }

  while (cursorEnd >= from) {
    const chunkFrom = addDaysToIso(cursorEnd, -(maxChunkDays - 1))
    const start = chunkFrom < from ? from : chunkFrom
    chunks.push({ fromIso: start, toIso: cursorEnd })
    cursorEnd = addDaysToIso(start, -1)
  }

  return chunks.length ? chunks : [{ fromIso: from, toIso: to }]
}

export function countImageryObservations(daily: SentinelHubDailyIndexMeans[]): number {
  return daily.filter(
    row =>
      row.ndvi != null ||
      row.ndwi != null ||
      row.ndmi != null ||
      row.ndsi != null ||
      row.evi != null ||
      row.savi != null ||
      row.ciRe != null,
  ).length
}

function buildProgressMessage(chunksDone: number, chunksTotal: number, observations: number): string {
  if (chunksTotal <= 1) {
    return observations > 0
      ? `Showing available observations… (${observations})`
      : 'Loading imagery…'
  }
  const pct = chunksTotal > 0 ? Math.round((chunksDone / chunksTotal) * 100) : 0
  return `${chunksDone} of ${chunksTotal} ranges processed (${pct}%) · ${observations} obs`
}

const chunkInflight = new Map<string, Promise<SentinelHubDailyIndexMeans[]>>()

function imageryTsEmptyResultError(chunksTotal: number, lastChunkError: string | null): Error {
  if (lastChunkError?.trim()) {
    return new Error(lastChunkError.trim())
  }
  if (isStaticDeploymentWithoutBackend() || isBackendKnownUnavailable()) {
    return new Error(
      'Could not load Sentinel statistics for this AOI/date range. Try a shorter date range, or redraw the field and retry.',
    )
  }
  if (!isSentinelHubStatisticsConfigured()) {
    return new Error(
      'Sentinel statistics are not configured. Add a Sentinel Hub access token in System Settings, or run the AgroCloud backend locally.',
    )
  }
  return new Error(
    chunksTotal > 1
      ? 'Could not load Sentinel statistics — try a shorter date range or check Sentinel coverage for this AOI.'
      : 'Could not load Sentinel statistics — try a shorter date range or check Sentinel coverage for this AOI.',
  )
}

async function fetchChunkDailyViaBrowserWms(
  geometry: GeoJSON.Geometry,
  chunk: ImageryDateChunk,
  rangeFrom: string,
  rangeTo: string,
  cloudFilter: number,
  signal?: AbortSignal,
): Promise<SentinelHubDailyIndexMeans[]> {
  const geom = simplifyGeometryForSentinelStats(geometry) ?? geometry
  const toExclusive = addDaysToIso(chunk.toIso, 1)
  const body: Record<string, unknown> = {
    input: {
      bounds: {
        geometry: geom,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            mosaickingOrder: 'leastCC',
            maxCloudCoverage: cloudFilter,
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${chunk.fromIso}T00:00:00Z`,
        to: `${toExclusive}T00:00:00Z`,
      },
      aggregationInterval: { of: 'P1D' },
      evalscript: '//VERSION=3\nfunction setup(){return{input:["B04"],output:{bands:1}}}\nfunction evaluatePixel(){return[0]}',
      resx: 10,
      resy: 10,
    },
  }
  const json = await postSentinelStatisticsViaWmsClient(body, signal)
  const daily = parseSentinelHubStatsResponse(json as Parameters<typeof parseSentinelHubStatsResponse>[0])
  return daily.filter(row => row.date >= rangeFrom && row.date <= rangeTo)
}

function shouldPreferBrowserWmsStatistics(): boolean {
  return (
    (isStaticDeploymentWithoutBackend() || isBackendKnownUnavailable()) &&
    isSentinelHubWmsClientStatisticsAvailable()
  )
}

async function fetchChunkDaily(
  geometry: GeoJSON.Geometry,
  chunk: ImageryDateChunk,
  rangeFrom: string,
  rangeTo: string,
  cloudFilter: number,
  layerIds: string[],
  signal: AbortSignal | undefined,
  onChunkError: (message: string) => void,
): Promise<SentinelHubDailyIndexMeans[]> {
  const statsMode = resolveImageryStatisticsFetchMode(layerIds)
  const geomHash = geometryHashForImageryCache(geometry)
  const chunkCacheKey = buildImageryTsChunkCacheKey(
    geomHash,
    chunk.fromIso,
    chunk.toIso,
    cloudFilter,
    statsMode,
  )
  const chunkKey = `${geomHash}|${chunk.fromIso}|${chunk.toIso}|${cloudFilter}|${statsMode}`
  const existing = chunkInflight.get(chunkKey)
  if (existing) return existing

  const promise = (async () => {
    if (signal?.aborted) return []
    const cachedChunk = await readImageryTsChunkCache(chunkCacheKey)
    if (cachedChunk?.length) {
      return cachedChunk.filter(row => row.date >= rangeFrom && row.date <= rangeTo)
    }
    try {
      // Static production (eliteagrocloud.com): call browser WMS directly so this module
      // owns the dependency (avoids Vite parking WMS client only in Layer Live's chunk).
      if (shouldPreferBrowserWmsStatistics()) {
        let daily = await fetchChunkDailyViaBrowserWms(
          geometry,
          chunk,
          rangeFrom,
          rangeTo,
          cloudFilter,
          signal,
        )
        if (!hasValidIndexDaily(daily) && !signal?.aborted) {
          const relaxed = await fetchChunkDailyViaBrowserWms(
            geometry,
            chunk,
            rangeFrom,
            rangeTo,
            95,
            signal,
          )
          daily = mergeDailyIndexSeries(daily, relaxed)
        }
        if (daily.length) void writeImageryTsChunkCache(chunkCacheKey, daily)
        return daily
      }

      let daily = await fetchSentinelFieldIndexTimeSeriesForRange({
        geometry,
        fromIso: chunk.fromIso,
        toIso: chunk.toIso,
        maxCloudCoverage: cloudFilter,
        layerIds,
        signal,
      })
      if (!hasValidIndexDaily(daily) && !signal?.aborted) {
        const relaxed = await fetchSentinelFieldIndexTimeSeriesForRange({
          geometry,
          fromIso: chunk.fromIso,
          toIso: chunk.toIso,
          maxCloudCoverage: 95,
          relaxedCloudMask: true,
          layerIds,
          signal,
        })
        daily = mergeDailyIndexSeries(daily, relaxed)
      }
      const filtered = daily.filter(row => row.date >= rangeFrom && row.date <= rangeTo)
      if (filtered.length) void writeImageryTsChunkCache(chunkCacheKey, daily)
      return filtered
    } catch (err) {
      if (signal?.aborted) return []
      const message = err instanceof Error ? err.message : String(err)
      onChunkError(message)
      console.warn('[imagery-ts] chunk fetch failed', chunk, err)
      return []
    }
  })()

  chunkInflight.set(chunkKey, promise)
  try {
    return await promise
  } finally {
    chunkInflight.delete(chunkKey)
  }
}

const runInflight = new Map<string, Promise<SentinelHubDailyIndexMeans[]>>()

export type FetchImageryTimeSeriesProgressiveOptions = {
  fromIso: string
  toIso: string
  maxCloudCoverage?: number
  concurrency?: number
  layerIds?: string[]
  signal?: AbortSignal
  onProgress?: (payload: ImageryTimeSeriesProgressPayload) => void
}

export async function fetchImageryTimeSeriesProgressive(
  field: CropAlertFieldInput,
  options: FetchImageryTimeSeriesProgressiveOptions,
): Promise<SentinelHubDailyIndexMeans[]> {
  const fromIso = options.fromIso.trim().slice(0, 10)
  const toIso = options.toIso.trim().slice(0, 10)
  if (!field.geometry || !fromIso || !toIso || fromIso >= toIso) return []

  const cloudFilter = options.maxCloudCoverage ?? DEFAULT_IMAGERY_TS_CLOUD_FILTER
  const layerIds = options.layerIds?.length ? options.layerIds : ['NDVI']
  const statsMode = resolveImageryStatisticsFetchMode(layerIds)
  const cacheKey = buildImageryTsCacheKey({
    fieldKey: field.fieldKey,
    geometryHash: geometryHashForImageryCache(field.geometry),
    fromIso,
    toIso,
    cloudFilter,
    statsMode,
  })

  const existingRun = runInflight.get(cacheKey)
  if (existingRun) return existingRun

  const runPromise = (async () => {
    const emit = (daily: SentinelHubDailyIndexMeans[], progress: ImageryTimeSeriesProgress) => {
      options.onProgress?.({ daily, progress })
    }

    if (options.signal?.aborted) {
      emit([], {
        phase: 'aborted',
        message: 'Cancelled',
        chunksDone: 0,
        chunksTotal: 0,
        observations: 0,
        percent: 0,
        fromCache: false,
        refreshing: false,
      })
      return []
    }

    emit([], {
      phase: 'fetching',
      message: 'Loading imagery…',
      chunksDone: 0,
      chunksTotal: 0,
      observations: 0,
      percent: 0,
      fromCache: false,
      refreshing: false,
    })

    const cachedPromise = readImageryTsCache(cacheKey)
    const statusPromise = Promise.race([
      fetchSentinelHubStatisticsProxyStatus({ signal: options.signal }),
      new Promise<null>(resolve => {
        setTimeout(() => resolve(null), IMAGERY_TS_PROXY_STATUS_TIMEOUT_MS)
      }),
    ])

    const [cached, proxyStatus] = await Promise.all([cachedPromise, statusPromise])
    let merged = cached?.daily ?? []
    let lastChunkError: string | null = null

    // On static production there is no Node proxy — skip the "not configured on server" hard-fail
    // and use browser WMS zonal (via postSentinelStatisticsRequest client fallback).
    const staticNoBackend = isStaticDeploymentWithoutBackend() || isBackendKnownUnavailable()
    if (proxyStatus && !proxyStatus.configured && !staticNoBackend) {
      throw new Error(
        proxyStatus.hint ||
          'Sentinel Hub statistics are not configured on the server — set SENTINEL_HUB_WMS_INSTANCE_ID or CDSE OAuth credentials.',
      )
    }
    const useWmsSizedChunks =
      proxyStatus?.mode === 'wms-zonal' || staticNoBackend || !proxyStatus
    const chunkDays = useWmsSizedChunks ? IMAGERY_TS_WMS_CHUNK_DAYS : IMAGERY_TS_CHUNK_DAYS
    const fetchConcurrency =
      options.concurrency ??
      (useWmsSizedChunks ? IMAGERY_TS_WMS_FETCH_CONCURRENCY : IMAGERY_TS_FETCH_CONCURRENCY)
    const chunks = planImageryDateChunks(fromIso, toIso, chunkDays)
    const chunksTotal = chunks.length

    if (cached?.daily?.length && isImageryTsCacheStaleButUsable(cached)) {
      const fresh = isImageryTsCacheFresh(cached)
      emit(merged, {
        phase: fresh ? 'complete' : 'fetching',
        message: fresh ? 'Loaded from cache' : 'Showing cached observations…',
        chunksDone: fresh ? chunksTotal : 0,
        chunksTotal,
        observations: countImageryObservations(merged),
        percent: fresh ? 100 : 0,
        fromCache: true,
        refreshing: !fresh,
      })
      if (fresh) return merged
    }

    if (!merged.length) {
      emit(merged, {
        phase: 'fetching',
        message: 'Fetching recent scenes…',
        chunksDone: 0,
        chunksTotal,
        observations: 0,
        percent: 0,
        fromCache: false,
        refreshing: false,
      })
    }

    let chunksDone = 0
    let mergeChain = Promise.resolve()

    const reportMerge = (
      rows: SentinelHubDailyIndexMeans[],
      complete: boolean,
      refreshing: boolean,
    ) => {
      mergeChain = mergeChain.then(() => {
        merged = mergeDailyIndexSeries(merged, rows)
        chunksDone += 1
        emit(merged, {
          phase: complete ? 'complete' : 'fetching',
          message: complete
            ? `Complete · ${countImageryObservations(merged)} observations`
            : buildProgressMessage(chunksDone, chunksTotal, countImageryObservations(merged)),
          chunksDone,
          chunksTotal,
          observations: countImageryObservations(merged),
          percent: chunksTotal > 0 ? Math.round((chunksDone / chunksTotal) * 100) : 100,
          fromCache: false,
          refreshing,
        })
        void writeImageryTsCache(cacheKey, {
          fieldKey: field.fieldKey,
          fromIso,
          toIso,
          cloudFilter,
          daily: merged,
        })
      })
      return mergeChain
    }

    if (chunks.length && !options.signal?.aborted) {
      await mapPool(chunks, fetchConcurrency, async chunk => {
        if (options.signal?.aborted) return []
        const rows = await fetchChunkDaily(
          field.geometry!,
          chunk,
          fromIso,
          toIso,
          cloudFilter,
          layerIds,
          options.signal,
          message => {
            lastChunkError = message
          },
        )
        await reportMerge(rows, false, !!cached?.daily?.length)
        return rows
      })
      await mergeChain
      if (!options.signal?.aborted) {
        emit(merged, {
          phase: 'complete',
          message: `Complete · ${countImageryObservations(merged)} observations`,
          chunksDone: chunksTotal,
          chunksTotal,
          observations: countImageryObservations(merged),
          percent: 100,
          fromCache: false,
          refreshing: false,
        })
      }
    }

    await mergeChain

    if (!merged.length && chunksTotal > 0 && !options.signal?.aborted) {
      throw imageryTsEmptyResultError(chunksTotal, lastChunkError)
    }

    if (imageryStatisticsFetchNeedsSnowNdsi(layerIds) && merged.length) {
      logNdsiSnowTimeSeriesDebug(
        'fetch complete',
        buildNdsiSnowTimeSeriesDebugReport(merged, layerIds, fromIso, toIso, statsMode),
        {
          proxyMode: proxyStatus?.mode ?? 'unknown',
          chunksTotal,
          observations: countImageryObservations(merged),
        },
      )
    }

    if (options.signal?.aborted) {
      emit(merged, {
        phase: 'aborted',
        message: 'Cancelled',
        chunksDone,
        chunksTotal,
        observations: countImageryObservations(merged),
        percent: chunksTotal > 0 ? Math.round((chunksDone / chunksTotal) * 100) : 0,
        fromCache: false,
        refreshing: false,
      })
      return merged
    }

    if (!merged.length) {
      emit(merged, {
        phase: 'complete',
        message: 'No observations in range',
        chunksDone: chunksTotal,
        chunksTotal,
        observations: 0,
        percent: 100,
        fromCache: false,
        refreshing: false,
      })
    }

    return merged
  })()

  runInflight.set(cacheKey, runPromise)
  try {
    return await runPromise
  } finally {
    runInflight.delete(cacheKey)
  }
}

/** Warm cache for recent dates after field selection (no UI updates). */
export function prefetchImageryTimeSeriesRecent(
  field: CropAlertFieldInput,
  referenceIso: string,
  lookbackDays = 90,
): void {
  if (!field.geometry) return
  const toIso = referenceIso.trim().slice(0, 10)
  if (!toIso) return
  const fromIso = addDaysToIso(toIso, -(lookbackDays - 1))
  void fetchImageryTimeSeriesProgressive(field, { fromIso, toIso }).catch(() => {
    /* background prefetch */
  })
}
