import type { SimulationConfig } from './floodTypes'

/** Keep browser runs responsive by capping time steps on large grids. */
export function simulationConfigForCellCount(
  config: SimulationConfig,
  cellCount: number,
): SimulationConfig {
  const totalSec = config.durationMin * 60
  const desiredSteps = Math.max(1, Math.ceil(totalSec / config.timestepSec))
  const maxSteps =
    cellCount > 250_000 ? 160 : cellCount > 120_000 ? 240 : cellCount > 50_000 ? 320 : 480
  if (desiredSteps <= maxSteps) return config
  const timestepSec = totalSec / maxSteps
  const frameIntervalSec = Math.max(config.frameIntervalSec, timestepSec * 4)
  return { ...config, timestepSec, frameIntervalSec }
}
