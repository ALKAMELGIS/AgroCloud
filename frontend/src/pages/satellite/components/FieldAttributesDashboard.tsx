/**
 * Example.xlsx attributes dashboard — static KPI cards + charts from schema fields.
 */

import { useMemo, useState, type RefObject } from 'react'
import { ValidationLinePlot, type PlotSeries } from './ValidationLinePlot'
import { FieldDashBarChart } from './FieldDashBarChart'
import {
  buildFieldAttributesDashboardModel,
  type FieldAttributesDashboardModel,
  type NamedCount,
} from './fieldAttributesDashboardModel'
import {
  FIELD_DASH_ET_CHART_SCALE,
  type FieldDashIndexId,
  type FieldDashIndexTimeSeries,
} from './fieldAttributesDashboardTimeSeries'
import { AfbOperationProgressBar } from './AfbOperationProgressBar'
import { FieldAttributesDashboardModal } from './FieldAttributesDashboardModal'
import './FieldAttributesDashboard.css'

const PIE_COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#7b1fa2', '#00838f', '#c62828', '#5d4037', '#455a64']

const INDEX_TS_META: Array<{ id: FieldDashIndexId; color: string; dashed?: boolean }> = [
  { id: 'NDVI', color: '#2e7d32' },
  { id: 'NDRE', color: '#7b1fa2' },
  { id: 'NDMI', color: '#1976d2' },
  { id: 'NDWI', color: '#00838f' },
  { id: 'SAVI', color: '#ed6c02' },
  { id: 'ET', color: '#c62828', dashed: true },
]

function buildIndexTimeSeriesPlot(
  ts: FieldDashIndexTimeSeries | null,
): { series: PlotSeries[]; xTicks: Array<{ value: number; label: string }> } {
  if (!ts?.dates?.length) return { series: [], xTicks: [] }
  const xTicks = ts.dates.map((d, i) => ({
    value: i,
    label: d.length >= 10 ? d.slice(5) : d,
  }))
  const series: PlotSeries[] = []
  for (const meta of INDEX_TS_META) {
    const raw = ts.indices[meta.id] ?? []
    const points = raw
      .map((y, i) => {
        if (y == null || !Number.isFinite(y)) return null
        const plotY = meta.id === 'ET' ? y / FIELD_DASH_ET_CHART_SCALE : y
        return { x: i, y: plotY }
      })
      .filter((p): p is { x: number; y: number } => p != null)
    if (points.length < 2) continue
    series.push({
      id: meta.id.toLowerCase(),
      label: meta.id === 'ET' ? 'ET (mm/d ÷10)' : meta.id,
      color: meta.color,
      dashed: meta.dashed,
      markers: points.length <= 16,
      points,
    })
  }
  return { series, xTicks }
}

function IndexTimeSeriesChart({
  ts,
  expanded,
}: {
  ts: FieldDashIndexTimeSeries | null
  expanded: boolean
}) {
  const { series, xTicks } = useMemo(() => buildIndexTimeSeriesPlot(ts), [ts])
  if (!series.length) {
    return (
      <p className="si-field-dash__empty">
        Index time series appears after Sentinel-2 enrichment (≥2 clear scenes).
      </p>
    )
  }
  return (
    <ValidationLinePlot
      series={series}
      xLabel="Date"
      yLabel="Index"
      yDomain={[-0.05, 1]}
      xTicks={xTicks}
      formatX={v => xTicks[Math.round(v)]?.label ?? String(v)}
      formatY={v => v.toFixed(2)}
      ariaLabel="Spectral index time series"
      height={expanded ? 220 : 150}
      width={expanded ? 640 : 320}
      fluid
      grid
      markers={false}
    />
  )
}

const KPI_META: Array<{
  key: keyof Pick<
    FieldAttributesDashboardModel,
    'fieldCount' | 'totalAreaHa' | 'meanNdvi' | 'healthyPct' | 'cropTypeCount' | 'highInspectCount'
  >
  label: string
  icon: string
  format: (m: FieldAttributesDashboardModel) => string
}> = [
  { key: 'fieldCount', label: 'Fields', icon: 'fa-layer-group', format: m => String(m.fieldCount) },
  {
    key: 'totalAreaHa',
    label: 'Total area',
    icon: 'fa-chart-area',
    format: m => `${fmtHa(m.totalAreaHa)} ha`,
  },
  {
    key: 'meanNdvi',
    label: 'Mean NDVI',
    icon: 'fa-leaf',
    format: m => (m.meanNdvi != null ? m.meanNdvi.toFixed(2) : '—'),
  },
  {
    key: 'healthyPct',
    label: 'Healthy',
    icon: 'fa-heart-pulse',
    format: m => (m.healthyPct != null ? `${m.healthyPct}%` : '—'),
  },
  {
    key: 'cropTypeCount',
    label: 'Crop types',
    icon: 'fa-wheat-awn',
    format: m => String(m.cropTypeCount),
  },
  {
    key: 'highInspectCount',
    label: 'High inspect',
    icon: 'fa-triangle-exclamation',
    format: m => String(m.highInspectCount),
  },
]

export type FieldAttributesDashboardProps = {
  geojson: GeoJSON.FeatureCollection | null | undefined
  engine?: string | null
  sceneDate?: string | null
  aoiLabel?: string
  attributesBusy?: boolean
  attributesStatus?: string | null
  operationProgressPct?: number
  mapContainerRef?: RefObject<HTMLElement | null>
  onRefreshAttributes?: () => void
  onAddToLayers?: () => void | Promise<void>
}

function fmtHa(v: number): string {
  if (v >= 100) return v.toFixed(0)
  if (v >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

function BarList({
  rows,
  max,
  unit = '',
  fillClass = '',
}: {
  rows: Array<{ label: string; value: number }>
  max: number
  unit?: string
  fillClass?: string
}) {
  if (!rows.length) {
    return <p className="si-field-dash__empty">No data</p>
  }
  return (
    <div className="si-field-dash__bars">
      {rows.map(r => (
        <div key={r.label} className="si-field-dash__bar-row">
          <span title={r.label}>{r.label}</span>
          <div className="si-field-dash__bar-track">
            <div
              className={`si-field-dash__bar-fill${fillClass ? ` ${fillClass}` : ''}`}
              style={{ width: `${Math.max(4, Math.round((r.value / max) * 100))}%` }}
            />
          </div>
          <strong>
            {r.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {unit}
          </strong>
        </div>
      ))}
    </div>
  )
}

function CountBars({ rows, fillClass = '' }: { rows: NamedCount[]; fillClass?: string }) {
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <BarList
      rows={rows.map(r => ({ label: r.label, value: r.count }))}
      max={max}
      fillClass={fillClass}
    />
  )
}

function buildPieDonutBackground(rows: Array<{ count: number; color: string }>): string {
  const nonzero = rows.filter(r => r.count > 0)
  const total = nonzero.reduce((s, r) => s + r.count, 0)
  if (total <= 0) return 'conic-gradient(#e2e8f0 0% 100%)'
  let acc = 0
  const segs: string[] = []
  for (const r of nonzero) {
    const pct = (r.count / total) * 100
    const start = acc
    acc += pct
    segs.push(`${r.color} ${start}% ${acc}%`)
  }
  return `conic-gradient(${segs.join(', ')})`
}

function resolvePieSliceColor(label: string, index: number, palette: 'default' | 'health' = 'default'): string {
  if (palette === 'health') {
    const lower = label.toLowerCase()
    if (/healthy/i.test(lower) && !/stress|moderate/i.test(lower)) return '#2e7d32'
    if (/moderate/i.test(lower)) return '#ed6c02'
    if (/stress|unhealthy|poor|critical/i.test(lower)) return '#c62828'
    if (/unknown/i.test(lower)) return '#94a3b8'
  }
  return PIE_COLORS[index % PIE_COLORS.length]
}

function PieDonutChart({
  rows,
  palette = 'default',
  ariaLabel,
  expanded = false,
}: {
  rows: NamedCount[]
  palette?: 'default' | 'health'
  ariaLabel: string
  expanded?: boolean
}) {
  if (!rows.length) return <p className="si-field-dash__empty">No categories</p>

  const total = rows.reduce((s, r) => s + r.count, 0) || 1
  const slices = rows.map((r, i) => ({
    ...r,
    color: resolvePieSliceColor(r.label, i, palette),
    pct: Math.round((r.count / total) * 100),
  }))
  const background = buildPieDonutBackground(slices)

  return (
    <div className={`si-field-dash__pie-chart${expanded ? ' si-field-dash__pie-chart--expanded' : ''}`}>
      <div
        className="si-field-dash__pie-donut"
        role="img"
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <div className="si-field-dash__pie-ring" style={{ background }} />
        <div className="si-field-dash__pie-hole" aria-hidden />
        <div className="si-field-dash__pie-center" aria-hidden>
          {total.toLocaleString()}
        </div>
      </div>
      <div className="si-field-dash__pie-legend">
        {slices.map(r => (
          <div key={r.label} className="si-field-dash__pie-row">
            <span className="si-field-dash__pie-dot" style={{ background: r.color }} />
            <span className="si-field-dash__pie-label" title={r.label}>
              {r.label}
            </span>
            <span className="si-field-dash__pie-value">
              {r.count} ({r.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type DashboardBodyProps = {
  model: FieldAttributesDashboardModel
  aoiLabel: string
  layout: 'compact' | 'expanded'
  embedded?: boolean
  attributesBusy?: boolean
  attributesStatus?: string | null
  operationProgressPct?: number
  onRefreshAttributes?: () => void
  onAddToLayers?: () => void | Promise<void>
  onExpand?: () => void
  showExpand?: boolean
}

function DashboardMetaRow({
  model,
  aoiLabel,
  iconOnly = false,
}: {
  model: FieldAttributesDashboardModel
  aoiLabel: string
  iconOnly?: boolean
}) {
  const items: Array<{ key: string; icon: string; label: string }> = [
    { key: 'provider', icon: 'fa-solid fa-satellite', label: model.provider },
  ]
  if (model.engine) {
    items.push({ key: 'engine', icon: 'fa-solid fa-microchip', label: model.engine })
  }
  if (model.sceneDate) {
    items.push({ key: 'sceneDate', icon: 'fa-regular fa-calendar', label: model.sceneDate })
  }
  items.push({ key: 'aoi', icon: 'fa-solid fa-draw-polygon', label: aoiLabel })

  return (
    <div className="si-field-dash__meta" aria-label="Layer context">
      {items.map(item => (
        <span
          key={item.key}
          className={`si-field-dash__meta-item${iconOnly ? ' si-field-dash__meta-item--icon-only' : ''}`}
          title={item.label}
          aria-label={item.label}
        >
          <i className={item.icon} aria-hidden />
          {!iconOnly ? item.label : null}
        </span>
      ))}
    </div>
  )
}

function FieldAttributesDashboardBody({
  model,
  aoiLabel,
  layout,
  embedded = false,
  attributesBusy = false,
  attributesStatus = null,
  operationProgressPct = 0,
  onRefreshAttributes,
  onAddToLayers,
  onExpand,
  showExpand = false,
}: DashboardBodyProps) {
  const expanded = layout === 'expanded'

  return (
    <div
      className={`si-field-dash si-field-dash--${layout}${embedded ? ' si-field-dash--embedded' : ''}`}
      aria-label="Field attributes dashboard"
    >
      {!embedded ? (
      <header className="si-field-dash__hero">
        <div className="si-field-dash__hero-main">
          <div className="si-field-dash__brand">
            <span className="si-field-dash__brand-icon" aria-hidden>
              <i className="fa-solid fa-chart-pie" />
            </span>
            <div>
              <h3 className="si-field-dash__title">Attributes dashboard</h3>
              <p className="si-field-dash__subtitle">Example.xlsx fields · static KPIs & charts</p>
            </div>
          </div>
          <div className="si-field-dash__actions">
            {onRefreshAttributes ? (
              <button
                type="button"
                className="si-field-dash__icon-btn"
                disabled={attributesBusy}
                title="Refresh Sentinel-2 attributes"
                aria-label="Refresh Sentinel-2 attributes"
                onClick={onRefreshAttributes}
              >
                <i className="fa-solid fa-arrows-rotate" aria-hidden />
                {expanded ? <span>Refresh S2</span> : null}
              </button>
            ) : null}
            {onAddToLayers ? (
              <button
                type="button"
                className="si-field-dash__icon-btn"
                disabled={attributesBusy}
                title="Add layer to map"
                aria-label="Add layer to map"
                onClick={() => void onAddToLayers()}
              >
                <i className="fa-solid fa-layer-group" aria-hidden />
                {expanded ? <span>Add layer</span> : null}
              </button>
            ) : null}
            {showExpand && onExpand ? (
              <button
                type="button"
                className="si-field-dash__icon-btn si-field-dash__icon-btn--accent"
                title="Expand dashboard"
                aria-label="Expand dashboard"
                onClick={onExpand}
              >
                <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
                {expanded ? null : <span className="si-field-dash__sr-only">Expand</span>}
              </button>
            ) : null}
          </div>
        </div>

        <DashboardMetaRow model={model} aoiLabel={aoiLabel} iconOnly={!expanded} />
      </header>
      ) : (
        <div className="si-field-dash__toolbar">
          <DashboardMetaRow model={model} aoiLabel={aoiLabel} iconOnly />
          <div className="si-field-dash__actions">
            {onRefreshAttributes ? (
              <button
                type="button"
                className="si-field-dash__icon-btn"
                disabled={attributesBusy}
                title="Refresh Sentinel-2 attributes"
                aria-label="Refresh Sentinel-2 attributes"
                onClick={onRefreshAttributes}
              >
                <i className="fa-solid fa-arrows-rotate" aria-hidden />
                <span>Refresh S2</span>
              </button>
            ) : null}
            {onAddToLayers ? (
              <button
                type="button"
                className="si-field-dash__icon-btn"
                disabled={attributesBusy}
                title="Add layer to map"
                aria-label="Add layer to map"
                onClick={() => void onAddToLayers()}
              >
                <i className="fa-solid fa-layer-group" aria-hidden />
                <span>Add layer</span>
              </button>
            ) : null}
          </div>
        </div>
      )}

      {attributesStatus ? (
        <AfbOperationProgressBar
          label={attributesStatus}
          pct={operationProgressPct}
          className="si-field-dash__op-progress"
        />
      ) : null}

      <div className="si-field-dash__kpi-grid" aria-label="Summary KPIs">
        {KPI_META.map(kpi => (
          <div key={kpi.key} className="si-field-dash__kpi">
            <span className="si-field-dash__kpi-label">
              <i className={`fa-solid ${kpi.icon}`} aria-hidden />
              {kpi.label}
            </span>
            <strong>{kpi.format(model)}</strong>
          </div>
        ))}
      </div>

      <div className="si-field-dash__charts si-field-dash__charts--primary">
        <section className="si-field-dash__card">
          <div className="si-field-dash__card-head">
            <h4>
              <i className="fa-solid fa-chart-bar" aria-hidden /> Area by field
            </h4>
            <span>ha</span>
          </div>
          <FieldDashBarChart
            rows={model.areaByField}
            ariaLabel="Area by field in hectares"
            yLabel="ha"
            color="#1976d2"
            formatValue={v => fmtHa(v)}
            expanded={expanded}
          />
        </section>

        <section className="si-field-dash__card">
          <div className="si-field-dash__card-head">
            <h4>
              <i className="fa-solid fa-chart-pie" aria-hidden /> Crop type mix
            </h4>
            <span>count</span>
          </div>
          <PieDonutChart
            rows={model.cropMix}
            ariaLabel="Crop type distribution"
            expanded={expanded}
          />
        </section>

        <section className="si-field-dash__card">
          <div className="si-field-dash__card-head">
            <h4>
              <i className="fa-solid fa-heart-pulse" aria-hidden /> Health status
            </h4>
            <span>count</span>
          </div>
          <PieDonutChart
            rows={model.healthMix}
            palette="health"
            ariaLabel="Health status distribution"
            expanded={expanded}
          />
        </section>
      </div>

      <div className="si-field-dash__charts si-field-dash__charts--secondary">
        <section className="si-field-dash__card">
          <div className="si-field-dash__card-head">
            <h4>
              <i className="fa-solid fa-leaf" aria-hidden /> NDVI distribution
            </h4>
            <span>fields</span>
          </div>
          <FieldDashBarChart
            rows={model.ndviBuckets.map(r => ({ label: r.label, value: r.count }))}
            ariaLabel="NDVI distribution by field count"
            yLabel="fields"
            color="#2e7d32"
            formatValue={v => String(Math.round(v))}
            expanded={expanded}
          />
        </section>

        {model.landCoverMix.length ? (
          <section className="si-field-dash__card">
            <div className="si-field-dash__card-head">
              <h4>
                <i className="fa-solid fa-mountain-sun" aria-hidden /> Land cover
              </h4>
              <span>count</span>
            </div>
            <CountBars rows={model.landCoverMix} fillClass="si-field-dash__bar-fill--amber" />
          </section>
        ) : null}

        {expanded
          ? model.attributeMixes.map(chart => (
              <section key={chart.fieldName} className="si-field-dash__card">
                <div className="si-field-dash__card-head">
                  <h4>
                    <i className="fa-solid fa-table-columns" aria-hidden /> {chart.label}
                  </h4>
                  <span>count</span>
                </div>
                <PieDonutChart
                  rows={chart.rows}
                  ariaLabel={`${chart.label} distribution`}
                  expanded={expanded}
                />
              </section>
            ))
          : null}
      </div>

      <section className="si-field-dash__card si-field-dash__card--timeseries">
        <div className="si-field-dash__card-head">
          <h4>
            <i className="fa-solid fa-chart-line" aria-hidden /> Index time series
          </h4>
          <span>AOI mean</span>
        </div>
        <p className="si-field-dash__ts-legend">
          NDVI · NDRE · NDMI · NDWI · SAVI · ET (mm/d ÷10)
        </p>
        <IndexTimeSeriesChart ts={model.indexTimeSeries} expanded={expanded} />
      </section>
    </div>
  )
}

export function FieldAttributesDashboard({
  geojson,
  engine = null,
  sceneDate = null,
  aoiLabel = 'AOI',
  attributesBusy = false,
  attributesStatus = null,
  operationProgressPct = 0,
  mapContainerRef,
  onRefreshAttributes,
  onAddToLayers,
}: FieldAttributesDashboardProps) {
  const [floatOpen, setFloatOpen] = useState(false)

  const model = useMemo(
    () =>
      buildFieldAttributesDashboardModel(geojson, {
        engine,
        sceneDate,
        provider: 'Sentinel-2 L2A',
      }),
    [geojson, engine, sceneDate],
  )

  if (!model) {
    return (
      <div className="si-field-dash si-field-dash--compact">
        <p className="si-field-dash__empty">
          Run <strong>Detect Fields</strong> to populate layer attributes from Sentinel-2, or use{' '}
          <strong>Add layer</strong> after detection.
        </p>
      </div>
    )
  }

  const bodyProps = {
    model,
    aoiLabel,
    attributesBusy,
    attributesStatus,
    operationProgressPct,
    onRefreshAttributes,
    onAddToLayers,
  }

  const floatSubtitle = [model.engine, model.sceneDate, aoiLabel].filter(Boolean).join(' · ')

  return (
    <>
      <FieldAttributesDashboardBody
        {...bodyProps}
        layout="compact"
        showExpand={Boolean(mapContainerRef)}
        onExpand={() => setFloatOpen(true)}
      />
      {floatOpen && mapContainerRef ? (
        <FieldAttributesDashboardModal
              open={floatOpen}
              onClose={() => setFloatOpen(false)}
              containerRef={mapContainerRef}
              title="Attributes dashboard"
              subtitle={floatSubtitle || 'Example.xlsx attributes'}
            >
              <FieldAttributesDashboardBody
                {...bodyProps}
                layout="expanded"
                embedded
                showExpand={false}
              />
        </FieldAttributesDashboardModal>
      ) : null}
    </>
  )
}
