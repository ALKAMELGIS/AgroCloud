import { useRef } from 'react'
import type {
  SamTrainDrawTool,
  UseSamTrainingSamplesReturn,
} from './useSamTrainingSamples'
import './SamTrainingSamplesManager.css'

export type SamTrainingSamplesManagerProps = {
  train: UseSamTrainingSamplesReturn
  /** Whether the map is currently in training-sample digitizing mode. */
  digitizing: boolean
  onDigitizingChange: (active: boolean) => void
  /** Promote the current SAM result features into samples for the active class. */
  canAddFromSam: boolean
  onAddFromSam: (asMask: boolean) => void
}

const DRAW_TOOLS: Array<{ id: SamTrainDrawTool; icon: string; title: string }> = [
  { id: 'point', icon: 'fa-location-dot', title: 'Point' },
  { id: 'rectangle', icon: 'fa-vector-square', title: 'Rectangle' },
  { id: 'polygon', icon: 'fa-draw-polygon', title: 'Polygon' },
  { id: 'circle', icon: 'fa-circle', title: 'Circle' },
  { id: 'freehand', icon: 'fa-pencil', title: 'Freehand polygon' },
  { id: 'polyline', icon: 'fa-minus', title: 'Polyline' },
  { id: 'select', icon: 'fa-arrow-pointer', title: 'Select' },
]

export function SamTrainingSamplesManager({
  train,
  digitizing,
  onDigitizingChange,
  canAddFromSam,
  onAddFromSam,
}: SamTrainingSamplesManagerProps) {
  const schemaInputRef = useRef<HTMLInputElement | null>(null)
  const samplesInputRef = useRef<HTMLInputElement | null>(null)

  const selectDrawTool = (tool: SamTrainDrawTool) => {
    train.setDrawTool(tool)
    if (tool === 'select') {
      onDigitizingChange(false)
      return
    }
    if (!train.activeClassId) return
    onDigitizingChange(true)
  }

  return (
    <div className="si-sts">
      <header className="si-sts__titlebar">
        <span className="si-sts__title">
          Training Samples Manager
          <em> : {train.schemaName}</em>
        </span>
      </header>

      {/* ── Schema + draw tools ── */}
      <div className="si-sts__toolbar" role="toolbar" aria-label="Schema and draw tools">
        {DRAW_TOOLS.map(t => (
          <button
            key={t.id}
            type="button"
            className={
              'si-sts__tool' +
              (digitizing && train.drawTool === t.id ? ' is-active' : '') +
              (!digitizing && t.id === 'select' ? ' is-active' : '')
            }
            title={t.title}
            aria-label={t.title}
            aria-pressed={digitizing ? train.drawTool === t.id : t.id === 'select'}
            onClick={() => selectDrawTool(t.id)}
            disabled={!train.activeClassId && t.id !== 'select'}
          >
            <i className={`fa-solid ${t.icon}`} aria-hidden />
          </button>
        ))}
        <span className="si-sts__sep" aria-hidden />
        <button
          type="button"
          className="si-sts__tool"
          title="New schema (reset to NLCD)"
          onClick={() => {
            if (confirm('Reset schema to default NLCD classes and clear samples?')) train.resetSchema()
          }}
        >
          <i className="fa-solid fa-list-ul" aria-hidden />
        </button>
        <button
          type="button"
          className="si-sts__tool"
          title="Open schema JSON"
          onClick={() => schemaInputRef.current?.click()}
        >
          <i className="fa-solid fa-folder-open" aria-hidden />
        </button>
        <button type="button" className="si-sts__tool" title="Save schema" onClick={train.saveSchema}>
          <i className="fa-solid fa-floppy-disk" aria-hidden />
        </button>
        <button
          type="button"
          className="si-sts__tool si-sts__tool--accent"
          title="Add class"
          onClick={() => train.addClass()}
        >
          <i className="fa-solid fa-plus" aria-hidden />
        </button>
        <input
          ref={schemaInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void train.importSchemaJson(f).catch(err => alert(String(err?.message || err)))
          }}
        />
      </div>

      <div className="si-sts__schema" role="tree" aria-label="Class schema">
        <button
          type="button"
          className="si-sts__schema-root is-selected"
          title="Schema root"
        >
          <i className="fa-solid fa-folder-tree" aria-hidden /> {train.schemaName}
        </button>
        <ul className="si-sts__class-list">
          {train.classes.map(c => (
            <li key={c.id}>
              <button
                type="button"
                className={'si-sts__class' + (train.activeClassId === c.id ? ' is-active' : '')}
                onClick={() => train.setActiveClassId(c.id)}
                onDoubleClick={() => {
                  const name = prompt('Rename class', c.name)
                  if (name) train.renameClass(c.id, name)
                }}
              >
                <span className="si-sts__swatch" style={{ background: c.color }} aria-hidden />
                <span className="si-sts__class-name">{c.name}</span>
              </button>
              <button
                type="button"
                className="si-sts__class-del"
                title="Remove class"
                onClick={() => train.removeClass(c.id)}
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Samples actions ── */}
      <div className="si-sts__toolbar si-sts__toolbar--samples" role="toolbar" aria-label="Sample actions">
        <button
          type="button"
          className="si-sts__tool"
          title="Import samples GeoJSON"
          onClick={() => samplesInputRef.current?.click()}
        >
          <i className="fa-solid fa-folder-open" aria-hidden />
        </button>
        <button
          type="button"
          className="si-sts__tool"
          title="Export GeoJSON"
          disabled={train.sampleCount === 0}
          onClick={() => train.exportDataset('geojson')}
        >
          <i className="fa-solid fa-floppy-disk" aria-hidden />
        </button>
        <button
          type="button"
          className="si-sts__tool"
          title="Assign selected to active class"
          disabled={train.selectedSampleIds.length === 0 || !train.activeClassId}
          onClick={train.mergeSelectedIntoActive}
        >
          <i className="fa-solid fa-code-merge" aria-hidden />
        </button>
        <button
          type="button"
          className="si-sts__tool si-sts__tool--danger"
          title="Delete selected samples"
          disabled={train.selectedSampleIds.length === 0}
          onClick={() => train.removeSamples(train.selectedSampleIds)}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
        <button
          type="button"
          className="si-sts__tool"
          title="Clear all samples"
          disabled={train.sampleCount === 0}
          onClick={() => {
            if (confirm('Clear all training samples?')) train.clearSamples()
          }}
        >
          <i className="fa-solid fa-trash-can" aria-hidden />
        </button>
        <span className="si-sts__sep" aria-hidden />
        <button
          type="button"
          className="si-sts__tool si-sts__tool--wide"
          title="Add current SAM features as polygon samples"
          disabled={!canAddFromSam || !train.activeClassId}
          onClick={() => onAddFromSam(false)}
        >
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden /> From SAM
        </button>
        <button
          type="button"
          className="si-sts__tool si-sts__tool--wide"
          title="Add current SAM features as segmentation masks"
          disabled={!canAddFromSam || !train.activeClassId}
          onClick={() => onAddFromSam(true)}
        >
          <i className="fa-solid fa-masks-theater" aria-hidden /> As mask
        </button>
        <input
          ref={samplesInputRef}
          type="file"
          accept=".geojson,.json,application/geo+json"
          hidden
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void train.importSamplesGeojson(f).catch(err => alert(String(err?.message || err)))
          }}
        />
      </div>

      {/* ── Stats table ── */}
      <div className="si-sts__table-wrap">
        <table className="si-sts__table">
          <thead>
            <tr>
              <th>Class</th>
              <th># Samples</th>
              <th>Pixels (%)</th>
            </tr>
          </thead>
          <tbody>
            {train.classStats.every(r => r.sampleCount === 0) ? (
              <tr>
                <td colSpan={3} className="si-sts__empty">
                  No samples yet — select a class and draw on the map.
                </td>
              </tr>
            ) : (
              train.classStats
                .filter(r => r.sampleCount > 0)
                .map(r => (
                  <tr
                    key={r.classId}
                    className={train.activeClassId === r.classId ? 'is-active' : ''}
                    onClick={() => train.setActiveClassId(r.classId)}
                  >
                    <td>
                      <span className="si-sts__swatch" style={{ background: r.color }} aria-hidden />
                      {r.name}
                    </td>
                    <td>{r.sampleCount}</td>
                    <td>{r.pixelPct.toFixed(1)}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
