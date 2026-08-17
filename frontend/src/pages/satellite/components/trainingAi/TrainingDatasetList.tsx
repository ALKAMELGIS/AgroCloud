import { useMemo, type ReactNode } from 'react'
import type { TrainingClass, TrainingSample } from '../../../../lib/trainingAi/trainingSampleStore'

export type TrainingDatasetListProps = {
  samples: TrainingSample[]
  classes: TrainingClass[]
  selectedSampleId: string | null
  onSelect: (id: string | null) => void
  onChangeClass: (sampleId: string, classId: number) => void
  onDelete: (sampleId: string) => void
  disabled?: boolean
  /** Save / Import controls shown in the Samples header. */
  actions?: ReactNode
}

type ClassGroup = {
  class_id: number
  class_name: string
  color: string
  samples: TrainingSample[]
}

export function TrainingDatasetList({
  samples,
  classes,
  selectedSampleId,
  onSelect,
  onChangeClass,
  onDelete,
  disabled,
  actions,
}: TrainingDatasetListProps) {
  const groups = useMemo(() => {
    const byId = new Map<number, ClassGroup>()
    for (const c of classes) {
      byId.set(c.class_id, {
        class_id: c.class_id,
        class_name: c.class_name,
        color: c.color,
        samples: [],
      })
    }
    for (const s of samples) {
      let g = byId.get(s.class_id)
      if (!g) {
        g = {
          class_id: s.class_id,
          class_name: s.class_name,
          color: classes.find(c => c.class_id === s.class_id)?.color || '#94a3b8',
          samples: [],
        }
        byId.set(s.class_id, g)
      }
      g.samples.push(s)
    }
    return [...byId.values()].filter(g => g.samples.length > 0)
  }, [samples, classes])

  let running = 0

  return (
    <div className="si-tai__dataset" aria-label="Training samples">
      <div className="si-tai__dataset-head">
        <div className="si-tai__dataset-head-main">
          <span className="si-tai__dataset-title">Samples</span>
          <span className="si-tai__dataset-meta">
            {samples.length} · {groups.length} {groups.length === 1 ? 'class' : 'classes'}
          </span>
        </div>
        {actions ? <div className="si-tai__dataset-actions">{actions}</div> : null}
      </div>

      {!samples.length ? (
        <p className="si-tai__hint">Draw on the map to add training samples, or Import a saved file.</p>
      ) : (
        <>
          <div className="si-tai__dataset-summary" aria-label="Counts by class">
            {groups.map(g => (
              <span key={g.class_id} className="si-tai__chip si-tai__chip--compact">
                <span className="si-tai__swatch" style={{ background: g.color }} />
                <em>{g.class_name}</em>
                <strong>{g.samples.length}</strong>
              </span>
            ))}
          </div>

          <ul className="si-tai__list">
            {groups.map(g => (
              <li key={g.class_id} className="si-tai__group">
                <div className="si-tai__group-head">
                  <span className="si-tai__swatch" style={{ background: g.color }} />
                  <span className="si-tai__group-name">{g.class_name}</span>
                  <span className="si-tai__group-count">{g.samples.length}</span>
                </div>
                <ul className="si-tai__group-list">
                  {g.samples.map(s => {
                    running += 1
                    const idx = running
                    return (
                      <li
                        key={s.sample_id}
                        className={`si-tai__list-item${selectedSampleId === s.sample_id ? ' is-selected' : ''}`}
                        onClick={() => onSelect(s.sample_id)}
                        title={`${s.sample_id} · ${s.image_id}`}
                      >
                        <span className="si-tai__sample-idx">{String(idx).padStart(2, '0')}</span>
                        <span className="si-tai__sample-type">{s.geometry_type}</span>
                        <select
                          className="si-tai__select si-tai__select--mini"
                          value={s.class_id}
                          disabled={disabled}
                          aria-label={`Class for sample ${idx}`}
                          onClick={e => e.stopPropagation()}
                          onChange={e => onChangeClass(s.sample_id, Number(e.target.value))}
                        >
                          {classes.map(c => (
                            <option key={c.class_id} value={c.class_id}>
                              {c.class_name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="si-tai__icon-btn si-tai__icon-btn--danger"
                          disabled={disabled}
                          title="Delete sample"
                          aria-label={`Delete sample ${idx}`}
                          onClick={e => {
                            e.stopPropagation()
                            if (window.confirm('Delete this training sample?')) onDelete(s.sample_id)
                          }}
                        >
                          <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
