export type DevelopEliteMapNavigatorZone = 'pan' | 'rotate' | 'look'

/** Classify pointer position in the navigator disc (normalized 0–1 radius from center). */
export function developEliteMapNavigatorPickZone(
  normRadius: number,
  viewMode3d: boolean,
): DevelopEliteMapNavigatorZone {
  if (viewMode3d && normRadius < 0.28) return 'look'
  if (normRadius < 0.52) return 'rotate'
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
