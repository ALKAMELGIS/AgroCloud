export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
}

export function errorHandler(err, _req, res, _next) {
  const status = Number(err?.status || 500)
  const message = typeof err?.message === 'string' ? err.message : 'Internal server error'
  if (status >= 500) {
    console.error('[backend] Unhandled error:', err)
  }
  res.status(status).json({ error: message })
}

