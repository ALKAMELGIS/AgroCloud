/**
 * Computed columns for operations forms. Pure functions of the record; the server applies them on
 * every save and import (the web app mirrors them for live preview in operationsCompute.ts).
 */

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const round = (v, digits = 4) => (v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits)

/** ISO-8601 week number of a YYYY-MM-DD date. */
export function isoWeek(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''))
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

export function addDays(dateStr, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''))
  if (!m || days == null) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + Math.round(days))
  return d.toISOString().slice(0, 10)
}

/** Drippers sampled per EC/pH reading (the sheet's "12 Drip Volume"). */
export const EC_DRIPPERS_PER_SAMPLE = 12

export const COMPUTE = {
  weekNo: (r, form) => isoWeek(r[form.dateField]),
  ecDripTotal: (r) => {
    const drip = num(r.drip_volume_ml)
    return drip == null ? null : drip * EC_DRIPPERS_PER_SAMPLE
  },
  ecDrainPct: (r) => {
    const drip = num(r.drip_volume_ml)
    const drain = num(r.drain_volume_ml)
    if (drip == null || drain == null || drip <= 0) return null
    return round((drain / (drip * EC_DRIPPERS_PER_SAMPLE)) * 100, 2)
  },
  ecTotalWater: (r) => {
    const q = num(r.water_qty_m3)
    const c = num(r.cycles)
    return q == null || c == null ? null : round(q * c, 4)
  },
  pppCost: (r) => {
    const rate = num(r.rate_per_ha)
    const price = num(r.unit_price)
    return rate == null || price == null ? null : round((rate * price) / 1000, 4)
  },
  pppClearDate: (r) => addDays(r.application_date, num(r.phi_days)),
  irrigationDailyTotal: (r) => {
    const q = num(r.water_qty_m3)
    const f = num(r.frequency)
    return q == null ? null : round(q * (f ?? 1), 4)
  },
  fertigationDailyTotal: (r) => {
    const v = num(r.valves)
    const w = num(r.water_per_valve_m3)
    const f = num(r.frequency)
    return v == null || w == null ? null : round(v * w * (f ?? 1), 4)
  },
}

/** Fill every computed field of `form` on a copy of `record`. */
export function applyComputed(form, record) {
  const out = { ...record }
  for (const field of form.fields) {
    if (!field.computed) continue
    const fn = COMPUTE[field.computed]
    out[field.key] = fn ? fn(out, form) : null
  }
  return out
}
