import { apiUrl, isStaticDeploymentWithoutBackend } from '@/core/api/apiOrigin'

export type ExternalEmbedProbe = {
  embeddable: boolean
  reason: string | null
  xFrameOptions?: string | null
  frameAncestors?: string | null
}

export function isValidExternalEmbedUrl(raw: string): boolean {
  const s = String(raw ?? '').trim()
  if (!s || s === 'https://' || s === 'http://') return false
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function probeExternalEmbedFrame(url: string): Promise<ExternalEmbedProbe | null> {
  if (!isValidExternalEmbedUrl(url)) {
    return { embeddable: false, reason: 'invalid_url' }
  }
  if (isStaticDeploymentWithoutBackend()) {
    return { embeddable: true, reason: null }
  }
  try {
    const res = await fetch(apiUrl(`/api/util/embed-frame-check?url=${encodeURIComponent(url.trim())}`))
    if (!res.ok) return { embeddable: true, reason: 'probe_http_error' }
    return (await res.json()) as ExternalEmbedProbe
  } catch {
    return { embeddable: true, reason: 'probe_unreachable' }
  }
}

export function formatEmbedBlockReason(
  probe: ExternalEmbedProbe | null,
  language: 'en' | 'ar',
): string {
  if (!probe || probe.embeddable) return ''
  const reason = String(probe.reason || '')
  if (reason === 'invalid_url') {
    return language === 'ar'
      ? 'الرابط غير صالح — أضف عنوان https كامل من الإعدادات → Pages.'
      : 'Invalid URL — set a full https:// address in Settings → Pages.'
  }
  if (reason.startsWith('x_frame_options:')) {
    const header = reason.slice('x_frame_options:'.length)
    return language === 'ar'
      ? `الموقع يمنع التضمين (X-Frame-Options: ${header}). راجع إعدادات الخادم أو البروكسي.`
      : `This site blocks embedding (X-Frame-Options: ${header}). Configure server-side embed proxy.`
  }
  if (reason.startsWith('csp_frame_ancestors:')) {
    const fa = reason.slice('csp_frame_ancestors:'.length)
    return language === 'ar'
      ? `الموقع يمنع التضمين (CSP frame-ancestors: ${fa}). راجع إعدادات الخادم أو البروكسي.`
      : `This site blocks embedding (CSP frame-ancestors: ${fa}). Configure server-side embed proxy.`
  }
  return language === 'ar'
    ? 'لا يمكن تضمين هذا الموقع داخل الإطار من هذا النطاق.'
    : 'This site cannot be embedded in a frame from this origin.'
}
