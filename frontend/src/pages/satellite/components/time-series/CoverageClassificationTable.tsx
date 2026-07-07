import type { VegetationCoverageClass } from '../../../../lib/vegetationCoverageEngine'
import { formatCoverageHa, formatCoveragePct } from '../../../../lib/vegetationCoverageEngine'

export type CoverageClassificationTableProps = {
  classes: VegetationCoverageClass[]
}

export function CoverageClassificationTable({ classes }: CoverageClassificationTableProps) {
  const visible = classes.filter(c => c.pct > 0.05 || c.areaHa > 0.001)

  return (
    <div className="acp-ts__coverage-table-wrap">
      <h4 className="acp-ts__coverage-section-title">Vegetation Classification</h4>
      <table className="acp-ts__coverage-table">
        <thead>
          <tr>
            <th scope="col">Class</th>
            <th scope="col">Area (ha)</th>
            <th scope="col">Coverage (%)</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(row => (
            <tr key={row.id}>
              <td>
                <span className="acp-ts__coverage-swatch" style={{ background: row.color }} aria-hidden="true" />
                {row.label}
              </td>
              <td>{formatCoverageHa(row.areaHa)}</td>
              <td>{formatCoveragePct(row.pct)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
