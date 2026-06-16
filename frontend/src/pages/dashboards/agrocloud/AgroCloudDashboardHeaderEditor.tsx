import { useEffect, useState, type Dispatch, SetStateAction, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AgroCloudDashboardConfig } from './agroCloudDashboardData'
import {
  patchDashboardHeader,
  resolveDashboardHeader,
  resolveDashboardHeaderTitle,
  type AgroCloudDashboardHeaderConfig,
} from './agroCloudDashboardLayout'

type Props = {
  open: boolean
  config: AgroCloudDashboardConfig
  dashboardTitle: string
  onConfigChange: Dispatch<SetStateAction<AgroCloudDashboardConfig>>
  onClose: () => void
}

type SectionId = 'settings' | 'logo' | 'background' | 'menu'

function HeaderEditorSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: SectionId
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="agrocloud-dashboard-header-editor__section">
      <button
        type="button"
        className="agrocloud-dashboard-header-editor__section-head"
        aria-expanded={open}
        aria-controls={`header-section-${id}`}
        onClick={onToggle}
      >
        <span>{title}</span>
        <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'}`} aria-hidden />
      </button>
      {open ? (
        <div id={`header-section-${id}`} className="agrocloud-dashboard-header-editor__section-body">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function HeaderPreview({
  header,
  dashboardTitle,
}: {
  header: AgroCloudDashboardHeaderConfig
  dashboardTitle: string
}) {
  const title = resolveDashboardHeaderTitle(header.title, dashboardTitle)
  const subtitle = resolveDashboardHeaderTitle(header.subtitle, dashboardTitle)
  const marginClass = header.headerMargin ? ' has-margin' : ''

  return (
    <div
      className={`agrocloud-dashboard-header-editor__preview-bar${marginClass}`}
      style={{
        color: header.textColor,
        background: header.backgroundImageUrl
          ? `url(${header.backgroundImageUrl}) center/cover no-repeat`
          : header.foregroundColor,
      }}
    >
      <div className="agrocloud-dashboard-header-editor__preview-brand">
        {header.logoEnabled && header.logoUrl ? (
          <img src={header.logoUrl} alt="" className="agrocloud-dashboard-header-editor__preview-logo" />
        ) : header.logoEnabled ? (
          <span className="agrocloud-dashboard-header-editor__preview-logo-placeholder" aria-hidden />
        ) : null}
        <div
          className={`agrocloud-dashboard-header-editor__preview-titles${
            header.subtitlePlacement === 'below' ? ' is-stacked' : ''
          }`}
        >
          {title ? <strong>{title}</strong> : null}
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
      </div>
      {header.menuEnabled ? (
        <button type="button" className="agrocloud-dashboard-header-editor__preview-menu" aria-label="Menu">
          <i className="fa-solid fa-bars" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

export function AgroCloudDashboardHeaderEditor({
  open,
  config,
  dashboardTitle,
  onConfigChange,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<AgroCloudDashboardHeaderConfig>(() => resolveDashboardHeader(config))
  const [openSection, setOpenSection] = useState<SectionId>('settings')

  useEffect(() => {
    if (open) {
      setDraft(resolveDashboardHeader(config))
      setOpenSection('settings')
    }
  }, [open, config])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const update = (patch: Partial<AgroCloudDashboardHeaderConfig>) => {
    setDraft(prev => ({ ...prev, ...patch }))
  }

  const handleDone = () => {
    onConfigChange(prev => patchDashboardHeader(prev, draft))
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  return createPortal(
    <div className="agrocloud-dashboard-header-editor" role="dialog" aria-modal="true" aria-label="Header">
      <header className="agrocloud-dashboard-header-editor__top">
        <h2>Header</h2>
        <button type="button" className="agrocloud-dashboard-header-editor__close" aria-label="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="agrocloud-dashboard-header-editor__body">
        <aside className="agrocloud-dashboard-header-editor__settings">
          <h3>Appearance</h3>
          <HeaderEditorSection
            id="settings"
            title="Settings"
            open={openSection === 'settings'}
            onToggle={() => setOpenSection('settings')}
          >
            <label className="agrocloud-dashboard-header-editor__field">
              <span>Title</span>
              <input
                type="text"
                value={draft.title}
                onChange={e => update({ title: e.target.value })}
                placeholder="{{Item Title}}"
              />
            </label>
            <label className="agrocloud-dashboard-header-editor__field">
              <span>Subtitle</span>
              <input
                type="text"
                value={draft.subtitle}
                onChange={e => update({ subtitle: e.target.value })}
                placeholder="{{}}"
              />
            </label>
            <div className="agrocloud-dashboard-header-editor__field">
              <span>Subtitle placement</span>
              <div className="agrocloud-dashboard-header-editor__segmented" role="group" aria-label="Subtitle placement">
                <button
                  type="button"
                  className={draft.subtitlePlacement === 'sameLine' ? ' is-active' : ''}
                  onClick={() => update({ subtitlePlacement: 'sameLine' })}
                >
                  Same line
                </button>
                <button
                  type="button"
                  className={draft.subtitlePlacement === 'below' ? ' is-active' : ''}
                  onClick={() => update({ subtitlePlacement: 'below' })}
                >
                  Below
                </button>
              </div>
            </div>
            <label className="agrocloud-dashboard-header-editor__field agrocloud-dashboard-header-editor__field--color">
              <span>Text color</span>
              <input type="color" value={draft.textColor} onChange={e => update({ textColor: e.target.value })} />
            </label>
            <label className="agrocloud-dashboard-header-editor__field agrocloud-dashboard-header-editor__field--color">
              <span>Foreground color</span>
              <input
                type="color"
                value={draft.foregroundColor}
                onChange={e => update({ foregroundColor: e.target.value })}
              />
            </label>
            <label className="agrocloud-dashboard-header-editor__toggle">
              <span>Header margin</span>
              <input
                type="checkbox"
                checked={draft.headerMargin}
                onChange={e => update({ headerMargin: e.target.checked })}
              />
            </label>
          </HeaderEditorSection>
          <HeaderEditorSection
            id="logo"
            title="Logo"
            open={openSection === 'logo'}
            onToggle={() => setOpenSection('logo')}
          >
            <label className="agrocloud-dashboard-header-editor__toggle">
              <span>Show logo</span>
              <input
                type="checkbox"
                checked={draft.logoEnabled}
                onChange={e => update({ logoEnabled: e.target.checked })}
              />
            </label>
            {draft.logoEnabled ? (
              <label className="agrocloud-dashboard-header-editor__field">
                <span>Logo URL</span>
                <input
                  type="url"
                  value={draft.logoUrl ?? ''}
                  onChange={e => update({ logoUrl: e.target.value })}
                  placeholder="https://"
                />
              </label>
            ) : null}
          </HeaderEditorSection>
          <HeaderEditorSection
            id="background"
            title="Background image"
            open={openSection === 'background'}
            onToggle={() => setOpenSection('background')}
          >
            <label className="agrocloud-dashboard-header-editor__field">
              <span>Image URL</span>
              <input
                type="url"
                value={draft.backgroundImageUrl ?? ''}
                onChange={e => update({ backgroundImageUrl: e.target.value })}
                placeholder="https://"
              />
            </label>
          </HeaderEditorSection>
          <HeaderEditorSection
            id="menu"
            title="Menu items"
            open={openSection === 'menu'}
            onToggle={() => setOpenSection('menu')}
          >
            <label className="agrocloud-dashboard-header-editor__toggle">
              <span>Show menu button</span>
              <input
                type="checkbox"
                checked={draft.menuEnabled}
                onChange={e => update({ menuEnabled: e.target.checked })}
              />
            </label>
          </HeaderEditorSection>
        </aside>
        <div className="agrocloud-dashboard-header-editor__preview">
          <HeaderPreview header={draft} dashboardTitle={dashboardTitle} />
        </div>
      </div>
      <footer className="agrocloud-dashboard-header-editor__footer">
        <button type="button" className="agrocloud-dashboard-header-editor__btn agrocloud-dashboard-header-editor__btn--ghost" onClick={handleCancel}>
          Cancel
        </button>
        <button type="button" className="agrocloud-dashboard-header-editor__btn agrocloud-dashboard-header-editor__btn--primary" onClick={handleDone}>
          Done
        </button>
      </footer>
    </div>,
    document.body,
  )
}
