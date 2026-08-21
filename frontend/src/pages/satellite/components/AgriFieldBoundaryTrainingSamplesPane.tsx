/**
 * Field Boundaries — Training Samples tab (Predicted → Review → Approved → Save).
 */

import type { FieldBoundaryTrainingSamplesApi } from './useFieldBoundaryTrainingSamples'
import type { FieldTrainingSample } from '../../../lib/agriFieldBoundary/fieldBoundaryTrainingSamples'

export type AgriFieldBoundaryTrainingSamplesPaneProps = {
  training: FieldBoundaryTrainingSamplesApi
  hasPredictions: boolean
  predictionCount: number
  sceneId?: string | null
  acquisitionDate?: string | null
  engine?: string | null
  onGenerate: () => void
  busy?: boolean
}

function statusLabel(s: FieldTrainingSample['status']): string {
  if (s === 'approved') return 'Approved'
  if (s === 'rejected') return 'Rejected'
  return 'Draft'
}

export function AgriFieldBoundaryTrainingSamplesPane({
  training,
  hasPredictions,
  predictionCount,
  onGenerate,
  busy = false,
}: AgriFieldBoundaryTrainingSamplesPaneProps) {
  const { counts, samples, selected, selectedId, notice, error } = training

  return (
    <div className="si-afb-train">
      <p className="si-afb-train__lead">
        Build training data from AFD predictions only after review. Pipeline:{' '}
        <strong>Predicted → Draft → Accept → Save</strong>. Drafts and rejected samples are never
        exported.
      </p>

      <div className="si-afb-train__kpis" aria-label="Training sample counts">
        <div className="si-afb-train__kpi">
          <span>Draft</span>
          <strong>{counts.draft}</strong>
        </div>
        <div className="si-afb-train__kpi si-afb-train__kpi--ok">
          <span>Approved</span>
          <strong>{counts.approved}</strong>
        </div>
        <div className="si-afb-train__kpi si-afb-train__kpi--bad">
          <span>Rejected</span>
          <strong>{counts.rejected}</strong>
        </div>
      </div>

      <div className="si-afb-train__actions">
        <button
          type="button"
          className="si-afb__btn si-afb__btn--primary"
          disabled={busy || !hasPredictions}
          title={
            hasPredictions
              ? `Copy ${predictionCount} predicted field(s) into draft samples for review`
              : 'Run Detect Fields first'
          }
          onClick={onGenerate}
        >
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden /> Generate Samples
        </button>
        <button
          type="button"
          className="si-afb__btn"
          disabled={busy || counts.draft === 0}
          title="Approve all draft samples"
          onClick={() => training.acceptAllDrafts()}
        >
          <i className="fa-solid fa-check-double" aria-hidden /> Accept all drafts
        </button>
        <button
          type="button"
          className="si-afb__btn si-afb__btn--primary"
          disabled={busy || counts.approved === 0}
          title="Download approved-only GeoJSON training set"
          onClick={() => training.saveApproved()}
        >
          <i className="fa-solid fa-floppy-disk" aria-hidden /> Save Samples
        </button>
      </div>

      {error ? (
        <div className="si-afb__status is-error" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {error}
        </div>
      ) : null}
      {notice ? (
        <div className="si-afb__status is-done" role="status">
          <i className="fa-solid fa-circle-info" aria-hidden /> {notice}
        </div>
      ) : null}

      {!samples.length ? (
        <p className="si-afb-train__empty">
          No training samples yet. Run <strong>Detect Fields</strong>, then{' '}
          <strong>Generate Samples</strong> to create drafts for review.
        </p>
      ) : (
        <ul className="si-afb-train__list" aria-label="Training samples">
          {samples.map(s => (
            <li
              key={s.sample_id}
              className={`si-afb-train__item${selectedId === s.sample_id ? ' is-selected' : ''} is-${s.status}`}
            >
              <button
                type="button"
                className="si-afb-train__item-main"
                onClick={() => training.selectSample(s.sample_id)}
              >
                <span className={`si-afb-train__badge is-${s.status}`}>{statusLabel(s.status)}</span>
                <span className="si-afb-train__item-id">{s.sample_id.slice(-10)}</span>
                {typeof s.confidence === 'number' ? (
                  <span className="si-afb-train__meta">{(s.confidence * 100).toFixed(0)}%</span>
                ) : null}
                {typeof s.area_m2 === 'number' ? (
                  <span className="si-afb-train__meta">{(s.area_m2 / 10_000).toFixed(2)} ha</span>
                ) : null}
              </button>
              <div className="si-afb-train__item-actions">
                {s.status !== 'approved' ? (
                  <button
                    type="button"
                    className="si-afb__btn si-afb__btn--compact"
                    title="Accept into training set"
                    disabled={busy}
                    onClick={() => training.acceptSample(s.sample_id)}
                  >
                    Accept
                  </button>
                ) : (
                  <button
                    type="button"
                    className="si-afb__btn si-afb__btn--compact"
                    title="Return to draft for editing"
                    disabled={busy}
                    onClick={() => training.unapproveSample(s.sample_id)}
                  >
                    Edit
                  </button>
                )}
                {s.status !== 'rejected' ? (
                  <button
                    type="button"
                    className="si-afb__btn si-afb__btn--compact"
                    title="Reject — exclude from Save"
                    disabled={busy}
                    onClick={() => training.rejectSample(s.sample_id)}
                  >
                    Reject
                  </button>
                ) : null}
                <button
                  type="button"
                  className="si-afb__btn si-afb__btn--compact"
                  title="Delete sample"
                  disabled={busy}
                  onClick={() => training.deleteSample(s.sample_id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <label className="si-afb__row si-afb-train__note">
          <span className="si-afb__label">Review note (selected)</span>
          <input
            type="text"
            className="si-afb__select"
            value={selected.note || ''}
            disabled={busy}
            placeholder="Optional correction note…"
            onChange={e => training.setSampleNote(selected.sample_id, e.target.value)}
          />
        </label>
      ) : null}

      {samples.length ? (
        <div className="si-afb-train__footer">
          <button
            type="button"
            className="si-afb__btn si-afb__btn--ghost"
            disabled={busy}
            onClick={() => training.clearAll()}
          >
            Clear all samples
          </button>
        </div>
      ) : null}
    </div>
  )
}
