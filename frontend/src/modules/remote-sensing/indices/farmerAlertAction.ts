/**
 * Farmer-facing one-line action copy for live alerts and map popups.
 * Combines vegetation index rules, ΔCHAS change detection, and absolute CHAS health.
 */

import type { CropAlertFieldResult } from './siCropAlertEngine'
import {
  classifyCdsiInsightTier,
  normalizeDchasRiskTier,
  resolveDchasOrbPresentation,
  resolveSmartCropInsightNeed,
  type DchasRiskTier,
} from './siCropAlertDchasBeacon'
import { decideVegetationAlert, VEGETATION_ALERT_ACTIONS } from './vegetationAlertDecision'

export const DCHAS_TIER_FARMER_ACTIONS: Record<DchasRiskTier, string> = {
  critical:
    'Immediate field inspection — sharp CHAS decline. Check irrigation, pests, and root stress.',
  stress: 'High stress detected — increase irrigation or review fertilization within 24–48 hours.',
  watch: 'Watch zone — verify soil moisture and re-check at next Sentinel scene.',
  stable: 'Stable or improving — continue routine monitoring.',
}

function isActionableVegetationDecision(decision: ReturnType<typeof decideVegetationAlert>): boolean {
  if (decision.severity === 'critical') return true
  if (decision.status === 'water-stress' || decision.status === 'critical' || decision.status === 'bare-soil') {
    return true
  }
  if (decision.ruleId === 3) return true
  return false
}

export function resolveFarmerFieldAction(
  result: CropAlertFieldResult | null | undefined,
  alertTier: string,
): string {
  if (!result) return 'Waiting for Layer Live analysis…'

  const tier = normalizeDchasRiskTier(alertTier)
  const orb = resolveDchasOrbPresentation(result)
  const vegetation = decideVegetationAlert(result.current, result.previous7)

  if (isActionableVegetationDecision(vegetation)) {
    return vegetation.action
  }

  if (tier === 'critical' || tier === 'stress') {
    return DCHAS_TIER_FARMER_ACTIONS[tier]
  }

  if (tier === 'watch') {
    return DCHAS_TIER_FARMER_ACTIONS.watch
  }

  const cdsiTier = classifyCdsiInsightTier(orb.chasCurrent)
  const smartNeed = resolveSmartCropInsightNeed(cdsiTier, orb.deltaChas)
  if (smartNeed.trim()) return smartNeed

  if (vegetation.action.trim()) return vegetation.action

  return DCHAS_TIER_FARMER_ACTIONS.stable
}

export function resolveFarmerFieldActionTone(
  result: CropAlertFieldResult | null | undefined,
  alertTier: string,
): DchasRiskTier {
  if (result) {
    const vegetation = decideVegetationAlert(result.current, result.previous7)
    if (isActionableVegetationDecision(vegetation)) {
      if (vegetation.severity === 'critical' || vegetation.status === 'critical' || vegetation.status === 'bare-soil') {
        return 'critical'
      }
      if (vegetation.status === 'water-stress' || vegetation.severity === 'high') {
        return 'stress'
      }
      if (vegetation.status === 'watch' || vegetation.severity === 'warning') {
        return 'watch'
      }
    }
  }
  return normalizeDchasRiskTier(alertTier)
}

export const FARMER_ALERT_ACTION_FALLBACK = VEGETATION_ALERT_ACTIONS.monitor
