import type { DevelopEliteChartsConfig } from './developEliteChartsConfig'
import { resolveDevelopEliteSliceColor } from './developEliteCropChartColors'
import type { DevelopEliteChartSlice } from './useDevelopEliteDashboardData'

export {
  barFillColorForCropLabel,
  colorForCropChartLabel,
  resolveDevelopEliteSliceColor,
} from './developEliteCropChartColors'

export function prepareDevelopEliteChartSlices(
  slices: DevelopEliteChartSlice[],
  charts: DevelopEliteChartsConfig,
  mode: 'pie' | 'bar',
): DevelopEliteChartSlice[] {
  let list = [...slices]
  if (!charts.sortByValueDesc) {
    list.sort((a, b) => a.value - b.value)
  } else {
    list.sort((a, b) => b.value - a.value)
  }

  list = list.map((slice, index) => ({
    ...slice,
    color: resolveDevelopEliteSliceColor(slice.label, index, charts.palette, mode),
  }))

  const max = mode === 'pie' ? charts.pieMaxSlices : charts.barMaxSlices
  if (list.length <= max) return list

  if (!charts.groupRemainderAsOther) {
    return list.slice(0, max)
  }

  const headCount = Math.max(2, max - 1)
  const head = list.slice(0, headCount)
  const tail = list.slice(headCount)
  const otherValue = tail.reduce((sum, s) => sum + s.value, 0)
  if (otherValue <= 0) return head
  return [
    ...head,
    {
      label: 'Other',
      value: otherValue,
      color: resolveDevelopEliteSliceColor('Other', head.length, charts.palette, mode),
    },
  ]
}
