import { useCallback, useEffect, useId, useRef, useState } from 'react'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif']
const ACCEPTED_EXT = '.jpg,.jpeg,.png,.gif'

export type CreateThumbnailModalProps = {
  open: boolean
  initialThumbnail?: string
  onClose: () => void
  onSave: (thumbnailDataUrl: string) => void
  onCreateFromMap: () => void
}

export function CreateThumbnailModal({
  open,
  initialThumbnail,
  onClose,
  onSave,
  onCreateFromMap,
}: CreateThumbnailModalProps) {
  const titleId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setDraft(null)
      setDragOver(false)
      setError(null)
      return
    }
    setDraft(initialThumbnail ?? null)
  }, [open, initialThumbnail])

  const readFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a JPG, PNG, or GIF file.')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Image must be 4 MB or smaller.')
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setDraft(reader.result)
    }
    reader.onerror = () => setError('Could not read the file.')
    reader.readAsDataURL(file)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) readFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) readFile(file)
  }

  if (!open) return null

  const canSave = Boolean(draft)

  return (
    <div
      className="item-pane-thumb-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="item-pane-thumb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <header className="item-pane-thumb-modal__header">
          <h2 id={titleId} className="item-pane-thumb-modal__title">
            Create thumbnail
          </h2>
          <button type="button" className="item-pane-thumb-modal__close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="item-pane-thumb-modal__body">
          <div
            className={`item-pane-thumb-modal__dropzone${dragOver ? ' is-dragover' : ''}${draft ? ' has-preview' : ''}`}
            onDragOver={e => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {draft ? (
              <img src={draft} alt="Thumbnail preview" className="item-pane-thumb-modal__preview" />
            ) : (
              <>
                <i className="fa-solid fa-cloud-arrow-up item-pane-thumb-modal__upload-icon" aria-hidden />
                <p className="item-pane-thumb-modal__drop-title">Drag and drop a JPG, PNG, or GIF file.</p>
                <p className="item-pane-thumb-modal__drop-hint">
                  For best results, the image should be 600 × 400 pixels, or larger.
                </p>
              </>
            )}
            <button
              type="button"
              className="item-pane-thumb-modal__browse"
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="fa-regular fa-image" aria-hidden />
              Browse…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXT}
              className="item-pane-thumb-modal__file-input"
              onChange={onFileChange}
            />
          </div>

          {error ? (
            <p className="item-pane-thumb-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="item-pane-thumb-modal__or">
            <span>or</span>
          </div>

          <button type="button" className="item-pane-thumb-modal__map-option" onClick={onCreateFromMap}>
            <span className="item-pane-thumb-modal__map-icon" aria-hidden>
              <i className="fa-solid fa-map" />
            </span>
            <span className="item-pane-thumb-modal__map-text">
              <strong>Create thumbnail from map</strong>
              <span>Create a custom thumbnail by setting extent and zoom level</span>
            </span>
          </button>
        </div>

        <footer className="item-pane-thumb-modal__footer">
          <button type="button" className="item-pane-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="item-pane-btn item-pane-btn--primary"
            disabled={!canSave}
            onClick={() => {
              if (draft) onSave(draft)
            }}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
