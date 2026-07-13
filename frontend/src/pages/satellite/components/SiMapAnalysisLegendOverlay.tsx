import { LayerLiveLegendActiveCard } from './LayerLiveLegendPanel'
import { resolveLayerLiveLegendSpec } from '../../../lib/layerLiveLegendCatalog'
import './SiMapAnalysisLegendOverlay.css'

export type SiMapAnalysisLegendOverlayProps = {
  activeLayerId: string
  visible?: boolean
  sceneDate?: string
  seriesStart?: string
  seriesEnd?: string
  aoiGeometry?: GeoJSON.Geometry | GeoJSON.Feature | null
  className?: string
}

/**
 * Compact on-map legend for the active Sentinel analysis layer (NDVI, NDWI, SAVI, …).
 * Updates automatically when `activeLayerId` changes.
 */
export function SiMapAnalysisLegendOverlay({
  activeLayerId,
  visible = true,
  sceneDate,
  seriesStart,
  seriesEnd,
  aoiGeometry,
  className,
}: SiMapAnalysisLegendOverlayProps) {
  if (!visible || !activeLayerId.trim()) return null

  const spec = resolveLayerLiveLegendSpec(activeLayerId)
  if (!spec) return null

  return (
    <div
      className={['si-map-analysis-legend-overlay', className].filter(Boolean).join(' ')}
      role="region"
      aria-label={`${activeLayerId} map legend`}
      dir="ltr"
    >
      <LayerLiveLegendActiveCard
        spec={spec}
        activeLayerId={activeLayerId}
        variant="float"
        sceneDate={sceneDate}
        seriesStart={seriesStart}
        seriesEnd={seriesEnd}
        aoiGeometry={aoiGeometry}
      />
    </div>
  )
}
