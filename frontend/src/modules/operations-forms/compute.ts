/**
 * Live preview of computed columns while typing. Mirrors backend/server/operations/operationsCompute.js;
 * the server recalculates on save, so the stored value is always the server's.
 */
import type { OpsForm } from './api'

type Rec = Record<string, unknown>

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const round = (v: number | null, digits = 4) => (v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits)

export function isoWeek(dateStr: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''))
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export function addDays(dateStr: unknown, days: number | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''))
  if (!m || days == null) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + Math.round(days))
  return d.toISOString().slice(0, 10)
}

export const EC_DRIPPERS_PER_SAMPLE = 12

const COMPUTE: Record<string, (r: Rec, form: OpsForm) => number | string | null> = {
  weekNo: (r, form) => isoWeek(r[form.dateField]),
  ecDripTotal: r => {
    const drip = num(r.drip_volume_ml)
    return drip == null ? null : drip * EC_DRIPPERS_PER_SAMPLE
  },
  ecDrainPct: r => {
    const drip = num(r.drip_volume_ml)
    const drain = num(r.drain_volume_ml)
    if (drip == null || drain == null || drip <= 0) return null
    return round((drain / (drip * EC_DRIPPERS_PER_SAMPLE)) * 100, 2)
  },
  ecTotalWater: r => {
    const q = num(r.water_qty_m3)
    const c = num(r.cycles)
    return q == null || c == null ? null : round(q * c)
  },
  pppCost: r => {
    const rate = num(r.rate_per_ha)
    const price = num(r.unit_price)
    return rate == null || price == null ? null : round((rate * price) / 1000)
  },
  pppClearDate: r => addDays(r.application_date, num(r.phi_days)),
  irrigationDailyTotal: r => {
    const q = num(r.water_qty_m3)
    const f = num(r.frequency)
    return q == null ? null : round(q * (f ?? 1))
  },
  fertigationDailyTotal: r => {
    const v = num(r.valves)
    const w = num(r.water_per_valve_m3)
    const f = num(r.frequency)
    return v == null || w == null ? null : round(v * w * (f ?? 1))
  },
}

export function applyComputed(form: OpsForm, record: Rec): Rec {
  const out = { ...record }
  for (const field of form.fields) {
    if (!field.computed) continue
    const fn = COMPUTE[field.computed]
    out[field.key] = fn ? fn(out, form) : null
  }
  return out
}
