import { isValidExternalEmbedUrl } from './externalEmbedFrameCheck'

/** In-app iframe loads the target site directly (required for SPAs such as AgSense 365). */
export function resolveEmbeddedIframeDirectSrc(raw: string): string {
  const s = String(raw ?? '').trim()
  return isValidExternalEmbedUrl(s) ? s : ''
}

/** Iframe `src` for Settings → Pages embedded content. */
export function resolveEmbeddedIframeSrc(raw: string): string {
  return resolveEmbeddedIframeDirectSrc(raw)
}
