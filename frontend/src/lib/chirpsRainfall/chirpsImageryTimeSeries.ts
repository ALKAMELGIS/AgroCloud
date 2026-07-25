/**
 * Bridge UCSB CHIRPS rainfall into Imagery Time Series charts (ACP / SI).
 * PRECIP is not a Sentinel Hub statistic — values come from /api/chirps/timeseries.
 */
import { CHIRPS_PRECIP_LAYER_ID, isChirpsPrecipLayerId } from '../agroCompositeIndices'
import { fetchChirpsTimeseries } from './chirpsClient'
import type { ChirpsSeriesPoint } from './chirpsIndices'
import type { ImageryTimeSeriesLayerSeries } from '../../pages/dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { pruneImageryTimeSeriesToObservations } from '../../pages/dashboards/agroCloudPlatform/acpImageryTimeSeries'

export function partitionImageryTimeSeriesLayerIds(layerIds: string[]): {
  precipLayerIds: string[]
  opticalLayerIds: string[]
} {
  const precip: string[] = []
  const optical: string[] = []
  for (const raw of layerIds) {
    const id = raw.trim().toUpperCase()
    if (!id) continue
    if (isChirpsPrecipLayerId(id)) precip.push(CHIRPS_PRECIP_LAYER_ID)
    else optical.push(id)
  }
  return {
    precipLayerIds: [...new Set(precip)],
    opticalLayerIds: [...new Set(optical)],
  }
}

export function chirpsPointsToDateValueMap(points: ChirpsSeriesPoint[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of points) {
    const date = String(p.date || '').trim().slice(0, 10)
    if (!date) continue
    const v = p.rainfallMm
    if (v == null || !Number.isFinite(v)) continue
    map.set(date, Number(v))
  }
  return map
}

/** Build a PRECIP series aligned to an arbitrary date axis (NaN when missing). */
export function alignChirpsToLabels(
  labels: string[],
  points: ChirpsSeriesPoint[],
  layerId: string = CHIRPS_PRECIP_LAYER_ID,
): ImageryTimeSeriesLayerSeries {
  const byDate = chirpsPointsToDateValueMap(points)
  return {
    layerId,
    values: labels.map(date => {
      const v = byDate.get(date.slice(0, 10))
      return v != null && Number.isFinite(v) ? v : NaN
    }),
  }
}

export function chirpsPointsToChartSeries(
  points: ChirpsSeriesPoint[],
  layerId: string = CHIRPS_PRECIP_LAYER_ID,
): { labels: string[]; series: ImageryTimeSeriesLayerSeries[] } {
  const byDate = chirpsPointsToDateValueMap(points)
  const labels = [...byDate.keys()].sort()
  return {
    labels,
    series: [
      {
        layerId,
        values: labels.map(date => byDate.get(date)!),
      },
    ],
  }
}

/**
 * Merge optical (Sentinel Hub) chart series with CHIRPS rainfall on a shared date axis.
 * Preserves `layerIds` order. Precip layer ids normalize to PRECIP.
 */
export function mergeOpticalAndChirpsChart(options: {
  layerIds: string[]
  opticalLabels: string[]
  opticalSeries: ImageryTimeSeriesLayerSeries[]
  chirpsPoints: ChirpsSeriesPoint[] | null
}): { labels: string[]; series: ImageryTimeSeriesLayerSeries[] } {
  const { precipLayerIds, opticalLayerIds } = partitionImageryTimeSeriesLayerIds(options.layerIds)
  const chirps = options.chirpsPoints?.length ? options.chirpsPoints : null

  if (!precipLayerIds.length) {
    return { labels: options.opticalLabels, series: options.opticalSeries }
  }
  if (!opticalLayerIds.length || !options.opticalLabels.length) {
    if (!chirps) return { labels: [], series: [] }
    const precipId = precipLayerIds[0]!
    return chirpsPointsToChartSeries(chirps, precipId)
  }

  const precipMap = chirps ? chirpsPointsToDateValueMap(chirps) : new Map<string, number>()
  const dateSet = new Set(options.opticalLabels.map(d => d.slice(0, 10)))
  for (const date of precipMap.keys()) dateSet.add(date)
  const labels = [...dateSet].sort()

  const opticalById = new Map(
    options.opticalSeries.map(s => {
      const byDate = new Map(
        options.opticalLabels.map((date, i) => [date.slice(0, 10), s.values[i]]),
      )
      return [s.layerId.trim().toUpperCase(), byDate] as const
    }),
  )

  const orderedIds: string[] = []
  for (const raw of options.layerIds) {
    const id = raw.trim().toUpperCase()
    if (!id) continue
    const normalized = isChirpsPrecipLayerId(id) ? CHIRPS_PRECIP_LAYER_ID : id
    if (!orderedIds.includes(normalized)) orderedIds.push(normalized)
  }

  const series: ImageryTimeSeriesLayerSeries[] = orderedIds.map(layerId => {
    if (isChirpsPrecipLayerId(layerId)) {
      return {
        layerId: CHIRPS_PRECIP_LAYER_ID,
        values: labels.map(date => {
          const v = precipMap.get(date)
          return v != null && Number.isFinite(v) ? v : NaN
        }),
      }
    }
    const byDate = opticalById.get(layerId)
    return {
      layerId,
      values: labels.map(date => {
        const v = byDate?.get(date)
        return v != null && Number.isFinite(v as number) ? (v as number) : NaN
      }),
    }
  })

  return pruneImageryTimeSeriesToObservations(labels, series)
}

export async function fetchChirpsPrecipForImageryChart(input: {
  geometry: GeoJSON.Geometry
  start: string
  end: string
  signal?: AbortSignal
}): Promise<ChirpsSeriesPoint[]> {
  const res = await fetchChirpsTimeseries({
    geometry: input.geometry,
    start: input.start,
    end: input.end,
    aggregation: 'daily',
    signal: input.signal,
  })
  return res.points ?? []
}
