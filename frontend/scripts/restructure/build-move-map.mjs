/**
 * One-off: builds move-map.json (old src path -> new src path) for the
 * Core / Modules / Roles / Shared / Data / Assets / App restructure.
 * Usage: node scripts/restructure/build-move-map.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const srcRoot = path.resolve(here, '../../src')

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else out.push(path.relative(srcRoot, p).split(path.sep).join('/'))
  }
  return out
}

const STAY = Symbol('stay')
const flat = (dest) => (rel) => dest + path.posix.basename(rel)
const tree = (prefix, dest) => (rel) => dest + rel.slice(prefix.length)
const to = (dest) => () => dest

/** Path rules: first match wins. */
const pathRules = [
  [/^(main\.tsx|vite-env\.d\.ts)$/, STAY],
  [/^assets\//, STAY],
  [/^App(\.smoke\.test)?\.tsx$/, flat('app/')],
  [/^(index|geodash-tailwind)\.css$/, flat('assets/styles/')],
  [/^routes\//, flat('app/routes/')],
  [/^shims\//, tree('shims/', 'app/startup/shims/')],
  [/^pages\/Home\.(tsx|css)$/, flat('app/layouts/')],
  [/^pages\/(StyleGuide|UsabilityTest)\.tsx$/, flat('app/routes/')],
  [/^pages\/index\.ts$/, to('app/routes/pages.ts')],
  [/^pages\/Login\.tsx$/, flat('core/auth/')],
  [/^pages\/Satellite\.tsx$/, flat('modules/remote-sensing/imagery/')],
  [/^pages\/account\//, flat('core/auth/account/')],
  [/^pages\/admin\/Users/, flat('core/authorization/')],
  [/^pages\/admin\/system-settings\//, flat('core/config/system-settings/')],
  [/^pages\/admin\//, flat('core/config/')],
  [/^pages\/applications\//, flat('core/config/')],
  [/^pages\/system\//, flat('core/routing/')],
  [/^pages\/sensors\//, flat('modules/operations/other/sensors/')],
  [/^pages\/master\/(DashboardSettings\.tsx|dashboard-settings\.css)$/, flat('modules/dashboards/management/')],
  [/^pages\/master\//, flat('modules/gis/layers/content-portal/')],
  [/^pages\/data-entry\/Harvest/, flat('modules/operations/harvest/')],
  [/^pages\/data-entry\/Irrigation/, flat('modules/operations/irrigation/')],
  [/^pages\/data-entry\/(FertigationRecords|EC\.|Recipes|recipes|recipe-report-modal)/, flat('modules/operations/fertigation/')],
  [/^pages\/data-entry\/QHIS/, flat('modules/operations/other/')],
  [/^pages\/data-entry\/(workflowMeta|workflow-shell|dsf-fill-modern)/, flat('modules/forms/templates/')],
  [/^pages\/data-entry\/components\/(FertigationReportModal|PrintFertigationReport|PrintReport|RecipeReportConfigModal|ReportModal)/, flat('modules/reports/operational/')],
  [/^pages\/data-entry\/components\//, flat('modules/forms/components/')],
  [/^pages\/dashboards\/realtimeAlert\//, tree('pages/dashboards/realtimeAlert/', 'modules/dashboards/operational/realtimeAlert/')],
  [/^pages\/dashboards\/agroCloudPlatform\//, tree('pages/dashboards/agroCloudPlatform/', 'modules/dashboards/gis/agroCloudPlatform/')],
  [/^pages\/dashboards\/agrocloud\//, tree('pages/dashboards/agrocloud/', 'modules/dashboards/management/agrocloud/')],
  [/^pages\/dashboards\/(AiAgroChat|AiAgroCloud|AiChatbot|Model)/, flat('modules/dashboards/ai/')],
  [/^pages\/dashboards\/Overview/, flat('modules/dashboards/operational/')],
  [/^pages\/dashboards\//, flat('modules/dashboards/management/')],
  [/^pages\/satellite\/lib\/timeSeriesReport\//, tree('pages/satellite/lib/timeSeriesReport/', 'modules/remote-sensing/temporal-analysis/timeSeriesReport/')],
  [/^pages\/satellite\/lib\/weatherClimateReport\//, tree('pages/satellite/lib/weatherClimateReport/', 'modules/remote-sensing/weather/weatherClimateReport/')],
  [/^pages\/satellite\/(lib|components)\/imageClassification\//, flat('modules/ai/classification/')],
  [/^pages\/satellite\/components\/timeSeriesReport\//, flat('modules/remote-sensing/temporal-analysis/')],
  [/^pages\/satellite\/components\/aiDetection\//, flat('modules/ai/detection/components/')],
  [/^pages\/satellite\/components\/segformerDetection\//, flat('modules/ai/segmentation/segformer/components/')],
  [/^pages\/satellite\/components\/trainingAi\//, flat('modules/ai/training/components/')],
  [/^pages\/satellite\/components\/geoAiAgent\//, flat('modules/ai/agent/components/')],
  [/^pages\/satellite\/components\/neighborhoodAgent\//, flat('modules/ai/agent/neighborhood/components/')],
  [/^pages\/satellite\/components\/gisSelection\//, flat('modules/gis/selection/components/')],
  [/^pages\/satellite\/components\/rasterGeoreference\//, flat('modules/gis/tools/rasterGeoreference/')],
  [/^pages\/satellite\/gisDataManager\//, flat('modules/gis/map/gisDataManager/')],
  [/^pages\/satellite\/gisSelection\//, flat('modules/gis/selection/')],
  [/^pages\/satellite\/siInstanceScope/, flat('app/providers/')],
  [/^lib\/agriFieldBoundary\//, tree('lib/agriFieldBoundary/', 'modules/ai/segmentation/field-boundary/')],
  [/^lib\/aiDetection\//, tree('lib/aiDetection/', 'modules/ai/detection/')],
  [/^lib\/treeDetection\//, tree('lib/treeDetection/', 'modules/ai/detection/tree/')],
  [/^lib\/segformerDetection\//, tree('lib/segformerDetection/', 'modules/ai/segmentation/segformer/')],
  [/^lib\/samDetection\//, tree('lib/samDetection/', 'modules/ai/segmentation/sam/')],
  [/^lib\/trainingAi\//, tree('lib/trainingAi/', 'modules/ai/training/')],
  [/^lib\/chirpsRainfall\//, tree('lib/chirpsRainfall/', 'modules/remote-sensing/weather/chirpsRainfall/')],
  [/^lib\/cropClassificationReport\//, tree('lib/cropClassificationReport/', 'modules/remote-sensing/classification/cropClassificationReport/')],
  [/^lib\/sarFloodReport\//, tree('lib/sarFloodReport/', 'modules/remote-sensing/change-detection/sarFloodReport/')],
  [/^lib\/remoteSensing\//, tree('lib/remoteSensing/', 'modules/remote-sensing/imagery/')],
  [/^lib\/cutFill\//, tree('lib/cutFill/', 'modules/gis/cut-fill/')],
  [/^lib\/elevationProfile\//, tree('lib/elevationProfile/', 'modules/gis/spatial-analysis/elevation-profile/')],
  [/^lib\/hydroWatershed\//, tree('lib/hydroWatershed/', 'modules/gis/spatial-analysis/hydro-watershed/')],
  [/^lib\/gisSelection\//, tree('lib/gisSelection/', 'modules/gis/selection/')],
  [/^lib\/measurement\//, tree('lib/measurement/', 'modules/gis/measurement/')],
  [/^lib\/gis\//, tree('lib/gis/', 'modules/gis/layers/')],
  [/^lib\/gisLayerRegistry\//, tree('lib/gisLayerRegistry/', 'modules/gis/layers/')],
  [/^lib\/raster\//, tree('lib/raster/', 'modules/gis/layers/raster/')],
  [/^lib\/gisIngest\//, tree('lib/gisIngest/', 'modules/data-management/import/gisIngest/')],
  [/^lib\/gisConnections\//, tree('lib/gisConnections/', 'modules/data-management/import/gisConnections/')],
  [/^lib\/objectAttributes\//, tree('lib/objectAttributes/', 'modules/master-data/schemas/')],
  [/^lib\/realtimeAlert\//, tree('lib/realtimeAlert/', 'modules/dashboards/operational/realtimeAlert/lib/')],
  [/^lib\/recipeReport\//, tree('lib/recipeReport/', 'modules/reports/operational/recipeReport/')],
  [/^lib\/wellSiteReport\//, tree('lib/wellSiteReport/', 'modules/reports/analytics/wellSiteReport/')],
  [/^lib\/eoEnrichmentReport\//, tree('lib/eoEnrichmentReport/', 'modules/reports/analytics/eoEnrichmentReport/')],
  [/^components\/ui\//, tree('components/ui/', 'shared/components/ui/')],
  [/^components\/system\//, tree('components/system/', 'shared/components/system/')],
  [/^components\/icons\//, tree('components/icons/', 'shared/icons/')],
  [/^components\/gisContent\//, tree('components/gisContent/', 'shared/maps/gisContent/')],
  [/^components\/layerCatalog\//, flat('modules/gis/layers/')],
  [/^components\/index\.ts$/, flat('shared/components/')],
  [/^components\/(HeaderBar|header|NavMenu|navmenu)/, flat('shared/layouts/')],
  [/^components\/AppDialogProvider/, flat('app/providers/')],
  [/^components\/app-dialog/, flat('shared/dialogs/')],
  [/^components\/MapView/, flat('shared/maps/')],
  [/^components\/(AgroCloudMark|BrandLogoOrbit|brand-logo-orbit)/, flat('shared/components/')],
  [/^components\/lux-theme/, flat('assets/styles/')],
  [/^components\/(PwaInstall|pwa-install|SplashScreen|splash)/, flat('app/startup/')],
  [/^components\/PersistentAgroCloudEmbed/, flat('app/layouts/')],
  [/^components\/GisDataManagerShared/, flat('modules/gis/map/')],
  [/^components\/GisUploadCloudSources/, flat('modules/data-management/import/')],
  [/^config\//, flat('core/config/')],
  [/^nav\//, flat('core/routing/')],
  [/^hooks\//, flat('core/hooks/')],
  [/^services\//, flat('core/services/')],
  [/^store\//, flat('core/state/')],
  [/^state\//, flat('core/state/')],
  [/^types\//, flat('core/types/')],
  [/^utils\/FileLoader/, flat('modules/data-management/import/')],
  [/^utils\//, flat('core/utils/')],
  [/^styles\//, flat('assets/styles/')],
  [/^scripts\//, flat('data/samples/')],
]

/** Loose files (lib root, satellite root/components/hooks/utils/lib) are classified by filename stem. */
const LOOSE = /^(lib|pages\/satellite|pages\/satellite\/components|pages\/satellite\/hooks|pages\/satellite\/utils|pages\/satellite\/lib)\/[^/]+$/

const stemRules = [
  [/^(auth|authApi|authEmailCopy|loginCredentialsPersistence|pendingEmailVerification|userProfilePersistence)$/, 'core/auth/'],
  [/^(roleCatalog|adminDirectoryPersistence|audit)$/, 'core/authorization/'],
  [/^(apiOrigin|apiFetchGuard|realtime)$/, 'core/api/'],
  [/^(lazyWithRetry|defaultPageLinks)$/, 'core/routing/'],
  [/^i18n$/, 'core/localization/'],
  [/^validation$/, 'core/validation/'],
  [/^clientErrorMonitoring$/, 'core/error-handling/'],
  [/^(utils|sha256|copyTextToClipboard|yieldToMain|geoJsonCoordIterWalk|deviceGeolocation)$/, 'core/utils/'],
  [/^(claudeApiKey|deepseekApiKey|geminiApiKey|googleMapsApiKey|mapboxAccessToken|openWeatherMapApiKey|ollamaConfig|sentinelHubAccessToken|customUserApiTokens|customApiTokenSlotSanitize|apiSecrets\w*|browserApiSecretsVault|loadBundledFontPreset|brandAssets)$/, 'core/config/'],
  [/^(initMobileAppShell|deferAfterFirstPaint|pwaInstall|pwaInstallText)$/, 'app/startup/'],
  [/^appDialog$/, 'shared/dialogs/'],
  [/^(lulcCompositionChartPlugin|imageryChartInk)$/, 'shared/charts/'],
  [/^TablePanel$/, 'shared/tables/'],
  [/^SiCopyTextButton$/, 'shared/components/'],
  [/^(MapControls|ScaleSelector|SearchWidget)$/, 'shared/maps/'],
  [/^(cloudFilePicker|cloudFilePickerConfig)$/, 'modules/data-management/import/'],
  [/^(vectorLayerExport|VectorLayerExportPanel)$/, 'modules/data-management/export/'],
  [/^formFieldColumns$/, 'modules/forms/components/'],
  [/^sensorApiIntegration$/, 'modules/operations/other/sensors/'],
  [/^agroCloudDashboardStorage$/, 'modules/dashboards/management/agrocloud/'],
  [/^acpOgc/, 'modules/dashboards/gis/agroCloudPlatform/'],
  [/^neighborhoodAgent/, 'modules/ai/agent/neighborhood/'],
  [/^(geoAi|GeoAi|geoExplorer|GeoExplorer)/, 'modules/ai/agent/'],
  [/^(runGeoAiServerTurn|runGeoExplorerGeminiTurn|applyGeoAiChatResult|buildGeoAiChatContext|geoQuestionEditSuggestions|agroAiChat|ai|SatelliteGeoAiFloatingWidget|satelliteGeoAiFloatingWidget|SiGeoAiInspectPopupBody|siGeoAiMapSelectionPaint|gisGeoExplorerPanel|GisGeoExplorerChartConfig)$/, 'modules/ai/agent/'],
  [/^(Sam|useSam)/, 'modules/ai/segmentation/sam/'],
  [/^(TreeDetection|useTreeDetection)/, 'modules/ai/detection/tree/'],
  [/^(AgriFieldBoundary|afb|Afb|useAgriFieldBoundary|useFieldBoundaryTrainingSamples|FieldAttributes|fieldAttributes|FieldDashBarChart|Ftw|useFtwAoiTraining)/, 'modules/ai/segmentation/field-boundary/'],
  [/^(ConfusionMatrixHeatmap|ValidationLinePlot|AoiTrainingChartsGrid)$/, 'modules/ai/training/components/'],
  [/^(CutFill|useCutFillAnalysis)/, 'modules/gis/cut-fill/'],
  [/^(ElevationProfile|useElevationProfile)/, 'modules/gis/spatial-analysis/elevation-profile/'],
  [/^(Hydro|useHydroWatershed)/, 'modules/gis/spatial-analysis/hydro-watershed/'],
  [/^(WellSite|WellSuitability|useWellSite|useWellSuitability|wellSite|wellSuitability)/, 'modules/gis/spatial-analysis/well-site/'],
  [/^(AnalysisPanel|AnalysisTool)$/, 'modules/gis/spatial-analysis/'],
  [/^MeasurementPanel$/, 'modules/gis/measurement/'],
  [/^(DrawTools|drawingUtils|SiMapDrawWidget|RemoteSensingDrawingToolbar)$/, 'modules/gis/editing/'],
  [/^(siMapFeatureIdentify|FeatureIdentifyPopupCard|SiFeatureInspectPopup|MapPopup|siViewportFeatureCache)$/, 'modules/gis/selection/'],
  [/^rasterTileZoom$/, 'modules/gis/layers/raster/'],
  [/^(symbologyHelpers|siSymbolStyleStudio|siPointSymbolGallery|siPolygonSymbolGallery|SiSymbology|SiPointSymbolSection)/, 'modules/gis/layers/symbology/'],
  [/^(arcgis|gisContent|gisHostedFeatureLayerPortal|gisMapLayerGisContentSave|gisFeatureStableKey|EsriImageServerLayer|LayerManager|LayerProperties|SiAddArcGisLayerPanel|SiAddSourceAnchoredPanel|GisMapBrowseLayersPane|GisPortalBrowseLayersPanel|layerAttributePopupUtils|LayerAttributePopupBody|layer-attribute-popup|siLayerLabelStyle|SiLayerLabelingPanel|siLayerPopup|SiLayerPopupConfigurator|siCustomLayer|SiImportedCustomLayersOverlay|siLayerExport|siMapLayerSearch|SiLayerLegendFloatingPanel|FieldVisibilityControl|mapboxPaintSanitize)/, 'modules/gis/layers/'],
  [/^(GisMap|basemapCatalog|BasemapGallery|siGlobe|siMapboxGlobeCompat|agroCloudMapMouseBehavior|agroCloudMapNavigation|siMapViewport|siMapInteractionPerf|siMapDockReservedZone|SiMapDockAwareMarker|MapToolsDock|MapToolbox|useMapOverlayIsolation|worldCountriesLayer|mapSearchGeocode|googleEarthFlyTo|SiGoToXyBar|goToXyCoords|useGisFloatingPanel|GisFloatingWorkspacePanel|gisMapChartPanelConfig|gisMapLayerStore|GisMapSaveOpenPanel|gisWebMapPortal|SiMapSwipe|siMapSwipe)/, 'modules/gis/map/'],
  [/^(agroCloudMapTerrain|collectionDemOverlay|useCollectionDemOverlay)$/, 'modules/remote-sensing/terrain/'],
  [/^(Weather|weather|useChirpsPrecipitation|openMeteo|openWeather|waporAetApi|imageryWeatherCompare|SiImageryWeatherTab|useFieldWaterRequirement)/, 'modules/remote-sensing/weather/'],
  [/^(FloodMonitoring|floodMonitoring|useFloodMonitoring)/, 'modules/remote-sensing/change-detection/'],
  [/^(siCropClassification|SiCropClassification|siLulc|siLayerClassAreaEngine|useLayerClassAreas|siPrithviCropPipeline|SiPrithviCropToolPanel|siRegionalCropTraining|SiRegionalCropTrainingPanel|SiCropAi|SiCropAoiSourceSelect|siCropAoi|siCropCountryAoi|landActivityClassifier)/, 'modules/remote-sensing/classification/'],
  [/^(SiImageryTimeSeries|imageryTimeSeriesCache|fetchImageryTimeSeriesProgressive|useImageryTimeSeriesStream|siImageryTimeSeriesFields|siMultiLayerAoiTrendAnalysis|SiMultiLayerAoiTrendView|useMultiLayerAoiTrendStream|siPlotLayerTimeSeries|SiPlotLayerTimeSeriesView|usePlotLayerTimeSeriesStream|aoiLiveTimeSeries|useAoiLiveTimeSeries|staticAoiMultiChartData|AoiStaticMultiLayerLineChart|SatelliteAoiStaticChartsMapOverlay|siMultiAoiTimeline|siEoTimelinePlayback|EoTimelineSlider|eoTimelineSlider|EpochDetailsTable|siAdaptiveTemporalEngine|siAnalyticalResolutionEngine|SiScatterCorrelationInsight|imageryStormAnalysis|ndsiSnowTimeSeriesDebug)/, 'modules/remote-sensing/temporal-analysis/'],
  [/^(adiIndex|chasIndex|dsiIndex|etIndex|lstIndex|ncadiIndex|wapiIndex|agroComposite|asterL1tIndices|mangroveIndices|chasAlertMapping|siCropAlert|SiCropAlert|cropAlertLayerHvdIcon|siWapiAlert|SiWapiAlert|irrigationDroughtAlert|vegetationAlertDecision|farmerAlertAction|siStressZones|SiStressZones|useStressZonesAnalysis|imageryIndexInterpretationEngine|SiImageryIndexInterpretationCard|useImageryIndexInterpretation|plantHealthFusionEngine|pureAgronomicDecisionEngine|imageryYieldEstimation|SiWaterStatusPanel|collectionIndexCatalog|layerLiveLegend|LayerLive|legendAnalyzeWmsZonal|layerLegendAnalyze|useLayerLegendAnalyzeData|sentinelLayerLiveWmsEngine|sentinelHubWmsIndexEvalscripts)/, 'modules/remote-sensing/indices/'],
  [/^(SatelliteIntelligence|EOS|Multidimensional|sentinel|Sentinel|siSentinel|ImagerySceneCalendar|mpcPlanetaryApi|remoteSensing|RemoteSensing|SiRsPanelSelect|useSiRsSelectMenuPosition|siDrawnAoiLiveIndex|siImageryFieldFlashPaint|Satellite|satellite|Sen2sr|useSen2srControls|wmsAoiClip|siMapAnalysis|SiMapAnalysis|siAoi|SiAoi|SiDynamicMapSnapshotsPanel|ToolPanels|SmartProcessingWorkflowPanel|agroStructures|dataMask|layersAoiClipGeoJson|EoLayerEnrichmentPanel|eoLayerEnrichmentRun)/, 'modules/remote-sensing/imagery/'],
]

function phaseOf(dest) {
  if (/^(app|core|assets|data)\//.test(dest)) return 'A'
  if (/^shared\//.test(dest)) return 'B'
  if (/^modules\/(gis|remote-sensing|ai)\//.test(dest)) return 'C'
  return 'D'
}

const files = walk(srcRoot).sort()
const moves = []
const unmatched = []
for (const rel of files) {
  let dest = null
  let matched = false
  for (const [re, fn] of pathRules) {
    if (re.test(rel)) {
      matched = true
      dest = fn === STAY ? null : fn(rel)
      break
    }
  }
  if (!matched && LOOSE.test(rel)) {
    const stem = path.posix.basename(rel).split('.')[0]
    for (const [re, d] of stemRules) {
      if (re.test(stem)) {
        matched = true
        dest = d + path.posix.basename(rel)
        break
      }
    }
  }
  if (!matched) {
    unmatched.push(rel)
    continue
  }
  if (dest && dest !== rel) moves.push({ from: rel, to: dest, phase: phaseOf(dest) })
}

const seen = new Map()
const collisions = []
for (const m of moves) {
  const key = m.to.toLowerCase()
  if (seen.has(key)) collisions.push(`${seen.get(key)} & ${m.from} -> ${m.to}`)
  else seen.set(key, m.from)
}
const stayingLower = new Set(files.filter((f) => !moves.some((m) => m.from === f)).map((f) => f.toLowerCase()))
for (const m of moves) if (stayingLower.has(m.to.toLowerCase())) collisions.push(`existing ${m.to} <- ${m.from}`)

fs.writeFileSync(path.join(here, 'move-map.json'), JSON.stringify(moves, null, 1))
fs.writeFileSync(path.join(here, 'unmatched.txt'), unmatched.join('\n'))
const byPhase = moves.reduce((a, m) => ((a[m.phase] = (a[m.phase] || 0) + 1), a), {})
console.log(`files=${files.length} moves=${moves.length} unmatched=${unmatched.length} collisions=${collisions.length}`, byPhase)
for (const c of collisions) console.log('COLLISION', c)
for (const u of unmatched) console.log('UNMATCHED', u)
