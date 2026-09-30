import type {
  AgroCloudDashboardAggregation,
  AgroCloudDashboardConfig,
  AgroCloudDashboardElement,
} from './agroCloudDashboardData'
import { formatDashboardNumber } from './agroCloudDashboardTimeRegion'

export type AgroCloudIndicatorValueType = 'statistic' | 'feature'
export type AgroCloudIndicatorConfigTab = 'data' | 'indicator' | 'general' | 'accessibility'
export type AgroCloudIndicatorFontSize = 'small' | 'medium' | 'large'

export type AgroCloudIndicatorTextBlock = {
  text: string
  color: string
  bold: boolean
  visible: boolean
  fontSize: AgroCloudIndicatorFontSize
}

export type AgroCloudIndicatorFilterLogic = 'and' | 'or'

export type AgroCloudIndicatorFilterCondition = {
  id: string
  field: string
}

export type AgroCloudDashboardIndicatorWidgetSettings = {
  valueType: AgroCloudIndicatorValueType
  statistic: AgroCloudDashboardAggregation
  valueConversion: boolean
  /** @deprecated Use `filters` — kept for persisted configs. */
  filterEnabled?: boolean
  filters: AgroCloudIndicatorFilterCondition[]
  filterLogics: AgroCloudIndicatorFilterLogic[]
  advancedFormatting: boolean
  topText: AgroCloudIndicatorTextBlock
  middleText: AgroCloudIndicatorTextBlock
  bottomText: AgroCloudIndicatorTextBlock
  iconEnabled: boolean
  headerTitle: string
  sourceDataDownload: boolean
  headerTextColor: string
  headerForegroundColor: string
  name: string
  topCaption: string
  bottomCaption: string
  textColor: string
  foregroundColor: string
  lastUpdateText: boolean
  accessibleName: string
}

const DEFAULT_TEXT_BLOCK = (text = ''): AgroCloudIndicatorTextBlock => ({
  text,
  color: '#323130',
  bold: false,
  visible: true,
  fontSize: 'medium',
})

export function defaultIndicatorWidgetSettings(label: string): AgroCloudDashboardIndicatorWidgetSettings {
  return {
    valueType: 'statistic',
    statistic: 'count',
    valueConversion: false,
    filters: [],
    filterLogics: [],
    advancedFormatting: false,
    topText: DEFAULT_TEXT_BLOCK(''),
    middleText: DEFAULT_TEXT_BLOCK('{calculatedValue}'),
    bottomText: DEFAULT_TEXT_BLOCK(''),
    iconEnabled: false,
    headerTitle: label,
    sourceDataDownload: false,
    headerTextColor: '#323130',
    headerForegroundColor: '#ffffff',
    name: `${label} (1)`,
    topCaption: '',
    bottomCaption: '',
    textColor: '#323130',
    foregroundColor: '#ffffff',
    lastUpdateText: false,
    accessibleName: label,
  }
}

export function mergeIndicatorWidgetSettings(
  base: AgroCloudDashboardIndicatorWidgetSettings,
  patch: Partial<AgroCloudDashboardIndicatorWidgetSettings>,
): AgroCloudDashboardIndicatorWidgetSettings {
  return {
    ...base,
    ...patch,
    topText: patch.topText ? { ...base.topText, ...patch.topText } : base.topText,
    middleText: patch.middleText ? { ...base.middleText, ...patch.middleText } : base.middleText,
    bottomText: patch.bottomText ? { ...base.bottomText, ...patch.bottomText } : base.bottomText,
    filters: patch.filters ?? base.filters,
    filterLogics: patch.filterLogics ?? base.filterLogics,
  }
}

let indicatorFilterSeq = 0

export function newIndicatorFilterConditionId(): string {
  indicatorFilterSeq += 1
  return `indicator-filter-${Date.now()}-${indicatorFilterSeq}`
}

export function normalizeIndicatorFilters(
  settings: AgroCloudDashboardIndicatorWidgetSettings,
): AgroCloudDashboardIndicatorWidgetSettings {
  if (settings.filters?.length) {
    return {
      ...settings,
      filters: settings.filters.map(f => ({ ...f })),
      filterLogics: [...(settings.filterLogics ?? [])],
    }
  }
  if (settings.filterEnabled) {
    return {
      ...settings,
      filters: [{ id: newIndicatorFilterConditionId(), field: '' }],
      filterLogics: [],
    }
  }
  return { ...settings, filters: [], filterLogics: [] }
}

export function indicatorSettingsFromElement(el: AgroCloudDashboardElement): AgroCloudDashboardIndicatorWidgetSettings {
  const base = defaultIndicatorWidgetSettings(el.label)
  const stored = el.indicatorSettings
  if (!stored) {
    return mergeIndicatorWidgetSettings(base, {
      statistic: el.aggregation ?? base.statistic,
      name: el.label,
      accessibleName: el.label,
    })
  }
  return normalizeIndicatorFilters(mergeIndicatorWidgetSettings(base, stored))
}

const PREVIEW_SAMPLE: Record<string, number> = {
  OBJECTID: 930,
  ObjectID: 930,
  Farm_Code: 1284,
  Area_Ha: 1_250_000,
  NDVI: 0.72,
  Value: 930,
}

export function resolveIndicatorCalculatedValue(
  el: Pick<AgroCloudDashboardElement, 'field' | 'aggregation'>,
  settings: AgroCloudDashboardIndicatorWidgetSettings,
  config: AgroCloudDashboardConfig,
): string {
  const field = el.field ?? 'OBJECTID'
  const aggregation = settings.valueType === 'statistic' ? settings.statistic : el.aggregation ?? 'count'
  if (aggregation === 'count') return formatDashboardNumber(PREVIEW_SAMPLE.OBJECTID, config)
  const raw = PREVIEW_SAMPLE[field] ?? PREVIEW_SAMPLE.Value
  if (aggregation === 'avg' && field === 'NDVI') return raw.toFixed(2)
  return formatDashboardNumber(raw, config)
}

export function resolveIndicatorDisplayText(
  template: string,
  calculatedValue: string,
): string {
  const trimmed = template.trim()
  if (!trimmed) return ''
  if (trimmed === '{calculatedValue}') return calculatedValue
  return trimmed.replace(/\{calculatedValue\}/g, calculatedValue)
}

export function indicatorFontSizePx(size: AgroCloudIndicatorFontSize): number {
  if (size === 'small') return 12
  if (size === 'large') return 28
  return 16
}
