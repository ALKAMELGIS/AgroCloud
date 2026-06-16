/**
 * AgroCloud local dev ports only.
 * Geosyntra (Geo-Intelligence repo) owns 5173 / 3001 / 3002 — do not reuse here.
 */
export const VITE_PORT = Number(process.env.VITE_DEV_PORT || 5174)
export const API_PORT = Number(process.env.PORT || 3011)
export const WS_PORT = Number(process.env.WS_PORT || 3012)
export const APP_ORIGIN = (process.env.APP_ORIGIN || `http://localhost:${VITE_PORT}/AgroCloud`).replace(/\/$/, '')
