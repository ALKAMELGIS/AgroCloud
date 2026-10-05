import {
  DEFAULT_DEVELOP_ELITE_CHART_PALETTE,
  type DevelopEliteChartsConfig,
} from './developEliteChartsConfig'
import { colorForChartValueRank, resolveDevelopEliteSliceColor } from './developEliteCropChartColors'
import type { DevelopEliteChartSlice } from './useDevelopEliteDashboardData'

export {
  barFillColorForCropLabel,
  colorForChartValueRank,
  colorForCropChartLabel,
  resolveDevelopEliteSliceColor,
} from './developEliteCropChartColors'

/** Orange → yellow only for labels in `accentLabels`; others use the green chart palette. */
export function applyDevelopEliteChartAccentColors(
  slices: DevelopEliteChartSlice[],
  charts: DevelopEliteChartsConfig,
  mode: 'pie' | 'bar',
  accentLabels?: ReadonlySet<string>,
): DevelopEliteChartSlice[] {
  const palette = charts.palette?.length ? charts.palette : DEFAULT_DEVELOP_ELITE_CHART_PALETTE
  const accent = accentLabels ?? new Set<string>()
  const accentOrdered = slices.map(s => s.label).filter(label => accent.has(label))
  const accentN = accentOrdered.length

  return slices.map((slice, index) => {
    if (accentN > 0 && accent.has(slice.label)) {
      const accentIndex = accentOrdered.indexOf(slice.label)
      return { ...slice, color: colorForChartValueRank(accentIndex, accentN) }
    }
    return { ...slice, color: resolveDevelopEliteSliceColor(slice.label, index, palette, mode) }
  })
}

export function prepareDevelopEliteChartSlices(
  slices: DevelopEliteChartSlice[],
  charts: DevelopEliteChartsConfig,
  mode: 'pie' | 'bar',
  accentLabels?: ReadonlySet<string>,
): DevelopEliteChartSlice[] {
  let list = [...slices]
  if (!charts.sortByValueDesc) {
    list.sort((a, b) => a.value - b.value)
  } else {
    list.sort((a, b) => b.value - a.value)
  }

  const max = mode === 'pie' ? charts.pieMaxSlices : charts.barMaxSlices
  let out = list
  if (list.length > max) {
    if (!charts.groupRemainderAsOther) {
      out = list.slice(0, max)
    } else {
      const headCount = Math.max(2, max - 1)
      const head = list.slice(0, headCount)
      const tail = list.slice(headCount)
      const otherValue = tail.reduce((sum, s) => sum + s.value, 0)
      out =
        otherValue <= 0
          ? head
          : [
              ...head,
              {
                label: 'Other',
                value: otherValue,
                color: '#ffffff',
              },
            ]
    }
  }

  return applyDevelopEliteChartAccentColors(out, charts, mode, accentLabels)
}
