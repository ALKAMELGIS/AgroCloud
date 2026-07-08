import type { GisSelectionHit } from '../../../../lib/gisSelection/types'
import './gisSelection.css'

export type GisSelectionAttributeTablePanelProps = {
  open: boolean
  hits: GisSelectionHit[]
  onClose: () => void
}

function formatValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function GisSelectionAttributeTablePanel({
  open,
  hits,
  onClose,
}: GisSelectionAttributeTablePanelProps) {
  if (!open) return null

  const fieldSet = new Set<string>()
  for (const hit of hits) {
    Object.keys(hit.properties ?? {}).forEach(k => fieldSet.add(k))
  }
  const fields = [...fieldSet].sort((a, b) => a.localeCompare(b))

  return (
    <aside className="gis-sel-attr-table" role="complementary" aria-label="Selected feature attributes" dir="ltr">
      <header className="gis-sel-attr-table__head">
        <span>
          <i className="fa-solid fa-table" aria-hidden /> Attributes ({hits.length})
        </span>
        <button type="button" className="gis-sel-attr-table__close" aria-label="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="gis-sel-attr-table__body">
        {!hits.length ? (
          <p className="gis-sel-attr-table__empty">Click features on the map to inspect attributes.</p>
        ) : !fields.length ? (
          <p className="gis-sel-attr-table__empty">Selected features have no attribute fields.</p>
        ) : (
          <div className="gis-sel-attr-table__scroll">
            <table>
              <thead>
                <tr>
                  <th>Layer</th>
                  {fields.map(f => (
                    <th key={f}>{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hits.map(hit => (
                  <tr key={`${hit.layerId}::${hit.featureKey}`}>
                    <td title={hit.layerName}>{hit.layerName}</td>
                    {fields.map(f => (
                      <td key={f}>{formatValue(hit.properties?.[f])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  )
}
