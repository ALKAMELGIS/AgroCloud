import { computeFrameMetrics } from './floodGridMetrics'

export type ShallowWaterState = {
  width: number
  height: number
  cellSizeM: number
  elevation: Float32Array
  mask: Uint8Array
  depth: Float32Array
  vx: Float32Array
  vy: Float32Array
  manningN: number
}

const G = 9.81

/** One explicit shallow-water / diffusive wave step (CPU). */
export function shallowWaterStep(
  state: ShallowWaterState,
  dtSec: number,
  rainRateMPerSec: number,
): void {
  const { width, height, cellSizeM, elevation, mask, depth, vx, vy, manningN } = state
  const dx = cellSizeM
  const n = width * height
  const hNew = new Float32Array(n)
  const vxNew = new Float32Array(n)
  const vyNew = new Float32Array(n)

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i
      if (!mask[idx]) {
        hNew[idx] = 0
        vxNew[idx] = 0
        vyNew[idx] = 0
        continue
      }
      const z = elevation[idx]
      const h = depth[idx]
      const ws = z + h

      const iL = i > 0 ? i - 1 : i
      const iR = i < width - 1 ? i + 1 : i
      const jU = j > 0 ? j - 1 : j
      const jD = j < height - 1 ? j + 1 : j

      const wsL = elevation[j * width + iL] + depth[j * width + iL]
      const wsR = elevation[j * width + iR] + depth[j * width + iR]
      const wsU = elevation[jU * width + i] + depth[jU * width + i]
      const wsD = elevation[jD * width + i] + depth[jD * width + i]

      const dhdx = (wsR - wsL) / (2 * dx)
      const dhdy = (wsD - wsU) / (2 * dx)

      let ux = vx[idx] - G * dtSec * dhdx
      let uy = vy[idx] - G * dtSec * dhdy

      const speed = Math.hypot(ux, uy)
      const hSafe = Math.max(h, 1e-4)
      const fric = G * (manningN * manningN) * speed / Math.pow(hSafe, 1 / 3)
      if (speed > 1e-6) {
        const f = Math.min(1, fric * dtSec / speed)
        ux *= 1 - f
        uy *= 1 - f
      }

      const div =
        (depth[j * width + iR] * vx[j * width + iR] - depth[j * width + iL] * vx[j * width + iL]) / (2 * dx) +
        (depth[jD * width + i] * vy[jD * width + i] - depth[jU * width + i] * vy[jU * width + i]) / (2 * dx)

      let hn = h + rainRateMPerSec * dtSec - div * dtSec
      if (hn < 0) hn = 0

      vxNew[idx] = ux
      vyNew[idx] = uy
      hNew[idx] = hn
    }
  }

  depth.set(hNew)
  vx.set(vxNew)
  vy.set(vyNew)
}

export function runShallowWaterSimulation(input: {
  width: number
  height: number
  cellSizeM: number
  elevation: Float32Array
  mask: Uint8Array
  config: {
    rainfallMm: number
    durationMin: number
    manningN: number
    depthThresholdM: number
    timestepSec: number
    frameIntervalSec: number
  }
  onProgress?: (pct: number) => void
  onPreviewFrame?: (depth: Float32Array, vx: Float32Array, vy: Float32Array, timeSec: number) => void
  signal?: AbortSignal
}): {
  frames: Array<{
    depth: Float32Array
    vx: Float32Array
    vy: Float32Array
    floodedAreaHa: number
    maxDepthM: number
    volumeM3: number
    timeSec: number
  }>
  maxDepthGrid: Float32Array
  arrivalTimeSec: Float32Array
} {
  const { width, height, cellSizeM, elevation, mask, config } = input
  const n = width * height
  const depth = new Float32Array(n)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const maxDepthGrid = new Float32Array(n)
  const arrivalTimeSec = new Float32Array(n)
  arrivalTimeSec.fill(-1)

  const state: ShallowWaterState = {
    width,
    height,
    cellSizeM,
    elevation,
    mask,
    depth,
    vx,
    vy,
    manningN: config.manningN,
  }

  const totalSec = config.durationMin * 60
  const dt = config.timestepSec
  const steps = Math.max(1, Math.ceil(totalSec / dt))
  const rainM = config.rainfallMm / 1000
  const rainRate = rainM / totalSec
  const frameEvery = Math.max(1, Math.round(config.frameIntervalSec / dt))

  const frames: Array<{
    depth: Float32Array
    vx: Float32Array
    vy: Float32Array
    floodedAreaHa: number
    maxDepthM: number
    volumeM3: number
    timeSec: number
  }> = []

  for (let s = 0; s <= steps; s++) {
    if (input.signal?.aborted) break
    const timeSec = s * dt
    if (s > 0) shallowWaterStep(state, dt, rainRate)

    for (let i = 0; i < n; i++) {
      if (depth[i] > maxDepthGrid[i]) maxDepthGrid[i] = depth[i]
      if (arrivalTimeSec[i] < 0 && depth[i] > config.depthThresholdM) arrivalTimeSec[i] = timeSec
    }

    if (s % frameEvery === 0 || s === steps) {
      const metrics = computeFrameMetrics(depth, mask, cellSizeM, config.depthThresholdM)
      const frameDepth = new Float32Array(depth)
      const frameVx = new Float32Array(vx)
      const frameVy = new Float32Array(vy)
      frames.push({
        depth: frameDepth,
        vx: frameVx,
        vy: frameVy,
        ...metrics,
        timeSec,
      })
      input.onPreviewFrame?.(frameDepth, frameVx, frameVy, timeSec)
    }
    input.onProgress?.(Math.min(100, Math.round((s / steps) * 100)))
  }

  return { frames, maxDepthGrid, arrivalTimeSec }
}
