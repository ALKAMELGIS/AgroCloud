const RING_KEY = 'agro_client_errors_v1'
const RING_MAX = 40

export type ClientErrorRecord = {
  at: string
  kind: 'error' | 'unhandledrejection'
  message: string
  stack?: string
  href: string
  userAgent: string
}

function pushRing(entry: ClientErrorRecord) {
  try {
    const raw = sessionStorage.getItem(RING_KEY)
    const arr: ClientErrorRecord[] = raw ? JSON.parse(raw) : []
    arr.push(entry)
    while (arr.length > RING_MAX) arr.shift()
    sessionStorage.setItem(RING_KEY, JSON.stringify(arr))
  } catch {
    // ignore quota / private mode
  }
}

function reportUrl(): string {
  const u = String(import.meta.env.VITE_CLIENT_ERROR_REPORT_URL || '').trim()
  return u
}

async function sendRemote(entry: ClientErrorRecord) {
  const url = reportUrl()
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'AgroCloud', ...entry }),
      keepalive: true,
    })
  } catch {
    // ignore network failures
  }
}

/** Lightweight client-side error ring + optional remote reporting (production only). */
export function initClientErrorMonitoring() {
  if (!import.meta.env.PROD) return
  if (typeof window === 'undefined') return

  const capture = (kind: ClientErrorRecord['kind'], message: string, stack?: string) => {
    const entry: ClientErrorRecord = {
      at: new Date().toISOString(),
      kind,
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000),
      href: location.href,
      userAgent: navigator.userAgent,
    }
    pushRing(entry)
    void sendRemote(entry)
    try {
      console.error(`[AgroCloud ${kind}]`, message)
    } catch {
      // ignore
    }
  }

  window.addEventListener('error', (ev) => {
    const err = ev.error
    const msg = err instanceof Error ? err.message : typeof ev.message === 'string' ? ev.message : 'Unknown error'
    const stack = err instanceof Error ? err.stack : undefined
    capture('error', msg, stack)
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = (ev as PromiseRejectionEvent).reason
    const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled rejection'
    const stack = reason instanceof Error ? reason.stack : undefined
    capture('unhandledrejection', msg, stack)
  })
}

export function readClientErrorRing(): ClientErrorRecord[] {
  try {
    const raw = sessionStorage.getItem(RING_KEY)
    return raw ? (JSON.parse(raw) as ClientErrorRecord[]) : []
  } catch {
    return []
  }
}
