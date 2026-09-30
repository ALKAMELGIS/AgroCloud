// One-off browser smoke (paste into Runtime.evaluate on http://localhost:5174/AgroCloud/).
(async () => {
  const base = '/AgroCloud/src/'
  const routesFile = 'app/routes/AppRoutes.tsx'
  const raw = (await import(`${base}${routesFile}?raw`)).default
  const specs = [...raw.matchAll(/import\('([^']+)'\)|from '([^']+)'/g)]
    .map((m) => m[1] || m[2])
    .filter((s) => s.startsWith('.') || s.startsWith('@/'))
  const toUrl = (s) => {
    if (s.startsWith('@/')) return base + s.slice(2)
    const parts = (base + routesFile).split('/').slice(0, -1)
    for (const seg of s.split('/')) {
      if (seg === '..') parts.pop()
      else if (seg !== '.') parts.push(seg)
    }
    return parts.join('/')
  }
  const importFailures = []
  for (const s of [...new Set(specs)]) {
    try {
      await import(toUrl(s))
    } catch (e) {
      importFailures.push(`${s}: ${String(e && e.message).slice(0, 160)}`)
    }
  }
  const errors = []
  const onErr = (e) => errors.push(String((e.reason && e.reason.message) || e.message || e).slice(0, 160))
  window.addEventListener('error', onErr)
  window.addEventListener('unhandledrejection', onErr)
  const routes = ['/', '/satellite/indices', '/satellite/gis', '/data/harvest', '/data/ec-ph', '/data/irrigation', '/master/gis-content', '/dashboards/overview', '/dashboards/agro-cloud', '/dashboards/agro-cloud-platform', '/admin/system-settings', '/admin/users', '/account/profile', '/sensors/gps', '/login']
  const routeResults = []
  for (const r of routes) {
    location.hash = '#' + r
    await new Promise((res) => setTimeout(res, 2500))
    const overlay = !!document.querySelector('vite-error-overlay')
    const main = document.querySelector('#root')
    const textLen = main ? main.innerText.trim().length : 0
    const crashed = /something went wrong|failed to fetch dynamically imported module|error loading/i.test(main ? main.innerText : '')
    routeResults.push(`${r} overlay=${overlay} crashed=${crashed} textLen=${textLen}`)
  }
  window.removeEventListener('error', onErr)
  window.removeEventListener('unhandledrejection', onErr)
  location.hash = '#/'
  return { modules: specs.length, importFailures, routeResults, errors: [...new Set(errors)].slice(0, 15) }
})()
