/**
 * Fetch Sentinel Live index time series for crop alert fields (Statistical API + cache).
 */

import type { CropAlertFieldInput, CropAlertFieldResult, CropAlertIndexSnapshot, CropAlertTrend } from './siCropAlertEngine'
import { buildIndexSnapshot, deriveCoherentIndicesFromNdvi, seasonalPeakNdvi } from './siCropAlertEngine'
import {
  analyzeNdviSceneSeries,
  resolveTrendFromDaily,
  snapshotFromNdviScene,
  type NdviSceneSeriesAnalysis,
} from './siCropAlertNdviTimeSeries'
import {
  buildFieldImageryMeta,
  type CropAlertFieldImageryMeta,
  type CropAlertImageryContext,
  findExactObservationRow,
} from './siCropAlertImageryValidation'
import { subtractDaysFromIso } from './siSentinelImageryDate'
import {
  CROP_ALERT_SENTINEL_LOOKBACK_DAYS,
  fetchSentinelFieldIndexByCatalogScenes,
  fetchSentinelFieldIndexTimeSeries,
  fetchSentinelFieldIndexTimeSeriesForRange,
  hasValidIndexDaily,
  mergeDailyIndexSeries,
  pickCatalogSceneDatesForFetch,
  pickDailyIndexValueExact,
  pickSceneZonalStatsFromDaily,
  type SentinelHubDailyIndexMeans,
  type SentinelHubFieldTimeSeries,
} from './sentinelHubStatisticsApi'
import {
  runSentinelFieldBatchJob,
  SENTINEL_FIELD_BATCH_SERVER_THRESHOLD,
} from './sentinelFieldBatchApi'

import type { SiInstanceScope } from '../pages/satellite/siInstanceScope'

export type CropAlertSentinelFetchProgress = {
  done: number
  total: number
  live: number
  sampled: number
  failed: number
}

export type CropAlertSentinelCacheScope = SiInstanceScope

const seriesCaches = new Map<CropAlertSentinelCacheScope, Map<string, SentinelHubFieldTimeSeries>>()
const SERIES_CACHE_SESSION_KEY = 'si-crop-alert-sentinel-series-v1'
const SERIES_CACHE_TTL_MS = 12 * 60 * 60_000

function resolveSeriesCacheScope(scope?: CropAlertSentinelCacheScope): CropAlertSentinelCacheScope {
  return scope ?? 'standalone'
}

function getSeriesCache(scope?: CropAlertSentinelCacheScope): Map<string, SentinelHubFieldTimeSeries> {
  const resolved = resolveSeriesCacheScope(scope)
  let cache = seriesCaches.get(resolved)
  if (!cache) {
    cache = new Map()
    seriesCaches.set(resolved, cache)
  }
  return cache
}

function seriesSessionStorageKey(scope?: CropAlertSentinelCacheScope): string {
  void scope
  return SERIES_CACHE_SESSION_KEY
}

function cacheKey(fieldKey: string, referenceDate: string, lookbackDays: number): string {
  return `${fieldKey}|${referenceDate}|${lookbackDays}`
}

export function isCropAlertSentinelSeriesCached(
  fieldKey: string,
  referenceDate: string,
  lookbackDays: number,
  cacheScope?: CropAlertSentinelCacheScope,
): boolean {
  const key = cacheKey(fieldKey, referenceDate, lookbackDays)
  const resolved = resolveSeriesCacheScope(cacheScope)
  const cached = getSeriesCache(resolved).get(key)
  if (cached && Date.now() - cached.fetchedAt < SERIES_CACHE_TTL_MS) return true
  return Boolean(readSeriesFromSession(key, resolved))
}

export function filterCropAlertFieldsNeedingSentinelFetch(
  fields: CropAlertFieldInput[],
  referenceDate: string,
  lookbackDays: number,
  cacheScope?: CropAlertSentinelCacheScope,
): CropAlertFieldInput[] {
  return fields.filter(
    field => !isCropAlertSentinelSeriesCached(field.fieldKey, referenceDate, lookbackDays, cacheScope),
  )
}

function readSeriesFromSession(key: string, scope?: CropAlertSentinelCacheScope): SentinelHubFieldTimeSeries | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(seriesSessionStorageKey(scope))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, SentinelHubFieldTimeSeries>
    const row = parsed[key]
    if (!row || Date.now() - (row.fetchedAt ?? 0) > SERIES_CACHE_TTL_MS) return null
    return row
  } catch {
    return null
  }
}

function writeSeriesToSession(
  key: string,
  series: SentinelHubFieldTimeSeries,
  scope?: CropAlertSentinelCacheScope,
): void {
  if (typeof window === 'undefined') return
  try {
    const sessionKey = seriesSessionStorageKey(scope)
    const raw = window.sessionStorage.getItem(sessionKey)
    const parsed = raw ? (JSON.parse(raw) as Record<string, SentinelHubFieldTimeSeries>) : {}
    parsed[key] = series
    window.sessionStorage.setItem(sessionKey, JSON.stringify(parsed))
  } catch {
    /* ignore quota */
  }
}

function snapshotFromDailyExact(
  daily: SentinelHubDailyIndexMeans[],
  isoDate: string,
  field: CropAlertFieldInput,
): CropAlertIndexSnapshot | null {
  const row = findExactObservationRow(daily, isoDate)
  if (!row) return null

  const ndvi = pickDailyIndexValueExact(daily, isoDate, 'ndvi')
  const ndwi = pickDailyIndexValueExact(daily, isoDate, 'ndwi')
  const ndmi = pickDailyIndexValueExact(daily, isoDate, 'ndmi')
  const evi = pickDailyIndexValueExact(daily, isoDate, 'evi')

  if (ndvi == null && ndwi == null && ndmi == null) return null

  if (ndvi != null) {
    const coherent = deriveCoherentIndicesFromNdvi(ndvi, field.fieldKey, isoDate)
    return {
      ndvi,
      ndmi: ndmi ?? coherent.ndmi,
      ndwi: ndwi ?? coherent.ndwi,
      evi: evi ?? coherent.evi,
    }
  }

  return buildIndexSnapshot(field.fieldKey, isoDate, field.structureType)
}

function seasonalPeakFromDaily(daily: SentinelHubDailyIndexMeans[]): number {
  let peak = 0
  for (const row of daily) {
    if (row.ndvi != null && row.ndvi > peak) peak = row.ndvi
  }
  return peak
}

function buildTemporalSyntheticDaily(
  field: CropAlertFieldInput,
  referenceDate: string,
  catalogSceneIsos: string[],
): SentinelHubDailyIndexMeans[] {
  const catalogDates = pickCatalogSceneDatesForFetch(catalogSceneIsos, referenceDate, 5)
  const dates =
    catalogDates.length >= 2
      ? catalogDates
      : [0, 7, 14, 21].map(offset => subtractDaysFromIso(referenceDate, offset))
  return dates.map(date => {
    const snap = buildIndexSnapshot(field.fieldKey, date, field.structureType)
    return { date, ndvi: snap.ndvi, ndwi: snap.ndwi, ndmi: snap.ndmi, evi: snap.evi }
  })
}

export function getCachedCropAlertFieldSentinelSeries(
  fieldKey: string,
  referenceDate: string,
  lookbackDays: number = CROP_ALERT_SENTINEL_LOOKBACK_DAYS,
  cacheScope?: CropAlertSentinelCacheScope,
): SentinelHubFieldTimeSeries | null {
  const key = cacheKey(fieldKey, referenceDate, lookbackDays)
  const resolved = resolveSeriesCacheScope(cacheScope)
  const cached = getSeriesCache(resolved).get(key)
  if (cached && Date.now() - cached.fetchedAt < SERIES_CACHE_TTL_MS) return cached
  return readSeriesFromSession(key, resolved)
}

async function resolveFieldDailySeries(
  field: CropAlertFieldInput,
  referenceDate: string,
  options?: { signal?: AbortSignal; catalogSceneIsos?: string[]; lookbackDays?: number },
): Promise<{ daily: SentinelHubDailyIndexMeans[]; syntheticFill: boolean; error?: string }> {
  if (!field.geometry) {
    const synthetic = buildTemporalSyntheticDaily(field, referenceDate, options?.catalogSceneIsos ?? [])
    return { daily: synthetic, syntheticFill: true, error: 'Missing field geometry' }
  }

  let lastError: string | undefined
  let daily: SentinelHubDailyIndexMeans[] = []

  const lookbackDays = options?.lookbackDays ?? CROP_ALERT_SENTINEL_LOOKBACK_DAYS

  try {
    daily = await fetchSentinelFieldIndexTimeSeries({
      geometry: field.geometry,
      referenceDate,
      signal: options?.signal,
      lookbackDays,
    })
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  }

  const catalogDates = options?.catalogSceneIsos ?? []
  if (!hasValidIndexDaily(daily)) {
    const sceneDates =
      catalogDates.length > 0 ? pickCatalogSceneDatesForFetch(catalogDates, referenceDate, 8) : []

    const [relaxedSettled, catalogSettled] = await Promise.allSettled([
      fetchSentinelFieldIndexTimeSeries({
        geometry: field.geometry,
        referenceDate,
        signal: options?.signal,
        maxCloudCoverage: 95,
        relaxedCloudMask: true,
        lookbackDays,
      }),
      sceneDates.length
        ? fetchSentinelFieldIndexByCatalogScenes({
            geometry: field.geometry,
            sceneDates,
            maxCloudCoverage: 90,
            signal: options?.signal,
          })
        : Promise.resolve([] as SentinelHubDailyIndexMeans[]),
    ])

    if (relaxedSettled.status === 'fulfilled') {
      daily = mergeDailyIndexSeries(daily, relaxedSettled.value)
    } else {
      lastError = relaxedSettled.reason instanceof Error ? relaxedSettled.reason.message : String(relaxedSettled.reason)
    }

    if (catalogSettled.status === 'fulfilled') {
      daily = mergeDailyIndexSeries(daily, catalogSettled.value)
    } else if (catalogSettled.status === 'rejected') {
      const catalogErr =
        catalogSettled.reason instanceof Error ? catalogSettled.reason.message : String(catalogSettled.reason)
      lastError = lastError ?? catalogErr
    }
  }

  if (!hasValidIndexDaily(daily)) {
    const synthetic = buildTemporalSyntheticDaily(field, referenceDate, catalogDates)
    if (synthetic.length) {
      return { daily: synthetic, syntheticFill: true, error: lastError }
    }
  }

  return { daily, syntheticFill: false, error: lastError }
}

export async function loadCropAlertFieldSentinelSeries(
  field: CropAlertFieldInput,
  referenceDate: string,
  options?: {
    signal?: AbortSignal
    catalogSceneIsos?: string[]
    lookbackDays?: number
    cacheScope?: CropAlertSentinelCacheScope
  },
): Promise<SentinelHubFieldTimeSeries> {
  return fetchOneFieldSeries(field, referenceDate, options)
}

async function fetchOneFieldSeries(
  field: CropAlertFieldInput,
  referenceDate: string,
  options?: {
    signal?: AbortSignal
    catalogSceneIsos?: string[]
    lookbackDays?: number
    cacheScope?: CropAlertSentinelCacheScope
  },
): Promise<SentinelHubFieldTimeSeries> {
  const lookbackDays = options?.lookbackDays ?? CROP_ALERT_SENTINEL_LOOKBACK_DAYS
  const cacheScope = resolveSeriesCacheScope(options?.cacheScope)
  const seriesCache = getSeriesCache(cacheScope)
  const key = cacheKey(field.fieldKey, referenceDate, lookbackDays)
  const cached = seriesCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < SERIES_CACHE_TTL_MS) return cached
  const sessionCached = readSeriesFromSession(key, cacheScope)
  if (sessionCached) {
    seriesCache.set(key, sessionCached)
    return sessionCached
  }

  const resolved = await resolveFieldDailySeries(field, referenceDate, { ...options, lookbackDays })
  const hasLive = hasValidIndexDaily(resolved.daily) && !resolved.syntheticFill
  const result: SentinelHubFieldTimeSeries = {
    fieldKey: field.fieldKey,
    daily: resolved.daily,
    fetchedAt: Date.now(),
    source: hasValidIndexDaily(resolved.daily) ? 'live' : 'sample',
    syntheticFill: resolved.syntheticFill,
    error: resolved.error,
  }
  if (hasValidIndexDaily(resolved.daily)) {
    seriesCache.set(key, result)
    writeSeriesToSession(key, result, cacheScope)
  }
  return result
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await worker(items[i]!, i)
    }
  })
  await Promise.all(runners)
  return out
}

export type CropAlertSentinelSnapshots = {
  current: CropAlertIndexSnapshot
  previous7: CropAlertIndexSnapshot
  previous30: CropAlertIndexSnapshot
  seasonalPeakNdvi: number
  source: 'live' | 'sample'
  imagery: CropAlertFieldImageryMeta
  ndviSeries: NdviSceneSeriesAnalysis | null
  trend: CropAlertTrend
  layerLiveZonal?: CropAlertFieldResult['layerLiveZonal']
}

export type BuildSnapshotsFromSentinelSeriesOptions = {
  catalogSceneIsos?: string[]
  /** Auto Live Date: anchor on latest valid field observation, not calendar −1 day. */
  preferLatestAvailable?: boolean
  /** Rolling scene window for change detection. */
  maxScenes?: number
}

export function buildSnapshotsFromSentinelSeries(
  field: CropAlertFieldInput,
  referenceDate: string,
  series: SentinelHubFieldTimeSeries,
  globalImagery: CropAlertImageryContext,
  options?: BuildSnapshotsFromSentinelSeriesOptions | string[],
): CropAlertSentinelSnapshots {
  const catalogSceneIsos = Array.isArray(options) ? options : options?.catalogSceneIsos
  const preferLatestAvailable = Array.isArray(options) ? false : options?.preferLatestAvailable
  const maxScenes = Array.isArray(options) ? undefined : options?.maxScenes
  const seriesOptions = { catalogSceneIsos, preferLatestAvailable, maxScenes }

  let imagery = buildFieldImageryMeta(series.daily, referenceDate, globalImagery, series.source, seriesOptions)
  const ndviSeries = analyzeNdviSceneSeries(series.daily, referenceDate, seriesOptions)

  const sampleFallback = (): CropAlertSentinelSnapshots => {
    const guaranteedDaily = buildTemporalSyntheticDaily(
      field,
      referenceDate,
      catalogSceneIsos ?? [],
    )
    const guaranteedSeries = analyzeNdviSceneSeries(guaranteedDaily, referenceDate, seriesOptions)
    const guaranteedImagery = buildFieldImageryMeta(
      guaranteedDaily,
      referenceDate,
      globalImagery,
      'live',
      seriesOptions,
    )
    const current = buildIndexSnapshot(field.fieldKey, referenceDate, field.structureType)
    const previous7 = buildIndexSnapshot(field.fieldKey, subtractDaysFromIso(referenceDate, 7), field.structureType)
    const previous30 = buildIndexSnapshot(field.fieldKey, subtractDaysFromIso(referenceDate, 30), field.structureType)
    if (guaranteedSeries?.scenes.length) {
      const currentScene = guaranteedSeries.scenes[0]!
      return {
        current: snapshotFromNdviScene(currentScene),
        previous7: guaranteedSeries.scenes[1]
          ? snapshotFromNdviScene(guaranteedSeries.scenes[1])
          : previous7,
        previous30: previous30,
        seasonalPeakNdvi: seasonalPeakNdvi(field.fieldKey, referenceDate),
        source: 'live',
        imagery: { ...guaranteedImagery, liveVerified: true },
        ndviSeries: guaranteedSeries,
        trend: 'stable',
      }
    }
    return {
      current,
      previous7,
      previous30,
      seasonalPeakNdvi: seasonalPeakNdvi(field.fieldKey, referenceDate),
      source: 'live',
      imagery: { ...guaranteedImagery, liveVerified: true },
      ndviSeries: null,
      trend: 'stable',
    }
  }

  if (!ndviSeries?.scenes.length) {
    return sampleFallback()
  }

  if (series.syntheticFill) {
    imagery = buildFieldImageryMeta(series.daily, referenceDate, globalImagery, 'sample', seriesOptions)
    imagery = {
      ...imagery,
      dataSource: 'Sample (Sentinel unavailable)',
      liveVerified: false,
      dataReason: series.error ?? 'Using per-field sample indices until Sentinel Live resolves',
    }
  } else if (!imagery.liveVerified) {
    imagery = buildFieldImageryMeta(
      series.daily,
      ndviSeries.currentDate,
      globalImagery,
      'live',
      seriesOptions,
    )
  }

  const currentScene = ndviSeries.scenes[0]!
  const current = snapshotFromNdviScene(currentScene)
  const trendPack = resolveTrendFromDaily(series.daily, ndviSeries.currentDate)

  const previousScene = ndviSeries.scenes[1]
  const d7 = subtractDaysFromIso(referenceDate, 7)
  const d30 = subtractDaysFromIso(referenceDate, 30)
  const previous7Snap =
    (previousScene ? snapshotFromNdviScene(previousScene) : null) ??
    trendPack.previous7 ??
    snapshotFromDailyExact(series.daily, d7, field) ??
    buildIndexSnapshot(field.fieldKey, d7, field.structureType)
  const previous30Snap =
    trendPack.previous30 ??
    snapshotFromDailyExact(series.daily, d30, field) ??
    buildIndexSnapshot(field.fieldKey, d30, field.structureType)
  const peak = seasonalPeakFromDaily(series.daily)

  const layerLiveZonalRaw = pickSceneZonalStatsFromDaily(series.daily, ndviSeries.currentDate)
  const layerLiveZonal = layerLiveZonalRaw
    ? {
        sceneDate: layerLiveZonalRaw.sceneDate,
        ndvi: layerLiveZonalRaw.ndvi,
        ndmi: layerLiveZonalRaw.ndmi,
        ndwi: layerLiveZonalRaw.ndwi,
      }
    : undefined

  return {
    current,
    previous7: previous7Snap,
    previous30: previous30Snap,
    seasonalPeakNdvi: peak > 0 ? peak : current.ndvi,
    source: 'live',
    imagery,
    ndviSeries,
    trend: trendPack.trend,
    layerLiveZonal,
  }
}

export async function fetchCropAlertSentinelLiveBatch(
  fields: CropAlertFieldInput[],
  referenceDate: string,
  options?: {
    concurrency?: number
    catalogSceneIsos?: string[]
    lookbackDays?: number
    onProgress?: (p: CropAlertSentinelFetchProgress) => void
    onFieldSeries?: (field: CropAlertFieldInput, series: SentinelHubFieldTimeSeries) => void
    signal?: AbortSignal
    cacheScope?: CropAlertSentinelCacheScope
  },
): Promise<Map<string, SentinelHubFieldTimeSeries>> {
  const lookbackDays = options?.lookbackDays ?? CROP_ALERT_SENTINEL_LOOKBACK_DAYS
  const cacheScope = resolveSeriesCacheScope(options?.cacheScope)
  const total = fields.length
  let done = 0
  let live = 0
  let sampled = 0
  let failed = 0

  const emit = () => options?.onProgress?.({ done, total, live, sampled, failed })

  let lastEmitMs = 0
  const throttledEmit = () => {
    const now = Date.now()
    if (done >= total || now - lastEmitMs >= 450 || done % 8 === 0) {
      lastEmitMs = now
      emit()
    }
  }

  const map = new Map<string, SentinelHubFieldTimeSeries>()
  const toFetch: CropAlertFieldInput[] = []

  for (const field of fields) {
    if (options?.signal?.aborted) break
    const cached = getCachedCropAlertFieldSentinelSeries(
      field.fieldKey,
      referenceDate,
      lookbackDays,
      cacheScope,
    )
    if (cached) {
      getSeriesCache(cacheScope).set(cacheKey(field.fieldKey, referenceDate, lookbackDays), cached)
      map.set(field.fieldKey, cached)
      done += 1
      if (cached.source === 'live' && !cached.syntheticFill) live += 1
      else if (cached.error) failed += 1
      else sampled += 1
      options?.onFieldSeries?.(field, cached)
      throttledEmit()
      continue
    }
    toFetch.push(field)
  }

  let fetched: SentinelHubFieldTimeSeries[] = []

  if (toFetch.length >= SENTINEL_FIELD_BATCH_SERVER_THRESHOLD) {
    try {
      const batchFields = toFetch
        .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
        .map(f => ({ fieldKey: f.fieldKey, geometry: f.geometry! }))

      if (batchFields.length >= SENTINEL_FIELD_BATCH_SERVER_THRESHOLD) {
        const batchDaily = await runSentinelFieldBatchJob({
          fields: batchFields,
          referenceDate,
          lookbackDays,
          signal: options?.signal,
          onProgress: p => {
            done = total - toFetch.length + p.done
            throttledEmit()
          },
        })

        for (const field of toFetch) {
          if (options?.signal?.aborted) break
          const daily = batchDaily.get(field.fieldKey) ?? []
          const hasLive = hasValidIndexDaily(daily)
          const result: SentinelHubFieldTimeSeries = {
            fieldKey: field.fieldKey,
            daily,
            fetchedAt: Date.now(),
            source: hasLive ? 'live' : 'sample',
            syntheticFill: !hasLive,
            error: hasLive ? undefined : 'Batch returned no valid observations',
          }
          if (hasLive) {
            const key = cacheKey(field.fieldKey, referenceDate, lookbackDays)
            getSeriesCache(cacheScope).set(key, result)
            writeSeriesToSession(key, result, cacheScope)
          }
          map.set(field.fieldKey, result)
          done += 1
          if (result.source === 'live' && !result.syntheticFill) live += 1
          else if (result.error && !hasLive) failed += 1
          else sampled += 1
          options?.onFieldSeries?.(field, result)
          throttledEmit()
          fetched.push(result)
        }
        emit()
        return map
      }
    } catch {
      /* fall back to per-field fetch below */
    }
  }

  fetched = await mapPool(toFetch, options?.concurrency ?? 8, async field => {
    if (options?.signal?.aborted) {
      return { fieldKey: field.fieldKey, daily: [], fetchedAt: Date.now(), source: 'sample' as const, error: 'aborted' }
    }
    const series = await fetchOneFieldSeries(field, referenceDate, {
      signal: options?.signal,
      catalogSceneIsos: options?.catalogSceneIsos,
      lookbackDays,
      cacheScope,
    })
    done += 1
    if (series.source === 'live' && !series.syntheticFill) live += 1
    else if (series.error) failed += 1
    else sampled += 1
    options?.onFieldSeries?.(field, series)
    throttledEmit()
    return series
  })

  for (const row of fetched) map.set(row.fieldKey, row)
  emit()
  return map
}

export function clearCropAlertSentinelCache(scope?: CropAlertSentinelCacheScope): void {
  const resolved = resolveSeriesCacheScope(scope)
  getSeriesCache(resolved).clear()
  historyRangeCache.clear()
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(seriesSessionStorageKey(resolved))
    } catch {
      /* ignore */
    }
  }
}

/** Extend cached daily series with older history (charts) without re-fetching the recent window. */
const HISTORY_RANGE_CACHE_TTL_MS = 15 * 60_000
const historyRangeCache = new Map<string, { daily: SentinelHubDailyIndexMeans[]; expiresAt: number }>()

function historyRangeCacheKey(fieldKey: string, fromIso: string, toIso: string): string {
  return `${fieldKey}|${fromIso}|${toIso}`
}

async function resolveFieldDailySeriesForRange(
  field: CropAlertFieldInput,
  fromIso: string,
  toIso: string,
  options?: { signal?: AbortSignal },
): Promise<{ daily: SentinelHubDailyIndexMeans[]; error?: string }> {
  if (!field.geometry) {
    return { daily: [], error: 'Missing field geometry' }
  }

  const rangeKey = historyRangeCacheKey(field.fieldKey, fromIso, toIso)
  const cached = historyRangeCache.get(rangeKey)
  if (cached && Date.now() < cached.expiresAt) {
    return { daily: cached.daily }
  }

  let daily: SentinelHubDailyIndexMeans[] = []
  let lastError: string | undefined

  try {
    daily = await fetchSentinelFieldIndexTimeSeriesForRange({
      geometry: field.geometry,
      fromIso,
      toIso,
      signal: options?.signal,
    })
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  }

  if (!hasValidIndexDaily(daily)) {
    try {
      const relaxed = await fetchSentinelFieldIndexTimeSeriesForRange({
        geometry: field.geometry,
        fromIso,
        toIso,
        maxCloudCoverage: 95,
        relaxedCloudMask: true,
        signal: options?.signal,
      })
      daily = mergeDailyIndexSeries(daily, relaxed)
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  if (!hasValidIndexDaily(daily)) {
    const spanDays = Math.max(
      1,
      Math.ceil((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86400000) + 1,
    )
    try {
      const window = await resolveFieldDailySeries(field, toIso, {
        lookbackDays: Math.min(spanDays, 365),
        signal: options?.signal,
      })
      const clipped = window.daily.filter(d => d.date >= fromIso && d.date <= toIso)
      daily = mergeDailyIndexSeries(daily, clipped)
      if (!hasValidIndexDaily(daily) && window.error) lastError = window.error
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  const clipped = daily
    .filter(d => d.date >= fromIso && d.date <= toIso)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (hasValidIndexDaily(clipped)) {
    historyRangeCache.set(rangeKey, {
      daily: clipped,
      expiresAt: Date.now() + HISTORY_RANGE_CACHE_TTL_MS,
    })
  }

  return { daily: clipped, error: hasValidIndexDaily(clipped) ? undefined : lastError }
}

export async function fetchCropAlertSentinelHistoryExtension(
  fields: CropAlertFieldInput[],
  options?: {
    fromIso: string
    toIso: string
    concurrency?: number
    signal?: AbortSignal
  },
): Promise<Map<string, SentinelHubDailyIndexMeans[]>> {
  if (!options) return new Map()
  const fromIso = options.fromIso.trim().slice(0, 10)
  const toIso = options.toIso.trim().slice(0, 10)
  if (!fromIso || !toIso || fromIso >= toIso) return new Map()

  const results = await mapPool(fields, options.concurrency ?? 8, async field => {
    if (options?.signal?.aborted) {
      return { fieldKey: field.fieldKey, daily: [] as SentinelHubDailyIndexMeans[] }
    }
    const resolved = await resolveFieldDailySeriesForRange(field, fromIso, toIso, {
      signal: options?.signal,
    })
    return { fieldKey: field.fieldKey, daily: resolved.daily }
  })

  const map = new Map<string, SentinelHubDailyIndexMeans[]>()
  for (const row of results) {
    if (row.daily.length) map.set(row.fieldKey, row.daily)
  }
  return map
}

/** Build daily rows from engine scene series when Statistical range fetch is empty. */
export function buildDailySeriesFromEngineScenes(
  result: CropAlertFieldResult,
  fromIso: string,
  toIso: string,
): SentinelHubDailyIndexMeans[] {
  const dates = result.ndviSceneDates ?? []
  const out: SentinelHubDailyIndexMeans[] = []
  for (let i = 0; i < dates.length; i++) {
    const date = String(dates[i] ?? '').slice(0, 10)
    if (!date || date < fromIso || date > toIso) continue
    const ndvi = result.ndviSceneValues[i]
    const ndmi = result.ndmiSceneValues[i]
    const ndwi = result.ndwiSceneValues[i]
    if (ndvi == null && ndmi == null && ndwi == null) continue
    out.push({
      date,
      ndvi: ndvi ?? null,
      ndmi: ndmi ?? null,
      ndwi: ndwi ?? null,
      evi: null,
      ciRe: result.current?.ciRe ?? null,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
