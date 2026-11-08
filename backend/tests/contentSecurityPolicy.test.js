import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContentSecurityPolicy } from '../server/middleware/securityMiddleware.js'

const directive = (csp, name) => csp.split('; ').find((d) => d.startsWith(`${name} `)) || ''

test('CSP allows the login/splash videos and nothing broader for media', () => {
  const media = directive(buildContentSecurityPolicy(), 'media-src')
  assert.ok(media.includes('https://www.esri.com'), 'esri.com videos must not fall back to default-src')
  assert.ok(!/\shttps:(\s|$)/.test(media), 'media-src must name hosts, not all of https:')
})

test('CSP keeps the hardening directives', () => {
  const csp = buildContentSecurityPolicy()
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /frame-ancestors 'self'/)
})

test('CSP lets the app embed HTTPS dashboards (ArcGIS, Windy) but not plain-HTTP frames', () => {
  const frame = directive(buildContentSecurityPolicy(), 'frame-src')
  assert.match(frame, /\shttps:(\s|$)/, 'ArcGIS Dashboards / Settings → Pages iframes were blocked')
  assert.ok(!/\shttp:(\s|$)/.test(frame))
})
