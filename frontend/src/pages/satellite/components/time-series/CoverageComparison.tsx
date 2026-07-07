import type { VegetationCoverageComparison } from '../../../../lib/vegetationCoverageEngine'
import {
  formatCoverageDate,
  formatCoverageHa,
  formatCoveragePct,
} from '../../../../lib/vegetationCoverageEngine'

export type CoverageComparisonProps = {
  comparison: VegetationCoverageComparison
}

export function CoverageComparison({ comparison }: CoverageComparisonProps) {
  const { rows, netChangeHa, coverageIncreasePct } = comparison
  const sign = netChangeHa >= 0 ? '+' : ''

  return (
    <div className="acp-ts__coverage-compare">
      <h4 className="acp-ts__coverage-section-title">Coverage Comparison</h4>
      <table className="acp-ts__coverage-table acp-ts__coverage-table--compare">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Vegetated Area</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.date}>
              <td>{formatCoverageDate(row.date)}</td>
              <td>
                {formatCoverageHa(row.vegetatedHa)} ha ({formatCoveragePct(row.coveragePct)}%)
              </td>
            </tr>
          ))}
          <tr className="acp-ts__coverage-compare-net">
            <td>Net Change</td>
            <td>
              {sign}
              {formatCoverageHa(netChangeHa)} ha · Coverage {sign}
              {formatCoveragePct(coverageIncreasePct)}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
