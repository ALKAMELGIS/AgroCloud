import { useMemo, useState } from 'react'
import { selectFeaturesBySqlExpression } from '../../../../lib/gisSelection/attributeQuery'
import type { GisSelectionHit, GisSelectionLayerSource } from '../../../../lib/gisSelection/types'
import './gisSelection.css'

export type GisSelectByAttributesPanelProps = {
  open: boolean
  layers: GisSelectionLayerSource[]
  selectableLayerIds: Set<string>
  onApply: (hits: GisSelectionHit[]) => void
  onClose: () => void
}

export function GisSelectByAttributesPanel({
  open,
  layers,
  selectableLayerIds,
  onApply,
  onClose,
}: GisSelectByAttributesPanelProps) {
  const [expression, setExpression] = useState('NDVI > 0.3')

  const fields = useMemo(() => {
    const set = new Set<string>()
    for (const layer of layers) {
      if (!selectableLayerIds.has(String(layer.id))) continue
      const arr = layer.geojson?.features
      if (!Array.isArray(arr)) continue
      for (const f of arr.slice(0, 50)) {
        const props = (f as { properties?: Record<string, unknown> }).properties
        if (!props) continue
        for (const k of Object.keys(props)) set.add(k)
      }
    }
    return [...set].sort().slice(0, 40)
  }, [layers, selectableLayerIds])

  if (!open) return null

  return (
    <aside className="gis-sel-query-panel" role="dialog" aria-label="Select by attributes" dir="ltr">
      <header className="gis-sel-query-panel__head">
        <span>Select By Attributes</span>
        <button type="button" aria-label="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="gis-sel-query-panel__body">
        <label className="gis-sel-query-panel__field">
          <span>SQL expression</span>
          <textarea
            rows={3}
            value={expression}
            onChange={e => setExpression(e.target.value)}
            placeholder="Population > 50000 AND Crop_Type = 'Wheat'"
          />
        </label>
        <p className="gis-sel-query-panel__hint">
          Operators: =, !=, &gt;, &lt;, &gt;=, &lt;=, LIKE, IN, BETWEEN
        </p>
        {fields.length ? (
          <div className="gis-sel-query-panel__chips">
            {fields.map(f => (
              <button key={f} type="button" className="gis-sel-query-panel__chip" onClick={() => setExpression(`${f} > 0`)}>
                {f}
              </button>
            ))}
          </div>
        ) : null}
        <div className="gis-sel-query-panel__actions">
          <button
            type="button"
            className="gis-sel-query-panel__apply"
            onClick={() => onApply(selectFeaturesBySqlExpression(layers, selectableLayerIds, expression))}
          >
            Apply selection
          </button>
        </div>
      </div>
    </aside>
  )
}
