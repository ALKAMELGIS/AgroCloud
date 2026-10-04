import type { DevelopEliteGridLayoutItem } from './developEliteGridLayout'
import { applyGridCardDrop } from './developEliteGridEngine'

export type DevelopEliteGridWidgetMenuAction = 'configure' | 'duplicate' | 'delete'

/** Layout clones reference the same React widget as the source id. */
export function resolveDevelopEliteGridWidgetContentId(widgetId: string): string {
  return widgetId.replace(/__copy\d+$/i, '')
}

export function isDevelopEliteGridLayoutCloneId(widgetId: string): boolean {
  return /__copy\d+$/i.test(widgetId)
}

export function settingsTabForDevelopEliteWidget(widgetId: string): 'data' | 'kpi' | 'charts' | 'map' | 'appearance' {
  const base = resolveDevelopEliteGridWidgetContentId(widgetId)
  if (base.startsWith('kpi-')) return 'kpi'
  if (base.startsWith('chart-')) return 'charts'
  if (base === 'map') return 'map'
  if (base === 'sidebar' || base === 'sidebar-farms' || base === 'sidebar-countries' || base === 'zones') {
    return 'data'
  }
  return 'appearance'
}

export function duplicateDevelopEliteGridWidgetItem(
  layout: DevelopEliteGridLayoutItem[],
  widgetId: string,
  cols: number,
): DevelopEliteGridLayoutItem[] | null {
  const item = layout.find(i => i.i === widgetId)
  if (!item) return null
  const suffix = Date.now().toString(36)
  const clone: DevelopEliteGridLayoutItem = {
    ...item,
    i: `${widgetId}__copy${suffix}`,
    x: Math.min(item.x + 1, Math.max(0, cols - item.w)),
    y: item.y + item.h,
  }
  return applyGridCardDrop([...layout, clone], clone, cols)
}

export function removeDevelopEliteGridWidgetFromLayout(
  layout: DevelopEliteGridLayoutItem[],
  widgetId: string,
): DevelopEliteGridLayoutItem[] {
  const base = resolveDevelopEliteGridWidgetContentId(widgetId)
  const deletingBase = widgetId === base
  return layout.filter(item => {
    if (item.i === widgetId) return false
    if (deletingBase && resolveDevelopEliteGridWidgetContentId(item.i) === base) return false
    return true
  })
}
