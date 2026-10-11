import type { CutFillWizardStep } from './cutFillTypes'
import type { CutFillExportKind } from './cutFillExports'
import type { UseCutFillAnalysisReturn } from './useCutFillAnalysis'
import { CutFill3DView } from './CutFill3DView'
import '../spatial-analysis/hydro-watershed/HydroWatershedPanel.css'
import './CutFillAnalysisPanel.css'

const STEPS: Array<{ id: CutFillWizardStep; label: string; icon: string }> = [
  { id: 'surfaces', label: 'Surfaces', icon: 'fa-layer-group' },
  { id: 'parameters', label: 'Params', icon: 'fa-sliders' },
  { id: 'analysis', label: 'Run', icon: 'fa-play' },
  { id: 'results', label: 'Results', icon: 'fa-chart-column' },
  { id: 'export', label: 'Export', icon: 'fa-file-export' },
]

const RESULT_LAYER_CHIPS: Array<
  | { kind: 'class'; label: string; icon: string; tone: 'cutfill' }
  | { kind: 'layer'; key: keyof UseCutFillAnalysisReturn['layers']; label: string; icon: string; tone: string }
> = [
  { kind: 'class', label: 'Cut / Fill', icon: 'fa-chart-pie', tone: 'cutfill' },
  { kind: 'layer', key: 'difference', label: 'Difference', icon: 'fa-wave-square', tone: 'diff' },
  { kind: 'layer', key: 'existing', label: 'Existing', icon: 'fa-mountain', tone: 'existing' },
  { kind: 'layer', key: 'design', label: 'Design', icon: 'fa-ruler-combined', tone: 'design' },
  { kind: 'layer', key: 'existingContours', label: 'Ex. contours', icon: 'fa-chart-area', tone: 'existing' },
  { kind: 'layer', key: 'designContours', label: 'Des. contours', icon: 'fa-drafting-compass', tone: 'design' },
]

type Props = {
  model: UseCutFillAnalysisReturn
  onRowFlyTo?: (lng: number, lat: number) => void
}

export function CutFillAnalysisPanel({ model, onRowFlyTo }: Props) {
  const running = model.progress.phase === 'dem' || model.progress.phase === 'design' || model.progress.phase === 'compute' || model.progress.phase === 'layers'
  const s = model.result?.summary

  return (
    <div className="si-hydro si-cutfill">
      <header className="si-hydro__head">
        <span className="si-hydro__brand-icon" aria-hidden>
          <i className="fa-solid fa-mound" />
        </span>
        <span className="si-hydro__brand">
          <span className="si-hydro__title">Cut &amp; Fill Analysis</span>
          <span className="si-hydro__subtitle">Engineering earthwork volumes</span>
        </span>
      </header>

      <div className="si-cutfill__steps" role="tablist" aria-label="Cut and fill workflow">
        {STEPS.map((st, index) => (
          <button
            key={st.id}
            type="button"
            role="tab"
            aria-selected={model.step === st.id}
            className={`si-cutfill__step-tab${model.step === st.id ? ' is-active' : ''}`}
            title={st.label}
            onClick={() => model.setStep(st.id)}
          >
            <span className="si-cutfill__step-icon" aria-hidden>
              <i className={`fa-solid ${st.icon}`} />
              <span className="si-cutfill__step-num">{index + 1}</span>
            </span>
            <span className="si-cutfill__step-label">{st.label}</span>
          </button>
        ))}
      </div>

      {model.step === 'surfaces' && (
        <div>
          <div className="si-cutfill__field">
            <label htmlFor="cf-existing">Existing surface</label>
            <select
              id="cf-existing"
              value={model.existingKind}
              onChange={e => model.setExistingKind(e.target.value as typeof model.existingKind)}
            >
              <option value="terrarium">Terrarium DEM (global)</option>
              <option value="geotiff">GeoTIFF upload</option>
              <option value="constant">Constant elevation</option>
            </select>
          </div>
          {model.existingKind === 'constant' ? (
            <div className="si-cutfill__field">
              <label htmlFor="cf-existing-z">Existing elevation (m)</label>
              <input
                id="cf-existing-z"
                type="number"
                value={model.existingConstantM}
                onChange={e => model.setExistingConstantM(Number(e.target.value))}
              />
            </div>
          ) : null}
          {model.existingKind === 'geotiff' ? (
            <div className="si-cutfill__field">
              <label htmlFor="cf-existing-tif">Existing GeoTIFF</label>
              <input
                id="cf-existing-tif"
                type="file"
                accept=".tif,.tiff,.geotiff"
                onChange={e => model.setExistingGeoTiff(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : null}

          <div className="si-cutfill__field">
            <label htmlFor="cf-design">Design surface</label>
            <select
              id="cf-design"
              value={model.designKind}
              onChange={e => model.setDesignKind(e.target.value as typeof model.designKind)}
            >
              <option value="constant">Target elevation (constant)</option>
              <option value="geotiff">GeoTIFF upload</option>
              <option value="xyz">XYZ / CSV points</option>
              <option value="tin">TIN / point file</option>
            </select>
          </div>
          {model.designKind === 'constant' ? (
            <div className="si-cutfill__field">
              <label htmlFor="cf-design-z">Design elevation (m)</label>
              <input
                id="cf-design-z"
                type="number"
                value={model.designConstantM}
                onChange={e => model.setDesignConstantM(Number(e.target.value))}
              />
            </div>
          ) : null}
          {model.designKind === 'geotiff' ? (
            <div className="si-cutfill__field">
              <label htmlFor="cf-design-tif">Design GeoTIFF</label>
              <input
                id="cf-design-tif"
                type="file"
                accept=".tif,.tiff,.geotiff"
                onChange={e => model.setDesignGeoTiff(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : null}
          {(model.designKind === 'xyz' || model.designKind === 'tin') && (
            <div className="si-cutfill__field">
              <label htmlFor="cf-xyz">Point coordinates (lng, lat, z per line)</label>
              <textarea
                id="cf-xyz"
                rows={5}
                value={model.designXyzText}
                onChange={e => model.setDesignXyzText(e.target.value)}
                placeholder="55.12, 25.08, 102.4"
              />
            </div>
          )}
          <p className="si-hydro__subtitle">Terrarium DEM is ~10–30 m effective resolution; upload survey GeoTIFF for engineering jobs.</p>
        </div>
      )}

      {model.step === 'parameters' && (
        <div>
          <div className="si-cutfill__field">
            <label htmlFor="cf-tol">Vertical tolerance (m)</label>
            <input
              id="cf-tol"
              type="number"
              step="0.05"
              min="0"
              value={model.verticalToleranceM}
              onChange={e => model.setVerticalToleranceM(Number(e.target.value))}
            />
          </div>
          <div className="si-cutfill__field">
            <label htmlFor="cf-contour">Contour interval (m)</label>
            <input
              id="cf-contour"
              type="number"
              min="0"
              value={model.contourIntervalM}
              onChange={e => model.setContourIntervalM(Number(e.target.value))}
            />
          </div>
          <div className="si-cutfill__field">
            <label htmlFor="cf-crs">CRS (UTM from AOI)</label>
            <input
              id="cf-crs"
              type="number"
              placeholder={model.hasAoi ? '' : 'Auto UTM'}
              className={
                !model.crsOverride && model.autoCrsEpsg != null ? 'si-cutfill__crs-auto' : undefined
              }
              value={model.effectiveCrsEpsg ?? ''}
              onChange={e => model.setCrsOverride(e.target.value ? Number(e.target.value) : null)}
            />
            <span className="si-cutfill__crs-hint">{model.crsLabel}</span>
            {model.crsOverride != null && model.autoCrsEpsg != null ? (
              <button
                type="button"
                className="si-cutfill__crs-reset"
                onClick={() => model.setCrsOverride(null)}
              >
                Use auto UTM ({model.autoCrsEpsg})
              </button>
            ) : null}
          </div>
          <div className="si-cutfill__field">
            <label htmlFor="cf-datum">Vertical datum label</label>
            <input
              id="cf-datum"
              value={model.verticalDatumLabel}
              onChange={e => model.setVerticalDatumLabel(e.target.value)}
            />
          </div>
        </div>
      )}

      {model.step === 'analysis' && (
        <div>
          <div className="si-hydro__toolbar">
            <button type="button" className="si-hydro__runall" onClick={() => void model.run()} disabled={!model.hasAoi || running || model.demLoading}>
              {running || model.demLoading ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
              ) : (
                <i className="fa-solid fa-gears" aria-hidden />
              )}
              <span>Run cut/fill</span>
            </button>
            <button type="button" className="si-hydro__export-report" onClick={model.cancel} disabled={!running}>
              Cancel
            </button>
          </div>
          {(model.demError || model.error) && (
            <p className="si-hydro__error">
              <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {model.demError || model.error}
            </p>
          )}
          {model.progress.phase !== 'idle' && (
            <div className="si-cutfill__progress">
              <div>{model.progress.message}</div>
              <div className="si-cutfill__progress-bar">
                <div className="si-cutfill__progress-fill" style={{ width: `${model.progress.percent}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {model.step === 'results' && s && (
        <div>
          {!model.mapLegendOpen ? (
            <button
              type="button"
              className="si-cutfill__legend-reopen"
              onClick={() => model.setMapLegendOpen(true)}
            >
              <i className="fa-solid fa-chart-column" aria-hidden />
              Show map legend
            </button>
          ) : null}
          <div className="si-cutfill__layer-toggles" role="group" aria-label="Map overlays">
            <div className="si-cutfill__layer-toggles-head">
              <span className="si-cutfill__layer-toggles-title">Map layers</span>
              <span className="si-cutfill__layer-toggles-hint">Toggle visibility</span>
            </div>
            <div className="si-cutfill__layer-grid">
              {RESULT_LAYER_CHIPS.map(chip => {
                if (chip.kind === 'class') {
                  const classOn = !!(
                    model.layers.cut ||
                    model.layers.fill ||
                    model.layers.noChange ||
                    model.layers.classification
                  )
                  return (
                    <button
                      key="class"
                      type="button"
                      className={`si-cutfill__layer-chip is-tone-${chip.tone}${classOn ? ' is-active' : ''}`}
                      aria-pressed={classOn}
                      title="Cut, fill, and no-change zones"
                      onClick={() => model.setClassOverlay(!classOn)}
                    >
                      <span className="si-cutfill__layer-chip-icon" aria-hidden>
                        <i className={`fa-solid ${chip.icon}`} />
                      </span>
                      <span className="si-cutfill__layer-chip-label">{chip.label}</span>
                      <span className="si-cutfill__layer-chip-state" aria-hidden>
                        <i className={`fa-solid ${classOn ? 'fa-eye' : 'fa-eye-slash'}`} />
                      </span>
                    </button>
                  )
                }
                const on = !!model.layers[chip.key]
                return (
                  <button
                    key={chip.key}
                    type="button"
                    className={`si-cutfill__layer-chip is-tone-${chip.tone}${on ? ' is-active' : ''}`}
                    aria-pressed={on}
                    title={chip.label}
                    onClick={() => model.toggleLayer(chip.key)}
                  >
                    <span className="si-cutfill__layer-chip-icon" aria-hidden>
                      <i className={`fa-solid ${chip.icon}`} />
                    </span>
                    <span className="si-cutfill__layer-chip-label">{chip.label}</span>
                    <span className="si-cutfill__layer-chip-state" aria-hidden>
                      <i className={`fa-solid ${on ? 'fa-eye' : 'fa-eye-slash'}`} />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="si-cutfill__field">
            <label htmlFor="cf-opacity">Overlay opacity {Math.round(model.layerOpacity * 100)}%</label>
            <input
              id="cf-opacity"
              type="range"
              min={0.35}
              max={1}
              step={0.05}
              value={model.layerOpacity}
              onChange={e => model.setLayerOpacity(Number(e.target.value))}
            />
          </div>

          <CutFill3DView result={model.result} />

          <div className="si-cutfill__field">
            <label htmlFor="cf-filter">Search table</label>
            <input id="cf-filter" value={model.tableFilter} onChange={e => model.setTableFilter(e.target.value)} />
          </div>
          <div className="si-cutfill__table-wrap">
            <table className="si-cutfill__table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>ΔZ</th>
                  <th>Vol</th>
                </tr>
              </thead>
              <tbody>
                {model.filteredRows.slice(0, 500).map(row => (
                  <tr
                    key={row.id}
                    className={`${row.type === 'CUT' ? 'is-cut' : 'is-fill'}${model.highlightRowId === row.id ? ' is-selected' : ''}`}
                    onClick={() => {
                      model.setHighlightRowId(row.id)
                      onRowFlyTo?.(row.lng, row.lat)
                    }}
                  >
                    <td>{row.id}</td>
                    <td>{row.type}</td>
                    <td>{row.difference.toFixed(2)}</td>
                    <td>{row.volumeM3.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {model.step === 'export' && (
        <div className="si-cutfill__export-grid">
          {(
            [
              ['csv', 'CSV'],
              ['xlsx', 'Excel'],
              ['geojson', 'GeoJSON'],
              ['geotiff', 'GeoTIFF ΔZ'],
              ['shp', 'Shapefile'],
              ['dxf', 'DXF'],
              ['pdf', 'PDF report'],
            ] as Array<[CutFillExportKind, string]>
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="si-hydro__export-report"
              disabled={!model.result}
              onClick={() => void model.exportFormat(kind)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
