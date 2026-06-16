import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GisContentRow } from '../../master/gisContentPortalData'
import {
  defaultMapWidgetSettings,
  mergeMapWidgetSettings,
  type AgroCloudDashboardMapWidgetSettings,
  type AgroCloudMapScalebarMode,
  type AgroCloudMapWidgetConfigTab,
} from './agroCloudDashboardMapWidgetSettings'
import { resolveDashboardWebMapPreview } from './agroCloudDashboardWebMapPreview'

const COLOR_OPTIONS = [
  { id: '#000000', label: 'Black' },
  { id: '#ffffff', label: 'White' },
  { id: '#0079c1', label: 'Blue' },
  { id: '#2e7d32', label: 'Green' },
  { id: '#605e5c', label: 'Gray' },
] as const

const NAV: { id: AgroCloudMapWidgetConfigTab; label: string }[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'general', label: 'General' },
  { id: 'mapActions', label: 'Map actions' },
  { id: 'layerActions', label: 'Layer actions' },
  { id: 'accessibility', label: 'Accessibility' },
]

function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  hint?: string
}) {
  return (
    <div className="agrocloud-map-config__toggle-row">
      <div className="agrocloud-map-config__toggle-label">
        <span>{label}</span>
        {hint ? (
          <i className="fa-regular fa-circle-question agrocloud-map-config__hint" title={hint} aria-hidden />
        ) : null}
      </div>
      <button
        type="button"
        className={`agrocloud-map-config__toggle${checked ? ' is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span className="agrocloud-map-config__toggle-knob" aria-hidden />
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
    <label className="agrocloud-map-config__field">
      <span className="agrocloud-map-config__field-label">{label}</span>
      <div className="agrocloud-map-config__color-wrap">
        <span className="agrocloud-map-config__color-swatch" style={{ background: value }} aria-hidden />
        <select className="agrocloud-map-config__select" value={value} onChange={e => onChange(e.target.value)}>
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

function ScalebarPicker({
  value,
  onChange,
}: {
  value: AgroCloudMapScalebarMode
  onChange: (next: AgroCloudMapScalebarMode) => void
}) {
  const options: { id: AgroCloudMapScalebarMode; label: string }[] = [
    { id: 'none', label: 'None' },
    { id: 'line', label: 'Line' },
    { id: 'ruler', label: 'Ruler' },
  ]
  return (
    <div className="agrocloud-map-config__field">
      <span className="agrocloud-map-config__field-label">Scalebar</span>
      <div className="agrocloud-map-config__segmented" role="group" aria-label="Scalebar">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            className={`agrocloud-map-config__segment${value === opt.id ? ' is-active' : ''}`}
            aria-pressed={value === opt.id}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export type ConfigureMapWidgetModalProps = {
  open: boolean
  row: GisContentRow | null
  initialSettings: AgroCloudDashboardMapWidgetSettings | null
  onClose: () => void
  onDone: (settings: AgroCloudDashboardMapWidgetSettings) => void
}

export function ConfigureMapWidgetModal({
  open,
  row,
  initialSettings,
  onClose,
  onDone,
}: ConfigureMapWidgetModalProps) {
  const [tab, setTab] = useState<AgroCloudMapWidgetConfigTab>('settings')
  const [draft, setDraft] = useState<AgroCloudDashboardMapWidgetSettings>(
    initialSettings ?? defaultMapWidgetSettings(row?.title ?? 'Map'),
  )
  const [headerExpanded, setHeaderExpanded] = useState(true)
  const [layerActionsExpanded, setLayerActionsExpanded] = useState(true)

  const layerNames = useMemo(() => {
    if (!row) return []
    return resolveDashboardWebMapPreview(row.id).layers.map(l => l.name)
  }, [row, open])

  const displayTitle = draft.name.trim() || row?.title || 'Map'

  useEffect(() => {
    if (!open) return
    setTab('settings')
    setDraft(initialSettings ?? defaultMapWidgetSettings(row?.title ?? 'Map'))
    setHeaderExpanded(true)
    setLayerActionsExpanded(true)
  }, [open, row?.id, initialSettings])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const patch = useCallback((next: Partial<AgroCloudDashboardMapWidgetSettings>) => {
    setDraft(prev => mergeMapWidgetSettings(prev, next))
  }, [])

  if (!open || !row) return null

  const primaryLayerName = layerNames[0] ?? row.title

  return (
    <div className="agrocloud-map-config-backdrop" role="presentation" onClick={onClose}>
      <div
        className="agrocloud-map-config"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agrocloud-map-config-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="agrocloud-map-config__header">
          <div className="agrocloud-map-config__header-text">
            <h2 id="agrocloud-map-config-title">{displayTitle}</h2>
            <span className="agrocloud-map-config__type-badge">Map</span>
          </div>
          <button type="button" className="agrocloud-map-config__close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="agrocloud-map-config__body">
          <nav className="agrocloud-map-config__nav" aria-label="Map configuration">
            {NAV.map(item => (
              <button
                key={item.id}
                type="button"
                className={`agrocloud-map-config__nav-item${tab === item.id ? ' is-active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="agrocloud-map-config__panel">
            {tab === 'settings' ? (
              <div className="agrocloud-map-config__panel-inner">
                <ScalebarPicker value={draft.scalebar} onChange={v => patch({ scalebar: v })} />
                <ToggleRow label="Measurement" checked={draft.measurement} onChange={v => patch({ measurement: v })} />
                <ToggleRow label="Search" checked={draft.search} onChange={v => patch({ search: v })} />
                <ToggleRow label="Legend" checked={draft.legend} onChange={v => patch({ legend: v })} />
                <ToggleRow
                  label="Initial view and bookmarks"
                  checked={draft.initialViewBookmarks}
                  onChange={v => patch({ initialViewBookmarks: v })}
                />
                <ToggleRow
                  label="Layer visibility"
                  checked={draft.layerVisibility}
                  onChange={v => patch({ layerVisibility: v })}
                />
                <ToggleRow
                  label="Basemap switcher"
                  checked={draft.basemapSwitcher}
                  onChange={v => patch({ basemapSwitcher: v })}
                />
                <ToggleRow label="Compass" checked={draft.compass} onChange={v => patch({ compass: v })} />
                <ToggleRow
                  label="Find my location"
                  checked={draft.findMyLocation}
                  onChange={v => patch({ findMyLocation: v })}
                />
                <ToggleRow label="Zoom in/out" checked={draft.zoomInOut} onChange={v => patch({ zoomInOut: v })} />
                <label className="agrocloud-map-config__field agrocloud-map-config__field--number">
                  <span className="agrocloud-map-config__field-label">Point zoom scale</span>
                  <input
                    type="number"
                    className="agrocloud-map-config__input"
                    value={draft.pointZoomScale}
                    min={1}
                    step={1000}
                    onChange={e => patch({ pointZoomScale: Number(e.target.value) || 10000 })}
                  />
                </label>
              </div>
            ) : null}

            {tab === 'general' ? (
              <div className="agrocloud-map-config__panel-inner">
                <section className="agrocloud-map-config__section">
                  <button
                    type="button"
                    className="agrocloud-map-config__section-toggle"
                    aria-expanded={headerExpanded}
                    onClick={() => setHeaderExpanded(v => !v)}
                  >
                    <i className={`fa-solid fa-chevron-${headerExpanded ? 'up' : 'down'}`} aria-hidden />
                    <span>Header</span>
                  </button>
                  {headerExpanded ? (
                    <div className="agrocloud-map-config__section-body">
                      <label className="agrocloud-map-config__field">
                        <span className="agrocloud-map-config__field-label">Title</span>
                        <input
                          type="text"
                          className="agrocloud-map-config__input"
                          value={draft.headerTitle}
                          onChange={e => patch({ headerTitle: e.target.value })}
                        />
                      </label>
                      <div className="agrocloud-map-config__edit-row">
                        <span className="agrocloud-map-config__field-label">More information</span>
                        <button type="button" className="agrocloud-map-config__edit-btn">
                          <i className="fa-solid fa-pen" aria-hidden />
                          Edit
                        </button>
                      </div>
                      <ColorField
                        label="Header text color"
                        value={draft.headerTextColor}
                        onChange={v => patch({ headerTextColor: v })}
                      />
                      <ColorField
                        label="Header foreground color"
                        value={draft.headerForegroundColor}
                        onChange={v => patch({ headerForegroundColor: v })}
                      />
                    </div>
                  ) : null}
                </section>

                <label className="agrocloud-map-config__field">
                  <span className="agrocloud-map-config__field-label">Name</span>
                  <input
                    type="text"
                    className="agrocloud-map-config__input"
                    value={draft.name}
                    onChange={e => patch({ name: e.target.value })}
                  />
                </label>
                <div className="agrocloud-map-config__edit-row">
                  <span className="agrocloud-map-config__field-label">Top caption</span>
                  <button type="button" className="agrocloud-map-config__edit-btn">
                    <i className="fa-solid fa-pen" aria-hidden />
                    Edit
                  </button>
                </div>
                <div className="agrocloud-map-config__edit-row">
                  <span className="agrocloud-map-config__field-label">Bottom caption</span>
                  <button type="button" className="agrocloud-map-config__edit-btn">
                    <i className="fa-solid fa-pen" aria-hidden />
                    Edit
                  </button>
                </div>
                <ColorField label="Text color" value={draft.textColor} onChange={v => patch({ textColor: v })} />
                <ColorField
                  label="Foreground color"
                  value={draft.foregroundColor}
                  onChange={v => patch({ foregroundColor: v })}
                />
                <ColorField
                  label="Selection color"
                  value={draft.selectionColor}
                  onChange={v => patch({ selectionColor: v })}
                />
                <ColorField label="Follow color" value={draft.followColor} onChange={v => patch({ followColor: v })} />
                <label className="agrocloud-map-config__field agrocloud-map-config__field--number">
                  <span className="agrocloud-map-config__field-label">Follow radius</span>
                  <input
                    type="number"
                    className="agrocloud-map-config__input"
                    value={draft.followRadius}
                    min={0}
                    onChange={e => patch({ followRadius: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
            ) : null}

            {tab === 'mapActions' ? (
              <div className="agrocloud-map-config__panel-inner">
                <h3 className="agrocloud-map-config__panel-title">Map actions</h3>
                <p className="agrocloud-map-config__panel-sub">When map extent changes</p>
                <div className="agrocloud-map-config__info-box">No elements supporting actions yet</div>
              </div>
            ) : null}

            {tab === 'layerActions' ? (
              <div className="agrocloud-map-config__panel-inner">
                <h3 className="agrocloud-map-config__panel-title">Layer actions</h3>
                <button
                  type="button"
                  className="agrocloud-map-config__layer-row"
                  aria-expanded={layerActionsExpanded}
                  onClick={() => setLayerActionsExpanded(v => !v)}
                >
                  <i className="fa-solid fa-layer-group" aria-hidden />
                  <span className="agrocloud-map-config__layer-row-text">
                    <strong>{primaryLayerName}</strong>
                    <small>Active targets: 0</small>
                  </span>
                  <i className={`fa-solid fa-chevron-${layerActionsExpanded ? 'up' : 'down'}`} aria-hidden />
                </button>

                {layerActionsExpanded ? (
                  <>
                    <p className="agrocloud-map-config__panel-sub">When map is clicked</p>
                    <ToggleRow label="Show pop-up" checked={draft.showPopup} onChange={v => patch({ showPopup: v })} />
                    <ToggleRow
                      label="Select feature"
                      checked={draft.selectFeature}
                      onChange={v => patch({ selectFeature: v })}
                      hint="Highlights the clicked feature on the map."
                    />

                    <p className="agrocloud-map-config__panel-sub">Additional selection tools</p>
                    <p className="agrocloud-map-config__panel-note">Requires one or more layer actions to be configured.</p>
                    <ToggleRow
                      label="Rectangle"
                      checked={draft.rectangleSelect}
                      onChange={v => patch({ rectangleSelect: v })}
                    />
                    <ToggleRow label="Lasso" checked={draft.lassoSelect} onChange={v => patch({ lassoSelect: v })} />
                    <ToggleRow label="Circle" checked={draft.circleSelect} onChange={v => patch({ circleSelect: v })} />
                    <ToggleRow label="Line" checked={draft.lineSelect} onChange={v => patch({ lineSelect: v })} />
                  </>
                ) : null}
              </div>
            ) : null}

            {tab === 'accessibility' ? (
              <div className="agrocloud-map-config__panel-inner">
                <h3 className="agrocloud-map-config__panel-title">Accessibility options</h3>
                <div className="agrocloud-map-config__divider" role="separator" />
                <p className="agrocloud-map-config__panel-sub">Screen reader</p>
                <label className="agrocloud-map-config__field">
                  <span className="agrocloud-map-config__field-label">Accessible name</span>
                  <input
                    type="text"
                    className="agrocloud-map-config__input"
                    value={draft.accessibleName}
                    onChange={e => patch({ accessibleName: e.target.value })}
                  />
                </label>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="agrocloud-map-config__footer">
          <button type="button" className="agrocloud-map-config__cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="agrocloud-map-config__done" onClick={() => onDone(draft)}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
