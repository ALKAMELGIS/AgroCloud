import jsPDF from 'jspdf'
import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { resolveLayerLiveLegendSpec, type LayerLiveLegendSpec } from '../../../../lib/layerLiveLegendCatalog'
import { geodesicAreaM2 } from '../../../../lib/siLayerClassAreaEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  compositeAoiMapSnapshotBase64,
  fetchIndexLayerMapSnapshotBase64,
  fetchSatelliteBasemapSnapshot,
  resolveTimeSeriesSnapshotExtent,
  resolveTimeSeriesSnapshotLayout,
} from './timeSeriesMapSnapshot'

export type DynamicMapSnapshotStats = {
  mean: number | null
  min: number | null
  max: number | null
}

export type DynamicMapSnapshotCard = {
  layerId: string
  layerLabel: string
  sceneDate: string
  fieldName: string
  areaHa: number
  dataSource: string
  imageDataUrl: string | null
  basemapFallback: boolean
  stats: DynamicMapSnapshotStats
  legend: LayerLiveLegendSpec | null
  notes: string
  status: 'ok' | 'empty' | 'error'
  error?: string
}

const DATA_SOURCE = 'Sentinel-2 L2A · Sentinel Hub WMS'
const SNAPSHOT_WIDTH = 520
const SNAPSHOT_HEIGHT = 400

function fmtNum(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

function zonalKeyForLayer(layerId: string): 'ndvi' | 'ndmi' | 'ndwi' | 'savi' | 'evi' | null {
  const u = layerId.trim().toUpperCase()
  if (u === 'NDVI') return 'ndvi'
  if (u === 'NDMI') return 'ndmi'
  if (u === 'NDWI') return 'ndwi'
  if (u === 'SAVI') return 'savi'
  if (u === 'EVI') return 'evi'
  return null
}

/** Acquisition dates that have a finite mean for this layer. */
export function collectLayerSnapshotDates(
  layerId: string,
  dailyRows: SentinelHubDailyIndexMeans[],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const row of dailyRows) {
    const d = row.date?.slice(0, 10)
    if (!d || seen.has(d)) continue
    if (evaluateImageryLayerDailyValue(layerId, row) == null) continue
    seen.add(d)
    out.push(d)
  }
  return out.sort()
}

/**
 * Prefer the requested date, then nearest dates that actually have layer statistics
 * (so WMS retries when End Date has stats but no cloud-free scene).
 */
export function pickSnapshotSceneDateCandidates(
  preferred: string,
  availableDates: string[],
): string[] {
  const pref = preferred.trim().slice(0, 10)
  const uniq = new Set<string>()
  const out: string[] = []
  const add = (d: string | undefined) => {
    const day = d?.trim().slice(0, 10)
    if (!day || uniq.has(day)) return
    uniq.add(day)
    out.push(day)
  }
  add(pref)
  if (!availableDates.length) return out

  const prefTs = Date.parse(pref)
  let best = availableDates[availableDates.length - 1]!
  let bestAbs = Number.POSITIVE_INFINITY
  for (const d of availableDates) {
    const abs = Math.abs(Date.parse(d) - (Number.isFinite(prefTs) ? prefTs : Date.parse(d)))
    if (abs < bestAbs) {
      bestAbs = abs
      best = d
    }
  }
  add(best)
  const idx = availableDates.indexOf(best)
  if (idx > 0) add(availableDates[idx - 1])
  if (idx >= 0 && idx < availableDates.length - 1) add(availableDates[idx + 1])
  if (idx > 1) add(availableDates[idx - 2])
  if (idx >= 0 && idx < availableDates.length - 2) add(availableDates[idx + 2])
  add(availableDates[0])
  add(availableDates[availableDates.length - 1])
  return out.slice(0, 8)
}

/** Last-resort canvas when composite / WMS / basemap all fail — still shows AOI frame. */
async function composeMinimalSnapshotBase64(options: {
  geometry: GeoJSON.Geometry
  layerId: string
  sceneDate: string
  widthPx: number
  heightPx: number
  basemapDataUrl?: string | null
}): Promise<string | null> {
  try {
    return await compositeAoiMapSnapshotBase64({
      geometry: options.geometry,
      basemapDataUrl: options.basemapDataUrl ?? null,
      indexBase64: null,
      layerId: options.layerId,
      title: options.layerId.toUpperCase(),
      sceneDate: options.sceneDate,
      widthPx: options.widthPx,
      heightPx: options.heightPx,
    })
  } catch {
    return null
  }
}

export function resolveDynamicSnapshotStats(
  layerId: string,
  sceneDate: string,
  dailyRows: SentinelHubDailyIndexMeans[],
  seriesMean?: number | null,
): DynamicMapSnapshotStats {
  const row = dailyRows.find(d => d.date?.slice(0, 10) === sceneDate.slice(0, 10))
  const zKey = zonalKeyForLayer(layerId)
  const zonal = zKey && row?.zonal?.[zKey]
  if (zonal) {
    return {
      mean: zonal.mean ?? seriesMean ?? null,
      min: zonal.min ?? null,
      max: zonal.max ?? null,
    }
  }
  const mean = (row ? evaluateImageryLayerDailyValue(layerId, row) : null) ?? seriesMean ?? null
  return { mean, min: mean, max: mean }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
      while (next < items.length) {
        const i = next
        next += 1
        results[i] = await fn(items[i]!)
      }
    }),
  )
  return results
}

export type BuildDynamicMapSnapshotsInput = {
  geometry: GeoJSON.Geometry | null
  layerIds: string[]
  sceneDate: string
  fieldName: string
  dailyRows: SentinelHubDailyIndexMeans[]
  /** Optional chart means keyed by layer id (uppercase). */
  seriesMeans?: Record<string, number | null>
  mapboxToken?: string
  signal?: AbortSignal
  widthPx?: number
  heightPx?: number
}

/**
 * Build independent AOI map previews for each selected time-series layer
 * without touching the live map camera or WMS state.
 */
export async function buildDynamicMapSnapshots(
  input: BuildDynamicMapSnapshotsInput,
): Promise<DynamicMapSnapshotCard[]> {
  const sceneDate = input.sceneDate.trim().slice(0, 10)
  const layerIds = input.layerIds.map(id => id.trim()).filter(Boolean)
  if (!layerIds.length || !sceneDate) return []

  const geometry = input.geometry
  const areaHa = geometry ? geodesicAreaM2(geometry) / 10_000 : 0
  const width = input.widthPx ?? SNAPSHOT_WIDTH
  const height = input.heightPx ?? SNAPSHOT_HEIGHT
  const layout = resolveTimeSeriesSnapshotLayout(width, height)
  const extent = geometry
    ? resolveTimeSeriesSnapshotExtent(geometry, layout.mapW, layout.mapH)
    : null

  // Esri World Imagery first (no Mapbox token required), then Mapbox if available.
  // Fetch at map-frame size so the basemap matches the composed card without stretch.
  let basemapDataUrl: string | null = null
  if (geometry) {
    basemapDataUrl = await fetchSatelliteBasemapSnapshot(
      geometry,
      input.mapboxToken,
      layout.mapW,
      layout.mapH,
      input.signal,
    )
  }

  return mapPool(layerIds, 3, async layerId => {
    const layerLabel = layerId.toUpperCase()
    const emptyCard = (
      partial: Partial<DynamicMapSnapshotCard> & Pick<DynamicMapSnapshotCard, 'status'>,
    ): DynamicMapSnapshotCard => ({
      layerId: layerLabel,
      layerLabel,
      sceneDate,
      fieldName: input.fieldName,
      areaHa,
      dataSource: DATA_SOURCE,
      imageDataUrl: null,
      basemapFallback: false,
      stats: { mean: null, min: null, max: null },
      legend: resolveLayerLiveLegendSpec(layerId),
      notes: '',
      ...partial,
    })

    if (input.signal?.aborted) {
      return emptyCard({ notes: 'Cancelled', status: 'empty' })
    }

    const stats = resolveDynamicSnapshotStats(
      layerId,
      sceneDate,
      input.dailyRows,
      input.seriesMeans?.[layerLabel] ?? null,
    )
    const legend = resolveLayerLiveLegendSpec(layerId)
    const notes = legend?.note ?? legend?.subtitle ?? `${layerLabel} AOI symbology for ${sceneDate}`

    if (!geometry) {
      return emptyCard({
        stats,
        legend,
        notes: 'Draw or select an AOI to generate map snapshots.',
        status: 'empty',
      })
    }

    try {
      const availableDates = collectLayerSnapshotDates(layerId, input.dailyRows)
      const dateCandidates = pickSnapshotSceneDateCandidates(sceneDate, availableDates)

      let usedDate = sceneDate
      let indexBase64: string | null = null
      for (const candidate of dateCandidates) {
        if (input.signal?.aborted) break
        try {
          indexBase64 = await fetchIndexLayerMapSnapshotBase64({
            geometry,
            layerId,
            sceneDate: candidate,
            widthPx: width,
            heightPx: height,
            extent,
            signal: input.signal,
          })
        } catch {
          indexBase64 = null
        }
        if (indexBase64) {
          usedDate = candidate
          break
        }
      }

      const stats = resolveDynamicSnapshotStats(
        layerId,
        usedDate,
        input.dailyRows,
        input.seriesMeans?.[layerLabel] ?? null,
      )
      const dateNote =
        usedDate !== sceneDate
          ? `Nearest scene with imagery: ${usedDate} (requested ${sceneDate}).`
          : notes

      let composedBase64: string | null = null
      try {
        composedBase64 = await compositeAoiMapSnapshotBase64({
          geometry,
          basemapDataUrl,
          indexBase64,
          layerId,
          legendSpec: legend,
          title: layerLabel,
          sceneDate: usedDate,
          widthPx: width,
          heightPx: height,
          extent,
        })
      } catch {
        composedBase64 = null
      }

      if (!composedBase64) {
        composedBase64 =
          (await composeMinimalSnapshotBase64({
            geometry,
            layerId: layerLabel,
            sceneDate: usedDate,
            widthPx: width,
            heightPx: height,
            basemapDataUrl,
          })) ?? indexBase64
      }

      let imageDataUrl: string | null = composedBase64
        ? `data:image/png;base64,${composedBase64}`
        : indexBase64
          ? `data:image/png;base64,${indexBase64}`
          : basemapDataUrl
      let basemapFallback = !indexBase64 && !!imageDataUrl

      // Absolute last resort: still paint AOI card so the preview is never blank when AOI exists.
      if (!imageDataUrl) {
        const bare = await composeMinimalSnapshotBase64({
          geometry,
          layerId: layerLabel,
          sceneDate: usedDate,
          widthPx: width,
          heightPx: height,
          basemapDataUrl: null,
        })
        if (bare) {
          imageDataUrl = `data:image/png;base64,${bare}`
          basemapFallback = true
        }
      }

      return {
        layerId: layerLabel,
        layerLabel,
        sceneDate: usedDate,
        fieldName: input.fieldName,
        areaHa,
        dataSource: DATA_SOURCE,
        imageDataUrl,
        basemapFallback,
        stats,
        legend,
        notes: basemapFallback
          ? `${dateNote} · Index WMS unavailable; showing satellite / AOI preview.`
          : dateNote,
        status: imageDataUrl ? ('ok' as const) : ('empty' as const),
        error: imageDataUrl ? undefined : 'No imagery returned for this date.',
      }
    } catch (e) {
      if (input.signal?.aborted) {
        return emptyCard({
          stats,
          legend,
          imageDataUrl: basemapDataUrl,
          basemapFallback: !!basemapDataUrl,
          notes: 'Cancelled',
          status: basemapDataUrl ? 'ok' : 'empty',
        })
      }
      let fallbackUrl = basemapDataUrl
      if (!fallbackUrl && geometry) {
        const bare = await composeMinimalSnapshotBase64({
          geometry,
          layerId: layerLabel,
          sceneDate,
          widthPx: width,
          heightPx: height,
          basemapDataUrl: null,
        })
        if (bare) fallbackUrl = `data:image/png;base64,${bare}`
      }
      return {
        layerId: layerLabel,
        layerLabel,
        sceneDate,
        fieldName: input.fieldName,
        areaHa,
        dataSource: DATA_SOURCE,
        imageDataUrl: fallbackUrl,
        basemapFallback: !!fallbackUrl,
        stats,
        legend,
        notes,
        status: (fallbackUrl ? 'ok' : 'error') as 'ok' | 'error',
        error: e instanceof Error ? e.message : 'Snapshot failed',
      }
    }
  })
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

/** Composite preview card → PNG data URL (map + metadata chrome). */
export async function composeDynamicSnapshotPng(card: DynamicMapSnapshotCard): Promise<string | null> {
  const W = 720
  const H = 560
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(8, 8, W - 16, H - 16)

  ctx.fillStyle = '#064e3b'
  ctx.fillRect(8, 8, W - 16, 56)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px Inter, system-ui, sans-serif'
  ctx.fillText(`${card.layerLabel} Map Snapshot`, 24, 36)
  ctx.font = '12px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#d1fae5'
  ctx.fillText(`${card.fieldName} · ${card.sceneDate} · ${fmtHa(card.areaHa)}`, 24, 54)

  const mapX = 24
  const mapY = 80
  const mapW = 480
  const mapH = 320
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(mapX, mapY, mapW, mapH)

  if (card.imageDataUrl) {
    await new Promise<void>(resolve => {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, mapX, mapY, mapW, mapH)
        resolve()
      }
      img.onerror = () => resolve()
      img.src = card.imageDataUrl!
    })
  } else {
    ctx.fillStyle = '#64748b'
    ctx.font = '14px Inter, system-ui, sans-serif'
    ctx.fillText('No map image', mapX + 16, mapY + mapH / 2)
  }

  const sideX = mapX + mapW + 16
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 13px Inter, system-ui, sans-serif'
  ctx.fillText('Statistics', sideX, mapY + 16)
  ctx.font = '12px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#334155'
  const statsLines = [
    `Mean  ${fmtNum(card.stats.mean)}`,
    `Min   ${fmtNum(card.stats.min)}`,
    `Max   ${fmtNum(card.stats.max)}`,
    `AOI   ${fmtHa(card.areaHa)}`,
  ]
  statsLines.forEach((line, i) => ctx.fillText(line, sideX, mapY + 40 + i * 18))

  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 13px Inter, system-ui, sans-serif'
  ctx.fillText('Legend', sideX, mapY + 130)
  const classes = card.legend?.classes?.slice(0, 6) ?? []
  if (classes.length) {
    classes.forEach((c, i) => {
      const y = mapY + 150 + i * 22
      ctx.fillStyle = c.color || '#94a3b8'
      ctx.fillRect(sideX, y - 10, 14, 14)
      ctx.fillStyle = '#334155'
      ctx.font = '11px Inter, system-ui, sans-serif'
      const label = c.rangeLabel ? `${c.label} (${c.rangeLabel})` : c.label
      ctx.fillText(label.slice(0, 28), sideX + 20, y)
    })
  } else if (card.legend?.gradientCss) {
    ctx.fillStyle = '#64748b'
    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.fillText(card.legend.subtitle || card.legend.title, sideX, mapY + 150)
    ctx.fillText(
      `${fmtNum(card.legend.valueMin, 2)} → ${fmtNum(card.legend.valueMax, 2)}`,
      sideX,
      mapY + 168,
    )
  } else {
    ctx.fillStyle = '#64748b'
    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.fillText(card.legend?.title || card.layerLabel, sideX, mapY + 150)
  }

  ctx.fillStyle = '#64748b'
  ctx.font = '10px Inter, system-ui, sans-serif'
  const footerY = mapY + mapH + 24
  ctx.fillText(card.dataSource, 24, footerY)
  if (card.basemapFallback) ctx.fillText('Basemap fallback', 24, footerY + 14)
  const note = (card.error || card.notes || '').slice(0, 110)
  if (note) {
    ctx.fillStyle = '#475569'
    ctx.fillText(note, 24, footerY + (card.basemapFallback ? 28 : 14))
  }

  return canvas.toDataURL('image/png')
}

export async function exportDynamicSnapshotPng(card: DynamicMapSnapshotCard): Promise<void> {
  const dataUrl = await composeDynamicSnapshotPng(card)
  if (!dataUrl) return
  downloadDataUrl(dataUrl, `${card.layerLabel}_${card.sceneDate}_snapshot.png`)
}

export async function exportDynamicSnapshotsPdf(
  cards: DynamicMapSnapshotCard[],
  options?: { fieldName?: string; sceneDate?: string },
): Promise<void> {
  if (!cards.length) return
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()

  for (let i = 0; i < cards.length; i += 1) {
    if (i > 0) doc.addPage()
    const card = cards[i]!
    const png = await composeDynamicSnapshotPng(card)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(6, 78, 59)
    doc.text(
      `Dynamic Map Snapshot — ${card.layerLabel}`,
      14,
      14,
    )
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(
      `${options?.fieldName || card.fieldName} · ${options?.sceneDate || card.sceneDate} · ${card.dataSource}`,
      14,
      20,
    )
    if (png) {
      const imgW = pw - 28
      const imgH = Math.min(ph - 36, imgW * (560 / 720))
      doc.addImage(png, 'PNG', 14, 26, imgW, imgH)
    } else {
      doc.setTextColor(100, 100, 100)
      doc.text('Map image unavailable.', 14, 40)
    }
  }

  doc.save(
    `Map_Snapshots_${(options?.sceneDate || cards[0]!.sceneDate).replace(/[^\d-]/g, '_')}.pdf`,
  )
}

export async function exportAllDynamicSnapshotPngs(cards: DynamicMapSnapshotCard[]): Promise<void> {
  for (const card of cards) {
    if (card.imageDataUrl || card.status === 'ok') {
      await exportDynamicSnapshotPng(card)
    }
  }
}
