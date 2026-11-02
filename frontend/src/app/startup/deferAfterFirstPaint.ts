/** Run work after first paint so login / home shell appears sooner on slow mobile networks. */
export function deferAfterFirstPaint(fn: () => void, timeoutMs = 2500): void {
  if (typeof window === 'undefined') {
    fn()
    return
  }
  const run = () => {
    try {
      fn()
    } catch {
      // ignore
    }
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: timeoutMs })
  } else {
    window.setTimeout(run, 1)
  }
}
