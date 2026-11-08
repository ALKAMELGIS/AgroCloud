/**
 * /api/ops over HTTP on in-memory SQLite (identity off): schema, CRUD + audit, computed columns,
 * duplicate guard, filters/pagination/navigation, aggregation, import (dedupe + validation), lists,
 * settings.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'

import { closeDatabase } from '../server/database/connection.js'
import { registerOperationsRoutes } from '../server/operations/operationsRoutes.js'
import { coerceDate, coerceTime } from '../server/operations/operationsService.js'
import { applyComputed, isoWeek } from '../server/operations/operationsCompute.js'
import { getForm } from '../server/operations/formSchemas.js'

process.env.AGROCLOUD_IDENTITY = 'off'

let server
let base

test.before(async () => {
  const app = express()
  registerOperationsRoutes(app)
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${server.address().port}/api/ops`
})

test.after(() => {
  server?.close()
  closeDatabase()
})

async function call(method, path, body, role = 'Admin', user = 'tester') {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-agrocloud-user': user, 'x-agrocloud-role': role },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json() }
}

test('coercion handles the spreadsheets’ formats', () => {
  assert.equal(coerceDate('05/12/2025'), '2025-12-05')
  assert.equal(coerceDate('2025-12-05T00:00:00.000Z'), '2025-12-05')
  assert.equal(coerceDate(45996), '2025-12-05')
  assert.equal(coerceDate('not a date'), null)
  assert.equal(coerceTime('17:45:00'), '17:45')
  assert.equal(coerceTime(0.75), '18:00')
  assert.equal(coerceTime('3:30 PM'), '15:30')
})

test('computed columns', () => {
  const ec = applyComputed(getForm('ec_ph'), { drip_volume_ml: 900, drain_volume_ml: 5700, water_qty_m3: 4, cycles: 5 })
  assert.equal(ec.drip_total_ml, 10800)
  assert.equal(ec.drain_pct, 52.78)
  assert.equal(ec.total_water_m3, 20)
  const ppp = applyComputed(getForm('ppp'), { application_date: '2025-09-10', phi_days: 1, rate_per_ha: 36, unit_price: 724.5 })
  assert.equal(ppp.clear_to_harvest_date, '2025-09-11')
  assert.equal(ppp.cost, 26.082)
  const fert = applyComputed(getForm('fertigation'), { record_date: '2025-09-01', valves: 5, water_per_valve_m3: 80, frequency: 1 })
  assert.equal(fert.daily_total_m3, 400)
  assert.equal(fert.week_no, 36)
  assert.equal(isoWeek('2025-11-24'), 48)
})

test('schema lists every form with fields and counts', async () => {
  const { status, body } = await call('GET', '/schema')
  assert.equal(status, 200)
  assert.deepEqual(body.forms.map((f) => f.id), ['harvest', 'ec_ph', 'ppp', 'irrigation', 'fertigation', 'fertilizer_issue'])
  assert.ok(body.listItems.methods.some((i) => i.value === 'Drip'))
  assert.equal(body.counts.harvest.total, 0)
  assert.equal(body.settings.company.name, 'ELITE AGRO UAE LLC')
})

test('create validates, computes, audits, guards duplicates and updates', async () => {
  const bad = await call('POST', '/forms/harvest/records', { harvest_date: 'x', quantity_kg: -1 })
  assert.equal(bad.status, 422)
  assert.equal(bad.body.details.harvest_date, 'Invalid date')
  assert.equal(bad.body.details.product, 'Required')
  assert.equal(bad.body.details.quantity_kg, 'Must be ≥ 0')

  const rec = { harvest_date: '05/12/2025', start_time: '15:00:00', product: 'Capsicum Yellow', variety: 'Sven RZ', location: 'NH 01', segment: '2,3', quantity_kg: 17 }
  const created = await call('POST', '/forms/harvest/records', rec)
  assert.equal(created.status, 201)
  assert.equal(created.body.record.harvest_date, '2025-12-05')
  assert.equal(created.body.record.start_time, '15:00')
  assert.equal(created.body.record.created_by, 'tester')

  const dup = await call('POST', '/forms/harvest/records', rec)
  assert.equal(dup.status, 409)

  const id = created.body.record.id
  const upd = await call('PUT', `/forms/harvest/records/${id}`, { quantity_kg: 20 })
  assert.equal(upd.body.record.quantity_kg, 20)
  const hist = await call('GET', `/forms/harvest/records/${id}/history`)
  assert.deepEqual(hist.body.history.map((h) => h.action), ['update', 'create'])
  assert.deepEqual(hist.body.history[0].changes.quantity_kg, [17, 20])

  // values used in records join their lookup lists
  const lists = await call('GET', '/lists')
  assert.ok(lists.body.items.crops.some((i) => i.value === 'Capsicum Yellow'))
  assert.ok(lists.body.items.locations.some((i) => i.value === 'NH 01'))

  const del = await call('DELETE', `/forms/harvest/records/${id}`)
  assert.equal(del.status, 200)
  assert.equal((await call('GET', '/forms/harvest/records')).body.total, 0)
  assert.equal((await call('GET', '/forms/harvest/records?deleted=1')).body.total, 1)
  await call('POST', `/forms/harvest/records/${id}/restore`)
  assert.equal((await call('GET', '/forms/harvest/records')).body.total, 1)
})

test('import validates, skips duplicates and reports errors; dry run writes nothing', async () => {
  const rows = [
    { record_date: '2025-09-18', location: 'NH 14', valve: '1', record_time: '17:45', ec_in: 1.12, ec_out: 0.62, ph_in: 7.82, ph_out: 7.51, drip_volume_ml: 900, drain_volume_ml: 5700 },
    { record_date: '2025-09-18', location: 'NH 14', valve: '4', record_time: '17:45', ec_in: 1.15, ph_in: 7.72 },
    { record_date: '2025-09-18', location: 'NH 14', valve: '4', record_time: '17:45', ec_in: 1.15, ph_in: 7.72 }, // dup in batch
    { record_date: '2025-09-19', location: '', valve: '2' }, // missing location
    { record_date: '2025-09-19', location: 'NH 01', ph_in: 21 }, // out of range
  ]
  const dry = await call('POST', '/forms/ec_ph/import', { rows, dryRun: true })
  assert.deepEqual([dry.body.valid, dry.body.duplicates, dry.body.invalid, dry.body.inserted], [2, 1, 2, 0])
  assert.equal((await call('GET', '/forms/ec_ph/records')).body.total, 0)

  const real = await call('POST', '/forms/ec_ph/import', { rows, source: 'import:EC.xlsx' })
  assert.equal(real.body.inserted, 2)
  assert.equal(real.body.errors[0].row, 3)
  assert.equal(real.body.errors[1].errors.ph_in, 'Must be ≤ 14')
  const again = await call('POST', '/forms/ec_ph/import', { rows })
  assert.equal(again.body.inserted, 0)
  assert.equal(again.body.duplicates, 3)
  const list = await call('GET', '/forms/ec_ph/records?sort=valve&dir=asc')
  assert.equal(list.body.rows[0].drain_pct, 52.78)
  assert.equal(list.body.rows[0].source, 'import:EC.xlsx')
})

test('filters, search, pagination, navigation and aggregation', async () => {
  const rows = []
  const crops = ['Tomato', 'Capsicum', 'Cucumber']
  for (let i = 0; i < 30; i++) {
    rows.push({ harvest_date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, product: crops[i % 3], location: `NH ${(i % 4) + 1}`, segment: String(i), quantity_kg: 10 + i })
  }
  const imp = await call('POST', '/forms/harvest/import', { rows })
  assert.equal(imp.body.inserted, 30)

  const tomato = await call('GET', '/forms/harvest/records?f.product=Tomato&from=2026-01-01&to=2026-01-31')
  assert.equal(tomato.body.total, 10)
  const two = await call('GET', '/forms/harvest/records?f.product=Tomato||Cucumber&pageSize=5&page=2&sort=quantity_kg&dir=asc')
  assert.equal(two.body.total, 20)
  assert.equal(two.body.rows.length, 5)
  assert.ok(two.body.rows[0].quantity_kg <= two.body.rows[4].quantity_kg)
  assert.equal((await call('GET', '/forms/harvest/records?q=cucum')).body.total, 10)

  const ordered = (await call('GET', '/forms/harvest/records?f.product=Tomato&sort=quantity_kg&dir=asc&pageSize=100')).body.rows
  const nav = await call('GET', `/forms/harvest/records/${ordered[1].id}?nav=1&f.product=Tomato&sort=quantity_kg&dir=asc`)
  assert.equal(nav.body.nav.prev, ordered[0].id)
  assert.equal(nav.body.nav.next, ordered[2].id)
  assert.equal(nav.body.nav.total, 10)

  const agg = await call('GET', '/forms/harvest/aggregate?from=2026-01-01&groupBy=product')
  const byCrop = Object.fromEntries(agg.body.rows.map((r) => [r.keys[0], r.values]))
  assert.equal(byCrop.Tomato[0], [0, 3, 6, 9, 12, 15, 18, 21, 24, 27].reduce((s, i) => s + 10 + i, 0))
  assert.equal(byCrop.Tomato[1], 10)
  const monthly = await call('GET', '/forms/harvest/aggregate?from=2026-01-01&groupBy=month&groupBy2=location')
  assert.equal(monthly.body.groups.join(','), 'month,location')
  assert.equal(monthly.body.rows.length, 4)
  const weekly = await call('GET', '/forms/harvest/aggregate?from=2026-01-01&to=2026-01-04&groupBy=week')
  assert.deepEqual(weekly.body.rows.map((r) => r.keys[0]), ['2026-W01']) // ISO week (Jan 1–4 2026)

  const opts = await call('GET', '/forms/harvest/filters')
  assert.ok(opts.body.options.product.some((o) => o.value === 'Tomato' && o.count === 10))
  assert.equal(opts.body.dateRange.max, '2026-01-28')
})

test('unknown form / list and bad values are rejected cleanly', async () => {
  assert.equal((await call('GET', '/forms/nope/records')).status, 404)
  assert.equal((await call('POST', '/lists/nope', { value: 'x' })).status, 404)
  assert.equal((await call('POST', '/lists/crops', {})).status, 400)
  // filtering on a non-field is ignored rather than injected
  const r = await call('GET', '/forms/harvest/records?f.id%3D1%20OR%201=1=x')
  assert.equal(r.status, 200)
})

test('lists and settings round-trip', async () => {
  const created = await call('POST', '/lists/ppp_products', { value: 'Mospilan', meta: { active_ingredient: 'Acetamiprid', phi_days: 1 } })
  assert.equal(created.status, 201)
  const items = (await call('GET', '/lists')).body.items.ppp_products
  assert.equal(items.find((i) => i.value === 'Mospilan').meta.active_ingredient, 'Acetamiprid')
  await call('PUT', `/lists/ppp_products/${created.body.id}`, { value: 'Mospilan 20 SP', meta: { phi_days: 3 } })
  assert.ok((await call('GET', '/lists')).body.items.ppp_products.some((i) => i.value === 'Mospilan 20 SP'))
  await call('DELETE', `/lists/ppp_products/${created.body.id}`)

  const s = await call('PUT', '/settings', { company: { name: 'Test Farm Co.' }, ecPhLimits: { phMax: 7 }, bogus: 1 })
  assert.equal(s.body.settings.company.name, 'Test Farm Co.')
  assert.equal(s.body.settings.company.issue, 'Issue 03, 17-Sept-2020, Rev00')
  assert.equal(s.body.settings.ecPhLimits.phMax, 7)
  assert.equal(s.body.settings.ecPhLimits.phMin, 5.5)
  assert.equal(s.body.settings.bogus, undefined)
})

test('role permissions are enforced and editable; Admin keeps every right', async () => {
  const rec = { harvest_date: '2026-02-01', product: 'Tomato', location: 'NH 09', segment: 'perm', quantity_kg: 5 }
  // Viewer: read + export only
  assert.equal((await call('GET', '/forms/harvest/records', undefined, 'Viewer')).status, 200)
  assert.equal((await call('POST', '/forms/harvest/records', rec, 'Viewer')).status, 403)
  assert.equal((await call('POST', '/forms/harvest/import', { rows: [rec] }, 'Viewer')).status, 403)
  assert.equal((await call('GET', '/audit', undefined, 'Viewer')).status, 403)
  // Editor: can add and edit but not delete or manage lists/settings
  const created = await call('POST', '/forms/harvest/records', rec, 'Editor', 'editor@farm')
  assert.equal(created.status, 201)
  const id = created.body.record.id
  assert.equal((await call('PUT', `/forms/harvest/records/${id}`, { quantity_kg: 6 }, 'Editor')).status, 200)
  assert.equal((await call('DELETE', `/forms/harvest/records/${id}`, undefined, 'Editor')).status, 403)
  assert.equal((await call('POST', '/lists/crops', { value: 'Okra' }, 'Editor')).status, 403)
  assert.equal((await call('PUT', '/settings', { autoAddListValues: false }, 'Editor')).status, 403)
  // Manager: delete yes, settings no
  assert.equal((await call('DELETE', `/forms/harvest/records/${id}`, undefined, 'Manager')).status, 200)
  assert.equal((await call('PUT', '/settings', { autoAddListValues: true }, 'Manager')).status, 403)

  // schema tells the client who it is
  const me = (await call('GET', '/schema', undefined, 'editor', 'editor@farm')).body.me
  assert.equal(me.role, 'Editor')
  assert.equal(me.actor, 'editor@farm')
  assert.deepEqual(me.rights.forms.harvest, ['view', 'create', 'edit', 'import', 'export'])

  // Admin takes "create" away from Editors on harvest — and cannot take anything from Admin
  const matrix = (await call('GET', '/settings')).body.settings.permissions
  matrix.Editor.forms.harvest = ['view']
  matrix.Admin.forms.harvest = []
  matrix.Admin.admin = []
  const saved = (await call('PUT', '/settings', { permissions: matrix })).body.settings.permissions
  assert.deepEqual(saved.Editor.forms.harvest, ['view'])
  assert.equal(saved.Admin.forms.harvest.length, 6)
  assert.deepEqual(saved.Admin.admin, ['lists', 'settings', 'audit'])
  assert.equal((await call('POST', '/forms/harvest/records', { ...rec, segment: 'p2' }, 'Editor')).status, 403)
  assert.equal((await call('POST', '/forms/ec_ph/records', { record_date: '2026-02-01', location: 'NH 09', valve: '1' }, 'Editor')).status, 201)
  // a write right without view gets view added
  matrix.Viewer.forms.ppp = ['export']
  const fixed = (await call('PUT', '/settings', { permissions: matrix })).body.settings.permissions
  assert.deepEqual(fixed.Viewer.forms.ppp, ['view', 'export'])
  // reset
  await call('PUT', '/settings', { permissions: {} })
})

test('audit log lists every change with filters, including settings and lists', async () => {
  const all = await call('GET', '/audit?pageSize=500')
  assert.equal(all.status, 200)
  const actions = new Set(all.body.rows.map((r) => r.action))
  for (const a of ['create', 'update', 'delete', 'import', 'settings', 'list-add', 'list-delete']) assert.ok(actions.has(a), a)
  const byEditor = await call('GET', '/audit?actor=editor%40farm')
  assert.ok(byEditor.body.total >= 1)
  assert.ok(byEditor.body.rows.every((r) => r.actor === 'editor@farm'))
  assert.ok(all.body.actors.some((a) => a.actor === 'editor@farm'))
  const deletes = await call('GET', '/audit?form=harvest&action=delete')
  assert.ok(deletes.body.rows.every((r) => r.form === 'harvest' && r.action === 'delete'))
  const paged = await call('GET', '/audit?pageSize=2&page=2')
  assert.equal(paged.body.rows.length, 2)
  const future = await call('GET', '/audit?from=2999-01-01')
  assert.equal(future.body.total, 0)
})
