import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { ArcgisLayerDefLite } from '../../../lib/arcgisAttributeDisplay'
import {
  DEFAULT_SI_LAYER_LABEL_STYLE,
  ensureSiLabelPreviewFontsLoaded,
  normalizeSiLayerLabelStyle,
  resolveSiLabelPreviewCssFamily,
  SI_LABEL_FONT_DEFS,
  SI_LABEL_FONT_SIZE_OPTIONS,
  SI_LABEL_ZOOM_MAX,
  SI_LABEL_ZOOM_MIN,
  SI_LABEL_ZOOM_OPTIONS,
  type SiLayerLabelStyle,
} from '../../../lib/siLayerLabelStyle'
import './SiLayerLabelingPanel.css'

function collectLayerFieldKeys(geojson: unknown): string[] {
  const s = new Set<string>()
  const gj = geojson as { features?: unknown[] } | null | undefined
  const feats = gj?.features
  if (!Array.isArray(feats)) return []
  for (const f of feats.slice(0, 2500)) {
    const p = (f as { properties?: Record<string, unknown> })?.properties
    if (!p || typeof p !== 'object') continue
    for (const k of Object.keys(p)) {
      if (k && !k.startsWith('mapbox_')) s.add(k)
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b))
}

function collectArcgisFieldKeys(def: ArcgisLayerDefLite | null | undefined): string[] {
  const fields = (def as { fields?: Array<{ name?: unknown }> } | null | undefined)?.fields
  if (!Array.isArray(fields)) return []
  const s = new Set<string>()
  for (const f of fields) {
    const n = (f as { name?: unknown })?.name
    if (typeof n === 'string' && n.trim() && !n.startsWith('mapbox_')) s.add(n.trim())
  }
  return [...s]
}

function resolveLayerFieldKeys(layer: SiLayerLabelingPanelLayer): string[] {
  const fromGeo = collectLayerFieldKeys(layer.geojson)
  if (fromGeo.length) return fromGeo
  return collectArcgisFieldKeys(layer.arcgisLayerDefinition)
}

export type SiLayerLabelingPanelLayer = {
  id: string
  name: string
  geojson: unknown
  labelFieldName?: string | null
  labelStyle?: Partial<SiLayerLabelStyle> | null
  arcgisLayerDefinition?: ArcgisLayerDefLite | null
}

type Props = {
  layer: SiLayerLabelingPanelLayer
  /** Map container — panel docks as a small float (no modal overlay). */
  container?: HTMLElement | null
  onApply: (next: { fieldName: string | null; style: SiLayerLabelStyle }) => void
  onClose: () => void
}

const PANEL_W = 280
const DEFAULT_POS = { x: 12, y: 56 }

export function SiLayerLabelingPanel({ layer, container, onApply, onClose }: Props) {
  const fields = useMemo(
    () => resolveLayerFieldKeys(layer),
    [layer.geojson, layer.arcgisLayerDefinition, layer.id],
  )

  const [draft, setDraft] = useState<SiLayerLabelStyle>(() =>
    normalizeSiLayerLabelStyle({
      ...DEFAULT_SI_LAYER_LABEL_STYLE,
      ...(layer.labelStyle ?? {}),
      fieldName: layer.labelFieldName || layer.labelStyle?.fieldName || '',
    }),
  )

  const [pos, setPos] = useState(DEFAULT_POS)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ dx: number; dy: number; w: number; h: number } | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setDraft(
      normalizeSiLayerLabelStyle({
        ...DEFAULT_SI_LAYER_LABEL_STYLE,
        ...(layer.labelStyle ?? {}),
        fieldName: layer.labelFieldName || layer.labelStyle?.fieldName || '',
      }),
    )
  }, [layer.id, layer.labelFieldName, layer.labelStyle])

  useEffect(() => {
    // Open on the left so the right side of the map stays free for pan/zoom.
    const box = container?.getBoundingClientRect()
    if (!box) {
      setPos(DEFAULT_POS)
      return
    }
    setPos({ x: 12, y: Math.min(56, Math.max(8, box.height * 0.08)) })
  }, [layer.id, container])

  useEffect(() => {
    ensureSiLabelPreviewFontsLoaded()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clampPos = (x: number, y: number, elW: number, elH: number) => {
    const box = container?.getBoundingClientRect()
    const maxX = box ? Math.max(8, box.width - elW - 8) : Math.max(8, window.innerWidth - elW - 8)
    const maxY = box ? Math.max(8, box.height - elH - 8) : Math.max(8, window.innerHeight - elH - 8)
    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y)),
    }
  }

  const onDragPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, select, textarea, [data-drag-exclude]')) return
    const root = rootRef.current
    const box = container?.getBoundingClientRect()
    if (!root || !box) return
    const r = root.getBoundingClientRect()
    dragRef.current = {
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      w: r.width || PANEL_W,
      h: r.height || 320,
    }
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }

  const onDragPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || !container) return
    const box = container.getBoundingClientRect()
    const nx = e.clientX - box.left - dragRef.current.dx
    const ny = e.clientY - box.top - dragRef.current.dy
    setPos(clampPos(nx, ny, dragRef.current.w, dragRef.current.h))
  }

  const onDragPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    dragRef.current = null
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const previewFont = draft.fontWeight === 'bold' ? '700' : '400'
  const previewStyle = draft.fontStyle === 'italic' ? 'italic' : 'normal'
  const previewFamily = resolveSiLabelPreviewCssFamily(draft.fontFamily)

  const style = {
    left: pos.x,
    top: pos.y,
    right: 'auto',
    bottom: 'auto',
  } as CSSProperties

  const panel = (
    <aside
      ref={rootRef}
      className={`si-layer-labelcfg-float${dragging ? ' is-dragging' : ''}`}
      role="complementary"
      aria-label={`Label settings — ${layer.name}`}
      style={style}
    >
      <header
        className="si-layer-labelcfg-head"
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
        title="Drag to move"
      >
        <span className="si-layer-labelcfg-grip" aria-hidden>
          ⠿
        </span>
        <div className="si-layer-labelcfg-titles">
          <span id="si-layer-labelcfg-title" className="si-layer-labelcfg-title">
            Labels
          </span>
          <span className="si-layer-labelcfg-sub" title={layer.name}>
            {layer.name}
          </span>
        </div>
        <button
          type="button"
          className="si-layer-labelcfg-x"
          aria-label="Close"
          data-drag-exclude
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="si-layer-labelcfg-body">
        <label className="si-layer-labelcfg-field">
          <span>Field</span>
          <select
            value={draft.fieldName}
            onChange={e => setDraft(d => ({ ...d, fieldName: e.target.value }))}
            aria-label="Label attribute field"
          >
            <option value="">— Off —</option>
            {fields.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {!fields.length ? (
            <em className="si-layer-labelcfg-hint">No fields yet — zoom in, then reopen.</em>
          ) : null}
        </label>

        <div className="si-layer-labelcfg-row si-layer-labelcfg-row--3">
          <label className="si-layer-labelcfg-field">
            <span>Size</span>
            <select
              value={draft.fontSize}
              onChange={e => setDraft(d => ({ ...d, fontSize: Number(e.target.value) }))}
              aria-label="Label font size"
            >
              {SI_LABEL_FONT_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="si-layer-labelcfg-field">
            <span>Weight</span>
            <select
              value={draft.fontWeight}
              onChange={e =>
                setDraft(d => ({
                  ...d,
                  fontWeight: e.target.value as SiLayerLabelStyle['fontWeight'],
                }))
              }
              aria-label="Label font weight"
            >
              <option value="regular">Reg</option>
              <option value="bold">Bold</option>
            </select>
          </label>

          <label className="si-layer-labelcfg-field">
            <span>Style</span>
            <select
              value={draft.fontStyle}
              onChange={e =>
                setDraft(d => ({
                  ...d,
                  fontStyle: e.target.value as SiLayerLabelStyle['fontStyle'],
                }))
              }
              aria-label="Label font style"
            >
              <option value="normal">Norm</option>
              <option value="italic">Italic</option>
            </select>
          </label>
        </div>

        <div className="si-layer-labelcfg-row">
          <label className="si-layer-labelcfg-field si-layer-labelcfg-field--color">
            <span>Color</span>
            <input
              type="color"
              value={draft.textColor}
              onChange={e => setDraft(d => ({ ...d, textColor: e.target.value }))}
              aria-label="Label text color"
            />
          </label>
          <label className="si-layer-labelcfg-field si-layer-labelcfg-field--color">
            <span>Halo</span>
            <input
              type="color"
              value={draft.haloColor}
              onChange={e => setDraft(d => ({ ...d, haloColor: e.target.value }))}
              aria-label="Label halo color"
            />
          </label>
        </div>

        <div className="si-layer-labelcfg-row">
          <label className="si-layer-labelcfg-field">
            <span>Min zoom</span>
            <select
              value={draft.minZoom}
              onChange={e => {
                const minZoom = Number(e.target.value)
                setDraft(d => ({
                  ...d,
                  minZoom,
                  maxZoom: d.maxZoom <= minZoom ? Math.min(SI_LABEL_ZOOM_MAX, minZoom + 1) : d.maxZoom,
                }))
              }}
              aria-label="Minimum zoom to show labels"
            >
              {SI_LABEL_ZOOM_OPTIONS.map(z => (
                <option key={`min-${z}`} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
          <label className="si-layer-labelcfg-field">
            <span>Max zoom</span>
            <select
              value={draft.maxZoom}
              onChange={e => {
                const maxZoom = Number(e.target.value)
                setDraft(d => ({
                  ...d,
                  maxZoom,
                  minZoom: d.minZoom >= maxZoom ? Math.max(SI_LABEL_ZOOM_MIN, maxZoom - 1) : d.minZoom,
                }))
              }}
              aria-label="Maximum zoom to show labels"
            >
              {SI_LABEL_ZOOM_OPTIONS.map(z => (
                <option key={`max-${z}`} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
        </div>
        <em className="si-layer-labelcfg-hint">
          Labels visible from zoom {draft.minZoom} to {draft.maxZoom}.
        </em>

        <div className="si-layer-labelcfg-field">
          <span>Font</span>
          <div
            className="si-layer-labelcfg-font-list"
            role="listbox"
            aria-label="Label font family"
          >
            {SI_LABEL_FONT_DEFS.map(font => {
              const selected = draft.fontFamily === font.id
              const sample = draft.fieldName ? `Sample · ${draft.fieldName}` : 'Sample Aa'
              return (
                <button
                  key={font.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`si-layer-labelcfg-font-item${selected ? ' is-selected' : ''}`}
                  onClick={() => setDraft(d => ({ ...d, fontFamily: font.id }))}
                  title={font.label}
                >
                  <span className="si-layer-labelcfg-font-item-name">{font.label}</span>
                  <span
                    className="si-layer-labelcfg-font-item-sample"
                    style={{
                      color: selected ? draft.textColor : undefined,
                      fontSize: `${Math.max(11, Math.min(16, draft.fontSize))}px`,
                      fontWeight: previewFont,
                      fontStyle: previewStyle,
                      fontFamily: font.cssFamily,
                      textShadow: selected
                        ? `0 0 ${Math.max(1, draft.haloWidth)}px ${draft.haloColor}, 0 1px 2px ${draft.haloColor}`
                        : undefined,
                    }}
                  >
                    {sample}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div
          className="si-layer-labelcfg-preview"
          style={{
            color: draft.textColor,
            fontSize: `${Math.max(11, draft.fontSize)}px`,
            fontWeight: previewFont,
            fontStyle: previewStyle,
            fontFamily: previewFamily,
            textShadow: `0 0 ${Math.max(1, draft.haloWidth)}px ${draft.haloColor}, 0 1px 2px ${draft.haloColor}`,
          }}
          aria-hidden
        >
          {draft.fieldName ? `Sample · ${draft.fieldName}` : 'Sample'}
        </div>
      </div>

      <footer className="si-layer-labelcfg-foot" data-drag-exclude>
        <button type="button" className="si-layer-labelcfg-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="si-layer-labelcfg-btn si-layer-labelcfg-btn--primary"
          onClick={() => {
            const nextStyle = normalizeSiLayerLabelStyle(draft)
            const field = nextStyle.fieldName.trim()
            onApply({ fieldName: field || null, style: nextStyle })
          }}
        >
          {draft.fieldName.trim() ? 'Apply' : 'Off'}
        </button>
      </footer>
    </aside>
  )

  if (container) return createPortal(panel, container)
  return panel
}

export default SiLayerLabelingPanel
