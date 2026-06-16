/**
 * OpenWeatherMap (https://openweathermap.org/api) — current + 5-day/3h forecast (+ optional One Call timemachine) for Geo AI context.
 */

const MAX_BLOCK = 4200

function clip(s: string): string {
  if (s.length <= MAX_BLOCK) return s
  return `${s.slice(0, MAX_BLOCK - 40)}\n[…truncated for model context…]\n`
}

const MONTH_TOKEN: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

/** If the user names a single calendar day, return UTC midnight for that civil date (interpretation: UTC date, consistent with OWM dt_txt). */
export function parseUserRequestedCalendarDayUtc(userText: string): { y: number; m0: number; d: number } | null {
  const t = userText.trim()
  if (!t) return null

  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const y = Number(iso[1])
    const mo = Number(iso[2]) - 1
    const d = Number(iso[3])
    if (y >= 1970 && y <= 2100 && mo >= 0 && mo <= 11 && d >= 1 && d <= 31) return { y, m0: mo, d }
  }

  const dmy = t.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
  if (dmy) {
    const a = Number(dmy[1])
    const b = Number(dmy[2])
    const y = Number(dmy[3])
    let day = a
    let month = b
    if (a > 12 && b <= 12) {
      day = a
      month = b
    } else if (b > 12 && a <= 12) {
      day = b
      month = a
    }
    if (y >= 1970 && y <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) return { y, m0: month - 1, d: day }
  }

  const dmMonY = t.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s*,?\s*(\d{4})\b/i)
  if (dmMonY) {
    const d = Number(dmMonY[1])
    const mon = MONTH_TOKEN[dmMonY[2].toLowerCase().slice(0, 3)]
    const y = Number(dmMonY[3])
    if (mon != null && y >= 1970 && y <= 2100 && d >= 1 && d <= 31) return { y, m0: mon, d }
  }

  const monDY = t.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})\b/i)
  if (monDY) {
    const mon = MONTH_TOKEN[monDY[1].toLowerCase().slice(0, 3)]
    const d = Number(monDY[2])
    const y = Number(monDY[3])
    if (mon != null && y >= 1970 && y <= 2100 && d >= 1 && d <= 31) return { y, m0: mon, d }
  }

  return null
}

function utcDayStartMs(y: number, m0: number, d: number): number {
  return Date.UTC(y, m0, d, 0, 0, 0, 0)
}

function startOfTodayUtcMs(): number {
  const n = new Date()
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 0, 0, 0, 0)
}

function formatYmdUtc(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const WEATHER_ANSWER_RULES = `### WEATHER_ANSWER_RULES (mandatory)
- Use **only** the numbers and timestamps in OPENWEATHER FACTS above for this coordinate pair. Do not invent values, cities, or dates.
- If you see **NO_DATA_FOR_REQUESTED_DAY** or failed HTTP / subscription messages for the user’s requested day, say clearly that data could not be obtained: Arabic users → **لم أتحصل على بيانات**; English → **I could not obtain data for that request.** Do **not** substitute “current” weather or a different calendar day as if it answered the question.
- Never describe weather for coordinates other than the "Point:" line above. Do not move the user to another place in prose.`

type ForecastItem = {
  dt?: number
  dt_txt?: string
  main?: { temp?: number; feels_like?: number }
  pop?: number
  weather?: Array<{ description?: string }>
}

/**
 * Fetches 2.5 weather + forecast; optional One Call 3.0 timemachine for a named past day.
 * Pass userText so a specific calendar day can be matched to forecast slices or historical API.
 */
export type OpenWeatherContextOpts = {
  /** When true, skip per-day / timemachine matching — use current + 5-day forecast only (follow-ups like “weather here”). */
  ambientWindowOnly?: boolean
}

export async function buildOpenWeatherContextBlock(
  apiKey: string,
  lat: number,
  lng: number,
  userText: string,
  opts?: OpenWeatherContextOpts,
): Promise<string> {
  const key = apiKey.trim()
  if (!key) return ''

  const lines: string[] = []
  lines.push(
    '### OPENWEATHER FACTS (authoritative for this turn: cite “OpenWeather” once in prose; do not invent values beyond this block)',
  )
  lines.push(`Point: latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}`)
  lines.push('Source: https://api.openweathermap.org/data/2.5 (current + forecast), units=metric; historical via data/3.0/onecall/timemachine when available on the key.')

  const requested = opts?.ambientWindowOnly ? null : parseUserRequestedCalendarDayUtc(userText)
  const requestedYmd = requested ? formatYmdUtc(requested.y, requested.m0, requested.d) : null
  const todayStart = startOfTodayUtcMs()
  const reqStart = requested ? utcDayStartMs(requested.y, requested.m0, requested.d) : null

  let forecastList: ForecastItem[] = []
  let forecastOk = false

  const base = new URL('https://api.openweathermap.org/data/2.5/weather')
  base.searchParams.set('lat', String(lat))
  base.searchParams.set('lon', String(lng))
  base.searchParams.set('units', 'metric')
  base.searchParams.set('appid', key)

  try {
    const res = await fetch(base.toString())
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      lines.push(`Current weather request failed (HTTP ${res.status}). ${errText.slice(0, 200)}`)
    } else {
      const data = (await res.json()) as Record<string, unknown>
      const cod = data.cod
      if (cod !== undefined && String(cod) !== '200') {
        lines.push(`API message: ${String(data.message ?? cod)}`)
      } else {
        const name = typeof data.name === 'string' ? data.name : ''
        const main = data.main as Record<string, unknown> | undefined
        const wind = data.wind as Record<string, unknown> | undefined
        const w0 = Array.isArray(data.weather) ? (data.weather as Record<string, unknown>[])[0] : undefined
        const desc = w0 && typeof w0.description === 'string' ? w0.description : ''
        const mainTemp = main && typeof main.temp === 'number' ? main.temp : null
        const feels = main && typeof main.feels_like === 'number' ? main.feels_like : null
        const hum = main && typeof main.humidity === 'number' ? main.humidity : null
        const pr = main && typeof main.pressure === 'number' ? main.pressure : null
        const spd = wind && typeof wind.speed === 'number' ? wind.speed : null
        const deg = wind && typeof wind.deg === 'number' ? wind.deg : null
        lines.push(
          `Current${name ? ` (${name})` : ''}: ${desc || 'n/a'} — temp ${mainTemp != null ? `${mainTemp.toFixed(1)}°C` : 'n/a'}, feels ${feels != null ? `${feels.toFixed(1)}°C` : 'n/a'}, humidity ${hum != null ? `${hum}%` : 'n/a'}, pressure ${pr != null ? `${pr} hPa` : 'n/a'}, wind ${spd != null ? `${spd} m/s` : 'n/a'}${deg != null ? ` @ ${deg}°` : ''}.`,
        )
      }
    }
  } catch (e) {
    lines.push(`Current weather fetch error: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const fc = new URL('https://api.openweathermap.org/data/2.5/forecast')
    fc.searchParams.set('lat', String(lat))
    fc.searchParams.set('lon', String(lng))
    fc.searchParams.set('units', 'metric')
    fc.searchParams.set('cnt', '40')
    fc.searchParams.set('appid', key)
    const res = await fetch(fc.toString())
    if (!res.ok) {
      lines.push(`Forecast request failed (HTTP ${res.status}).`)
    } else {
      forecastOk = true
      const data = (await res.json()) as { list?: ForecastItem[] }
      forecastList = data.list ?? []
      lines.push('Next intervals (3 h steps, first rows):')
      for (let i = 0; i < Math.min(12, forecastList.length); i++) {
        const it = forecastList[i]
        const t = it?.main?.temp
        const fl = it?.main?.feels_like
        const pop = it?.pop
        const d0 = it?.weather?.[0]?.description
        lines.push(
          `  - ${it?.dt_txt ?? 'n/a'}: ${d0 ?? 'n/a'}, temp ${typeof t === 'number' ? `${t.toFixed(1)}°C` : 'n/a'}, feels ${typeof fl === 'number' ? `${fl.toFixed(1)}°C` : 'n/a'}, precip prob ${typeof pop === 'number' ? `${Math.round(pop * 100)}%` : 'n/a'}`,
        )
      }
    }
  } catch (e) {
    lines.push(`Forecast fetch error: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (requested && requestedYmd && reqStart != null) {
    const dayRows = forecastList.filter(it => {
      const tx = it.dt_txt
      if (!tx || typeof tx !== 'string') return false
      return tx.startsWith(requestedYmd)
    })

    if (dayRows.length) {
      const temps = dayRows.map(r => r.main?.temp).filter((x): x is number => typeof x === 'number')
      const tmin = temps.length ? Math.min(...temps) : NaN
      const tmax = temps.length ? Math.max(...temps) : NaN
      lines.push(`Requested calendar day ${requestedYmd} (from OpenWeather 5-day/3h forecast at this point):`)
      lines.push(
        `  - In-range samples: ${dayRows.length} step(s); approx min ${Number.isFinite(tmin) ? `${tmin.toFixed(1)}°C` : 'n/a'}, max ${Number.isFinite(tmax) ? `${tmax.toFixed(1)}°C` : 'n/a'} (same coordinates).`,
      )
    } else if (reqStart >= todayStart) {
      const lastFcMs =
        forecastList.length && forecastList[forecastList.length - 1]?.dt
          ? (forecastList[forecastList.length - 1].dt as number) * 1000
          : null
      if (!forecastOk || lastFcMs == null) {
        lines.push(
          `Requested calendar day ${requestedYmd}: **NO_DATA_FOR_REQUESTED_DAY** — forecast data was missing, so this day could not be matched.`,
        )
      } else if (reqStart <= lastFcMs + 86400000) {
        lines.push(
          `Requested calendar day ${requestedYmd}: **NO_DATA_FOR_REQUESTED_DAY** — no 3-hour samples in the returned forecast for that UTC date at this coordinate.`,
        )
      } else {
        lines.push(
          `Requested calendar day ${requestedYmd}: **NO_DATA_FOR_REQUESTED_DAY** — outside the returned forecast range for this coordinate.`,
        )
      }
    } else if (reqStart < todayStart) {
      const dtUnix = Math.floor((reqStart + 43200000) / 1000)
      let timemachineWorked = false
      try {
        const tm = new URL('https://api.openweathermap.org/data/3.0/onecall/timemachine')
        tm.searchParams.set('lat', String(lat))
        tm.searchParams.set('lon', String(lng))
        tm.searchParams.set('dt', String(dtUnix))
        tm.searchParams.set('appid', key)
        tm.searchParams.set('units', 'metric')
        const tr = await fetch(tm.toString())
        if (tr.ok) {
          const td = (await tr.json()) as {
            data?: Array<{ dt?: number; temp?: number; humidity?: number; weather?: Array<{ description?: string }> }>
            hourly?: Array<{ dt?: number; temp?: number; humidity?: number; weather?: Array<{ description?: string }> }>
          }
          const hist = td.data?.length ? td.data : td.hourly ?? []
          if (hist.length) {
            timemachineWorked = true
            const temps = hist.map(h => h.temp).filter((x): x is number => typeof x === 'number')
            const tmin = temps.length ? Math.min(...temps) : NaN
            const tmax = temps.length ? Math.max(...temps) : NaN
            lines.push(`Historical (OpenWeather One Call timemachine) around ${requestedYmd} UTC for this point:`)
            lines.push(
              `  - Hourly samples: ${hist.length}; approx min ${Number.isFinite(tmin) ? `${tmin.toFixed(1)}°C` : 'n/a'}, max ${Number.isFinite(tmax) ? `${tmax.toFixed(1)}°C` : 'n/a'}.`,
            )
          }
        } else {
          const body = await tr.text().catch(() => '')
          lines.push(
            `Historical (timemachine) HTTP ${tr.status} for ${requestedYmd}: ${body.slice(0, 160).replace(/\s+/g, ' ')}`,
          )
        }
      } catch (e) {
        lines.push(`Historical (timemachine) fetch error: ${e instanceof Error ? e.message : String(e)}`)
      }
      if (!timemachineWorked) {
        lines.push(
          `**NO_DATA_FOR_REQUESTED_DAY** for ${requestedYmd}: past-day archive is not available from OpenWeather for this key/endpoint, or the response had no hourly rows. Do not substitute current conditions.`,
        )
      }
    }
  }

  lines.push('')
  lines.push(WEATHER_ANSWER_RULES)

  return clip(lines.join('\n'))
}
