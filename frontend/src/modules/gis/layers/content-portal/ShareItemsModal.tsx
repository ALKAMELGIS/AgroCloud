import { useEffect, useState } from 'react'
import {
  GIS_CONTENT_SHARING_OPTIONS,
  gisSharingLabel,
  type GisContentSharing,
} from './gisContentPortalData'

export type ShareItemsModalProps = {
  open: boolean
  itemCount: number
  initialSharing: GisContentSharing
  onClose: () => void
  onApply: (sharing: GisContentSharing) => void
}

export function ShareItemsModal({ open, itemCount, initialSharing, onClose, onApply }: ShareItemsModalProps) {
  const [sharing, setSharing] = useState<GisContentSharing>(initialSharing)

  useEffect(() => {
    if (open) setSharing(initialSharing)
  }, [open, initialSharing])

  if (!open) return null

  return (
    <div className="gis-portal-modal-backdrop gis-portal-modal-backdrop--light" role="presentation" onClick={onClose}>
      <div
        className="gis-fl-wizard gis-fl-wizard--folder"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gis-share-items-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="gis-fl-wizard__header">
          <h2 id="gis-share-items-title" className="gis-fl-wizard__title">
            Share {itemCount} item{itemCount === 1 ? '' : 's'}
          </h2>
          <button type="button" className="gis-fl-wizard__icon-btn" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="gis-fl-wizard__body gis-fl-wizard__body--folder">
          <p className="gis-portal-bulk-share__hint">Choose who can access the selected items.</p>
          <ul className="gis-portal-bulk-share__list" role="listbox" aria-label="Sharing level">
            {GIS_CONTENT_SHARING_OPTIONS.map(option => (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={sharing === option.id}
                  className={`gis-portal-bulk-share__option${sharing === option.id ? ' gis-portal-bulk-share__option--active' : ''}`}
                  onClick={() => setSharing(option.id)}
                >
                  <i className={option.icon} aria-hidden />
                  <span>{gisSharingLabel(option.id)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className="gis-fl-wizard__footer">
          <div className="gis-fl-wizard__footer-right gis-fl-wizard__footer-right--end">
            <button type="button" className="gis-fl-wizard__btn gis-fl-wizard__btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="gis-fl-wizard__btn gis-fl-wizard__btn--primary" onClick={() => onApply(sharing)}>
              Apply
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
