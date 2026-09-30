export type StressZoneTier = 'healthy' | 'mild' | 'moderate' | 'severe' | 'bare'

export const STRESS_ZONE_TIER_ORDER: readonly StressZoneTier[] = [
  'healthy',
  'mild',
  'moderate',
  'severe',
  'bare',
]

export const STRESS_ZONE_LABELS: Record<StressZoneTier, string> = {
  healthy: 'Healthy Vegetation',
  mild: 'Mild Stress',
  moderate: 'Moderate Stress',
  severe: 'Severe Stress',
  bare: 'Bare Soil',
}

export const STRESS_ZONE_COLORS: Record<StressZoneTier, string> = {
  healthy: '#22c55e',
  mild: '#facc15',
  moderate: '#f97316',
  severe: '#ef4444',
  bare: '#94a3b8',
}

/** RGB 0–1 for WMS evalscript (healthy → bare class index 1–0). */
export const STRESS_ZONE_RGB_01: readonly [number, number, number][] = [
  [0.580392, 0.639216, 0.721569], // bare (class 0)
  [0.133333, 0.772549, 0.368627], // healthy (1)
  [0.980392, 0.8, 0.082353], // mild (2)
  [0.976471, 0.45098, 0.086275], // moderate (3)
  [0.937255, 0.266667, 0.266667], // severe (4)
]

export const STRESS_ZONE_CLASS_INDEX: Record<StressZoneTier, number> = {
  bare: 0,
  healthy: 1,
  mild: 2,
  moderate: 3,
  severe: 4,
}

export function stressZoneTierFromClassIndex(classIndex: number): StressZoneTier {
  const c = Math.max(0, Math.min(4, Math.round(classIndex)))
  if (c === 0) return 'bare'
  if (c === 1) return 'healthy'
  if (c === 2) return 'mild'
  if (c === 3) return 'moderate'
  return 'severe'
}
