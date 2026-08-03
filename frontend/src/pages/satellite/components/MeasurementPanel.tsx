import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AREA_UNIT_OPTIONS,
  DISTANCE_UNIT_OPTIONS,
  MEASURE_MODES,
  getMeasureModeSpec,
  type AreaUnit,
  type DistanceUnit,
  type MeasureComputed,
  type MeasureMode,
  type MeasureUnits,
} from '../../../lib/measurement/measurementEngine'
import { useMapOverlayIsolation } from '../useMapOverlayIsolation'
import './MeasurementPanel.css'

const PANEL_W = 228
const MARGIN = 8
/** Gap between panel right edge and the Measure rail button. */
const BTN_GAP = 10
const MEASURE_BTN_ID = 'map-toolbox-measure-btn'

type PanelPos = { x: number; y: number }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function viewportSize() {
  if (typeof window === 'undefined') return { w: 960, h: 640 }
  return { w: window.innerWidth, h: window.innerHeight }
}

function clampPos(pos: PanelPos, panelH: number): PanelPos {
  const { w, h } = viewportSize()
  const maxX = Math.max(MARGIN, w - PANEL_W - MARGIN)
  const maxY = Math.max(MARGIN, h - Math.max(120, panelH) - MARGIN)
  return {
    x: clamp(pos.x, MARGIN, maxX),
    y: clamp(pos.y, MARGIN, maxY),
  }
}

/** Place the panel just left of the map-toolbox Measure button (screenshot layout). */
function posNearMeasureButton(panelH = 260): PanelPos {
  if (typeof document === 'undefined') {
    const { w } = viewportSize()
    return { x: Math.max(MARGIN, w - PANEL_W - 56), y: 96 }
  }
  const btn = document.getElementById(MEASURE_BTN_ID)
  if (btn) {
    const r = btn.getBoundingClientRect()
    return clampPos(
      {
        x: r.left - PANEL_W - BTN_GAP,
        y: r.top,
      },
      panelH,
    )
  }
  const { w } = viewportSize()
  return clampPos({ x: w - PANEL_W - 56, y: 96 }, panelH)
}

export type MeasurementPanelProps = {
  activeMode: MeasureMode | null
  onSelectMode: (mode: MeasureMode) => void
  units: MeasureUnits
  onUnitsChange: (units: MeasureUnits) => void
  /** Live computed result for the in-progress measurement. */
  active: MeasureComputed | null
  vertexCount: number
  finished: boolean
  completedCount: number
  terrainAvailable: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onFinish: () => void
  onClearCurrent: () => void
  onClearAll: () => void
  onClose: () => void
}

export function MeasurementPanel({
  activeMode,
  onSelectMode,
  units,
  onUnitsChange,
  active,
  vertexCount,
  finished,
  completedCount,
  terrainAvailable,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFinish,
  onClearCurrent,
  onClearAll,
  onClose,
}: MeasurementPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<PanelPos>(posNearMeasureButton())
  const [pos, setPos] = useState<PanelPos>(() => posNearMeasureButton())
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)
  const userDraggedRef = useRef(false)
  const isolation = useMapOverlayIsolation(true, { native: true })
  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node
      isolation.ref?.(node)
    },
    [isolation],
  )

  useLayoutEffect(() => {
    const h = rootRef.current?.offsetHeight ?? 260
    const next = posNearMeasureButton(h)
    posRef.current = next
    setPos(next)
    userDraggedRef.current = false
  }, [])

  useEffect(() => {
    const onResize = () => {
      if (userDraggedRef.current) {
        const h = rootRef.current?.offsetHeight ?? 260
        const next = clampPos(posRef.current, h)
        posRef.current = next
        setPos(next)
        return
      }
      const h = rootRef.current?.offsetHeight ?? 260
      const next = posNearMeasureButton(h)
      posRef.current = next
      setPos(next)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /** Same pattern as GisFloatingWorkspacePanel / useGisFloatingPanel:
   * capture on the header + move/up on the header (not window). Window listeners
   * never see pointerup once map-overlay isolation stopPropagates on the panel. */
  const onDragPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, [data-drag-exclude]')) return
    e.preventDefault()
    dragOrigin.current = {
      px: e.clientX,
      py: e.clientY,
      ox: posRef.current.x,
      oy: posRef.current.y,
    }
    setDragging(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  const onDragPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const origin = dragOrigin.current
    if (!origin) return
    const h = rootRef.current?.offsetHeight ?? 260
    const next = clampPos(
      {
        x: origin.ox + (e.clientX - origin.px),
        y: origin.oy + (e.clientY - origin.py),
      },
      h,
    )
    posRef.current = next
    setPos(next)
  }, [])

  const endDrag = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!dragOrigin.current) {
      setDragging(false)
      return
    }
    dragOrigin.current = null
    userDraggedRef.current = true
    setDragging(false)
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const spec = activeMode ? getMeasureModeSpec(activeMode) : null
  const canFinish = !!spec && !finished && !spec.autoFinishCount && vertexCount >= spec.minPoints

  const style = {
    left: pos.x,
    top: pos.y,
    width: PANEL_W,
  } as CSSProperties

  const { ref: _isolationRef, ...isolationHandlers } = isolation

  const panel = (
    <div
      ref={setRootRef}
      className={`si-measure-panel${dragging ? ' si-measure-panel--dragging' : ''}`}
      role="dialog"
      aria-label="Measurement tools"
      dir="ltr"
      style={style}
      {...isolationHandlers}
    >
      <header
        className="si-measure-panel__head"
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="Drag to move"
      >
        <span className="si-measure-panel__grip" aria-hidden>
          <i className="fa-solid fa-grip-vertical" />
        </span>
        <span className="si-measure-panel__brand-icon" aria-hidden>
          <i className="fa-solid fa-ruler-combined" />
        </span>
        <span className="si-measure-panel__title">Measure</span>
        <button
          type="button"
          className="si-measure-panel__close"
          data-drag-exclude
          onClick={onClose}
          aria-label="Close measurement panel"
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="si-measure-panel__toolbar" role="toolbar" aria-label="Measurement tools">
        {MEASURE_MODES.map(m => {
          const disabled = Boolean(m.requiresTerrain && !terrainAvailable)
          const on = activeMode === m.id
          return (
            <button
              key={m.id}
              type="button"
              className={`si-measure-tool${on ? ' is-on' : ''}`}
              aria-pressed={on}
              disabled={disabled}
              title={disabled ? `${m.label} — enable 3D terrain first` : `${m.label} — ${m.hint}`}
              aria-label={m.label}
              onClick={() => onSelectMode(m.id)}
            >
              <i className={m.icon} aria-hidden />
            </button>
          )
        })}
      </div>

      <div className="si-measure-panel__units" data-drag-exclude>
        <label className="si-measure-panel__unit">
          <span>Dist</span>
          <select
            value={units.distance}
            onChange={e => onUnitsChange({ ...units, distance: e.target.value as DistanceUnit })}
          >
            {DISTANCE_UNIT_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="si-measure-panel__unit">
          <span>Area</span>
          <select value={units.area} onChange={e => onUnitsChange({ ...units, area: e.target.value as AreaUnit })}>
            {AREA_UNIT_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="si-measure-panel__result" aria-live="polite">
        {!activeMode ? (
          <p className="si-measure-panel__placeholder">Select a tool, then click the map.</p>
        ) : active && active.readouts.length ? (
          <>
            <dl className="si-measure-panel__readouts">
              {active.readouts.map((r, i) => (
                <div key={`${r.label}-${i}`} className={`si-measure-panel__readout${r.primary ? ' is-primary' : ''}`}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="si-measure-panel__hint">
              {finished ? 'Complete — start another or change tool.' : spec?.hint}
            </p>
          </>
        ) : (
          <p className="si-measure-panel__hint">{spec?.hint}</p>
        )}
      </div>

      <div className="si-measure-panel__actions" data-drag-exclude>
        <button type="button" className="si-measure-panel__icon-btn" onClick={onUndo} disabled={!canUndo} title="Undo last point" aria-label="Undo">
          <i className="fa-solid fa-rotate-left" aria-hidden />
        </button>
        <button type="button" className="si-measure-panel__icon-btn" onClick={onRedo} disabled={!canRedo} title="Redo point" aria-label="Redo">
          <i className="fa-solid fa-rotate-right" aria-hidden />
        </button>
        {canFinish ? (
          <button type="button" className="si-measure-panel__icon-btn si-measure-panel__icon-btn--primary" onClick={onFinish} title="Finish" aria-label="Finish">
            <i className="fa-solid fa-check" aria-hidden />
          </button>
        ) : null}
        <span className="si-measure-panel__actions-gap" aria-hidden />
        <button type="button" className="si-measure-panel__icon-btn" onClick={onClearCurrent} title="Clear current" aria-label="Clear current">
          <i className="fa-solid fa-eraser" aria-hidden />
        </button>
        <button
          type="button"
          className="si-measure-panel__icon-btn si-measure-panel__icon-btn--danger"
          onClick={onClearAll}
          disabled={completedCount === 0 && vertexCount === 0}
          title="Clear all"
          aria-label="Clear all"
        >
          <i className="fa-solid fa-trash-can" aria-hidden />
        </button>
      </div>

      <footer className="si-measure-panel__foot">
        <span>{completedCount} on map</span>
        {!terrainAvailable ? <span className="si-measure-panel__foot-note">3D needs terrain</span> : null}
      </footer>
    </div>
  )

  if (typeof document === 'undefined') return panel
  return createPortal(panel, document.body)
}

export default MeasurementPanel
