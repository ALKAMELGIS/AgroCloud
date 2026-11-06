export type DevelopEliteMapNavigatorZone = 'pan' | 'rotate' | 'look'

/** Outer edge of `.develop-elite-map__navigator-ring--rotate` (inset 20% → 0.6 of disc radius). */
export const DEVELOP_ELITE_MAP_NAVIGATOR_ROTATE_RING_RADIUS = 0.6

/** Classify pointer position in the navigator disc (normalized 0–1 radius from center). */
export function developEliteMapNavigatorPickZone(
  normRadius: number,
  viewMode3d: boolean,
): DevelopEliteMapNavigatorZone {
  if (viewMode3d && normRadius < 0.28) return 'look'
  // Rotate ring is drawn at `inset: 20%` (normalized radius 0.6) — keep hit-test in sync with CSS.
  if (normRadius < DEVELOP_ELITE_MAP_NAVIGATOR_ROTATE_RING_RADIUS) return 'rotate'
  return 'pan'
}

export function developEliteMapNavigatorSnapCardinalBearing(bearingDeg: number): number {
  const cardinals = [0, 90, 180, -90]
  let best = 0
  let bestDelta = Infinity
  for (const c of cardinals) {
    const delta = Math.abs(((bearingDeg - c + 180) % 360) - 180)
    if (delta < bestDelta) {
      bestDelta = delta
      best = c
    }
  }
  return best
}

export function developEliteMapNavigatorPointerAngleRad(clientX: number, clientY: number, cx: number, cy: number): number {
  return Math.atan2(clientY - cy, clientX - cx)
}
