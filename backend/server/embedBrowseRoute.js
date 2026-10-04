/**
 * Same-origin HTML browse proxy for Settings → Pages embedded content.
 * Strips upstream frame-blocking headers so the app shell can host an iframe.
 */

function isAllowedTargetUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return null
    }
    return u.href
  } catch {
    return null
  }
}

function injectBaseHrefIfMissing(html, originHref) {
  const text = String(html)
  if (/<base\s/i.test(text)) return text
  const baseTag = `<base href="${originHref}">`
  if (/<head[^>]*>/i.test(text)) {
    return text.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
  }
  return `${baseTag}${text}`
}

export function registerEmbedBrowseRoute(app) {
  app.get('/api/embed/browse', async (req, res) => {
    const href = isAllowedTargetUrl(req.query.url)
    if (!href) {
      res.status(400).type('text/plain').send('Invalid or disallowed embed URL')
      return
    }

    try {
      const upstream = await fetch(href, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'AgroCloud-EmbedBrowse/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })

      const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8'
      res.status(upstream.status)
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'no-store')

      const buf = Buffer.from(await upstream.arrayBuffer())
      if (contentType.includes('text/html')) {
        const origin = new URL(href)
        const withBase = injectBaseHrefIfMissing(buf.toString('utf8'), `${origin.origin}/`)
        res.send(withBase)
        return
      }
      res.send(buf)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(502).type('text/plain').send(`Embed browse failed: ${message}`)
    }
  })
}
