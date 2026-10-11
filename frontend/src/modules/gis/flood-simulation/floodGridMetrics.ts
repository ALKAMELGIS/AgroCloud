export function computeFrameMetrics(
  depth: Float32Array,
  mask: Uint8Array,
  cellSizeM: number,
  depthThresholdM: number,
): { floodedAreaHa: number; maxDepthM: number; volumeM3: number } {
  const cellArea = cellSizeM * cellSizeM
  let flooded = 0
  let maxDepth = 0
  let volume = 0
  for (let i = 0; i < depth.length; i++) {
    if (!mask[i]) continue
    const h = depth[i]
    if (h > depthThresholdM) flooded += cellArea
    if (h > maxDepth) maxDepth = h
    volume += h * cellArea
  }
  return {
    floodedAreaHa: flooded / 10_000,
    maxDepthM: maxDepth,
    volumeM3: volume,
  }
}

export function buildRainHyetographMmH(totalMm: number, durationMin: number, steps: number): number[] {
  const n = Math.max(4, steps)
  const durationH = durationMin / 60
  const avg = durationH > 0 ? totalMm / durationH : 0
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const shape = Math.sin(Math.PI * t)
    out.push(avg * (0.35 + 0.65 * shape))
  }
  return out
}
