/**
 * LULC yearly atlas (from 2021, five years) + index change-detection map pairs
 * for the Word Intelligence Report.
 */
import {
  LULC_CLASSIFICATION_LAYER_ID,
  isLulcClassificationLayerId,
} from '../../../../lib/siLulcClassification'
import { resolveLayerLiveLegendSpec } from '../../../../lib/layerLiveLegendCatalog'
import { fetchLulcClassAreas } from '../../../../lib/siLulcClassAreaLive'
import {
  compositeAoiMapSnapshotBase64,
  dataUrlToPngBase64,
  fetchIndexLayerMapSnapshotBase64,
  fetchSatelliteBasemapSnapshot,
  resolveTimeSeriesSnapshotExtent,
  resolveTimeSeriesSnapshotLayout,
} from './timeSeriesMapSnapshot'
import type {
  LulcChangePairComposition,
  LulcYearClassStat,
  LulcYearComposition,
  TimeSeriesMapSnapshot,
  TimeSeriesMapSnapshotGroup,
} from './timeSeriesReportTypes'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

const SNAPSHOT_WIDTH = 640
const SNAPSHOT_HEIGHT = 520
const CONCURRENCY = 2
const LULC_DATA_SOURCE = 'Sentinel-2 L2A · AgroCloud LULC (IO schema) · yearly mid-season'
const CHANGE_DATA_SOURCE = 'Sentinel-2 L2A (Sentinel Hub WMS) · index change detection'

function formatLegendText(layerId: string): string {
  const spec = resolveLayerLiveLegendSpec(layerId)
  if (!spec) return layerId
  if (spec.classes?.length) {
    return spec.classes
      .slice(0, 10)
      .map(c => `${c.label}${c.rangeLabel ? ` (${c.rangeLabel})` : ''}`)
      .join(' · ')
  }
  if (spec.gradientCss && spec.valueMin != null && spec.valueMax != null) {
    return `${spec.title}: ${spec.valueMin} → ${spec.valueMax}`
  }
  return spec.subtitle || spec.title || layerId
}

/** Five calendar years starting 2021 (2021–2025). */
export function lulcReportYears(fromYear = 2021, count = 5): number[] {
  return Array.from({ length: count }, (_, i) => fromYear + i)
}

/** Mid-season scene date for yearly LULC composites. */
export function lulcYearSceneDate(year: number): string {
  return `${year}-07-15`
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (next < items.length) {
      const i = next
      next += 1
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}

async function fetchCompositedSnapshot(options: {
  geometry: GeoJSON.Geometry
  layerId: string
  sceneDate: string
  basemapDataUrl: string | null
  extent: ReturnType<typeof resolveTimeSeriesSnapshotExtent>
  signal?: AbortSignal
}): Promise<string | null> {
  let indexBase64: string | null = null
  try {
    indexBase64 = await fetchIndexLayerMapSnapshotBase64({
      geometry: options.geometry,
      layerId: options.layerId,
      sceneDate: options.sceneDate,
      widthPx: SNAPSHOT_WIDTH,
      heightPx: SNAPSHOT_HEIGHT,
      extent: options.extent,
      signal: options.signal,
    })
  } catch {
    indexBase64 = null
  }
  try {
    return await compositeAoiMapSnapshotBase64({
      geometry: options.geometry,
      basemapDataUrl: options.basemapDataUrl,
      indexBase64,
      layerId: options.layerId,
      widthPx: SNAPSHOT_WIDTH,
      heightPx: SNAPSHOT_HEIGHT,
      extent: options.extent,
    })
  } catch {
    return indexBase64 ?? dataUrlToPngBase64(options.basemapDataUrl)
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

async function fetchYearComposition(
  geometry: GeoJSON.Geometry,
  year: number,
  aoiAreaHa: number,
  signal?: AbortSignal,
): Promise<LulcYearComposition> {
  const sceneDate = lulcYearSceneDate(year)
  try {
    const result = await fetchLulcClassAreas({ geometry, sceneDate, signal })
    const rows = (result?.rows ?? [])
      .filter(r => (r.count ?? 0) > 0 && Number.isFinite(r.areaHa) && r.areaHa > 0)
      .map(
        (r): LulcYearClassStat => ({
          key: r.key,
          name: r.name,
          color: r.color,
          pct: round1(r.pctOfAoi ?? 0),
          areaHa: round2(r.areaHa ?? 0),
        }),
      )
      .sort((a, b) => b.areaHa - a.areaHa)
    const totalFromClasses = rows.reduce((s, r) => s + r.areaHa, 0)
    return {
      year,
      sceneDate,
      totalAreaHa: round2(totalFromClasses > 0 ? totalFromClasses : aoiAreaHa),
      classes: rows,
    }
  } catch {
    return { year, sceneDate, totalAreaHa: round2(aoiAreaHa), classes: [] }
  }
}

function buildChangeCompositions(years: LulcYearComposition[]): LulcChangePairComposition[] {
  const out: LulcChangePairComposition[] = []
  for (let i = 0; i < years.length - 1; i += 1) {
    const a = years[i]!
    const b = years[i + 1]!
    const keys = new Set([...a.classes.map(c => c.key), ...b.classes.map(c => c.key)])
    const byKeyA = new Map(a.classes.map(c => [c.key, c]))
    const byKeyB = new Map(b.classes.map(c => [c.key, c]))
    const classes = [...keys]
      .map(key => {
        const ca = byKeyA.get(key)
        const cb = byKeyB.get(key)
        const name = cb?.name ?? ca?.name ?? key
        const color = cb?.color ?? ca?.color ?? '#94a3b8'
        const areaHaFrom = ca?.areaHa ?? 0
        const areaHaTo = cb?.areaHa ?? 0
        const pctFrom = ca?.pct ?? 0
        const pctTo = cb?.pct ?? 0
        return {
          key,
          name,
          color,
          areaHaFrom,
          areaHaTo,
          pctFrom,
          pctTo,
          deltaHa: round2(areaHaTo - areaHaFrom),
          deltaPctPoints: round1(pctTo - pctFrom),
        }
      })
      .filter(c => c.areaHaFrom > 0 || c.areaHaTo > 0)
      .sort((p, q) => Math.abs(q.deltaHa) - Math.abs(p.deltaHa))
    out.push({ yearFrom: a.year, yearTo: b.year, classes })
  }
  return out
}

export type LulcFiveYearBuildResult = {
  groups: TimeSeriesMapSnapshotGroup[]
  yearCompositions: LulcYearComposition[]
  changeCompositions: LulcChangePairComposition[]
}

/**
 * Yearly LULC maps 2021–2025, consecutive-year change pairs (reusing yearly snaps),
 * plus class area compositions for native pie/bar charts and tables.
 */
export async function buildLulcFiveYearMapGroups(input: {
  geometry: GeoJSON.Geometry
  areaHa: number
  mapboxToken?: string
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}): Promise<LulcFiveYearBuildResult> {
  const years = lulcReportYears(2021, 5)
  const layout = resolveTimeSeriesSnapshotLayout(SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT)
  const extent = resolveTimeSeriesSnapshotExtent(input.geometry, layout.mapW, layout.mapH)
  const basemapDataUrl = await fetchSatelliteBasemapSnapshot(
    input.geometry,
    input.mapboxToken,
    SNAPSHOT_WIDTH,
    SNAPSHOT_HEIGHT,
    input.signal,
  )

  const total = years.length * 2
  let completed = 0
  const bump = () => {
    completed += 1
    input.onProgress?.(completed, Math.max(total, 1))
  }

  const yearly = await mapPool(years, CONCURRENCY, async year => {
    if (input.signal?.aborted) {
      bump()
      bump()
      return { snap: null as TimeSeriesMapSnapshot | null, composition: null as LulcYearComposition | null }
    }
    const sceneDate = lulcYearSceneDate(year)
    const [imageBase64, composition] = await Promise.all([
      fetchCompositedSnapshot({
        geometry: input.geometry,
        layerId: LULC_CLASSIFICATION_LAYER_ID,
        sceneDate,
        basemapDataUrl,
        extent,
        signal: input.signal,
      }).finally(bump),
      fetchYearComposition(input.geometry, year, input.areaHa, input.signal).finally(bump),
    ])
    const snap: TimeSeriesMapSnapshot = {
      layerId: LULC_CLASSIFICATION_LAYER_ID,
      layerLabel: `LULC ${year}`,
      sceneDate,
      periodLabel: String(year),
      imageBase64,
      dataSource: LULC_DATA_SOURCE,
      mean: null,
      min: null,
      max: null,
      areaHa: composition.totalAreaHa || input.areaHa,
      legendText: formatLegendText(LULC_CLASSIFICATION_LAYER_ID),
      notes: `Land use / land cover classification for mid-season ${year} (${sceneDate}). Class areas and share (%) are tabulated below the map.`,
    }
    return { snap, composition }
  })

  const yearlySnaps = yearly
    .map(y => y.snap)
    .filter((s): s is TimeSeriesMapSnapshot => s != null && !!s.imageBase64)
  const yearCompositions = yearly
    .map(y => y.composition)
    .filter((c): c is LulcYearComposition => c != null && c.classes.length > 0)
  const allYearComps = yearly
    .map(y => y.composition)
    .filter((c): c is LulcYearComposition => c != null)
  const changeCompositions = buildChangeCompositions(allYearComps)

  const groups: TimeSeriesMapSnapshotGroup[] = [
    {
      layerId: 'LULC_YEARLY',
      title: 'LULC — Five-Year Atlas (2021–2025)',
      snapshots: yearlySnaps,
    },
  ]

  for (let i = 0; i < years.length - 1; i += 1) {
    const y0 = years[i]!
    const y1 = years[i + 1]!
    const snap0 = yearly.find(y => y.composition?.year === y0)?.snap
    const snap1 = yearly.find(y => y.composition?.year === y1)?.snap
    if (!snap0?.imageBase64 || !snap1?.imageBase64) continue
    groups.push({
      layerId: `LULC_CHANGE_${y0}_${y1}`,
      title: `LULC Change Detection — ${y0} → ${y1}`,
      snapshots: [
        {
          ...snap0,
          periodLabel: `${y0} (before)`,
          notes: `Change detection pair ${y0} → ${y1}: before (mid-season ${y0}).`,
        },
        {
          ...snap1,
          periodLabel: `${y1} (after)`,
          notes: `Change detection pair ${y0} → ${y1}: after (mid-season ${y1}). Compare class areas in the change table.`,
        },
      ],
    })
  }

  return {
    groups: groups.filter(g => g.snapshots.length > 0),
    yearCompositions,
    changeCompositions,
  }
}

/**
 * For each selected non-LULC index: first vs last acquisition maps labeled as change detection.
 */
export async function buildIndexChangeDetectionMapGroups(input: {
  geometry: GeoJSON.Geometry
  layerIds: string[]
  chartLabels: string[]
  displayLabels: string[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
  periodAnchorDates: Record<string, string>
  areaHa: number
  mapboxToken?: string
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}): Promise<TimeSeriesMapSnapshotGroup[]> {
  const layout = resolveTimeSeriesSnapshotLayout(SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT)
  const extent = resolveTimeSeriesSnapshotExtent(input.geometry, layout.mapW, layout.mapH)
  const basemapDataUrl = await fetchSatelliteBasemapSnapshot(
    input.geometry,
    input.mapboxToken,
    SNAPSHOT_WIDTH,
    SNAPSHOT_HEIGHT,
    input.signal,
  )

  const layers = input.layerIds.filter(id => !isLulcClassificationLayerId(id))
  const groups: TimeSeriesMapSnapshotGroup[] = []
  let completed = 0
  const total = layers.length * 2

  for (const layerId of layers) {
    if (input.signal?.aborted) break
    const series = input.layerSeries.find(s => s.layerId.toUpperCase() === layerId.toUpperCase())
    if (!series) continue

    const valid: Array<{ i: number; date: string; label: string; mean: number }> = []
    for (let i = 0; i < input.chartLabels.length; i += 1) {
      const v = series.values[i]
      if (v == null || !Number.isFinite(v)) continue
      const periodKey = input.chartLabels[i]!
      const sceneDate = (input.periodAnchorDates[periodKey] ?? periodKey).trim().slice(0, 10)
      valid.push({
        i,
        date: sceneDate,
        label: input.displayLabels[i] ?? periodKey,
        mean: v,
      })
    }
    if (valid.length < 2) continue

    const first = valid[0]!
    const last = valid[valid.length - 1]!
    const delta = last.mean - first.mean
    const pair = [first, last]

    const snapshots = await mapPool(pair, CONCURRENCY, async (entry, idx) => {
      const imageBase64 = await fetchCompositedSnapshot({
        geometry: input.geometry,
        layerId,
        sceneDate: entry.date,
        basemapDataUrl,
        extent,
        signal: input.signal,
      })
      completed += 1
      input.onProgress?.(completed, Math.max(total, 1))
      return {
        layerId: layerId.toUpperCase(),
        layerLabel: `${layerId.toUpperCase()} ${idx === 0 ? 'start' : 'end'}`,
        sceneDate: entry.date,
        periodLabel: `${entry.label} (${idx === 0 ? 'T0' : 'T1'})`,
        imageBase64,
        dataSource: CHANGE_DATA_SOURCE,
        mean: entry.mean,
        min: entry.mean,
        max: entry.mean,
        areaHa: input.areaHa,
        legendText: formatLegendText(layerId),
        notes: `Index change detection ${first.date} → ${last.date}: Δ${layerId.toUpperCase()} = ${delta >= 0 ? '+' : ''}${delta.toFixed(4)}.`,
      } satisfies TimeSeriesMapSnapshot
    })

    groups.push({
      layerId: `CHANGE_${layerId.toUpperCase()}`,
      title: `Change Detection — ${layerId.toUpperCase()} (${first.date} → ${last.date})`,
      snapshots: snapshots.filter(s => !!s.imageBase64),
    })
  }

  return groups.filter(g => g.snapshots.length > 0)
}
