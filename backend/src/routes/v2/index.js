import { Router } from 'express'

const router = Router()

// Reserved for future backward-incompatible endpoints.
router.get('/health', (_req, res) => {
  res.json({ ok: true, version: 'v2', note: 'Reserved API namespace' })
})

export default router

