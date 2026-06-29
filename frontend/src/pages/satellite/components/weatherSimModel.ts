/**
 * Weather simulation model — the single source of truth shared by the control
 * panel (WeatherVisualizationPanel) and the canvas renderer (WeatherVizOverlay).
 *
 * Every field is a plain, serialisable scalar so the whole state can be snapshotted
 * into a "scene slide", shared as JSON, or persisted. The renderer treats these as
 * physical-ish inputs (intensities 0–100, wind in km/h + meteorological degrees,
 * temperature in °C) and converts them into particle counts, velocities and tints.
 */

export type WeatherVizPresetId = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm'

export type WeatherSimState = {
  /** Master transport — when false the renderer freezes the current frame. */
  playing: boolean
  /** Rain intensity 0–100 (drop count + speed + opacity). */
  rain: number
  /** Snow intensity 0–100 (flake count + size + flutter). */
  snow: number
  /** Storm intensity 0–100 — darkens the sky, boosts rain density and gustiness. */
  storm: number
  /** Thunder/lightning activity 0–100 (flash frequency + bolt brightness); 0 = off. */
  thunder: number
  /** Air temperature in °C (−30…50) — drives colour grading + snow/rain bias. */
  temperatureC: number
  /** Sustained wind speed in km/h (0…120). */
  windSpeed: number
  /** Meteorological wind direction in degrees (0=N, 90=E …) — direction wind comes FROM. */
  windDirection: number
  /** Cloud coverage 0–100 (drifting cloud sprites + sky dimming). */
  cloud: number
  /** Fog density 0–100 (ground-up haze veil). */
  fog: number
  /** Global animation-speed multiplier (0.25…3×). */
  speed: number
}

export const WEATHER_SIM_LIMITS = {
  temperatureC: { min: -30, max: 50 },
  windSpeed: { min: 0, max: 120 },
  windDirection: { min: 0, max: 360 },
  speed: { min: 0.25, max: 3 },
} as const

export const DEFAULT_WEATHER_SIM: WeatherSimState = {
  playing: true,
  rain: 0,
  snow: 0,
  storm: 0,
  thunder: 0,
  temperatureC: 22,
  windSpeed: 8,
  windDirection: 225,
  cloud: 18,
  fog: 0,
  speed: 1,
}

/** Quick-apply presets — patch the relevant physical fields, keep transport/speed. */
export const WEATHER_SIM_PRESETS: Record<
  WeatherVizPresetId,
  { label: string; icon: string; tone: string; patch: Partial<WeatherSimState> }
> = {
  clear: {
    label: 'Clear',
    icon: 'fa-solid fa-sun',
    tone: 'clear',
    patch: { rain: 0, snow: 0, storm: 0, thunder: 0, cloud: 6, fog: 0, windSpeed: 6, temperatureC: 27 },
  },
  cloudy: {
    label: 'Cloudy',
    icon: 'fa-solid fa-cloud-sun',
    tone: 'cloud',
    patch: { rain: 0, snow: 0, storm: 0, thunder: 0, cloud: 72, fog: 8, windSpeed: 16, temperatureC: 18 },
  },
  rain: {
    label: 'Rain',
    icon: 'fa-solid fa-cloud-showers-heavy',
    tone: 'rain',
    patch: { rain: 64, snow: 0, storm: 14, thunder: 0, cloud: 86, fog: 12, windSpeed: 28, temperatureC: 12 },
  },
  snow: {
    label: 'Snow',
    icon: 'fa-solid fa-snowflake',
    tone: 'snow',
    patch: { rain: 0, snow: 70, storm: 0, thunder: 0, cloud: 78, fog: 20, windSpeed: 14, temperatureC: -4 },
  },
  fog: {
    label: 'Fog',
    icon: 'fa-solid fa-smog',
    tone: 'fog',
    patch: { rain: 0, snow: 0, storm: 0, thunder: 0, cloud: 38, fog: 84, windSpeed: 4, temperatureC: 9 },
  },
  storm: {
    label: 'Storm',
    icon: 'fa-solid fa-cloud-bolt',
    tone: 'storm',
    patch: { rain: 92, snow: 0, storm: 88, thunder: 82, cloud: 96, fog: 14, windSpeed: 74, temperatureC: 11 },
  },
}

export const WEATHER_SIM_PRESET_ORDER: WeatherVizPresetId[] = [
  'clear',
  'cloudy',
  'rain',
  'snow',
  'fog',
  'storm',
]

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

/** Clamp every field to its valid range (defensive against stored / shared state). */
export function normalizeWeatherSim(input: Partial<WeatherSimState> | null | undefined): WeatherSimState {
  const s = { ...DEFAULT_WEATHER_SIM, ...(input ?? {}) }
  return {
    playing: Boolean(s.playing),
    rain: clamp(s.rain, 0, 100),
    snow: clamp(s.snow, 0, 100),
    storm: clamp(s.storm, 0, 100),
    thunder: clamp(s.thunder, 0, 100),
    temperatureC: clamp(s.temperatureC, WEATHER_SIM_LIMITS.temperatureC.min, WEATHER_SIM_LIMITS.temperatureC.max),
    windSpeed: clamp(s.windSpeed, WEATHER_SIM_LIMITS.windSpeed.min, WEATHER_SIM_LIMITS.windSpeed.max),
    windDirection: ((Math.round(s.windDirection) % 360) + 360) % 360,
    cloud: clamp(s.cloud, 0, 100),
    fog: clamp(s.fog, 0, 100),
    speed: clamp(s.speed, WEATHER_SIM_LIMITS.speed.min, WEATHER_SIM_LIMITS.speed.max),
  }
}

/** True when the state matches the given preset's physical patch (for active highlighting). */
export function weatherSimMatchesPreset(state: WeatherSimState, presetId: WeatherVizPresetId): boolean {
  const patch = WEATHER_SIM_PRESETS[presetId].patch
  return (Object.keys(patch) as (keyof WeatherSimState)[]).every(key => {
    const want = patch[key] as number
    const have = state[key] as number
    return Math.abs(have - want) <= 0.5
  })
}

/** Whether any visible weather effect is active (used to skip rendering when idle). */
export function weatherSimHasActiveEffect(state: WeatherSimState): boolean {
  return (
    state.rain > 0 ||
    state.snow > 0 ||
    state.storm > 0 ||
    state.thunder > 0 ||
    state.cloud > 0 ||
    state.fog > 0 ||
    state.temperatureC <= 2 ||
    state.temperatureC >= 34
  )
}

/**
 * Screen-space wind unit vector (y points down). Meteorological direction is the
 * direction the wind comes FROM, so motion points the opposite way:
 *   from N (0°)  → blows toward S → (0, +1)
 *   from E (90°) → blows toward W → (−1, 0)
 */
export function weatherWindVector(windDirection: number): { x: number; y: number } {
  const rad = (windDirection * Math.PI) / 180
  return { x: -Math.sin(rad), y: Math.cos(rad) }
}

/** Compass label for a meteorological bearing. */
export function windCompass(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8
  return dirs[idx]!
}

/** A short human summary of the active simulation (status line / slide names). */
export function describeWeatherSim(state: WeatherSimState): string {
  const parts: string[] = []
  if (state.storm >= 50) parts.push('Storm')
  if (state.rain > 0 && state.storm < 50) parts.push('Rain')
  if (state.snow > 0) parts.push('Snow')
  if (state.thunder > 0) parts.push('Thunder')
  if (!parts.length && state.fog >= 40) parts.push('Fog')
  if (!parts.length && state.cloud >= 50) parts.push('Cloudy')
  if (!parts.length) parts.push('Clear')
  return `${parts.join(' · ')} · ${Math.round(state.temperatureC)}°C · ${Math.round(state.windSpeed)} km/h ${windCompass(
    state.windDirection,
  )}`
}

/**
 * Derive a Mapbox GL atmospheric `fog` spec from the simulation so the globe's
 * horizon/sky matches the weather (cold→blue space, storm→dark, fog→hazy horizon).
 * Returns `null` to clear (used on reset / clear sky with no haze).
 */
export function weatherSimToMapboxFog(state: WeatherSimState): Record<string, unknown> | null {
  const stormy = state.storm / 100
  const fogD = state.fog / 100
  const cloudy = state.cloud / 100
  const cold = clamp((10 - state.temperatureC) / 35, 0, 1)
  const warm = clamp((state.temperatureC - 28) / 22, 0, 1)

  if (stormy < 0.02 && fogD < 0.05 && cloudy < 0.1 && cold < 0.05 && warm < 0.05) {
    return null
  }

  // Horizon haze brightens with fog/cloud; darkens with storm.
  const baseLum = clamp(0.86 - stormy * 0.5 + fogD * 0.12, 0.2, 0.95)
  const r = Math.round(255 * (baseLum + warm * 0.04))
  const g = Math.round(255 * (baseLum - cold * 0.05))
  const b = Math.round(255 * (baseLum + cold * 0.08 - warm * 0.05))
  const horizonBlend = clamp(0.02 + fogD * 0.7 + cloudy * 0.18 + stormy * 0.15, 0.02, 0.95)
  const spaceLum = clamp(0.08 + (1 - stormy) * 0.06 + warm * 0.04, 0.02, 0.22)

  return {
    range: [0.5 + (1 - fogD) * 3, 8 + (1 - fogD) * 6],
    color: `rgb(${r}, ${g}, ${b})`,
    'high-color': stormy > 0.4 ? 'rgb(58, 66, 92)' : `rgb(${Math.round(60 + warm * 80)}, ${Math.round(110 - cold * 30)}, ${Math.round(200 + cold * 30)})`,
    'horizon-blend': horizonBlend,
    'space-color': `rgb(${Math.round(255 * spaceLum)}, ${Math.round(255 * spaceLum)}, ${Math.round(255 * (spaceLum + cold * 0.04))})`,
    'star-intensity': clamp(0.12 * (1 - cloudy) * (1 - stormy), 0, 0.2),
  }
}
