import { useMemo, type ReactNode } from 'react'
import { pickDefaultSentinelWmsLayer } from '../../../lib/sentinelHubWmsLayers'
import {
  DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS,
  listSiAoiMaskBuilderFieldLabels,
  listSiAoiMaskBuilderFieldOptions,
  listSiAoiMaskBuilderLayerOptions,
  listSiAoiMaskBuilderUniqueFieldValues,
  type SiAoiMaskBuilderLayerLike,
  type SiAoiMaskBuilderSettings,
  type SiAoiMaskMode,
  type SiAoiMaskDisplayMode,
  isSiAoiMaskFilterValueSelected,
  parseFilterValueChoice,
} from '../../../lib/siAoiMaskBuilder'
import './SiAoiMaskBuilderPanel.css'

export type SiAoiMaskBuilderPanelProps = {
  settings: SiAoiMaskBuilderSettings
  onChange: (next: SiAoiMaskBuilderSettings) => void
  customLayers: SiAoiMaskBuilderLayerLike[]
  sentinelLayerOptions: Array<{ id: string; label: string }>
  maskFeatureCount: number
  selectedFeatureCount: number
  /** Flat rows inside Remote Sensing glass panel (no nested fieldset card). */
  flat?: boolean
}

const MASK_MODES: Array<{ id: SiAoiMaskMode; label: string }> = [
  { id: 'filtered-features', label: 'Filtered features' },
  { id: 'selected-features', label: 'Selected features only' },
  { id: 'entire-layer', label: 'Entire layer' },
]

const DISPLAY_MODES: Array<{ id: SiAoiMaskDisplayMode; label: string }> = [
  { id: 'transparent-outside', label: 'Transparent outside AOI' },
  { id: 'clip-outside', label: 'Clip outside AOI' },
  { id: 'dim-outside', label: 'Dim outside AOI' },
]

export function SiAoiMaskBuilderPanel({
  settings,
  onChange,
  customLayers,
  sentinelLayerOptions,
  maskFeatureCount,
  selectedFeatureCount,
  flat = false,
}: SiAoiMaskBuilderPanelProps) {
  const layerOptions = useMemo(() => listSiAoiMaskBuilderLayerOptions(customLayers), [customLayers])
  const sourceLayer = useMemo(
    () => customLayers.find(l => String(l.id) === settings.sourceLayerId) ?? null,
    [customLayers, settings.sourceLayerId],
  )
  const fieldOptions = useMemo(() => listSiAoiMaskBuilderFieldLabels(sourceLayer), [sourceLayer])
  const valueOptions = useMemo(
    () => listSiAoiMaskBuilderUniqueFieldValues(sourceLayer, settings.filterField),
    [sourceLayer, settings.filterField],
  )
  const defaultSentinelLayerId = useMemo(
    () =>
      pickDefaultSentinelWmsLayer(
        sentinelLayerOptions.map(o => ({ name: o.id, title: o.label })),
      ) || sentinelLayerOptions[0]?.id || '',
    [sentinelLayerOptions],
  )

  const patch = (partial: Partial<SiAoiMaskBuilderSettings>) => onChange({ ...settings, ...partial })

  const toggleValue = (choice: string) => {
    const parts = new Set(parseFilterValueChoice(choice))
    const selected = isSiAoiMaskFilterValueSelected(settings.filterValues, choice)
    const next = settings.filterValues.filter(v => !parts.has(v) && v !== choice)
    if (!selected) {
      parts.forEach(p => next.push(p))
    }
    patch({ filterValues: [...new Set(next)] })
  }

  const fieldLabel = (text: string) =>
    flat ? (
      <span className="si-rs-panel__label">{text}</span>
    ) : (
      <span className="si-field-analysis-label">{text}</span>
    )

  const renderField = (
    label: string,
    control: ReactNode,
    key?: string,
  ) =>
    flat ? (
      <label key={key} className="si-rs-panel__stack">
        {fieldLabel(label)}
        {control}
      </label>
    ) : (
      <label key={key} className="si-field-analysis-field si-field-analysis-field--labeled">
        {fieldLabel(label)}
        {control}
      </label>
    )

  return (
    <div className={`si-aoi-mask-builder${flat ? ' si-aoi-mask-builder--flat' : ''}`}>
      {flat ? (
        <label className="si-rs-panel__show-box">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={e => {
              const enabled = e.target.checked
              if (enabled && settings.filterValues.length === 0 && settings.maskMode === 'filtered-features') {
                patch({
                  enabled,
                  filterField: settings.filterField || 'Structure_Type',
                  filterValues: ['1006', '1007'],
                })
                return
              }
              patch({ enabled })
            }}
            aria-label="Enable AOI mask"
          />
          <span>AOI mask</span>
        </label>
      ) : (
        <div className="si-aoi-mask-builder__head">
          <h3 className="si-aoi-mask-builder__title">AOI Mask Builder</h3>
          <label className="si-aoi-mask-builder__enable">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={e => {
                const enabled = e.target.checked
                if (enabled && settings.filterValues.length === 0 && settings.maskMode === 'filtered-features') {
                  patch({
                    enabled,
                    filterField: settings.filterField || 'Structure_Type',
                    filterValues: ['1006', '1007'],
                  })
                  return
                }
                patch({ enabled })
              }}
              aria-label="Enable AOI Mask Builder"
            />
            <span>Enable</span>
          </label>
        </div>
      )}

      {settings.enabled ? (
        flat ? (
          <>
            {renderField(
              'Source',
              <select
                className="si-rs-panel__select"
                value={settings.sourceLayerId}
                onChange={e => {
                  const sourceLayerId = e.target.value
                  const layer = customLayers.find(l => String(l.id) === sourceLayerId)
                  const fields = listSiAoiMaskBuilderFieldOptions(layer ?? null)
                  patch({
                    sourceLayerId,
                    filterField: fields.includes(settings.filterField) ? settings.filterField : fields[0] ?? '',
                    filterValues: [],
                  })
                }}
                aria-label="AOI source layer"
              >
                {layerOptions.length === 0 ? (
                  <option value="">Add a GIS vector layer to the map</option>
                ) : (
                  layerOptions.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.label} ({l.featureCount})
                    </option>
                  ))
                )}
              </select>,
              'source',
            )}
            {renderField(
              'Field',
              <select
                className="si-rs-panel__select"
                value={settings.filterField}
                onChange={e => patch({ filterField: e.target.value, filterValues: [] })}
                disabled={!fieldOptions.length}
                aria-label="Filter attribute field"
              >
                {fieldOptions.length === 0 ? (
                  <option value="">No fields</option>
                ) : (
                  fieldOptions.map(f => (
                    <option key={f.name} value={f.name}>
                      {f.label}
                    </option>
                  ))
                )}
              </select>,
              'filter-field',
            )}
            {settings.maskMode === 'filtered-features' ? (
              <div className="si-rs-panel__stack">
                <span className="si-rs-panel__label">Filter values</span>
                <div className="si-aoi-mask-builder__values">
                  {valueOptions.length === 0 ? (
                    <p className="si-aoi-mask-builder__empty">No values for this field.</p>
                  ) : (
                    <div className="si-aoi-mask-builder__value-grid" role="group" aria-label="Filter values">
                      {valueOptions.map(choice => (
                        <label key={choice} className="si-aoi-mask-builder__value-chip">
                          <input
                            type="checkbox"
                            checked={isSiAoiMaskFilterValueSelected(settings.filterValues, choice)}
                            onChange={() => toggleValue(choice)}
                          />
                          <span>{choice}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            {renderField(
              'Sentinel',
              <select
                className="si-rs-panel__select"
                value={settings.sentinelLayerId || defaultSentinelLayerId}
                onChange={e => patch({ sentinelLayerId: e.target.value })}
                aria-label="Sentinel analysis layer"
              >
                {sentinelLayerOptions.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>,
              'sentinel',
            )}
            {renderField(
              'Mode',
              <select
                className="si-rs-panel__select"
                value={settings.maskMode}
                onChange={e => patch({ maskMode: e.target.value as SiAoiMaskMode })}
                aria-label="Mask mode"
              >
                {MASK_MODES.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>,
              'mask-mode',
            )}
            {renderField(
              'Display',
              <select
                className="si-rs-panel__select"
                value={settings.displayMode}
                onChange={e => patch({ displayMode: e.target.value as SiAoiMaskDisplayMode })}
                aria-label="Display mode"
              >
                {DISPLAY_MODES.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>,
              'display-mode',
            )}
            <label className="si-rs-panel__show-box">
              <input
                type="checkbox"
                checked={settings.liveUpdate}
                onChange={e => patch({ liveUpdate: e.target.checked })}
                aria-label="Live update mask on filter change"
              />
              <span>Live mask update</span>
            </label>
            <p className="si-rs-panel__meta si-rs-panel__meta--inline" role="status">
              {settings.maskMode === 'selected-features' ? (
                <>
                  Selection <strong>{selectedFeatureCount}</strong> · Mask <strong>{maskFeatureCount}</strong>
                </>
              ) : (
                <>
                  Mask on <strong>{maskFeatureCount}</strong> polygon{maskFeatureCount === 1 ? '' : 's'}
                </>
              )}
            </p>
            <button
              type="button"
              className="si-rs-panel__action si-rs-panel__action--ghost"
              onClick={() => onChange({ ...DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS })}
            >
              Reset mask defaults
            </button>
          </>
        ) : (
      <fieldset className="si-aoi-mask-builder__fieldset">
        <label className="si-field-analysis-field si-field-analysis-field--labeled">
          <span className="si-field-analysis-label">Source layer</span>
          <select
            className="si-field-analysis-select"
            value={settings.sourceLayerId}
            onChange={e => {
              const sourceLayerId = e.target.value
              const layer = customLayers.find(l => String(l.id) === sourceLayerId)
              const fields = listSiAoiMaskBuilderFieldOptions(layer ?? null)
              patch({
                sourceLayerId,
                filterField: fields.includes(settings.filterField) ? settings.filterField : fields[0] ?? '',
                filterValues: [],
              })
            }}
            aria-label="AOI source layer"
          >
            {layerOptions.length === 0 ? (
              <option value="">Add a GIS vector layer to the map</option>
            ) : (
              layerOptions.map(l => (
                <option key={l.id} value={l.id}>
                  {l.label} ({l.featureCount})
                </option>
              ))
            )}
          </select>
        </label>

        <label className="si-field-analysis-field si-field-analysis-field--labeled">
          <span className="si-field-analysis-label">Filter field</span>
          <select
            className="si-field-analysis-select"
            value={settings.filterField}
            onChange={e => patch({ filterField: e.target.value, filterValues: [] })}
            disabled={!fieldOptions.length}
            aria-label="Filter attribute field"
          >
            {fieldOptions.length === 0 ? (
              <option value="">No fields</option>
            ) : (
              fieldOptions.map(f => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))
            )}
          </select>
        </label>

        {settings.maskMode === 'filtered-features' ? (
          <div className="si-aoi-mask-builder__values">
            <span className="si-field-analysis-label">Filter values</span>
            {valueOptions.length === 0 ? (
              <p className="si-aoi-mask-builder__empty">No values for this field.</p>
            ) : (
              <div className="si-aoi-mask-builder__value-grid" role="group" aria-label="Filter values">
                {valueOptions.map(choice => (
                  <label key={choice} className="si-aoi-mask-builder__value-chip">
                    <input
                      type="checkbox"
                      checked={isSiAoiMaskFilterValueSelected(settings.filterValues, choice)}
                      onChange={() => toggleValue(choice)}
                    />
                    <span>{choice}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <label className="si-field-analysis-field si-field-analysis-field--labeled">
          <span className="si-field-analysis-label">Sentinel layer</span>
          <select
            className="si-field-analysis-select"
            value={settings.sentinelLayerId || defaultSentinelLayerId}
            onChange={e => patch({ sentinelLayerId: e.target.value })}
            aria-label="Sentinel analysis layer"
          >
            {sentinelLayerOptions.map(l => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="si-field-analysis-field si-field-analysis-field--labeled">
          <span className="si-field-analysis-label">Mask mode</span>
          <select
            className="si-field-analysis-select"
            value={settings.maskMode}
            onChange={e => patch({ maskMode: e.target.value as SiAoiMaskMode })}
            aria-label="Mask mode"
          >
            {MASK_MODES.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="si-field-analysis-field si-field-analysis-field--labeled">
          <span className="si-field-analysis-label">Display mode</span>
          <select
            className="si-field-analysis-select"
            value={settings.displayMode}
            onChange={e => patch({ displayMode: e.target.value as SiAoiMaskDisplayMode })}
            aria-label="Display mode"
          >
            {DISPLAY_MODES.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="si-field-analysis-checkbox-row si-aoi-mask-builder__live">
          <input
            type="checkbox"
            checked={settings.liveUpdate}
            onChange={e => patch({ liveUpdate: e.target.checked })}
            aria-label="Live update mask on filter change"
          />
          <span>Live update (auto refresh mask)</span>
        </label>

        {settings.enabled ? (
          <p className="si-field-analysis-wms-zoom-hint" role="status">
            {settings.maskMode === 'selected-features' ? (
              <>
                Map/table selection: <strong>{selectedFeatureCount}</strong> · Mask polygons:{' '}
                <strong>{maskFeatureCount}</strong>
              </>
            ) : (
              <>
                Mask active on <strong>{maskFeatureCount}</strong> polygon{maskFeatureCount === 1 ? '' : 's'}
              </>
            )}
          </p>
        ) : null}
      </fieldset>
        )
      ) : null}

      {settings.enabled && !flat ? (
      <button
        type="button"
        className="si-aoi-mask-builder__reset"
        onClick={() => onChange({ ...DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS })}
      >
        Reset builder defaults
      </button>
      ) : null}
    </div>
  )
}
