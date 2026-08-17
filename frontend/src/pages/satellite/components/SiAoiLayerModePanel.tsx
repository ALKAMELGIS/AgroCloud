import type { SiAoiMaskBuilderLayerOption, SiAoiMaskBuilderSettings, SiAoiMaskMode } from '../../../lib/siAoiMaskBuilder'

export type SiAoiLayerModePanelProps = {
  settings: SiAoiMaskBuilderSettings
  onChange: (next: SiAoiMaskBuilderSettings) => void
  layerOptions: SiAoiMaskBuilderLayerOption[]
  maskFeatureCount: number
  selectedFeatureCount: number
  disabled?: boolean
  /** When set, index tiles cannot load at the current map zoom. */
  zoomWarning?: string | null
  /** Full-layer analysis query (independent of map pan/zoom). */
  aoiQueryStatus?: 'idle' | 'loading' | 'complete' | 'error'
  aoiExpectedCount?: number | null
  aoiQueryError?: string | null
}

const BOUNDARY_MODES: Array<{ id: SiAoiMaskMode; label: string }> = [
  { id: 'entire-layer', label: 'All features' },
  { id: 'selected-features', label: 'Selected features only' },
]

export function SiAoiLayerModePanel({
  settings,
  onChange,
  layerOptions = [],
  maskFeatureCount,
  selectedFeatureCount,
  disabled = false,
  zoomWarning = null,
  aoiQueryStatus = 'idle',
  aoiExpectedCount = null,
  aoiQueryError = null,
}: SiAoiLayerModePanelProps) {
  const patch = (partial: Partial<SiAoiMaskBuilderSettings>) => onChange({ ...settings, ...partial })

  const maskMode =
    settings.maskMode === 'selected-features' ? 'selected-features' : 'entire-layer'
  const options = Array.isArray(layerOptions) ? layerOptions : []
  const controlsDisabled = disabled || !options.length

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
          {options.length === 0 ? (
            <option value="">Add a vector layer from Layers</option>
          ) : (
            options.map(l => (
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

      {disabled ? (
        <p className="si-rs-panel__meta si-rs-panel__meta--inline" role="status">
          Disable <strong>Show index on map (Edit AOI)</strong> above to clip using a <strong>Layers</strong>{' '}
          vector layer.
        </p>
      ) : settings.enabled ? (
        <p className="si-rs-panel__meta si-rs-panel__meta--inline" role="status">
          {maskMode === 'selected-features' ? (
            <>
              Selection <strong>{selectedFeatureCount}</strong> · Clip{' '}
              <strong>{maskFeatureCount}</strong> polygon{maskFeatureCount === 1 ? '' : 's'}
            </>
          ) : aoiQueryStatus === 'loading' ? (
            <>
              Loading AOI polygons
              {aoiExpectedCount != null && aoiExpectedCount > 0
                ? ` (${Math.min(maskFeatureCount, aoiExpectedCount)} / ${aoiExpectedCount})`
                : maskFeatureCount > 0
                  ? ` (${maskFeatureCount})`
                  : ''}
              …
            </>
          ) : aoiQueryStatus === 'error' ? (
            <>{aoiQueryError || 'Could not load layer AOI from the service.'}</>
          ) : maskFeatureCount > 0 ? (
            <>
              Clipping index to <strong>{maskFeatureCount}</strong> polygon
              {maskFeatureCount === 1 ? '' : 's'}
              {aoiExpectedCount != null && aoiExpectedCount > maskFeatureCount
                ? ` of ${aoiExpectedCount}`
                : ''}
            </>
          ) : (
            <>Querying all layer polygons for Sentinel analysis…</>
          )}
        </p>
      ) : options.length === 0 ? (
        <p className="si-rs-panel__meta si-rs-panel__meta--inline" role="status">
          Add a vector layer from <strong>Layers</strong>, pick it above, then enable Show on map to clip the
          selected index to that layer&apos;s polygons.
        </p>
      ) : (
        <p className="si-rs-panel__meta si-rs-panel__meta--inline" role="status">
          Enable <strong>Show on map (Layers AOI)</strong> to paint the selected index inside this layer&apos;s
          polygons.
        </p>
      )}
      {settings.enabled && zoomWarning ? (
        <p className="si-rs-panel__meta si-rs-panel__meta--warn si-rs-panel__meta--inline" role="status">
          {zoomWarning}
        </p>
      ) : null}
    </div>
  )
}
