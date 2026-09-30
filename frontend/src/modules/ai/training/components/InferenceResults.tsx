export type InferenceResultsProps = {
  layerName: string | null
  visible: boolean
  opacity: number
  featureCount: number
  onToggle: (visible: boolean) => void
  onOpacityChange: (opacity: number) => void
  onZoomTo: () => void
  onRemove: () => void
}

export function InferenceResults({
  layerName,
  visible,
  opacity,
  featureCount,
  onToggle,
  onOpacityChange,
  onZoomTo,
  onRemove,
}: InferenceResultsProps) {
  if (!layerName) {
    return <p className="si-tai__hint">Inference results will appear here on the map.</p>
  }
  return (
    <div className="si-tai__section">
      <p className="si-tai__ok">
        {layerName} · {featureCount} features
      </p>
      <label className="si-tai__row si-tai__row--h">
        <span className="si-tai__label">Toggle Layer</span>
        <input type="checkbox" checked={visible} onChange={e => onToggle(e.target.checked)} />
      </label>
      <label className="si-tai__row">
        <span className="si-tai__label">Opacity {(opacity * 100).toFixed(0)}%</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={opacity}
          onChange={e => onOpacityChange(Number(e.target.value))}
        />
      </label>
      <div className="si-tai__toolbar">
        <button type="button" className="si-tai__btn" onClick={onZoomTo}>
          Zoom to Results
        </button>
        <button type="button" className="si-tai__btn si-tai__btn--danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  )
}
