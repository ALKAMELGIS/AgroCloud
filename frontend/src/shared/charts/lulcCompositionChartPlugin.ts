/**
 * Chart.js plugin — draw percentage labels above LULC composition bars.
 */
import type { Chart, ChartType, Plugin } from 'chart.js'

export type LulcPctLabelPluginOptions = {
  enabled?: boolean
  /** Parallel labels (e.g. "51%") — defaults to dataset values rounded. */
  labels?: string[]
}

declare module 'chart.js' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType = ChartType> {
    lulcPctLabels?: LulcPctLabelPluginOptions
  }
}

export const lulcPctLabelsPlugin: Plugin<'bar'> = {
  id: 'lulcPctLabels',
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins?.lulcPctLabels
    if (!opts?.enabled) return
    const { ctx } = chart
    const meta = chart.getDatasetMeta(0)
    if (!meta?.data?.length) return
    const dataset = chart.data.datasets[0]
    if (!dataset) return

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = 'rgba(186, 230, 253, 0.95)'
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'

    meta.data.forEach((el, i) => {
      const raw = dataset.data[i]
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n) || n <= 0) return
      const text = opts.labels?.[i] ?? `${Math.round(n)}%`
      const { x, y } = el.getProps(['x', 'y'], true)
      ctx.fillText(text, x, y - 4)
    })
    ctx.restore()
  },
}

export function isLulcPctLabelsChart(chart: Chart): boolean {
  return Boolean(chart.options.plugins?.lulcPctLabels?.enabled)
}
