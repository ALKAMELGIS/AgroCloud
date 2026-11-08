/**
 * Operations forms service (SQLite): validation, CRUD with audit, filtered queries, report
 * aggregation, bulk import with duplicate detection, master lists and settings.
 */
import { getDatabase } from '../database/connection.js'
import { applyComputed } from './operationsCompute.js'
import { DEFAULT_SETTINGS, FORMS, MASTER_LISTS, getForm } from './formSchemas.js'
import { normalizePermissions } from './opsPermissions.js'

export class OpsError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function requireForm(id) {
  const form = getForm(id)
  if (!form) throw new OpsError(404, `Unknown form "${id}".`)
  return form
}

const db = () => getDatabase()

/* ------------------------------------------------------------------ value coercion */

const pad = (n) => String(n).padStart(2, '0')

/** Excel serial day (1900 system) → YYYY-MM-DD. */
function excelSerialToDate(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export function coerceDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10)
  if (typeof raw === 'number') return raw > 20000 && raw < 80000 ? excelSerialToDate(raw) : null
  const s = String(raw).trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s) // dd/mm/yyyy (the forms' format)
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/.exec(s)
  if (m) return `20${m[3]}-${pad(m[2])}-${pad(m[1])}`
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToDate(Number(s))
  return null
}

export function coerceTime(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') {
    if (raw >= 0 && raw < 1) {
      const mins = Math.round(raw * 24 * 60)
      return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`
    }
    return null
  }
  if (raw instanceof Date) return `${pad(raw.getUTCHours())}:${pad(raw.getUTCMinutes())}`
  const s = String(raw).trim()
  const m = /(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(s)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  if (m[3]) {
    const pm = m[3].toLowerCase() === 'pm'
    if (pm && h < 12) h += 12
    if (!pm && h === 12) h = 0
  }
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

export function coerceNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw).trim().replace(/,/g, '')
  if (!s || /^#/.test(s)) return null // #N/A, #REF!
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function coerceText(raw) {
  if (raw === null || raw === undefined) return null
  const s = String(raw).replace(/\s+/g, ' ').trim()
  if (!s || /^#(N\/A|REF!|VALUE!|NAME\?|DIV\/0!)$/i.test(s)) return null
  return s.slice(0, 2000)
}

/**
 * Validate and normalise one record. Unknown keys are ignored; computed fields are recalculated.
 * @returns {{ record: object, errors: Record<string,string> }}
 */
export function validateRecord(form, input, { partial = false } = {}) {
  const record = {}
  const errors = {}
  for (const field of form.fields) {
    if (field.computed) continue
    if (partial && !(field.key in input)) continue
    const raw = input[field.key]
    let value
    switch (field.type) {
      case 'date':
        value = coerceDate(raw)
        if (raw != null && raw !== '' && value == null) errors[field.key] = 'Invalid date'
        break
      case 'time':
        value = coerceTime(raw)
        if (raw != null && raw !== '' && value == null) errors[field.key] = 'Invalid time'
        break
      case 'number':
      case 'integer':
        value = coerceNumber(raw)
        if (raw != null && raw !== '' && value == null && !/^#/.test(String(raw))) errors[field.key] = 'Must be a number'
        if (value != null && field.type === 'integer') value = Math.round(value)
        if (value != null && field.min != null && value < field.min) errors[field.key] = `Must be ≥ ${field.min}`
        if (value != null && field.max != null && value > field.max) errors[field.key] = `Must be ≤ ${field.max}`
        break
      default:
        value = coerceText(raw)
    }
    if (field.required && (value == null || value === '') && !errors[field.key]) errors[field.key] = 'Required'
    record[field.key] = value
  }
  return { record, errors }
}

/* ------------------------------------------------------------------ settings & lists */

export function getSettings() {
  const rows = db().prepare('SELECT key, value FROM ops_settings').all()
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    company: { ...DEFAULT_SETTINGS.company, ...(stored.company ?? {}) },
    ecPhLimits: { ...DEFAULT_SETTINGS.ecPhLimits, ...(stored.ecPhLimits ?? {}) },
    forms: stored.forms ?? {},
    permissions: normalizePermissions(stored.permissions),
  }
}

export function saveSettings(patch, actor) {
  const allowed = ['company', 'ecPhLimits', 'autoAddListValues', 'forms', 'permissions']
  const stmt = db().prepare(
    `INSERT INTO ops_settings (key, value, updated_at, updated_by) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
  db().transaction(() => {
    const changed = []
    for (const key of allowed) {
      if (!(key in (patch ?? {}))) continue
      const value = key === 'permissions' ? normalizePermissions(patch[key]) : patch[key]
      stmt.run(key, JSON.stringify(value), actor)
      changed.push(key)
    }
    if (changed.length) auditSystem('_settings', 'settings', actor, { keys: changed })
  })()
  return getSettings()
}

function listKeyValid(key) {
  return MASTER_LISTS.some((l) => l.key === key)
}

export function getMasterLists() {
  const rows = db().prepare('SELECT id, list_key, value, label_ar, meta, active, sort_order FROM ops_master_items ORDER BY list_key, sort_order, value COLLATE NOCASE').all()
  const out = Object.fromEntries(MASTER_LISTS.map((l) => [l.key, []]))
  for (const r of rows) {
    ;(out[r.list_key] ??= []).push({ id: r.id, value: r.value, labelAr: r.label_ar, meta: r.meta ? JSON.parse(r.meta) : null, active: !!r.active, sortOrder: r.sort_order })
  }
  return out
}

export function upsertMasterItem(listKey, item, actor) {
  if (!listKeyValid(listKey)) throw new OpsError(404, `Unknown list "${listKey}".`)
  const value = coerceText(item?.value)
  if (!value) throw new OpsError(400, 'Value is required.')
  const meta = item.meta && typeof item.meta === 'object' ? JSON.stringify(item.meta) : null
  if (item.id) {
    const res = db()
      .prepare('UPDATE ops_master_items SET value = ?, label_ar = ?, meta = ?, active = ?, sort_order = ? WHERE id = ? AND list_key = ?')
      .run(value, coerceText(item.labelAr), meta, item.active === false ? 0 : 1, Number(item.sortOrder) || 0, item.id, listKey)
    if (!res.changes) throw new OpsError(404, 'Item not found.')
    auditSystem('_lists', 'list-update', actor, { list: listKey, value })
    return item.id
  }
  const res = db()
    .prepare('INSERT INTO ops_master_items (list_key, value, label_ar, meta, active, sort_order) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(list_key, value) DO UPDATE SET active = 1')
    .run(listKey, value, coerceText(item.labelAr), meta, item.active === false ? 0 : 1, Number(item.sortOrder) || 0)
  auditSystem('_lists', 'list-add', actor, { list: listKey, value })
  return Number(res.lastInsertRowid)
}

export function deleteMasterItem(listKey, id, actor) {
  const row = db().prepare('SELECT value FROM ops_master_items WHERE id = ? AND list_key = ?').get(id, listKey)
  const res = db().prepare('DELETE FROM ops_master_items WHERE id = ? AND list_key = ?').run(id, listKey)
  if (!res.changes) throw new OpsError(404, 'Item not found.')
  auditSystem('_lists', 'list-delete', actor, { list: listKey, value: row?.value ?? null })
}

/** Add values used in records to their lookup lists (when the setting is on). */
function rememberListValues(form, records) {
  const ins = db().prepare('INSERT OR IGNORE INTO ops_master_items (list_key, value) VALUES (?, ?)')
  for (const field of form.fields) {
    if (field.type !== 'select' || !field.list) continue
    const seen = new Set()
    for (const r of records) {
      const v = r[field.key]
      if (v && !seen.has(v)) {
        seen.add(v)
        ins.run(field.list, v)
      }
    }
  }
}

/* ------------------------------------------------------------------ audit */

/** Settings / list changes are audited under pseudo-forms `_settings` and `_lists`. */
function auditSystem(kind, action, actor, changes) {
  db()
    .prepare('INSERT INTO ops_audit (form, record_id, action, actor, changes) VALUES (?, NULL, ?, ?, ?)')
    .run(kind, action, actor ?? null, changes ? JSON.stringify(changes) : null)
}

/** Paged audit log across every form: filters form, actor, action, from/to (dates), q (text). */
export function listAudit(qs = {}) {
  const where = []
  const args = []
  if (qs.form) {
    where.push('form = ?')
    args.push(String(qs.form))
  }
  if (qs.actor) {
    where.push('actor = ?')
    args.push(String(qs.actor))
  }
  if (qs.action) {
    where.push('action = ?')
    args.push(String(qs.action))
  }
  if (qs.from && /^\d{4}-\d{2}-\d{2}$/.test(qs.from)) {
    where.push('at >= ?')
    args.push(`${qs.from}T00:00:00`)
  }
  if (qs.to && /^\d{4}-\d{2}-\d{2}$/.test(qs.to)) {
    where.push('at <= ?')
    args.push(`${qs.to}T23:59:59.999Z`)
  }
  if (qs.q) {
    where.push('(changes LIKE ? OR actor LIKE ? OR CAST(record_id AS TEXT) = ?)')
    const like = `%${String(qs.q)}%`
    args.push(like, like, String(qs.q))
  }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const pageSize = Math.min(Math.max(Number(qs.pageSize) || 50, 1), 500)
  const page = Math.max(Number(qs.page) || 1, 1)
  const total = db().prepare(`SELECT COUNT(*) AS n FROM ops_audit ${sql}`).get(...args).n
  const rows = db()
    .prepare(`SELECT id, form, record_id AS recordId, action, actor, at, changes FROM ops_audit ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize)
    .map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null }))
  const actors = db().prepare('SELECT actor, COUNT(*) AS n FROM ops_audit WHERE actor IS NOT NULL GROUP BY actor ORDER BY n DESC LIMIT 200').all()
  return { rows, total, page, pageSize, actors }
}

function audit(form, recordId, action, actor, changes) {
  db()
    .prepare('INSERT INTO ops_audit (form, record_id, action, actor, changes) VALUES (?, ?, ?, ?, ?)')
    .run(form.id, recordId, action, actor ?? null, changes ? JSON.stringify(changes) : null)
}

export function recordHistory(formId, id) {
  const form = requireForm(formId)
  return db()
    .prepare('SELECT id, action, actor, at, changes FROM ops_audit WHERE form = ? AND record_id = ? ORDER BY id DESC LIMIT 200')
    .all(form.id, id)
    .map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null }))
}

/* ------------------------------------------------------------------ queries */

const SORTABLE_EXTRA = new Set(['id', 'created_at', 'updated_at'])

/**
 * Build WHERE clause from a query: { from, to, q, filters: { field: [values] }, deleted }.
 * Only form fields can be filtered; values are bound parameters.
 */
function buildWhere(form, query = {}) {
  const where = [query.deleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL']
  const params = []
  const keys = new Set(form.fields.map((f) => f.key))
  const from = coerceDate(query.from)
  const to = coerceDate(query.to)
  if (from) {
    where.push(`${form.dateField} >= ?`)
    params.push(from)
  }
  if (to) {
    where.push(`${form.dateField} <= ?`)
    params.push(to)
  }
  for (const [key, raw] of Object.entries(query.filters ?? {})) {
    if (!keys.has(key)) continue
    const values = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v)).filter((v) => v !== '')
    if (!values.length) continue
    const hasEmpty = values.includes('__empty__')
    const real = values.filter((v) => v !== '__empty__')
    const parts = []
    if (real.length) {
      parts.push(`${key} IN (${real.map(() => '?').join(',')})`)
      params.push(...real)
    }
    if (hasEmpty) parts.push(`(${key} IS NULL OR ${key} = '')`)
    where.push(`(${parts.join(' OR ')})`)
  }
  const q = coerceText(query.q)
  if (q) {
    const textCols = form.fields.filter((f) => ['text', 'select', 'textarea'].includes(f.type)).map((f) => f.key)
    if (textCols.length) {
      where.push(`(${textCols.map((c) => `${c} LIKE ?`).join(' OR ')})`)
      for (let i = 0; i < textCols.length; i++) params.push(`%${q}%`)
    }
  }
  return { sql: where.join(' AND '), params }
}

function orderBy(form, sort, dir) {
  const keys = new Set(form.fields.map((f) => f.key))
  const col = sort && (keys.has(sort) || SORTABLE_EXTRA.has(sort)) ? sort : form.dateField
  const direction = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  return `${col} ${direction}, id ${direction}`
}

export function listRecords(formId, query = {}) {
  const form = requireForm(formId)
  const { sql, params } = buildWhere(form, query)
  const pageSize = Math.max(1, Math.min(5000, Number(query.pageSize) || 50))
  const page = Math.max(1, Number(query.page) || 1)
  const total = db().prepare(`SELECT COUNT(*) AS n FROM ${form.table} WHERE ${sql}`).get(...params).n
  const rows = db()
    .prepare(`SELECT * FROM ${form.table} WHERE ${sql} ORDER BY ${orderBy(form, query.sort, query.dir)} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

/** Ordered ids for the current query — drives Previous / Next in the entry form. */
export function recordNeighbours(formId, id, query = {}) {
  const form = requireForm(formId)
  const { sql, params } = buildWhere(form, query)
  const ids = db().prepare(`SELECT id FROM ${form.table} WHERE ${sql} ORDER BY ${orderBy(form, query.sort, query.dir)}`).all(...params).map((r) => r.id)
  const i = ids.indexOf(Number(id))
  return { index: i, total: ids.length, prev: i > 0 ? ids[i - 1] : null, next: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null }
}

export function getRecord(formId, id) {
  const form = requireForm(formId)
  const row = db().prepare(`SELECT * FROM ${form.table} WHERE id = ?`).get(id)
  if (!row) throw new OpsError(404, 'Record not found.')
  return row
}

/** Distinct values per filterable field (for filter dropdowns). */
export function filterOptions(formId) {
  const form = requireForm(formId)
  const out = {}
  for (const key of form.filters ?? []) {
    out[key] = db()
      .prepare(`SELECT ${key} AS v, COUNT(*) AS n FROM ${form.table} WHERE deleted_at IS NULL AND ${key} IS NOT NULL AND ${key} <> '' GROUP BY ${key} ORDER BY ${key} COLLATE NOCASE LIMIT 1000`)
      .all()
      .map((r) => ({ value: r.v, count: r.n }))
  }
  const range = db().prepare(`SELECT MIN(${form.dateField}) AS min, MAX(${form.dateField}) AS max, COUNT(*) AS n FROM ${form.table} WHERE deleted_at IS NULL`).get()
  return { options: out, dateRange: { min: range.min, max: range.max }, total: range.n }
}

const PERIOD_SQL = {
  day: (col) => col,
  week: (col) => `strftime('%G-W%V', ${col})`, // ISO week, same as the forms' week_no
  month: (col) => `substr(${col}, 1, 7)`,
  year: (col) => `substr(${col}, 1, 4)`,
}

/**
 * Report aggregation: metrics of the form grouped by up to two keys — a dimension field and/or a
 * period (day | week | month | year) of the form's date.
 */
export function aggregate(formId, query = {}) {
  const form = requireForm(formId)
  const { sql, params } = buildWhere(form, query)
  const dims = new Set(form.dimensions)
  const groups = []
  for (const g of [query.groupBy, query.groupBy2].filter(Boolean)) {
    if (PERIOD_SQL[g]) groups.push({ key: g, expr: PERIOD_SQL[g](form.dateField) })
    else if (dims.has(g)) groups.push({ key: g, expr: `COALESCE(NULLIF(${g}, ''), '(blank)')` })
  }
  const metricSql = form.metrics.map((m, i) => {
    if (m.agg === 'count') return `COUNT(*) AS m${i}`
    const fn = { sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX' }[m.agg] ?? 'SUM'
    return `${fn}(${m.key}) AS m${i}`
  })
  const select = [...groups.map((g, i) => `${g.expr} AS g${i}`), ...metricSql].join(', ')
  const group = groups.length ? `GROUP BY ${groups.map((_, i) => `g${i}`).join(', ')} ORDER BY ${groups.map((_, i) => `g${i}`).join(', ')}` : ''
  const rows = db().prepare(`SELECT ${select} FROM ${form.table} WHERE ${sql} ${group}`).all(...params)
  return {
    groups: groups.map((g) => g.key),
    metrics: form.metrics,
    rows: rows.map((r) => ({
      keys: groups.map((_, i) => r[`g${i}`]),
      values: form.metrics.map((_, i) => r[`m${i}`]),
    })),
  }
}

/* ------------------------------------------------------------------ writes */

function duplicateKey(form, record) {
  return form.uniqueKey.map((k) => (record[k] == null ? '' : String(record[k]).toLowerCase())).join('␟')
}

function findDuplicate(form, record, excludeId) {
  const where = form.uniqueKey.map((k) => (record[k] == null ? `(${k} IS NULL OR ${k} = '')` : `${k} = ?`))
  const params = form.uniqueKey.filter((k) => record[k] != null).map((k) => record[k])
  const row = db()
    .prepare(`SELECT id FROM ${form.table} WHERE deleted_at IS NULL AND ${where.join(' AND ')}${excludeId ? ' AND id <> ?' : ''} LIMIT 1`)
    .get(...params, ...(excludeId ? [excludeId] : []))
  return row?.id ?? null
}

function insertRow(form, record, actor, source) {
  const cols = form.fields.map((f) => f.key)
  const stmt = db().prepare(
    `INSERT INTO ${form.table} (${cols.join(', ')}, source, created_by) VALUES (${cols.map(() => '?').join(', ')}, ?, ?)`,
  )
  const res = stmt.run(...cols.map((c) => record[c] ?? null), source, actor ?? null)
  return Number(res.lastInsertRowid)
}

export function createRecord(formId, input, actor, { allowDuplicate = false } = {}) {
  const form = requireForm(formId)
  const { record, errors } = validateRecord(form, input)
  if (Object.keys(errors).length) throw new OpsError(422, 'Please correct the highlighted fields.', errors)
  const full = applyComputed(form, record)
  if (!allowDuplicate) {
    const dup = findDuplicate(form, full)
    if (dup) throw new OpsError(409, 'An identical record already exists.', { duplicateId: dup })
  }
  const id = db().transaction(() => {
    const newId = insertRow(form, full, actor, 'manual')
    if (getSettings().autoAddListValues) rememberListValues(form, [full])
    audit(form, newId, 'create', actor, null)
    return newId
  })()
  return getRecord(form.id, id)
}

export function updateRecord(formId, id, input, actor) {
  const form = requireForm(formId)
  const before = getRecord(form.id, id)
  if (before.deleted_at) throw new OpsError(409, 'Restore the record before editing it.')
  const merged = { ...before, ...input }
  const { record, errors } = validateRecord(form, merged)
  if (Object.keys(errors).length) throw new OpsError(422, 'Please correct the highlighted fields.', errors)
  const full = applyComputed(form, record)
  const changes = {}
  for (const f of form.fields) {
    const a = before[f.key] ?? null
    const b = full[f.key] ?? null
    if (String(a) !== String(b)) changes[f.key] = [a, b]
  }
  if (!Object.keys(changes).length) return before
  const cols = form.fields.map((f) => f.key)
  db().transaction(() => {
    db()
      .prepare(`UPDATE ${form.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_by = ? WHERE id = ?`)
      .run(...cols.map((c) => full[c] ?? null), actor ?? null, id)
    if (getSettings().autoAddListValues) rememberListValues(form, [full])
    audit(form, Number(id), 'update', actor, changes)
  })()
  return getRecord(form.id, id)
}

export function deleteRecord(formId, id, actor) {
  const form = requireForm(formId)
  getRecord(form.id, id)
  db().transaction(() => {
    db().prepare(`UPDATE ${form.table} SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_by = ? WHERE id = ? AND deleted_at IS NULL`).run(actor ?? null, id)
    audit(form, Number(id), 'delete', actor, null)
  })()
}

export function restoreRecord(formId, id, actor) {
  const form = requireForm(formId)
  getRecord(form.id, id)
  db().transaction(() => {
    db().prepare(`UPDATE ${form.table} SET deleted_at = NULL, updated_by = ? WHERE id = ?`).run(actor ?? null, id)
    audit(form, Number(id), 'restore', actor, null)
  })()
  return getRecord(form.id, id)
}

/**
 * Bulk import. Every row is validated and computed; rows identical (by the form's unique key) to an
 * existing record or to an earlier row of the same batch are skipped. `dryRun` validates only.
 */
export function importRecords(formId, rows, actor, { source = 'import', dryRun = false } = {}) {
  const form = requireForm(formId)
  if (!Array.isArray(rows)) throw new OpsError(400, 'rows must be an array.')
  if (rows.length > 100000) throw new OpsError(413, 'Import at most 100,000 rows at a time.')
  const ok = []
  const errors = []
  const batchKeys = new Set()
  let duplicates = 0
  rows.forEach((input, index) => {
    const { record, errors: errs } = validateRecord(form, input ?? {})
    if (Object.keys(errs).length) {
      errors.push({ row: index, errors: errs })
      return
    }
    const full = applyComputed(form, record)
    const key = duplicateKey(form, full)
    if (batchKeys.has(key) || findDuplicate(form, full)) {
      duplicates++
      return
    }
    batchKeys.add(key)
    ok.push(full)
  })
  const summary = { received: rows.length, valid: ok.length, inserted: 0, duplicates, invalid: errors.length, errors: errors.slice(0, 500) }
  if (dryRun || !ok.length) return summary
  db().transaction(() => {
    for (const r of ok) insertRow(form, r, actor, String(source).slice(0, 200))
    if (getSettings().autoAddListValues) rememberListValues(form, ok)
    audit(form, null, 'import', actor, { source, inserted: ok.length, duplicates, invalid: errors.length })
  })()
  summary.inserted = ok.length
  return summary
}

export function formCounts() {
  return Object.fromEntries(
    FORMS.map((f) => {
      const r = db().prepare(`SELECT COUNT(*) AS n, MAX(${f.dateField}) AS last FROM ${f.table} WHERE deleted_at IS NULL`).get()
      return [f.id, { total: r.n, lastDate: r.last }]
    }),
  )
}
