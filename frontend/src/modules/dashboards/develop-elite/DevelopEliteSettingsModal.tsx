import { useEffect, useState } from 'react'
import { listDevelopEliteBasemapEntries } from '@/modules/gis/map/BasemapGallery'
import { DEFAULT_DEVELOP_ELITE_CHART_PALETTE } from './developEliteChartsConfig'
import {
  DEFAULT_DEVELOP_ELITE_CONFIG,
  DEFAULT_DEVELOP_ELITE_TABLE_COLUMNS,
  type DevelopEliteDashboardConfig,
} from './developEliteDashboardConfig'
import { normalizeDevelopEliteDashboardDataSources } from './developEliteDataSourceRegistry'
import { DevelopEliteSettingsDataTab } from './DevelopEliteSettingsDataTab'

type TabId = 'data' | 'kpi' | 'charts' | 'map' | 'appearance'

const TABS: { id: TabId; label: string }[] = [
  { id: 'data', label: 'Data' },
  { id: 'kpi', label: 'KPI Cards' },
  { id: 'charts', label: 'Charts' },
  { id: 'map', label: 'Map Layer' },
  { id: 'appearance', label: 'Appearance' },
]

function patchLayout<K extends keyof DevelopEliteDashboardConfig['layout']>(
  draft: DevelopEliteDashboardConfig,
  key: K,
  value: DevelopEliteDashboardConfig['layout'][K],
): DevelopEliteDashboardConfig {
  return { ...draft, layout: { ...draft.layout, [key]: value } }
}

function patchCharts<K extends keyof DevelopEliteDashboardConfig['charts']>(
  draft: DevelopEliteDashboardConfig,
  key: K,
  value: DevelopEliteDashboardConfig['charts'][K],
): DevelopEliteDashboardConfig {
  return { ...draft, charts: { ...draft.charts, [key]: value } }
}

function AppearanceRange({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (n: number) => void
}) {
  return (
    <label className="develop-elite-settings__range">
      <span className="develop-elite-settings__range-head">
        <span>{label}</span>
        <strong>{value}{unit ?? ''}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
    </label>
  )
}

type Props = {
  open: boolean
  config: DevelopEliteDashboardConfig
  initialTab?: TabId
  onClose: () => void
  onSave: (config: DevelopEliteDashboardConfig) => void
}

export function DevelopEliteSettingsModal({ open, config, initialTab, onClose, onSave }: Props) {
  const [tab, setTab] = useState<TabId>('data')
  const [draft, setDraft] = useState(config)

  useEffect(() => {
    if (open) {
      setDraft(config)
      setTab(initialTab ?? 'data')
    }
  }, [open, config, initialTab])

  if (!open) return null

  const basemaps = listDevelopEliteBasemapEntries()

  return (
    <div className="develop-elite-settings" role="dialog" aria-modal="true" aria-label="Dashboard settings">
      <button type="button" className="develop-elite-settings__backdrop" aria-label="Close" onClick={onClose} />
      <div
        className={`develop-elite-settings__panel${tab === 'data' ? ' develop-elite-settings__panel--data' : ''}`}
      >
        <header className="develop-elite-settings__head">
          <h2>Settings</h2>
          <button type="button" className="develop-elite-settings__close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>
        <nav className="develop-elite-settings__tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={tab === t.id ? 'is-active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="develop-elite-settings__body">
          {tab === 'data' ? (
            <DevelopEliteSettingsDataTab draft={draft} onChange={setDraft} />
          ) : null}
          {tab === 'kpi' ? (
            <div className="develop-elite-settings__kpi-list">
              {draft.kpiCards.map(card => (
                <label key={card.id} className="develop-elite-settings__kpi-row">
                  <input
                    type="checkbox"
                    checked={card.visible}
                    onChange={e =>
                      setDraft(d => ({
                        ...d,
                        kpiCards: d.kpiCards.map(c =>
                          c.id === card.id ? { ...c, visible: e.target.checked } : c,
                        ),
                      }))
                    }
                  />
                  <span>{card.title}</span>
                </label>
              ))}
            </div>
          ) : null}
          {tab === 'charts' ? (
            <div className="develop-elite-settings__layout">
              <label className="develop-elite-settings__field">
                <span>Chart group field (statistics)</span>
                <input
                  type="text"
                  value={draft.chartGroupField}
                  onChange={e => setDraft(d => ({ ...d, chartGroupField: e.target.value }))}
                />
              </label>
              <label className="develop-elite-settings__field">
                <span>Chart value field (sum per group)</span>
                <input
                  type="text"
                  value={draft.chartValueField}
                  placeholder="Total_Tree"
                  onChange={e => setDraft(d => ({ ...d, chartValueField: e.target.value }))}
                />
              </label>
              <label className="develop-elite-settings__field">
                <span>Chart value label (pie / bar caption)</span>
                <input
                  type="text"
                  value={draft.chartValueLabel}
                  placeholder="Per Tons"
                  onChange={e => setDraft(d => ({ ...d, chartValueLabel: e.target.value }))}
                />
              </label>
              <AppearanceRange
                label="Pie chart — max categories"
                value={draft.charts.pieMaxSlices}
                min={3}
                max={16}
                step={1}
                onChange={n => setDraft(d => patchCharts(d, 'pieMaxSlices', n))}
              />
              <AppearanceRange
                label="Bar chart — max categories"
                value={draft.charts.barMaxSlices}
                min={3}
                max={20}
                step={1}
                onChange={n => setDraft(d => patchCharts(d, 'barMaxSlices', n))}
              />
              <label className="develop-elite-settings__kpi-row">
                <input
                  type="checkbox"
                  checked={draft.charts.sortByValueDesc}
                  onChange={e =>
                    setDraft(d => patchCharts(d, 'sortByValueDesc', e.target.checked))
                  }
                />
                <span>Sort by value (largest first)</span>
              </label>
              <label className="develop-elite-settings__kpi-row">
                <input
                  type="checkbox"
                  checked={draft.charts.groupRemainderAsOther}
                  onChange={e =>
                    setDraft(d => patchCharts(d, 'groupRemainderAsOther', e.target.checked))
                  }
                />
                <span>Group extra categories as &quot;Other&quot;</span>
              </label>
              <p className="develop-elite-settings__hint">Colors</p>
              <div className="develop-elite-settings__palette">
                {draft.charts.palette.map((color, index) => (
                  <label key={index} className="develop-elite-settings__palette-swatch">
                    <span className="visually-hidden">Color {index + 1}</span>
                    <input
                      type="color"
                      value={color}
                      onChange={e => {
                        const next = [...draft.charts.palette]
                        next[index] = e.target.value
                        setDraft(d => patchCharts(d, 'palette', next))
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="develop-elite-settings__btn is-muted develop-elite-settings__btn--inline"
                onClick={() =>
                  setDraft(d => patchCharts(d, 'palette', [...DEFAULT_DEVELOP_ELITE_CHART_PALETTE]))
                }
              >
                Reset palette
              </button>
              <label className="develop-elite-settings__field develop-elite-settings__field--color">
                <span>Legend / label color</span>
                <input
                  type="color"
                  value={draft.charts.labelColor.startsWith('#') ? draft.charts.labelColor : '#c8d6cc'}
                  onChange={e => setDraft(d => patchCharts(d, 'labelColor', e.target.value))}
                />
              </label>
              <label className="develop-elite-settings__field develop-elite-settings__field--color">
                <span>Axis color</span>
                <input
                  type="color"
                  value={draft.charts.axisColor.startsWith('#') ? draft.charts.axisColor : '#a7f3d0'}
                  onChange={e => setDraft(d => patchCharts(d, 'axisColor', e.target.value))}
                />
              </label>
              <label className="develop-elite-settings__field develop-elite-settings__field--color">
                <span>Category tick color</span>
                <input
                  type="color"
                  value={draft.charts.tickColor.startsWith('#') ? draft.charts.tickColor : '#ecfdf5'}
                  onChange={e => setDraft(d => patchCharts(d, 'tickColor', e.target.value))}
                />
              </label>
              <p className="develop-elite-settings__hint">Typography</p>
              <label className="develop-elite-settings__field">
                <span>Font family</span>
                <select
                  value={draft.charts.fontFamily}
                  onChange={e => setDraft(d => patchCharts(d, 'fontFamily', e.target.value))}
                >
                  <option value="'Segoe UI', system-ui, sans-serif">Segoe UI</option>
                  <option value="'Inter', system-ui, sans-serif">Inter</option>
                  <option value="'Roboto', system-ui, sans-serif">Roboto</option>
                  <option value="'Cairo', 'Segoe UI', sans-serif">Cairo (Arabic)</option>
                  <option value="'Tajawal', 'Segoe UI', sans-serif">Tajawal (Arabic)</option>
                </select>
              </label>
              <AppearanceRange
                label="Legend font size"
                value={draft.charts.legendFontPx}
                min={7}
                max={16}
                step={1}
                unit="px"
                onChange={n => setDraft(d => patchCharts(d, 'legendFontPx', n))}
              />
              <AppearanceRange
                label="Axis font size"
                value={draft.charts.axisFontPx}
                min={7}
                max={16}
                step={1}
                unit="px"
                onChange={n => setDraft(d => patchCharts(d, 'axisFontPx', n))}
              />
              <AppearanceRange
                label="Table font size"
                value={draft.charts.tableFontPx}
                min={7}
                max={14}
                step={1}
                unit="px"
                onChange={n => setDraft(d => patchCharts(d, 'tableFontPx', n))}
              />
              <p className="develop-elite-settings__hint">
                Table columns: {DEFAULT_DEVELOP_ELITE_TABLE_COLUMNS.join(', ')}
              </p>
            </div>
          ) : null}
          {tab === 'map' ? (
            <label className="develop-elite-settings__field">
              <span>Basemap</span>
              <select
                value={draft.basemapId}
                onChange={e => setDraft(d => ({ ...d, basemapId: e.target.value }))}
              >
                {basemaps.map(b => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          {tab === 'appearance' ? (
            <div className="develop-elite-settings__layout">
              <p className="develop-elite-settings__hint">Borders &amp; lines</p>
              <label className="develop-elite-settings__field develop-elite-settings__field--color">
                <span>Line / border color</span>
                <input
                  type="color"
                  value={draft.layout.themeBorderColor}
                  onChange={e =>
                    setDraft(d => patchLayout(d, 'themeBorderColor', e.target.value))
                  }
                />
              </label>
              <AppearanceRange
                label="Line / border width"
                value={draft.layout.themeBorderWidthPx}
                min={1}
                max={4}
                step={1}
                unit="px"
                onChange={n => setDraft(d => patchLayout(d, 'themeBorderWidthPx', n))}
              />
              <p className="develop-elite-settings__hint">Icons</p>
              <label className="develop-elite-settings__field develop-elite-settings__field--color">
                <span>Icon color</span>
                <input
                  type="color"
                  value={draft.layout.themeIconColor}
                  onChange={e => setDraft(d => patchLayout(d, 'themeIconColor', e.target.value))}
                />
              </label>
              <label className="develop-elite-settings__kpi-row">
                <input
                  type="checkbox"
                  checked={draft.layout.themeIconsUnified}
                  onChange={e =>
                    setDraft(d => patchLayout(d, 'themeIconsUnified', e.target.checked))
                  }
                />
                <span>Use one icon color across dashboard (KPI, structure, map tools)</span>
              </label>
              <AppearanceRange
                label="General icon size (structure, map tools, brand)"
                value={draft.layout.themeIconSizePx}
                min={10}
                max={40}
                step={1}
                unit="px"
                onChange={n => setDraft(d => patchLayout(d, 'themeIconSizePx', n))}
              />
              <AppearanceRange
                label="KPI card icon size"
                value={draft.layout.kpiIconFontPx}
                min={14}
                max={32}
                step={1}
                unit="px"
                onChange={n => setDraft(d => patchLayout(d, 'kpiIconFontPx', n))}
              />
            </div>
          ) : null}
        </div>
        <footer className="develop-elite-settings__foot">
          <button
            type="button"
            className="develop-elite-settings__btn is-muted"
            onClick={() => setDraft({ ...DEFAULT_DEVELOP_ELITE_CONFIG })}
          >
            Reset defaults
          </button>
          <button
            type="button"
            className="develop-elite-settings__btn is-primary"
            onClick={() => {
              onSave(normalizeDevelopEliteDashboardDataSources(draft))
              onClose()
            }}
          >
            Save &amp; reload
          </button>
        </footer>
      </div>
    </div>
  )
}
