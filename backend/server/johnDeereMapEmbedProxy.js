/**
 * Proxies map.deere.com (+ sign-in) for the in-app GPS iframe (X-Frame-Options / CSP stripped).
 */

const EMBED_ROOT = '/api/gps/john-deere-map'

const ALLOWED_HOSTS = new Set([
  'map.deere.com',
  'signin.johndeere.com',
  'johndeerecustomer.okta.com',
  'login.okta.com',
  'signin.deere.com',
  'cdn.ux.deere.com',
  'translations-cdn.deere.com',
  'icons-cdn.deere.com',
  'field-analyzer.deere.com',
])

const TEXT_REWRITE_HOSTS = [
  'map.deere.com',
  'signin.johndeere.com',
  'johndeerecustomer.okta.com',
  'login.okta.com',
  'signin.deere.com',
  'cdn.ux.deere.com',
  'translations-cdn.deere.com',
  'icons-cdn.deere.com',
  'field-analyzer.deere.com',
]

/** Okta / Deere embeds load JS from oktacdn.com — AgroCloud default CSP blocks them in iframes. */
const EMBED_PROXY_CONTENT_SECURITY_POLICY = [
  "default-src https: http: data: blob: 'unsafe-inline' 'unsafe-eval'",
  "script-src https: http: data: blob: 'unsafe-inline' 'unsafe-eval'",
  "style-src https: http: data: blob: 'unsafe-inline'",
  "img-src https: http: data: blob:",
  "connect-src https: http: wss: ws: blob:",
  "font-src https: http: data:",
  "frame-src https: http:",
  "frame-ancestors 'self'",
  "form-action https: http:",
  "worker-src https: http: blob:",
].join('; ')

function applyEmbedProxyResponseHeaders(res) {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Content-Security-Policy', EMBED_PROXY_CONTENT_SECURITY_POLICY)
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none')
}

const SKIP_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'permissions-policy',
])

function requestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost'
  return `${proto}://${host}`
}

function goPrefix(req) {
  return `${requestOrigin(req)}${EMBED_ROOT}/go`
}

function goPathForHost(req, host) {
  return `${goPrefix(req)}/${host}`
}

function parseGoTarget(req) {
  const pathOnly = String(req.originalUrl || req.url || '').split('?')[0]
  const marker = `${EMBED_ROOT}/go/`
  const idx = pathOnly.indexOf(marker)
  if (idx === -1) return null
  const rest = pathOnly.slice(idx + marker.length)
  if (!rest) return null
  const slash = rest.indexOf('/')
  const host = slash === -1 ? rest : rest.slice(0, slash)
  const pathname = slash === -1 ? '/' : rest.slice(slash) || '/'
  if (!ALLOWED_HOSTS.has(host)) return null
  const qs = String(req.originalUrl || req.url || '').includes('?')
    ? String(req.originalUrl || req.url).slice(String(req.originalUrl || req.url).indexOf('?'))
    : ''
  return { host, pathname, url: `https://${host}${pathname}${qs}` }
}

function rewriteExternalUrl(href, req) {
  if (!href || typeof href !== 'string') return href
  if (href.startsWith('data:') || href.startsWith('blob:') || href.startsWith('mailto:')) return href
  if (href.startsWith('#')) return href
  try {
    const u = new URL(href, 'https://map.deere.com')
    if (ALLOWED_HOSTS.has(u.hostname)) {
      return `${goPathForHost(req, u.hostname)}${u.pathname}${u.search}`
    }
  } catch {
    /* keep original */
  }
  return href
}

function escapeForOktaInlineJson(url) {
  return url.replace(/:/g, '\\x3A').replace(/\//g, '\\x2F')
}

function rewriteRootRelativeRefs(text, req, targetHost) {
  const prefix = goPathForHost(req, targetHost)
  let out = text
  out = out.replace(
    /(\s(?:src|href|action)\s*=\s*["'])(\/(?!\/)(?!api\/gps\/john-deere-map\/)[^"'#?]*)/gi,
    (_, attr, path) => `${attr}${prefix}${path}`,
  )
  out = out.replace(
    /(\.(?:src|href)\s*=\s*["'])(\/(?!\/)(?!api\/gps\/john-deere-map\/)[^"']*)(["'])/gi,
    (_, a, path, q) => `${a}${prefix}${path}${q}`,
  )
  out = out.replace(
    /(\b(?:src|href)\s*:\s*["'])(\/(?!\/)(?!api\/gps\/john-deere-map\/)[^"']*)(["'])/gi,
    (_, a, path, q) => `${a}${prefix}${path}${q}`,
  )
  return out
}

/** When /v1/session returns HTML (OAuth), navigate the iframe instead of leaving an empty #app-mount. */
function patchMapIndexSessionFetch(html) {
  if (!html.includes('window.sessionPromise = fetch(url')) return html
  if (html.includes('__agroDeereEmbedFetch')) return html
  return html.replace(
    /window\.sessionPromise = fetch\(url, \{ headers: fetchHeaders \}\);\s*window\.customizationsPromise = fetch\('\/v1\/appCustomizations', \{ headers: fetchHeaders \}\);/,
    `function __agroDeereEmbedFetch(input, init) {
        return fetch(input, init).then((res) => {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (res.redirected || (!ct.includes('json') && ct.includes('html'))) {
            window.location.assign(res.url || input);
            return new Promise(() => {});
          }
          return res;
        });
      }
      window.sessionPromise = __agroDeereEmbedFetch(url, { headers: fetchHeaders });
      window.customizationsPromise = __agroDeereEmbedFetch('/v1/appCustomizations', { headers: fetchHeaders });`,
  )
}

function rewriteTextBody(text, req, targetHost) {
  const prefix = goPrefix(req)
  let out = text

  for (const host of TEXT_REWRITE_HOSTS) {
    const esc = host.replace(/\./g, '\\.')
    const proxied = `${prefix}/${host}`
    out = out.replace(new RegExp(`https://${esc}`, 'gi'), proxied)
    out = out.replace(new RegExp(`http://${esc}`, 'gi'), proxied)
    out = out.replace(new RegExp(`//${esc}`, 'gi'), proxied)
    out = out.replace(
      new RegExp(`https\\\\x3A\\\\x2F\\\\x2F${esc}`, 'gi'),
      escapeForOktaInlineJson(proxied),
    )
  }

  out = rewriteRootRelativeRefs(out, req, targetHost)

  const baseHref = `${goPathForHost(req, targetHost)}/`
  if (/<head[\s>]/i.test(out)) {
    out = out.replace(/<base[\s>][^>]*>/gi, '')
    out = out.replace(/<head(\s[^>]*)?>/i, m => `${m}<base href="${baseHref}">`)
  }

  if (targetHost === 'map.deere.com' && out.includes('window.sessionPromise')) {
    out = patchMapIndexSessionFetch(out)
  }

  return out
}

function rewriteSetCookie(value) {
  return value
    .replace(/;\s*Domain=[^;]*/gi, '')
    .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
}

function forwardRequestHeaders(req, targetUrl) {
  const out = {
    Accept: req.headers.accept || '*/*',
    'Accept-Language': req.headers['accept-language'] || 'en',
    'User-Agent':
      req.headers['user-agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }
  if (req.headers.cookie) out.Cookie = req.headers.cookie
  if (req.headers['content-type']) out['Content-Type'] = req.headers['content-type']
  if (targetUrl) out.Referer = targetUrl
  return out
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  if (req.rawBody && Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) {
    return req.rawBody
  }
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body
    if (typeof req.body === 'string') return Buffer.from(req.body)
    return Buffer.from(JSON.stringify(req.body))
  }
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length === 0) return undefined
  return Buffer.concat(chunks)
}

async function proxyToDeere(req, res, target) {
  let upstream
  const body = await readRequestBody(req)
  try {
    upstream = await fetch(target.url, {
      method: req.method,
      headers: forwardRequestHeaders(req, target.url),
      body: body,
      redirect: 'manual',
    })
  } catch (err) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: String(err?.message || err) })
    return
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    const loc = upstream.headers.get('location')
    if (loc) {
      const next = rewriteExternalUrl(loc, req)
      applyEmbedProxyResponseHeaders(res)
      res.redirect(upstream.status, next)
      return
    }
  }

  const contentType = upstream.headers.get('content-type') || ''
  upstream.headers.forEach((value, key) => {
    const lk = key.toLowerCase()
    if (SKIP_RESPONSE_HEADERS.has(lk)) return
    if (lk === 'location') {
      res.setHeader(key, rewriteExternalUrl(value, req))
      return
    }
    if (lk === 'set-cookie') {
      res.appendHeader(key, rewriteSetCookie(value))
      return
    }
    res.setHeader(key, value)
  })

  applyEmbedProxyResponseHeaders(res)

  if (req.method === 'HEAD') {
    res.status(upstream.status).end()
    return
  }

  const buf = Buffer.from(await upstream.arrayBuffer())
  const isText =
    contentType.includes('text/html') ||
    contentType.includes('application/javascript') ||
    contentType.includes('text/javascript') ||
    contentType.includes('application/json') ||
    contentType.includes('text/css') ||
    contentType.includes('application/vnd.ms-fontobject') ||
    contentType.includes('font/')

  if (isText) {
    res.status(upstream.status).send(rewriteTextBody(buf.toString('utf8'), req, target.host))
    return
  }

  res.status(upstream.status).send(buf)
}

export function registerJohnDeereMapEmbedRoutes(app) {
  app.get(`${EMBED_ROOT}/health`, async (_req, res) => {
    let upstreamStatus = 0
    try {
      const upstream = await fetch('https://map.deere.com/', { method: 'GET', redirect: 'manual' })
      upstreamStatus = upstream.status
    } catch {
      upstreamStatus = 0
    }
    res.json({
      ok: true,
      embedRoot: EMBED_ROOT,
      loginPath: `${EMBED_ROOT}/go/map.deere.com/login`,
      upstreamStatus,
    })
  })

  app.get(`${EMBED_ROOT}/embed`, (req, res) => {
    const mapPath = String(req.query.path || '/')
    const safe = mapPath.startsWith('/') ? mapPath : `/${mapPath}`
    res.redirect(302, `${EMBED_ROOT}/go/map.deere.com${safe}`)
  })

  app.use((req, res, next) => {
    const pathOnly = String(req.originalUrl || req.url || '').split('?')[0]
    if (!pathOnly.startsWith(`${EMBED_ROOT}/go/`)) {
      next()
      return
    }
    const target = parseGoTarget(req)
    if (!target) {
      res.status(400).send('Invalid embed path')
      return
    }
    void proxyToDeere(req, res, target)
  })
}
