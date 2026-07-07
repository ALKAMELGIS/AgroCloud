import type { SupervisedAccuracySummary } from '../../../lib/siPrithviCropPipeline'

export type SiCropAccuracyReportProps = {
  accuracy: SupervisedAccuracySummary
}

export function SiCropAccuracyReport({ accuracy }: SiCropAccuracyReportProps) {
  const { overallAccuracy, confusionMatrix, perClass, testSamples, holdoutFraction } = accuracy
  const { labels, matrix } = confusionMatrix

  return (
    <div className="prithvi-tool__stats prithvi-accuracy">
      <div className="prithvi-tool__stats-title">Accuracy report (hold-out {Math.round(holdoutFraction * 100)}%)</div>
      <div className="prithvi-accuracy__oa">
        Overall accuracy: <strong>{(overallAccuracy * 100).toFixed(1)}%</strong>
        <span className="prithvi-accuracy__n"> · {testSamples} validation samples</span>
      </div>

      <div className="prithvi-comp-table" role="table" aria-label="Per-class metrics">
        <div className="prithvi-comp-table__head" role="row">
          <span role="columnheader">Class</span>
          <span className="num" role="columnheader">P</span>
          <span className="num" role="columnheader">R</span>
          <span className="num" role="columnheader">F1</span>
          <span className="num" role="columnheader">N</span>
        </div>
        {perClass.map(row => (
          <div className="prithvi-comp-table__row" role="row" key={row.name}>
            <span role="cell">{row.name}</span>
            <span className="num" role="cell">
              {(row.precision * 100).toFixed(0)}%
            </span>
            <span className="num" role="cell">
              {(row.recall * 100).toFixed(0)}%
            </span>
            <span className="num" role="cell">
              {(row.f1 * 100).toFixed(0)}%
            </span>
            <span className="num" role="cell">
              {row.support}
            </span>
          </div>
        ))}
      </div>

      <div className="prithvi-accuracy__cm-title">Confusion matrix</div>
      <div className="prithvi-accuracy__cm-wrap">
        <table className="prithvi-accuracy__cm">
          <thead>
            <tr>
              <th />
              {labels.map(l => (
                <th key={`p-${l}`}>→ {l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((rowLabel, i) => (
              <tr key={rowLabel}>
                <th>↑ {rowLabel}</th>
                {labels.map((_, j) => (
                  <td key={`${i}-${j}`} className={i === j ? 'is-diag' : ''}>
                    {matrix[i]?.[j] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default SiCropAccuracyReport
