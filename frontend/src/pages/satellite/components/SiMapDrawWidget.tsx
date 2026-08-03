import type { RemoteSensingDrawingTool } from './RemoteSensingDrawingToolbar'
import { useMapOverlayIsolation } from '../useMapOverlayIsolation'
import './SiMapDrawWidget.css'

export type SiMapDrawWidgetProps = {
  /** Widget only renders when drawing mode is active. */
  active: boolean
  activeTool: RemoteSensingDrawingTool | null
  onToolChange: (tool: RemoteSensingDrawingTool) => void
  hasClearableDrawing: boolean
  onClearDrawing: () => void
  /** Deactivate drawing (turns the widget off — activation lives in the Main Toolbox). */
  onDeactivate: () => void
  /** Map-navigation tools (Pan / Move-lock) surfaced inside the Edit tools. */
  panActive?: boolean
  panLocked?: boolean
  onPan?: () => void
  onTogglePanLock?: () => void
}

const SHAPE_TOOLS: Array<{ id: RemoteSensingDrawingTool; icon: string; title: string }> = [
  { id: 'point', icon: 'fa-solid fa-location-dot', title: 'Point' },
  { id: 'circle', icon: 'fa-regular fa-circle', title: 'Circle' },
  { id: 'rectangle', icon: 'fa-regular fa-square', title: 'Rectangle' },
  { id: 'polygon', icon: 'fa-solid fa-draw-polygon', title: 'Polygon' },
]

/**
 * Compact, modern floating drawing widget rendered over the map canvas.
 * Activation is toggled from the Main Toolbox; this only surfaces the shape tools.
 */
export function SiMapDrawWidget({
  active,
  activeTool,
  onToolChange,
  hasClearableDrawing,
  onClearDrawing,
  onDeactivate,
  panActive,
  panLocked,
  onPan,
  onTogglePanLock,
}: SiMapDrawWidgetProps) {
  const isolationProps = useMapOverlayIsolation(active, { native: true })

  if (!active) return null

  const hasNavTools = !!(onPan || onTogglePanLock)

  return (
    <div {...isolationProps} className="si-map-draw-widget" role="toolbar" aria-label="Drawing tools">
      <span className="si-map-draw-widget__brand">
        <i className="fa-solid fa-pen-ruler" aria-hidden />
        <span className="si-map-draw-widget__brand-text">Draw</span>
      </span>

      <span className="si-map-draw-widget__sep" aria-hidden />

      <div className="si-map-draw-widget__tools">
        {SHAPE_TOOLS.map(tool => (
          <button
            key={tool.id}
            type="button"
            className={`si-map-draw-widget__tool${activeTool === tool.id ? ' is-on' : ''}`}
            title={tool.title}
            aria-label={tool.title}
            aria-pressed={activeTool === tool.id}
            onClick={() => onToolChange(tool.id)}
          >
            <i className={tool.icon} aria-hidden />
          </button>
        ))}
      </div>

      {hasNavTools ? (
        <>
          <span className="si-map-draw-widget__sep" aria-hidden />
          <div className="si-map-draw-widget__tools">
            {onPan ? (
              <button
                type="button"
                className={`si-map-draw-widget__tool${panActive ? ' is-on' : ''}`}
                title="Pan map"
                aria-label="Pan map"
                aria-pressed={!!panActive}
                onClick={onPan}
              >
                <i className="fa-solid fa-hand" aria-hidden />
              </button>
            ) : null}
            {onTogglePanLock ? (
              <button
                type="button"
                className={`si-map-draw-widget__tool${panLocked ? ' is-on' : ''}`}
                title={panLocked ? 'Map pan locked — click to unlock' : 'Lock map pan'}
                aria-label={panLocked ? 'Map pan locked' : 'Lock map pan'}
                aria-pressed={!!panLocked}
                onClick={onTogglePanLock}
              >
                <i className="fa-solid fa-up-down-left-right" aria-hidden />
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <span className="si-map-draw-widget__sep" aria-hidden />

      <button
        type="button"
        className="si-map-draw-widget__tool si-map-draw-widget__tool--clear"
        disabled={!hasClearableDrawing}
        title="Clear AOI sketch (analysis layers stay on map)"
        aria-label="Clear drawing"
        onClick={onClearDrawing}
      >
        <i className="fa-solid fa-eraser" aria-hidden />
      </button>

      <button
        type="button"
        className="si-map-draw-widget__tool si-map-draw-widget__close"
        title="Turn off drawing"
        aria-label="Turn off drawing"
        onClick={onDeactivate}
      >
        <i className="fa-solid fa-xmark" aria-hidden />
      </button>
    </div>
  )
}
