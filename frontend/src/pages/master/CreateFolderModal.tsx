import { useEffect, useId, useRef, useState } from 'react'
import {
  GIS_FOLDER_COLOR_OPTIONS,
  type GisContentFolderColor,
} from './gisContentPortalData'

export type FolderModalSavePayload = {
  name: string
  color: GisContentFolderColor
}

export type CreateFolderModalProps = {
  open: boolean
  mode?: 'create' | 'edit'
  initialName?: string
  initialColor?: GisContentFolderColor
  onClose: () => void
  onSave: (payload: FolderModalSavePayload) => void
  errorMessage?: string | null
}

export function CreateFolderModal({
  open,
  mode = 'create',
  initialName = '',
  initialColor = 'default',
  onClose,
  onSave,
  errorMessage,
}: CreateFolderModalProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<GisContentFolderColor>('default')

  useEffect(() => {
    if (!open) {
      setName('')
      setColor('default')
      return
    }
    setName(initialName)
    setColor(initialColor)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open, initialName, initialColor])

  if (!open) return null

  const trimmed = name.trim()
  const canSave = trimmed.length > 0
  const title = mode === 'edit' ? 'Edit folder' : 'Create a folder'
  const titleId = mode === 'edit' ? 'gis-edit-folder-title' : 'gis-create-folder-title'

  const handleSave = () => {
    if (!canSave) return
    onSave({ name: trimmed, color })
  }

  return (
    <div
      className="gis-portal-modal-backdrop gis-portal-modal-backdrop--light"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="gis-fl-wizard gis-fl-wizard--folder"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <header className="gis-fl-wizard__header">
          <h2 id={titleId} className="gis-fl-wizard__title">
            {title}
          </h2>
          <button type="button" className="gis-fl-wizard__icon-btn" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="gis-fl-wizard__body gis-fl-wizard__body--folder">
          <label className="gis-fl-wizard__field-label" htmlFor={inputId}>
            Folder name
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="gis-fl-wizard__input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && canSave) handleSave()
              if (e.key === 'Escape') onClose()
            }}
            autoComplete="off"
          />

          <div className="gis-portal-folder-options">
            <span className="gis-portal-folder-options__label">Folder options</span>
            <div className="gis-portal-folder-options__colors" role="radiogroup" aria-label="Folder color">
              {GIS_FOLDER_COLOR_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={color === option.id}
                  aria-label={option.label}
                  title={option.label}
                  className={`gis-portal-folder-options__color${color === option.id ? ' gis-portal-folder-options__color--active' : ''}`}
                  onClick={() => setColor(option.id)}
                >
                  <span className="gis-portal-folder-options__swatch" style={{ background: option.swatch }} />
                </button>
              ))}
            </div>
          </div>

          {errorMessage ? (
            <p className="gis-fl-wizard__field-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer className="gis-fl-wizard__footer">
          <div className="gis-fl-wizard__footer-right gis-fl-wizard__footer-right--end">
            <button type="button" className="gis-fl-wizard__btn gis-fl-wizard__btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="gis-fl-wizard__btn gis-fl-wizard__btn--primary"
              disabled={!canSave}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
