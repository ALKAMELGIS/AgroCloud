/**
 * FTW AOI-scoped training — Node façade (built-in fallback; Python service optional later).
 *
 *   GET  /api/ftw-training/health
 *   POST /api/ftw-training/dataset/sample
 *   POST /api/ftw-training/lr-finder/start
 *   POST /api/ftw-training/train/start
 *   GET  /api/ftw-training/:jobId
 *   POST /api/ftw-training/:jobId/cancel
 *   GET  /api/ftw-training/:jobId/export
 */

import express from 'express'
import {
  cancelFtwBuiltinJob,
  exportFtwBuiltinModel,
  ftwTrainingBuiltinHealth,
  getFtwBuiltinJob,
  isFtwBuiltinJobId,
  startFtwDatasetSampleJob,
  startFtwLrFinderJob,
  startFtwTrainJob,
} from './ftwTrainingBuiltin.js'

const BODY_LIMIT = '32mb'

export function registerFtwTrainingRoutes(app) {
  console.log('[ftw-training] routes registered — built-in AOI trainer enabled')

  app.get('/api/ftw-training/health', (_req, res) => {
    res.status(200).json(ftwTrainingBuiltinHealth())
  })

  app.post('/api/ftw-training/dataset/sample', express.json({ limit: BODY_LIMIT }), (req, res) => {
    try {
      const result = startFtwDatasetSampleJob(req.body)
      return res.status(200).json(result)
    } catch (error) {
      return res.status(422).json({ error: String(error?.message || error) })
    }
  })

  app.post('/api/ftw-training/lr-finder/start', express.json({ limit: BODY_LIMIT }), (req, res) => {
    try {
      const jobId = startFtwLrFinderJob(req.body)
      return res.status(200).json({ job_id: jobId })
    } catch (error) {
      return res.status(422).json({ error: String(error?.message || error) })
    }
  })

  app.post('/api/ftw-training/train/start', express.json({ limit: BODY_LIMIT }), (req, res) => {
    try {
      const jobId = startFtwTrainJob(req.body)
      return res.status(200).json({ job_id: jobId })
    } catch (error) {
      return res.status(422).json({ error: String(error?.message || error) })
    }
  })

  app.get('/api/ftw-training/:jobId/export', (req, res) => {
    const jobId = String(req.params.jobId || '')
    if (!isFtwBuiltinJobId(jobId)) {
      return res.status(404).json({ error: 'Model export not found.' })
    }
    const payload = exportFtwBuiltinModel(jobId)
    if (!payload) {
      return res.status(404).json({ error: 'Training job not complete.' })
    }
    res.setHeader('Content-Type', 'application/json')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ftw-aoi-model-${payload.aoi_key.slice(0, 12)}.json"`,
    )
    return res.status(200).send(JSON.stringify(payload, null, 2))
  })

  app.post('/api/ftw-training/:jobId/cancel', express.json({ limit: '1mb' }), (req, res) => {
    const jobId = String(req.params.jobId || '')
    if (!isFtwBuiltinJobId(jobId)) {
      return res.status(404).json({ error: 'Job not found.' })
    }
    cancelFtwBuiltinJob(jobId)
    return res.status(200).json({ ok: true })
  })

  app.get('/api/ftw-training/:jobId', (req, res) => {
    const jobId = String(req.params.jobId || '')
    if (!isFtwBuiltinJobId(jobId)) {
      return res.status(404).json({ error: 'Job not found.' })
    }
    const job = getFtwBuiltinJob(jobId)
    if (!job) return res.status(404).json({ error: 'Job not found.' })
    return res.status(200).json(job)
  })
}
