import type { CropAlertFieldInput } from './siCropAlertEngine'
import { mapPool } from './siCropAlertSentinelLive'
import {
  fetchSentinelFieldIndexTimeSeriesForRange,
  fetchSentinelHubStatisticsProxyStatus,
  hasValidIndexDaily,
  mergeDailyIndexSeries,
  type SentinelHubDailyIndexMeans,
} from './sentinelHubStatisticsApi'
import {
  buildImageryTsCacheKey,
  geometryHashForImageryCache,
  isImageryTsCacheFresh,
  isImageryTsCacheStaleButUsable,
  readImageryTsCache,
  writeImageryTsCache,
} from './imageryTimeSeriesCache'

export const DEFAULT_IMAGERY_TS_CLOUD_FILTER = 65
export const IMAGERY_TS_CHUNK_DAYS = 90
/** Smaller chunks when the server uses WMS zonal fallback (many per-scene GetMap calls). */
export const IMAGERY_TS_WMS_CHUNK_DAYS = 28
export const IMAGERY_TS_FETCH_CONCURRENCY = 3

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

/** Split a range into chunks with the most recent window first for fast first paint. */
export function planImageryDateChunks(
  fromIso: string,
  toIso: string,
  maxChunkDays = IMAGERY_TS_CHUNK_DAYS,
): ImageryDateChunk[] {
  const from = fromIso.trim().slice(0, 10)
  const to = toIso.trim().slice(0, 10)
  if (!from || !to || from >= to) return []
  const totalDays = daysBetweenInclusive(from, to)
  if (totalDays <= maxChunkDays) return [{ fromIso: from, toIso: to }]

  const chunks: ImageryDateChunk[] = []
  const recentFrom = addDaysToIso(to, -(maxChunkDays - 1))
  const recentStart = recentFrom < from ? from : recentFrom
  chunks.push({ fromIso: recentStart, toIso: to })

  let cursorEnd = addDaysToIso(recentStart, -1)
  while (cursorEnd >= from) {
    const chunkFrom = addDaysToIso(cursorEnd, -(maxChunkDays - 1))
    const start = chunkFrom < from ? from : chunkFrom
    chunks.push({ fromIso: start, toIso: cursorEnd })
    cursorEnd = addDaysToIso(start, -1)
  }
  return chunks
}

export function countImageryObservations(daily: SentinelHubDailyIndexMeans[]): number {
  return daily.filter(
    row =>
      row.ndvi != null ||
      row.ndwi != null ||
      row.ndmi != null ||
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

async function fetchChunkDaily(
  geometry: GeoJSON.Geometry,
  chunk: ImageryDateChunk,
  rangeFrom: string,
  rangeTo: string,
  cloudFilter: number,
  signal?: AbortSignal,
): Promise<SentinelHubDailyIndexMeans[]> {
  const chunkKey = `${geometryHashForImageryCache(geometry)}|${chunk.fromIso}|${chunk.toIso}|${cloudFilter}`
  const existing = chunkInflight.get(chunkKey)
  if (existing) return existing

  const promise = (async () => {
    if (signal?.aborted) return []
    try {
      let daily = await fetchSentinelFieldIndexTimeSeriesForRange({
        geometry,
        fromIso: chunk.fromIso,
        toIso: chunk.toIso,
        maxCloudCoverage: cloudFilter,
        signal,
      })
      if (!hasValidIndexDaily(daily) && !signal?.aborted) {
        const relaxed = await fetchSentinelFieldIndexTimeSeriesForRange({
          geometry,
          fromIso: chunk.fromIso,
          toIso: chunk.toIso,
          maxCloudCoverage: 95,
          relaxedCloudMask: true,
          signal,
        })
        daily = mergeDailyIndexSeries(daily, relaxed)
      }
      return daily.filter(row => row.date >= rangeFrom && row.date <= rangeTo)
    } catch (err) {
      if (signal?.aborted) return []
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
  const cacheKey = buildImageryTsCacheKey({
    fieldKey: field.fieldKey,
    geometryHash: geometryHashForImageryCache(field.geometry),
    fromIso,
    toIso,
    cloudFilter,
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

    const cached = await readImageryTsCache(cacheKey)
    let merged = cached?.daily ?? []

    const proxyStatus = await fetchSentinelHubStatisticsProxyStatus({ signal: options.signal })
    if (proxyStatus && !proxyStatus.configured) {
      throw new Error(
        proxyStatus.hint ||
          'Sentinel Hub statistics are not configured on the server — set SENTINEL_HUB_WMS_INSTANCE_ID or CDSE OAuth credentials.',
      )
    }
    const chunkDays =
      proxyStatus?.mode === 'wms-zonal' ? IMAGERY_TS_WMS_CHUNK_DAYS : IMAGERY_TS_CHUNK_DAYS
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
        message: 'Loading imagery…',
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

    const reportMerge = (rows: SentinelHubDailyIndexMeans[], complete: boolean, refreshing: boolean) => {
      mergeChain = mergeChain.then(async () => {
        merged = mergeDailyIndexSeries(merged, rows)
        chunksDone += 1
        await writeImageryTsCache(cacheKey, {
          fieldKey: field.fieldKey,
          fromIso,
          toIso,
          cloudFilter,
          daily: merged,
        })
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
      })
      return mergeChain
    }

    const [firstChunk, ...restChunks] = chunks
    if (firstChunk && !options.signal?.aborted) {
      const firstRows = await fetchChunkDaily(
        field.geometry!,
        firstChunk,
        fromIso,
        toIso,
        cloudFilter,
        options.signal,
      )
      await reportMerge(firstRows, !restChunks.length, !!cached?.daily?.length)
    }

    if (restChunks.length && !options.signal?.aborted) {
      await mapPool(restChunks, options.concurrency ?? IMAGERY_TS_FETCH_CONCURRENCY, async chunk => {
        if (options.signal?.aborted) return []
        const rows = await fetchChunkDaily(
          field.geometry!,
          chunk,
          fromIso,
          toIso,
          cloudFilter,
          options.signal,
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
      throw new Error(
        'Could not load Sentinel statistics — ensure the AgroCloud backend is running (npm run dev) and try a shorter date range.',
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
