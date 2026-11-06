/**
 * Keeps the local Python AI services (:8080 / :8092 / :8095 / :8096) running in
 * development, so a closed terminal or a crashed uvicorn never leaves the map
 * toolbox showing "Service offline".
 *
 * Each service ships an idempotent `start-local.ps1` that refuses to double-bind
 * a healthy port and restarts its own uvicorn, so spawning it again is safe.
 *
 * Env:
 *   AI_LOCAL_AUTOSTART=0   disable entirely (CI, remote backends)
 */

import { spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVICES_ROOT = path.resolve(HERE, '..', 'services')

/** Health probe budget — cold torch imports answer slowly but not this slowly. */
const HEALTH_TIMEOUT_MS = 4000
/** Keepalive cadence once the first pass has run. */
const POLL_MS = 20_000
/** Startup can take a minute (venv checks + torch import) — do not respawn into it. */
const START_GRACE_MS = 120_000
/** Stagger the first pass so four torch processes do not boot at once. */
const STAGGER_MS = 7000
const MAX_ATTEMPTS = 4
const BACKOFF_BASE_MS = 25_000
const BACKOFF_MAX_MS = 300_000

const SERVICES = [
  { id: 'agri-field-boundary', dir: 'agri-field-boundary', port: 8092 },
  { id: 'segformer-detection', dir: 'segformer-detection', port: 8095 },
  { id: 'delineate-anything', dir: 'delineate-anything', port: 8096 },
  { id: 'tree-detection', dir: 'tree-detection', port: 8080 },
]

/** @type {Map<string, { svc: any, script: string, child: any, startedAt: number, attempts: number, nextAttemptAt: number, up: boolean, gaveUp: boolean }>} */
const state = new Map()
let started = false

/**
 * NODE_ENV is not a usable signal here: the repo ships a root `.env.production`
 * that the loader applies on developer machines too. The real signal is a
 * Windows checkout that still carries the PowerShell launchers — hosted
 * deployments are Linux and ship no `start-local.ps1`.
 */
function isDisabled() {
  const flag = String(process.env.AI_LOCAL_AUTOSTART ?? '').trim().toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'no') return true
  return process.platform !== 'win32'
}

async function isHealthy(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * A bound port with a failing /health is a service still importing torch, not a
 * dead one — spawning a second launcher into it only fights for the port.
 */
function isPortOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = value => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(1200)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

function spawnService(entry) {
  const { svc, script } = entry
  entry.attempts += 1
  entry.startedAt = Date.now()
  entry.nextAttemptAt =
    entry.startedAt + Math.min(BACKOFF_BASE_MS * 2 ** (entry.attempts - 1), BACKOFF_MAX_MS)

  console.log(`[ai-services] starting ${svc.id} on :${svc.port} (attempt ${entry.attempts})`)
  let child
  let logFd = 'ignore'
  try {
    logFd = fs.openSync(entry.logPath, 'a')
  } catch {
    /* keep stdio ignored when the log file cannot be opened */
  }
  try {
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      {
        cwd: path.dirname(script),
        windowsHide: true,
        // Launcher output goes to the service folder so a failed start is diagnosable.
        stdio: ['ignore', logFd, logFd],
        // `detached` is deliberately off: on Windows it makes powershell.exe exit
        // immediately without ever running the script.
        detached: false,
        // Node API uses PORT=3011; without an override every start-local.ps1
        // inherits that and binds uvicorn to the API port (breaking /api/*).
        env: {
          ...process.env,
          PORT: String(svc.port),
        },
      },
    )
  } catch (error) {
    console.warn(`[ai-services] ${svc.id} could not be spawned:`, error?.message || error)
    return
  }
  entry.child = child
  child.unref()
  child.on('exit', code => {
    entry.child = null
    // The launcher exits 0 when the port is already served by a healthy process.
    if (code) console.warn(`[ai-services] ${svc.id} launcher exited (${code})`)
  })
  child.on('error', error => {
    entry.child = null
    console.warn(`[ai-services] ${svc.id} launcher error:`, error?.message || error)
  })
}

async function ensureEntry(entry) {
  const { svc } = entry
  if (await isHealthy(svc.port)) {
    if (!entry.up) console.log(`[ai-services] ${svc.id} healthy on :${svc.port}`)
    entry.up = true
    entry.attempts = 0
    entry.gaveUp = false
    entry.nextAttemptAt = 0
    return true
  }
  entry.up = false
  const now = Date.now()
  if (entry.child && now - entry.startedAt < START_GRACE_MS) return false
  if (await isPortOpen(svc.port)) return false
  if (now < entry.nextAttemptAt) return false
  if (entry.attempts >= MAX_ATTEMPTS) {
    if (!entry.gaveUp) {
      entry.gaveUp = true
      console.warn(
        `[ai-services] ${svc.id} did not come up after ${MAX_ATTEMPTS} attempts — see ${entry.logPath}`,
      )
    }
    return false
  }
  spawnService(entry)
  return false
}

/**
 * Kick a single service immediately (called by proxies when a request finds the
 * upstream offline, so the user does not wait for the next poll).
 */
export function ensureLocalAiService(id) {
  const entry = state.get(id)
  if (!entry) return
  // A manual retry from the UI means the operator wants another shot.
  if (entry.gaveUp) {
    entry.gaveUp = false
    entry.attempts = 0
    entry.nextAttemptAt = 0
  }
  ensureEntry(entry).catch(() => {})
}

/** Start the supervisor. Safe to call once at boot; no-op when disabled. */
export function startLocalAiServiceSupervisor() {
  if (started) return
  started = true
  if (isDisabled()) return

  for (const svc of SERVICES) {
    const script = path.join(SERVICES_ROOT, svc.dir, 'start-local.ps1')
    if (!fs.existsSync(script)) continue
    state.set(svc.id, {
      svc,
      script,
      logPath: path.join(SERVICES_ROOT, svc.dir, 'start-local.log'),
      child: null,
      startedAt: 0,
      attempts: 0,
      nextAttemptAt: 0,
      up: false,
      gaveUp: false,
    })
  }
  if (!state.size) return

  const entries = [...state.values()]
  entries.forEach((entry, i) => {
    const timer = setTimeout(() => {
      ensureEntry(entry).catch(() => {})
    }, i * STAGGER_MS)
    timer.unref?.()
  })

  const poll = setInterval(() => {
    for (const entry of state.values()) ensureEntry(entry).catch(() => {})
  }, POLL_MS)
  poll.unref?.()

  console.log(
    `[ai-services] supervisor watching ${entries.map(e => `${e.svc.id}:${e.svc.port}`).join(', ')} (set AI_LOCAL_AUTOSTART=0 to disable)`,
  )
}
