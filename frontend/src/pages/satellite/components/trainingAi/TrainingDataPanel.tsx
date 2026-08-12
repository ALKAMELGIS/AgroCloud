import { useEffect, useId, useRef, useState } from 'react'
import { TrainingSampleToolbar } from './TrainingSampleToolbar'
import { TrainingClassManager } from './TrainingClassManager'
import { TrainingDatasetList } from './TrainingDatasetList'
import type {
  TrainingClass,
  TrainingDrawTool,
  TrainingImportResult,
  TrainingSample,
} from '../../../../lib/trainingAi/trainingSampleStore'

export type TrainingDataPanelProps = {
  classes: TrainingClass[]
  activeClassId: number
  onActiveClassChange: (id: number) => void
  onAddClass: () => void
  onRemoveClass: (id: number) => void
  counts: Array<{ class_id: number; class_name: string; color: string; count: number }>
  samples: TrainingSample[]
  selectedSampleId: string | null
  onSelectSample: (id: string | null) => void
  onChangeSampleClass: (sampleId: string, classId: number) => void
  onDeleteSample: (sampleId: string) => void
  drawTool: TrainingDrawTool
  onDrawToolChange: (tool: TrainingDrawTool) => void
  digitizing: boolean
  onDigitizingChange: (active: boolean) => void
  onSaveSamples: () => void
  onImportSamplesFile: (file: File, mode: 'replace' | 'merge') => Promise<TrainingImportResult>
  onExportGeojson: () => void
  onExportGpkg: () => void
  onExportCsv: () => void
  onZoomToLiveSamples?: () => void
  disabled?: boolean
}

export function TrainingDataPanel(props: TrainingDataPanelProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [ioStatus, setIoStatus] = useState<string | null>(null)
  const [ioError, setIoError] = useState<string | null>(null)
  const exportWrapRef = useRef<HTMLDivElement | null>(null)
  const importWrapRef = useRef<HTMLDivElement | null>(null)
  const geojsonInputRef = useRef<HTMLInputElement | null>(null)
  const csvInputRef = useRef<HTMLInputElement | null>(null)
  const shpInputRef = useRef<HTMLInputElement | null>(null)
  const xlsxInputRef = useRef<HTMLInputElement | null>(null)
  const menuId = useId()
  const importMenuId = useId()
  const hasSamples = props.samples.length > 0
  const hasPoints = props.samples.some(s => s.geometry_type === 'Point')
  const exportDisabled = !hasSamples || Boolean(props.disabled)
  const saveDisabled = !hasSamples || Boolean(props.disabled)

  useEffect(() => {
    if (!exportOpen && !importOpen) return
    const onDoc = (e: MouseEvent) => {
      if (exportOpen && !exportWrapRef.current?.contains(e.target as Node)) setExportOpen(false)
      if (importOpen && !importWrapRef.current?.contains(e.target as Node)) setImportOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportOpen(false)
        setImportOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportOpen, importOpen])

  const runExport = (fn: () => void) => {
    fn()
    setExportOpen(false)
  }

  const handleSave = () => {
    setIoError(null)
    try {
      props.onSaveSamples()
      setIoStatus(`Saved ${props.samples.length} samples (GeoJSON download).`)
    } catch (err) {
      setIoStatus(null)
      setIoError((err as Error)?.message || 'Save failed.')
    }
  }

  const pickImportMode = (): 'replace' | 'merge' | null => {
    if (!props.samples.length) return 'replace'
    const replace = window.confirm(
      'Replace existing samples with the imported file?\n\nOK = Replace\nCancel = Merge with current samples',
    )
    return replace ? 'replace' : 'merge'
  }

  const handleImportFile = async (file: File | null) => {
    setImportOpen(false)
    if (!file) return
    const mode = pickImportMode()
    if (!mode) return
    setIoError(null)
    setIoStatus(null)
    try {
      const result = await props.onImportSamplesFile(file, mode)
      const warn =
        result.warnings.length > 0 ? ` (${result.warnings.length} skipped)` : ''
      setIoStatus(
        `${mode === 'replace' ? 'Replaced with' : 'Merged'} ${result.importedCount} sample${
          result.importedCount === 1 ? '' : 's'
        }${warn}.`,
      )
    } catch (err) {
      setIoError((err as Error)?.message || 'Import failed.')
    }
  }

  return (
    <div className="si-tai__section">
      <TrainingSampleToolbar
        drawTool={props.drawTool}
        onDrawToolChange={props.onDrawToolChange}
        digitizing={props.digitizing}
        onDigitizingChange={props.onDigitizingChange}
        disabled={props.disabled}
      />
      <TrainingClassManager
        classes={props.classes}
        activeClassId={props.activeClassId}
        onActiveClassChange={props.onActiveClassChange}
        onAddClass={props.onAddClass}
        onRemoveClass={props.onRemoveClass}
        counts={props.counts}
        disabled={props.disabled}
      />

      {hasSamples ? (
        <div
          className="si-tai__live-results"
          aria-live="polite"
          aria-label="Live results from training samples"
        >
          <ul className="si-tai__live-results-list">
            {props.counts
              .filter(c => c.count > 0)
              .map(c => (
                <li key={c.class_id}>
                  <span
                    className="si-tai__live-results-swatch"
                    style={{ background: c.color }}
                    aria-hidden
                  />
                  {c.class_name}: <strong>{c.count}</strong>
                </li>
              ))}
          </ul>
          {props.onZoomToLiveSamples ? (
            <button
              type="button"
              className="si-tai__btn si-tai__btn--compact"
              onClick={props.onZoomToLiveSamples}
            >
              Zoom to Live Results
            </button>
          ) : null}
        </div>
      ) : null}

      <TrainingDatasetList
        samples={props.samples}
        classes={props.classes}
        selectedSampleId={props.selectedSampleId}
        onSelect={props.onSelectSample}
        onChangeClass={props.onChangeSampleClass}
        onDelete={props.onDeleteSample}
        disabled={props.disabled}
        actions={
          <div className="si-tai__io-actions">
            <button
              type="button"
              className="si-tai__btn si-tai__btn--compact si-tai__btn--save"
              disabled={saveDisabled}
              title={hasSamples ? 'Download samples package (GeoJSON)' : 'Draw samples before saving'}
              onClick={handleSave}
            >
              <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
              Save
            </button>
            <div className="si-tai__import" ref={importWrapRef}>
              <button
                type="button"
                className={`si-tai__btn si-tai__btn--compact si-tai__import-trigger${
                  importOpen ? ' is-open' : ''
                }`}
                disabled={Boolean(props.disabled)}
                aria-haspopup="menu"
                aria-expanded={importOpen}
                aria-controls={importMenuId}
                title="Import samples from file"
                onClick={() => {
                  setExportOpen(false)
                  setImportOpen(v => !v)
                }}
              >
                <i className="fa-solid fa-file-import" aria-hidden="true" />
                Import
                <i className={`fa-solid fa-chevron-${importOpen ? 'up' : 'down'}`} aria-hidden="true" />
              </button>
              {importOpen ? (
                <div
                  id={importMenuId}
                  className="si-tai__export-menu si-tai__import-menu"
                  role="menu"
                  aria-label="Import formats"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="si-tai__export-item"
                    onClick={() => geojsonInputRef.current?.click()}
                  >
                    <i className="fa-solid fa-file-code" aria-hidden="true" />
                    GeoJSON / JSON
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="si-tai__export-item"
                    onClick={() => csvInputRef.current?.click()}
                  >
                    <i className="fa-solid fa-file-csv" aria-hidden="true" />
                    CSV (points)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="si-tai__export-item"
                    title="ZIP with .shp + .dbf (+ .shx/.prj)"
                    onClick={() => shpInputRef.current?.click()}
                  >
                    <i className="fa-solid fa-draw-polygon" aria-hidden="true" />
                    Shapefile (ZIP)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="si-tai__export-item"
                    title="Excel points — lon/lat + class columns"
                    onClick={() => xlsxInputRef.current?.click()}
                  >
                    <i className="fa-solid fa-file-excel" aria-hidden="true" />
                    Excel (.xlsx)
                  </button>
                </div>
              ) : null}
            </div>
            <input
              ref={geojsonInputRef}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              hidden
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                e.target.value = ''
                void handleImportFile(f)
              }}
            />
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                e.target.value = ''
                void handleImportFile(f)
              }}
            />
            <input
              ref={shpInputRef}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                e.target.value = ''
                void handleImportFile(f)
              }}
            />
            <input
              ref={xlsxInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              hidden
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                e.target.value = ''
                void handleImportFile(f)
              }}
            />
          </div>
        }
      />
      {ioStatus ? <p className="si-tai__hint si-tai__hint--ok">{ioStatus}</p> : null}
      {ioError ? <p className="si-tai__warn">{ioError}</p> : null}

      <div className="si-tai__export" ref={exportWrapRef}>
        <button
          type="button"
          className={`si-tai__btn si-tai__export-trigger${exportOpen ? ' is-open' : ''}`}
          disabled={exportDisabled}
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          aria-controls={menuId}
          onClick={() => {
            setImportOpen(false)
            setExportOpen(v => !v)
          }}
        >
          <i className="fa-solid fa-download" aria-hidden="true" />
          Export
          <i className={`fa-solid fa-chevron-${exportOpen ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
        {exportOpen ? (
          <div id={menuId} className="si-tai__export-menu" role="menu" aria-label="Export formats">
            <button
              type="button"
              role="menuitem"
              className="si-tai__export-item"
              onClick={() => runExport(props.onExportGeojson)}
            >
              <i className="fa-solid fa-file-code" aria-hidden="true" />
              GeoJSON
            </button>
            <button
              type="button"
              role="menuitem"
              className="si-tai__export-item"
              title="GeoJSON companion for GeoPackage workflows"
              onClick={() => runExport(props.onExportGpkg)}
            >
              <i className="fa-solid fa-database" aria-hidden="true" />
              GeoPackage
            </button>
            <button
              type="button"
              role="menuitem"
              className="si-tai__export-item"
              disabled={!hasPoints}
              title={hasPoints ? 'Export point samples as CSV' : 'No point samples to export'}
              onClick={() => {
                if (!hasPoints) return
                runExport(props.onExportCsv)
              }}
            >
              <i className="fa-solid fa-file-csv" aria-hidden="true" />
              CSV (points)
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
