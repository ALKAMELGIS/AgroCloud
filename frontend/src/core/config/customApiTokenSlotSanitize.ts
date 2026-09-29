import type { CustomApiTokenSlot } from '../types/systemSettings'

export function sanitizeCustomApiTokenSlot(raw: unknown): CustomApiTokenSlot | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = String(r.id ?? '').trim().slice(0, 80)
  if (!id) return null
  const title = String(r.title ?? 'API').trim().slice(0, 120) || 'API'
  const titleArRaw = r.titleAr != null ? String(r.titleAr).trim().slice(0, 120) : ''
  const description = String(r.description ?? '').trim().slice(0, 800)
  const descriptionArRaw = r.descriptionAr != null ? String(r.descriptionAr).trim().slice(0, 800) : ''
  const fieldLabel = String(r.fieldLabel ?? 'API secret').trim().slice(0, 120) || 'API secret'
  const fieldLabelArRaw = r.fieldLabelAr != null ? String(r.fieldLabelAr).trim().slice(0, 120) : ''
  const placeholderRaw = r.placeholder != null ? String(r.placeholder).trim().slice(0, 160) : ''
  const placeholderArRaw = r.placeholderAr != null ? String(r.placeholderAr).trim().slice(0, 160) : ''
  let iconClass = String(r.iconClass ?? 'fa-solid fa-key').trim().slice(0, 120) || 'fa-solid fa-key'
  if (!iconClass.includes('fa-')) iconClass = 'fa-solid fa-key'
  return {
    id,
    title,
    ...(titleArRaw ? { titleAr: titleArRaw } : {}),
    description,
    ...(descriptionArRaw ? { descriptionAr: descriptionArRaw } : {}),
    fieldLabel,
    ...(fieldLabelArRaw ? { fieldLabelAr: fieldLabelArRaw } : {}),
    ...(placeholderRaw ? { placeholder: placeholderRaw } : {}),
    ...(placeholderArRaw ? { placeholderAr: placeholderArRaw } : {}),
    iconClass,
  }
}
