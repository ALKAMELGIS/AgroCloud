import { useMemo, useState } from 'react'
import type { CropTrainingSample } from '../../../lib/cropSupervised/types'
import {
  CROP_ANALYSIS_MODES,
  cropAnalysisModeDef,
  DEFAULT_UNSUPERVISED_CLASS_COUNT,
  MAX_UNSUPERVISED_CLASSES,
  MIN_UNSUPERVISED_CLASSES,
  type CropAnalysisModeId,
} from '../../../lib/cropSupervised/cropAnalysisModes'
import {
  exportClassificationGeoJson,
  exportClassificationPng,
  exportClassificationReportPdf,
} from '../../../lib/cropSupervised/cropAiExport'
import { resolveCropAiWorkflow } from '../../../lib/cropSupervised/cropAiWorkflow'
import {
  cropProviderRequiresUpload,
  normalizeCropDataProvider,
  type CropDataProviderId,
} from '../../../lib/cropSupervised/cropDataProvider'
import type { CropImageryDataset } from '../../../lib/cropSupervised/cropImageryDataset'
import {
  PRITHVI_CROP_CLASSES,
  type CropClassificationJob,
} from '../../../lib/siPrithviCropPipeline'
import { SiCropAccuracyReport } from './SiCropAccuracyReport'
import { SiCropDataSourcePanel } from './SiCropDataSourcePanel'
import { SiCropTrainingSamplesPanel } from './SiCropTrainingSamplesPanel'
import './SiPrithviCropToolPanel.css'

type CropStat = { id?: string; name: string; pct: number; areaHa?: number }
type CropLegendItem = { id: string | number; name: string; color: string }

export type CropAiWorkspaceTab =
  | 'data-source'
  | 'analysis-mode'
  | 'training-data'
  | 'ai-model'
  | 'results'

const WORKSPACE_TABS: Array<{ id: CropAiWorkspaceTab; label: string; icon: string }> = [
  { id: 'data-source', label: 'Data Source', icon: 'fa-database' },
  { id: 'analysis-mode', label: 'Analysis Mode', icon: 'fa-sliders' },
  { id: 'training-data', label: 'Training Data', icon: 'fa-map-pin' },
  { id: 'ai-model', label: 'AI Model', icon: 'fa-brain' },
  { id: 'results', label: 'Results', icon: 'fa-chart-pie' },
]

const EARTH_R = 6378137
const D2R = Math.PI / 180

function ringAreaM2(ring: number[][]): number {
  const n = ring.length
  if (n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i += 1) {
    const [lng1, lat1] = ring[i]!
    const [lng2, lat2] = ring[(i + 1) % n]!
    total += (lng2 - lng1) * D2R * (2 + Math.sin(lat1 * D2R) + Math.sin(lat2 * D2R))
  }
  return Math.abs((total * EARTH_R * EARTH_R) / 2)
}

function polygonAreaM2(rings: number[][][]): number {
  if (!rings || !rings.length) return 0
  let a = ringAreaM2(rings[0]!)
  for (let i = 1; i < rings.length; i += 1) a -= ringAreaM2(rings[i]!)
  return Math.max(a, 0)
}

function geometryAreaHa(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon | null): number | undefined {
  if (!geom) return undefined
  let m2 = 0
  if (geom.type === 'Polygon') m2 = polygonAreaM2(geom.coordinates as unknown as number[][][])
  else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates as unknown as number[][][][]) m2 += polygonAreaM2(poly)
  }
  if (!Number.isFinite(m2) || m2 <= 0) return undefined
  return m2 / 10000
}

function formatCropArea(ha?: number): string {
  if (ha == null || !Number.isFinite(ha)) return '—'
  if (ha <= 0) return '0 ha'
  if (ha < 0.01) return '<0.01 ha'
  const decimals = ha >= 100 ? 0 : ha >= 10 ? 1 : 2
  return `${ha.toLocaleString(undefined, { maximumFractionDigits: decimals })} ha`
}

function formatAreaM2(ha?: number): string {
  if (ha == null || !Number.isFinite(ha)) return '—'
  const m2 = ha * 10000
  return `${m2.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²`
}

function stageState(
  job: CropClassificationJob | null,
  stageStatus: string,
): 'idle' | 'active' | 'done' {
  if (!job) return 'idle'
  const order = ['fetching', 'preprocessing', 'inferring', 'done']
  const cur = order.indexOf(job.status)
  const me = order.indexOf(stageStatus)
  if (job.status === 'error') return 'idle'
  if (cur < 0) return 'idle'
  if (me < cur) return 'done'
  if (me === cur) return job.status === 'done' ? 'done' : 'active'
  return 'idle'
}

function CropCompositionStats({
  stats,
  legendItems,
  aoiAreaHa,
}: {
  stats: CropStat[]
  legendItems: CropLegendItem[]
  aoiAreaHa?: number
}) {
  const [tab, setTab] = useState<'table' | 'pie' | 'bar'>('table')

  const colorByName = useMemo(() => {
    const m = new Map<string, string>()
    legendItems.forEach(l => m.set(l.name.toLowerCase(), l.color))
    return m
  }, [legendItems])

  const enriched = useMemo(
    () =>
      stats.map(s => {
        const areaHa = Number.isFinite(s.areaHa)
          ? s.areaHa
          : aoiAreaHa != null
            ? (aoiAreaHa * (s.pct || 0)) / 100
            : undefined
        return { ...s, areaHa, color: colorByName.get(s.name.toLowerCase()) ?? '#94a3b8' }
      }),
    [stats, colorByName, aoiAreaHa],
  )

  const pctSum = useMemo(() => enriched.reduce((a, s) => a + (s.pct || 0), 0) || 1, [enriched])
  const totalHa = useMemo(() => enriched.reduce((a, s) => a + (s.areaHa ?? 0), 0), [enriched])
  const hasArea = useMemo(() => enriched.some(s => Number.isFinite(s.areaHa)), [enriched])

  const pieWedges = useMemo(() => {
    const R = 46
    const cx = 50
    const cy = 50
    let angle = -Math.PI / 2
    return enriched.map(s => {
      const frac = (s.pct || 0) / pctSum
      const a0 = angle
      const a1 = angle + frac * Math.PI * 2
      angle = a1
      const x0 = cx + R * Math.cos(a0)
      const y0 = cy + R * Math.sin(a0)
      const x1 = cx + R * Math.cos(a1)
      const y1 = cy + R * Math.sin(a1)
      const large = a1 - a0 > Math.PI ? 1 : 0
      const d =
        frac >= 0.999
          ? `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} Z`
          : `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
      return { d, color: s.color, key: s.id ?? s.name }
    })
  }, [enriched, pctSum])

  const bars = useMemo(() => {
    const copy = [...enriched]
    copy.sort((p, q) => (hasArea ? (q.areaHa ?? 0) - (p.areaHa ?? 0) : q.pct - p.pct))
    const max = hasArea
      ? Math.max(...copy.map(s => s.areaHa ?? 0), 0.0001)
      : Math.max(...copy.map(s => s.pct), 0.0001)
    return copy.map(s => ({ ...s, w: ((hasArea ? s.areaHa ?? 0 : s.pct) / max) * 100 }))
  }, [enriched, hasArea])

  return (
    <div className="prithvi-tool__stats">
      <div className="prithvi-tool__stats-head">
        <div className="prithvi-tool__stats-title">Area statistics</div>
        <div className="prithvi-comp-tabs" role="tablist" aria-label="Crop composition view">
          {(['table', 'pie', 'bar'] as const).map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={'prithvi-comp-tab' + (tab === t ? ' is-active' : '')}
              onClick={() => setTab(t)}
            >
              <i
                className={
                  t === 'table'
                    ? 'fa-solid fa-table-list'
                    : t === 'pie'
                      ? 'fa-solid fa-chart-pie'
                      : 'fa-solid fa-chart-column'
                }
                aria-hidden
              />
              <span>{t === 'table' ? 'Table' : t === 'pie' ? 'Pie' : 'Bar'}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'table' ? (
        <div className="prithvi-comp-table" role="table">
          <div className="prithvi-comp-table__head" role="row">
            <span role="columnheader">Class</span>
            <span className="num" role="columnheader">%</span>
            <span className="num" role="columnheader">m²</span>
            <span className="num" role="columnheader">ha</span>
          </div>
          {enriched.map(s => (
            <div className="prithvi-comp-table__row" role="row" key={s.id ?? s.name}>
              <span className="prithvi-comp-table__name" role="cell">
                <span className="prithvi-tool__swatch" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="num prithvi-tool__stats-pct" role="cell">
                {s.pct}%
              </span>
              <span className="num prithvi-comp-table__area" role="cell">
                {formatAreaM2(s.areaHa)}
              </span>
              <span className="num prithvi-comp-table__area" role="cell">
                {formatCropArea(s.areaHa)}
              </span>
            </div>
          ))}
          {hasArea ? (
            <div className="prithvi-comp-table__foot" role="row">
              <span role="cell">Total</span>
              <span className="num" role="cell">100%</span>
              <span className="num" role="cell">{formatAreaM2(totalHa)}</span>
              <span className="num" role="cell">{formatCropArea(totalHa)}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'pie' ? (
        <div className="prithvi-comp-pie">
          <svg viewBox="0 0 100 100" className="prithvi-comp-pie__svg" role="img" aria-label="Crop composition pie chart">
            {pieWedges.map(w => (
              <path key={w.key} d={w.d} fill={w.color} stroke="rgba(0,0,0,0.25)" strokeWidth={0.4} />
            ))}
          </svg>
          <ul className="prithvi-comp-pie__legend">
            {enriched.map(s => (
              <li key={s.id ?? s.name}>
                <span className="prithvi-tool__swatch" style={{ background: s.color }} />
                <span className="prithvi-comp-pie__legend-name">{s.name}</span>
                <span className="prithvi-comp-pie__legend-pct">{s.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === 'bar' ? (
        <div className="prithvi-comp-bars">
          {bars.map(s => (
            <div className="prithvi-comp-bar" key={s.id ?? s.name}>
              <div className="prithvi-comp-bar__top">
                <span className="prithvi-comp-bar__name">
                  <span className="prithvi-tool__swatch" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="prithvi-comp-bar__val">
                  {hasArea ? formatCropArea(s.areaHa) : `${s.pct}%`}
                </span>
              </div>
              <div className="prithvi-comp-bar__track">
                <div
                  className="prithvi-comp-bar__fill"
                  style={{ width: `${Math.max(s.w, 1.5)}%`, background: s.color }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export type SiPrithviCropToolPanelProps = {
  aoiGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  hasSelfInference: boolean
  dataProvider: CropDataProviderId
  onDataProviderChange: (id: CropDataProviderId) => void
  dataset: CropImageryDataset | null
  onDatasetChange: (dataset: CropImageryDataset | null) => void
  analysisMode: CropAnalysisModeId
  onAnalysisModeChange: (mode: CropAnalysisModeId) => void
  unsupervisedClassCount: number
  onUnsupervisedClassCountChange: (n: number) => void
  trainingSamples: CropTrainingSample[]
  onTrainingSamplesChange: (samples: CropTrainingSample[]) => void
  samplesValid: boolean
  season: { start: string; end: string }
  onSeasonChange: (season: { start: string; end: string }) => void
  job: CropClassificationJob | null
  isRunning: boolean
  isFetchingSentinelScenes?: boolean
  onPickAoi: () => void
  onRunAoi: () => void
  onCancel: () => void
  onAddToMap?: () => void
  onAddConfidenceToMap?: () => void
  imagePlacementBounds?: { west: number; south: number; east: number; north: number }
}

export function SiPrithviCropToolPanel(props: SiPrithviCropToolPanelProps) {
  const {
    aoiGeometry,
    hasSelfInference,
    dataProvider,
    onDataProviderChange,
    dataset,
    onDatasetChange,
    analysisMode,
    onAnalysisModeChange,
    unsupervisedClassCount,
    onUnsupervisedClassCountChange,
    trainingSamples,
    onTrainingSamplesChange,
    samplesValid,
    season,
    onSeasonChange,
    job,
    isRunning,
    isFetchingSentinelScenes,
    onPickAoi,
    onRunAoi,
    onCancel,
    onAddToMap,
    onAddConfidenceToMap,
    imagePlacementBounds,
  } = props

  const [workspaceTab, setWorkspaceTab] = useState<CropAiWorkspaceTab>('data-source')

  const modeDef = cropAnalysisModeDef(analysisMode)
  const workflow = useMemo(
    () => resolveCropAiWorkflow(dataProvider, analysisMode, dataset),
    [dataProvider, analysisMode, dataset],
  )
  const needsUpload = cropProviderRequiresUpload(dataProvider)
  const hasAoi = Boolean(aoiGeometry)
  const hasDataset = Boolean(dataset)
  const uploadReady = !needsUpload || hasDataset
  const trainingReady = !modeDef.needsTrainingSamples || samplesValid
  const controlsDisabled = isRunning
  const canRun = uploadReady && hasAoi && trainingReady

  const aoiAreaHa = useMemo(() => geometryAreaHa(aoiGeometry), [aoiGeometry])
  const result = job?.status === 'done' ? job.result : null
  const scenes = result?.scenes
  const prediction = result?.prediction
  const confidence = result?.confidence
  const country = result?.country ?? null
  const classStats = result?.classStats ?? null
  const accuracy = result?.accuracy ?? null
  const progressPct = Math.round((job?.progress ?? 0) * 100)

  const sceneTiles = useMemo(
    () =>
      analysisMode === 'supervised'
        ? [
            { key: 'Crop Type', src: prediction?.url ?? null },
            { key: 'Confidence', src: confidence?.url ?? null },
          ]
        : [
            { key: 'T1', src: scenes?.t1 ?? null },
            { key: 'T2', src: scenes?.t2 ?? null },
            { key: 'T3', src: scenes?.t3 ?? null },
            { key: 'Crop Type', src: prediction?.url ?? null },
          ],
    [analysisMode, scenes, prediction, confidence],
  )

  const legendItems = useMemo(() => {
    if (result?.legend && result.legend.length) {
      return result.legend.map(c => ({ id: c.id, name: c.name, color: c.color }))
    }
    return PRITHVI_CROP_CLASSES.map(c => ({ id: c.id, name: c.name, color: c.color }))
  }, [result])

  const displayLegendItems = useMemo(() => {
    if (result && classStats && classStats.length) {
      const present = new Set(classStats.map(s => String(s.name ?? '').toLowerCase()).filter(Boolean))
      const filtered = legendItems.filter(l => present.has(l.name.toLowerCase()))
      return filtered.length ? filtered : legendItems
    }
    return legendItems
  }, [result, classStats, legendItems])

  const runLabel = isRunning
    ? 'Running…'
    : analysisMode === 'supervised'
      ? 'Run supervised classification'
      : analysisMode === 'object-based'
        ? 'Run object-based analysis'
        : analysisMode === 'unsupervised'
          ? 'Run unsupervised clustering'
          : 'Run AI classification'

  return (
    <div className="prithvi-tool" dir="auto">
      <header className="prithvi-tool__head">
        <div className="prithvi-tool__title">Crop Classification</div>
        <p className="prithvi-tool__sub prithvi-tool__sub--head">
          Multi-source Crop AI — satellite, drone, LiDAR, or user raster.
        </p>
      </header>

      <div className="prithvi-tool__workspace-tabs" role="tablist" aria-label="Crop AI workspace">
        {WORKSPACE_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={workspaceTab === t.id}
            className={`prithvi-tool__workspace-tab${workspaceTab === t.id ? ' is-active' : ''}`}
            disabled={isRunning}
            onClick={() => setWorkspaceTab(t.id)}
            title={t.label}
          >
            <i className={`fa-solid ${t.icon}`} aria-hidden />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {workspaceTab === 'data-source' ? (
        <SiCropDataSourcePanel
          dataProvider={dataProvider}
          onDataProviderChange={onDataProviderChange}
          dataset={dataset}
          onDatasetChange={onDatasetChange}
          disabled={controlsDisabled}
          imagePlacementBounds={imagePlacementBounds}
        />
      ) : null}

      {workspaceTab === 'analysis-mode' ? (
        <div className="prithvi-tool__section">
          <div className="prithvi-tool__section-title">Analysis mode</div>
          <div className="prithvi-tool__mode-grid">
            {CROP_ANALYSIS_MODES.map(m => (
              <button
                key={m.id}
                type="button"
                className={`prithvi-tool__mode-card${analysisMode === m.id ? ' is-active' : ''}`}
                disabled={controlsDisabled}
                onClick={() => onAnalysisModeChange(m.id)}
              >
                <strong>{m.shortLabel}</strong>
                <span>{m.description}</span>
              </button>
            ))}
          </div>

          {modeDef.supportsClassCount ? (
            <label className="prithvi-tool__stack prithvi-tool__class-count">
              <span className="prithvi-tool__provider-label">Number of classes ({MIN_UNSUPERVISED_CLASSES}–{MAX_UNSUPERVISED_CLASSES})</span>
              <input
                type="range"
                min={MIN_UNSUPERVISED_CLASSES}
                max={MAX_UNSUPERVISED_CLASSES}
                value={unsupervisedClassCount}
                disabled={controlsDisabled}
                onChange={e => onUnsupervisedClassCountChange(Number(e.target.value))}
              />
              <output>{unsupervisedClassCount}</output>
            </label>
          ) : null}

          {workflow.requiresSeason ? (
            <div className="prithvi-tool__dates">
              <label>
                <span>Season start</span>
                <input
                  type="date"
                  value={season.start}
                  max={season.end}
                  disabled={controlsDisabled}
                  onChange={e => onSeasonChange({ ...season, start: e.target.value })}
                />
              </label>
              <label>
                <span>Season end</span>
                <input
                  type="date"
                  value={season.end}
                  min={season.start}
                  disabled={controlsDisabled}
                  onChange={e => onSeasonChange({ ...season, end: e.target.value })}
                />
              </label>
            </div>
          ) : null}

          <div className="prithvi-tool__row">
            <button type="button" className="prithvi-tool__btn" onClick={onPickAoi} disabled={controlsDisabled}>
              <i className="fa-solid fa-draw-polygon" aria-hidden /> Draw / pick AOI
            </button>
          </div>
          {!hasAoi ? (
            <div className="prithvi-tool__note">Draw a polygon AOI on the map to run classification.</div>
          ) : null}
          {needsUpload && !hasDataset ? (
            <div className="prithvi-tool__note">Upload a dataset in the Data Source tab before running.</div>
          ) : null}
        </div>
      ) : null}

      {workspaceTab === 'training-data' ? (
        modeDef.needsTrainingSamples ? (
          <SiCropTrainingSamplesPanel
            samples={trainingSamples}
            onSamplesChange={onTrainingSamplesChange}
            aoiGeometry={aoiGeometry}
            disabled={controlsDisabled}
          />
        ) : (
          <div className="prithvi-tool__section">
            <div className="prithvi-tool__section-title">Training data</div>
            <p className="prithvi-tool__sub">
              The selected analysis mode (<strong>{modeDef.label}</strong>) does not require labelled training samples.
            </p>
          </div>
        )
      ) : null}

      {workspaceTab === 'ai-model' ? (
        <div className="prithvi-tool__section">
          <div className="prithvi-tool__section-title">AI model &amp; workflow</div>
          <div className="prithvi-tool__workflow-card">
            <div className="prithvi-tool__workflow-name">{workflow.label}</div>
            <p className="prithvi-tool__sub">{workflow.summary}</p>
            <dl className="prithvi-datasource__details">
              <div>
                <dt>Model</dt>
                <dd>{workflow.modelLabel}</dd>
              </div>
              <div>
                <dt>Primary source</dt>
                <dd>{normalizeCropDataProvider(dataProvider)}</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>
                  {hasSelfInference ? 'Self-hosted Prithvi' : 'Prithvi / browser fallback'}
                  {isFetchingSentinelScenes ? ' · updating scenes…' : ''}
                </dd>
              </div>
            </dl>
            <ol className="prithvi-tool__workflow-steps">
              {workflow.stages.map(s => (
                <li key={s.status}>{s.label}</li>
              ))}
            </ol>
          </div>

          <div className="prithvi-tool__row">
            {isRunning ? (
              <button type="button" className="prithvi-tool__btn is-danger" onClick={onCancel}>
                <i className="fa-solid fa-stop" aria-hidden /> Cancel
              </button>
            ) : (
              <button
                type="button"
                className="prithvi-tool__btn is-primary"
                onClick={onRunAoi}
                disabled={!canRun}
              >
                <i className="fa-solid fa-play" aria-hidden /> {runLabel}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {workspaceTab === 'results' ? (
        <div className="prithvi-tool__section">
          {job ? (
            <div className="prithvi-tool__pipeline">
              <div className="prithvi-tool__progress">
                <div className="prithvi-tool__progress-bar" style={{ width: `${progressPct}%` }} />
              </div>
              <ol className="prithvi-tool__steps">
                {workflow.stages.map(stage => {
                  const st = stageState(job, stage.status)
                  return (
                    <li key={stage.status} className={`prithvi-tool__step is-${st}`}>
                      <span className="prithvi-tool__step-dot">
                        {st === 'done' ? <i className="fa-solid fa-check" aria-hidden /> : null}
                        {st === 'active' ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : null}
                      </span>
                      <span className="prithvi-tool__step-label">{stage.label}</span>
                    </li>
                  )
                })}
              </ol>
              <div className={`prithvi-tool__status is-${job.status}`}>{job.message}</div>
              {job.status === 'error' && job.error ? (
                <div className="prithvi-tool__error">{job.error}</div>
              ) : null}
            </div>
          ) : (
            <p className="prithvi-tool__sub">Run a classification from the AI Model tab to see results here.</p>
          )}

          {result ? (
            <div className="prithvi-tool__results">
              {country ? (
                <div className="prithvi-tool__country">
                  <i className="fa-solid fa-location-dot" aria-hidden /> Detected country:{' '}
                  <strong>{country.name}</strong>
                  {country.code ? ` (${country.code})` : ''}
                </div>
              ) : null}

              <div className="prithvi-tool__grid">
                {sceneTiles.map(tile => (
                  <figure key={tile.key} className="prithvi-tool__tile">
                    {tile.src ? (
                      <img src={tile.src} alt={tile.key} loading="lazy" />
                    ) : (
                      <div className="prithvi-tool__tile-empty">
                        <i className="fa-regular fa-image" aria-hidden />
                      </div>
                    )}
                    <figcaption>{tile.key}</figcaption>
                  </figure>
                ))}
              </div>

              {classStats && classStats.length ? (
                <CropCompositionStats stats={classStats} legendItems={legendItems} aoiAreaHa={aoiAreaHa} />
              ) : null}

              {accuracy ? <SiCropAccuracyReport accuracy={accuracy} /> : null}

              <div className="prithvi-tool__section-title">Export</div>
              <div className="prithvi-tool__export-grid">
                <button
                  type="button"
                  className="prithvi-tool__btn"
                  disabled={!prediction?.url}
                  onClick={() => void exportClassificationPng(result!)}
                >
                  <i className="fa-solid fa-image" aria-hidden /> PNG map
                </button>
                <button
                  type="button"
                  className="prithvi-tool__btn"
                  disabled={!classStats?.length}
                  onClick={() => exportClassificationGeoJson(result!)}
                >
                  <i className="fa-solid fa-file-code" aria-hidden /> GeoJSON stats
                </button>
                <button
                  type="button"
                  className="prithvi-tool__btn"
                  disabled={!classStats?.length}
                  onClick={() => exportClassificationReportPdf(result!, { workflow: workflow.label })}
                >
                  <i className="fa-solid fa-file-lines" aria-hidden /> Report
                </button>
              </div>

              {result?.prediction?.url && onAddToMap ? (
                <div className="prithvi-tool__row">
                  <button type="button" className="prithvi-tool__btn" onClick={onAddToMap}>
                    <i className="fa-solid fa-layer-group" aria-hidden /> Add classification to map
                  </button>
                  {confidence?.url && onAddConfidenceToMap ? (
                    <button type="button" className="prithvi-tool__btn" onClick={onAddConfidenceToMap}>
                      <i className="fa-solid fa-chart-area" aria-hidden /> Add confidence map
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="prithvi-tool__legend">
                <div className="prithvi-tool__legend-title">Detected crop types</div>
                <ul className="prithvi-tool__legend-list">
                  {displayLegendItems.map(c => (
                    <li key={c.id}>
                      <span className="prithvi-tool__swatch" style={{ background: c.color }} />
                      {c.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default SiPrithviCropToolPanel
