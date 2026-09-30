import './RemoteSensingDrawingToolbar.css'

export type RemoteSensingDrawingTool = 'point' | 'circle' | 'rectangle' | 'polygon'

export type RemoteSensingDrawingToolbarProps = {
  drawingModeActive: boolean
  onDrawingModeChange: (active: boolean) => void
  /** @deprecated Shape tools now live in the floating map widget (kept for API compatibility). */
  activeTool?: RemoteSensingDrawingTool | null
  /** @deprecated Shape tools now live in the floating map widget (kept for API compatibility). */
  onToolChange?: (tool: RemoteSensingDrawingTool) => void
  hasClearableDrawing: boolean
  onClearDrawing: () => void
}

export function RemoteSensingDrawingToolbar({
  hasClearableDrawing,
  onClearDrawing,
}: RemoteSensingDrawingToolbarProps) {
  // Drawing activation now lives in the Map navigation toolbar as an Edit icon;
  // this toolbar only exposes the destructive "Clear drawing" action.
  return (
    <div className="si-rs-draw" aria-label="Remote sensing drawing tools">
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
