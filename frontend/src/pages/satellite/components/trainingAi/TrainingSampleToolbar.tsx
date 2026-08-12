import type { TrainingDrawTool } from '../../../../lib/trainingAi/trainingSampleStore'

export type TrainingSampleToolbarProps = {
  drawTool: TrainingDrawTool
  onDrawToolChange: (tool: TrainingDrawTool) => void
  digitizing: boolean
  onDigitizingChange: (active: boolean) => void
  disabled?: boolean
}

const TOOLS: Array<{ id: TrainingDrawTool; icon: string; title: string }> = [
  { id: 'point', icon: 'fa-solid fa-location-dot', title: 'Draw point' },
  { id: 'polygon', icon: 'fa-solid fa-draw-polygon', title: 'Draw polygon' },
  { id: 'rectangle', icon: 'fa-regular fa-square', title: 'Draw rectangle' },
  { id: 'circle', icon: 'fa-regular fa-circle', title: 'Draw circle' },
  { id: 'select', icon: 'fa-solid fa-arrow-pointer', title: 'Select / edit' },
]

export function TrainingSampleToolbar({
  drawTool,
  onDrawToolChange,
  digitizing,
  onDigitizingChange,
  disabled,
}: TrainingSampleToolbarProps) {
  const pick = (tool: TrainingDrawTool) => {
    onDrawToolChange(tool)
    if (tool === 'select') onDigitizingChange(false)
    else onDigitizingChange(true)
  }

  return (
    <div className="si-tai__toolbar" role="toolbar" aria-label="Training sample drawing">
      {TOOLS.map(t => {
        const active =
          t.id === 'select'
            ? drawTool === 'select' || !digitizing
            : drawTool === t.id && digitizing
        return (
          <button
            key={t.id}
            type="button"
            className={`si-tai__icon-btn${active ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => pick(t.id)}
            title={t.title}
            aria-label={t.title}
            aria-pressed={active}
          >
            <i className={t.icon} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
