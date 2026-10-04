/**
 * HEAD/GET probe for third-party embed headers (X-Frame-Options, CSP frame-ancestors).
 * Used by Settings → Pages embedded content to explain blank iframes.
 */

function parseFrameAncestorsFromCsp(csp) {
  if (!csp) return null
  const match = String(csp).match(/frame-ancestors\s+([^;]+)/i)
  return match ? match[1].trim() : null
}

function frameAncestorsBlocksCrossOriginEmbed(frameAncestors) {
  if (!frameAncestors) return false
  const fa = frameAncestors.trim().toLowerCase()
  if (fa === "'none'" || fa === 'none') return true
  if (fa === "'self'" || fa === 'self') return true
  return false
}

function xFrameOptionsBlocksEmbed(value) {
  const v = String(value || '').trim().toLowerCase()
  if (!v) return false
  if (v === 'deny') return true
  if (v === 'sameorigin') return true
  return false
}

function isAllowedTargetUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

async function fetchResponseHeaders(targetUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    let res = await fetch(targetUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'AgroCloud-EmbedCheck/1.0' },
    })
    if (res.status === 405 || res.status === 501) {
      res = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'AgroCloud-EmbedCheck/1.0',
          Range: 'bytes=0-0',
        },
      })
    }
    return res
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * @param {string} targetUrl
 * @returns {Promise<{ embeddable: boolean, reason: string | null, xFrameOptions: string | null, frameAncestors: string | null }>}
 */
export async function probeExternalEmbedFrame(targetUrl) {
  const href = isAllowedTargetUrl(targetUrl)
  if (!href) {
    return {
      embeddable: false,
      reason: 'invalid_url',
      xFrameOptions: null,
      frameAncestors: null,
    }
  }

  try {
    const res = await fetchResponseHeaders(href)
    const xFrameOptions = res.headers.get('x-frame-options')
    const csp = res.headers.get('content-security-policy') || res.headers.get('content-security-policy-report-only')
    const frameAncestors = parseFrameAncestorsFromCsp(csp)

    if (xFrameOptionsBlocksEmbed(xFrameOptions)) {
      return {
        embeddable: false,
        reason: `x_frame_options:${xFrameOptions}`,
        xFrameOptions,
        frameAncestors,
      }
    }
    if (frameAncestorsBlocksCrossOriginEmbed(frameAncestors)) {
      return {
        embeddable: false,
        reason: `csp_frame_ancestors:${frameAncestors}`,
        xFrameOptions,
        frameAncestors,
      }
    }

    return {
      embeddable: true,
      reason: null,
      xFrameOptions,
      frameAncestors,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      embeddable: true,
      reason: `probe_failed:${message}`,
      xFrameOptions: null,
      frameAncestors: null,
    }
  }
}

export function registerEmbedFrameCheckRoute(app) {
  app.get('/api/util/embed-frame-check', async (req, res) => {
    const target = String(req.query.url || '').trim()
    const href = isAllowedTargetUrl(target)
    if (!href) {
      res.status(400).json({ embeddable: false, reason: 'invalid_url' })
      return
    }
    const result = await probeExternalEmbedFrame(href)
    res.status(200).json(result)
  })
}
