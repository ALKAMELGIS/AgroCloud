import type { RemoteSensingDrawingTool } from './RemoteSensingDrawingToolbar'
import './SiCropClassificationAoiToolbar.css'

export type SiCropClassificationAoiToolbarProps = {
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

/** Standalone study-AOI drawing — isolated from Remote Sensing panel tools. */
export function SiCropClassificationAoiToolbar({
  drawingModeActive,
  onDrawingModeChange,
  activeTool,
  onToolChange,
  hasClearableDrawing,
  onClearDrawing,
}: SiCropClassificationAoiToolbarProps) {
  return (
    <div className="si-crop-class-aoi" aria-label="Crop classification study AOI tools">
      <label className="si-crop-class-aoi__stack">
        <span className="si-crop-class-aoi__label">AOI drawing layer</span>
        <div className="si-crop-class-aoi__bar">
          <button
            type="button"
            className={`si-crop-class-aoi__mode${drawingModeActive ? ' is-on' : ''}`}
            aria-pressed={drawingModeActive}
            title={drawingModeActive ? 'AOI drawing on — click to turn off' : 'AOI drawing off — click to turn on'}
            onClick={() => onDrawingModeChange(!drawingModeActive)}
          >
            <i className={`fa-solid ${drawingModeActive ? 'fa-pen-ruler' : 'fa-pen'}`} aria-hidden />
          </button>
          <div className="si-crop-class-aoi__toolgrid" role="toolbar" aria-label="Study AOI shape tools">
            {SHAPE_TOOLS.map(tool => (
              <button
                key={tool.id}
                type="button"
                className={`si-crop-class-aoi__tool${activeTool === tool.id ? ' is-on' : ''}`}
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
        className="si-crop-class-aoi__clear"
        disabled={!hasClearableDrawing}
        title="Clear study AOI sketch only (classification layer unchanged)"
        aria-label="Clear study AOI drawing"
        onClick={onClearDrawing}
      >
        <i className="fa-solid fa-eraser" aria-hidden />
        <span>Clear AOI drawing</span>
      </button>
    </div>
  )
}
