import type { CutFillWizardStep } from '../../../lib/cutFill/cutFillTypes'
import type { CutFillExportKind } from '../../../lib/cutFill/cutFillExports'
import type { UseCutFillAnalysisReturn } from './useCutFillAnalysis'
import { CutFill3DView } from './CutFill3DView'
import './HydroWatershedPanel.css'
import './CutFillAnalysisPanel.css'

const STEPS: Array<{ id: CutFillWizardStep; label: string }> = [
  { id: 'surfaces', label: '① Surfaces' },
  { id: 'parameters', label: '② Parameters' },
  { id: 'analysis', label: '③ Run' },
  { id: 'results', label: '④ Results' },
  { id: 'export', label: '⑤ Export' },
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

      <div className="si-cutfill__steps" role="tablist">
        {STEPS.map(st => (
          <button
            key={st.id}
            type="button"
            role="tab"
            className={`si-cutfill__step-tab${model.step === st.id ? ' is-active' : ''}`}
            onClick={() => model.setStep(st.id)}
          >
            {st.label}
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
            <label htmlFor="cf-crs">CRS (UTM override EPSG)</label>
            <input
              id="cf-crs"
              type="number"
              placeholder="Auto UTM"
              value={model.crsOverride ?? ''}
              onChange={e => model.setCrsOverride(e.target.value ? Number(e.target.value) : null)}
            />
            <span>{model.crsLabel}</span>
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
          <div className="si-cutfill__kpis">
            <div className="si-cutfill__kpi">
              <div className="si-cutfill__kpi-label">Total cut volume</div>
              <div className="si-cutfill__kpi-value">{s.cutVolumeM3.toFixed(0)} m³</div>
            </div>
            <div className="si-cutfill__kpi">
              <div className="si-cutfill__kpi-label">Total fill volume</div>
              <div className="si-cutfill__kpi-value">{s.fillVolumeM3.toFixed(0)} m³</div>
            </div>
            <div className="si-cutfill__kpi">
              <div className="si-cutfill__kpi-label">Net volume</div>
              <div className="si-cutfill__kpi-value">{s.netVolumeM3.toFixed(0)} m³</div>
            </div>
            <div className="si-cutfill__kpi">
              <div className="si-cutfill__kpi-label">Cut area</div>
              <div className="si-cutfill__kpi-value">{(s.cutAreaM2 / 10_000).toFixed(2)} ha</div>
            </div>
            <div className="si-cutfill__kpi">
              <div className="si-cutfill__kpi-label">Fill area</div>
              <div className="si-cutfill__kpi-value">{(s.fillAreaM2 / 10_000).toFixed(2)} ha</div>
            </div>
            <div className="si-cutfill__kpi">
              <div className="si-cutfill__kpi-label">Maximum cut depth</div>
              <div className="si-cutfill__kpi-value">{s.maxCutM.toFixed(2)} m</div>
            </div>
            <div className="si-cutfill__kpi">
              <div className="si-cutfill__kpi-label">Maximum fill depth</div>
              <div className="si-cutfill__kpi-value">{s.maxFillM.toFixed(2)} m</div>
            </div>
          </div>

          <div className="si-cutfill__layer-toggles">
            {(() => {
              const classOn = !!(model.layers.cut || model.layers.fill || model.layers.classification)
              return (
                <button
                  type="button"
                  className={`si-cutfill__step-tab${classOn ? ' is-active' : ''}`}
                  aria-pressed={classOn}
                  onClick={() => model.setClassOverlay(!classOn)}
                >
                  {classOn ? '● ' : '○ '}
                  Cut/Fill
                </button>
              )
            })()}
            {(
              [
                ['difference', 'Difference'],
                ['existing', 'Existing'],
                ['design', 'Design'],
                ['existingContours', 'Existing contours'],
                ['designContours', 'Design contours'],
              ] as const
            ).map(([key, label]) => {
              const on = !!model.layers[key]
              return (
                <button
                  key={key}
                  type="button"
                  className={`si-cutfill__step-tab${on ? ' is-active' : ''}`}
                  aria-pressed={on}
                  onClick={() => model.toggleLayer(key)}
                >
                  {on ? '● ' : '○ '}
                  {label}
                </button>
              )
            })}
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
