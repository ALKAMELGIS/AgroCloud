import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { appAlert } from '../../../lib/appDialog'
import type { GisContentRow } from '../../master/gisContentPortalData'
import type {
  AgroCloudDashboardAggregation,
  AgroCloudDashboardConfig,
  AgroCloudDashboardElement,
  AgroCloudDashboardElementSize,
} from './agroCloudDashboardData'
import {
  collectDashboardDataSources,
  fieldTypeIcon,
  fieldTypeLabel,
} from './agroCloudDashboardDataSourceEngine'
import {
  listDashboardLayerOptions,
  registerGisContentForLayerPick,
  type DashboardLayerOption,
} from './agroCloudDashboardLayerSelection'
import { SelectLayerModal } from './SelectLayerModal'
import { SelectMapFromGisContentModal } from './SelectMapFromGisContentModal'
import { useDashboardElementResize } from './useDashboardElementResize'
import {
  defaultIndicatorWidgetSettings,
  indicatorFontSizePx,
  indicatorSettingsFromElement,
  mergeIndicatorWidgetSettings,
  newIndicatorFilterConditionId,
  normalizeIndicatorFilters,
  resolveIndicatorCalculatedValue,
  resolveIndicatorDisplayText,
  type AgroCloudDashboardIndicatorWidgetSettings,
  type AgroCloudIndicatorConfigTab,
  type AgroCloudIndicatorFilterCondition,
  type AgroCloudIndicatorFilterLogic,
  type AgroCloudIndicatorTextBlock,
} from './agroCloudDashboardIndicatorWidgetSettings'

const COLOR_OPTIONS = [
  { id: '#323130', label: 'Black' },
  { id: '#0079c1', label: 'Blue' },
  { id: '#2e7d32', label: 'Green' },
  { id: '#605e5c', label: 'Gray' },
  { id: '#ffffff', label: 'White' },
] as const

const NAV: { id: AgroCloudIndicatorConfigTab; label: string }[] = [
  { id: 'data', label: 'Data' },
  { id: 'indicator', label: 'Indicator' },
  { id: 'general', label: 'General' },
  { id: 'accessibility', label: 'Accessibility' },
]

const STATISTICS: { id: AgroCloudDashboardAggregation; label: string }[] = [
  { id: 'count', label: 'Count' },
  { id: 'sum', label: 'Sum' },
  { id: 'avg', label: 'Average' },
  { id: 'min', label: 'Minimum' },
  { id: 'max', label: 'Maximum' },
]

const MOCK_TABLE_ROWS = [
  { OBJECTID: 930, Farm_Code: 'F-001', Shape__Area: 12.4 },
  { OBJECTID: 931, Farm_Code: 'F-002', Shape__Area: 8.1 },
  { OBJECTID: 932, Farm_Code: 'F-003', Shape__Area: 15.7 },
  { OBJECTID: 933, Farm_Code: 'F-004', Shape__Area: 6.2 },
  { OBJECTID: 934, Farm_Code: 'F-005', Shape__Area: 21.0 },
]

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="agrocloud-indicator-config__toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className={`agrocloud-indicator-config__toggle${checked ? ' is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span className="agrocloud-indicator-config__toggle-knob" aria-hidden />
      </button>
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <label className="agrocloud-indicator-config__field">
      <span className="agrocloud-indicator-config__field-label">{label}</span>
      <div className="agrocloud-indicator-config__color-wrap">
        <span className="agrocloud-indicator-config__color-swatch" style={{ background: value }} aria-hidden />
        <select className="agrocloud-indicator-config__select" value={value} onChange={e => onChange(e.target.value)}>
          {COLOR_OPTIONS.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}

function TextBlockEditor({
  label,
  block,
  onChange,
}: {
  label: string
  block: AgroCloudIndicatorTextBlock
  onChange: (next: Partial<AgroCloudIndicatorTextBlock>) => void
}) {
  return (
    <div className="agrocloud-indicator-config__text-block">
      <span className="agrocloud-indicator-config__field-label">{label}</span>
      <div className="agrocloud-indicator-config__text-input-wrap">
        <input
          type="text"
          className="agrocloud-indicator-config__input"
          value={block.text}
          onChange={e => onChange({ text: e.target.value })}
        />
        <button type="button" className="agrocloud-indicator-config__var-btn" title="Insert variable" aria-label="Insert variable">
          <i className="fa-solid fa-brackets-curly" aria-hidden />
        </button>
      </div>
      <div className="agrocloud-indicator-config__format-bar">
        <label className="agrocloud-indicator-config__format-color" title="Text color">
          <span className="agrocloud-indicator-config__color-swatch" style={{ background: block.color }} aria-hidden />
          <select value={block.color} onChange={e => onChange({ color: e.target.value })} aria-label={`${label} color`}>
            {COLOR_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="agrocloud-indicator-config__format-check" title="Show text">
          <input type="checkbox" checked={block.visible} onChange={e => onChange({ visible: e.target.checked })} />
        </label>
        <button
          type="button"
          className={`agrocloud-indicator-config__format-btn${block.bold ? ' is-active' : ''}`}
          title="Bold"
          aria-pressed={block.bold}
          onClick={() => onChange({ bold: !block.bold })}
        >
          <i className="fa-solid fa-bold" aria-hidden />
        </button>
        <select
          className="agrocloud-indicator-config__format-size"
          value={block.fontSize}
          onChange={e => onChange({ fontSize: e.target.value as AgroCloudIndicatorTextBlock['fontSize'] })}
          aria-label={`${label} font size`}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
    </div>
  )
}

function IndicatorFilterSection({
  filters,
  filterLogics,
  layerFields,
  onChange,
}: {
  filters: AgroCloudIndicatorFilterCondition[]
  filterLogics: AgroCloudIndicatorFilterLogic[]
  layerFields: Array<{ name: string; isKey?: boolean }>
  onChange: (next: { filters: AgroCloudIndicatorFilterCondition[]; filterLogics: AgroCloudIndicatorFilterLogic[] }) => void
}) {
  const addFirstFilter = () => {
    onChange({
      filters: [{ id: newIndicatorFilterConditionId(), field: '' }],
      filterLogics: [],
    })
  }

  const addFilterWithLogic = (logic: AgroCloudIndicatorFilterLogic) => {
    onChange({
      filters: [...filters, { id: newIndicatorFilterConditionId(), field: '' }],
      filterLogics: [...filterLogics, logic],
    })
  }

  const updateFilterField = (id: string, field: string) => {
    onChange({
      filters: filters.map(row => (row.id === id ? { ...row, field } : row)),
      filterLogics,
    })
  }

  const removeFilter = (index: number) => {
    const nextFilters = filters.filter((_, i) => i !== index)
    let nextLogics = [...filterLogics]
    if (index === 0) nextLogics = nextLogics.slice(1)
    else if (index > 0) nextLogics = [...nextLogics.slice(0, index - 1), ...nextLogics.slice(index)]
    onChange({ filters: nextFilters, filterLogics: nextLogics })
  }

  return (
    <div className="agrocloud-indicator-config__filter-block">
      <div className="agrocloud-indicator-config__layer-row">
        <span className="agrocloud-indicator-config__field-label">Filter</span>
        {filters.length === 0 ? (
          <button type="button" className="agrocloud-indicator-config__outline-btn" onClick={addFirstFilter}>
            + Filter
          </button>
        ) : null}
      </div>

      {filters.length > 0 ? (
        <div className="agrocloud-indicator-config__filter-panel">
          {filters.map((condition, index) => (
            <div key={condition.id} className="agrocloud-indicator-config__filter-group">
              {index > 0 ? (
                <div className="agrocloud-indicator-config__filter-join">
                  {(filterLogics[index - 1] ?? 'and').toUpperCase()}
                </div>
              ) : null}
              <div className="agrocloud-indicator-config__filter-row">
                <select
                  className={`agrocloud-indicator-config__filter-field-select${
                    condition.field ? '' : ' is-placeholder'
                  }`}
                  value={condition.field}
                  aria-label="Field for the condition"
                  onChange={e => updateFilterField(condition.id, e.target.value)}
                >
                  <option value="">Field for the condition</option>
                  {layerFields.map(f => (
                    <option key={f.name} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="agrocloud-indicator-config__filter-delete"
                  aria-label="Remove filter condition"
                  onClick={() => removeFilter(index)}
                >
                  <i className="fa-regular fa-trash-can" aria-hidden />
                </button>
              </div>
            </div>
          ))}
          <div className="agrocloud-indicator-config__filter-logic-row">
            <button type="button" className="agrocloud-indicator-config__filter-logic-btn" onClick={() => addFilterWithLogic('and')}>
              AND
            </button>
            <button type="button" className="agrocloud-indicator-config__filter-logic-btn" onClick={() => addFilterWithLogic('or')}>
              OR
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function IndicatorPreviewCard({
  settings,
  element,
  config,
  cardSize,
  liveSize,
  isResizing,
  registerCardRef,
  onBeginResize,
}: {
  settings: AgroCloudDashboardIndicatorWidgetSettings
  element: AgroCloudDashboardElement
  config: AgroCloudDashboardConfig
  cardSize: AgroCloudDashboardElementSize
  liveSize: AgroCloudDashboardElementSize | null
  isResizing: boolean
  registerCardRef: (node: HTMLElement | null) => void
  onBeginResize: (clientX: number, clientY: number) => void
}) {
  const calculated = resolveIndicatorCalculatedValue(element, settings, config)
  const top = settings.topText.visible ? resolveIndicatorDisplayText(settings.topText.text, calculated) : ''
  const middle = settings.middleText.visible
    ? resolveIndicatorDisplayText(settings.middleText.text, calculated)
    : calculated
  const bottom = settings.bottomText.visible ? resolveIndicatorDisplayText(settings.bottomText.text, calculated) : ''

  const width = liveSize?.width ?? cardSize.width
  const height = liveSize?.height ?? cardSize.height
  const sizeStyle: CSSProperties = {}
  if (typeof width === 'number') sizeStyle.width = width
  if (typeof height === 'number') sizeStyle.height = height
  const hasCustomSize = typeof width === 'number' || typeof height === 'number'

  return (
    <article
      ref={registerCardRef}
      className={`agrocloud-indicator-config__preview-card${isResizing ? ' is-resizing' : ''}${
        hasCustomSize ? ' has-custom-size' : ''
      }`}
      style={{ background: settings.foregroundColor, color: settings.textColor, ...sizeStyle }}
    >
      {settings.headerTitle.trim() ? (
        <header
          className="agrocloud-indicator-config__preview-head"
          style={{ color: settings.headerTextColor, background: settings.headerForegroundColor }}
        >
          {settings.headerTitle}
        </header>
      ) : null}
      <div className="agrocloud-indicator-config__preview-body">
        {settings.topCaption ? <span className="agrocloud-indicator-config__preview-caption">{settings.topCaption}</span> : null}
        {top ? (
          <span
            className="agrocloud-indicator-config__preview-top"
            style={{
              color: settings.topText.color,
              fontWeight: settings.topText.bold ? 700 : 400,
              fontSize: indicatorFontSizePx(settings.topText.fontSize),
            }}
          >
            {top}
          </span>
        ) : null}
        <span
          className="agrocloud-indicator-config__preview-value"
          style={{
            color: settings.middleText.color,
            fontWeight: settings.middleText.bold ? 700 : 600,
            fontSize: indicatorFontSizePx(settings.middleText.fontSize === 'medium' ? 'large' : settings.middleText.fontSize),
          }}
        >
          {middle}
        </span>
        {bottom ? (
          <span
            className="agrocloud-indicator-config__preview-bottom"
            style={{
              color: settings.bottomText.color,
              fontWeight: settings.bottomText.bold ? 700 : 400,
              fontSize: indicatorFontSizePx(settings.bottomText.fontSize),
            }}
          >
            {bottom}
          </span>
        ) : null}
        {settings.bottomCaption ? (
          <span className="agrocloud-indicator-config__preview-caption">{settings.bottomCaption}</span>
        ) : null}
        {settings.lastUpdateText ? (
          <span className="agrocloud-indicator-config__preview-updated">Last updated: just now</span>
        ) : null}
      </div>
      <button
        type="button"
        className="agrocloud-indicator-config__preview-resize"
        aria-label="Resize card"
        title="Resize card"
        onPointerDown={e => {
          if (e.button !== 0) return
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          onBeginResize(e.clientX, e.clientY)
        }}
      >
        <span className="agrocloud-indicator-config__preview-resize-grip" aria-hidden />
      </button>
    </article>
  )
}

export type ConfigureIndicatorWidgetModalProps = {
  open: boolean
  config: AgroCloudDashboardConfig
  elementId: string | null
  onClose: () => void
  onDone: (payload: {
    settings: AgroCloudDashboardIndicatorWidgetSettings
    sourceLayer: string
    field: string
    aggregation: AgroCloudDashboardAggregation
    dataSourceId?: string
    dataSources?: AgroCloudDashboardConfig['dataSources']
    size?: AgroCloudDashboardElementSize
  }) => void
}

export function ConfigureIndicatorWidgetModal({
  open,
  config,
  elementId,
  onClose,
  onDone,
}: ConfigureIndicatorWidgetModalProps) {
  const element = useMemo(
    () => (elementId ? config.elements.find(el => el.id === elementId) : undefined),
    [config.elements, elementId],
  )

  const [tab, setTab] = useState<AgroCloudIndicatorConfigTab>('data')
  const [draft, setDraft] = useState<AgroCloudDashboardIndicatorWidgetSettings>(
    defaultIndicatorWidgetSettings('Indicator'),
  )
  const [sourceLayer, setSourceLayer] = useState('Agro Structures')
  const [field, setField] = useState('OBJECTID')
  const [dataSourceId, setDataSourceId] = useState<string | undefined>()
  const [settingsExpanded, setSettingsExpanded] = useState(true)
  const [referenceExpanded, setReferenceExpanded] = useState(false)
  const [headerExpanded, setHeaderExpanded] = useState(true)
  const [generalSettingsExpanded, setGeneralSettingsExpanded] = useState(true)
  const [valueFormattingExpanded, setValueFormattingExpanded] = useState(false)
  const [dataTableExpanded, setDataTableExpanded] = useState(false)
  const [draftConfig, setDraftConfig] = useState(config)
  const [layerPickerOpen, setLayerPickerOpen] = useState(false)
  const [browseGisOpen, setBrowseGisOpen] = useState(false)
  const [cardSize, setCardSize] = useState<AgroCloudDashboardElementSize>({})
  const previewCardRef = useRef<HTMLElement | null>(null)

  const previewResize = useDashboardElementResize({
    editMode: open,
    onResizeCommit: (_elementId, size) => setCardSize(size),
  })

  const applyLayerSelection = useCallback(
    (option: DashboardLayerOption) => {
      setSourceLayer(option.layerName)
      setDataSourceId(option.dataSourceId)
      const layer = collectDashboardDataSources(draftConfig)
        .flatMap(s => s.layers)
        .find(l => l.name === option.layerName)
      const keyField = layer?.fields.find(f => f.isKey)?.name ?? layer?.fields[0]?.name
      if (keyField) setField(keyField)
      setLayerPickerOpen(false)
    },
    [draftConfig],
  )

  const handleBrowseGisSelected = useCallback((row: GisContentRow) => {
    const { config: nextConfig, layers } = registerGisContentForLayerPick(draftConfig, row)
    setDraftConfig(nextConfig)
    setBrowseGisOpen(false)
    if (layers.length === 1) {
      applyLayerSelection(layers[0]!)
      return
    }
    setLayerPickerOpen(true)
  }, [applyLayerSelection, draftConfig])

  const handleNewDataExpression = useCallback(async () => {
    await appAlert(
      'Data expressions (SQL / Arcade-style) will connect to hosted feature layers and REST services. This builder step is coming next.',
      { title: 'New data expression' },
    )
  }, [])

  const activeLayer = useMemo(() => {
    const sources = collectDashboardDataSources(draftConfig)
    for (const source of sources) {
      const layer = source.layers.find(l => l.name === sourceLayer)
      if (layer) return layer
    }
    return sources[0]?.layers[0]
  }, [draftConfig, sourceLayer])

  const previewElement = useMemo(
    (): AgroCloudDashboardElement =>
      element
        ? { ...element, field, sourceLayer, aggregation: draft.statistic }
        : {
            id: 'preview',
            kind: 'indicator',
            label: draft.name,
            field,
            sourceLayer,
            aggregation: draft.statistic,
          },
    [draft.name, draft.statistic, element, field, sourceLayer],
  )

  useEffect(() => {
    if (!open || !element) return
    const options = listDashboardLayerOptions(config)
    setTab('data')
    setDraft(normalizeIndicatorFilters(indicatorSettingsFromElement(element)))
    setDraftConfig(config)
    setSourceLayer(element.sourceLayer ?? options[0]?.layerName ?? 'Agro Structures')
    setField(element.field ?? 'OBJECTID')
    setDataSourceId(element.dataSourceId)
    setSettingsExpanded(true)
    setReferenceExpanded(false)
    setHeaderExpanded(true)
    setGeneralSettingsExpanded(true)
    setValueFormattingExpanded(false)
    setDataTableExpanded(false)
    setLayerPickerOpen(false)
    setBrowseGisOpen(false)
    setCardSize(element.size ? { ...element.size } : {})
  }, [config, element, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (layerPickerOpen || browseGisOpen) return
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [browseGisOpen, layerPickerOpen, onClose, open])

  const patch = useCallback((next: Partial<AgroCloudDashboardIndicatorWidgetSettings>) => {
    setDraft(prev => mergeIndicatorWidgetSettings(prev, next))
  }, [])

  if (!open || !element || element.kind !== 'indicator') return null

  const panelTitle =
    tab === 'data'
      ? 'Data options'
      : tab === 'indicator'
        ? 'Indicator options'
        : tab === 'general'
          ? 'General options'
          : 'Accessibility options'

  const tableFields = activeLayer?.fields.slice(0, 4) ?? [{ name: 'OBJECTID', type: 'oid' as const }]

  return (
    <>
    <div
      className="agrocloud-indicator-config-backdrop"
      role="presentation"
      onClick={() => {
        if (layerPickerOpen || browseGisOpen) return
        onClose()
      }}
    >
      <div
        className="agrocloud-indicator-config"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agrocloud-indicator-config-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="agrocloud-indicator-config__header">
          <h2 id="agrocloud-indicator-config-title">Indicator</h2>
          <button type="button" className="agrocloud-indicator-config__close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="agrocloud-indicator-config__workspace">
          <nav className="agrocloud-indicator-config__nav" aria-label="Indicator configuration">
            {NAV.map(item => (
              <button
                key={item.id}
                type="button"
                className={`agrocloud-indicator-config__nav-item${tab === item.id ? ' is-active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="agrocloud-indicator-config__panel">
            <h3 className="agrocloud-indicator-config__panel-title">{panelTitle}</h3>

            {tab === 'data' ? (
              <div className="agrocloud-indicator-config__panel-scroll">
                <section className="agrocloud-indicator-config__section">
                  <button
                    type="button"
                    className="agrocloud-indicator-config__section-toggle"
                    aria-expanded={settingsExpanded}
                    onClick={() => setSettingsExpanded(v => !v)}
                  >
                    <i className={`fa-solid fa-chevron-${settingsExpanded ? 'up' : 'down'}`} aria-hidden />
                    <span>Settings</span>
                  </button>
                  {settingsExpanded ? (
                    <div className="agrocloud-indicator-config__section-body">
                      <div className="agrocloud-indicator-config__layer-row">
                        <span className="agrocloud-indicator-config__field-label">Layer</span>
                        <div className="agrocloud-indicator-config__layer-value">
                          <span>Layer: {sourceLayer}</span>
                          <button
                            type="button"
                            className="agrocloud-indicator-config__change-link"
                            onClick={() => setLayerPickerOpen(true)}
                          >
                            Change
                          </button>
                        </div>
                      </div>

                      <IndicatorFilterSection
                        filters={draft.filters}
                        filterLogics={draft.filterLogics}
                        layerFields={activeLayer?.fields ?? []}
                        onChange={({ filters, filterLogics }) => patch({ filters, filterLogics })}
                      />

                      <div className="agrocloud-indicator-config__field">
                        <span className="agrocloud-indicator-config__field-label">Value type</span>
                        <div className="agrocloud-indicator-config__segmented" role="group" aria-label="Value type">
                          {(['statistic', 'feature'] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              className={`agrocloud-indicator-config__segment${draft.valueType === mode ? ' is-active' : ''}`}
                              aria-pressed={draft.valueType === mode}
                              onClick={() => patch({ valueType: mode })}
                            >
                              {mode === 'statistic' ? 'Statistic' : 'Feature'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {draft.valueType === 'statistic' ? (
                        <>
                          <label className="agrocloud-indicator-config__field">
                            <span className="agrocloud-indicator-config__field-label">Statistic</span>
                            <select
                              className="agrocloud-indicator-config__select"
                              value={draft.statistic}
                              onChange={e => patch({ statistic: e.target.value as AgroCloudDashboardAggregation })}
                            >
                              {STATISTICS.map(opt => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="agrocloud-indicator-config__field">
                            <span className="agrocloud-indicator-config__field-label">Field</span>
                            <div className="agrocloud-indicator-config__field-select-wrap">
                              <select
                                className="agrocloud-indicator-config__select"
                                value={field}
                                onChange={e => setField(e.target.value)}
                              >
                                {(activeLayer?.fields ?? []).map(f => (
                                  <option key={f.name} value={f.name}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                              {activeLayer?.fields.find(f => f.name === field)?.isKey ? (
                                <i className="fa-solid fa-key agrocloud-indicator-config__field-key" aria-hidden title="Key field" />
                              ) : null}
                            </div>
                          </label>
                        </>
                      ) : (
                        <label className="agrocloud-indicator-config__field">
                          <span className="agrocloud-indicator-config__field-label">Field</span>
                          <select className="agrocloud-indicator-config__select" value={field} onChange={e => setField(e.target.value)}>
                            {(activeLayer?.fields ?? []).map(f => (
                              <option key={f.name} value={f.name}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <ToggleRow
                        label="Value conversion"
                        checked={draft.valueConversion}
                        onChange={v => patch({ valueConversion: v })}
                      />
                    </div>
                  ) : null}
                </section>

                <section className="agrocloud-indicator-config__section">
                  <button
                    type="button"
                    className="agrocloud-indicator-config__section-toggle"
                    aria-expanded={referenceExpanded}
                    onClick={() => setReferenceExpanded(v => !v)}
                  >
                    <i className={`fa-solid fa-chevron-${referenceExpanded ? 'up' : 'down'}`} aria-hidden />
                    <span>Reference</span>
                  </button>
                  {referenceExpanded ? (
                    <div className="agrocloud-indicator-config__section-body">
                      <p className="agrocloud-indicator-config__panel-note">Reference values compare the indicator against a target.</p>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}

            {tab === 'indicator' ? (
              <div className="agrocloud-indicator-config__panel-scroll">
                <section className="agrocloud-indicator-config__section">
                  <button
                    type="button"
                    className="agrocloud-indicator-config__section-toggle"
                    aria-expanded={settingsExpanded}
                    onClick={() => setSettingsExpanded(v => !v)}
                  >
                    <i className={`fa-solid fa-chevron-${settingsExpanded ? 'up' : 'down'}`} aria-hidden />
                    <span>Settings</span>
                  </button>
                  {settingsExpanded ? (
                    <div className="agrocloud-indicator-config__section-body">
                      <div className="agrocloud-indicator-config__advanced-row">
                        <span className="agrocloud-indicator-config__field-label">Advanced formatting</span>
                        <div className="agrocloud-indicator-config__advanced-actions">
                          <button
                            type="button"
                            className="agrocloud-indicator-config__outline-btn"
                            onClick={() => patch({ advancedFormatting: !draft.advancedFormatting })}
                          >
                            {draft.advancedFormatting ? 'Disable' : 'Enable'}
                          </button>
                          <i className="fa-regular fa-circle-question agrocloud-indicator-config__hint" title="Use Arcade-style expressions" aria-hidden />
                        </div>
                      </div>

                      <TextBlockEditor
                        label="Top text"
                        block={draft.topText}
                        onChange={next => patch({ topText: { ...draft.topText, ...next } })}
                      />
                      <TextBlockEditor
                        label="Middle text"
                        block={draft.middleText}
                        onChange={next => patch({ middleText: { ...draft.middleText, ...next } })}
                      />
                      <TextBlockEditor
                        label="Bottom text"
                        block={draft.bottomText}
                        onChange={next => patch({ bottomText: { ...draft.bottomText, ...next } })}
                      />

                      <div className="agrocloud-indicator-config__icon-row">
                        <span className="agrocloud-indicator-config__field-label">Icon</span>
                        <button
                          type="button"
                          className="agrocloud-indicator-config__outline-btn"
                          onClick={() => patch({ iconEnabled: !draft.iconEnabled })}
                        >
                          {draft.iconEnabled ? 'Remove icon' : 'Add icon'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="agrocloud-indicator-config__section">
                  <button
                    type="button"
                    className="agrocloud-indicator-config__section-toggle"
                    aria-expanded={valueFormattingExpanded}
                    onClick={() => setValueFormattingExpanded(v => !v)}
                  >
                    <i className={`fa-solid fa-chevron-${valueFormattingExpanded ? 'up' : 'down'}`} aria-hidden />
                    <span>Value formatting</span>
                  </button>
                  {valueFormattingExpanded ? (
                    <div className="agrocloud-indicator-config__section-body">
                      <p className="agrocloud-indicator-config__panel-note">Uses dashboard unit prefix settings.</p>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}

            {tab === 'general' ? (
              <div className="agrocloud-indicator-config__panel-scroll">
                <section className="agrocloud-indicator-config__section">
                  <button
                    type="button"
                    className="agrocloud-indicator-config__section-toggle"
                    aria-expanded={headerExpanded}
                    onClick={() => setHeaderExpanded(v => !v)}
                  >
                    <i className={`fa-solid fa-chevron-${headerExpanded ? 'up' : 'down'}`} aria-hidden />
                    <span>Header</span>
                  </button>
                  {headerExpanded ? (
                    <div className="agrocloud-indicator-config__section-body">
                      <label className="agrocloud-indicator-config__field">
                        <span className="agrocloud-indicator-config__field-label">Title</span>
                        <div className="agrocloud-indicator-config__text-input-wrap">
                          <input
                            type="text"
                            className="agrocloud-indicator-config__input"
                            value={draft.headerTitle}
                            onChange={e => patch({ headerTitle: e.target.value })}
                          />
                          <button type="button" className="agrocloud-indicator-config__var-btn" aria-label="Insert variable">
                            <i className="fa-solid fa-brackets-curly" aria-hidden />
                          </button>
                        </div>
                      </label>
                      <div className="agrocloud-indicator-config__edit-row">
                        <span className="agrocloud-indicator-config__field-label">More information</span>
                        <button type="button" className="agrocloud-indicator-config__edit-btn">
                          <i className="fa-solid fa-pen" aria-hidden />
                          Edit
                        </button>
                      </div>
                      <ToggleRow
                        label="Source data download"
                        checked={draft.sourceDataDownload}
                        onChange={v => patch({ sourceDataDownload: v })}
                      />
                      <ColorField label="Header text color" value={draft.headerTextColor} onChange={v => patch({ headerTextColor: v })} />
                      <ColorField
                        label="Header foreground color"
                        value={draft.headerForegroundColor}
                        onChange={v => patch({ headerForegroundColor: v })}
                      />
                    </div>
                  ) : null}
                </section>

                <section className="agrocloud-indicator-config__section">
                  <button
                    type="button"
                    className="agrocloud-indicator-config__section-toggle"
                    aria-expanded={generalSettingsExpanded}
                    onClick={() => setGeneralSettingsExpanded(v => !v)}
                  >
                    <i className={`fa-solid fa-chevron-${generalSettingsExpanded ? 'up' : 'down'}`} aria-hidden />
                    <span>Settings</span>
                  </button>
                  {generalSettingsExpanded ? (
                    <div className="agrocloud-indicator-config__section-body">
                      <label className="agrocloud-indicator-config__field">
                        <span className="agrocloud-indicator-config__field-label">Name</span>
                        <input
                          type="text"
                          className="agrocloud-indicator-config__input"
                          value={draft.name}
                          onChange={e => patch({ name: e.target.value })}
                        />
                      </label>
                      <div className="agrocloud-indicator-config__edit-row">
                        <span className="agrocloud-indicator-config__field-label">Top caption</span>
                        <button type="button" className="agrocloud-indicator-config__edit-btn">
                          <i className="fa-solid fa-pen" aria-hidden />
                          Edit
                        </button>
                      </div>
                      <div className="agrocloud-indicator-config__edit-row">
                        <span className="agrocloud-indicator-config__field-label">Bottom caption</span>
                        <button type="button" className="agrocloud-indicator-config__edit-btn">
                          <i className="fa-solid fa-pen" aria-hidden />
                          Edit
                        </button>
                      </div>
                      <ColorField label="Text color" value={draft.textColor} onChange={v => patch({ textColor: v })} />
                      <ColorField label="Foreground color" value={draft.foregroundColor} onChange={v => patch({ foregroundColor: v })} />
                      <ToggleRow label="Last update text" checked={draft.lastUpdateText} onChange={v => patch({ lastUpdateText: v })} />
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}

            {tab === 'accessibility' ? (
              <div className="agrocloud-indicator-config__panel-scroll">
                <p className="agrocloud-indicator-config__panel-sub">Screen reader</p>
                <label className="agrocloud-indicator-config__field">
                  <span className="agrocloud-indicator-config__field-label">Accessible name</span>
                  <input
                    type="text"
                    className="agrocloud-indicator-config__input"
                    value={draft.accessibleName}
                    onChange={e => patch({ accessibleName: e.target.value })}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="agrocloud-indicator-config__preview-col">
            <div className="agrocloud-indicator-config__preview-stage">
              <IndicatorPreviewCard
                settings={draft}
                element={previewElement}
                config={draftConfig}
                cardSize={cardSize}
                liveSize={element ? previewResize.liveSizeFor(element.id) : null}
                isResizing={element ? previewResize.resizingId === element.id : false}
                registerCardRef={node => {
                  previewCardRef.current = node
                }}
                onBeginResize={(clientX, clientY) => {
                  if (!element) return
                  const anchor = previewCardRef.current
                  if (anchor) previewResize.beginResize(element.id, clientX, clientY, anchor)
                }}
              />
            </div>
            <div className="agrocloud-indicator-config__data-table">
              <button
                type="button"
                className="agrocloud-indicator-config__data-table-toggle"
                aria-expanded={dataTableExpanded}
                onClick={() => setDataTableExpanded(v => !v)}
              >
                <span>Data table</span>
                <i className={`fa-solid fa-angles-${dataTableExpanded ? 'down' : 'up'}`} aria-hidden />
              </button>
              {dataTableExpanded ? (
                <div className="agrocloud-indicator-config__data-table-body">
                  <table>
                    <thead>
                      <tr>
                        {tableFields.map(f => (
                          <th key={f.name}>
                            <i className={fieldTypeIcon(f.type)} aria-hidden title={fieldTypeLabel(f.type)} /> {f.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_TABLE_ROWS.map((row, idx) => (
                        <tr key={idx}>
                          {tableFields.map(f => (
                            <td key={f.name}>{String((row as Record<string, string | number>)[f.name] ?? '—')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="agrocloud-indicator-config__footer">
          <button type="button" className="agrocloud-indicator-config__cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="agrocloud-indicator-config__done"
            onClick={() =>
              onDone({
                settings: draft,
                sourceLayer,
                field,
                aggregation: draft.valueType === 'statistic' ? draft.statistic : 'none',
                dataSourceId,
                dataSources: draftConfig.dataSources,
                size: cardSize.width || cardSize.height ? cardSize : undefined,
              })
            }
          >
            Done
          </button>
        </footer>
      </div>
    </div>

    <SelectLayerModal
      open={layerPickerOpen}
      stacked
      widgetKind="indicator"
      config={draftConfig}
      onClose={() => setLayerPickerOpen(false)}
      onSelectLayer={applyLayerSelection}
      onBrowseAllLayers={() => {
        setLayerPickerOpen(false)
        setBrowseGisOpen(true)
      }}
      onNewDataExpression={handleNewDataExpression}
    />

    <SelectMapFromGisContentModal
      open={browseGisOpen}
      stacked
      title="Browse all layers"
      onClose={() => {
        setBrowseGisOpen(false)
        setLayerPickerOpen(true)
      }}
      onSelect={handleBrowseGisSelected}
    />
    </>
  )
}
