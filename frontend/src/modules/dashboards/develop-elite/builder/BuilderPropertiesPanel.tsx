import { useId, useMemo, useState, type ReactNode } from 'react'

import type { DevelopEliteDashboardConfig } from '../developEliteDashboardConfig'
import { builderCatalogSources, builderSourceUrl, useBuilderLayer } from './builderData'
import { builderDistinctValues, builderStatisticLabel, type BuilderFieldInfo } from './builderStats'
import {
  BUILDER_PALETTE,
  builderElementKind,
  isEmbeddableUrl,
  type BuilderElementConfig,
  type BuilderFilterOperator,
  type BuilderStatistic,
} from './builderTypes'

type Props = {
  element: BuilderElementConfig
  config: DevelopEliteDashboardConfig
  otherElements: { id: string; title: string }[]
  onChange: (patch: Partial<BuilderElementConfig>) => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
}

const STATS: BuilderStatistic[] = ['count', 'sum', 'avg', 'min', 'max']
const OPS: { value: BuilderFilterOperator; label: string }[] = [
  { value: '=', label: 'is' },
  { value: '!=', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: 'empty', label: 'is empty' },
  { value: 'not-empty', label: 'is not empty' },
]
const ICONS = [
  'fa-solid fa-layer-group',
  'fa-solid fa-seedling',
  'fa-solid fa-leaf',
  'fa-solid fa-tree',
  'fa-solid fa-warehouse',
  'fa-solid fa-droplet',
  'fa-solid fa-map-location-dot',
  'fa-solid fa-ruler-combined',
  'fa-solid fa-tractor',
  'fa-solid fa-sun',
  'fa-solid fa-chart-line',
  'fa-solid fa-flag',
]

function Row({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId()
  return (
    <div className="deb-prop">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <span className="deb-prop__hint">{hint}</span> : null}
    </div>
  )
}

function FieldSelect({
  id,
  fields,
  value,
  onChange,
  numericOnly,
  placeholder = 'Choose a field',
  ariaLabel,
}: {
  id: string
  fields: BuilderFieldInfo[]
  value: string
  onChange: (v: string) => void
  numericOnly?: boolean
  placeholder?: string
  ariaLabel?: string
}) {
  const list = numericOnly ? fields.filter(f => f.type === 'number') : fields
  const missing = value && !list.some(f => f.name === value)
  return (
    <select id={id} className="deb-input" value={value} onChange={e => onChange(e.target.value)} aria-label={ariaLabel}>
      <option value="">{placeholder}</option>
      {missing ? <option value={value}>{value} (not in layer)</option> : null}
      {list.map(f => (
        <option key={f.name} value={f.name}>
          {f.alias !== f.name ? `${f.alias} (${f.name})` : f.name}
        </option>
      ))}
    </select>
  )
}

type Tab = 'data' | 'display' | 'actions'

export function BuilderPropertiesPanel({ element: el, config, otherElements, onChange, onDuplicate, onDelete, onClose }: Props) {
  const kind = builderElementKind(el.type)
  const [tab, setTab] = useState<Tab>(kind.needsData ? 'data' : 'display')
  const sources = useMemo(() => builderCatalogSources(config), [config])
  const url = kind.needsData ? builderSourceUrl(el.source, config) : ''
  const layer = useBuilderLayer(url)
  const fields = layer.fields
  const tabs: Tab[] = [...(kind.needsData ? (['data'] as Tab[]) : []), 'display', ...(kind.selectable ? (['actions'] as Tab[]) : [])]
  const activeTab = tabs.includes(tab) ? tab : tabs[0]!
  const usesValue = el.type === 'indicator' || el.type === 'gauge' || el.type === 'serial-chart' || el.type === 'pie-chart' || el.type === 'list'
  const usesCategory = el.type === 'serial-chart' || el.type === 'pie-chart' || el.type === 'list' || el.type === 'category-selector'
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <aside className="deb-panel deb-panel--props" aria-label={`${kind.label} properties`}>
      <header className="deb-panel__head">
        <span className="deb-panel__kind">
          <i className={kind.icon} aria-hidden /> {kind.label}
        </span>
        <button type="button" className="deb-icon-btn" onClick={onClose} aria-label="Close properties" title="Close">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="deb-prop deb-prop--title">
        <input
          className="deb-input deb-input--title"
          value={el.title}
          onChange={e => onChange({ title: e.target.value })}
          aria-label="Element title"
          placeholder="Title"
        />
        <label className="deb-check">
          <input type="checkbox" checked={el.showTitle} onChange={e => onChange({ showTitle: e.target.checked })} /> Show title
        </label>
      </div>

      {tabs.length > 1 ? (
        <div className="deb-tabs" role="tablist">
          {tabs.map(t => (
            <button key={t} type="button" role="tab" aria-selected={activeTab === t} className={`deb-tab${activeTab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>
              {t === 'data' ? 'Data' : t === 'display' ? 'Display' : 'Actions'}
            </button>
          ))}
        </div>
      ) : null}

      <div className="deb-panel__scroll">
        {activeTab === 'data' ? (
          <>
            <Row label="Data source">
              {id => (
                <select
                  id={id}
                  className="deb-input"
                  value={el.source?.kind === 'url' ? '__url__' : el.source?.key ?? ''}
                  onChange={e =>
                    onChange({
                      source: e.target.value === '__url__' ? { kind: 'url', url: el.source?.kind === 'url' ? el.source.url : '' } : { kind: 'catalog', key: e.target.value },
                      valueField: '',
                      categoryField: '',
                      columns: [],
                      filters: [],
                    })
                  }
                >
                  {sources.map(s => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                  <option value="__url__">Custom ArcGIS layer URL…</option>
                </select>
              )}
            </Row>
            {el.source?.kind === 'url' ? (
              <Row label="Layer URL" hint="A FeatureServer or MapServer layer/table, e.g. …/FeatureServer/0">
                {id => (
                  <input
                    id={id}
                    className="deb-input"
                    type="url"
                    placeholder="https://services.arcgis.com/…/FeatureServer/0"
                    value={el.source?.kind === 'url' ? el.source.url : ''}
                    onChange={e => onChange({ source: { kind: 'url', url: e.target.value } })}
                  />
                )}
              </Row>
            ) : null}
            <p className={`deb-source-status${layer.error ? ' is-error' : ''}`} role="status">
              {!url
                ? 'No layer selected.'
                : layer.loading
                  ? 'Loading layer…'
                  : layer.error
                    ? layer.error
                    : `${layer.rows.length.toLocaleString()} records · ${fields.length} fields`}
            </p>

            {usesCategory ? (
              <Row label={el.type === 'category-selector' ? 'Field to filter by' : 'Category field'}>
                {id => <FieldSelect id={id} fields={fields} value={el.categoryField} onChange={v => onChange({ categoryField: v })} />}
              </Row>
            ) : null}
            {usesValue ? (
              <>
                <Row label="Statistic">
                  {id => (
                    <select id={id} className="deb-input" value={el.statistic} onChange={e => onChange({ statistic: e.target.value as BuilderStatistic })}>
                      {STATS.map(s => (
                        <option key={s} value={s}>
                          {s === 'count' ? 'Count of records' : builderStatisticLabel(s)}
                        </option>
                      ))}
                    </select>
                  )}
                </Row>
                {el.statistic !== 'count' ? (
                  <Row label="Value field">
                    {id => <FieldSelect id={id} fields={fields} value={el.valueField} onChange={v => onChange({ valueField: v })} numericOnly placeholder="Choose a numeric field" />}
                  </Row>
                ) : null}
              </>
            ) : null}
            {el.type === 'serial-chart' || el.type === 'pie-chart' || el.type === 'list' ? (
              <div className="deb-prop-row">
                <Row label="Sort">
                  {id => (
                    <select id={id} className="deb-input" value={el.sort} onChange={e => onChange({ sort: e.target.value as BuilderElementConfig['sort'] })}>
                      <option value="value-desc">Value, high → low</option>
                      <option value="value-asc">Value, low → high</option>
                      <option value="label-asc">Name, A → Z</option>
                      <option value="label-desc">Name, Z → A</option>
                    </select>
                  )}
                </Row>
                <Row label="Max categories">
                  {id => (
                    <input id={id} className="deb-input" type="number" min={1} max={100} value={el.maxCategories} onChange={e => onChange({ maxCategories: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
                  )}
                </Row>
              </div>
            ) : null}
            {el.type === 'indicator' ? (
              <>
                <Row label="Compare with (reference)" hint="Shows the value as a percentage of this reference.">
                  {id => (
                    <select id={id} className="deb-input" value={el.referenceStatistic} onChange={e => onChange({ referenceStatistic: e.target.value as BuilderElementConfig['referenceStatistic'] })}>
                      <option value="none">No reference</option>
                      {STATS.map(s => (
                        <option key={s} value={s}>
                          {s === 'count' ? 'Count of records' : builderStatisticLabel(s)}
                        </option>
                      ))}
                    </select>
                  )}
                </Row>
                {el.referenceStatistic !== 'none' && el.referenceStatistic !== 'count' ? (
                  <Row label="Reference field">
                    {id => <FieldSelect id={id} fields={fields} value={el.referenceField} onChange={v => onChange({ referenceField: v })} numericOnly />}
                  </Row>
                ) : null}
              </>
            ) : null}
            {el.type === 'gauge' ? (
              <div className="deb-prop-row">
                <Row label="Minimum">
                  {id => <input id={id} className="deb-input" type="number" value={el.gaugeMin} onChange={e => onChange({ gaugeMin: Number(e.target.value) || 0 })} />}
                </Row>
                <Row label="Maximum">
                  {id => <input id={id} className="deb-input" type="number" value={el.gaugeMax} onChange={e => onChange({ gaugeMax: Number(e.target.value) || 0 })} />}
                </Row>
              </div>
            ) : null}
            {el.type === 'table' ? (
              <div className="deb-prop">
                <span className="deb-prop__label">Columns</span>
                <div className="deb-checklist">
                  {fields.map(f => (
                    <label key={f.name} className="deb-check">
                      <input
                        type="checkbox"
                        checked={el.columns.includes(f.name)}
                        onChange={e => onChange({ columns: e.target.checked ? [...el.columns, f.name] : el.columns.filter(c => c !== f.name) })}
                      />
                      {f.alias}
                    </label>
                  ))}
                  {!fields.length ? <span className="deb-prop__hint">Fields appear once the layer loads.</span> : null}
                </div>
                <span className="deb-prop__hint">{el.columns.length ? `${el.columns.length} selected` : 'None selected — the first 6 fields are shown.'}</span>
              </div>
            ) : null}
            <FilterEditor el={el} fields={fields} rows={layer.rows} onChange={onChange} />
          </>
        ) : null}

        {activeTab === 'display' ? (
          <>
            <Row label="Description" hint="Shown as a tooltip on the title.">
              {id => <input id={id} className="deb-input" value={el.description} onChange={e => onChange({ description: e.target.value })} />}
            </Row>
            {el.type !== 'text' && el.type !== 'embed' && el.type !== 'table' && el.type !== 'category-selector' ? (
              <div className="deb-prop">
                <span className="deb-prop__label">Color</span>
                <div className="deb-swatches">
                  {BUILDER_PALETTE.map(c => (
                    <button key={c} type="button" className={`deb-swatch${el.color === c ? ' is-active' : ''}`} style={{ background: c }} onClick={() => onChange({ color: c })} aria-label={`Color ${c}`} aria-pressed={el.color === c} />
                  ))}
                  <input type="color" value={el.color.length === 7 ? el.color : '#22c55e'} onChange={e => onChange({ color: e.target.value })} aria-label="Custom color" />
                </div>
              </div>
            ) : null}
            {el.type === 'indicator' ? (
              <div className="deb-prop">
                <span className="deb-prop__label">Icon</span>
                <div className="deb-icons">
                  <button type="button" className={`deb-icon-choice${!el.icon ? ' is-active' : ''}`} onClick={() => onChange({ icon: '' })} aria-label="No icon">
                    <i className="fa-solid fa-ban" aria-hidden />
                  </button>
                  {ICONS.map(ic => (
                    <button key={ic} type="button" className={`deb-icon-choice${el.icon === ic ? ' is-active' : ''}`} onClick={() => onChange({ icon: ic })} aria-label={ic.replace('fa-solid fa-', '')} aria-pressed={el.icon === ic}>
                      <i className={ic} aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {el.type === 'serial-chart' ? (
              <Row label="Chart type">
                {id => (
                  <select id={id} className="deb-input" value={el.chartKind} onChange={e => onChange({ chartKind: e.target.value as BuilderElementConfig['chartKind'] })}>
                    <option value="column">Columns (vertical)</option>
                    <option value="bar">Bars (horizontal)</option>
                    <option value="line">Line</option>
                  </select>
                )}
              </Row>
            ) : null}
            {el.type === 'pie-chart' ? (
              <label className="deb-check">
                <input type="checkbox" checked={el.donut} onChange={e => onChange({ donut: e.target.checked })} /> Donut (hollow centre)
              </label>
            ) : null}
            {el.type === 'category-selector' ? (
              <>
                <Row label="Style">
                  {id => (
                    <select id={id} className="deb-input" value={el.selectorStyle} onChange={e => onChange({ selectorStyle: e.target.value as BuilderElementConfig['selectorStyle'] })}>
                      <option value="dropdown">Dropdown</option>
                      <option value="buttons">Buttons</option>
                    </select>
                  )}
                </Row>
                <label className="deb-check">
                  <input type="checkbox" checked={el.multiSelect} onChange={e => onChange({ multiSelect: e.target.checked })} /> Allow several values
                </label>
              </>
            ) : null}
            {usesValue || el.type === 'gauge' ? (
              <div className="deb-prop">
                <span className="deb-prop__label">Number format</span>
                <div className="deb-prop-row deb-prop-row--4">
                  <input className="deb-input" type="number" min={0} max={6} value={el.format.decimals} onChange={e => onChange({ format: { ...el.format, decimals: Math.max(0, Math.min(6, Number(e.target.value) || 0)) } })} aria-label="Decimals" title="Decimals" />
                  <input className="deb-input" value={el.format.prefix} onChange={e => onChange({ format: { ...el.format, prefix: e.target.value } })} placeholder="Prefix" aria-label="Prefix" />
                  <input className="deb-input" value={el.format.suffix} onChange={e => onChange({ format: { ...el.format, suffix: e.target.value } })} placeholder="Suffix" aria-label="Suffix" />
                </div>
                <label className="deb-check">
                  <input type="checkbox" checked={el.format.compact} onChange={e => onChange({ format: { ...el.format, compact: e.target.checked } })} /> Abbreviate (12.4K, 3.1M)
                </label>
              </div>
            ) : null}
            {el.type === 'text' ? (
              <>
                <Row label="Text" hint="# Heading, **bold**, *italic*, - list item">
                  {id => <textarea id={id} className="deb-input deb-input--area" rows={8} value={el.text} onChange={e => onChange({ text: e.target.value })} />}
                </Row>
                <div className="deb-prop-row">
                  <Row label="Alignment">
                    {id => (
                      <select id={id} className="deb-input" value={el.textAlign} onChange={e => onChange({ textAlign: e.target.value as BuilderElementConfig['textAlign'] })}>
                        <option value="start">Start</option>
                        <option value="center">Center</option>
                        <option value="end">End</option>
                      </select>
                    )}
                  </Row>
                  <Row label="Size (px)">
                    {id => <input id={id} className="deb-input" type="number" min={10} max={48} value={el.textSize} onChange={e => onChange({ textSize: Math.max(10, Math.min(48, Number(e.target.value) || 14)) })} />}
                  </Row>
                </div>
              </>
            ) : null}
            {el.type === 'embed' ? (
              <Row label="Page address (HTTPS)" hint={el.embedUrl && !isEmbeddableUrl(el.embedUrl) ? 'Must start with https://' : 'Some sites refuse to be embedded; they will show a blank frame.'}>
                {id => <input id={id} className="deb-input" type="url" placeholder="https://…" value={el.embedUrl} onChange={e => onChange({ embedUrl: e.target.value })} />}
              </Row>
            ) : null}
          </>
        ) : null}

        {activeTab === 'actions' ? (
          <div className="deb-prop">
            <span className="deb-prop__label">When a value is selected here</span>
            <label className="deb-check">
              <input type="radio" name={`act-${el.id}`} checked={el.actionTargets === 'none'} onChange={() => onChange({ actionTargets: 'none' })} /> Do nothing
            </label>
            <label className="deb-check">
              <input type="radio" name={`act-${el.id}`} checked={el.actionTargets === 'all'} onChange={() => onChange({ actionTargets: 'all' })} /> Filter every element that has the field “{el.categoryField || '…'}”
            </label>
            <label className="deb-check">
              <input type="radio" name={`act-${el.id}`} checked={Array.isArray(el.actionTargets)} onChange={() => onChange({ actionTargets: [] })} /> Filter only these elements:
            </label>
            {Array.isArray(el.actionTargets) ? (
              <div className="deb-checklist deb-checklist--indent">
                {otherElements.map(o => (
                  <label key={o.id} className="deb-check">
                    <input
                      type="checkbox"
                      checked={(el.actionTargets as string[]).includes(o.id)}
                      onChange={e => {
                        const cur = el.actionTargets as string[]
                        onChange({ actionTargets: e.target.checked ? [...cur, o.id] : cur.filter(t => t !== o.id) })
                      }}
                    />
                    {o.title}
                  </label>
                ))}
                {!otherElements.length ? <span className="deb-prop__hint">Add more elements to target them.</span> : null}
              </div>
            ) : null}
            <span className="deb-prop__hint">Targets need the same field in their data. Click the selected value again (or the chip in the title) to clear.</span>
          </div>
        ) : null}
      </div>

      <footer className="deb-panel__foot">
        <button type="button" className="deb-btn" onClick={onDuplicate}>
          <i className="fa-regular fa-copy" aria-hidden /> Duplicate
        </button>
        {confirmDelete ? (
          <span className="deb-confirm">
            <button type="button" className="deb-btn deb-btn--danger" onClick={onDelete}>
              Delete
            </button>
            <button type="button" className="deb-btn" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="deb-btn deb-btn--danger-ghost" onClick={() => setConfirmDelete(true)}>
            <i className="fa-regular fa-trash-can" aria-hidden /> Delete
          </button>
        )}
      </footer>
    </aside>
  )
}

function FilterEditor({
  el,
  fields,
  rows,
  onChange,
}: {
  el: BuilderElementConfig
  fields: BuilderFieldInfo[]
  rows: Record<string, unknown>[]
  onChange: (patch: Partial<BuilderElementConfig>) => void
}) {
  const listId = useId()
  const update = (i: number, patch: Partial<BuilderElementConfig['filters'][number]>) =>
    onChange({ filters: el.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  return (
    <div className="deb-prop">
      <span className="deb-prop__label">Filter records</span>
      {el.filters.map((f, i) => {
        const fieldInfo = fields.find(x => x.name === f.field)
        const values = builderDistinctValues(rows, f.field, fieldInfo, 200)
        return (
          <div key={i} className="deb-filter">
            <FieldSelect id={`${listId}-f${i}`} fields={fields} value={f.field} onChange={v => update(i, { field: v, value: '' })} ariaLabel="Filter field" />
            <select className="deb-input" value={f.op} onChange={e => update(i, { op: e.target.value as BuilderFilterOperator })} aria-label="Condition">
              {OPS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {f.op === 'empty' || f.op === 'not-empty' ? (
              <span />
            ) : (
              <>
                <input className="deb-input" list={`${listId}-v${i}`} value={f.value} onChange={e => update(i, { value: e.target.value })} aria-label="Value" placeholder="Value" />
                <datalist id={`${listId}-v${i}`}>
                  {values.map(v => (
                    <option key={v.key} value={v.key}>
                      {v.label}
                    </option>
                  ))}
                </datalist>
              </>
            )}
            <button type="button" className="deb-icon-btn" onClick={() => onChange({ filters: el.filters.filter((_, j) => j !== i) })} aria-label="Remove condition" title="Remove">
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
        )
      })}
      <button type="button" className="deb-btn deb-btn--ghost" onClick={() => onChange({ filters: [...el.filters, { field: fields[0]?.name ?? '', op: '=', value: '' }] })} disabled={!fields.length}>
        <i className="fa-solid fa-plus" aria-hidden /> Add condition
      </button>
      {el.filters.length > 1 ? <span className="deb-prop__hint">Records must match every condition.</span> : null}
    </div>
  )
}

/** Properties for the built-in widgets (map, KPIs, lists…): settings link + remove. */
export function BuilderBuiltInPanel({
  label,
  canRemove,
  onOpenSettings,
  onRemove,
  onClose,
}: {
  label: string
  canRemove: boolean
  onOpenSettings: () => void
  onRemove: () => void
  onClose: () => void
}) {
  return (
    <aside className="deb-panel deb-panel--props" aria-label={`${label} properties`}>
      <header className="deb-panel__head">
        <span className="deb-panel__kind">
          <i className="fa-solid fa-cube" aria-hidden /> Built-in widget
        </span>
        <button type="button" className="deb-icon-btn" onClick={onClose} aria-label="Close properties" title="Close">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="deb-panel__scroll">
        <h3 className="deb-builtin-title">{label}</h3>
        <p className="deb-panel__hint">This widget is part of the AgroCloud dashboard. Its data and look are set in Dashboard settings. Drag its header to move it; drag an edge to resize.</p>
        <button type="button" className="deb-btn deb-btn--primary" onClick={onOpenSettings}>
          <i className="fa-solid fa-sliders" aria-hidden /> Open settings
        </button>
      </div>
      {canRemove ? (
        <footer className="deb-panel__foot">
          <button type="button" className="deb-btn deb-btn--danger-ghost" onClick={onRemove}>
            <i className="fa-regular fa-eye-slash" aria-hidden /> Remove from dashboard
          </button>
        </footer>
      ) : null}
    </aside>
  )
}
