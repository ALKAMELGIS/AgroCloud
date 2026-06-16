import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { appAlert, appPrompt } from '../../../lib/appDialog'
import { getGisContentRowById } from '../../../lib/gisContentPortalStore'
import {
  AGROCLOUD_PRODUCT_NAME,
  DEFAULT_AGROCLOUD_DASHBOARD_CONFIG,
  type AgroCloudDashboardConfig,
  type AgroCloudDashboardElement,
  type AgroCloudEditorPanel,
  type AgroCloudViewTab,
} from './agroCloudDashboardData'
import { loadAgroCloudDashboardConfig, saveAgroCloudDashboardAsApp } from './agroCloudDashboardSave'
import { AgroCloudDashboardEditorPanels } from './AgroCloudDashboardEditorPanels'
import { AgroCloudDashboardSaveFlyout } from './AgroCloudDashboardSaveFlyout'
import { DashboardAddElementMenu } from './DashboardAddElementMenu'
import { AgroCloudDashboardCanvas } from './AgroCloudDashboardCanvas'
import { addDataSourceFromGisContent, duplicateDashboardElement, removeDashboardElement, resizeDashboardElement } from './agroCloudDashboardElements'
import { applyBodyLayoutDropToConfig } from './agroCloudDashboardBodyLayout'
import type { DashboardLayoutDropIntent } from './agroCloudDashboardBodyLayout'
import { SelectMapFromGisContentModal } from './SelectMapFromGisContentModal'
import { SelectLayerModal } from './SelectLayerModal'
import { ConfigureDataSourceModal } from './ConfigureDataSourceModal'
import { ConfigureMapWidgetModal } from './ConfigureMapWidgetModal'
import { ConfigureIndicatorWidgetModal } from './ConfigureIndicatorWidgetModal'
import { applyDataSourceReplacement, normalizeDashboardConfig } from './agroCloudDashboardDataSourceEngine'
import { useDashboardAddElementFlow } from './useDashboardAddElementFlow'
import { AgroCloudDashboardAppMenu } from './AgroCloudDashboardAppMenu'
import {
  RailAddIcon,
  RailChevronLeftIcon,
  RailChevronRightIcon,
  RailDataIcon,
  RailSaveIcon,
  RailThemeIcon,
  RailTimeRegionIcon,
  RailViewIcon,
} from './AgroCloudDashboardRailIcons'
import type { GisContentRow } from '../../master/gisContentPortalData'
import './agro-cloud-dashboards.css'

function BuilderIllustration() {
  return (
    <svg
      className="agrocloud-dashboard-builder__illustration"
      viewBox="0 0 320 200"
      width="272"
      height="170"
      aria-hidden
    >
      <circle cx="58" cy="52" r="22" fill="none" stroke="#c8c6c4" strokeWidth="3" />
      <path d="M58 38v14M51 45h14" stroke="#2e7d32" strokeWidth="3" strokeLinecap="round" />
      <rect x="98" y="28" width="88" height="56" rx="4" fill="#f3f2f1" stroke="#c8c6c4" strokeWidth="1.5" />
      <rect x="108" y="58" width="14" height="18" fill="#2e7d32" rx="1" />
      <rect x="126" y="48" width="14" height="28" fill="#66bb6a" rx="1" />
      <rect x="144" y="52" width="14" height="24" fill="#2e7d32" rx="1" />
      <rect x="162" y="44" width="14" height="32" fill="#66bb6a" rx="1" />
      <polyline
        points="210,78 232,58 252,66 278,38"
        fill="none"
        stroke="#2e7d32"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="210" cy="78" r="4" fill="#2e7d32" />
      <circle cx="232" cy="58" r="4" fill="#66bb6a" />
      <circle cx="252" cy="66" r="4" fill="#2e7d32" />
      <circle cx="278" cy="38" r="4" fill="#66bb6a" />
      <path d="M40 120h240" stroke="#edebe9" strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx="160" cy="150" r="18" fill="none" stroke="#c8c6c4" strokeWidth="2" />
      <path
        d="M152 150h16M160 142v16"
        stroke="#2e7d32"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  )
}

/** Empty-state dashboard builder shell (AgroCloud). */
export default function AgroCloudDashboardBuilder() {
  const navigate = useNavigate()
  const { dashboardId } = useParams<{ dashboardId?: string }>()
  const [title, setTitle] = useState('Untitled dashboard')
  const [config, setConfig] = useState<AgroCloudDashboardConfig>(DEFAULT_AGROCLOUD_DASHBOARD_CONFIG)
  const [emptyAddMenuOpen, setEmptyAddMenuOpen] = useState(false)
  const [sidebarAddMenuOpen, setSidebarAddMenuOpen] = useState(false)
  const [panel, setPanel] = useState<AgroCloudEditorPanel | null>(null)
  const [viewTab, setViewTab] = useState<AgroCloudViewTab>('body')
  const [addDataSourceOpen, setAddDataSourceOpen] = useState(false)
  const [configureSourceId, setConfigureSourceId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const saveWrapRef = useRef<HTMLDivElement>(null)
  const sidebarAddWrapRef = useRef<HTMLDivElement>(null)
  const emptyAddWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dashboardId) {
      navigate('/dashboard/develop/create', { replace: true })
      return
    }
    const row = getGisContentRowById(dashboardId)
    if (row) setTitle(row.title)
    const loaded = loadAgroCloudDashboardConfig(dashboardId)
    if (loaded) {
      setConfig(normalizeDashboardConfig(loaded))
      if (loaded.elements.length > 0) {
        navigate(`/dashboard/develop/workspace/${dashboardId}`, { replace: true })
      }
    }
  }, [dashboardId, navigate])

  const titleInitial = title.trim().charAt(0).toUpperCase() || 'N'

  const persist = useCallback(
    (nextTitle?: string, mode: 'save' | 'saveAs' = 'save') => {
      if (!dashboardId && mode === 'save') return null
      const finalTitle = (nextTitle ?? title).trim() || 'Untitled dashboard'
      setTitle(finalTitle)
      const row = saveAgroCloudDashboardAsApp({
        id: mode === 'saveAs' ? undefined : dashboardId,
        title: finalTitle,
        config,
      })
      if (mode === 'saveAs') {
        navigate(`/dashboard/develop/workspace/${row.id}`)
      }
      return row
    },
    [config, dashboardId, navigate, title],
  )

  const handleSave = useCallback(() => {
    const row = persist()
    if (row) {
      void appAlert(`Dashboard "${row.title}" was saved to GIS Content.`, { title: 'Saved to GIS Content' })
    }
  }, [persist])

  const handleSaveAs = useCallback(async () => {
    const next = await appPrompt('Enter a name for the new dashboard item in GIS Content.', title, {
      title: 'Save as',
    })
    if (!next?.trim()) return
    const row = persist(next.trim(), 'saveAs')
    if (row) {
      void appAlert(`Dashboard "${row.title}" was saved to GIS Content.`, { title: 'Saved to GIS Content' })
    }
  }, [persist, title])

  const openPanel = useCallback((next: AgroCloudEditorPanel) => {
    setEmptyAddMenuOpen(false)
    setSidebarAddMenuOpen(false)
    setSaveMenuOpen(false)
    setPanel(prev => {
      if (prev === next) return null
      if (next === 'theme' && prev === 'themeCustomize') return 'theme'
      return next
    })
  }, [])

  const persistAndGoWorkspace = useCallback(
    (nextConfig: AgroCloudDashboardConfig) => {
      if (!dashboardId) return
      saveAgroCloudDashboardAsApp({ id: dashboardId, title, config: nextConfig })
      navigate(`/dashboard/develop/workspace/${dashboardId}`)
    },
    [dashboardId, navigate, title],
  )

  const {
    pendingAdd,
    selectLayerOpen,
    browseGisOpen,
    mapConfigSession,
    handleElementOptionClick: addElementFlow,
    handleLayerSelected,
    handleBrowseGisSelected,
    cancelAddFlow,
    openBrowseGis,
    closeBrowseGis,
    handleNewDataExpression,
    openMapWidgetConfig,
    commitMapWidgetConfig,
    cancelMapWidgetConfig,
    indicatorConfigElementId,
    openIndicatorWidgetConfig,
    commitIndicatorWidgetConfig,
    cancelIndicatorWidgetConfig,
  } = useDashboardAddElementFlow({
    setConfig,
    onAfterAdd: persistAndGoWorkspace,
  })

  const handleElementOptionClick = useCallback(
    (kind: AgroCloudDashboardElement['kind'], label: string) => {
      setEmptyAddMenuOpen(false)
      setSidebarAddMenuOpen(false)
      addElementFlow(kind, label)
    },
    [addElementFlow],
  )

  const removeElement = useCallback((elementId: string) => {
    setConfig(prev => removeDashboardElement(prev, elementId))
  }, [])

  const handleElementConfigure = useCallback(
    (elementId: string) => {
      const el = config.elements.find(e => e.id === elementId)
      if (el?.kind === 'map') openMapWidgetConfig(config, elementId)
      else if (el?.kind === 'indicator') openIndicatorWidgetConfig(config, elementId)
    },
    [config, openIndicatorWidgetConfig, openMapWidgetConfig],
  )

  const handleElementDuplicate = useCallback((elementId: string) => {
    setConfig(prev => duplicateDashboardElement(prev, elementId))
  }, [])

  const handleElementResize = useCallback((elementId: string, size: { width?: number; height?: number }) => {
    setConfig(prev => resizeDashboardElement(prev, elementId, size))
  }, [])

  const handleLayoutDrop = useCallback(
    (draggedElementId: string, targetElementId: string, intent: DashboardLayoutDropIntent) => {
      setConfig(prev => applyBodyLayoutDropToConfig(prev, draggedElementId, targetElementId, intent))
    },
    [],
  )

  const handleDataSourceSelected = useCallback(
    (row: GisContentRow) => {
      const next = addDataSourceFromGisContent(config, row)
      setConfig(next)
      setAddDataSourceOpen(false)
      if (dashboardId) saveAgroCloudDashboardAsApp({ id: dashboardId, title, config: next })
    },
    [config, dashboardId, title],
  )

  const handleConfigureDataSource = useCallback((gisContentId: string) => {
    setConfigureSourceId(gisContentId)
  }, [])

  const handleDataSourceApplied = useCallback(
    (replacementRow: GisContentRow, draft: Parameters<typeof applyDataSourceReplacement>[3]) => {
      if (!configureSourceId) return
      setConfig(prev => applyDataSourceReplacement(prev, configureSourceId, replacementRow, draft))
      setConfigureSourceId(null)
    },
    [configureSourceId],
  )

  const openSidebarAddMenu = useCallback(() => {
    setSaveMenuOpen(false)
    setSidebarAddMenuOpen(open => !open)
  }, [])

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

  return (
    <div className={`agrocloud-dashboard-builder page page-tight${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <header className="agrocloud-dashboard-builder__topnav">
        <div className="agrocloud-dashboard-builder__brand">
          <AgroCloudDashboardAppMenu dashboardId={dashboardId} />
          <span className="agrocloud-dashboard-builder__brand-icon" aria-hidden>
            <i className="fa-solid fa-chart-column" />
          </span>
          <span className="agrocloud-dashboard-builder__brand-name">{AGROCLOUD_PRODUCT_NAME}</span>
          <span className="agrocloud-dashboard-builder__brand-letter">{titleInitial}</span>
        </div>
      </header>

      <div className="agrocloud-dashboard-builder__shell">
        <aside className="agrocloud-dashboard-builder__sidebar" aria-label="Dashboard navigation">
          <div className="agrocloud-dashboard-builder__sidebar-nav">
            <div className="agrocloud-dashboard-builder__sidebar-add" ref={sidebarAddWrapRef}>
              <button
                type="button"
                className={`agrocloud-dashboard-builder__sidebar-item agrocloud-dashboard-builder__sidebar-item--add${sidebarAddMenuOpen ? ' is-active' : ''}`}
                title="Add element"
                aria-label="Add element"
                aria-haspopup="menu"
                aria-expanded={sidebarAddMenuOpen}
                onClick={openSidebarAddMenu}
              >
                <RailAddIcon />
                <span className="agrocloud-dashboard-builder__sidebar-label">Add element</span>
              </button>
              <DashboardAddElementMenu
                open={sidebarAddMenuOpen}
                anchorRef={sidebarAddWrapRef}
                placement="rail"
                onClose={() => setSidebarAddMenuOpen(false)}
                onSelect={handleElementOptionClick}
              />
            </div>
            <button
              type="button"
              className={`agrocloud-dashboard-builder__sidebar-item${panel === 'view' ? ' is-active' : ''}`}
              title="View"
              aria-label="View"
              aria-pressed={panel === 'view'}
              onClick={() => openPanel('view')}
            >
              <RailViewIcon />
              <span className="agrocloud-dashboard-builder__sidebar-label">View</span>
            </button>
            <div className="agrocloud-dashboard-builder__sidebar-divider" role="presentation" />
            <button
              type="button"
              className={`agrocloud-dashboard-builder__sidebar-item${panel === 'dataSources' ? ' is-active' : ''}`}
              title="Data sources"
              aria-label="Data sources"
              aria-pressed={panel === 'dataSources'}
              onClick={() => openPanel('dataSources')}
            >
              <RailDataIcon />
              <span className="agrocloud-dashboard-builder__sidebar-label">Data sources</span>
            </button>
            <button
              type="button"
              className={`agrocloud-dashboard-builder__sidebar-item${panel === 'theme' || panel === 'themeCustomize' ? ' is-active' : ''}`}
              title="Theme"
              aria-label="Theme"
              aria-pressed={panel === 'theme' || panel === 'themeCustomize'}
              onClick={() => openPanel('theme')}
            >
              <RailThemeIcon />
              <span className="agrocloud-dashboard-builder__sidebar-label">Theme</span>
            </button>
            <button
              type="button"
              className={`agrocloud-dashboard-builder__sidebar-item${panel === 'timeRegion' ? ' is-active' : ''}`}
              title="Time and region"
              aria-label="Time and region"
              aria-pressed={panel === 'timeRegion'}
              onClick={() => openPanel('timeRegion')}
            >
              <RailTimeRegionIcon />
              <span className="agrocloud-dashboard-builder__sidebar-label">Time and region</span>
            </button>
            <div className="agrocloud-dashboard-builder__sidebar-save" ref={saveWrapRef}>
              <button
                type="button"
                className={`agrocloud-dashboard-builder__sidebar-item${saveMenuOpen ? ' is-active' : ''}`}
                title="Save"
                aria-label="Save"
                aria-haspopup="menu"
                aria-expanded={saveMenuOpen}
                onClick={() => setSaveMenuOpen(open => !open)}
              >
                <RailSaveIcon />
                <span className="agrocloud-dashboard-builder__sidebar-label">Save</span>
              </button>
              <AgroCloudDashboardSaveFlyout
                open={saveMenuOpen}
                anchorRef={saveWrapRef}
                onClose={() => setSaveMenuOpen(false)}
                onSave={handleSave}
                onSaveAs={handleSaveAs}
              />
            </div>
          </div>
          <button
            type="button"
            className="agrocloud-dashboard-builder__sidebar-toggle"
            title={sidebarCollapsed ? 'Expand' : 'Collapse'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebarCollapse}
          >
            {sidebarCollapsed ? (
              <RailChevronRightIcon />
            ) : (
              <>
                <RailChevronLeftIcon />
                <span className="agrocloud-dashboard-builder__sidebar-toggle-label">Collapse</span>
              </>
            )}
          </button>
        </aside>

        {panel ? (
          <AgroCloudDashboardEditorPanels
            panel={panel}
            viewTab={viewTab}
            onViewTabChange={setViewTab}
            config={config}
            onConfigChange={setConfig}
            onClose={() => setPanel(null)}
            onAddElementOption={handleElementOptionClick}
            onRemoveElement={removeElement}
            onOpenAddPanel={openSidebarAddMenu}
            onOpenThemeCustomize={() => setPanel('themeCustomize')}
            onBackToThemes={() => setPanel('theme')}
            onConfigureDataSource={handleConfigureDataSource}
            onAddDataSource={() => setAddDataSourceOpen(true)}
            dashboardTitle={title}
          />
        ) : null}

        <main className="agrocloud-dashboard-builder__main">
          {config.elements.length > 0 ? (
            <AgroCloudDashboardCanvas
              config={config}
              title={title}
              onElementSelect={handleElementOptionClick}
              editMode
              onElementConfigure={handleElementConfigure}
              onElementDuplicate={handleElementDuplicate}
              onElementDelete={removeElement}
              onElementResize={handleElementResize}
              onLayoutDrop={handleLayoutDrop}
              className="agrocloud-dashboard-builder__canvas"
            />
          ) : (
          <div className="agrocloud-dashboard-builder__empty">
            <BuilderIllustration />
            <h1>Visualize, monitor, and share information</h1>
            <p>
              Click the button below to start building your dashboard. Need some inspiration first? Check out the links
              below.
            </p>
            <div className="agrocloud-dashboard-add-wrap agrocloud-dashboard-builder__add-wrap" ref={emptyAddWrapRef}>
              <button
                type="button"
                className={`agrocloud-dashboard-add-circle${emptyAddMenuOpen ? ' is-open' : ''}`}
                aria-label="Add dashboard element"
                aria-haspopup="menu"
                aria-expanded={emptyAddMenuOpen}
                onClick={() => setEmptyAddMenuOpen(open => !open)}
              >
                <i className="fa-solid fa-plus" aria-hidden />
              </button>
              <DashboardAddElementMenu
                open={emptyAddMenuOpen}
                anchorRef={emptyAddWrapRef}
                placement="below"
                onClose={() => setEmptyAddMenuOpen(false)}
                onSelect={handleElementOptionClick}
              />
            </div>
            <nav className="agrocloud-dashboard-builder__links" aria-label="Helpful resources">
              <a href="https://doc.arcgis.com/en/dashboards/" target="_blank" rel="noopener noreferrer">
                Read documentation
              </a>
              <a href="https://learn.arcgis.com/en/projects/create-a-dashboard/" target="_blank" rel="noopener noreferrer">
                Learn how to create a dashboard
              </a>
              <button type="button" onClick={() => navigate('/dashboard/develop')}>
                Dashboards gallery
              </button>
            </nav>
          </div>
          )}
        </main>
      </div>

      <SelectLayerModal
        open={selectLayerOpen}
        widgetKind={pendingAdd?.kind ?? null}
        config={config}
        onClose={cancelAddFlow}
        onSelectLayer={handleLayerSelected}
        onBrowseAllLayers={openBrowseGis}
        onNewDataExpression={handleNewDataExpression}
      />

      <SelectMapFromGisContentModal
        open={browseGisOpen}
        title="Browse all layers"
        webMapsOnly={pendingAdd?.kind === 'map'}
        onClose={closeBrowseGis}
        onSelect={handleBrowseGisSelected}
      />

      <SelectMapFromGisContentModal
        open={addDataSourceOpen}
        onClose={() => setAddDataSourceOpen(false)}
        onSelect={handleDataSourceSelected}
        title="Select a data source"
      />

      <ConfigureDataSourceModal
        open={Boolean(configureSourceId)}
        gisContentId={configureSourceId}
        onClose={() => setConfigureSourceId(null)}
        onApply={handleDataSourceApplied}
      />

      <ConfigureMapWidgetModal
        open={Boolean(mapConfigSession)}
        row={mapConfigSession?.row ?? null}
        initialSettings={mapConfigSession?.initialSettings ?? null}
        onClose={cancelMapWidgetConfig}
        onDone={commitMapWidgetConfig}
      />

      <ConfigureIndicatorWidgetModal
        open={Boolean(indicatorConfigElementId)}
        config={config}
        elementId={indicatorConfigElementId}
        onClose={cancelIndicatorWidgetConfig}
        onDone={commitIndicatorWidgetConfig}
      />
    </div>
  )
}
