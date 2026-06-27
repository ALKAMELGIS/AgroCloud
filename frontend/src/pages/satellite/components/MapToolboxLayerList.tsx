import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SiCopyTextButton } from './SiCopyTextButton'
import './MapToolboxLayerList.css'

export type MapToolboxLayerListItem = {
  id: string
  label: string
  meta?: string
  visible: boolean
  toggleable: boolean
  onToggle: () => void
  /** 'raster' | 'vector' drives the type icon and which options are offered. */
  kind?: 'raster' | 'vector'
  /** Live layer opacity (0..1). When provided with onOpacityChange a slider is shown. */
  opacity?: number
  onOpacityChange?: (value: number) => void
  /** Optional GIS export (raster layers → GeoTIFF). */
  onExport?: () => void
  /** Optional removal from the map. */
  onRemove?: () => void
  /** Legacy inline action buttons (kept for base-overlay rows). */
  actions?: ReactNode
}

type MapToolboxLayerRowProps = Omit<MapToolboxLayerListItem, 'id'>

/** Floating, portal-positioned options menu (ArcGIS-style ⋯ dropdown). */
function LayerOptionsMenu({
  label,
  kind,
  visible,
  onToggle,
  opacity,
  onOpacityChange,
  onExport,
  onRemove,
}: {
  label: string
  kind?: 'raster' | 'vector'
  visible?: boolean
  onToggle?: () => void
  opacity?: number
  onOpacityChange?: (value: number) => void
  onExport?: () => void
  onRemove?: () => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const place = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const width = 224
    let left = r.right - width
    if (left < 8) left = 8
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width
    setCoords({ top: r.bottom + 6, left })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onReflow = () => place()
    // Capture phase: the dock stops pointer/mouse events in the bubble phase
    // (map-overlay isolation), so a bubble-phase document listener would never
    // see clicks inside the dock. Capture runs before that stop, so click-away
    // still closes the menu.
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, place])

  const hasOpacity = typeof opacity === 'number' && !!onOpacityChange

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`si-mt-layer__opts-btn${open ? ' is-open' : ''}`}
        title="Layer options"
        aria-label={`Options for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <i className="fa-solid fa-ellipsis" aria-hidden />
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={popRef}
              className="si-mt-layer-menu"
              role="menu"
              style={{ top: coords.top, left: coords.left }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="si-mt-layer-menu__head">
                <span className="si-mt-layer-menu__type" aria-hidden>
                  <i className={`fa-solid ${kind === 'raster' ? 'fa-layer-group' : 'fa-draw-polygon'}`} />
                </span>
                <span className="si-mt-layer-menu__name" title={label}>
                  {label}
                </span>
              </div>

              {onToggle ? (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={!!visible}
                  className="si-mt-layer-menu__item"
                  onClick={() => onToggle()}
                >
                  <i className={`fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
                  <span>{visible ? 'Displayed on map' : 'Hidden — show on map'}</span>
                </button>
              ) : null}

              {onToggle && hasOpacity ? <div className="si-mt-layer-menu__sep" /> : null}

              {hasOpacity ? (
                <div className="si-mt-layer-menu__opacity">
                  <div className="si-mt-layer-menu__opacity-row">
                    <span>Layer opacity</span>
                    <span className="si-mt-layer-menu__opacity-val">{Math.round((opacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={opacity ?? 1}
                    onChange={e => onOpacityChange?.(Number(e.target.value))}
                    aria-label={`${label} opacity`}
                  />
                </div>
              ) : null}

              {onExport || onRemove ? <div className="si-mt-layer-menu__sep" /> : null}

              {onExport ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onExport()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-file-export" aria-hidden />
                  <span>Export raster (GeoTIFF)</span>
                </button>
              ) : null}

              {onRemove ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item si-mt-layer-menu__item--danger"
                  onClick={() => {
                    onRemove()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-trash-can" aria-hidden />
                  <span>Remove layer</span>
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export function MapToolboxLayerRow({
  label,
  visible,
  toggleable,
  onToggle,
  kind,
  opacity,
  onOpacityChange,
  onExport,
  onRemove,
  actions,
}: MapToolboxLayerRowProps) {
  const hasMenu = !!(onRemove || onExport || (typeof opacity === 'number' && onOpacityChange))
  return (
    <div className={`si-mt-layer${visible ? ' si-mt-layer--on' : ''}${!toggleable ? ' si-mt-layer--static' : ''}`}>
      <div className="si-mt-layer__accent" aria-hidden />
      <div className="si-mt-layer__main">
        {kind ? (
          <span
            className={`si-mt-layer__type si-mt-layer__type--${kind}`}
            title={kind === 'raster' ? 'Raster layer' : 'Vector layer'}
            aria-hidden
          >
            <i className={`fa-solid ${kind === 'raster' ? 'fa-layer-group' : 'fa-draw-polygon'}`} />
          </span>
        ) : null}
        <div className="si-mt-layer__text">
          <span className="si-mt-layer__name" title={label}>
            {label}
          </span>
        </div>
        <div className="si-mt-layer__controls">
          {toggleable ? (
            <label className="si-mt-layer__switch" title={visible ? 'Display on' : 'Display off'}>
              <input
                type="checkbox"
                className="si-mt-layer__switch-input"
                checked={visible}
                onChange={() => onToggle()}
                aria-label={`${visible ? 'Turn off' : 'Turn on'} ${label}`}
              />
              <span className="si-mt-layer__switch-ui" aria-hidden />
            </label>
          ) : (
            <span className="si-mt-layer__always">Always on</span>
          )}
          {hasMenu ? (
            <LayerOptionsMenu
              label={label}
              kind={kind}
              visible={visible}
              onToggle={toggleable ? onToggle : undefined}
              opacity={opacity}
              onOpacityChange={onOpacityChange}
              onExport={onExport}
              onRemove={onRemove}
            />
          ) : (
            <SiCopyTextButton
              text={label}
              className="si-mt-layer__copy"
              title="Copy layer name"
              ariaLabel={`Copy ${label}`}
              variant="compact"
            />
          )}
        </div>
      </div>
      {actions ? <div className="si-mt-layer__actions">{actions}</div> : null}
    </div>
  )
}

export function MapToolboxLayerList({
  layers,
  emptyMessage = 'No layers on map.',
}: {
  layers: MapToolboxLayerListItem[]
  emptyMessage?: string
}) {
  if (!layers.length) {
    return <p className="si-mt-layer-list__empty">{emptyMessage}</p>
  }
  return (
    <div className="si-mt-layer-list" role="list" aria-label="Map layers">
      {layers.map(layer => (
        <MapToolboxLayerRow
          key={layer.id}
          label={layer.label}
          meta={layer.meta}
          visible={layer.visible}
          toggleable={layer.toggleable}
          onToggle={layer.onToggle}
          kind={layer.kind}
          opacity={layer.opacity}
          onOpacityChange={layer.onOpacityChange}
          onExport={layer.onExport}
          onRemove={layer.onRemove}
          actions={layer.actions}
        />
      ))}
    </div>
  )
}
