import type { SiAoiMaskBuilderLayerOption, SiAoiMaskBuilderSettings, SiAoiMaskMode } from '../../../lib/siAoiMaskBuilder'

export type SiAoiLayerModePanelProps = {
  settings: SiAoiMaskBuilderSettings
  onChange: (next: SiAoiMaskBuilderSettings) => void
  layerOptions: SiAoiMaskBuilderLayerOption[]
  maskFeatureCount: number
  selectedFeatureCount: number
  disabled?: boolean
}

const BOUNDARY_MODES: Array<{ id: SiAoiMaskMode; label: string }> = [
  { id: 'entire-layer', label: 'All features' },
  { id: 'selected-features', label: 'Selected features only' },
]

export function SiAoiLayerModePanel({
  settings,
  onChange,
  layerOptions,
  disabled = false,
}: SiAoiLayerModePanelProps) {
  const patch = (partial: Partial<SiAoiMaskBuilderSettings>) => onChange({ ...settings, ...partial })

  const maskMode =
    settings.maskMode === 'selected-features' ? 'selected-features' : 'entire-layer'
  const controlsDisabled = disabled || !layerOptions.length

  return (
    <div className="si-aoi-layer-mode si-aoi-layer-mode--flat">
      <label className="si-rs-panel__stack">
        <span className="si-rs-panel__label">AOI layer</span>
        <select
          className="si-rs-panel__select"
          value={settings.sourceLayerId}
          onChange={e => patch({ sourceLayerId: e.target.value, filterValues: [] })}
          disabled={controlsDisabled}
          aria-label="AOI layer for Sentinel clip"
        >
          {layerOptions.length === 0 ? (
            <option value="">Add a vector layer from Layers</option>
          ) : (
            layerOptions.map(l => (
              <option key={l.id} value={l.id}>
                {l.label}
                {l.featureCount > 0 ? ` (${l.featureCount})` : ' (loading…)'}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="si-rs-panel__stack">
        <span className="si-rs-panel__label">Boundary</span>
        <select
          className="si-rs-panel__select"
          value={maskMode}
          onChange={e =>
            patch({
              maskMode: e.target.value as SiAoiMaskMode,
              filterValues: [],
            })
          }
          disabled={controlsDisabled}
          aria-label="AOI boundary mode"
        >
          {BOUNDARY_MODES.map(m => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="si-rs-panel__show-box">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={e => patch({ enabled: e.target.checked, maskMode })}
          disabled={controlsDisabled}
          aria-label="Clip Sentinel index to GIS layer AOI and show on map"
        />
        <span>Show on map (Layers AOI)</span>
      </label>
    </div>
  )
}
