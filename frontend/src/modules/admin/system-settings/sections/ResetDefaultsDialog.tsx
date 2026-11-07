import { useEffect, useRef } from 'react'

type Props = {
  open: boolean
  language: string
  onCancel: () => void
  onConfirm: () => void
}

/** Confirmation for "Restore factory defaults" in System Settings. */
export function ResetDefaultsDialog({ open, language, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  const ar = language === 'ar'
  return (
    <div
      className="sys-api-modal-overlay sys-reset-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sys-reset-dialog-title"
      onClick={e => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="sys-api-modal sys-reset-dialog">
        <h2 id="sys-reset-dialog-title" className="sys-api-modal__title">
          {ar ? 'استعادة إعدادات المصنع' : 'Restore factory defaults'}
        </h2>
        <p className="sys-api-modal__lead">
          {ar
            ? 'إعادة جميع إعدادات النظام (السمة والشعارات والتنقل والصفحات) إلى القيم الافتراضية؟'
            : 'Reset all system settings to factory defaults?'}
        </p>
        <div className="sys-api-modal__actions">
          <button ref={cancelRef} type="button" className="gis-btn gis-btn-outline" onClick={onCancel}>
            {ar ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="button" className="gis-btn sys-btn-danger" onClick={onConfirm}>
            {ar ? 'استعادة' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  )
}
