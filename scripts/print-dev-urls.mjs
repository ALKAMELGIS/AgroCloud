import os from 'node:os'
import { API_PORT, VITE_PORT, WS_PORT } from './devPorts.mjs'

const PORT = VITE_PORT
const BASE = '/AgroCloud/'

function lanAddresses() {
  const out = new Set()
  const nets = os.networkInterfaces()
  for (const entries of Object.values(nets)) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      out.add(entry.address)
    }
  }
  return [...out]
}

const ips = lanAddresses()
console.log('')
console.log('==========================================')
console.log('  Agro Cloud — dev URLs')
console.log('==========================================')
console.log(`  This PC:     http://localhost:${PORT}${BASE}`)
console.log(`  This PC:     http://127.0.0.1:${PORT}${BASE}`)
if (ips.length) {
  console.log('  Other devices on the same Wi‑Fi/LAN:')
  for (const ip of ips) {
    console.log(`               http://${ip}:${PORT}${BASE}`)
  }
} else {
  console.log('  LAN IP:      (none detected — check Wi‑Fi / Ethernet)')
}
console.log('')
console.log(`  API (proxied via Vite):  /api  →  backend :${API_PORT}`)
console.log(`  WebSocket (proxied):     /ws  →  backend :${WS_PORT}`)
console.log('  Geosyntra (separate repo) uses 5173 / 3001 / 3002 — do not mix projects.')
console.log('')
console.log('  Tips:')
console.log('  • Run "npm run dev" (frontend + backend), not dev:client alone.')
console.log('  • Use the trailing slash: …/AgroCloud/')
console.log('  • Allow Node.js through Windows Firewall if a device cannot connect.')
console.log('==========================================')
console.log('')
