import { CoverageCharts } from './CoverageCharts'
import { CoverageClassificationTable } from './CoverageClassificationTable'
import { CoverageComparison } from './CoverageComparison'
import { CoverageInsights } from './CoverageInsights'
import { CoverageMap } from './CoverageMap'
import { CoverageSummaryCards } from './CoverageSummaryCards'
import type {
  VegetationCoverageComparison,
  VegetationCoverageInsights,
  VegetationCoverageSummary,
  VegetationCoverageTrendPoint,
} from '../../../../lib/vegetationCoverageEngine'
import { formatCoverageDate } from '../../../../lib/vegetationCoverageEngine'

export type SiImageryVegetationCoverageTabProps = {
  summary: VegetationCoverageSummary | null
  comparison: VegetationCoverageComparison | null
  trend: VegetationCoverageTrendPoint[]
  insights: VegetationCoverageInsights | null
  loading: boolean
  supported: boolean
  geometry: GeoJSON.Geometry | null | undefined
  layerId: string
  sceneDate: string
}

export function SiImageryVegetationCoverageTab({
  summary,
  comparison,
  trend,
  insights,
  loading,
  supported,
  geometry,
  layerId,
  sceneDate,
}: SiImageryVegetationCoverageTabProps) {
  if (!supported) {
    return (
      <div className="acp-ts__coverage acp-ts__coverage--empty" role="status">
        Vegetation Coverage requires the <strong>NDVI</strong> layer. Select NDVI as the primary layer to view spatial
        coverage analytics.
      </div>
    )
  }

  if (loading && !summary) {
    return (
      <div className="acp-ts__coverage acp-ts__coverage--loading" role="status" aria-busy="true">
        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Computing vegetation coverage for{' '}
        {formatCoverageDate(sceneDate)}…
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="acp-ts__coverage acp-ts__coverage--empty" role="status">
        No coverage data for {formatCoverageDate(sceneDate)}. Run analysis and select a valid scene date.
      </div>
    )
  }

  return (
    <div className="acp-ts__coverage">
      <header className="acp-ts__coverage-head">
        <span className="acp-ts__coverage-badge">
          <i className="fa-solid fa-leaf" aria-hidden="true" /> {layerId} · {formatCoverageDate(sceneDate)}
        </span>
        {summary.fromHistogram ? (
          <span className="acp-ts__coverage-source">Pixel-classified from Sentinel histogram</span>
        ) : (
          <span className="acp-ts__coverage-source">Estimated from index mean</span>
        )}
      </header>

      <CoverageSummaryCards summary={summary} />
      <CoverageClassificationTable classes={summary.classes} />
      <CoverageCharts summary={summary} trend={trend} />
      {comparison ? <CoverageComparison comparison={comparison} /> : null}
      <CoverageMap geometry={geometry} classes={summary.classes} sceneDate={sceneDate} />
      {insights ? <CoverageInsights insights={insights} /> : null}

      {loading ? (
        <p className="acp-ts__coverage-refresh" role="status">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Refreshing histogram…
        </p>
      ) : null}
    </div>
  )
}
