import { useState } from 'react'
import { selectFeaturesByMask } from '../../../../lib/gisSelection/spatialQuery'
import type { GisSelectionHit, GisSelectionLayerSource, GisSpatialRelationship } from '../../../../lib/gisSelection/types'
import './gisSelection.css'

const RELATIONSHIPS: Array<{ id: GisSpatialRelationship; label: string }> = [
  { id: 'intersects', label: 'Intersects' },
  { id: 'within', label: 'Within' },
  { id: 'contains', label: 'Contains' },
  { id: 'overlaps', label: 'Overlaps' },
  { id: 'touches', label: 'Touches' },
  { id: 'within_distance', label: 'Within distance' },
  { id: 'completely_contains', label: 'Completely contains' },
]

export type GisSelectByLocationPanelProps = {
  open: boolean
  layers: GisSelectionLayerSource[]
  selectableLayerIds: Set<string>
  referenceLayerId: string
  onReferenceLayerChange: (id: string) => void
  onApply: (hits: GisSelectionHit[]) => void
  onClose: () => void
}

export function GisSelectByLocationPanel({
  open,
  layers,
  selectableLayerIds,
  referenceLayerId,
  onReferenceLayerChange,
  onApply,
  onClose,
}: GisSelectByLocationPanelProps) {
  const [relationship, setRelationship] = useState<GisSpatialRelationship>('intersects')
  const [distanceKm, setDistanceKm] = useState(5)

  if (!open) return null

  const refLayer = layers.find(l => String(l.id) === referenceLayerId)
  const refGeoms =
    refLayer?.geojson?.features
      ?.map(f => (f as { geometry?: GeoJSON.Geometry }).geometry)
      .filter(Boolean) ?? []

  return (
    <aside className="gis-sel-query-panel" role="dialog" aria-label="Select by location" dir="ltr">
      <header className="gis-sel-query-panel__head">
        <span>Select By Location</span>
        <button type="button" aria-label="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="gis-sel-query-panel__body">
        <label className="gis-sel-query-panel__field">
          <span>Reference layer</span>
          <select value={referenceLayerId} onChange={e => onReferenceLayerChange(e.target.value)}>
            <option value="">— choose layer —</option>
            {layers.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="gis-sel-query-panel__field">
          <span>Spatial relationship</span>
          <select value={relationship} onChange={e => setRelationship(e.target.value as GisSpatialRelationship)}>
            {RELATIONSHIPS.map(r => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {relationship === 'within_distance' ? (
          <label className="gis-sel-query-panel__field">
            <span>Distance (km)</span>
            <input type="number" min={0.1} step={0.5} value={distanceKm} onChange={e => setDistanceKm(Number(e.target.value))} />
          </label>
        ) : null}
        <div className="gis-sel-query-panel__actions">
          <button
            type="button"
            className="gis-sel-query-panel__apply"
            disabled={!refGeoms.length}
            onClick={() =>
              onApply(
                selectFeaturesByMask(
                  layers,
                  selectableLayerIds,
                  refGeoms as Array<{ type?: string; coordinates?: unknown }>,
                  relationship,
                  relationship === 'within_distance' ? distanceKm * 1000 : 0,
                ),
              )
            }
          >
            Apply selection
          </button>
        </div>
      </div>
    </aside>
  )
}
