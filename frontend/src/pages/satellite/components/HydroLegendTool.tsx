import { useEffect, useMemo, useState } from 'react'
import type { HydroLegend, HydroStepId } from '../../../lib/hydroWatershed/hydroEngine'
import type { HydroStepState } from './useHydroWatershed'
import { useMapOverlayIsolation } from '../useMapOverlayIsolation'
import './HydroLegendTool.css'

const STEP_ORDER: HydroStepId[] = [
  'dem',
  'hillshade',
  'slope',
  'flow-accum',
  'watershed',
  'basins',
  'streams',
  'contours',
  'mesh',
]

const STEP_TITLE: Record<HydroStepId, string> = {
  dem: 'Elevation',
  hillshade: 'Hillshade',
  slope: 'Slope',
  'flow-accum': 'Flow accumulation',
  streams: 'Stream network',
  contours: 'Contours',
  watershed: 'Watershed',
  basins: 'Drainage basins',
  mesh: 'Mesh',
}

// ── Stream classification legend (model-dependent, mirrors the map ramps) ──────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function lerpHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const m = (i: number) => Math.round(ca[i]! + (cb[i]! - ca[i]!) * t)
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`
}
function rampHex(anchors: string[], t: number): string {
  const u = Math.max(0, Math.min(1, t)) * (anchors.length - 1)
  const i = Math.floor(u)
  return lerpHex(anchors[i]!, anchors[Math.min(anchors.length - 1, i + 1)]!, u - i)
}

function streamLegend(model: 'strahler' | 'shreve', maxStrahler: number, maxShreve: number): HydroLegend {
  if (model === 'shreve') {
    return {
      title: 'Stream — Shreve magnitude',
      kind: 'gradient',
      swatches: [
        { color: '#bae6fd', label: '' },
        { color: '#2563eb', label: '' },
        { color: '#f97316', label: '' },
      ],
      minLabel: '1',
      maxLabel: maxShreve.toLocaleString(),
      note: 'magnitude (upstream links)',
    }
  }
  const maxOrd = Math.max(1, Math.min(8, maxStrahler))
  const anchors = ['#93c5fd', '#2563eb', '#dc2626']
  const swatches = Array.from({ length: maxOrd }, (_, k) => {
    const o = k + 1
    const t = maxOrd === 1 ? 0 : (o - 1) / (maxOrd - 1)
    return { color: rampHex(anchors, t), label: `Order ${o}` }
  })
  return { title: 'Stream — Strahler order', kind: 'classes', swatches, note: `max order ${maxStrahler}` }
}

type LegendEntry = { id: HydroStepId; name: string; legend: HydroLegend }

type HydroLegendToolProps = {
  steps: Record<HydroStepId, HydroStepState>
  streamModel: 'strahler' | 'shreve'
  /** The Legend is shown only when the user activates it from the Legend tool. */
  open: boolean
  onClose: () => void
}

/**
 * Interactive Legend tool for Hydro analysis layers. Auto-collects a legend for
 * every completed layer, lets the user pick which layer's legend to show via a
 * dropdown, and re-renders dynamically as layers/models change. Stream legends
 * follow the active Strahler/Shreve model so the symbology always matches the map.
 */
export function HydroLegendTool({ steps, streamModel, open, onClose }: HydroLegendToolProps) {
  const isolation = useMapOverlayIsolation()

  const entries = useMemo<LegendEntry[]>(() => {
    const list: LegendEntry[] = []
    for (const id of STEP_ORDER) {
      const st = steps[id]
      if (!st || st.status !== 'done' || !st.result) continue
      if (id === 'streams' && st.result.kind === 'vector') {
        list.push({
          id,
          name: STEP_TITLE[id],
          legend: streamLegend(streamModel, st.result.maxStrahler ?? 1, st.result.maxShreve ?? 1),
        })
        continue
      }
      const legend = st.result.legend
      if (legend) list.push({ id, name: STEP_TITLE[id], legend })
    }
    return list
  }, [steps, streamModel])

  const [selectedId, setSelectedId] = useState<HydroStepId | null>(null)

  // Keep the selection valid and, when it falls out of view, follow the active
  // (visible) layer so the legend tracks what the user is actually looking at.
  useEffect(() => {
    if (!entries.length) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    const stillValid = selectedId && entries.some(e => e.id === selectedId)
    if (!stillValid) {
      const firstVisible = entries.find(e => steps[e.id]?.visible)
      setSelectedId((firstVisible ?? entries[0]!).id)
    }
  }, [entries, selectedId, steps])

  // Only rendered when the user activates the Legend tool.
  if (!open) return null

  const active = selectedId ? entries.find(e => e.id === selectedId) ?? null : null
  const lg = active?.legend ?? null
  const gradient =
    lg && lg.kind === 'gradient'
      ? `linear-gradient(to right, ${lg.swatches.map(s => s.color).join(', ')})`
      : ''

  return (
    <div className="si-hylg" {...isolation} role="dialog" aria-label="Legend">
      <div className="si-hylg__head">
        <span className="si-hylg__title">Legend</span>
        {entries.length ? (
          <select
            className="si-hylg__select"
            value={selectedId ?? ''}
            onChange={e => setSelectedId(e.target.value as HydroStepId)}
            aria-label="Choose layer legend"
          >
            {entries.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}
                {steps[e.id]?.visible ? '' : ' (hidden)'}
              </option>
            ))}
          </select>
        ) : (
          <span className="si-hylg__spacer" />
        )}
        <button type="button" className="si-hylg__close" onClick={onClose} aria-label="Close legend">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>

      {lg ? (
        <div className="si-hylg__body">
          <div className="si-hylg__layer-title">{lg.title}</div>
          {lg.kind === 'gradient' ? (
            <>
              <div className="si-hylg__bar" style={{ background: gradient }} aria-hidden />
              <div className="si-hylg__bar-labels">
                <span>{lg.minLabel ?? 'Low'}</span>
                <span>{lg.maxLabel ?? 'High'}</span>
              </div>
            </>
          ) : (
            <ul className="si-hylg__classes">
              {lg.swatches.map((s, i) => (
                <li key={`${s.label}-${i}`} className="si-hylg__class">
                  <span className="si-hylg__swatch" style={{ background: s.color }} aria-hidden />
                  <span className="si-hylg__class-label">{s.label}</span>
                </li>
              ))}
            </ul>
          )}
          {lg.note ? <div className="si-hylg__note">{lg.note}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

export default HydroLegendTool
