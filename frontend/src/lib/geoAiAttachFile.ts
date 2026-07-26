/** Shared attach rules for Geo AI / Neighborhood Agent composers. */

export type GeoAiPendingAttachment = {
  mime: string
  base64: string
  name: string
}

const MAX_ATTACH_BYTES = 12 * 1024 * 1024

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  markdown: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/** HTML accept list for file inputs (images + common documents). */
export const GEO_AI_ATTACH_ACCEPT =
  'image/*,.pdf,.txt,.csv,.json,.md,.doc,.docx,.xls,.xlsx,application/pdf,text/plain,text/csv,application/json'

export function geoAiAttachIsImage(mime: string): boolean {
  return mime.toLowerCase().startsWith('image/')
}

export function geoAiAttachIsTextish(mime: string, name = ''): boolean {
  const m = mime.toLowerCase()
  if (m.startsWith('text/')) return true
  if (m === 'application/json' || m === 'application/csv') return true
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return ['txt', 'csv', 'json', 'md', 'markdown'].includes(ext)
}

export function resolveGeoAiAttachMime(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return EXT_MIME[ext] || 'application/octet-stream'
}

export function validateGeoAiAttachFile(file: File): { ok: true; mime: string } | { ok: false; error: string } {
  if (!file || file.size <= 0) return { ok: false, error: 'Empty file.' }
  if (file.size > MAX_ATTACH_BYTES) {
    return { ok: false, error: `File is too large (max ${Math.round(MAX_ATTACH_BYTES / (1024 * 1024))} MB).` }
  }
  const mime = resolveGeoAiAttachMime(file)
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const allowedExt = Object.keys(EXT_MIME)
  const allowed =
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    geoAiAttachIsTextish(mime, file.name) ||
    mime.includes('word') ||
    mime.includes('sheet') ||
    mime.includes('excel') ||
    allowedExt.includes(ext)
  if (!allowed) {
    return {
      ok: false,
      error: 'Unsupported file. Attach an image, PDF, text/CSV/JSON, Word, or Excel file.',
    }
  }
  return { ok: true, mime }
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

export function base64ToUtf8(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** Read a validated file into a pending attachment (base64). */
export function readGeoAiAttachFile(file: File, mime: string): Promise<GeoAiPendingAttachment> {
  return new Promise((resolve, reject) => {
    if (geoAiAttachIsTextish(mime, file.name)) {
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        resolve({
          mime: mime.startsWith('text/') || mime === 'application/json' ? mime : 'text/plain',
          base64: utf8ToBase64(text),
          name: file.name || 'attachment.txt',
        })
      }
      reader.onerror = () => reject(new Error('Could not read the file.'))
      reader.readAsText(file)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      const i = dataUrl.indexOf(',')
      const base64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl
      resolve({
        mime: mime || 'application/octet-stream',
        base64,
        name: file.name || 'attachment',
      })
    }
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}
