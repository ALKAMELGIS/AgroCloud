/**
 * Open-Meteo (https://open-meteo.com/) — free, no API key.
 * Builds compact factual blocks for Geo AI (Gemini) system context.
 */

export type SessionAnchorPopup = {
  placeName: string
  country: string
  fullDescription: string
} | null

/** Month names omitted: they matched polite “May I …” and mis-fired date-specific OpenWeather logic. */
const WEATHER_INTENT_RE =
  /\b(weather|climate|rain|rainfall|precip|precipitation|temperature|temp|humid|humidity|wind|forecast|meteo|drizzle|snow|storm|seasonal|wmo|degrees?\s*c|°c|hot|cold|dewpoint|uv\b)\b/i

export function geoExplorerUserMessageImpliesWeather(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (WEATHER_INTENT_RE.test(t)) return true
  return /طقس|مناخ|أمطار|حرارة|رياح|مطر|دافئ|بارد|رطوبة|موسم|جوّي|الجو/i.test(t)
}

function wantsJanMayRange(text: string): boolean {
  const s = text.toLowerCase()
  if (/\bjan\b.*\bmay\b|\bmay\b.*\bjan\b|january.*may|may.*january|between\s+.*jan|from\s+.*jan.*to.*may/i.test(s)) return true
  if (/(يناير|كانون الثاني).*(مايو|أيار)|(مايو|أيار).*(يناير|كانون)/i.test(text)) return true
  if (/\b(jan|feb|mar|apr|may)\b.*\b(jan|feb|mar|apr|may)\b/i.test(s)) {
    const months = (s.match(/\b(jan|feb|mar|apr|may)\b/g) || []).filter(Boolean)
    if (months.length >= 2) return true
  }
  return false
}

function mean(nums: number[]): number {
  const ok = nums.filter(n => Number.isFinite(n))
  if (!ok.length) return NaN
  return ok.reduce((a, b) => a + b, 0) / ok.length
}

function sum(nums: number[]): number {
  return nums.filter(n => Number.isFinite(n)).reduce((a, b) => a + b, 0)
}

function monthlyLinesFromArchiveDaily(data: {
  daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] }
}): string[] {
  const d = data.daily
  if (!d?.time?.length) return []
  const times = d.time
  const tmax = d.temperature_2m_max ?? []
  const tmin = d.temperature_2m_min ?? []
  const pr = d.precipitation_sum ?? []
  const byMonth = new Map<string, { tmax: number[]; tmin: number[]; pr: number[] }>()
  for (let i = 0; i < times.length; i++) {
    const key = times[i].slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, { tmax: [], tmin: [], pr: [] })
    const g = byMonth.get(key)!
    if (Number.isFinite(tmax[i])) g.tmax.push(tmax[i] as number)
    if (Number.isFinite(tmin[i])) g.tmin.push(tmin[i] as number)
    if (Number.isFinite(pr[i])) g.pr.push(pr[i] as number)
  }
  const keys = [...byMonth.keys()].sort()
  const out: string[] = []
  for (const k of keys) {
    const g = byMonth.get(k)!
    const am = mean(g.tmax)
    const im = mean(g.tmin)
    const ps = sum(g.pr)
    if (!Number.isFinite(am) || !Number.isFinite(im)) continue
    out.push(`  - ${k}: avg daily max ${am.toFixed(1)}°C, avg min ${im.toFixed(1)}°C, precip sum ${ps.toFixed(1)} mm`)
  }
  return out
}

export function buildSessionAnchorBlock(lng: number, lat: number, popup: SessionAnchorPopup): string {
  let s =
    '### SESSION MAP ANCHOR (authoritative for follow-ups: “same place”, “here”, “that location”, “this farm”, weather/climate)\n'
  s += `- Coordinates (WGS84, GeoJSON order): longitude ${lng}, latitude ${lat}\n`
  if (popup && (popup.placeName || popup.country || popup.fullDescription)) {
    s += `- Place hint: ${popup.placeName || '—'}, ${popup.country || '—'}\n`
    if (popup.fullDescription.trim()) s += `- Geocoder line: ${popup.fullDescription.trim()}\n`
  }
  s +=
    '- Treat these coordinates as the resolved location even if earlier layer attribute text lacked explicit lat/long.\n' +
    '- Do not claim the location is unknown or that coordinates are missing when this block is present.\n' +
    '- Weather facts appended after this block (OpenWeather plus Open-Meteo compact when a key is configured, otherwise full Open-Meteo) use this same coordinate pair for the atmosphere at the map focus.\n'
  return s
}

const MAX_BLOCK = 3400

function clip(s: string): string {
  if (s.length <= MAX_BLOCK) return s
  return `${s.slice(0, MAX_BLOCK - 40)}\n[…truncated for model context…]\n`
}

/**
 * Fetches Open-Meteo forecast (+ optional Jan–May archive slice) and returns a markdown-style block for the system prompt.
 */
export async function buildOpenMeteoContextBlock(lat: number, lng: number, userText: string): Promise<string> {
  const lines: string[] = []
  lines.push('### OPEN-METEO FACTS (use for numbers; cite “Open-Meteo” in prose; do not invent values beyond this)')
  lines.push(`Point: latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}`)
  lines.push('Sources: https://api.open-meteo.com (forecast) and optionally https://archive-api.open-meteo.com (historical daily).')

  try {
    const fcUrl = new URL('https://api.open-meteo.com/v1/forecast')
    fcUrl.searchParams.set('latitude', String(lat))
    fcUrl.searchParams.set('longitude', String(lng))
    fcUrl.searchParams.set('current_weather', 'true')
    fcUrl.searchParams.set('timezone', 'auto')
    fcUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode')
    fcUrl.searchParams.set('forecast_days', '8')

    const res = await fetch(fcUrl.toString())
    if (!res.ok) {
      lines.push(`Forecast request failed (HTTP ${res.status}).`)
      return clip(lines.join('\n'))
    }
    const data = (await res.json()) as Record<string, unknown>
    const tz = typeof data.timezone === 'string' ? data.timezone : 'unknown'
    const elev = typeof data.elevation === 'number' ? data.elevation : null
    lines.push(`Timezone: ${tz}${elev != null ? `; elevation ~${elev.toFixed(0)} m` : ''}.`)

    const cw = data.current_weather as Record<string, unknown> | undefined
    if (cw && typeof cw === 'object') {
      const t = cw.temperature
      const w = cw.windspeed
      const wd = cw.winddirection
      const wc = cw.weathercode
      const tm = cw.time
      lines.push(
        `Current (approx): ${tm ?? 'n/a'} — temp ${typeof t === 'number' ? `${t}°C` : 'n/a'}, wind ${typeof w === 'number' ? `${w} km/h` : 'n/a'} @ ${typeof wd === 'number' ? `${wd}°` : 'n/a'}, WMO weather code ${wc ?? 'n/a'}.`,
      )
    } else {
      lines.push('Current weather object not returned.')
    }

    const daily = data.daily as
      | { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] }
      | undefined
    if (daily?.time?.length) {
      const n = Math.min(5, daily.time.length)
      lines.push('Next days (daily):')
      for (let i = 0; i < n; i++) {
        const day = daily.time![i]
        const mx = daily.temperature_2m_max?.[i]
        const mn = daily.temperature_2m_min?.[i]
        const pr = daily.precipitation_sum?.[i]
        lines.push(
          `  - ${day}: max ${typeof mx === 'number' ? `${mx.toFixed(1)}°C` : 'n/a'}, min ${typeof mn === 'number' ? `${mn.toFixed(1)}°C` : 'n/a'}, precip ${typeof pr === 'number' ? `${pr.toFixed(1)} mm` : 'n/a'}`,
        )
      }
    }
  } catch (e) {
    lines.push(`Forecast fetch error: ${e instanceof Error ? e.message : String(e)}`)
  }

  const seasonal = wantsJanMayRange(userText)
  if (seasonal) {
    const y = new Date().getFullYear() - 1
    const start = `${y}-01-01`
    const end = `${y}-05-31`
    try {
      const arUrl = new URL('https://archive-api.open-meteo.com/v1/archive')
      arUrl.searchParams.set('latitude', String(lat))
      arUrl.searchParams.set('longitude', String(lng))
      arUrl.searchParams.set('start_date', start)
      arUrl.searchParams.set('end_date', end)
      arUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum')
      arUrl.searchParams.set('timezone', 'auto')
      const ar = await fetch(arUrl.toString())
      if (!ar.ok) {
        lines.push(`Archive Jan–May ${y} failed (HTTP ${ar.status}).`)
      } else {
        const arData = (await ar.json()) as Record<string, unknown>
        lines.push(`Historical daily aggregates (${start} → ${end}, UTC dates; use for “Jan–May” style questions):`)
        const mlines = monthlyLinesFromArchiveDaily(arData)
        if (mlines.length) lines.push(...mlines)
        else lines.push('  (no daily series parsed)')
      }
    } catch (e) {
      lines.push(`Archive fetch error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return clip(lines.join('\n'))
}
