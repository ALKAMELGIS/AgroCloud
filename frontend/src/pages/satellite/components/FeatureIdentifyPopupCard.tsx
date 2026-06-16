import type { ReactNode } from 'react'
import './layer-attribute-popup.css'

export type FeatureIdentifyPopupCardProps = {
  title: string
  collapsed?: boolean
  maximized?: boolean
  onToggleMaximize?: () => void
  onToggleCollapse?: () => void
  onClose: () => void
  onOpenTable?: () => void
  onEdit?: () => void
  onZoomTo?: () => void
  editActive?: boolean
  featureIndex?: number
  featureTotal?: number
  onPrevFeature?: () => void
  onNextFeature?: () => void
  children: ReactNode
  /** Map-anchored card (inside Marker) vs absolutely positioned popup shell */
  anchored?: boolean
  className?: string
  role?: string
  'aria-label'?: string
  onPointerDown?: (e: React.PointerEvent) => void
  onClick?: (e: React.MouseEvent) => void
  placement?: 'top' | 'bottom'
  arrowLeft?: number
  popupState?: 'open' | 'closing'
  style?: React.CSSProperties
}

export function FeatureIdentifyPopupCard({
  title,
  collapsed = false,
  maximized = false,
  onToggleMaximize,
  onToggleCollapse,
  onClose,
  onOpenTable,
  onEdit,
  onZoomTo,
  editActive = false,
  featureIndex = 0,
  featureTotal = 1,
  onPrevFeature,
  onNextFeature,
  children,
  anchored = false,
  className = '',
  role = 'dialog',
  'aria-label': ariaLabel = 'Feature attributes',
  onPointerDown,
  onClick,
  placement,
  arrowLeft,
  popupState,
  style,
}: FeatureIdentifyPopupCardProps) {
  const showFooter = featureTotal > 1
  const rootClass = [
    'gis-map-popup',
    'gis-map-popup--arcgis',
    anchored ? 'si-feature-identify-card' : '',
    maximized ? 'maximized' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={rootClass}
      role={role}
      aria-label={ariaLabel}
      data-state={popupState}
      data-placement={placement}
      style={{
        ...style,
        ...(typeof arrowLeft === 'number' ? { ['--arrow-left' as string]: `${arrowLeft}px` } : {}),
      }}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <div className="gis-map-popup-header">
        <div className="gis-map-popup-title" title={title}>
          {title}
        </div>
        <div className="gis-map-popup-headactions">
          {onToggleMaximize ? (
            <button
              className="gis-map-popup-headbtn"
              type="button"
              onClick={onToggleMaximize}
              aria-label={maximized ? 'Restore popup size' : 'Dock popup'}
              title={maximized ? 'Restore' : 'Dock'}
            >
              <i className="fa-regular fa-rectangle-list" aria-hidden="true" />
            </button>
          ) : null}
          {onToggleCollapse ? (
            <button
              className="gis-map-popup-headbtn"
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand popup' : 'Collapse popup'}
              title={collapsed ? 'Expand' : 'Collapse'}
              aria-expanded={!collapsed}
            >
              <i className={`fa-solid ${collapsed ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
            </button>
          ) : null}
          <button className="gis-map-popup-headbtn" type="button" onClick={onClose} aria-label="Close popup" title="Close">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
      </div>

      {!collapsed ? (
        <>
          <div className="gis-map-popup-toolbar" role="toolbar" aria-label="Popup actions">
            {onOpenTable ? (
              <button className="gis-map-popup-toolbtn" type="button" onClick={onOpenTable}>
                <i className="fa-solid fa-table" aria-hidden="true" />
                <span>Table</span>
              </button>
            ) : null}
            {onEdit ? (
              <button
                className={`gis-map-popup-toolbtn${editActive ? ' gis-map-popup-toolbtn--active' : ''}`}
                type="button"
                onClick={onEdit}
                aria-pressed={editActive}
              >
                <i className="fa-solid fa-pen" aria-hidden="true" />
                <span>Edit</span>
              </button>
            ) : null}
            {onZoomTo ? (
              <button className="gis-map-popup-toolbtn" type="button" onClick={onZoomTo}>
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <span>Zoom to</span>
              </button>
            ) : null}
          </div>

          <div className="gis-map-popup-body">{children}</div>

          {showFooter ? (
            <div className="gis-map-popup-footer">
              <div className="gis-map-popup-footer-nav">
                <button
                  type="button"
                  className="gis-map-popup-footer-btn"
                  onClick={onPrevFeature}
                  disabled={!onPrevFeature || featureIndex <= 0}
                  aria-label="Previous feature"
                >
                  <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="gis-map-popup-footer-btn"
                  onClick={onNextFeature}
                  disabled={!onNextFeature || featureIndex >= featureTotal - 1}
                  aria-label="Next feature"
                >
                  <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                </button>
              </div>
              <div className="gis-map-popup-footer-count">
                <i className="fa-solid fa-list" aria-hidden="true" />
                <span>
                  {featureIndex + 1} of {featureTotal}
                </span>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
