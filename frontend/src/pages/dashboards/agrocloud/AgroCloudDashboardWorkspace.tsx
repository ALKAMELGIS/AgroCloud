import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { appAlert, appPrompt } from '../../../lib/appDialog'
import { getGisContentRowById } from '../../../lib/gisContentPortalStore'
import {
  DEFAULT_AGROCLOUD_DASHBOARD_CONFIG,
  type AgroCloudDashboardConfig,
  type AgroCloudDashboardElement,
  type AgroCloudEditorPanel,
  type AgroCloudViewTab,
} from './agroCloudDashboardData'
import { AgroCloudDashboardEditorPanels } from './AgroCloudDashboardEditorPanels'
import { AgroCloudDashboardSaveFlyout } from './AgroCloudDashboardSaveFlyout'
import { DashboardAddElementMenu } from './DashboardAddElementMenu'
import { addDataSourceFromGisContent, duplicateDashboardElement, removeDashboardElement, resizeDashboardElement } from './agroCloudDashboardElements'
import { applyBodyLayoutDropToConfig } from './agroCloudDashboardBodyLayout'
import type { DashboardLayoutDropIntent } from './agroCloudDashboardBodyLayout'
import { loadAgroCloudDashboardConfig, saveAgroCloudDashboardAsApp } from './agroCloudDashboardSave'
import { normalizeDashboardConfig } from './agroCloudDashboardDataSourceEngine'
import { SelectMapFromGisContentModal } from './SelectMapFromGisContentModal'
import { SelectLayerModal } from './SelectLayerModal'
import { ConfigureDataSourceModal } from './ConfigureDataSourceModal'
import { ConfigureMapWidgetModal } from './ConfigureMapWidgetModal'
import { ConfigureIndicatorWidgetModal } from './ConfigureIndicatorWidgetModal'
import { useDashboardAddElementFlow } from './useDashboardAddElementFlow'
import { applyDataSourceReplacement } from './agroCloudDashboardDataSourceEngine'
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
import { AgroCloudDashboardCanvas } from './AgroCloudDashboardCanvas'
import './agro-cloud-dashboards.css'

/** Panel-based dashboard workspace (View, Theme, Data sources, …). */
export default function AgroCloudDashboardWorkspace() {
  const navigate = useNavigate()
  const { dashboardId } = useParams<{ dashboardId?: string }>()
  const [panel, setPanel] = useState<AgroCloudEditorPanel | null>(null)
  const [viewTab, setViewTab] = useState<AgroCloudViewTab>('body')
  const [title, setTitle] = useState('Untitled dashboard')
  const [config, setConfig] = useState<AgroCloudDashboardConfig>(DEFAULT_AGROCLOUD_DASHBOARD_CONFIG)
  const [savedId, setSavedId] = useState<string | undefined>(dashboardId)
  const [addDataSourceOpen, setAddDataSourceOpen] = useState(false)
  const [configureSourceId, setConfigureSourceId] = useState<string | null>(null)
  const [railCollapsed, setRailCollapsed] = useState(true)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const saveWrapRef = useRef<HTMLDivElement>(null)
  const addWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dashboardId) return
    const row = getGisContentRowById(dashboardId)
    if (row) setTitle(row.title)
    const loaded = loadAgroCloudDashboardConfig(dashboardId)
    if (loaded) setConfig(normalizeDashboardConfig(loaded))
    setSavedId(dashboardId)
  }, [dashboardId])

  const openPanel = useCallback((next: AgroCloudEditorPanel) => {
    setSaveMenuOpen(false)
    setAddMenuOpen(false)
    setPanel(prev => {
      if (prev === next) return null
      if (next === 'theme' && prev === 'themeCustomize') return 'theme'
      return next
    })
  }, [])

  const closePanel = useCallback(() => {
    setPanel(null)
  }, [])

  const toggleRailCollapse = useCallback(() => {
    setRailCollapsed(prev => !prev)
  }, [])

  const removeElement = useCallback((elementId: string) => {
    setConfig(prev => removeDashboardElement(prev, elementId))
  }, [])

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

  const {
    pendingAdd,
    selectLayerOpen,
    browseGisOpen,
    mapConfigSession,
    handleElementOptionClick,
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
  })

  const handleElementConfigure = useCallback(
    (elementId: string) => {
      const el = config.elements.find(e => e.id === elementId)
      if (el?.kind === 'map') openMapWidgetConfig(config, elementId)
      else if (el?.kind === 'indicator') openIndicatorWidgetConfig(config, elementId)
    },
    [config, openIndicatorWidgetConfig, openMapWidgetConfig],
  )

  const openAddElementMenu = useCallback(() => {
    setSaveMenuOpen(false)
    setAddMenuOpen(open => !open)
  }, [])

  const onElementOptionClick = useCallback(
    (kind: AgroCloudDashboardElement['kind'], label: string) => {
      setAddMenuOpen(false)
      handleElementOptionClick(kind, label)
    },
    [handleElementOptionClick],
  )

  const handleDataSourceSelected = useCallback((row: GisContentRow) => {
    setConfig(prev => addDataSourceFromGisContent(prev, row))
    setAddDataSourceOpen(false)
  }, [])

  const persist = useCallback(
    (nextTitle?: string, mode: 'save' | 'saveAs' = 'save') => {
      const finalTitle = (nextTitle ?? title).trim() || 'Untitled dashboard'
      setTitle(finalTitle)
      const row = saveAgroCloudDashboardAsApp({
        id: mode === 'saveAs' ? undefined : savedId,
        title: finalTitle,
        config,
      })
      setSavedId(row.id)
      if (mode === 'saveAs' || !dashboardId) {
        navigate(`/dashboard/develop/workspace/${row.id}`, { replace: true })
      }
      return row
    },
    [config, dashboardId, navigate, savedId, title],
  )

  const handleSave = useCallback(() => {
    const row = persist()
    void appAlert(`Dashboard "${row.title}" was saved to GIS Content.`, { title: 'Saved to GIS Content' })
  }, [persist])

  const handleSaveAs = useCallback(async () => {
    const next = await appPrompt('Enter a name for the new dashboard item in GIS Content.', title, {
      title: 'Save as',
    })
    if (!next?.trim()) return
    const row = persist(next.trim(), 'saveAs')
    void appAlert(`Dashboard "${row.title}" was saved to GIS Content.`, { title: 'Saved to GIS Content' })
  }, [persist, title])

  const handleConfigureDataSource = useCallback((gisContentId: string) => {
    setConfigureSourceId(gisContentId)
  }, [])

  const handleDataSourceApplied = useCallback(
    (replacementRow: GisContentRow, draft: Parameters<typeof applyDataSourceReplacement>[3]) => {
      if (!configureSourceId) return
      setConfig(prev => {
        const next = applyDataSourceReplacement(prev, configureSourceId, replacementRow, draft)
        if (savedId) saveAgroCloudDashboardAsApp({ id: savedId, title, config: next })
        return next
      })
      setConfigureSourceId(null)
    },
    [configureSourceId, savedId, title],
  )

  return (
    <div className={`agrocloud-dashboard-editor page page-tight${railCollapsed ? ' is-rail-collapsed' : ''}`}>
      <aside className="agrocloud-dashboard-editor__rail" aria-label="Dashboard tools">
        <div className="agrocloud-dashboard-editor__rail-nav">
          <div className="agrocloud-dashboard-editor__rail-add" ref={addWrapRef}>
            <button
              type="button"
              className={`agrocloud-dashboard-editor__rail-item agrocloud-dashboard-editor__rail-item--add${addMenuOpen ? ' is-active' : ''}`}
              title="Add element"
              aria-label="Add element"
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              onClick={openAddElementMenu}
            >
              <RailAddIcon />
              <span className="agrocloud-dashboard-editor__rail-label">Add element</span>
            </button>
            <DashboardAddElementMenu
              open={addMenuOpen}
              anchorRef={addWrapRef}
              placement="rail"
              onClose={() => setAddMenuOpen(false)}
              onSelect={onElementOptionClick}
            />
          </div>
          <button
            type="button"
            className={`agrocloud-dashboard-editor__rail-item${panel === 'view' ? ' is-active' : ''}`}
            title="View"
            aria-label="View"
            aria-pressed={panel === 'view'}
            onClick={() => openPanel('view')}
          >
            <RailViewIcon />
            <span className="agrocloud-dashboard-editor__rail-label">View</span>
          </button>
          <div className="agrocloud-dashboard-editor__rail-divider" role="presentation" />
          <button
            type="button"
            className={`agrocloud-dashboard-editor__rail-item${panel === 'dataSources' ? ' is-active' : ''}`}
            title="Data sources"
            aria-label="Data sources"
            aria-pressed={panel === 'dataSources'}
            onClick={() => openPanel('dataSources')}
          >
            <RailDataIcon />
            <span className="agrocloud-dashboard-editor__rail-label">Data sources</span>
          </button>
          <button
            type="button"
            className={`agrocloud-dashboard-editor__rail-item${panel === 'theme' || panel === 'themeCustomize' ? ' is-active' : ''}`}
            title="Theme"
            aria-label="Theme"
            aria-pressed={panel === 'theme' || panel === 'themeCustomize'}
            onClick={() => openPanel('theme')}
          >
            <RailThemeIcon />
            <span className="agrocloud-dashboard-editor__rail-label">Theme</span>
          </button>
          <button
            type="button"
            className={`agrocloud-dashboard-editor__rail-item${panel === 'timeRegion' ? ' is-active' : ''}`}
            title="Time and region"
            aria-label="Time and region"
            aria-pressed={panel === 'timeRegion'}
            onClick={() => openPanel('timeRegion')}
          >
            <RailTimeRegionIcon />
            <span className="agrocloud-dashboard-editor__rail-label">Time and region</span>
          </button>
          <div className="agrocloud-dashboard-editor__rail-save" ref={saveWrapRef}>
            <button
              type="button"
              className={`agrocloud-dashboard-editor__rail-item agrocloud-dashboard-editor__rail-item--save${saveMenuOpen ? ' is-active' : ''}`}
              title="Save"
              aria-label="Save"
              aria-haspopup="menu"
              aria-expanded={saveMenuOpen}
              onClick={() => setSaveMenuOpen(open => !open)}
            >
              <RailSaveIcon />
              <span className="agrocloud-dashboard-editor__rail-label">Save</span>
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
          className="agrocloud-dashboard-editor__rail-toggle"
          title={railCollapsed ? 'Expand' : 'Collapse'}
          aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!railCollapsed}
          onClick={toggleRailCollapse}
        >
          {railCollapsed ? (
            <RailChevronRightIcon />
          ) : (
            <>
              <RailChevronLeftIcon />
              <span className="agrocloud-dashboard-editor__rail-toggle-label">Collapse</span>
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
          onClose={closePanel}
          onAddElementOption={onElementOptionClick}
          onRemoveElement={removeElement}
          onOpenAddPanel={openAddElementMenu}
          onOpenThemeCustomize={() => setPanel('themeCustomize')}
          onBackToThemes={() => setPanel('theme')}
          onConfigureDataSource={handleConfigureDataSource}
          onAddDataSource={() => setAddDataSourceOpen(true)}
          dashboardTitle={title}
        />
      ) : null}

      <AgroCloudDashboardCanvas
        config={config}
        title={title}
        onElementSelect={onElementOptionClick}
        editMode
        onElementConfigure={handleElementConfigure}
        onElementDuplicate={handleElementDuplicate}
        onElementDelete={removeElement}
        onElementResize={handleElementResize}
        onLayoutDrop={handleLayoutDrop}
        className="agrocloud-dashboard-editor__canvas-area"
      />

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
