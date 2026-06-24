/**
 * Bridge KPI metrics from API + crop alert engine aggregates.
 */

import type { RealtimeAlertKpiPayload, RealtimeAlertKpiMetric } from '../../pages/dashboards/realtimeAlert/types/realtimeAlert.types'
import type { CropAlertFieldResult } from '../siCropAlertEngine'
import { classifyChasFusionToAlert } from '../chasAlertMapping'

export function mergeKpiWithEngine(
  api: RealtimeAlertKpiPayload | null,
  results: CropAlertFieldResult[],
): RealtimeAlertKpiPayload {
  const critical = results.filter(r => {
    const chas = r.chasCurrent
    if (chas == null || !Number.isFinite(chas)) return r.severity === 'critical'
    return classifyChasFusionToAlert(chas) === 'CRITICAL'
  }).length
  const alerts = results.filter(r => r.severity !== 'normal' && r.status !== 'healthy').length
  return {
    fieldCount: results.length || api?.fieldCount ?? null,
    alertCount: alerts || api?.alertCount ?? null,
    criticalCount: critical || api?.criticalCount ?? null,
    weatherRisk: api?.weatherRisk ?? null,
    coveragePct: api?.coveragePct ?? null,
    updatedAt: new Date().toISOString(),
  }
}

export function resolveKpiMetricValue(
  metric: RealtimeAlertKpiMetric,
  kpis: RealtimeAlertKpiPayload | null,
): string | number | null {
  if (!kpis) return null
  switch (metric) {
    case 'field_count':
      return kpis.fieldCount
    case 'alert_count':
      return kpis.alertCount
    case 'critical_count':
      return kpis.criticalCount
    case 'weather_risk':
      return kpis.weatherRisk
    case 'coverage_pct':
      return kpis.coveragePct != null ? `${kpis.coveragePct}%` : null
    default:
      return null
  }
}
