import { useState, type Dispatch, ReactNode, SetStateAction } from 'react'
import {
  AGROCLOUD_DASHBOARD_THEMES,
  type AgroCloudDashboardConfig,
  type AgroCloudDashboardElement,
  type AgroCloudDashboardElementKind,
  type AgroCloudEditorPanel,
  type AgroCloudViewTab,
} from './agroCloudDashboardData'
import { agroCloudDashboardThemeThumbUrl } from './agroCloudDashboardTheme'
import { AgroCloudDashboardThemeCustomizePanel } from './AgroCloudDashboardThemeCustomizePanel'
import { AgroCloudDashboardTimeRegionPanel } from './AgroCloudDashboardTimeRegionPanel'
import { AgroCloudDashboardHeaderEditor } from './AgroCloudDashboardHeaderEditor'
import { DashboardAddElementMenu } from './DashboardAddElementMenu'
import {
  getBodyElements,
  getHeaderWidgetElements,
  getSidebarElements,
  patchDashboardHeader,
  patchDashboardSidebar,
  resolveDashboardHeader,
  resolveDashboardHeaderTitle,
  resolveDashboardSidebar,
  resolveDashboardViewSettings,
} from './agroCloudDashboardLayout'
import { getGisContentRowById } from '../../../lib/gisContentPortalStore'
import { collectDashboardDataSources, countWidgetsUsingDataSource, dataSourceTypeBadge } from './agroCloudDashboardDataSourceEngine'
import {
  GIS_CONTENT_SHARING_OPTIONS,
  gisSharingLabel,
  type GisContentSharing,
} from '../../master/gisContentPortalData'
import { getGisContentPortalFolders } from '../../../lib/gisContentPortalStore'

type PanelShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}

function PanelShell({ title, onClose, children, className }: PanelShellProps) {
  return (
    <section className={`agrocloud-dashboard-editor__panel${className ? ` ${className}` : ''}`}>
      <header className="agrocloud-dashboard-editor__panel-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="agrocloud-dashboard-editor__panel-close"
          aria-label="Close panel"
          onClick={e => {
            e.stopPropagation()
            onClose()
          }}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="agrocloud-dashboard-editor__panel-body">{children}</div>
    </section>
  )
}

function ViewRegionEmpty({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string
  hint: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="agrocloud-dashboard-editor__empty agrocloud-dashboard-editor__empty--region">
      <h3>{title}</h3>
      <p>{hint}</p>
      <button type="button" className="agrocloud-dashboard-editor__add-element" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}

function ElementList({
  elements,
  onRemoveElement,
}: {
  elements: AgroCloudDashboardElement[]
  onRemoveElement: (id: string) => void
}) {
  return (
    <div className="agrocloud-dashboard-editor__elements">
      {elements.map(el => (
        <div key={el.id} className="agrocloud-dashboard-editor__element-chip">
          <span>{el.label}</span>
          <button
            type="button"
            className="agrocloud-dashboard-editor__element-remove"
            aria-label={`Remove ${el.label}`}
            onClick={() => onRemoveElement(el.id)}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}

type ViewPanelProps = {
  viewTab: AgroCloudViewTab
  onViewTabChange: (tab: AgroCloudViewTab) => void
  config: AgroCloudDashboardConfig
  dashboardTitle?: string
  onClose: () => void
  onAddElementOption: (kind: AgroCloudDashboardElementKind, label: string) => void
  onRemoveElement: (id: string) => void
  onConfigChange: Dispatch<SetStateAction<AgroCloudDashboardConfig>>
  onOpenAddPanel?: () => void
}

export function AgroCloudDashboardViewPanel({
  viewTab,
  onViewTabChange,
  config,
  dashboardTitle = 'Untitled dashboard',
  onClose,
  onAddElementOption,
  onRemoveElement,
  onConfigChange,
  onOpenAddPanel,
}: ViewPanelProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [headerEditorOpen, setHeaderEditorOpen] = useState(false)

  const headerLayout = resolveDashboardHeader(config)
  const sidebarLayout = resolveDashboardSidebar(config)
  const viewSettings = resolveDashboardViewSettings(config)
  const layoutMode = config.layoutMode ?? 'desktop'
  const bodyElements = getBodyElements(config.elements)
  const headerWidgets = getHeaderWidgetElements(config.elements)
  const sidebarElements = getSidebarElements(config.elements)

  const openAddMenu = () => {
    if (onOpenAddPanel) {
      onOpenAddPanel()
      return
    }
    setAddMenuOpen(true)
  }

  const enableHeader = () => {
    onConfigChange(prev => patchDashboardHeader(prev, {}))
    setHeaderEditorOpen(true)
  }

  const enableSidebar = () => {
    onConfigChange(prev => patchDashboardSidebar(prev, {}))
  }

  const renderCanvas = () => {
    if (viewTab === 'body') {
      if (bodyElements.length === 0) {
        return (
          <div className="agrocloud-dashboard-editor__empty">
            <h3>Your dashboard is empty</h3>
            <p>Add maps, charts, and indicators to the body — the main content area of your dashboard.</p>
            <div className="agrocloud-dashboard-editor__add-element-wrap">
              <button type="button" className="agrocloud-dashboard-editor__add-element" onClick={openAddMenu}>
                <i className="fa-solid fa-plus" aria-hidden />
                Add element
              </button>
              <DashboardAddElementMenu
                open={addMenuOpen}
                placement="inline"
                onClose={() => setAddMenuOpen(false)}
                onSelect={onAddElementOption}
              />
            </div>
          </div>
        )
      }
      return <ElementList elements={bodyElements} onRemoveElement={onRemoveElement} />
    }

    if (viewTab === 'header') {
      if (!headerLayout.enabled) {
        return (
          <ViewRegionEmpty
            title="Add a header"
            hint="Use a header to add a title and selectors to your dashboard."
            actionLabel="Add header"
            onAction={enableHeader}
          />
        )
      }
      const resolvedTitle = resolveDashboardHeaderTitle(headerLayout.title, dashboardTitle)
      return (
        <div className="agrocloud-dashboard-editor__region-summary">
          <div className="agrocloud-dashboard-editor__region-card">
            <strong>{resolvedTitle || dashboardTitle}</strong>
            {headerLayout.subtitle ? (
              <span>{resolveDashboardHeaderTitle(headerLayout.subtitle, dashboardTitle)}</span>
            ) : (
              <span className="agrocloud-dashboard-editor__region-muted">No subtitle</span>
            )}
          </div>
          <button
            type="button"
            className="agrocloud-dashboard-editor__region-edit"
            onClick={() => setHeaderEditorOpen(true)}
          >
            Edit header
          </button>
          {headerWidgets.length > 0 ? (
            <ElementList elements={headerWidgets} onRemoveElement={onRemoveElement} />
          ) : (
            <p className="agrocloud-dashboard-editor__region-hint">
              Add indicators or rich text for global selectors in the header zone.
            </p>
          )}
          <button type="button" className="agrocloud-dashboard-editor__region-add-widget" onClick={openAddMenu}>
            <i className="fa-solid fa-plus" aria-hidden />
            Add header element
          </button>
        </div>
      )
    }

    if (viewTab === 'sidebar') {
      if (!sidebarLayout.enabled) {
        return (
          <ViewRegionEmpty
            title="Add a sidebar"
            hint="Use a sidebar for filters, legends, and navigation tools separate from the main content."
            actionLabel="Add sidebar"
            onAction={enableSidebar}
          />
        )
      }
      if (sidebarElements.length === 0) {
        return (
          <div className="agrocloud-dashboard-editor__region-summary">
            <p className="agrocloud-dashboard-editor__region-hint">
              Sidebar layout is enabled. Add lists, tables, or gauges to populate it.
            </p>
            <button type="button" className="agrocloud-dashboard-editor__add-element" onClick={openAddMenu}>
              <i className="fa-solid fa-plus" aria-hidden />
              Add sidebar element
            </button>
          </div>
        )
      }
      return <ElementList elements={sidebarElements} onRemoveElement={onRemoveElement} />
    }

    return (
      <div className="agrocloud-dashboard-editor__settings-tab agrocloud-dashboard-editor__settings-tab--view">
        <p className="agrocloud-dashboard-editor__settings-intro">
          Control dashboard behavior. Theme and time settings are available from the editor rail.
        </p>
        <label className="agrocloud-dashboard-editor__toggle-row">
          <span>Auto refresh</span>
          <input
            type="checkbox"
            checked={viewSettings.autoRefresh}
            onChange={e =>
              onConfigChange(prev => ({
                ...prev,
                viewSettings: { ...resolveDashboardViewSettings(prev), autoRefresh: e.target.checked },
              }))
            }
          />
        </label>
        {viewSettings.autoRefresh ? (
          <label className="agrocloud-dashboard-editor__field-label">
            Refresh interval (minutes)
            <input
              type="number"
              className="agrocloud-dashboard-editor__input"
              min={1}
              max={1440}
              value={viewSettings.autoRefreshMinutes}
              onChange={e =>
                onConfigChange(prev => ({
                  ...prev,
                  viewSettings: {
                    ...resolveDashboardViewSettings(prev),
                    autoRefreshMinutes: Math.max(1, Number(e.target.value) || 5),
                  },
                }))
              }
            />
          </label>
        ) : null}
        <div className="agrocloud-dashboard-editor__settings-note">
          <strong>Theme</strong>
          <span>Colors, typography, and widget styling</span>
        </div>
        <div className="agrocloud-dashboard-editor__settings-note">
          <strong>Time and region</strong>
          <span>Time zone and unit prefixes for numeric values</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <PanelShell title="View" onClose={onClose} className="agrocloud-dashboard-editor__panel--view">
        <div className="agrocloud-dashboard-editor__view-row">
          <div className="agrocloud-dashboard-editor__layout-modes">
            <button
              type="button"
              className={`agrocloud-dashboard-editor__layout-mode${layoutMode === 'desktop' ? ' is-active' : ''}`}
              aria-pressed={layoutMode === 'desktop'}
              onClick={() => onConfigChange(prev => ({ ...prev, layoutMode: 'desktop' }))}
            >
              <i className="fa-solid fa-desktop" aria-hidden />
              Desktop
            </button>
            {config.mobileViewEnabled ? (
              <button
                type="button"
                className={`agrocloud-dashboard-editor__layout-mode${layoutMode === 'mobile' ? ' is-active' : ''}`}
                aria-pressed={layoutMode === 'mobile'}
                onClick={() => onConfigChange(prev => ({ ...prev, layoutMode: 'mobile' }))}
              >
                <i className="fa-solid fa-mobile-screen" aria-hidden />
                Mobile
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="agrocloud-dashboard-editor__add-mobile"
            onClick={() =>
              onConfigChange(prev => ({
                ...prev,
                mobileViewEnabled: !prev.mobileViewEnabled,
                layoutMode: !prev.mobileViewEnabled ? prev.layoutMode ?? 'desktop' : 'desktop',
              }))
            }
          >
            <i className={`fa-solid fa-${config.mobileViewEnabled ? 'minus' : 'plus'}`} aria-hidden />
            {config.mobileViewEnabled ? 'Remove mobile view' : 'Add mobile view'}
          </button>
        </div>
        <div className="agrocloud-dashboard-editor__view-tabs" role="tablist">
          {(['body', 'header', 'sidebar', 'settings'] as AgroCloudViewTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              className={`agrocloud-dashboard-editor__view-tab${viewTab === tab ? ' is-active' : ''}`}
              aria-selected={viewTab === tab}
              onClick={() => onViewTabChange(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="agrocloud-dashboard-editor__canvas">
          {renderCanvas()}
          {addMenuOpen && viewTab !== 'body' && viewTab !== 'settings' ? (
            <div className="agrocloud-dashboard-editor__add-element-wrap agrocloud-dashboard-editor__add-element-wrap--floating">
              <DashboardAddElementMenu
                open={addMenuOpen}
                placement="inline"
                onClose={() => setAddMenuOpen(false)}
                onSelect={onAddElementOption}
              />
            </div>
          ) : null}
        </div>
      </PanelShell>
      <AgroCloudDashboardHeaderEditor
        open={headerEditorOpen}
        config={config}
        dashboardTitle={dashboardTitle}
        onConfigChange={onConfigChange}
        onClose={() => setHeaderEditorOpen(false)}
      />
    </>
  )
}

type EditorPanelsProps = {
  panel: AgroCloudEditorPanel
  viewTab: AgroCloudViewTab
  onViewTabChange: (tab: AgroCloudViewTab) => void
  config: AgroCloudDashboardConfig
  onConfigChange: Dispatch<SetStateAction<AgroCloudDashboardConfig>>
  onClose: () => void
  onAddElementOption: (kind: AgroCloudDashboardElementKind, label: string) => void
  onRemoveElement: (id: string) => void
  onOpenAddPanel?: () => void
  onOpenThemeCustomize?: () => void
  onBackToThemes?: () => void
  onConfigureDataSource?: (gisContentId: string) => void
  onAddDataSource?: () => void
  dashboardTitle?: string
}

export function AgroCloudDashboardEditorPanels({
  panel,
  viewTab,
  onViewTabChange,
  config,
  onConfigChange,
  onClose,
  onAddElementOption,
  onRemoveElement,
  onOpenAddPanel,
  onOpenThemeCustomize,
  onBackToThemes,
  onConfigureDataSource,
  onAddDataSource,
  dashboardTitle,
}: EditorPanelsProps) {
  if (panel === 'view') {
    return (
      <AgroCloudDashboardViewPanel
        viewTab={viewTab}
        onViewTabChange={onViewTabChange}
        config={config}
        dashboardTitle={dashboardTitle}
        onClose={onClose}
        onAddElementOption={onAddElementOption}
        onRemoveElement={onRemoveElement}
        onConfigChange={onConfigChange}
        onOpenAddPanel={onOpenAddPanel}
      />
    )
  }

  if (panel === 'dataSources') {
    const sources = collectDashboardDataSources(config)
    return (
      <PanelShell title="Data sources" onClose={onClose} className="agrocloud-dashboard-editor__panel--scroll">
        <div className="agrocloud-dashboard-editor__source-actions">
          <button type="button" className="agrocloud-dashboard-editor__source-add" onClick={() => onAddDataSource?.()}>
            <i className="fa-solid fa-plus" aria-hidden />
            Add data source
          </button>
        </div>
        {sources.length === 0 ? (
          <div className="agrocloud-dashboard-editor__info-box">
            <i className="fa-solid fa-circle-info" aria-hidden />
            <span>No data sources — add a Web Map or Feature Layer from GIS Content.</span>
          </div>
        ) : (
          <ul className="agrocloud-dashboard-editor__source-list">
            {sources.map(source => {
              const row = getGisContentRowById(source.gisContentId)
              const widgetCount = countWidgetsUsingDataSource(config, source.gisContentId)
              return (
                <li key={source.id} className="agrocloud-dashboard-editor__source-item">
                  <div className="agrocloud-dashboard-editor__source-item-head">
                    <div className="agrocloud-dashboard-editor__source-item-text">
                      <strong>{source.title}</strong>
                      <span>{row ? dataSourceTypeBadge(row) : source.typeLabel}</span>
                    </div>
                    <button
                      type="button"
                      className="agrocloud-dashboard-editor__source-configure"
                      title="Configure data source"
                      aria-label={`Configure data source ${source.title}`}
                      onClick={() => onConfigureDataSource?.(source.gisContentId)}
                    >
                      <i className="fa-solid fa-gear" aria-hidden />
                    </button>
                  </div>
                  {source.layers.length > 0 ? (
                    <ul className="agrocloud-dashboard-editor__source-layers">
                      {source.layers.map(layer => (
                        <li key={layer.id}>{layer.name}</li>
                      ))}
                    </ul>
                  ) : null}
                  {widgetCount > 0 ? (
                    <p className="agrocloud-dashboard-editor__source-widgets">
                      {widgetCount} widget{widgetCount === 1 ? '' : 's'} linked
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </PanelShell>
    )
  }

  if (panel === 'theme') {
    return (
      <PanelShell title="Theme" onClose={onClose} className="agrocloud-dashboard-editor__panel--theme">
        <p className="agrocloud-dashboard-editor__panel-lede">Select a theme to apply or customize.</p>
        <ul className="agrocloud-dashboard-editor__theme-list">
          {AGROCLOUD_DASHBOARD_THEMES.map(theme => (
            <li key={theme.id}>
              <button
                type="button"
                className={`agrocloud-dashboard-editor__theme-item${config.theme === theme.id ? ' is-selected' : ''}`}
                onClick={() => onConfigChange(prev => ({ ...prev, theme: theme.id }))}
              >
                <span className="agrocloud-dashboard-editor__theme-thumb" aria-hidden>
                  <img
                    src={agroCloudDashboardThemeThumbUrl(theme.id)}
                    alt=""
                    loading="lazy"
                    onError={e => {
                      const img = e.currentTarget
                      if (img.dataset.fallbackApplied) return
                      img.dataset.fallbackApplied = '1'
                      img.src = `https://cdn-a.arcgis.com/dbcdn/1C32912/assets/images/theme-${theme.id}.svg`
                    }}
                  />
                </span>
                <span className="agrocloud-dashboard-editor__theme-label">{theme.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="agrocloud-dashboard-editor__theme-footer">
          <button
            type="button"
            className="agrocloud-dashboard-editor__customize-theme"
            onClick={onOpenThemeCustomize}
          >
            Customize selected theme
          </button>
        </div>
      </PanelShell>
    )
  }

  if (panel === 'themeCustomize') {
    return (
      <PanelShell title="Customize theme" onClose={onClose} className="agrocloud-dashboard-editor__panel--theme-customize">
        <AgroCloudDashboardThemeCustomizePanel
          config={config}
          onConfigChange={onConfigChange}
          onBack={onBackToThemes ?? onClose}
        />
      </PanelShell>
    )
  }

  if (panel === 'timeRegion') {
    return (
      <PanelShell title="Time and region" onClose={onClose} className="agrocloud-dashboard-editor__panel--time-region">
        <AgroCloudDashboardTimeRegionPanel config={config} onConfigChange={onConfigChange} />
      </PanelShell>
    )
  }

  return null
}

export type AgroCloudBuilderPanel = 'view' | 'pages' | 'settings' | 'sharing' | 'folder' | 'badge'

type BuilderPanelsProps = {
  panel: AgroCloudBuilderPanel
  viewTab: AgroCloudViewTab
  onViewTabChange: (tab: AgroCloudViewTab) => void
  config: AgroCloudDashboardConfig
  onConfigChange: Dispatch<SetStateAction<AgroCloudDashboardConfig>>
  onClose: () => void
  onAddElementOption: (kind: AgroCloudDashboardElementKind, label: string) => void
  onRemoveElement: (id: string) => void
  dashboardTitle?: string
}

export function AgroCloudDashboardBuilderPanels({
  panel,
  viewTab,
  onViewTabChange,
  config,
  onConfigChange,
  onClose,
  onAddElementOption,
  onRemoveElement,
  dashboardTitle,
}: BuilderPanelsProps) {
  if (panel === 'view') {
    return (
      <AgroCloudDashboardViewPanel
        viewTab={viewTab}
        onViewTabChange={onViewTabChange}
        config={config}
        dashboardTitle={dashboardTitle}
        onClose={onClose}
        onAddElementOption={onAddElementOption}
        onRemoveElement={onRemoveElement}
        onConfigChange={onConfigChange}
      />
    )
  }

  if (panel === 'pages') {
    return (
      <PanelShell title="Pages" onClose={onClose} className="agrocloud-dashboard-editor__panel--scroll">
        <p className="agrocloud-dashboard-editor__panel-lede">Dashboard uses a single page layout.</p>
        <div className="agrocloud-dashboard-editor__info-box">
          <i className="fa-solid fa-file-lines" aria-hidden />
          <span>Page 1 — {config.elements.length} element{config.elements.length === 1 ? '' : 's'}</span>
        </div>
      </PanelShell>
    )
  }

  if (panel === 'settings') {
    return (
      <PanelShell title="Settings" onClose={onClose} className="agrocloud-dashboard-editor__panel--scroll">
        <div className="agrocloud-dashboard-editor__settings-tab">
          <label className="agrocloud-dashboard-editor__field-label">Theme</label>
          <select
            className="agrocloud-dashboard-editor__select"
            value={config.theme}
            onChange={e => onConfigChange(prev => ({ ...prev, theme: e.target.value }))}
          >
            {AGROCLOUD_DASHBOARD_THEMES.map(t => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="agrocloud-dashboard-editor__radio">
            <input
              type="checkbox"
              checked={config.mobileViewEnabled ?? false}
              onChange={e => onConfigChange(prev => ({ ...prev, mobileViewEnabled: e.target.checked }))}
            />
            <span>Mobile view</span>
          </label>
        </div>
      </PanelShell>
    )
  }

  if (panel === 'sharing') {
    return (
      <PanelShell title="Sharing" onClose={onClose} className="agrocloud-dashboard-editor__panel--scroll">
        <ul className="agrocloud-dashboard-editor__sharing-list">
          {GIS_CONTENT_SHARING_OPTIONS.map(option => (
            <li key={option.id}>
              <button
                type="button"
                className={`agrocloud-dashboard-editor__sharing-item${config.sharing === option.id ? ' is-selected' : ''}`}
                onClick={() => onConfigChange(prev => ({ ...prev, sharing: option.id as GisContentSharing }))}
              >
                <i className={option.icon} aria-hidden />
                <span>{gisSharingLabel(option.id)}</span>
              </button>
            </li>
          ))}
        </ul>
      </PanelShell>
    )
  }

  if (panel === 'folder') {
    const folders = getGisContentPortalFolders().filter(f => f.id !== 'recycle')
    return (
      <PanelShell title="Folder" onClose={onClose} className="agrocloud-dashboard-editor__panel--scroll">
        <label className="agrocloud-dashboard-editor__field-label">Save to folder</label>
        <select
          className="agrocloud-dashboard-editor__select"
          value={config.folderId ?? 'all'}
          onChange={e => onConfigChange(prev => ({ ...prev, folderId: e.target.value }))}
        >
          {folders.map(f => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </PanelShell>
    )
  }

  if (panel === 'badge') {
    return (
      <PanelShell title="Badge" onClose={onClose} className="agrocloud-dashboard-editor__panel--scroll">
        <label className="agrocloud-dashboard-editor__radio">
          <input
            type="checkbox"
            checked={config.badgeEnabled ?? false}
            onChange={e => onConfigChange(prev => ({ ...prev, badgeEnabled: e.target.checked }))}
          />
          <span>Show AgroCloud badge on dashboard</span>
        </label>
      </PanelShell>
    )
  }

  return null
}

export type { AgroCloudDashboardElement }
