/**
 * /api/ops — operations forms API.
 *
 *   GET    /api/ops/schema                         forms, sections, lists, settings, counts
 *   GET    /api/ops/forms/:form/records            ?from&to&q&f.<field>=v1,v2&sort&dir&page&pageSize&deleted
 *   GET    /api/ops/forms/:form/records/:id        one record (+ ?nav=1 → prev/next ids for the query)
 *   POST   /api/ops/forms/:form/records            create  (409 on duplicate unless ?allowDuplicate=1)
 *   PUT    /api/ops/forms/:form/records/:id        update
 *   DELETE /api/ops/forms/:form/records/:id        soft delete
 *   POST   /api/ops/forms/:form/records/:id/restore
 *   GET    /api/ops/forms/:form/records/:id/history audit trail
 *   POST   /api/ops/forms/:form/import             { rows, source, dryRun }
 *   GET    /api/ops/forms/:form/filters            distinct values + date range
 *   GET    /api/ops/forms/:form/aggregate          ?groupBy&groupBy2 + same filters as records
 *   GET/POST/PUT/DELETE /api/ops/lists/:list[/:id] master lists
 *   GET/PUT /api/ops/settings
 *
 * With the identity module on, every call needs a session; otherwise (single-PC installs that use
 * the admin directory) the client's user name from `X-AgroCloud-User` is recorded in the audit log.
 */
import express from 'express'

import { requireIdentitySession } from '../identity/authMiddleware.js'
import { isIdentityReady } from '../identity/db.js'
import { runMigrations } from '../database/migrate.js'
import { FORM_GROUPS, FORMS, MASTER_LISTS, SECTIONS } from './formSchemas.js'
import {
  OpsError,
  aggregate,
  createRecord,
  deleteMasterItem,
  deleteRecord,
  filterOptions,
  formCounts,
  getMasterLists,
  getRecord,
  getSettings,
  importRecords,
  listRecords,
  recordHistory,
  recordNeighbours,
  restoreRecord,
  saveSettings,
  updateRecord,
  upsertMasterItem,
} from './operationsService.js'

function actorOf(req) {
  const a = req.identityActor
  if (a) return String(a.email || a.username || a.id || 'user').slice(0, 120)
  const header = String(req.get('x-agrocloud-user') || '').trim()
  return header ? header.slice(0, 120) : 'anonymous'
}

/** Parse the shared query string: from, to, q, f.<field>=a,b, sort, dir, page, pageSize, deleted. */
export function parseRecordQuery(qs) {
  const filters = {}
  for (const [k, v] of Object.entries(qs)) {
    if (!k.startsWith('f.')) continue
    const vals = (Array.isArray(v) ? v : [v]).flatMap((x) => String(x).split('||'))
    filters[k.slice(2)] = vals.filter(Boolean)
  }
  return {
    from: qs.from,
    to: qs.to,
    q: qs.q,
    filters,
    sort: qs.sort,
    dir: qs.dir,
    page: qs.page,
    pageSize: qs.pageSize,
    deleted: qs.deleted === '1' || qs.deleted === 'true',
    groupBy: qs.groupBy,
    groupBy2: qs.groupBy2,
  }
}

const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res)
    if (out !== undefined && !res.headersSent) res.json(out)
  } catch (e) {
    if (e instanceof OpsError) {
      res.status(e.status).json({ ok: false, error: e.message, details: e.details ?? null })
      return
    }
    console.error('[ops]', e)
    res.status(500).json({ ok: false, error: 'Operations service error.' })
  }
}

export function createOperationsRouter() {
  const router = express.Router()
  router.use(express.json({ limit: '50mb' }))
  router.use((req, res, next) => (isIdentityReady() ? requireIdentitySession(req, res, next) : next()))

  router.get(
    '/schema',
    wrap(() => ({
      forms: FORMS,
      groups: FORM_GROUPS,
      sections: SECTIONS,
      lists: MASTER_LISTS,
      listItems: getMasterLists(),
      settings: getSettings(),
      counts: formCounts(),
    })),
  )

  router.get('/forms/:form/records', wrap((req) => listRecords(req.params.form, parseRecordQuery(req.query))))
  router.get(
    '/forms/:form/records/:id',
    wrap((req) => {
      const record = getRecord(req.params.form, Number(req.params.id))
      if (req.query.nav !== '1') return { record }
      return { record, nav: recordNeighbours(req.params.form, Number(req.params.id), parseRecordQuery(req.query)) }
    }),
  )
  router.post(
    '/forms/:form/records',
    wrap((req, res) => {
      res.status(201).json({ record: createRecord(req.params.form, req.body ?? {}, actorOf(req), { allowDuplicate: req.query.allowDuplicate === '1' }) })
    }),
  )
  router.put('/forms/:form/records/:id', wrap((req) => ({ record: updateRecord(req.params.form, Number(req.params.id), req.body ?? {}, actorOf(req)) })))
  router.delete(
    '/forms/:form/records/:id',
    wrap((req) => {
      deleteRecord(req.params.form, Number(req.params.id), actorOf(req))
      return { ok: true }
    }),
  )
  router.post('/forms/:form/records/:id/restore', wrap((req) => ({ record: restoreRecord(req.params.form, Number(req.params.id), actorOf(req)) })))
  router.get('/forms/:form/records/:id/history', wrap((req) => ({ history: recordHistory(req.params.form, Number(req.params.id)) })))
  router.post(
    '/forms/:form/import',
    wrap((req) => importRecords(req.params.form, req.body?.rows, actorOf(req), { source: req.body?.source || 'import', dryRun: req.body?.dryRun === true })),
  )
  router.get('/forms/:form/filters', wrap((req) => filterOptions(req.params.form)))
  router.get('/forms/:form/aggregate', wrap((req) => aggregate(req.params.form, parseRecordQuery(req.query))))

  router.get('/lists', wrap(() => ({ lists: MASTER_LISTS, items: getMasterLists() })))
  router.post('/lists/:list', wrap((req, res) => res.status(201).json({ id: upsertMasterItem(req.params.list, req.body ?? {}) })))
  router.put('/lists/:list/:id', wrap((req) => ({ id: upsertMasterItem(req.params.list, { ...(req.body ?? {}), id: Number(req.params.id) }) })))
  router.delete(
    '/lists/:list/:id',
    wrap((req) => {
      deleteMasterItem(req.params.list, Number(req.params.id))
      return { ok: true }
    }),
  )

  router.get('/settings', wrap(() => ({ settings: getSettings() })))
  router.put('/settings', wrap((req) => ({ settings: saveSettings(req.body ?? {}, actorOf(req)) })))
  return router
}

export function registerOperationsRoutes(app) {
  runMigrations()
  const router = createOperationsRouter()
  app.use('/api/ops', router)
  app.use('/api/v1/ops', router)
}
