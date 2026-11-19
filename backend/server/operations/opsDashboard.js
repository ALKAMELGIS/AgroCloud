/**
 * Operations overview: one request returns the headline numbers and weekly series the hub shows
 * (harvest, EC/pH quality, plant protection cost, water). Sections the caller's role cannot view
 * are left out. Default window: the 12 ISO weeks ending at the latest record date, compared with
 * the 12 weeks before.
 */
import { getDatabase } from '../database/connection.js'
import { getForm } from './formSchemas.js'

const db = () => getDatabase()
const DAY = 86_400_000

const iso = (d) => d.toISOString().slice(0, 10)
const parse = (s) => new Date(`${s}T00:00:00Z`)
const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * DAY))

/** ISO year-week label, identical to SQLite's strftime('%G-W%V'). */
export function isoWeekLabel(dateStr) {
  const d = parse(dateStr)
  const day = (d.getUTCDay() + 6) % 7 // Mon = 0
  const thursday = new Date(d.getTime() + (3 - day) * DAY)
  const year = thursday.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const week = 1 + Math.round(((thursday - jan4) / DAY - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Monday of the ISO week containing dateStr. */
const mondayOf = (s) => addDays(s, -((parse(s).getUTCDay() + 6) % 7))

function weeksBetween(from, to) {
  const out = []
  for (let d = mondayOf(from); d <= to; d = addDays(d, 7)) out.push(isoWeekLabel(d))
  return out
}

function latestDate() {
  const parts = ['harvest', 'ec_ph', 'ppp', 'irrigation', 'fertigation'].map((id) => {
    const f = getForm(id)
    return `SELECT MAX(${f.dateField}) AS d FROM ${f.table} WHERE deleted_at IS NULL`
  })
  const row = db().prepare(`SELECT MAX(d) AS d FROM (${parts.join(' UNION ALL ')})`).get()
  return row?.d ?? null
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

function range(query) {
  const valid = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  const to = valid(query.to) ? query.to : latestDate() ?? iso(new Date())
  const weeks = Math.min(Math.max(Number(query.weeks) || 12, 1), 104)
  // Whole ISO weeks: from the Monday (weeks-1) weeks before `to`'s week.
  const from = valid(query.from) ? query.from : addDays(mondayOf(to), -7 * (weeks - 1))
  const span = Math.round((parse(to) - parse(from)) / DAY) + 1
  return { from, to, prevFrom: addDays(from, -span), prevTo: addDays(from, -1) }
}

function farmClause(query) {
  return query.farm ? { sql: ' AND farm = ?', args: [String(query.farm)] } : { sql: '', args: [] }
}

function weekly(form, valueSql, r, farm, extra = '') {
  const rows = db()
    .prepare(
      `SELECT strftime('%G-W%V', ${form.dateField}) AS w, ${valueSql}
       FROM ${form.table} WHERE deleted_at IS NULL AND ${form.dateField} BETWEEN ? AND ?${farm.sql}${extra}
       GROUP BY w`,
    )
    .all(r.from, r.to, ...farm.args)
  return new Map(rows.map((x) => [x.w, x]))
}

function total(form, valueSql, from, to, farm) {
  return db()
    .prepare(`SELECT ${valueSql} FROM ${form.table} WHERE deleted_at IS NULL AND ${form.dateField} BETWEEN ? AND ?${farm.sql}`)
    .get(from, to, ...farm.args)
}

function top(form, dim, valueSql, r, farm, limit = 8) {
  return db()
    .prepare(
      `SELECT COALESCE(NULLIF(${dim}, ''), '(blank)') AS k, ${valueSql}
       FROM ${form.table} WHERE deleted_at IS NULL AND ${form.dateField} BETWEEN ? AND ?${farm.sql}
       GROUP BY k ORDER BY v DESC LIMIT ?`,
    )
    .all(r.from, r.to, ...farm.args, limit)
}

export function buildDashboard(query, { canView, limits }) {
  const r = range(query)
  const farm = farmClause(query)
  const weeks = weeksBetween(r.from, r.to)
  const out = { range: r, weeks }

  if (canView('harvest')) {
    const f = getForm('harvest')
    const w = weekly(f, 'SUM(quantity_kg) AS kg, COUNT(*) AS n', r, farm)
    const cur = total(f, 'SUM(quantity_kg) AS kg, COUNT(*) AS n', r.from, r.to, farm)
    const prev = total(f, 'SUM(quantity_kg) AS kg', r.prevFrom, r.prevTo, farm)
    out.harvest = {
      kg: r2(cur.kg),
      harvests: cur.n,
      prevKg: r2(prev.kg),
      weekly: weeks.map((wk) => ({ week: wk, kg: r2(w.get(wk)?.kg) })),
      byCrop: top(f, 'product', 'SUM(quantity_kg) AS v', r, farm).map((x) => ({ key: x.k, value: r2(x.v) })),
    }
  }

  if (canView('ec_ph')) {
    const f = getForm('ec_ph')
    const L = limits
    const outSql = `(
      (ec_in IS NOT NULL AND (ec_in < ${+L.ecMin} OR ec_in > ${+L.ecMax})) OR
      (ec_out IS NOT NULL AND (ec_out < ${+L.ecMin} OR ec_out > ${+L.ecMax})) OR
      (ph_in IS NOT NULL AND (ph_in < ${+L.phMin} OR ph_in > ${+L.phMax})) OR
      (ph_out IS NOT NULL AND (ph_out < ${+L.phMin} OR ph_out > ${+L.phMax})))`
    const valueSql = `COUNT(*) AS n, SUM(CASE WHEN ${outSql} THEN 1 ELSE 0 END) AS bad, AVG(ph_in) AS ph, AVG(ec_in) AS ec`
    const w = weekly(f, valueSql, r, farm)
    const cur = total(f, valueSql, r.from, r.to, farm)
    const prev = total(f, valueSql, r.prevFrom, r.prevTo, farm)
    const pct = (bad, n) => (n ? r2((100 * bad) / n) : null)
    out.ecPh = {
      readings: cur.n,
      outOfLimit: cur.bad ?? 0,
      outPct: pct(cur.bad, cur.n),
      prevOutPct: pct(prev.bad, prev.n),
      avgPh: cur.ph == null ? null : r2(cur.ph),
      avgEc: cur.ec == null ? null : r2(cur.ec),
      limits: L,
      weekly: weeks.map((wk) => {
        const x = w.get(wk)
        return { week: wk, readings: x?.n ?? 0, out: x?.bad ?? 0, outPct: x ? pct(x.bad, x.n) : null }
      }),
      byLocation: db()
        .prepare(
          `SELECT COALESCE(NULLIF(location, ''), '(blank)') AS k, COUNT(*) AS n, SUM(CASE WHEN ${outSql} THEN 1 ELSE 0 END) AS v
           FROM ${f.table} WHERE deleted_at IS NULL AND ${f.dateField} BETWEEN ? AND ?${farm.sql}
           GROUP BY k HAVING v > 0 ORDER BY v DESC LIMIT 8`,
        )
        .all(r.from, r.to, ...farm.args)
        .map((x) => ({ key: x.k, value: x.v, readings: x.n })),
    }
  }

  if (canView('ppp')) {
    const f = getForm('ppp')
    const w = weekly(f, 'SUM(cost) AS cost, COUNT(*) AS n', r, farm)
    const cur = total(f, 'SUM(cost) AS cost, COUNT(*) AS n', r.from, r.to, farm)
    const prev = total(f, 'SUM(cost) AS cost, COUNT(*) AS n', r.prevFrom, r.prevTo, farm)
    out.ppp = {
      cost: r2(cur.cost),
      applications: cur.n,
      prevCost: r2(prev.cost),
      prevApplications: prev.n,
      weekly: weeks.map((wk) => ({ week: wk, cost: r2(w.get(wk)?.cost), applications: w.get(wk)?.n ?? 0 })),
      byProduct: top(f, 'ppp_name', 'SUM(cost) AS v, COUNT(*) AS n', r, farm).map((x) => ({ key: x.k, value: r2(x.v), applications: x.n })),
    }
  }

  const water = {}
  for (const id of ['irrigation', 'fertigation']) {
    if (!canView(id)) continue
    const f = getForm(id)
    water[id] = {
      weekly: weekly(f, 'SUM(daily_total_m3) AS m3', r, farm),
      cur: r2(total(f, 'SUM(daily_total_m3) AS m3', r.from, r.to, farm).m3),
      prev: r2(total(f, 'SUM(daily_total_m3) AS m3', r.prevFrom, r.prevTo, farm).m3),
    }
  }
  if (Object.keys(water).length) {
    out.water = {
      series: Object.keys(water),
      m3: r2(Object.values(water).reduce((s, x) => s + x.cur, 0)),
      prevM3: r2(Object.values(water).reduce((s, x) => s + x.prev, 0)),
      bySource: Object.fromEntries(Object.entries(water).map(([k, x]) => [k, x.cur])),
      weekly: weeks.map((wk) => ({
        week: wk,
        ...Object.fromEntries(Object.entries(water).map(([k, x]) => [k, r2(x.weekly.get(wk)?.m3)])),
      })),
    }
  }

  out.farms = db()
    .prepare(
      `SELECT farm, COUNT(*) AS n FROM (
        ${['harvest', 'ec_ph', 'ppp', 'irrigation', 'fertigation'].map((id) => `SELECT farm FROM ${getForm(id).table} WHERE deleted_at IS NULL`).join(' UNION ALL ')}
      ) WHERE farm IS NOT NULL AND farm <> '' GROUP BY farm ORDER BY n DESC LIMIT 50`,
    )
    .all()
    .map((x) => x.farm)
  return out
}
