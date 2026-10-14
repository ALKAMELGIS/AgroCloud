/**
 * AgroCloud local dev ports only (defaults 5180 / 3011 / 3012).
 * Override via root `.env`: VITE_DEV_PORT, PORT, WS_PORT, APP_ORIGIN.
 *
 * Important: local AI launchers (agri-field-boundary, SegFormer, …) set `PORT` to
 * their uvicorn port (8092/8095/…). Vite must never treat those as the Node API
 * proxy target — that yields FastAPI `{"detail":"Not Found"}` in the UI.
 */
export const VITE_PORT = Number(process.env.VITE_DEV_PORT || 5180)

/** Ports used by Python AI microservices — never the Express API. */
const AI_SERVICE_PORTS = new Set([8080, 8090, 8092, 8093, 8095, 8096, 8098, 8099])

function resolveApiPort() {
  const explicit = Number(
    process.env.AGROCLOUD_API_PORT || process.env.VITE_API_PROXY_TARGET_PORT || '',
  )
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const fromPort = Number(process.env.PORT || 3011)
  if (!Number.isFinite(fromPort) || fromPort <= 0) return 3011
  if (AI_SERVICE_PORTS.has(fromPort)) return 3011
  return fromPort
}

export const API_PORT = resolveApiPort()
export const WS_PORT = Number(process.env.WS_PORT || 3012)
export const APP_ORIGIN = (process.env.APP_ORIGIN || `http://localhost:${VITE_PORT}/AgroCloud`).replace(
  /\/$/,
  '',
)
