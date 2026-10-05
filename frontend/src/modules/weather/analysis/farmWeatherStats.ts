import type { OpenMeteoDashboardBundle, OpenMeteoDashboardHourlyPoint } from '../services/openMeteoWeatherDashboard'



export type FarmWeatherStats = {

  temperature: { mean: number | null; min: number | null; max: number | null; range: number | null; stdDev: number | null }

  humidity: { mean: number | null; min: number | null; max: number | null }

  wind: { meanKmh: number | null; maxKmh: number | null; dominantLabel: string | null }

  precip: { currentMm: number | null; dailyTotalMm: number | null; weeklyTotalMm: number | null; forecastTotalMm: number | null }

  pressure: { mean: number | null; min: number | null; max: number | null }

}



const EMPTY: FarmWeatherStats = {

  temperature: { mean: null, min: null, max: null, range: null, stdDev: null },

  humidity: { mean: null, min: null, max: null },

  wind: { meanKmh: null, maxKmh: null, dominantLabel: null },

  precip: { currentMm: null, dailyTotalMm: null, weeklyTotalMm: null, forecastTotalMm: null },

  pressure: { mean: null, min: null, max: null },

}



function mean(nums: number[]): number | null {

  if (!nums.length) return null

  return nums.reduce((a, b) => a + b, 0) / nums.length

}



function stdDev(nums: number[]): number | null {

  const m = mean(nums)

  if (m == null || nums.length < 2) return null

  const v = nums.reduce((s, x) => s + (x - m) ** 2, 0) / (nums.length - 1)

  return Math.sqrt(v)

}



function pickHourlySeries(bundle: OpenMeteoDashboardBundle): OpenMeteoDashboardHourlyPoint[] {

  if (bundle.hourlyForecast?.length) return bundle.hourlyForecast

  if (bundle.hourly?.length) return bundle.hourly

  const next = bundle.snapshot?.nextHours ?? []

  return next.map(h => ({

    ...h,

    apparentTemperatureC: null,

    dewPointC: null,

    cloudCoverPct: null,

    visibilityKm: null,

    precipitationProbabilityPct: null,

    rainMm: null,

    pressureHpa: null,

    et0Mm: null,

    shortwaveRadiationWm2: null,

  }))

}



export function farmWeatherStatsHasValues(stats: FarmWeatherStats): boolean {

  return (

    stats.temperature.mean != null ||

    stats.temperature.range != null ||

    stats.humidity.mean != null ||

    stats.wind.maxKmh != null ||

    stats.precip.weeklyTotalMm != null ||

    stats.pressure.min != null

  )

}



export function computeFarmWeatherStats(bundle: OpenMeteoDashboardBundle | null): FarmWeatherStats {

  if (!bundle) return EMPTY



  const hourly = pickHourlySeries(bundle)

  const daily = bundle.daily7 ?? []

  const snap = bundle.snapshot



  const temps = hourly.map(h => h.temperatureC).filter((v): v is number => v != null && Number.isFinite(v))

  const rh = hourly.map(h => h.humidityPct).filter((v): v is number => v != null && Number.isFinite(v))

  const wind = hourly.map(h => h.windSpeedKmh).filter((v): v is number => v != null && Number.isFinite(v))

  const pressure = hourly.map(h => h.pressureHpa).filter((v): v is number => v != null && Number.isFinite(v))



  const dailyMins = daily.map(d => d.tempMinC).filter((v): v is number => v != null && Number.isFinite(v))

  const dailyMaxs = daily.map(d => d.tempMaxC).filter((v): v is number => v != null && Number.isFinite(v))

  const dailyPrecip = daily.map(d => d.precipMm ?? 0)



  let tMin = temps.length ? Math.min(...temps) : null

  let tMax = temps.length ? Math.max(...temps) : null

  if (dailyMins.length) tMin = tMin != null ? Math.min(tMin, Math.min(...dailyMins)) : Math.min(...dailyMins)

  if (dailyMaxs.length) tMax = tMax != null ? Math.max(tMax, Math.max(...dailyMaxs)) : Math.max(...dailyMaxs)



  let tempMean = mean(temps)

  if (tempMean == null && dailyMins.length && dailyMaxs.length) {

    const mids: number[] = []

    for (let i = 0; i < Math.min(dailyMins.length, dailyMaxs.length); i++) {

      mids.push((dailyMins[i] + dailyMaxs[i]) / 2)

    }

    tempMean = mean(mids)

  }

  if (tempMean == null && snap?.temperatureC != null) tempMean = snap.temperatureC



  let rhMean = mean(rh)

  if (rhMean == null && snap?.humidityPct != null) rhMean = snap.humidityPct



  let windMean = mean(wind)

  let windMax = wind.length ? Math.max(...wind) : null

  if (windMax == null && snap?.windSpeedKmh != null) {

    windMax = snap.windSpeedKmh

    windMean = snap.windSpeedKmh

  }



  const pressureMean = mean(pressure)

  const pMin = pressure.length ? Math.min(...pressure) : null

  const pMax = pressure.length ? Math.max(...pressure) : null



  const weeklyPrecip = dailyPrecip.length ? dailyPrecip.reduce((a, b) => a + b, 0) : null



  return {

    temperature: {

      mean: tempMean,

      min: tMin,

      max: tMax,

      range: tMin != null && tMax != null ? tMax - tMin : null,

      stdDev: stdDev(temps),

    },

    humidity: {

      mean: rhMean,

      min: rh.length ? Math.min(...rh) : rhMean,

      max: rh.length ? Math.max(...rh) : rhMean,

    },

    wind: {

      meanKmh: windMean,

      maxKmh: windMax,

      dominantLabel: snap?.windDirectionLabel ?? null,

    },

    precip: {

      currentMm: snap?.precipMm ?? null,

      dailyTotalMm: dailyPrecip[0] ?? snap?.precipMm ?? null,

      weeklyTotalMm: weeklyPrecip,

      forecastTotalMm: weeklyPrecip,

    },

    pressure: {

      mean: pressureMean,

      min: pMin,

      max: pMax,

    },

  }

}


