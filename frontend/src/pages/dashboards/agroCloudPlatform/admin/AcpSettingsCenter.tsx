import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { getBasemapThumbnail, listEsriBasemapEntries, resolveBasemapId } from '../../../satellite/basemapCatalog'
import type { CropAlertEngineSettings, CropAlertIndexId, CropAlertTypeId } from '../../../../lib/siCropAlertEngine'
import { applyCropAlertEngineDefaultOperatingState } from '../../../../lib/siCropAlertEngine'
import { SI_DEFAULT_LIVE_WMS_LAYER } from '../../../../lib/sentinelHubWmsLayers'
import { GisMapBrowseLayersPane } from '../../../satellite/components/GisMapBrowseLayersPane'
import type { GisContentRow } from '../../../master/gisContentPortalData'
import {
  getGisContentMapRegistry,
  getGisContentRowById,
  isGisContentRowInRecycle,
  useGisContentPortal,
} from '../../../../lib/gisContentPortalStore'
import { isAgroStructuresPortalRow } from '../../../../lib/gisHostedFeatureLayerPortal'
import { resolveAgroStructuresCountryLabel } from '../../../../lib/agroStructuresPrimaryAoi'
import {
  DEFAULT_ACP_PLATFORM_CONFIG,
  type AcpMapToolbarConfig,
  type AcpPlatformConfig,
} from '../acpPlatformConfig'
import { buildAcpLayerVisibilityFromDefaults, type AcpCoreMapLayerKey, type AcpMapLayerVisibility } from '../acpMapLayerVisibility'
import { useAcpPlatform } from '../acpPlatformContext'
import { addAcpGisPortalRowToMap } from '../map/acpGisPortalActions'
import { isAcpExcludedPortalMapRow } from '../map/acpPortalMapLayers'
import {
  buildAcpSettingsBundle,
  downloadAcpSettingsBundle,
  parseAcpSettingsBundle,
  pingGeodashApi,
  resolveGeodashApiBase,
} from '../acpSettingsBundle'

type TabId = 'general' | 'map' | 'wms' | 'data' | 'gis' | 'alert' | 'panels'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'map', label: 'Map & Layers' },
  { id: 'wms', label: 'Imagery (WMS)' },
  { id: 'data', label: 'Data & Refresh' },
  { id: 'gis', label: 'GIS Content' },
  { id: 'alert', label: 'Alerts' },
  { id: 'panels', label: 'Panels & KPI' },
]

const INDEX_OPTIONS: CropAlertIndexId[] = ['NDVI', 'NDWI', 'NDMI', 'EVI']

const ALERT_TYPE_OPTIONS: Array<{ id: CropAlertTypeId; label: string }> = [
  { id: 'crop-stress', label: 'Crop Stress' },
  { id: 'water-stress', label: 'Water Stress' },
  { id: 'drought-risk', label: 'Drought Risk' },
  { id: 'disease-risk', label: 'Disease Risk' },
  { id: 'harvest-readiness', label: 'Harvest Readiness' },
  { id: 'irrigation-required', label: 'Irrigation Required' },
  { id: 'vegetation-recovery', label: 'Vegetation Recovery' },
]

const CHART_SERIES_OPTIONS: Array<{ id: 'ndvi' | 'chas' | 'ndmi'; label: string }> = [
  { id: 'ndvi', label: 'NDVI' },
  { id: 'chas', label: 'CHAS' },
  { id: 'ndmi', label: 'NDMI' },
]

const CORE_LAYER_OPTIONS: Array<{ key: AcpCoreMapLayerKey; label: string; locked?: boolean }> = [
  { key: 'aoi', label: 'AOI / Agro Structures' },
  { key: 'sentinelWms', label: 'Sentinel WMS overlay' },
  { key: 'liveAlertTicker', label: 'Live Alert · ticker bar (always on)', locked: true },
  { key: 'weatherAlerts', label: 'Weather · map markers & AOI' },
  { key: 'liveChas', label: 'Live Alerts · map markers' },
]

const MAP_TOOLBAR_OPTIONS: Array<{ key: keyof AcpMapToolbarConfig; label: string; locked?: boolean }> = [
  { key: 'search', label: 'Search (always on)', locked: true },
  { key: 'addData', label: 'Add data (always on)', locked: true },
  { key: 'legend', label: 'Legend' },
  { key: 'home', label: 'Home / extent' },
  { key: 'layers', label: 'Layers' },
  { key: 'basemap', label: 'Basemap' },
  { key: 'timeSeries', label: 'Time series' },
  { key: 'weather', label: 'Weather Intelligence (map toggle)' },
  { key: 'view3d', label: '2D / 3D map view' },
]

export function AcpSettingsCenter() {
  const acp = useAcpPlatform()
  const portal = useGisContentPortal()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<TabId>('general')
  const [draftConfig, setDraftConfig] = useState<AcpPlatformConfig>(() => acp.config)
  const [draftAlerts, setDraftAlerts] = useState<CropAlertEngineSettings>(() => acp.alertSettings)
  const [draftLayerVisibility, setDraftLayerVisibility] = useState<AcpMapLayerVisibility>(() => acp.layerVisibility)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [gisStatus, setGisStatus] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [geodashStatus, setGeodashStatus] = useState<string | null>(null)
  const [geodashTesting, setGeodashTesting] = useState(false)

  const basemapEntries = useMemo(() => listEsriBasemapEntries(), [])
  const activeBasemapId = resolveBasemapId(draftConfig.basemapId)
  const registry = useMemo(
    () => getGisContentMapRegistry(),
    [portal.version, acp.portalLayerCount],
  )

  const countryOptions = useMemo(() => {
    const codes = new Set<string>()
    for (const row of acp.scopedFieldRows) {
      if (row.countryCode && row.countryCode !== '—') codes.add(row.countryCode)
    }
    const sorted = [...codes].sort((a, b) =>
      resolveAgroStructuresCountryLabel(a).localeCompare(resolveAgroStructuresCountryLabel(b), undefined, {
        sensitivity: 'base',
      }),
    )
    return [
      { value: 'all', label: 'All countries' },
      ...sorted.map(code => ({
        value: code,
        label: resolveAgroStructuresCountryLabel(code),
      })),
    ]
  }, [acp.scopedFieldRows])

  const portalLayerRows = useMemo(() => {
    return registry.activeItemIds
      .map(id => getGisContentRowById(id))
      .filter((row): row is GisContentRow => Boolean(row))
      .filter(row => !isGisContentRowInRecycle(row) && !isAcpExcludedPortalMapRow(row))
  }, [registry.activeItemIds])

  const sortedKpiCards = useMemo(
    () => [...draftConfig.kpiCards].sort((a, b) => a.order - b.order),
    [draftConfig.kpiCards],
  )

  useEffect(() => {
    if (!acp.settingsOpen) return
    setDraftConfig(acp.config)
    setDraftAlerts(acp.alertSettings)
    setDraftLayerVisibility(acp.layerVisibility)
    setTab('general')
    setImportStatus(null)
    setGeodashStatus(null)
    // Sync draft state when the settings modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acp.settingsOpen])

  const patchDraftConfig = useCallback((patch: Partial<AcpPlatformConfig>) => {
    setDraftConfig(prev => ({ ...prev, ...patch }))
  }, [])

  const setDraftCoreLayerVisible = useCallback(
    (key: AcpCoreMapLayerKey, visible: boolean) => {
      if (key === 'liveAlertTicker') return
      setDraftLayerVisibility(prev => ({ ...prev, [key]: visible }))
      acp.setCoreLayerVisible(key, visible)
    },
    [acp],
  )

  const setDraftPortalLayerVisible = useCallback(
    (layerId: string, visible: boolean) => {
      setDraftLayerVisibility(prev => ({
        ...prev,
        portal: { ...prev.portal, [layerId]: visible },
      }))
      acp.setPortalLayerVisible(layerId, visible)
      const row = getGisContentRowById(layerId)
      if (row && isAgroStructuresPortalRow(row)) acp.setCoreLayerVisible('aoi', visible)
    },
    [acp],
  )

  const onAddRow = useCallback(
    (row: GisContentRow) => {
      setAddingId(row.id)
      setGisStatus(null)
      void (async () => {
        try {
          const result = await addAcpGisPortalRowToMap(row)
          if (result.isAgroStructures) acp.refreshEngine()
          else if (result.geojson) acp.mapFocusGeoJsonRef.current?.(result.geojson)
          setGisStatus(result.message)
        } catch (err) {
          setGisStatus(err instanceof Error ? err.message : `Failed to add "${row.title}".`)
        } finally {
          setAddingId(null)
        }
      })()
    },
    [acp],
  )

  const handleReset = useCallback(() => {
    setDraftConfig({ ...DEFAULT_ACP_PLATFORM_CONFIG })
    setDraftAlerts(applyCropAlertEngineDefaultOperatingState())
    setDraftLayerVisibility(
      buildAcpLayerVisibilityFromDefaults(
        DEFAULT_ACP_PLATFORM_CONFIG.defaultLayerVisibility,
        DEFAULT_ACP_PLATFORM_CONFIG.defaultPortalLayerVisibility,
      ),
    )
    setImportStatus(null)
    setGeodashStatus(null)
  }, [])

  const handleSave = useCallback(() => {
    const portalDefaults = { ...draftLayerVisibility.portal }
    const configToSave: AcpPlatformConfig = {
      ...draftConfig,
      defaultLayerVisibility: {
        aoi: draftLayerVisibility.aoi,
        sentinelWms: draftLayerVisibility.sentinelWms,
        liveChas: draftLayerVisibility.liveChas,
        liveAlertTicker: true,
        weatherAlerts: draftLayerVisibility.weatherAlerts,
      },
      defaultPortalLayerVisibility: portalDefaults,
    }
    acp.setConfig(configToSave)
    acp.setAlertSettings(draftAlerts)
    acp.setScopeMode(configToSave.mapScopeMode)
    acp.setAutoFollowDate(configToSave.defaultAutoFollowDate)
    acp.setCountryFilter(configToSave.defaultCountryFilter || 'all')
    acp.setSelectedWmsLayer(configToSave.wmsLayerName || SI_DEFAULT_LIVE_WMS_LAYER)
    acp.commitWmsLayer({
      layerId: configToSave.wmsLayerName,
      cloudCoverage: configToSave.cloudCoverage,
    })
    for (const { key } of CORE_LAYER_OPTIONS) {
      acp.setCoreLayerVisible(key, draftLayerVisibility[key])
    }
    for (const row of portalLayerRows) {
      const visible = draftLayerVisibility.portal[row.id] !== false
      acp.setPortalLayerVisible(row.id, visible)
      if (isAgroStructuresPortalRow(row)) acp.setCoreLayerVisible('aoi', visible)
    }
    acp.refreshWmsLayer()
    acp.refreshEngine()
    acp.setSettingsOpen(false)
  }, [acp, draftConfig, draftAlerts, draftLayerVisibility, portalLayerRows])

  const saveLayerDefaults = useCallback(() => {
    patchDraftConfig({
      defaultLayerVisibility: {
        aoi: draftLayerVisibility.aoi,
        sentinelWms: draftLayerVisibility.sentinelWms,
        liveChas: draftLayerVisibility.liveChas,
        liveAlertTicker: true,
        weatherAlerts: draftLayerVisibility.weatherAlerts,
      },
    })
    acp.saveCurrentLayerDefaultsToConfig()
  }, [acp, draftLayerVisibility, patchDraftConfig])

  const savePortalLayerDefaults = useCallback(() => {
    const portalDefaults = acp.saveCurrentPortalLayerDefaultsToConfig()
    patchDraftConfig({ defaultPortalLayerVisibility: portalDefaults })
  }, [acp, patchDraftConfig])

  const handleExport = useCallback(() => {
    const bundle = buildAcpSettingsBundle(draftConfig, draftAlerts)
    downloadAcpSettingsBundle(bundle)
    setImportStatus('Settings exported.')
  }, [draftConfig, draftAlerts])

  const handleImportFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const bundle = parseAcpSettingsBundle(String(reader.result ?? ''))
        setDraftConfig(bundle.config)
        setDraftAlerts(bundle.alertSettings)
        setDraftLayerVisibility(
          buildAcpLayerVisibilityFromDefaults(
            bundle.config.defaultLayerVisibility,
            bundle.config.defaultPortalLayerVisibility,
          ),
        )
        setImportStatus('Settings imported — click Save & Apply to persist.')
      } catch (err) {
        setImportStatus(err instanceof Error ? err.message : 'Import failed.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }, [])

  const testGeodash = useCallback(() => {
    setGeodashTesting(true)
    setGeodashStatus(null)
    const base = resolveGeodashApiBase(draftConfig.geodashApiUrl)
    void pingGeodashApi(base).then(result => {
      setGeodashStatus(result.ok ? `OK: ${result.message}` : `Failed: ${result.message}`)
      setGeodashTesting(false)
    })
  }, [draftConfig.geodashApiUrl])

  const moveKpiCard = useCallback((id: string, direction: -1 | 1) => {
    setDraftConfig(prev => {
      const sorted = [...prev.kpiCards].sort((a, b) => a.order - b.order)
      const index = sorted.findIndex(card => card.id === id)
      const swapIndex = index + direction
      if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return prev
      const next = sorted.map(card => ({ ...card }))
      const orderA = next[index].order
      next[index] = { ...next[index], order: next[swapIndex].order }
      next[swapIndex] = { ...next[swapIndex], order: orderA }
      return { ...prev, kpiCards: next }
    })
  }, [])

  if (!acp.settingsOpen) return null

  return (
    <div className="acp-settings" role="dialog" aria-modal="true">
      <div className="acp-settings__backdrop" onClick={() => acp.setSettingsOpen(false)} />
      <div className="acp-settings__modal">
        <header className="acp-settings__head">
          <h2>AgroCloud Platform Settings</h2>
          <button type="button" onClick={() => acp.setSettingsOpen(false)} aria-label="Close">
            <i className="fa-solid fa-xmark" />
          </button>
        </header>
        <nav className="acp-settings__tabs">
          {TABS.map(t => (
            <button key={t.id} type="button" className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="acp-settings__body">
          {tab === 'general' ? (
            <div className="acp-settings__form">
              <label>
                Dashboard title
                <input
                  type="text"
                  value={draftConfig.title}
                  onChange={e => patchDraftConfig({ title: e.target.value })}
                />
              </label>
              <label>
                Default map scope
                <select
                  value={draftConfig.mapScopeMode}
                  onChange={e =>
                    patchDraftConfig({ mapScopeMode: e.target.value as AcpPlatformConfig['mapScopeMode'] })
                  }
                >
                  <option value="viewport">Viewport</option>
                  <option value="global">Global</option>
                  <option value="selection">Selection</option>
                </select>
              </label>
              <label>
                Default country filter
                <select
                  value={draftConfig.defaultCountryFilter}
                  onChange={e => patchDraftConfig({ defaultCountryFilter: e.target.value })}
                >
                  {countryOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="acp-settings__check">
                <input
                  type="checkbox"
                  checked={draftConfig.defaultAutoFollowDate}
                  onChange={e => patchDraftConfig({ defaultAutoFollowDate: e.target.checked })}
                />
                Default auto-follow analysis date
              </label>
            </div>
          ) : null}

          {tab === 'map' ? (
            <div className="acp-settings__section">
              <h3 className="acp-settings__section-title">Basemap</h3>
              <div className="acp-settings__basemap-grid">
                {basemapEntries.map(entry => {
                  const thumb = getBasemapThumbnail(entry, '')
                  const selected = activeBasemapId === entry.id
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`acp-settings__basemap${selected ? ' is-on' : ''}`}
                      aria-pressed={selected}
                      onClick={() => patchDraftConfig({ basemapId: entry.id })}
                    >
                      <img src={thumb} alt="" loading="lazy" />
                      <span>{entry.label}</span>
                    </button>
                  )
                })}
              </div>
              <h3 className="acp-settings__section-title">Core layers</h3>
              <div className="acp-settings__form">
                {CORE_LAYER_OPTIONS.map(({ key, label, locked }) => (
                  <label key={key} className={`acp-settings__check${locked ? ' acp-settings__check--locked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={locked ? true : draftLayerVisibility[key]}
                      disabled={locked}
                      onChange={e => setDraftCoreLayerVisible(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
                <label>
                  Clip mode
                  <select
                    value={draftConfig.clipMode}
                    onChange={e => patchDraftConfig({ clipMode: e.target.value as 'stable' | 'viewport' })}
                  >
                    <option value="stable">Stable AOI</option>
                    <option value="viewport">Viewport lazy</option>
                  </select>
                </label>
                <button type="button" className="acp-btn acp-btn--ghost" onClick={saveLayerDefaults}>
                  Save current layers as defaults
                </button>
              </div>
              <h3 className="acp-settings__section-title">Portal map layers</h3>
              {portalLayerRows.length ? (
                <ul className="acp-settings__portal-list">
                  {portalLayerRows.map(row => {
                    const visible = draftLayerVisibility.portal[row.id] !== false
                    return (
                      <li key={row.id}>
                        <label className="acp-settings__check">
                          <input
                            type="checkbox"
                            checked={visible}
                            onChange={e => setDraftPortalLayerVisible(row.id, e.target.checked)}
                          />
                          {row.title}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="acp-settings__hint">No portal layers on the map yet. Add layers from the GIS Content tab.</p>
              )}
              <button type="button" className="acp-btn acp-btn--ghost" onClick={savePortalLayerDefaults}>
                Save portal layer visibility as defaults
              </button>
            </div>
          ) : null}

          {tab === 'wms' ? (
            <div className="acp-settings__form">
              <label>
                Default WMS index
                <select
                  value={draftConfig.wmsLayerName}
                  onChange={e => patchDraftConfig({ wmsLayerName: e.target.value })}
                >
                  {['NDVI', 'NDMI', 'NDWI', 'EVI', 'CHAS'].map(x => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cloud cover max (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draftConfig.cloudCoverage}
                  onChange={e => patchDraftConfig({ cloudCoverage: Number(e.target.value) })}
                />
              </label>
              <label>
                Max WMS tile layers
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={draftConfig.maxWmsLayers}
                  onChange={e => patchDraftConfig({ maxWmsLayers: Number(e.target.value) })}
                />
              </label>
              <p className="acp-settings__hint">
                Caps how many Sentinel WMS raster chunks are drawn at once. Lower values reduce GPU load on large
                portfolios.
              </p>
              <button
                type="button"
                className="acp-btn"
                onClick={() => {
                  acp.setSelectedWmsLayer(draftConfig.wmsLayerName || SI_DEFAULT_LIVE_WMS_LAYER)
                  acp.commitWmsLayer({
                    layerId: draftConfig.wmsLayerName,
                    cloudCoverage: draftConfig.cloudCoverage,
                  })
                  acp.refreshWmsLayer()
                }}
              >
                Apply WMS to map
              </button>
            </div>
          ) : null}

          {tab === 'data' ? (
            <div className="acp-settings__form">
              <label>
                GeoDash API URL
                <input
                  type="url"
                  value={draftConfig.geodashApiUrl}
                  onChange={e => patchDraftConfig({ geodashApiUrl: e.target.value })}
                  placeholder="http://localhost:8000"
                />
              </label>
              <div className="acp-settings__inline-actions">
                <button type="button" className="acp-btn acp-btn--ghost" onClick={testGeodash} disabled={geodashTesting}>
                  {geodashTesting ? 'Testing…' : 'Test GeoDash connection'}
                </button>
                {geodashStatus ? <span className="acp-settings__hint">{geodashStatus}</span> : null}
              </div>
              <label>
                Dashboard auto refresh (minutes)
                <input
                  type="number"
                  min={1}
                  value={draftConfig.autoRefreshMinutes}
                  onChange={e => patchDraftConfig({ autoRefreshMinutes: Number(e.target.value) })}
                />
              </label>
              <p className="acp-settings__hint">
                Dashboard auto refresh reloads KPIs, charts, and field aggregates on a timer. Alert refresh (Alerts tab)
                controls how often the crop alert engine re-fetches Sentinel indices.
              </p>
              <label>
                Chart lookback (days)
                <input
                  type="number"
                  min={7}
                  value={draftConfig.chartLookbackDays}
                  onChange={e => patchDraftConfig({ chartLookbackDays: Number(e.target.value) })}
                />
              </label>
              <fieldset className="acp-settings__fieldset">
                <legend>Chart series</legend>
                {CHART_SERIES_OPTIONS.map(({ id, label }) => (
                  <label key={id} className="acp-settings__check">
                    <input
                      type="checkbox"
                      checked={draftConfig.chartSeries.includes(id)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...draftConfig.chartSeries, id]
                          : draftConfig.chartSeries.filter(s => s !== id)
                        patchDraftConfig({ chartSeries: next })
                      }}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <h3 className="acp-settings__section-title">Settings bundle</h3>
              <div className="acp-settings__inline-actions">
                <button type="button" className="acp-btn acp-btn--ghost" onClick={handleExport}>
                  Export JSON
                </button>
                <button
                  type="button"
                  className="acp-btn acp-btn--ghost"
                  onClick={() => importInputRef.current?.click()}
                >
                  Import JSON
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={handleImportFile}
                />
              </div>
              {importStatus ? <p className="acp-settings__hint">{importStatus}</p> : null}
            </div>
          ) : null}

          {tab === 'gis' ? (
            <GisMapBrowseLayersPane
              onAddRow={onAddRow}
              addingRowId={addingId}
              statusMessage={gisStatus ?? 'Layers register to the map and load live geometry when available.'}
            />
          ) : null}

          {tab === 'alert' ? (
            <div className="acp-settings__form">
              <label className="acp-settings__check">
                <input
                  type="checkbox"
                  checked={draftAlerts.enabled}
                  onChange={e => setDraftAlerts(prev => ({ ...prev, enabled: e.target.checked }))}
                />
                Alert engine enabled
              </label>
              <label>
                Alert refresh (minutes)
                <input
                  type="number"
                  min={1}
                  value={draftAlerts.refreshMinutes}
                  onChange={e => setDraftAlerts(prev => ({ ...prev, refreshMinutes: Number(e.target.value) }))}
                />
              </label>
              <fieldset className="acp-settings__fieldset">
                <legend>Indices</legend>
                {INDEX_OPTIONS.map(idx => (
                  <label key={idx} className="acp-settings__check">
                    <input
                      type="checkbox"
                      checked={draftAlerts.indices[idx]}
                      onChange={e =>
                        setDraftAlerts(prev => ({
                          ...prev,
                          indices: { ...prev.indices, [idx]: e.target.checked },
                        }))
                      }
                    />
                    {idx}
                  </label>
                ))}
              </fieldset>
              <fieldset className="acp-settings__fieldset">
                <legend>Alert types</legend>
                {ALERT_TYPE_OPTIONS.map(({ id, label }) => (
                  <label key={id} className="acp-settings__check">
                    <input
                      type="checkbox"
                      checked={draftAlerts.alertTypes[id]}
                      onChange={e =>
                        setDraftAlerts(prev => ({
                          ...prev,
                          alertTypes: { ...prev.alertTypes, [id]: e.target.checked },
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label>
                AOI mode
                <select
                  value={draftAlerts.aoiMode}
                  onChange={e =>
                    setDraftAlerts(prev => ({
                      ...prev,
                      aoiMode: e.target.value as CropAlertEngineSettings['aoiMode'],
                    }))
                  }
                >
                  <option value="agro-default">Agro Structures (default)</option>
                  <option value="builder">AOI Mask Builder</option>
                </select>
              </label>
              <fieldset className="acp-settings__fieldset">
                <legend>Notify channels</legend>
                {(
                  [
                    ['notifyInApp', 'In-app'],
                    ['notifyEmail', 'Email'],
                    ['notifySms', 'SMS'],
                    ['notifyPush', 'Push'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="acp-settings__check">
                    <input
                      type="checkbox"
                      checked={draftAlerts[key]}
                      onChange={e => setDraftAlerts(prev => ({ ...prev, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label className="acp-settings__check">
                <input
                  type="checkbox"
                  checked={draftAlerts.showLegend}
                  onChange={e => setDraftAlerts(prev => ({ ...prev, showLegend: e.target.checked }))}
                />
                Show CHAS marker legend in Legend panel
              </label>
            </div>
          ) : null}

          {tab === 'panels' ? (
            <div className="acp-settings__section">
              <h3 className="acp-settings__section-title">Dashboard panels</h3>
              <div className="acp-settings__form">
                {(
                  [
                    ['fields', 'Fields table'],
                    ['decision', 'Decision panel'],
                    ['liveAlerts', 'Live alerts'],
                    ['analytics', 'Analytics'],
                    ['timeSeriesChart', 'Time series chart'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="acp-settings__check">
                    <input
                      type="checkbox"
                      checked={draftConfig.panels[key]}
                      onChange={e =>
                        patchDraftConfig({
                          panels: { ...draftConfig.panels, [key]: e.target.checked },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <h3 className="acp-settings__section-title">Map toolbar buttons</h3>
              <div className="acp-settings__form">
                {MAP_TOOLBAR_OPTIONS.map(({ key, label, locked }) => (
                  <label key={key} className={`acp-settings__check${locked ? ' acp-settings__check--locked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={locked ? true : draftConfig.mapToolbar[key]}
                      disabled={locked}
                      onChange={e =>
                        patchDraftConfig({
                          mapToolbar: { ...draftConfig.mapToolbar, [key]: e.target.checked },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <h3 className="acp-settings__section-title">Fields panel defaults</h3>
              <div className="acp-settings__form">
                <label>
                  Default view mode
                  <select
                    value={draftConfig.fieldsPanel.defaultViewMode}
                    onChange={e =>
                      patchDraftConfig({
                        fieldsPanel: {
                          ...draftConfig.fieldsPanel,
                          defaultViewMode: e.target.value as 'table' | 'list',
                        },
                      })
                    }
                  >
                    <option value="table">Table</option>
                    <option value="list">List</option>
                  </select>
                </label>
                <label>
                  Default row density
                  <select
                    value={draftConfig.fieldsPanel.defaultRowDensity}
                    onChange={e =>
                      patchDraftConfig({
                        fieldsPanel: {
                          ...draftConfig.fieldsPanel,
                          defaultRowDensity: Number(e.target.value) as 1 | 2,
                        },
                      })
                    }
                  >
                    <option value={1}>Comfortable</option>
                    <option value={2}>Compact</option>
                  </select>
                </label>
              </div>
              <h3 className="acp-settings__section-title">KPI cards</h3>
              <ul className="acp-settings__kpi-list">
                {sortedKpiCards.map((card, index) => (
                  <li key={card.id} className="acp-settings__kpi-row">
                    <label className="acp-settings__check acp-settings__kpi-label">
                      <input
                        type="checkbox"
                        checked={card.visible}
                        onChange={e => {
                          setDraftConfig(prev => ({
                            ...prev,
                            kpiCards: prev.kpiCards.map(c =>
                              c.id === card.id ? { ...c, visible: e.target.checked } : c,
                            ),
                          }))
                        }}
                      />
                      <input
                        type="text"
                        className="acp-settings__kpi-label-input"
                        value={card.label}
                        onChange={e => {
                          setDraftConfig(prev => ({
                            ...prev,
                            kpiCards: prev.kpiCards.map(c =>
                              c.id === card.id ? { ...c, label: e.target.value } : c,
                            ),
                          }))
                        }}
                      />
                    </label>
                    <div className="acp-settings__kpi-actions">
                      <button
                        type="button"
                        className="acp-btn acp-btn--ghost"
                        disabled={index === 0}
                        onClick={() => moveKpiCard(card.id, -1)}
                        aria-label={`Move ${card.label} up`}
                      >
                        <i className="fa-solid fa-arrow-up" />
                      </button>
                      <button
                        type="button"
                        className="acp-btn acp-btn--ghost"
                        disabled={index === sortedKpiCards.length - 1}
                        onClick={() => moveKpiCard(card.id, 1)}
                        aria-label={`Move ${card.label} down`}
                      >
                        <i className="fa-solid fa-arrow-down" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <footer className="acp-settings__foot">
          <button type="button" className="acp-btn acp-btn--ghost" onClick={() => acp.setSettingsOpen(false)}>
            Close
          </button>
          <button type="button" className="acp-btn acp-btn--ghost" onClick={handleReset}>
            Reset to defaults
          </button>
          <button type="button" className="acp-btn" onClick={handleSave}>
            Save &amp; Apply
          </button>
        </footer>
      </div>
    </div>
  )
}
