import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { useMemo, useState } from 'react'
import { Bar, Doughnut, Line, Pie } from 'react-chartjs-2'

import type { DevelopEliteDashboardConfig } from '../developEliteDashboardConfig'
import { builderSourceUrl, useBuilderFieldMap, useBuilderLayer } from './builderData'
import { builderFiltersFor, useBuilderSelections } from './BuilderSelectionContext'
import {
  applyBuilderFilters,
  builderCategories,
  builderDisplayValue,
  builderDistinctValues,
  builderStatistic,
  builderStatisticLabel,
  builderValueKey,
  formatBuilderNumber,
  type BuilderCategory,
  type BuilderRow,
} from './builderStats'
import { BuilderText } from './BuilderText'
import { BUILDER_PALETTE, builderElementKind, isEmbeddableUrl, type BuilderElementConfig } from './builderTypes'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend)

type Props = {
  element: BuilderElementConfig
  config: DevelopEliteDashboardConfig
  editMode: boolean
}

function Notice({ icon, children, tone = 'muted' }: { icon: string; children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div className={`deb-notice deb-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <i className={icon} aria-hidden />
      <span>{children}</span>
    </div>
  )
}

/** Shared selection behaviour for elements that act as filters. */
function useElementSelection(element: BuilderElementConfig, field: string) {
  const { selections, setSelection } = useBuilderSelections()
  const own = selections[element.id]
  const selected = useMemo(() => new Set(own?.field === field ? own.values : []), [field, own])
  const canAct = element.actionTargets !== 'none' && !!field
  const toggle = (key: string) => {
    if (!canAct || key === '__other__') return
    const next = new Set(element.multiSelect ? selected : selected.has(key) ? [key] : [])
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelection(element.id, next.size ? { field, values: [...next], targets: element.actionTargets === 'all' ? 'all' : (element.actionTargets as string[]) } : null)
  }
  const set = (keys: string[]) => {
    if (!canAct) return
    setSelection(element.id, keys.length ? { field, values: keys, targets: element.actionTargets === 'all' ? 'all' : (element.actionTargets as string[]) } : null)
  }
  return { selected, toggle, set, clear: () => setSelection(element.id, null), canAct }
}

function chartColors(cats: BuilderCategory[], base: string, selected: Set<string>, multi: boolean) {
  return cats.map((c, i) => {
    const color = multi ? BUILDER_PALETTE[i % BUILDER_PALETTE.length]! : base
    return selected.size && !selected.has(c.key) ? `${color}55` : color
  })
}

const AXIS = { ticks: { color: 'rgba(214, 236, 222, 0.75)', font: { size: 10 } }, grid: { color: 'rgba(120, 180, 140, 0.12)' } }

export function BuilderElementView({ element, config, editMode }: Props) {
  const kind = builderElementKind(element.type)
  const url = kind.needsData ? builderSourceUrl(element.source, config) : ''
  const layer = useBuilderLayer(url)
  const fieldMap = useBuilderFieldMap(layer.fields)
  const { selections, elements } = useBuilderSelections()
  const incoming = useMemo(() => builderFiltersFor(element.id, selections, elements), [element.id, elements, selections])
  const rows = useMemo(() => applyBuilderFilters(layer.rows, element.filters, incoming), [element.filters, incoming, layer.rows])
  const selection = useElementSelection(element, element.categoryField)
  const filteredByOthers = incoming.some(f => layer.rows[0] && f.field in layer.rows[0])

  const header =
    element.showTitle || selection.selected.size || filteredByOthers ? (
      <header className="deb-el__head">
        {element.showTitle ? <h3 className="deb-el__title" title={element.description || element.title}>{element.title}</h3> : <span />}
        <span className="deb-el__badges">
          {filteredByOthers ? (
            <span className="deb-chip" title="Filtered by a selection in another element">
              <i className="fa-solid fa-filter" aria-hidden /> Filtered
            </span>
          ) : null}
          {selection.selected.size ? (
            <button type="button" className="deb-chip deb-chip--action" onClick={selection.clear} title="Clear this selection">
              {selection.selected.size} selected <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          ) : null}
        </span>
      </header>
    ) : null

  let body: React.ReactNode
  if (kind.needsData && !url) {
    body = <Notice icon="fa-solid fa-database">{editMode ? 'Choose a data source in the properties panel.' : 'No data source.'}</Notice>
  } else if (kind.needsData && layer.loading && !layer.rows.length) {
    body = <Notice icon="fa-solid fa-spinner fa-spin">Loading data…</Notice>
  } else if (kind.needsData && layer.error) {
    body = <Notice icon="fa-solid fa-triangle-exclamation" tone="error">{layer.error}</Notice>
  } else {
    body = renderBody(element, rows, layer.rows.length, fieldMap, selection, editMode)
  }

  return (
    <section
      className={`deb-el deb-el--${element.type}`}
      style={{ ['--deb-accent' as string]: element.color }}
      aria-label={element.title}
    >
      {header}
      <div className="deb-el__body">{body}</div>
    </section>
  )
}

function renderBody(
  el: BuilderElementConfig,
  rows: BuilderRow[],
  totalRows: number,
  fields: Map<string, import('./builderStats').BuilderFieldInfo>,
  selection: ReturnType<typeof useElementSelection>,
  editMode: boolean,
) {
  const needsCategory = el.type === 'serial-chart' || el.type === 'pie-chart' || el.type === 'list' || el.type === 'category-selector'
  if (needsCategory && !el.categoryField) {
    return <Notice icon="fa-solid fa-sliders">{editMode ? 'Pick a category field in the properties panel.' : 'Not configured.'}</Notice>
  }
  if (el.statistic !== 'count' && !el.valueField && (el.type === 'indicator' || el.type === 'gauge' || el.type === 'serial-chart' || el.type === 'pie-chart' || el.type === 'list')) {
    return <Notice icon="fa-solid fa-sliders">{editMode ? `Pick a numeric field for “${builderStatisticLabel(el.statistic)}”.` : 'Not configured.'}</Notice>
  }

  switch (el.type) {
    case 'indicator':
      return <IndicatorBody el={el} rows={rows} />
    case 'gauge':
      return <GaugeBody el={el} rows={rows} />
    case 'serial-chart':
    case 'pie-chart':
      return <ChartBody el={el} rows={rows} fields={fields} selection={selection} />
    case 'list':
      return <ListBody el={el} rows={rows} fields={fields} selection={selection} />
    case 'category-selector':
      return <SelectorBody el={el} rows={rows} fields={fields} selection={selection} />
    case 'table':
      return <TableBody el={el} rows={rows} totalRows={totalRows} fields={fields} />
    case 'text':
      return (
        <div className="deb-text" style={{ textAlign: el.textAlign, fontSize: el.textSize }}>
          <BuilderText source={el.text} />
        </div>
      )
    case 'embed':
      if (!el.embedUrl) return <Notice icon="fa-solid fa-link">{editMode ? 'Enter an HTTPS page address in the properties panel.' : 'No page set.'}</Notice>
      if (!isEmbeddableUrl(el.embedUrl)) return <Notice icon="fa-solid fa-lock" tone="error">Only HTTPS pages can be embedded.</Notice>
      return (
        <iframe
          className={`deb-embed${editMode ? ' is-editing' : ''}`}
          src={el.embedUrl}
          title={el.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      )
    default:
      return null
  }
}

function IndicatorBody({ el, rows }: { el: BuilderElementConfig; rows: BuilderRow[] }) {
  const value = builderStatistic(rows, el.statistic, el.valueField)
  const reference = el.referenceStatistic === 'none' ? null : builderStatistic(rows, el.referenceStatistic, el.referenceField)
  const pct = value != null && reference ? (value / reference) * 100 : null
  return (
    <div className="deb-indicator">
      <div className="deb-indicator__main">
        {el.icon ? <i className={`${el.icon} deb-indicator__icon`} aria-hidden /> : null}
        <strong className="deb-indicator__value">{formatBuilderNumber(value, el.format)}</strong>
      </div>
      <span className="deb-indicator__sub">
        {pct != null ? `${pct.toFixed(1)}% of ${formatBuilderNumber(reference, el.format)}` : `${builderStatisticLabel(el.statistic)}${el.statistic === 'count' ? '' : ` of ${el.valueField}`}`}
      </span>
    </div>
  )
}

function GaugeBody({ el, rows }: { el: BuilderElementConfig; rows: BuilderRow[] }) {
  const value = builderStatistic(rows, el.statistic, el.valueField)
  const min = el.gaugeMin
  const max = el.gaugeMax > min ? el.gaugeMax : min + 1
  const t = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)))
  const r = 40
  const arc = (frac: number) => {
    const a = Math.PI * (1 - frac)
    return `${50 + r * Math.cos(a)} ${50 - r * Math.sin(a)}`
  }
  return (
    <div className="deb-gauge">
      <svg viewBox="0 0 100 64" role="img" aria-label={`${formatBuilderNumber(value, el.format)} (range ${min} to ${max})`} preserveAspectRatio="xMidYMid meet">
        <path d={`M 10 50 A ${r} ${r} 0 0 1 90 50`} className="deb-gauge__track" />
        {t > 0 ? <path d={`M 10 50 A ${r} ${r} 0 0 1 ${arc(t)}`} className="deb-gauge__fill" /> : null}
        <text x="50" y="47" textAnchor="middle" className="deb-gauge__value">
          {formatBuilderNumber(value, el.format)}
        </text>
        <text x="10" y="61" textAnchor="middle" className="deb-gauge__range">
          {formatBuilderNumber(min, el.format)}
        </text>
        <text x="90" y="61" textAnchor="middle" className="deb-gauge__range">
          {formatBuilderNumber(max, el.format)}
        </text>
      </svg>
    </div>
  )
}

type CatProps = {
  el: BuilderElementConfig
  rows: BuilderRow[]
  fields: Map<string, import('./builderStats').BuilderFieldInfo>
  selection: ReturnType<typeof useElementSelection>
}

function useCats({ el, rows, fields }: Pick<CatProps, 'el' | 'rows' | 'fields'>, withOther = true) {
  return useMemo(
    () =>
      builderCategories(rows, el.categoryField, el.statistic, el.valueField, {
        sort: el.sort,
        max: el.maxCategories,
        field: fields.get(el.categoryField),
        otherLabel: withOther ? 'Other' : null,
      }),
    [el.categoryField, el.maxCategories, el.sort, el.statistic, el.valueField, fields, rows, withOther],
  )
}

function ChartBody({ el, rows, fields, selection }: CatProps) {
  const cats = useCats({ el, rows, fields })
  if (!cats.length) return <Notice icon="fa-regular fa-chart-bar">No data for the current filters.</Notice>
  const isPie = el.type === 'pie-chart'
  const colors = chartColors(cats, el.color, selection.selected, isPie)
  const data = {
    labels: cats.map(c => c.label),
    datasets: [
      {
        label: builderStatisticLabel(el.statistic),
        data: cats.map(c => c.value),
        backgroundColor: colors,
        borderColor: isPie ? 'rgba(6, 22, 14, 0.9)' : el.chartKind === 'line' ? el.color : colors,
        borderWidth: isPie ? 1 : el.chartKind === 'line' ? 2 : 0,
        borderRadius: isPie ? 0 : 3,
        pointRadius: 3,
        tension: 0.25,
      },
    ],
  }
  const onClick: ChartOptions['onClick'] = (_e, elements) => {
    const idx = elements[0]?.index
    if (idx != null && cats[idx]) selection.toggle(cats[idx].key)
  }
  const tooltip = {
    callbacks: {
      label: (ctx: { raw: unknown; label?: string }) => ` ${formatBuilderNumber(Number(ctx.raw), el.format)}`,
    },
  }
  if (isPie) {
    const options: ChartOptions<'pie'> = {
      responsive: true,
      maintainAspectRatio: false,
      onClick,
      plugins: { legend: { position: 'right', labels: { color: 'rgba(214, 236, 222, 0.85)', boxWidth: 10, font: { size: 10 } } }, tooltip },
    }
    return (
      <div className={`deb-chart${selection.canAct ? ' is-interactive' : ''}`}>
        {el.donut ? <Doughnut data={data} options={options as unknown as ChartOptions<'doughnut'>} /> : <Pie data={data} options={options} />}
      </div>
    )
  }
  const horizontal = el.chartKind === 'bar'
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    onClick,
    plugins: { legend: { display: false }, tooltip },
    scales: { x: AXIS, y: { ...AXIS, beginAtZero: true } },
  }
  return (
    <div className={`deb-chart${selection.canAct ? ' is-interactive' : ''}`}>
      {el.chartKind === 'line' ? <Line data={data} options={options as unknown as ChartOptions<'line'>} /> : <Bar data={data} options={options} />}
    </div>
  )
}

function ListBody({ el, rows, fields, selection }: CatProps) {
  const cats = useCats({ el, rows, fields }, false)
  if (!cats.length) return <Notice icon="fa-solid fa-list">No items for the current filters.</Notice>
  const max = Math.max(...cats.map(c => c.value), 1)
  return (
    <ul className="deb-list">
      {cats.map(c => {
        const active = selection.selected.has(c.key)
        return (
          <li key={c.key}>
            <button
              type="button"
              className={`deb-list__item${active ? ' is-active' : ''}`}
              aria-pressed={active}
              disabled={!selection.canAct}
              onClick={() => selection.toggle(c.key)}
            >
              <span className="deb-list__label">{c.label}</span>
              <span className="deb-list__value">{formatBuilderNumber(c.value, el.format)}</span>
              <span className="deb-list__bar" style={{ width: `${(c.value / max) * 100}%` }} aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SelectorBody({ el, rows, fields, selection }: CatProps) {
  const values = useMemo(() => builderDistinctValues(rows, el.categoryField, fields.get(el.categoryField)), [el.categoryField, fields, rows])
  if (!values.length) return <Notice icon="fa-solid fa-filter">No values to choose from.</Notice>
  if (el.selectorStyle === 'buttons') {
    return (
      <div className="deb-selector deb-selector--buttons" role="group" aria-label={el.title}>
        <button type="button" className={`deb-pill${selection.selected.size === 0 ? ' is-active' : ''}`} onClick={selection.clear}>
          All
        </button>
        {values.map(v => (
          <button
            key={v.key}
            type="button"
            className={`deb-pill${selection.selected.has(v.key) ? ' is-active' : ''}`}
            aria-pressed={selection.selected.has(v.key)}
            onClick={() => selection.toggle(v.key)}
          >
            {v.label} <span className="deb-pill__count">{v.count}</span>
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className="deb-selector">
      <select
        className="deb-select"
        aria-label={el.title}
        multiple={el.multiSelect}
        value={el.multiSelect ? [...selection.selected] : ([...selection.selected][0] ?? '')}
        onChange={e => {
          const keys = el.multiSelect ? [...e.target.selectedOptions].map(o => o.value) : e.target.value ? [e.target.value] : []
          selection.set(keys)
        }}
      >
        {el.multiSelect ? null : <option value="">All ({rows.length})</option>}
        {values.map(v => (
          <option key={v.key} value={v.key}>
            {v.label} ({v.count})
          </option>
        ))}
      </select>
    </div>
  )
}

function TableBody({ el, rows, totalRows, fields }: { el: BuilderElementConfig; rows: BuilderRow[]; totalRows: number; fields: Map<string, import('./builderStats').BuilderFieldInfo> }) {
  const columns = useMemo(() => {
    const chosen = el.columns.filter(c => fields.has(c))
    return chosen.length ? chosen : [...fields.keys()].slice(0, 6)
  }, [el.columns, fields])
  const [sort, setSort] = useState<{ field: string; dir: 1 | -1 } | null>(null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const f = fields.get(sort.field)
    return [...rows].sort((a, b) => {
      const av = a[sort.field]
      const bv = b[sort.field]
      if (f?.type === 'number' || f?.type === 'date') return ((Number(av) || 0) - (Number(bv) || 0)) * sort.dir
      return builderValueKey(av).localeCompare(builderValueKey(bv), undefined, { numeric: true }) * sort.dir
    })
  }, [fields, rows, sort])
  const LIMIT = 500
  if (!columns.length) return <Notice icon="fa-solid fa-table">This layer has no fields to show.</Notice>
  return (
    <div className="deb-table-wrap">
      <table className="deb-table">
        <thead>
          <tr>
            {columns.map(c => {
              const active = sort?.field === c
              return (
                <th key={c} aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => setSort(s => (s?.field === c ? (s.dir === 1 ? { field: c, dir: -1 } : null) : { field: c, dir: 1 }))}>
                    {fields.get(c)?.alias ?? c}
                    <i className={`fa-solid ${active ? (sort!.dir === 1 ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`} aria-hidden />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, LIMIT).map((row, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c}>{builderDisplayValue(row[c], fields.get(c))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="deb-table__foot">
        {rows.length > LIMIT ? `Showing ${LIMIT} of ${rows.length}` : `${rows.length} rows`}
        {rows.length !== totalRows ? ` (filtered from ${totalRows})` : ''}
      </p>
    </div>
  )
}
