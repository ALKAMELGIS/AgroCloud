import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import {
  buildDynamicMapSnapshots,
  exportAllDynamicSnapshotPngs,
  exportDynamicSnapshotPng,
  exportDynamicSnapshotsPdf,
  type DynamicMapSnapshotCard,
} from '../lib/timeSeriesReport/dynamicMapSnapshots'
import './SiDynamicMapSnapshotsPanel.css'

export type SiDynamicMapSnapshotsPanelProps = {
  open: boolean
  geometry: GeoJSON.Geometry | null
  layerIds: string[]
  sceneDate: string
  fieldName: string
  dailyRows: SentinelHubDailyIndexMeans[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
  mapboxToken?: string
  enabled?: boolean
}

function fmt(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '—'
  return ha >= 100 ? `${ha.toFixed(1)} ha` : `${ha.toFixed(2)} ha`
}

export function SiDynamicMapSnapshotsPanel({
  open,
  geometry,
  layerIds,
  sceneDate,
  fieldName,
  dailyRows,
  layerSeries,
  mapboxToken,
  enabled = true,
}: SiDynamicMapSnapshotsPanelProps) {
  const [cards, setCards] = useState<DynamicMapSnapshotCard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const requestKeyRef = useRef('')

  const seriesMeans = useMemo(() => {
    const out: Record<string, number | null> = {}
    for (const s of layerSeries) {
      const nums = s.values.filter((v): v is number => v != null && Number.isFinite(v))
      out[s.layerId.toUpperCase()] = nums.length ? (nums[nums.length - 1] ?? null) : null
    }
    return out
  }, [layerSeries])

  const layerKey = layerIds.map(id => id.trim().toUpperCase()).filter(Boolean).join('|')
  const geometryKey = useMemo(() => {
    if (!geometry) return 'none'
    try {
      return JSON.stringify(geometry).slice(0, 240)
    } catch {
      return 'geom'
    }
  }, [geometry])

  const refresh = useCallback(async () => {
    if (!open || !enabled) return
    const date = sceneDate.trim().slice(0, 10)
    if (!layerKey || !date) {
      setCards([])
      return
    }

    const requestKey = `${layerKey}::${date}::${fieldName}::${geometryKey}`
    requestKeyRef.current = requestKey
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)

    try {
      const next = await buildDynamicMapSnapshots({
        geometry,
        layerIds: layerKey.split('|'),
        sceneDate: date,
        fieldName,
        dailyRows,
        seriesMeans,
        mapboxToken,
        signal: ac.signal,
      })
      if (ac.signal.aborted || requestKeyRef.current !== requestKey) return
      setCards(next)
    } catch (e) {
      if (ac.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Failed to build map snapshots')
      setCards([])
    } finally {
      if (!ac.signal.aborted && requestKeyRef.current === requestKey) setLoading(false)
    }
  }, [
    open,
    enabled,
    geometry,
    geometryKey,
    layerKey,
    sceneDate,
    fieldName,
    dailyRows,
    seriesMeans,
    mapboxToken,
  ])

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      return
    }
    void refresh()
    return () => abortRef.current?.abort()
  }, [open, refresh])

  const onExportPng = useCallback(async (card: DynamicMapSnapshotCard) => {
    setExportBusy(true)
    try {
      await exportDynamicSnapshotPng(card)
    } finally {
      setExportBusy(false)
    }
  }, [])

  const onExportAllPng = useCallback(async () => {
    setExportBusy(true)
    try {
      await exportAllDynamicSnapshotPngs(cards)
    } finally {
      setExportBusy(false)
    }
  }, [cards])

  const onExportPdf = useCallback(async () => {
    setExportBusy(true)
    try {
      await exportDynamicSnapshotsPdf(cards, { fieldName, sceneDate })
    } finally {
      setExportBusy(false)
    }
  }, [cards, fieldName, sceneDate])

  if (!open) return null

  return (
    <section className="si-dyn-snap" aria-label="Dynamic Map Snapshots">
      <header className="si-dyn-snap__head">
        <div>
          <h3 className="si-dyn-snap__title">
            <i className="fa-solid fa-layer-group" aria-hidden="true" />
            Dynamic Map Snapshots
          </h3>
          <p className="si-dyn-snap__sub" title={`Independent AOI previews · ${sceneDate || '—'} · Esri + WMS`}>
            {sceneDate || '—'} · Esri + WMS
          </p>
        </div>
        <div className="si-dyn-snap__actions">
          <button
            type="button"
            className="si-dyn-snap__btn"
            disabled={loading || !layerKey}
            onClick={() => void refresh()}
            title="Refresh snapshots"
          >
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate'}`} aria-hidden />
            {loading ? 'Building…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="si-dyn-snap__btn"
            disabled={exportBusy || !cards.some(c => c.imageDataUrl)}
            onClick={() => void onExportAllPng()}
            title="Export each snapshot as PNG"
          >
            <i className="fa-solid fa-file-image" aria-hidden />
            PNG
          </button>
          <button
            type="button"
            className="si-dyn-snap__btn si-dyn-snap__btn--primary"
            disabled={exportBusy || !cards.length}
            onClick={() => void onExportPdf()}
            title="Export all snapshots as PDF"
          >
            <i className="fa-solid fa-file-pdf" aria-hidden />
            PDF
          </button>
        </div>
      </header>

      {error ? (
        <p className="si-dyn-snap__error" role="alert">
          {error}
        </p>
      ) : null}

      {!layerKey ? (
        <p className="si-dyn-snap__hint">Select one or more layers in the Layers picker above.</p>
      ) : loading && !cards.length ? (
        <p className="si-dyn-snap__hint" role="status">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Generating {layerKey.split('|').length}{' '}
          snapshot{layerKey.includes('|') ? 's' : ''}…
        </p>
      ) : (
        <div className="si-dyn-snap__grid">
          {cards.map(card => (
            <article key={card.layerId} className="si-dyn-snap__card">
              <div className="si-dyn-snap__card-head">
                <strong>{card.layerLabel}</strong>
                <span>{card.sceneDate}</span>
              </div>
              <div className="si-dyn-snap__preview">
                {card.imageDataUrl ? (
                  <img src={card.imageDataUrl} alt={`${card.layerLabel} AOI map ${card.sceneDate}`} />
                ) : (
                  <div className="si-dyn-snap__preview-empty">
                    {card.error || card.notes || 'No image'}
                  </div>
                )}
                {card.basemapFallback ? (
                  <span className="si-dyn-snap__badge">Basemap</span>
                ) : null}
                {loading ? <div className="si-dyn-snap__preview-busy" aria-hidden /> : null}
              </div>
              <dl className="si-dyn-snap__stats">
                <div>
                  <dt>Mean</dt>
                  <dd>{fmt(card.stats.mean)}</dd>
                </div>
                <div>
                  <dt>Min</dt>
                  <dd>{fmt(card.stats.min)}</dd>
                </div>
                <div>
                  <dt>Max</dt>
                  <dd>{fmt(card.stats.max)}</dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>{fmtHa(card.areaHa)}</dd>
                </div>
              </dl>
              {card.legend?.classes?.length ? (
                <ul className="si-dyn-snap__legend" aria-label={`${card.layerLabel} legend`}>
                  {card.legend.classes.slice(0, 5).map(c => (
                    <li key={`${card.layerId}-${c.label}-${c.color}`}>
                      <span style={{ background: c.color }} />
                      {c.label}
                    </li>
                  ))}
                </ul>
              ) : card.legend ? (
                <p className="si-dyn-snap__legend-note">
                  {card.legend.subtitle || card.legend.title}
                </p>
              ) : null}
              <p className="si-dyn-snap__meta">
                {card.dataSource}
                {card.notes ? ` · ${card.notes.slice(0, 80)}` : ''}
              </p>
              <button
                type="button"
                className="si-dyn-snap__card-export"
                disabled={exportBusy || !card.imageDataUrl}
                onClick={() => void onExportPng(card)}
              >
                <i className="fa-solid fa-download" aria-hidden /> Export PNG
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
