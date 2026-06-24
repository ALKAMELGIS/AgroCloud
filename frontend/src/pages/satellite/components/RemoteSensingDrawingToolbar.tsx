import './RemoteSensingDrawingToolbar.css'

export type RemoteSensingDrawingTool = 'point' | 'circle' | 'rectangle' | 'polygon'

export type RemoteSensingDrawingToolbarProps = {
  drawingModeActive: boolean
  onDrawingModeChange: (active: boolean) => void
  activeTool: RemoteSensingDrawingTool | null
  onToolChange: (tool: RemoteSensingDrawingTool) => void
  hasClearableDrawing: boolean
  onClearDrawing: () => void
}

const SHAPE_TOOLS: Array<{
  id: RemoteSensingDrawingTool
  icon: string
  title: string
}> = [
  { id: 'point', icon: 'fa-solid fa-location-dot', title: 'Point' },
  { id: 'circle', icon: 'fa-regular fa-circle', title: 'Circle' },
  { id: 'rectangle', icon: 'fa-regular fa-square', title: 'Rectangle' },
  { id: 'polygon', icon: 'fa-solid fa-draw-polygon', title: 'Polygon' },
]

export function RemoteSensingDrawingToolbar({
  drawingModeActive,
  onDrawingModeChange,
  activeTool,
  onToolChange,
  hasClearableDrawing,
  onClearDrawing,
}: RemoteSensingDrawingToolbarProps) {
  return (
    <div className="si-rs-draw" aria-label="Remote sensing drawing tools">
      <label className="si-rs-panel__stack si-rs-draw__stack">
        <span className="si-rs-panel__label">Drawing tools</span>
        <div className="si-rs-draw__bar">
          <button
            type="button"
            className={`si-rs-draw__mode si-rs-panel__tool${drawingModeActive ? ' is-on' : ''}`}
            aria-pressed={drawingModeActive}
            title={drawingModeActive ? 'Drawing on — click to turn off' : 'Drawing off — click to turn on'}
            onClick={() => onDrawingModeChange(!drawingModeActive)}
          >
            <i className={`fa-solid ${drawingModeActive ? 'fa-pen-ruler' : 'fa-pen'}`} aria-hidden />
          </button>
          <div className="si-rs-draw__toolgrid" role="toolbar" aria-label="Shape tools">
            {SHAPE_TOOLS.map(tool => (
              <button
                key={tool.id}
                type="button"
                className={`si-rs-panel__tool${activeTool === tool.id ? ' is-on' : ''}`}
                title={tool.title}
                aria-label={tool.title}
                aria-pressed={activeTool === tool.id}
                disabled={!drawingModeActive}
                onClick={() => onToolChange(tool.id)}
              >
                <i className={tool.icon} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </label>

      <button
        type="button"
        className="si-rs-panel__action si-rs-draw__clear"
        disabled={!hasClearableDrawing}
        title="Clear AOI sketch only (analysis layers stay on map)"
        aria-label="Clear AOI drawing"
        onClick={onClearDrawing}
      >
        <i className="fa-solid fa-eraser" aria-hidden />
        <span>Clear drawing</span>
      </button>
    </div>
  )
}
