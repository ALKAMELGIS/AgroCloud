/** Hostinger / production entry — load env then delegate to Express API + SPA static server. */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

function bootstrapEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key) continue
    if (key === 'PORT' || key === 'WS_PORT') continue
    if (Object.prototype.hasOwnProperty.call(process.env, key) && String(process.env[key] ?? '').trim()) {
      continue
    }
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

for (const name of ['hostinger-production.env', '.env.production']) {
  bootstrapEnvFromFile(path.join(ROOT, name))
}

import './backend/server/index.js'
