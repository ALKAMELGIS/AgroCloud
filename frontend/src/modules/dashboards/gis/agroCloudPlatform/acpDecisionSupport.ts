import type { AcpFieldTableRow } from './acpMapSpatial'

export type AcpDecisionSupportTone = 'healthy' | 'stable' | 'warning' | 'critical'

const DECISION_LABELS: Record<AcpDecisionSupportTone, string> = {
  healthy: 'Healthy',
  stable: 'Stable',
  warning: 'Warning',
  critical: 'Critical',
}

/** Maps a field row to Decision Support tone (same buckets as AcpDecisionPanel). */
export function resolveAcpDecisionSupportTone(row: AcpFieldTableRow): AcpDecisionSupportTone {
  if (row.severity === 'critical' || row.alertTier === 'critical') return 'critical'
  if (row.alertTier === 'stress' || row.alertTier === 'watch') return 'warning'
  if (row.alertTier === 'stable' && row.severity === 'normal') return 'healthy'
  if (row.alertTier === 'stable') return 'stable'
  if (row.severity === 'warning') return 'warning'
  return 'stable'
}

export function resolveAcpDecisionSupportLabel(tone: AcpDecisionSupportTone): string {
  return DECISION_LABELS[tone]
}

/** Latest/previous Sentinel scene dates from API (ndviSceneDates, imageDate). */
export function resolveAcpFieldSceneComparisonDates(row: AcpFieldTableRow): {
  latestSceneDate: string | null
  previousSceneDate: string | null
} {
  const latestSceneDate =
    row.result?.ndviSceneDates?.[0] ??
    row.imageDate ??
    row.result?.imagery?.imageDate ??
    null
  const previousSceneDate = row.result?.ndviSceneDates?.[1] ?? null
  return { latestSceneDate, previousSceneDate }
}
