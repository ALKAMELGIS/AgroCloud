import type { TrainingClass } from '../../../../lib/trainingAi/trainingSampleStore'

export type TrainingClassManagerProps = {
  classes: TrainingClass[]
  activeClassId: number
  onActiveClassChange: (id: number) => void
  onAddClass: () => void
  onRemoveClass: (id: number) => void
  counts: Array<{ class_id: number; class_name: string; color: string; count: number }>
  disabled?: boolean
}

export function TrainingClassManager({
  classes,
  activeClassId,
  onActiveClassChange,
  onAddClass,
  onRemoveClass,
  disabled,
}: TrainingClassManagerProps) {
  return (
    <div className="si-tai__class-bar">
      <label className="si-tai__class-pick">
        <span className="si-tai__label">Active class</span>
        <select
          className="si-tai__select"
          value={activeClassId}
          disabled={disabled}
          aria-label="Select class"
          onChange={e => onActiveClassChange(Number(e.target.value))}
        >
          {classes.map(c => (
            <option key={c.class_id} value={c.class_id}>
              {c.class_name}
            </option>
          ))}
        </select>
      </label>
      <div className="si-tai__class-actions">
        <button type="button" className="si-tai__icon-btn" disabled={disabled} onClick={onAddClass} title="Add class" aria-label="Add class">
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="si-tai__icon-btn si-tai__icon-btn--danger"
          disabled={disabled || classes.length <= 1}
          title="Remove class"
          aria-label="Remove class"
          onClick={() => {
            if (
              window.confirm(
                `Remove class “${classes.find(c => c.class_id === activeClassId)?.class_name}” and its samples?`,
              )
            ) {
              onRemoveClass(activeClassId)
            }
          }}
        >
          <i className="fa-solid fa-trash-can" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
