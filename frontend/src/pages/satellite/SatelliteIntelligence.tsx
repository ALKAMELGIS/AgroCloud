import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useDeferredValue,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import MapGL, { Source, Layer, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import './SatelliteIntelligence.css';
import './components/RemoteSensingPanel.css';
import { RemoteSensingToolboxPanel } from './components/RemoteSensingToolboxPanel';
import type { RemoteSensingDrawingTool } from './components/RemoteSensingDrawingToolbar';
import { SiMapDrawWidget } from './components/SiMapDrawWidget';
import { GisSelectionWorkbench } from './components/gisSelection/GisSelectionWorkbench';
import { GisSelectionProvider, type GisSelectionContextValue } from './gisSelection/GisSelectionContext';
import { mergeSelectionHits, selectFeaturesByMask, selectFeaturesAtPoint, lineSelectionMask } from '../../lib/gisSelection/spatialQuery';
import { selectFeaturesAtMapPoint, type MapSelectionOverlapState } from '../../lib/gisSelection/mapSelectionQuery';
import { resolveSelectionSetModeFromClick } from '../../lib/gisSelection/mapSelectionQuery';
import type { GisSelectionHit, GisSelectionLayerSource, GisSelectionSetMode, GisSelectionTool } from '../../lib/gisSelection/types';
import { HydroLegendTool } from './components/HydroLegendTool';
import { MeasurementPanel } from './components/MeasurementPanel';
import {
  computeMeasurement,
  getMeasureModeSpec,
  type MeasureComputed,
  type MeasureMode,
  type MeasurePoint,
  type MeasureUnits,
} from '../../lib/measurement/measurementEngine';
import '../../styles/gisModalSystem.css';
import '../dashboards/develop-dashboard.css';
import { parseFile, parseRemoteUrlAsFile } from '../../utils/FileLoader';
import type { RasterMapCoordinates } from '../../utils/FileLoader';
import type { CircleCardinal, DrawStyleConfig, VertexRef } from './drawingUtils';
import {
  bboxToPolygonFeature,
  circleFromEdgeFeature,
  circleRefineCardinalLngLat,
  circleRefineCosLat,
  circleRefineRDeg,
  clientPointToLngLat,
  cloneDeep,
  collectVertexRefs,
  downloadTextFile,
  featureToKml,
  featureToWkt,
  findNearestVertex,
  haversineDistanceMeters,
  loadDrawWorkspace,
  lngLatPixelDistance,
  minPixelDistToPolyline,
  pointInPolygonGeometry,
  projectPointerToCircleCardinalEdge,
  saveDrawWorkspace,
  SI_DRAW_WORKSPACE_LS_KEY_V2,
  setVertexCoord,
  snapLngLatToBearingStep,
  snapLngLatToNearestVertex,
  translateFeatureCoordinates,
  vertexHitThresholdPx,
} from './drawingUtils';
import { useMapboxAccessToken } from '../../hooks/useMapboxAccessToken';
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey';
import { useClaudeApiKey } from '../../hooks/useClaudeApiKey';
import { useDeepseekApiKey } from '../../hooks/useDeepseekApiKey';
import { useOllamaConfig } from '../../hooks/useOllamaConfig';
import { getArcgisPortalToken } from '../../lib/arcgisPortalToken';
import { fetchArcGisFeatureLayerGeoJson } from '../../lib/arcgisFeatureLayerGeoJson';
import { getMapboxAccessToken, getMapboxGlRendererToken } from '../../lib/mapboxAccessToken';
import { subscribeSentinelHubAccessToken } from '../../lib/sentinelHubAccessToken';
import { getSentinelHubWmsBaseUrl, subscribeSentinelHubWmsInstance } from '../../lib/sentinelHubWmsInstance';
import {
  buildRemoteSensingLayerSelectGroups,
  flattenRemoteSensingLayerSelectGroups,
  isAgroDeltaCompositeLayerId,
} from '../../lib/agroCompositeIndices';
import {
  buildSentinelHubWmsGetMapUrlParts,
  getBootstrapSentinelWmsLayers,
  getSentinelHubWmsLayerCatalog,
  mergeAgroCloudCustomWmsLayers,
  parseSentinelHubWmsCapabilities,
  pickDefaultSentinelWmsLayer,
  resolveSentinelHubWmsGetMapLayerName,
  resolveSentinelHubWmsDeltaPreviousDate,
  resolveSentinelHubWmsTimeWindow,
  sentinelHubWmsMinZoomForLatitude,
  SENTINEL_HUB_WMS_TILE_PIXELS,
  SI_DEFAULT_LIVE_WMS_LAYER,
  appendSentinelHubWmsAccessToken,
} from '../../lib/sentinelHubWmsLayers';
import { buildSentinelHubWmsAoiClip, buildSentinelHubWmsDisplayChunks, getDrawnGeometry, isSentinelHubWmsRenderReady } from '../../lib/sentinelHubWmsAoiClip';
import { drawnAoiClipSignature, normalizeDrawnAoiClipCollection } from './siDrawnAoiLiveIndex';
import {
  AGRO_STRUCTURES_FS21_URL,
  AGRO_STRUCTURES_PRIMARY_LAYER_ID,
  agroStructuresLayerAoiSignature,
  buildAgroStructuresLayerAoiMask,
  countAgroStructuresPolygons,
  fetchAgroStructuresGeoJson,
  fetchAgroStructuresGeoJsonInBbox,
  findAgroStructuresFeatureInLayer,
  isAgroStructuresLayer,
} from '../../lib/agroStructuresPrimaryAoi';
import {
  approximateLngLatBBoxFromViewState,
  expandLngLatBBox,
  pointInLngLatBBox,
  readMapLngLatBBox,
  SI_VIEWPORT_DEBOUNCE_MS,
  SI_VIEWPORT_MOVE_THROTTLE_MS,
  SI_VIEWPORT_PREFETCH_RATIO,
  type LngLatBBox,
  viewportAoiMaskCacheKey,
} from '../../lib/siMapViewport';
import {
  mergeMapMetrics,
  readMapMetricsFromViewState,
  shouldFreezeViewportDataPipeline,
  shouldSkipLiveViewportWorkOnMove,
  SI_MAP_METRICS_COMMIT_MS,
  viewStateMateriallyChanged,
  type SiMapMetrics,
} from '../../lib/siMapInteractionPerf';
import { SiViewportFeatureCache } from '../../lib/siViewportFeatureCache';
import {
  GEO_AI_COPILOT_RULES,
  lastMapQueryCoordsFromMessages,
  lastMapQueryCoordsFromSimpleChatHistory,
  replaceUserMessageText,
  type GeoExplorerMapLink,
  type GeoExplorerMessage,
  type GeoExplorerPart,
} from '../../lib/geoExplorerGemini';
import {
  buildGeoAiDataContext,
  claudeGeoAiComplete,
  DEVELOP_DATA_CONTEXT_LS_KEY,
  GEO_AI_CHAT_SYSTEM_BASE,
  type GeoAiChatTurn,
} from '../../lib/geoAiChatClaude';
import { appConfirm } from '../../lib/appDialog';
import { loadGisMapSavedLayers } from '../../lib/gisMapLayerStore';
import { computeStableGisFeatureKey } from '../../lib/gisFeatureStableKey';
import { satelliteCustomLayersToGeoAiLayers } from '../../lib/geoAiMapLayerSources';
import { MapToolboxLayerList, MapToolboxLayerRow } from './components/MapToolboxLayerList';
import './components/MapToolboxLayerList.css';
import { SiCropAlertCenterPanel } from './components/SiCropAlertCenterPanel';
import { SiStressZonesPanel } from './components/SiStressZonesPanel';
import { SiStressZonesMapPopup } from './components/SiStressZonesMapPopup';
import { useStressZonesAnalysis } from './components/useStressZonesAnalysis';
import type { StressZoneAreaRow } from '../../lib/siStressZonesLive';
import { SiCropAlertMapMarkersLayer } from './components/SiCropAlertMapMarkersLayer';
import { SiCropAlertMapLegend } from './components/SiCropAlertMapLegend';
import { useSiInstanceScope } from './siInstanceScope';
import { useMapOverlayIsolation } from './useMapOverlayIsolation';
import {
  SI_CROP_ALERT_ENGINE_LS_KEY,
  SI_CROP_ALERT_RESULTS_LS_KEY,
} from '../../lib/siCropAlertEngine';
import { SI_AOI_MASK_BUILDER_LS_KEY } from '../../lib/siAoiMaskBuilder';
import {
  CROP_ALERT_STATUS_COLORS,
  extractCropAlertFieldsFromMask,
  isCropAlertResultsCacheFresh,
  loadCropAlertEngineSettingsForSatellitePage,
  loadCropAlertResultsCache,
  persistCropAlertEngineSettings,
  persistCropAlertResultsCache,
  runCropAlertEngine,
  type CropAlertEngineSettings,
  type CropAlertFieldResult,
  type CropAlertIndexSnapshot,
} from '../../lib/siCropAlertEngine';
import {
  buildSnapshotsFromSentinelSeries,
  fetchCropAlertSentinelLiveBatch,
  type CropAlertSentinelFetchProgress,
} from '../../lib/siCropAlertSentinelLive';
import {
  buildCropAlertImageryContext,
  type CropAlertImageryContext,
} from '../../lib/siCropAlertImageryValidation';
import './components/SiCropAlertCenterPanel.css';
import { SiPrithviCropToolPanel } from './components/SiPrithviCropToolPanel';
import { SiImageryTimeSeriesFloatingPanel } from './components/SiImageryTimeSeriesFloatingPanel';
import { SiGoToXyBar } from './components/SiGoToXyBar';
import {
  fetchCropClassificationConfig,
  startAoiJob,
  startSupervisedAoiJob,
  startChipJob,
  pollJob,
  cropPredictionImageUrl,
  type CropClassificationJob,
  type CropClassificationMode,
} from '../../lib/siPrithviCropPipeline';
import type { CropTrainingSample } from '../../lib/cropSupervised/types';
import { validateTrainingSamples } from '../../lib/cropSupervised/trainingSampleValidator';
import {
  DEFAULT_CROP_DATA_PROVIDER,
  getCropProviderRedirect,
  isCropPanelProvider,
  type CropDataProviderId,
} from '../../lib/cropSupervised/cropDataProvider';
import {
  CROP_CLASSIFICATION_LAYER_ID,
  DEFAULT_CROP_CLASSIFICATION_SETTINGS,
  defaultCropClassificationSeason,
  isCropClassificationLayerId,
  resolveCropClassificationTimeWindow,
  type CropClassificationSettings,
} from '../../lib/siCropClassification';
import {
  buildCalibratedFieldsGeoJson,
  calibrateRegionalCrops,
  cropDefById,
  DEFAULT_REGIONAL_CROP_TRAINING_STATE,
  extractSpectralFeaturesForGeometry,
  loadRegionalCropTrainingState,
  newRegionalTrainingSampleId,
  saveRegionalCropTrainingState,
  type RegionalCropTrainingState,
  type RegionalTrainingSample,
} from '../../lib/siRegionalCropTraining';
import {
  layerNeedsAoiMaskFieldHydration,
  loadSiAoiMaskBuilderSettings,
  persistSiAoiMaskBuilderSettings,
  resolveSiAoiMaskBuilderClipGeoJson,
  siAoiMaskBuilderDisplayOpacityMultiplier,
  siAoiMaskBuilderSignature,
  siAoiMaskBuilderStatusLabel,
  type SiAoiMaskBuilderSettings,
} from '../../lib/siAoiMaskBuilder';
import {
  dateFromLocalIso,
  getDefaultSentinelImageryDate,
  getDefaultSentinelTimeSeriesRange,
  getSentinelImageryDatePrefsForAoi,
  localIsoDate,
  resolveSentinelFetchDate,
  resolveAutoLiveScenePair,
  saveSentinelImageryDatePrefsForAoi,
} from '../../lib/siSentinelImageryDate';
import {
  fetchSentinelSceneCatalogForAoi,
  type SentinelSceneCatalog,
} from '../../lib/siSentinelLatestScene';
import { geoExplorerTargetZoomForPinSource, runGeoExplorerGeminiTurn } from '../../lib/runGeoExplorerGeminiTurn';
import { pickGeoAiHumanPlaceFields, type GeoAiMapLayer } from '../../lib/geoExplorerLayerContext';
import { buildGeoAiInspectCardContent, type SiPopupInspectPayload } from '../../lib/siLayerPopupInspect';
import { normalizeSiLayerPopupConfig, type SiLayerPopupConfig } from '../../lib/siLayerPopupConfig';
import {
  isCustomLayerPopupEnabled,
  isMapIdentifyLayerSkippable,
  nextOverlapPickIndex,
  queryMapFeaturesAtPoint,
  resolveCustomLayerFromMapboxHit,
  resolveFeatureLinkFromMapHit,
  sanitizeIdentifyProperties,
} from '../../lib/siMapFeatureIdentify';
import { lngLatFromGeoAiFeatureLink, resolveGeoAiFeatureFromLink } from '../../lib/geoAiResolveTableMapLink';
import {
  buildGeoAiCoordsHighlightPoints,
  buildGeoAiLinkedHighlightCollection,
  sampleGeoAiMapSelectionLinks,
  stableFeatureLinkKey,
} from '../../lib/geoAiLinkedSelection';
import { SI_GEO_AI_MAP_SELECTION_PAINT } from './siGeoAiMapSelectionPaint';
import { runGeoAiStatsCommand, type GeoAiMapFirstSelection } from '../../lib/geoAiStatsEngine';
import { resolveGeoAiPinFromUserTextAndReply } from '../../lib/geoAiResolveMapCoords';
import { buildGeoAiFullWeatherSessionAppend } from '../../lib/geoAiWeatherContext';
import {
  installSiGlobeWebglContextRecovery,
  siBrowserReportsMicrosoftEdge,
  siMapErrorSuggestsGlobeOrWebglFailure,
  siNextBackoffDelayMs,
} from '../../lib/siMapboxGlobeCompat';
import {
  applySiGlobeCockpitFog,
  isSiGlobeCockpit2dActive,
  SI_GLOBE_COCKPIT_2D_VIEW,
  SI_GLOBE_COCKPIT_FOG,
} from './siGlobeCockpit';
import {
  AGRO_CLOUD_MAPBOX_NAVIGATION_PROPS,
  applyAgroCloudMapboxBranding,
  applyAgroCloudMapPerformanceTuning,
  bindAgroCloudMapWheelZoomPassthrough,
  computeAgroCloudOrbitViewState,
  ensureAgroCloudMapScrollZoom,
  setMapboxDragPanEnabled,
  syncAgroCloudMapboxCamera,
  useAgroCloudMapOrbitNavigation,
} from '../../lib/agroCloudMapNavigation';
import {
  cancelAgroCloudTerrainSync,
  syncAgroCloudTerrain3d,
  SATELLITE_3D_BASEMAP_ID,
  TOPOGRAPHIC_3D_BASEMAP_ID,
  warmAgroCloudTerrainDemSource,
  ESRI_WORLD_TERRAIN_SOURCE_ID,
  setAgroCloudTerrainExaggeration,
} from '../../lib/agroCloudMapTerrain';
import { useOpenWeatherMapApiKey } from '../../hooks/useOpenWeatherMapApiKey';
import { agroChatWithDeepSeek, agroChatWithGemini, agroChatWithOllamaStream, warmOllama } from '../../lib/agroAiChat';
import {
  buildBasemapCatalog,
  catalogEntryById,
  DEFAULT_BASEMAP_ID,
  DEFAULT_BASEMAP_ID_NO_MAPBOX,
  RASTER_BASEMAP_FALLBACK_ID,
  basemapTileErrorShouldFallback,
  getBasemapThumbnail,
  isGoogleEarthBasemapId,
  mapboxGlStyleForEntry,
  pickDefaultBasemapId,
  resolveBasemapId,
} from './basemapCatalog';
import {
  arcgisDrawingInfoToFillPaint,
  arcgisDrawingInfoToLinePaint,
  fetchArcgisLayerDrawingInfo,
  fetchArcgisLayerPjson,
  pickRendererPrimaryField,
  sanitizeArcgisDrawingInfoForClient,
  slimArcgisLayerDefinitionForStorage,
} from '../../lib/arcgisDrawingInfoMapbox';
import { arcgisExtentToWgs84BBox } from '../../lib/arcgisImageServer';
import {
  arcLegendLabelForFieldValue,
  buildArcFieldsByLower,
  getArcDisplayValue,
  type ArcgisLayerDefLite,
} from '../../lib/arcgisAttributeDisplay';
import type { SymbologyClassMethod, SymbologyColorRamp, SymbologyConfig, SymbologyStyle } from './components/LayerManager';
import {
  buildSymbologyContext,
  clampInt,
  darkenColor,
  describeArcGisRendererVisualization,
  getGeoJsonFields,
  getLayerGeometryKind,
  getNumericFields,
  inferVisualizationFromArcgisRenderer,
  normalizeSymbologyForLayer,
  type SymbologyContext,
} from './symbologyHelpers';
import {
  appearanceFromSiCustomLayerFields,
  buildSiCustomVectorStylePack,
  defaultSiSymbologyAppearance,
  siDefaultNewVectorLayerFields,
  SI_DEFAULT_VECTOR_OUTLINE_COLOR,
  SI_DEFAULT_VECTOR_LINE_WEIGHT,
  loadSiStudioSectionPrefs,
  persistedSiAppearance,
  readSiStyleClipboard,
  saveSiStudioSectionPrefs,
  SI_MAPBOX_STYLE_CLIPBOARD_LS,
  SI_MAPBOX_STYLE_STUDIO_PREFS_LS,
  strokeDashSvgFromStyle,
  type SiLayerAppearancePersisted,
  type SiStudioSectionState,
  type SiSymbologyAppearance,
  writeSiStyleClipboard,
} from './siSymbolStyleStudio';
import { AgroCloudMark } from '../../components/AgroCloudMark';
import { FieldVisibilityControl } from './components/FieldVisibilityControl';
import { GeoExplorerGeminiInputRow } from './components/GeoExplorerGeminiInputRow';
import { GeoExplorerGeminiMessageParts } from './components/GeoExplorerGeminiMessageParts';
import { SiCopyTextButton } from './components/SiCopyTextButton';
import type { AoiStaticMultiLayerLineChartDataset } from './components/AoiStaticMultiLayerLineChart';
import { SatelliteMapAnalysisChrome, type MapToolboxNavigateHandler } from './components/SatelliteMapAnalysisChrome';
import { LayerLiveLegendPanel } from './components/LayerLiveLegendPanel';
import { LayerLiveLegendFloatingPanel } from './components/LayerLiveLegendFloatingPanel';
import { useLayerClassAreas } from './components/useLayerClassAreas';
import { resolveLayerLiveLegendSpec } from '../../lib/layerLiveLegendCatalog';
import {
  buildGeoAiLiveMapStateBlock,
  type GeoAiLayerState,
  type GeoAiLiveMapState,
} from '../../lib/geoAiLiveMapContext';
import {
  queryBasemapFeaturesNear,
  queryBasemapFeaturesInView,
  summarizeBasemapFeatures,
  type GeoAiBasemapFeature,
} from '../../lib/geoAiBasemapQuery';
import {
  executeGeoAiMapCommands,
  parseGeoAiMapCommands,
  type GeoAiMapCommandHandlers,
} from '../../lib/geoAiCommandExecutor';
import { TreeDetectionsPanel } from './components/TreeDetectionsPanel';
import { useTreeDetection } from './components/useTreeDetection';
import { FloodMonitoringPanel, type FloodLayerKind } from './components/FloodMonitoringPanel';
import { useFloodMonitoring } from './components/useFloodMonitoring';
import { downloadTreeShapefile } from '../../lib/treeDetection/shapefileExport';
import {
  searchPlaces,
  zoomForPlaceKind,
  detectQueryLanguage,
  type MapSearchResult,
} from '../../lib/mapSearchGeocode';
import type { TreeImageryProviderId } from '../../lib/treeDetection/webMercatorTiles';
import type { TreeAnalysisMode } from '../../lib/treeDetection/treeDetectionEngine';
import { HydroWatershedPanel } from './components/HydroWatershedPanel';
import { useHydroWatershed } from './components/useHydroWatershed';
import { WellSiteRecommendationPanel } from './components/WellSiteRecommendationPanel';
import { useWellSiteRecommendation } from './components/useWellSiteRecommendation';
import { WellSuitabilityPanel } from './components/WellSuitabilityPanel';
import { useWellSuitabilityAnalysis } from './components/useWellSuitabilityAnalysis';
import type { WellSitePoint } from '../../lib/hydroWatershed/hydroEngine';
import type { WellSuitabilitySite } from '../../lib/hydroWatershed/wellSuitabilityMcdaEngine';
import type { HydroStepId } from '../../lib/hydroWatershed/hydroEngine';
import { GisPortalBrowseLayersPanel } from './components/GisPortalBrowseLayersPanel';
import { GisUploadCloudSources } from '../../components/GisUploadCloudSources';
import type { MapToolboxAddGisLayerAction } from './components/MapToolboxAddGisLayerFlyout';
import { type GisContentRow, gisContentPortalDisplayTypeLabel } from '../master/gisContentPortalData';
import {
  buildGisContentMapLayerPayload,
  buildGisContentMapLayerPayloadAsync,
  getGisContentItemDetails,
  getGisContentRowById,
  isGisContentRowInRecycle,
  useGisContentPortal,
} from '../../lib/gisContentPortalStore';
import { persistArcGisHostedFeatureLayerToGisContentPortal } from '../../lib/gisContentPortalPublish';
import { isAgroStructuresPortalRow, fetchHostedFeatureLayerGeoJsonFromServiceUrl } from '../../lib/gisHostedFeatureLayerPortal';
import { listGisContentPortalSavedLayers, parseGisContentPortalLayerUrl, gisContentPortalLayerUrl } from '../../lib/gisContentPortalTableUtils';
import { SatelliteGeoAiFloatingWidget } from './components/SatelliteGeoAiFloatingWidget';
import { SatelliteAoiStaticChartsMapOverlay } from './components/SatelliteAoiStaticChartsMapOverlay';
import { SatelliteMapProcessingOptionsPortal } from './components/SatelliteMapProcessingOptionsPortal';
import { WeatherIntelligencePanel, type WeatherLocation } from './components/WeatherIntelligencePanel';
import {
  WeatherVisualizationPanel,
  WeatherVizOverlay,
  DEFAULT_WEATHER_SIM,
  type WeatherVizCamera,
  type WeatherSimState,
} from './components/WeatherVisualizationPanel';
import { reversePlaceLabel } from '../../lib/openMeteoWeather';
import { SiFeatureInspectPopup } from './components/SiFeatureInspectPopup';
import { SiLayerPopupConfigurator } from './components/SiLayerPopupConfigurator';
import {
  buildSiAoiFieldRecord,
  computeSiAoiFieldMetrics,
  fieldGeometryWithinAoi,
  fieldGeometriesRoughOverlap,
  newSiAoiFieldId,
  rotatePolygonGeometry,
  type SiAoiFieldRecord,
  siAoiFieldsToFeatureCollection,
} from '../../lib/siAoiFields';
import {
  buildAoiMultiChartDatasets,
  buildSentinelPixelSamplePolygon,
  type AoiStatsSampleMode,
} from './utils/aoiLiveTimeSeries';
import { useAoiLiveTimeSeries } from './hooks/useAoiLiveTimeSeries';
import {
  buildStaticAoiMultiChartDatasets,
  defaultStaticAoiComparisonLayers,
  layerLiveStatsIncludesLst,
  layerLiveStatsIncludesEt,
  sortLayerLiveStatsLayerIds,
  type LayerLiveStatsLayerId,
} from './utils/staticAoiMultiChartData';
import {
  getAnalysisEngineBaseUrl,
  mpcProcess,
  type MpcProcessResult,
  type MpcTemplateId,
} from '../../lib/mpcPlanetaryApi';

const EMPTY_MAP_STYLE: any = {
  version: 8,
  // Bake the globe projection into the style itself so an imperative `setStyle()`
  // (basemap structural swap) never momentarily drops the map back to Mercator /
  // a black canvas before the React `projection` prop is re-applied.
  projection: { name: 'globe' },
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#020617'
      }
    }
  ]
};
/**
 * Stable basemap raster scaffolding.
 *
 * Every basemap in the catalogue is a raster-tile style. By rebuilding each one
 * with FIXED source/layer ids we can swap basemaps by only replacing the tile
 * URLs of the existing sources (`source.setTiles(...)`) â€” never re-creating the
 * map, never calling setStyle/fitBounds/jumpTo. The camera (center/zoom/pitch/
 * bearing) and every overlay stay exactly in place, with no flicker.
 */
const SI_BASE_SOURCE_PREFIX = 'agrocloud-basemap-src-';
const SI_BASE_LAYER_PREFIX = 'agrocloud-basemap-layer-';

type SiRasterSpec = {
  tiles: string[];
  tileSize: number;
  attribution?: string;
  opacity: number;
};

/**
 * True only when the style is built entirely from raster tile layers (no
 * hillshade / terrain / vector layers). Those pure styles can be swapped purely
 * by replacing tile URLs; styles with terrain (e.g. 3D Topographic) must keep
 * their full structure and go through the style-rebuild path.
 */
function siIsPureRasterStyle(style: unknown): boolean {
  if (!style || typeof style !== 'object') return false;
  const s = style as any;
  if (s.terrain) return false;
  if (!Array.isArray(s.layers) || !s.layers.length) return false;
  return s.layers.every((l: any) => l && l.type === 'raster');
}

/** Pull ordered raster (source+layer) specs out of any catalogue style object. */
function siExtractRasterSpecs(style: unknown): SiRasterSpec[] {
  if (!style || typeof style !== 'object') return [];
  const s = style as any;
  if (!Array.isArray(s.layers) || !s.sources) return [];
  const specs: SiRasterSpec[] = [];
  for (const layer of s.layers) {
    if (!layer || layer.type !== 'raster') continue;
    const src = s.sources[layer.source];
    if (!src || src.type !== 'raster' || !Array.isArray(src.tiles)) continue;
    const op = layer.paint?.['raster-opacity'];
    specs.push({
      tiles: src.tiles.slice(),
      tileSize: typeof src.tileSize === 'number' ? src.tileSize : 256,
      attribution: typeof src.attribution === 'string' ? src.attribution : undefined,
      opacity: typeof op === 'number' ? op : 1,
    });
  }
  return specs;
}

/** Rebuild a style with stable ids so tile swaps are diff-friendly / in-place. */
function siBuildStableRasterStyle(specs: SiRasterSpec[]): any {
  if (!specs.length) return EMPTY_MAP_STYLE;
  const sources: Record<string, unknown> = {};
  const layers: unknown[] = [];
  specs.forEach((spec, i) => {
    const sid = `${SI_BASE_SOURCE_PREFIX}${i}`;
    sources[sid] = {
      type: 'raster',
      tiles: spec.tiles,
      tileSize: spec.tileSize,
      ...(spec.attribution ? { attribution: spec.attribution } : {}),
    };
    layers.push({
      id: `${SI_BASE_LAYER_PREFIX}${i}`,
      type: 'raster',
      source: sid,
      paint: { 'raster-fade-duration': 0, 'raster-opacity': spec.opacity },
    });
  });
  // Bake the globe projection into the rebuilt style so the globe survives the
  // in-place `setStyle()` swap (no black/flat flash before the prop re-applies).
  return { version: 8 as const, projection: { name: 'globe' }, sources, layers };
}

const PC_STAC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const STAC_CONNECTION_STORAGE_KEY = 'si-stac-connection-v1';
const SATELLITE_CUSTOM_LAYERS_STORAGE_KEY = 'si-satellite-custom-layers-v1';
const GEO_AI_CHAT_PAGE_SIZE = 40;

/** Sections shown inside the map toolbox processing portal. */
type MapToolboxSectionId =
  | 'source'
  | 'layers'
  | 'remote-sensing'
  | 'crop-alerts'
  | 'stress-zones'
  | 'crop-classification'
  | 'ai-detection-gis'
  | 'tree-detections'
  | 'hydro-watershed'
  | 'well-site'
  | 'well-suitability'
  | 'flood-monitoring'
  | 'table-geo-ai';

type GeoAiInspectCardState = {
  title: string;
  rows: { label: string; value: string }[];
  /** Rich popup layout (sections, tabs, search) when built from layer identify. */
  inspect?: SiPopupInspectPayload | null;
  lng: number;
  lat: number;
  areaName?: string;
  country?: string;
};

type GeoAiInspectPopupState = GeoAiInspectCardState & {
  id: string;
  pinned: boolean;
  collapsed: boolean;
  featureLinkKey: string | null;
};

type GeoAiPopupMode = 'single' | 'multiple' | 'docked' | 'side';

const GEO_AI_POPUP_MODE_LS_KEY = 'si-geo-ai-popup-mode-v1';

function readStoredGeoAiPopupMode(storageKey = GEO_AI_POPUP_MODE_LS_KEY): GeoAiPopupMode {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : '';
    if (v === 'single' || v === 'multiple' || v === 'docked' || v === 'side') return v;
  } catch {
    /* ignore */
  }
  return 'multiple';
}
const GEO_AI_EXPLORATION_LS_KEY = 'si-geo-ai-exploration-v1';
/** Max simultaneous on-map identify popups (multiple / exploration mode). */
const GEO_AI_MAX_INSPECT_POPUPS = 22;
/** When a vector layer has at least this many Point/MultiPoint features, enable Mapbox clustering on that source. */
const GEO_AI_CLUSTER_POINT_THRESHOLD = 28;

/** Cap geometry sent to Mapbox for tableâ†”map highlight (full selection stays in the table). */
const SI_GEO_AI_MAP_HIGHLIGHT_MAX_LINKS = 2800;

type NetfloraDetectionMode = 'aoi_first' | 'full_then_clip';
type NetfloraAoiSource = 'drawn' | 'view';
type NetfloraDetectionStats = {
  total: number;
  avgConfidence: number;
  byClass: Array<{ label: string; count: number; avgConfidence: number }>;
};

async function reverseLngLatForGeoAiDetails(
  lng: number,
  lat: number,
  mapboxToken: string | undefined,
): Promise<{ area?: string; country?: string }> {
  const token = typeof mapboxToken === 'string' ? mapboxToken.trim() : '';
  if (token) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as {
          features?: Array<{
            text?: string;
            context?: Array<{ id?: string; text?: string }>;
          }>;
        };
        const f = j?.features?.[0];
        if (f) {
          const ctx = Array.isArray(f.context) ? f.context : [];
          const countryEnt = ctx.find(c => String(c?.id || '').startsWith('country'));
          const country = countryEnt?.text ? String(countryEnt.text).trim() : '';
          const placeFromCtx = ctx.find(c => /(place|locality|district|neighborhood)/.test(String(c?.id || '')));
          const area =
            (typeof f.text === 'string' && f.text.trim() ? f.text.trim() : '') ||
            (placeFromCtx?.text ? String(placeFromCtx.text).trim() : '') ||
            '';
          return { area: area || undefined, country: country || undefined };
        }
      }
    } catch {
      /* fall through to OSM */
    }
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=12&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'AgriCloud/1.0 (Geo AI reverse)' } },
    );
    if (!res.ok) return {};
    const j = (await res.json()) as {
      name?: string;
      address?: Record<string, string>;
    };
    const a = j?.address || {};
    const area =
      a.village ||
      a.town ||
      a.city ||
      a.county ||
      a.state ||
      a.hamlet ||
      (typeof j?.name === 'string' ? j.name : '') ||
      '';
    const country = a.country || '';
    return {
      area: typeof area === 'string' && area.trim() ? area.trim() : undefined,
      country: typeof country === 'string' && country.trim() ? country.trim() : undefined,
    };
  } catch {
    return {};
  }
}

const STAC_HELP_LINKS = {
  catalog: 'https://planetarycomputer.microsoft.com/catalog',
  docs: 'https://planetarycomputer.microsoft.com/docs/concepts/stac/',
  esriMpc: 'https://github.com/Esri/arcgis-for-mpc',
  spec: 'https://stacspec.org/',
} as const;
const NETFLORA_DETECTIONS_LAYER_ID = 'ai-detection-netflora-results';
const TREE_DETECTIONS_SOURCE_ID = 'tree-detections-source';
const TREE_DETECTIONS_LAYER_ID = 'tree-detections-overlay';
/** Ordered so raster terrain sits below vector hydrography/mesh on the map. */
const HYDRO_STEP_ORDER: HydroStepId[] = [
  'dem',
  'hillshade',
  'slope',
  'flow-accum',
  'watershed',
  'basins',
  'streams',
  'contours',
];

/** Human labels for Hydro layers shown in the Layers panel. */
const HYDRO_STEP_LABELS: Record<HydroStepId, string> = {
  dem: 'Hydro Â· Elevation',
  hillshade: 'Hydro Â· Hillshade',
  slope: 'Hydro Â· Slope',
  'flow-accum': 'Hydro Â· Flow accumulation',
  streams: 'Hydro Â· Stream network',
  contours: 'Hydro Â· Contours',
  watershed: 'Hydro Â· Watershed',
  basins: 'Hydro Â· Drainage basins',
  mesh: 'Hydro Â· Mesh',
};

const DATABASE_PLATFORM_OPTIONS = [
  'SQL Server',
  'BigQuery',
  'Dameng',
  'DB2',
  'Elasticsearch',
  'OpenSearch',
  'Oracle',
  'PostgreSQL',
  'Redshift',
  'SAP HANA',
  'Snowflake',
  'Teradata',
] as const;

type StacPresetId = 'planetary-computer' | 'custom';
type StacAuthMode = 'none' | 'bearer';

interface StacKvRow {
  id: string;
  name: string;
  value: string;
}

interface StacConnectionConfig {
  connectionName: string;
  presetId: StacPresetId;
  /** Catalog API root or full /search URL (used when presetId is custom). */
  customCatalogBaseUrl: string;
  authMode: StacAuthMode;
  bearerToken: string;
  customHeaders: StacKvRow[];
  customParams: StacKvRow[];
  /** Notes or paths for cloud / ACS-style context (browser cannot apply .acs like ArcGIS Pro). */
  cloudStorageEntries: string[];
}

function newStacKvRow(): StacKvRow {
  return { id: `kv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: '', value: '' };
}

function defaultStacConnection(): StacConnectionConfig {
  return {
    connectionName: 'Planetary Computer',
    presetId: 'planetary-computer',
    customCatalogBaseUrl: '',
    authMode: 'none',
    bearerToken: '',
    customHeaders: [],
    customParams: [],
    cloudStorageEntries: [],
  };
}

function normalizeStacConnection(raw: unknown): StacConnectionConfig {
  const base = defaultStacConnection();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const asRows = (v: unknown): StacKvRow[] => {
    if (!Array.isArray(v)) return [];
    return v.map((r, i) => {
      const x = r as Record<string, unknown>;
      return {
        id: typeof x?.id === 'string' ? x.id : `kv-${i}-${Math.random().toString(36).slice(2)}`,
        name: String(x?.name ?? ''),
        value: String(x?.value ?? ''),
      };
    });
  };
  const preset = o.presetId === 'custom' ? 'custom' : 'planetary-computer';
  return {
    connectionName: String(o.connectionName ?? base.connectionName).trim() || base.connectionName,
    presetId: preset,
    customCatalogBaseUrl: String(o.customCatalogBaseUrl ?? ''),
    authMode: o.authMode === 'bearer' ? 'bearer' : 'none',
    bearerToken: '',
    customHeaders: asRows(o.customHeaders),
    customParams: asRows(o.customParams),
    cloudStorageEntries: Array.isArray(o.cloudStorageEntries)
      ? o.cloudStorageEntries.map((s: unknown) => String(s))
      : [],
  };
}

function loadStacConnection(storageKey = STAC_CONNECTION_STORAGE_KEY): StacConnectionConfig {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultStacConnection();
    return normalizeStacConnection(JSON.parse(raw));
  } catch {
    return defaultStacConnection();
  }
}

/** Persists config without bearer token (session-only secret). */
function persistStacConnectionToStorage(c: StacConnectionConfig, storageKey = STAC_CONNECTION_STORAGE_KEY) {
  const { bearerToken: _t, ...rest } = c;
  localStorage.setItem(storageKey, JSON.stringify(rest));
}

function cloneStacModalDraft(c: StacConnectionConfig): StacConnectionConfig {
  return {
    ...c,
    bearerToken: c.bearerToken,
    customHeaders: c.customHeaders.map(r => ({ ...r })),
    customParams: c.customParams.map(r => ({ ...r })),
    cloudStorageEntries: [...c.cloudStorageEntries],
  };
}

function getResolvedStacSearchUrl(config: StacConnectionConfig): string {
  if (config.presetId === 'planetary-computer') return PC_STAC_SEARCH_URL;
  let base = config.customCatalogBaseUrl.trim().replace(/\/$/, '');
  if (!base) return PC_STAC_SEARCH_URL;
  if (/\/search$/i.test(base)) return base;
  return `${base}/search`;
}

/** True when resolved URL is the standard Planetary Computer STAC search endpoint (query string ignored). */
function isDefaultPlanetaryComputerStacSearchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = (u.pathname.replace(/\/+$/, '') || '/').toLowerCase();
    return u.hostname.toLowerCase() === 'planetarycomputer.microsoft.com' && path === '/api/stac/v1/search';
  } catch {
    return false;
  }
}

function appendStacQueryParams(url: string, rows: StacKvRow[]): string {
  const params = new URLSearchParams();
  for (const row of rows) {
    const n = row.name.trim();
    if (n) params.append(n, row.value);
  }
  const qs = params.toString();
  if (!qs) return url;
  return url + (url.includes('?') ? '&' : '?') + qs;
}

function buildStacRequestHeaders(config: StacConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/geo+json, application/json',
  };
  if (config.authMode === 'bearer' && config.bearerToken.trim()) {
    headers.Authorization = `Bearer ${config.bearerToken.trim()}`;
  }
  for (const row of config.customHeaders) {
    const n = row.name.trim();
    if (n) headers[n] = row.value;
  }
  return headers;
}

function buildStacGetHeaders(config: StacConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.authMode === 'bearer' && config.bearerToken.trim()) {
    headers.Authorization = `Bearer ${config.bearerToken.trim()}`;
  }
  for (const row of config.customHeaders) {
    const n = row.name.trim();
    if (n) headers[n] = row.value;
  }
  return headers;
}

function getStacCollectionsListUrl(config: StacConnectionConfig): string {
  const searchUrl = getResolvedStacSearchUrl(config).split('?')[0];
  if (/\/search$/i.test(searchUrl)) return searchUrl.replace(/\/search$/i, '/collections');
  return `${searchUrl.replace(/\/$/, '')}/collections`;
}

interface StacCollectionSummary {
  id: string;
  title: string;
  description: string;
}

async function fetchAllStacCollections(config: StacConnectionConfig): Promise<StacCollectionSummary[]> {
  const listRoot = getStacCollectionsListUrl(config);
  const headers = buildStacGetHeaders(config);
  const out: StacCollectionSummary[] = [];
  let url: string | null = listRoot;
  const originBase = new URL(listRoot);
  for (let i = 0; i < 60 && url; i++) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`STAC collections failed (${res.status})`);
    const data = await res.json();
    const cols = Array.isArray(data?.collections) ? data.collections : [];
    for (const c of cols) {
      const id = String(c?.id ?? '');
      if (!id) continue;
      out.push({
        id,
        title: String(c?.title ?? id),
        description: typeof c?.description === 'string' ? c.description : '',
      });
    }
    const next = data?.links?.find((l: { rel?: string; href?: string }) => l.rel === 'next' && l.href);
    const href = next?.href ? String(next.href) : '';
    if (!href) {
      url = null;
    } else if (href.startsWith('http')) {
      url = href;
    } else if (href.startsWith('/')) {
      url = `${originBase.origin}${href}`;
    } else {
      url = new URL(href, listRoot).toString();
    }
  }
  return out;
}

function stacItemFootprintGeometry(item: any): any | null {
  const g = item?.geometry;
  if (g && typeof g === 'object' && g.type) return g;
  const bbox = item?.bbox;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const [w, s, e, n] = bbox as number[];
    if (Number.isFinite(w) && Number.isFinite(s) && Number.isFinite(e) && Number.isFinite(n)) {
      return {
        type: 'Polygon' as const,
        coordinates: [
          [
            [w, s],
            [e, s],
            [e, n],
            [w, n],
            [w, s],
          ],
        ],
      };
    }
  }
  return null;
}

function bboxToRgCoordinates(bbox: [number, number, number, number]): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, s, e, n] = bbox;
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
}

function stacItemStableKey(item: any): string {
  return `${String(item?.id ?? '')}::${String(item?.collection ?? '')}`;
}

function getStacItemCollection(item: any): string {
  const c = item?.collection;
  if (typeof c === 'string' && c.trim()) return c.trim();
  const pc = item?.properties?.collection;
  if (typeof pc === 'string' && pc.trim()) return pc.trim();
  return '';
}

function getStacItemIdForThumb(item: any): string {
  if (item?.id !== undefined && item?.id !== null) {
    const s = String(item.id).trim();
    if (s) return s;
  }
  const p = item?.properties?.id;
  if (p !== undefined && p !== null) {
    const s = String(p).trim();
    if (s) return s;
  }
  return '';
}

function resolveStacAssetHref(item: any, href: string): string {
  const t = href.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  const self = getStacItemSelfHref(item);
  if (!self) return t;
  try {
    return new URL(t, self).toString();
  } catch {
    return t;
  }
}

function buildPcPreviewPngUrl(
  collection: string,
  itemId: string,
  assets: string,
  assetBidx: string,
  width?: number,
  height?: number,
): string {
  const u = new URL('https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png');
  u.searchParams.set('collection', collection);
  u.searchParams.set('item', itemId);
  u.searchParams.set('assets', assets);
  u.searchParams.set('asset_bidx', assetBidx);
  u.searchParams.set('nodata', '0');
  u.searchParams.set('format', 'png');
  if (width && height) {
    u.searchParams.set('width', String(Math.min(4096, Math.max(64, Math.floor(width)))));
    u.searchParams.set('height', String(Math.min(4096, Math.max(64, Math.floor(height)))));
  }
  return u.toString();
}

function buildPcProcessingPreviewPngUrl(
  collection: string,
  itemId: string,
  spec: {
    assets: string[];
    expression?: string;
    rescale?: string;
    colormapName?: string;
    assetBidx?: string;
  },
  size = 2048,
  bbox?: [number, number, number, number] | null,
  widthOverride?: number,
  heightOverride?: number,
): string {
  const u = new URL('https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png');
  u.searchParams.set('collection', collection);
  u.searchParams.set('item', itemId);
  u.searchParams.set('format', 'png');
  u.searchParams.set('nodata', '0');
  const resolvedWidth = Number.isFinite(widthOverride as number)
    ? Number(widthOverride)
    : Math.max(256, Math.min(4096, Math.floor(size)));
  const resolvedHeight = Number.isFinite(heightOverride as number)
    ? Number(heightOverride)
    : Math.max(256, Math.min(4096, Math.floor(size)));
  u.searchParams.set('width', String(Math.max(256, Math.min(4096, Math.floor(resolvedWidth)))));
  u.searchParams.set('height', String(Math.max(256, Math.min(4096, Math.floor(resolvedHeight)))));
  u.searchParams.set('assets', spec.assets.join(','));
  if (bbox && bbox.length >= 4 && bbox.every(v => Number.isFinite(v))) {
    u.searchParams.set('bbox', bbox.join(','));
  }
  if (spec.assetBidx) u.searchParams.set('asset_bidx', spec.assetBidx);
  if (spec.expression) u.searchParams.set('expression', spec.expression);
  if (spec.rescale) u.searchParams.set('rescale', spec.rescale);
  if (spec.colormapName) u.searchParams.set('colormap_name', spec.colormapName);
  return u.toString();
}

function findStacAssetNameCaseInsensitive(item: any, candidates: string[]): string | null {
  const assets = item?.assets && typeof item.assets === 'object' ? (item.assets as Record<string, unknown>) : null;
  if (!assets) return null;
  for (const candidate of candidates) {
    if (typeof assets[candidate] === 'object') return candidate;
  }
  const entries = Object.keys(assets);
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const hit = entries.find(k => k.toLowerCase() === lower);
    if (hit) return hit;
  }
  return null;
}

function buildProcessingPreviewSpecsForItem(
  templateId: MpcTemplateId,
  item: any,
  indexOverride?: string,
): Array<{
  assets: string[];
  expression?: string;
  rescale?: string;
  colormapName?: string;
  assetBidx?: string;
}> {
  const aliases = {
    red: ['B04', 'red', 'SR_B4', 'b4', 'rededge'],
    blue: ['B02', 'blue', 'SR_B2', 'b2'],
    green: ['B03', 'green', 'SR_B3', 'b3'],
    nir: ['B08', 'nir08', 'nir', 'SR_B5', 'b8', 'b8a', 'B8A', 'B8'],
    rededge: ['B05', 'rededge', 'RE1', 'b5', 'SR_B5'],
    swir11: ['B11', 'swir16', 'swir1', 'SR_B6', 'b11', 'b6'],
    swir12: ['B12', 'swir22', 'swir2', 'SR_B7', 'b12', 'b7'],
  } as const;

  const pick = (keys: readonly string[]) => findStacAssetNameCaseInsensitive(item, [...keys]);
  const red = pick(aliases.red);
  const blue = pick(aliases.blue);
  const green = pick(aliases.green);
  const nir = pick(aliases.nir);
  const rededge = pick(aliases.rededge);
  const swir11 = pick(aliases.swir11);
  const swir12 = pick(aliases.swir12);

  if (indexOverride) {
    const id = String(indexOverride).toUpperCase();
    const NIR = nir ?? 'B08';
    const RED = red ?? 'B04';
    const GREEN = green ?? 'B03';
    const BLUE = blue ?? 'B02';
    const SWIR1 = swir11 ?? 'B11';
    const SWIR2 = swir12 ?? 'B12';
    const RE = rededge ?? 'B05';
    if (id === 'NDVI') return [{ assets: [NIR, RED], expression: `(${NIR}-${RED})/(${NIR}+${RED}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'NDWI') return [{ assets: [GREEN, NIR], expression: `(${GREEN}-${NIR})/(${GREEN}+${NIR}+1e-6)`, rescale: '-1,1', colormapName: 'rdbu' }];
    if (id === 'NDMI') return [{ assets: [NIR, SWIR1], expression: `(${NIR}-${SWIR1})/(${NIR}+${SWIR1}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'SAVI') return [{ assets: [NIR, RED], expression: `1.5*(${NIR}-${RED})/(${NIR}+${RED}+0.5)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'EVI') return [{ assets: [NIR, RED, BLUE], expression: `2.5*(${NIR}-${RED})/(${NIR}+6*${RED}-7.5*${BLUE}+1)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'GNDVI') return [{ assets: [NIR, GREEN], expression: `(${NIR}-${GREEN})/(${NIR}+${GREEN}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'NBR') return [{ assets: [NIR, SWIR2], expression: `(${NIR}-${SWIR2})/(${NIR}+${SWIR2}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'NDRE') return [{ assets: [NIR, RE], expression: `(${NIR}-${RE})/(${NIR}+${RE}+1e-6)`, rescale: '-1,1', colormapName: 'rdylgn' }];
    if (id === 'BSI') return [{ assets: [SWIR1, RED, NIR, BLUE], expression: `((${SWIR1}+${RED})-(${NIR}+${BLUE}))/((${SWIR1}+${RED})+(${NIR}+${BLUE})+1e-6)`, rescale: '-1,1', colormapName: 'rdbu' }];
    if (id === 'MNDWI') return [{ assets: [GREEN, SWIR1], expression: `(${GREEN}-${SWIR1})/(${GREEN}+${SWIR1}+1e-6)`, rescale: '-1,1', colormapName: 'rdbu' }];
    if (id === 'ET') {
      return [{
        assets: [NIR, SWIR1, GREEN],
        expression: `Math.max(0,Math.min(1,1-(0.6*((${NIR}-${SWIR1})/(${NIR}+${SWIR1}+1e-6))+0.4*((${GREEN}-${NIR})/(${GREEN}+${NIR}+1e-6)))))*10`,
        rescale: '0,10',
        colormapName: 'plasma',
      }];
    }
  }

  if (templateId === 'ndvi_s2' || templateId === 'ndvi_landsat') {
    const preferredNir = nir ?? (templateId === 'ndvi_landsat' ? 'nir08' : 'B08');
    const preferredRed = red ?? (templateId === 'ndvi_landsat' ? 'red' : 'B04');
    return [
      {
        assets: [preferredNir, preferredRed],
        expression: `(${preferredNir}-${preferredRed})/(${preferredNir}+${preferredRed}+1e-6)`,
        rescale: '-1,1',
        colormapName: 'rdylgn',
      },
      {
        assets: templateId === 'ndvi_landsat' ? ['nir08', 'red'] : ['B08', 'B04'],
        expression: templateId === 'ndvi_landsat' ? '(nir08-red)/(nir08+red+1e-6)' : '(B08-B04)/(B08+B04+1e-6)',
        rescale: '-1,1',
        colormapName: 'rdylgn',
      },
    ];
  }

  if (templateId === 'ndmi_s2') {
    const preferredNir = nir ?? 'B08';
    const preferredSwir = swir11 ?? 'B11';
    return [
      {
        assets: [preferredNir, preferredSwir],
        expression: `(${preferredNir}-${preferredSwir})/(${preferredNir}+${preferredSwir}+1e-6)`,
        rescale: '-1,1',
        colormapName: 'viridis',
      },
      {
        assets: ['B08', 'B11'],
        expression: '(B08-B11)/(B08+B11+1e-6)',
        rescale: '-1,1',
        colormapName: 'viridis',
      },
    ];
  }

  if (templateId === 'false_color_s2') {
    const a1 = swir12 ?? 'B12';
    const a2 = nir ?? 'B08';
    const a3 = red ?? 'B04';
    return [
      { assets: [a1, a2, a3], assetBidx: `${a1}|1,${a2}|1,${a3}|1` },
      { assets: ['B12', 'B08', 'B04'], assetBidx: 'B12|1,B08|1,B04|1' },
    ];
  }

  const l1 = swir11 ?? 'swir16';
  const l2 = nir ?? 'nir08';
  const l3 = red ?? 'red';
  return [
    { assets: [l1, l2, l3], assetBidx: `${l1}|1,${l2}|1,${l3}|1` },
    { assets: ['swir16', 'nir08', 'red'], assetBidx: 'swir16|1,nir08|1,red|1' },
    ...(green ? [{ assets: [l1, l2, green], assetBidx: `${l1}|1,${l2}|1,${green}|1` }] : []),
  ];
}

async function probeAnalysisEngineBaseUrl(): Promise<string> {
  const candidates: string[] = [];
  const fromEnv = getAnalysisEngineBaseUrl();
  if (fromEnv) candidates.push(fromEnv);
  if (typeof window !== 'undefined') {
    const sameOriginProxy = `${window.location.origin}/analysis-api`;
    if (!candidates.includes(sameOriginProxy)) candidates.push(sameOriginProxy);
    const host = window.location.hostname;
    const onDevHost = host === 'localhost' || host === '127.0.0.1';
    if (onDevHost) {
      candidates.push('http://127.0.0.1:8000', 'http://localhost:8000');
    }
  }
  for (const base of candidates) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 1800);
      const res = await fetch(`${base}/mpc/templates`, { signal: ctrl.signal });
      window.clearTimeout(timer);
      if (res.ok) return base;
    } catch {
      /* try next candidate */
    }
  }
  return '';
}

function stacCatalogLooksLikePlanetaryComputer(config: StacConnectionConfig): boolean {
  if (config.presetId === 'planetary-computer') return true;
  try {
    return /planetarycomputer\.microsoft\.com/i.test(getResolvedStacSearchUrl(config));
  } catch {
    return false;
  }
}

type StacThumbUrlOptions = { forMapOverlay?: boolean };

function getStacItemThumbCandidateUrls(item: any, connection?: StacConnectionConfig, options?: StacThumbUrlOptions): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  const mapOv = Boolean(options?.forMapOverlay);
  const usePcPreview = !connection || stacCatalogLooksLikePlanetaryComputer(connection);
  const coll = getStacItemCollection(item);
  const id = getStacItemIdForThumb(item);

  /**
   * For Mapbox `image` sources the bitmap is stretched to the scene bbox. If we try small STAC
   * `thumbnail` URLs first, fetchStacMapOverlayBlobUrl used to accept 256px images and the map looked blocky.
   * Planetary Computer `item/preview.png` supports up to 4096px â€” try those first for map overlays.
   */
  if (mapOv && usePcPreview && coll && id) {
    for (const sz of [4096, 3072, 2560, 2048, 1536, 1280, 1024]) {
      add(buildPcPreviewPngUrl(coll, id, 'visual', 'visual|1,2,3', sz, sz));
      add(buildPcPreviewPngUrl(coll, id, 'B04,B03,B02', 'B04|1,B03|1,B02|1', sz, sz));
    }
  }

  const a = item?.assets as Record<string, { href?: string } | undefined> | undefined;
  const pick = (k: string) => {
    const h = a?.[k]?.href;
    return typeof h === 'string' && h.trim() ? resolveStacAssetHref(item, h) : '';
  };

  const tci = pick('TCI');
  if (tci && !/\.(tif|tiff|jp2|nc|vrt)(\?|$)/i.test(tci)) add(tci);
  const visual = pick('visual');
  if (visual && !/\.(tif|tiff|jp2|nc|vrt)(\?|$)/i.test(visual)) add(visual);
  const previewKeys = mapOv
    ? (['rendered_preview', 'render', 'preview'] as const)
    : (['rendered_preview', 'render', 'preview', 'thumbnail', 'thumb'] as const);
  for (const key of previewKeys) {
    const u = pick(key);
    if (u) add(u);
  }

  if (usePcPreview && coll && id && !mapOv) {
    add(buildPcPreviewPngUrl(coll, id, 'visual', 'visual|1,2,3', 512, 512));
    add(buildPcPreviewPngUrl(coll, id, 'B04,B03,B02', 'B04|1,B03|1,B02|1', 512, 512));
  }
  return out;
}

function getStacItemThumbHref(item: any, connection?: StacConnectionConfig): string {
  const urls = getStacItemThumbCandidateUrls(item, connection);
  return urls[0] ?? '';
}

const PC_SAS_SIGN_ENDPOINT = 'https://planetarycomputer.microsoft.com/api/sas/v1/sign';

/** Plain object avoids any clash with JS `Map` / map library default exports in some bundler setups. */
const stacSignedHrefCache: Record<string, string> = Object.create(null);

function needsAzureBlobSasSigning(href: string): boolean {
  if (!href || !/^https?:\/\//i.test(href)) return false;
  if (/[?&]sig=/.test(href)) return false;
  return /(?:blob|dfs)\.core\.windows\.net|blob\.storage\.microsoft/i.test(href);
}

async function signStacAssetHrefForDisplay(href: string): Promise<string> {
  const trimmed = href.trim();
  if (!trimmed) return trimmed;
  const cached = stacSignedHrefCache[trimmed];
  if (cached !== undefined) return cached;
  if (!needsAzureBlobSasSigning(trimmed)) {
    stacSignedHrefCache[trimmed] = trimmed;
    return trimmed;
  }
  try {
    const res = await fetch(`${PC_SAS_SIGN_ENDPOINT}?href=${encodeURIComponent(trimmed)}`);
    if (!res.ok) {
      stacSignedHrefCache[trimmed] = trimmed;
      return trimmed;
    }
    const data = (await res.json()) as { href?: string };
    const signed = typeof data.href === 'string' ? data.href.trim() : '';
    const out = signed || trimmed;
    stacSignedHrefCache[trimmed] = out;
    return out;
  } catch {
    stacSignedHrefCache[trimmed] = trimmed;
    return trimmed;
  }
}

function revokeStacMapOverlayBlob(url: string | undefined) {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Download preview bytes with CORS, then return a blob: URL for Mapbox `image` sources.
 * Mapbox sometimes fails to paint remote HTTPS URLs (CORS / redirect); same-origin blobs are reliable.
 */
async function fetchStacMapOverlayBlobUrl(candidateUrls: string[]): Promise<string | null> {
  const isLargeEnoughImage = async (blob: Blob, minDim: number): Promise<boolean> => {
    try {
      const bitmap = await createImageBitmap(blob);
      const ok = bitmap.width >= minDim && bitmap.height >= minDim;
      bitmap.close();
      return ok;
    } catch {
      return true;
    }
  };

  const tryPass = async (minDim: number): Promise<string | null> => {
    for (const raw of candidateUrls) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      let fetchUrl = trimmed;
      if (needsAzureBlobSasSigning(trimmed)) {
        fetchUrl = await signStacAssetHrefForDisplay(trimmed);
        if (!fetchUrl.trim()) continue;
      }
      try {
        const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (blob.size < 32) continue;
        const okType =
          !blob.type ||
          blob.type.startsWith('image/') ||
          blob.type === 'application/octet-stream';
        if (!okType) continue;
        if (!(await isLargeEnoughImage(blob, minDim))) continue;
        return URL.createObjectURL(blob);
      } catch {
        continue;
      }
    }
    return null;
  };

  /** Prefer sharp previews for georeferenced image overlays; avoid stretching tiny thumbnails. */
  return (await tryPass(1536)) ?? (await tryPass(1024)) ?? (await tryPass(768)) ?? (await tryPass(512)) ?? null;
}

function StacExploreThumb({ hrefList, reactKey }: { hrefList: string[]; reactKey: string }) {
  const listSig = hrefList.map(h => String(h).trim()).filter(Boolean).join('\u001e');

  const cleanList = useMemo(() => {
    const parts = listSig.split('\u001e').filter(Boolean);
    const seen = new Set<string>();
    const o: string[] = [];
    for (const t of parts) {
      if (seen.has(t)) continue;
      seen.add(t);
      o.push(t);
    }
    return o;
  }, [listSig]);

  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    revokeBlob();
    setAttempt(0);
    setBroken(false);
    setSrc(null);
  }, [reactKey, listSig, revokeBlob]);

  const href = cleanList[attempt] ?? '';

  useEffect(() => {
    revokeBlob();
    if (!href) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (needsAzureBlobSasSigning(href)) {
        setSrc(null);
        const signed = await signStacAssetHrefForDisplay(href);
        if (!cancelled) setSrc(signed?.trim() ? signed : null);
        return;
      }
      if (/planetarycomputer\.microsoft\.com\/api\/data\//i.test(href)) {
        try {
          const res = await fetch(href, { mode: 'cors' });
          if (!cancelled && res.ok) {
            const blob = await res.blob();
            if (!cancelled && blob.size > 32) {
              const okType =
                !blob.type ||
                blob.type.startsWith('image/') ||
                blob.type === 'application/octet-stream';
              if (okType) {
                const u = URL.createObjectURL(blob);
                blobUrlRef.current = u;
                setSrc(u);
                return;
              }
            }
          }
        } catch {
          /* fall through: try <img src={href}> */
        }
      }
      if (!cancelled) setSrc(href);
    };
    void run();
    return () => {
      cancelled = true;
      revokeBlob();
    };
  }, [href, revokeBlob]);

  const onImgError = useCallback(() => {
    revokeBlob();
    setSrc(null);
    setAttempt(current => {
      const next = current + 1;
      if (next < cleanList.length) return next;
      setBroken(true);
      return current;
    });
  }, [cleanList.length, revokeBlob]);

  if (!cleanList.length || broken) {
    return <div className="si-explore-result-thumb-ph">â€”</div>;
  }
  if (src == null) {
    return <div className="si-explore-result-thumb-ph si-explore-result-thumb-loading" />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="si-explore-result-thumb-img"
      onError={onImgError}
    />
  );
}

function getStacItemSelfHref(item: any): string {
  const links = item?.links;
  if (!Array.isArray(links)) return '';
  const hit = links.find((l: any) => l.rel === 'self' || l.rel === 'item');
  return hit?.href ? String(hit.href) : '';
}

function getStacItemSensorLabel(item: any): string {
  const p = item?.properties || {};
  if (p.platform) return String(p.platform);
  if (p.constellation) return String(p.constellation);
  if (Array.isArray(p.instruments) && p.instruments.length) return String(p.instruments[0]);
  return String(item?.collection ?? 'â€”');
}

const EXPLORE_RESULTS_PAGE_SIZE = 25;

/** Default search footprint (Dubai) when no field layer, pivot, or drawn AOI. */
const DUBAI_STAC_INTERSECTS = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [55.1, 25.0],
      [55.3, 25.0],
      [55.3, 25.2],
      [55.1, 25.2],
      [55.1, 25.0],
    ],
  ],
};
const EARTH_CIRCUMFERENCE_METERS = 40075016.68557849;
const ERROR_FILTER_PATTERNS = [
  'net::ERR_ABORTED',
  'services.sentinel-hub.com/ogc/wms',
  'sh.dataspace.copernicus.eu/ogc/wms',
  'api.mapbox.com/v4/mapbox.satellite'
];

interface WmsLayerInfo {
  name: string;
  title: string;
}

interface CustomLayer {
  id: string;
  name: string;
  geojson: any;
  visible: boolean;
  color?: string;
  source?: 'arcgis' | 'upload' | 'api' | 'stac';
  sourceUrl?: string;
  authToken?: string;
  /** Sanitized ArcGIS `drawingInfo` for Mapbox paint (unique value, class breaks, simple). */
  arcgisDrawingInfo?: Record<string, unknown> | null;
  /** When true, map uses `arcgisDrawingInfo` instead of a single layer color. */
  useArcGisSymbology?: boolean;
  /** Fields/types/domains for attribute table (coded-value descriptions). */
  arcgisLayerDefinition?: ArcgisLayerDefLite | null;
  /** Saved symbology (GIS Mapâ€“aligned); drives Style dialog defaults. */
  symbology?: SymbologyConfig;
  /** When set to `raster`, `raster` uses a Mapbox image source instead of GeoJSON vectors. */
  renderMode?: 'vector' | 'raster';
  raster?: { url: string; coordinates: RasterMapCoordinates };
  /** Session-only layers (GeoTIFF preview / IFC) are not written to localStorage. */
  ephemeral?: boolean;
  importMetadata?: { format?: string; crs?: string; bytes?: number };
  /** Original IFC blob URL for future viewer hooks (session only). */
  bimBlobUrl?: string;
  /** Map identify popup: field visibility, order, groups, and view mode. */
  popupConfig?: SiLayerPopupConfig | null;
  /** 0.05â€“1 â€” scales vector/raster layer draw opacity on the map (GIS-style transparency). */
  mapOpacity?: number;
  /** Attribute field used to label features on the map (GIS-style labeling). Empty/undefined = off. */
  labelFieldName?: string | null;
  /** Human-readable definition query text the user typed (e.g. `crop = wheat`). Empty/undefined = show all. */
  definitionQueryText?: string | null;
  /** Compiled Mapbox filter expression derived from `definitionQueryText`. */
  definitionFilter?: unknown[] | null;
  /** Polygon / point fill tint (GIS `fillColor`). */
  fillColor?: string;
  /** Stroke width (GIS `weight`). */
  weight?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted' | 'dashdot';
  polygonFillAlpha?: number;
  pointRadius?: number;
  fillStyle?: 'solid' | 'pattern' | 'hatch' | 'gradient';
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
  /** Render point features as a registered marker icon (e.g. water-drop) instead of a flat circle. */
  markerImageId?: 'si-water-drop';
}

const SI_TABLE_MAX_FEATURES = 10000;
const SI_LAYER_ACTION_TABLE_ID = 'layer-action-table';

/** Stable id for the Well Site Recommendation output layer in the Layers panel. */
const WELLSITE_RECOMMENDED_LAYER_ID = 'wellsite-recommended-wells';
const WELL_SUITABILITY_LAYER_ID = 'well-suitability-ranked-sites';

type SiTableSearchMode = 'description' | 'code' | 'both';
type SiTableFilterOperator = 'contains' | 'equals' | 'not_equals' | 'empty' | 'not_empty';

function siSanitizeTableFileName(name: string) {
  const trimmed = name.trim() || 'layer';
  const cleaned = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ');
  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

function siComputeFeatureRowKey(feature: any, idx: number, cache: Map<object, string>): string {
  if (feature && typeof feature === 'object') {
    const cached = cache.get(feature);
    if (cached) return cached;
  }
  const direct = feature?.id;
  if (direct !== null && direct !== undefined && direct !== '') return String(direct);
  const props = feature?.properties;
  if (props && typeof props === 'object') {
    const candidates = ['OBJECTID', 'ObjectId', 'objectid', 'FID', 'fid', 'Id', 'ID', 'id'];
    for (const k of candidates) {
      const v = (props as any)[k];
      if (v !== null && v !== undefined && v !== '') {
        const key = `${k}:${String(v)}`;
        if (feature && typeof feature === 'object') cache.set(feature, key);
        return key;
      }
    }
  }
  const key = `idx:${idx}`;
  if (feature && typeof feature === 'object') cache.set(feature, key);
  return key;
}

function migrateStoredSymbology(raw: unknown): SymbologyConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const cr = o.colorRamp;
  let colorRamp: SymbologyColorRamp | undefined;
  if (cr === 'green') colorRamp = 'greens';
  else if (cr === 'warm') colorRamp = 'magma';
  else if (cr === 'viridis' || cr === 'blues' || cr === 'greens' || cr === 'plasma' || cr === 'magma' || cr === 'turbo') {
    colorRamp = cr;
  }
  let style = o.style;
  if (style === 'single') style = 'color';
  if (style === 'classified') style = 'unique';
  let method = o.method;
  if (method === 'natural-breaks') method = 'jenks';
  if (method === 'equal-interval') method = 'equal_interval';
  const out: SymbologyConfig = {};
  if (typeof o.useArcGisOnline === 'boolean') out.useArcGisOnline = o.useArcGisOnline;
  if (typeof style === 'string') out.style = style as SymbologyStyle;
  if (typeof o.field === 'string') out.field = o.field;
  if (typeof o.classes === 'number') out.classes = o.classes;
  if (typeof method === 'string') out.method = method as SymbologyClassMethod;
  if (colorRamp) out.colorRamp = colorRamp;
  if (typeof o.threshold === 'number') out.threshold = o.threshold;
  return Object.keys(out).length ? out : undefined;
}

function parseStoredCustomLayers(raw: string | null): CustomLayer[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (x: unknown) =>
          x &&
          typeof x === 'object' &&
          typeof (x as CustomLayer).id === 'string' &&
          typeof (x as CustomLayer).name === 'string' &&
          (x as CustomLayer).geojson &&
          typeof (x as CustomLayer).geojson === 'object' &&
          typeof (x as CustomLayer).visible === 'boolean',
      )
      .map((x: any) => {
        const migratedSym = migrateStoredSymbology(x.symbology);
        let symbology = migratedSym;
        if (
          typeof symbology?.useArcGisOnline !== 'boolean' &&
          (x.source === 'arcgis' ||
            (x.arcgisDrawingInfo && typeof x.arcgisDrawingInfo === 'object') ||
            (x.arcgisLayerDefinition && typeof x.arcgisLayerDefinition === 'object') ||
            (typeof x.sourceUrl === 'string' && x.sourceUrl.trim()))
        ) {
          const fallbackOnline = typeof x.useArcGisSymbology === 'boolean' ? x.useArcGisSymbology : true;
          symbology = { ...(symbology ?? {}), useArcGisOnline: fallbackOnline };
        }
        return {
          id: String(x.id),
          name: String(x.name),
          geojson: x.geojson,
          visible: Boolean(x.visible),
          color: typeof x.color === 'string' ? x.color : undefined,
          source: x.source === 'arcgis' || x.source === 'upload' || x.source === 'api' || x.source === 'stac' ? x.source : undefined,
          sourceUrl: typeof x.sourceUrl === 'string' ? x.sourceUrl : undefined,
          authToken: typeof x.authToken === 'string' ? x.authToken : undefined,
          arcgisDrawingInfo:
            x.arcgisDrawingInfo && typeof x.arcgisDrawingInfo === 'object' ? (x.arcgisDrawingInfo as Record<string, unknown>) : undefined,
          useArcGisSymbology:
            x.source === 'arcgis'
              ? typeof x.useArcGisSymbology === 'boolean'
                ? x.useArcGisSymbology
                : true
              : typeof x.useArcGisSymbology === 'boolean'
                ? x.useArcGisSymbology
                : undefined,
          arcgisLayerDefinition:
            x.arcgisLayerDefinition && typeof x.arcgisLayerDefinition === 'object'
              ? (x.arcgisLayerDefinition as ArcgisLayerDefLite)
              : undefined,
          symbology,
          renderMode: x.renderMode === 'raster' || x.renderMode === 'vector' ? x.renderMode : undefined,
          raster:
            x.raster && typeof x.raster === 'object' && typeof x.raster.url === 'string' && Array.isArray(x.raster.coordinates)
              ? (x.raster as CustomLayer['raster'])
              : undefined,
          ephemeral: typeof x.ephemeral === 'boolean' ? x.ephemeral : undefined,
          importMetadata: x.importMetadata && typeof x.importMetadata === 'object' ? x.importMetadata : undefined,
          bimBlobUrl: typeof x.bimBlobUrl === 'string' ? x.bimBlobUrl : undefined,
          popupConfig: x.popupConfig ? normalizeSiLayerPopupConfig(x.popupConfig) : undefined,
          mapOpacity:
            typeof x.mapOpacity === 'number' &&
            Number.isFinite(x.mapOpacity) &&
            x.mapOpacity >= 0.05 &&
            x.mapOpacity <= 1
              ? x.mapOpacity
              : undefined,
          labelFieldName: typeof x.labelFieldName === 'string' && x.labelFieldName.trim() ? x.labelFieldName : undefined,
          definitionQueryText:
            typeof x.definitionQueryText === 'string' && x.definitionQueryText.trim() ? x.definitionQueryText : undefined,
          definitionFilter:
            typeof x.definitionQueryText === 'string' && x.definitionQueryText.trim()
              ? siCompileDefinitionQuery(x.definitionQueryText) ?? undefined
              : undefined,
          fillColor: typeof x.fillColor === 'string' ? x.fillColor : undefined,
          weight: typeof x.weight === 'number' && Number.isFinite(x.weight) ? x.weight : undefined,
          strokeStyle:
            x.strokeStyle === 'solid' || x.strokeStyle === 'dashed' || x.strokeStyle === 'dotted' || x.strokeStyle === 'dashdot'
              ? x.strokeStyle
              : undefined,
          polygonFillAlpha:
            typeof x.polygonFillAlpha === 'number' && Number.isFinite(x.polygonFillAlpha) && x.polygonFillAlpha >= 0 && x.polygonFillAlpha <= 1
              ? x.polygonFillAlpha
              : undefined,
          pointRadius:
            typeof x.pointRadius === 'number' && Number.isFinite(x.pointRadius) ? x.pointRadius : undefined,
          fillStyle:
            x.fillStyle === 'solid' || x.fillStyle === 'pattern' || x.fillStyle === 'hatch' || x.fillStyle === 'gradient'
              ? x.fillStyle
              : undefined,
          blendMode:
            x.blendMode === 'multiply' ||
            x.blendMode === 'screen' ||
            x.blendMode === 'overlay' ||
            x.blendMode === 'darken' ||
            x.blendMode === 'lighten' ||
            x.blendMode === 'normal'
              ? x.blendMode
              : undefined,
        };
      });
  } catch {
    return [];
  }
}

function siBimAnchorFootprint(lng: number, lat: number, halfEdgeM = 140): any {
  const cos = Math.max(1e-6, Math.cos((lat * Math.PI) / 180));
  const dLat = halfEdgeM / 111_320;
  const dLng = halfEdgeM / (111_320 * cos);
  const w = lng - dLng;
  const e = lng + dLng;
  const s = lat - dLat;
  const n = lat + dLat;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          kind: 'bim_anchor',
          note:
            'IFC model uploaded. Full 3D geometry needs a BIM viewer; this footprint anchors the file to the current map view.',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        },
      },
    ],
  };
}

function siRasterExtentFootprint(coords: RasterMapCoordinates): any {
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  const w = Math.min(...lngs);
  const e = Math.max(...lngs);
  const s = Math.min(...lats);
  const n = Math.max(...lats);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'raster_extent' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        },
      },
    ],
  };
}

const SI_MAPBOX_POLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const SI_MAPBOX_LINE_ONLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const SI_MAPBOX_LINE_POLY_FILTER: any = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
];
const SI_MAPBOX_POINT_FILTER: any = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

/** Mapbox GL source/layer ids must be alphanumeric + _ - (portal ids may contain other chars). */
const siSafeMapboxLayerId = (value: unknown) =>
  String(value ?? 'layer').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);

function siMapboxZoomScaledLinePaint(linePaint: Record<string, unknown>, op: number): Record<string, unknown> {
  const rawW = linePaint['line-width'];
  const baseLw =
    typeof rawW === 'number' && Number.isFinite(rawW) ? rawW : SI_DEFAULT_VECTOR_LINE_WEIGHT;
  const out: Record<string, unknown> = {
    ...linePaint,
    'line-opacity': linePaint['line-opacity'] ?? op * 0.92,
  };
  if (typeof rawW === 'number' || rawW === undefined) {
    out['line-width'] = [
      'interpolate',
      ['linear'],
      ['zoom'],
      2,
      baseLw * 0.35,
      10,
      baseLw * 0.85,
      16,
      baseLw * 1.25,
    ];
  }
  return out;
}

/** High-contrast defaults for GIS Content portal layers on satellite basemaps. */
const SI_PORTAL_LAYER_VISIBLE_OUTLINE = '#38bdf8';
const SI_PORTAL_LAYER_VISIBLE_FILL_ALPHA = 0.18;

function siDefaultPortalVectorLayerFields() {
  return {
    ...siDefaultNewVectorLayerFields(),
    color: SI_PORTAL_LAYER_VISIBLE_OUTLINE,
    fillColor: SI_PORTAL_LAYER_VISIBLE_OUTLINE,
    weight: 2.25,
    polygonFillAlpha: SI_PORTAL_LAYER_VISIBLE_FILL_ALPHA,
  };
}

type SiMapboxCanvasLike = {
  getSource(id: string): unknown;
  getLayer(id: string): unknown;
  addSource(id: string, spec: object): void;
  addLayer(spec: object, beforeId?: string): void;
  removeLayer(id: string): void;
  removeSource(id: string): void;
  setPaintProperty?(layerId: string, name: string, value: unknown): void;
  setLayoutProperty?(layerId: string, name: string, value: unknown): void;
  setFilter?(layerId: string, filter: unknown): void;
  getStyle(): { layers?: Array<{ id: string }> };
  moveLayer?(id: string, beforeId?: string): void;
  triggerRepaint?(): void;
  hasImage?(id: string): boolean;
  addImage?(id: string, image: unknown, options?: { pixelRatio?: number }): void;
};

/** Mapbox GL JS v3 globe / Standard lighting: custom layers go dark unless emissive. */
const SI_DRAW_FILL_EMISSIVE = { 'fill-emissive-strength': 1 } as const;
const SI_DRAW_LINE_EMISSIVE = { 'line-emissive-strength': 1 } as const;
const SI_DRAW_CIRCLE_EMISSIVE = { 'circle-emissive-strength': 1 } as const;

const SI_AOI_DRAW_LAYER_IDS = [
  'drawn-index-geometry-fill',
  'drawn-index-geometry-line-halo',
  'drawn-index-geometry-line',
  'drawn-index-geometry-point',
  'si-draw-draft-fill',
  'si-draw-draft-poly-halo',
  'si-draw-draft-poly-line',
  'si-draw-draft-line',
  'si-draw-draft-close-hint',
  'si-draw-draft-vertex',
  'si-draw-draft-pt',
  'si-edit-handles-circles',
] as const;

/** Keep AOI sketch layers at the top of the Mapbox style stack. */
function siRaiseAoiDrawingLayers(map: SiMapboxCanvasLike): void {
  if (typeof map.moveLayer !== 'function') return;
  for (const layerId of SI_AOI_DRAW_LAYER_IDS) {
    try {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    } catch {
      /* ignore race during style rebuild */
    }
  }
}

/**
 * Register (once) a luxurious blue water-drop marker icon in the map sprite so
 * point layers (e.g. Recommended Wells) can render as water points instead of
 * flat circles. Returns true when the image is available for use.
 */
function siEnsureWaterDropImage(map: SiMapboxCanvasLike, id: 'si-water-drop' = 'si-water-drop'): boolean {
  try {
    if (typeof map.hasImage === 'function' && map.hasImage(id)) return true;
    if (typeof map.addImage !== 'function' || typeof document === 'undefined') return false;
    const ratio = 2;
    const W = 30;
    const H = 40;
    const canvas = document.createElement('canvas');
    canvas.width = W * ratio;
    canvas.height = H * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.scale(ratio, ratio);

    const cx = W / 2;
    const cy = 15;
    const r = 11;
    const tipY = H - 2.5;

    // Teardrop silhouette: top circle blended into a pointed tip.
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.quadraticCurveTo(cx - r, cy + (tipY - cy) * 0.34, cx - r, cy);
    ctx.arc(cx, cy, r, Math.PI, 0, true);
    ctx.quadraticCurveTo(cx + r, cy + (tipY - cy) * 0.34, cx, tipY);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, cy - r, 0, tipY);
    grad.addColorStop(0, '#7dd3fc');
    grad.addColorStop(0.5, '#38bdf8');
    grad.addColorStop(1, '#0284c7');
    ctx.shadowColor = 'rgba(2, 23, 51, 0.45)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.5;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.stroke();

    // Glossy highlight.
    ctx.beginPath();
    ctx.ellipse(cx - 3.2, cy - 2.6, 3.1, 4.4, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    map.addImage(id, img, { pixelRatio: ratio });
    return typeof map.hasImage === 'function' ? map.hasImage(id) : true;
  } catch {
    return false;
  }
}

const SI_MAPBOX_CUSTOM_LAYER_SUFFIXES = ['-fill', '-line', '-circle', '-marker', '-cluster', '-cluster-count', '-raster', '-label'] as const;

/**
 * Compile a simple `field op value` definition query into a Mapbox filter expression.
 * Supported operators: `=`, `==`, `!=`, `>`, `>=`, `<`, `<=`, `~` (case-insensitive contains).
 * `fieldNames` (optional) is used to resolve the field name case-insensitively. Returns
 * `null` when the text cannot be parsed.
 */
function siCompileDefinitionQuery(text: string, fieldNames?: string[]): unknown[] | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const m = raw.match(/^\s*([^<>=!~]+?)\s*(>=|<=|!=|==|=|>|<|~)\s*(.+?)\s*$/);
  if (!m) return null;
  let field = m[1].trim().replace(/^["'\[]+|["'\]]+$/g, '').trim();
  const op = m[2];
  let valueRaw = m[3].trim().replace(/^["']|["']$/g, '');
  if (!field) return null;
  if (Array.isArray(fieldNames) && fieldNames.length) {
    const hit = fieldNames.find(f => f.toLowerCase() === field.toLowerCase());
    if (hit) field = hit;
  }
  const num = Number(valueRaw);
  const isNum = valueRaw !== '' && Number.isFinite(num);
  const getStr = ['to-string', ['get', field]];
  const getNum = ['to-number', ['get', field]];
  switch (op) {
    case '~':
      return ['!=', ['index-of', valueRaw.toLowerCase(), ['downcase', getStr]], -1];
    case '!=':
      return isNum ? ['!=', getNum, num] : ['!=', getStr, valueRaw];
    case '=':
    case '==':
      return isNum ? ['==', getNum, num] : ['==', getStr, valueRaw];
    case '>':
      return isNum ? ['>', getNum, num] : ['>', getStr, valueRaw];
    case '>=':
      return isNum ? ['>=', getNum, num] : ['>=', getStr, valueRaw];
    case '<':
      return isNum ? ['<', getNum, num] : ['<', getStr, valueRaw];
    case '<=':
      return isNum ? ['<=', getNum, num] : ['<=', getStr, valueRaw];
    default:
      return null;
  }
}

function siRemoveMapboxCustomLayerStack(map: SiMapboxCanvasLike, sourceId: string) {
  for (const suffix of SI_MAPBOX_CUSTOM_LAYER_SUFFIXES) {
    const lid = `${sourceId}${suffix}`;
    try {
      if (map.getLayer(lid)) map.removeLayer(lid);
    } catch {
      /* ignore */
    }
  }
  try {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch {
    /* ignore */
  }
}

/**
 * Show/hide every sub-layer (fill, line, circle, cluster, raster, labelâ€¦) of a custom layer
 * via the Mapbox `visibility` layout property. Toggling visibility â€” instead of removing and
 * re-adding the layer stack â€” is instant, keeps all geometry types in sync, and preserves the
 * exact draw order (z-index) when a layer is switched back on (QGIS/ArcGIS-style behaviour).
 */
function siSetMapboxCustomLayerStackVisibility(
  map: SiMapboxCanvasLike,
  sourceId: string,
  visible: boolean,
) {
  if (typeof map.setLayoutProperty !== 'function') return;
  const value = visible ? 'visible' : 'none';
  for (const suffix of SI_MAPBOX_CUSTOM_LAYER_SUFFIXES) {
    const lid = `${sourceId}${suffix}`;
    if (!map.getLayer(lid)) continue;
    try {
      map.setLayoutProperty(lid, 'visibility', value);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Floating, portal-positioned layer-options menu (ArcGIS / layer-tree style). The â‹¯
 * trigger lives inline in the layer row, but the menu is rendered to document.body and
 * positioned via the trigger's bounding box so it never gets clipped by the compact
 * panel's overflow and always floats cleanly above the dock.
 */
function SiLayerOptionsMenuPortal({
  open,
  layerLabel,
  onToggleOpen,
  children,
}: {
  open: boolean;
  layerLabel: string;
  onToggleOpen: () => void;
  children: ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = 224;
    const margin = 8;
    const gap = 6;
    // Measure the real menu height when available so tall menus are positioned
    // (and clamped) to stay fully on screen — never clipped by the viewport edge.
    const measured = popRef.current?.scrollHeight ?? 0;
    const estHeight = Math.min(Math.max(measured || 380, 220), window.innerHeight - margin * 2);
    let left = r.right - width;
    if (left < margin) left = margin;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;

    const spaceBelow = window.innerHeight - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    let top: number;
    let maxHeight: number;
    if (estHeight <= spaceBelow || spaceBelow >= spaceAbove) {
      // Open downward (preferred when it fits or there's more room below).
      top = r.bottom + gap;
      maxHeight = Math.max(160, Math.min(estHeight, spaceBelow));
    } else {
      // Flip above the trigger and clamp to the room available there.
      maxHeight = Math.max(160, Math.min(estHeight, spaceAbove));
      top = Math.max(margin, r.top - gap - maxHeight);
    }
    setCoords({ top, left, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
    else setCoords(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onReflow = () => place();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={'si-env-layer-action-btn si-env-layer-action-btn--menu' + (open ? ' is-active' : '')}
        title="Layer options (zoom, table, symbology, pop-ups, opacity, orderâ€¦)"
        aria-label={`Layer options for ${layerLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => {
          e.stopPropagation();
          onToggleOpen();
        }}
      >
        <i className="fa-solid fa-ellipsis" aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={popRef}
              className="si-env-layer-options-menu si-env-layer-options-menu--floating"
              role="menu"
              style={{
                position: 'fixed',
                top: coords ? coords.top : -9999,
                left: coords ? coords.left : -9999,
                maxHeight: coords ? coords.maxHeight : undefined,
                visibility: coords ? 'visible' : 'hidden',
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function siMapboxInsertBeforeId(map: SiMapboxCanvasLike): string | undefined {
  try {
    const layers = map.getStyle()?.layers;
    if (!Array.isArray(layers)) return undefined;
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const id = layers[i]?.id;
      if (!id) continue;
      if (id.includes('label') || id.includes('symbol') || id.startsWith('place-')) return id;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function siApplyMapboxPaintProps(
  map: SiMapboxCanvasLike,
  layerId: string,
  paint: Record<string, unknown>,
) {
  if (!map.getLayer(layerId) || typeof map.setPaintProperty !== 'function') return;
  for (const [name, value] of Object.entries(paint)) {
    try {
      map.setPaintProperty(layerId, name, value);
    } catch {
      /* ignore */
    }
  }
}

function siPaintCustomLayersOnMapboxCanvas(
  map: SiMapboxCanvasLike,
  layers: CustomLayer[],
  trackedSourceIds: Set<string>,
  options?: { suppressPrimaryAoiFill?: boolean },
) {
  const nextSourceIds = new Set<string>();
  const beforeId = siMapboxInsertBeforeId(map);

  for (const layer of layers) {
    // Layers with no geometry yet (e.g. an empty shell awaiting features) are skipped.
    // Hidden layers are NOT skipped: we keep their stack mounted and flip the Mapbox
    // `visibility` property so toggling is instant and preserves draw order (z-index).
    if (!layer.geojson) continue;
    const sourceId = siSafeMapboxLayerId(layer.id);
    nextSourceIds.add(sourceId);
    const layerVisible = layer.visible !== false;
    const op = layer.mapOpacity ?? 1;

    try {
      if (layer.renderMode === 'raster' && layer.raster?.url && layer.raster.coordinates) {
        const rasterId = `${sourceId}-raster`;
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'image',
            url: layer.raster.url,
            coordinates: layer.raster.coordinates,
          });
        }
        if (!map.getLayer(rasterId)) {
          map.addLayer(
            {
              id: rasterId,
              type: 'raster',
              source: sourceId,
              layout: { visibility: layerVisible ? 'visible' : 'none' },
              paint: { 'raster-opacity': 0.92 * op, 'raster-fade-duration': 0 },
            },
            beforeId,
          );
        } else {
          siApplyMapboxPaintProps(map, rasterId, { 'raster-opacity': 0.92 * op });
        }
        siSetMapboxCustomLayerStackVisibility(map, sourceId, layerVisible);
        continue;
      }

      const src = map.getSource(sourceId) as { setData?: (d: unknown) => void } | undefined;
      if (src?.setData) {
        src.setData(layer.geojson);
      } else {
        siRemoveMapboxCustomLayerStack(map, sourceId);
        map.addSource(sourceId, {
          type: 'geojson',
          data: layer.geojson,
          tolerance: 0.8,
          buffer: 64,
          maxzoom: 14,
        });
      }

      const st = siLayerMapboxStylePack(layer);
      let fillPaint = siScalePaintOpacityByFactor(st.fillPaint as Record<string, unknown>, op);
      if (
        options?.suppressPrimaryAoiFill &&
        String(layer.id) === AGRO_STRUCTURES_PRIMARY_LAYER_ID
      ) {
        fillPaint = { ...fillPaint, 'fill-opacity': 0 };
      }
      const linePaint = siMapboxZoomScaledLinePaint(
        siScalePaintOpacityByFactor(st.linePaint as Record<string, unknown>, op),
        op,
      );
      const circlePaintRaw = siScalePaintOpacityByFactor(st.circlePaint as Record<string, unknown>, op);
      let circlePaint =
        op < 0.999 && circlePaintRaw['circle-opacity'] === undefined
          ? { ...circlePaintRaw, 'circle-opacity': op }
          : circlePaintRaw;

      // Marker mode: points render as a registered icon (e.g. water-drop). The
      // circle stays mounted but fully transparent so hit-testing / identify keep
      // working; the visible glyph is the icon symbol drawn on top.
      const markerImageId = layer.markerImageId;
      const useMarker = !!markerImageId && siEnsureWaterDropImage(map, markerImageId);
      if (useMarker) {
        circlePaint = {
          ...circlePaint,
          'circle-radius': typeof layer.pointRadius === 'number' ? Math.max(6, layer.pointRadius) : 8,
          'circle-opacity': 0,
          'circle-stroke-width': 0,
        };
      }

      const fillId = `${sourceId}-fill`;
      const lineId = `${sourceId}-line`;
      const circleId = `${sourceId}-circle`;
      const markerId = `${sourceId}-marker`;
      const labelId = `${sourceId}-label`;

      // Definition query â€” combine the user's compiled filter (e.g. `crop = wheat`)
      // with each geometry-type base filter so only matching features are drawn.
      const defFilter =
        Array.isArray(layer.definitionFilter) && layer.definitionFilter.length ? layer.definitionFilter : null;
      const withDef = (base: unknown): unknown =>
        defFilter ? (Array.isArray(base) ? ['all', base, defFilter] : defFilter) : base;
      const fillFilter = withDef(st.fillFilter);
      const lineFilter = withDef(st.lineFilter);
      const pointFilter = withDef(st.pointFilter);

      const initialVisibility = { visibility: layerVisible ? 'visible' : 'none' } as const;
      if (!map.getLayer(fillId)) {
        map.addLayer({ id: fillId, type: 'fill', source: sourceId, filter: fillFilter, layout: initialVisibility, paint: fillPaint }, beforeId);
      } else {
        siApplyMapboxPaintProps(map, fillId, fillPaint);
        try { map.setFilter?.(fillId, fillFilter); } catch { /* ignore */ }
      }
      if (!map.getLayer(lineId)) {
        map.addLayer({ id: lineId, type: 'line', source: sourceId, filter: lineFilter, layout: initialVisibility, paint: linePaint }, beforeId);
      } else {
        siApplyMapboxPaintProps(map, lineId, linePaint);
        try { map.setFilter?.(lineId, lineFilter); } catch { /* ignore */ }
      }
      if (!map.getLayer(circleId)) {
        map.addLayer({ id: circleId, type: 'circle', source: sourceId, filter: pointFilter, layout: initialVisibility, paint: circlePaint }, beforeId);
      } else {
        siApplyMapboxPaintProps(map, circleId, circlePaint);
        try { map.setFilter?.(circleId, pointFilter); } catch { /* ignore */ }
      }

      // Icon marker (water-drop) drawn above the transparent circle.
      if (useMarker) {
        const markerSize = typeof layer.pointRadius === 'number' ? Math.max(0.6, layer.pointRadius / 9) : 0.85;
        const markerLayout = {
          visibility: layerVisible ? 'visible' : 'none',
          'icon-image': markerImageId,
          'icon-size': markerSize,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        };
        const markerPaint = { 'icon-opacity': op };
        if (!map.getLayer(markerId)) {
          map.addLayer({ id: markerId, type: 'symbol', source: sourceId, filter: pointFilter, layout: markerLayout, paint: markerPaint }, beforeId);
        } else {
          try {
            map.setLayoutProperty?.(markerId, 'icon-image', markerImageId);
            map.setLayoutProperty?.(markerId, 'icon-size', markerSize);
            map.setFilter?.(markerId, pointFilter);
          } catch { /* ignore */ }
          siApplyMapboxPaintProps(map, markerId, markerPaint);
        }
      } else if (map.getLayer(markerId)) {
        try { map.removeLayer(markerId); } catch { /* ignore */ }
      }

      // Labeling â€” one text label per feature drawn from the chosen attribute field.
      const labelField =
        typeof layer.labelFieldName === 'string' && layer.labelFieldName.trim() ? layer.labelFieldName.trim() : '';
      if (labelField) {
        const textField = ['coalesce', ['to-string', ['get', labelField]], ''];
        const labelLayout = {
          visibility: layerVisible ? 'visible' : 'none',
          'text-field': textField,
          'text-size': 12,
          'text-anchor': 'center',
          'text-justify': 'center',
          'text-allow-overlap': false,
          'text-padding': 2,
          'symbol-placement': 'point',
        };
        const labelPaint = {
          'text-color': '#f8fafc',
          'text-halo-color': 'rgba(2, 6, 23, 0.9)',
          'text-halo-width': 1.4,
          'text-opacity': op,
        };
        if (!map.getLayer(labelId)) {
          map.addLayer(
            {
              id: labelId,
              type: 'symbol',
              source: sourceId,
              ...(defFilter ? { filter: defFilter } : {}),
              layout: labelLayout,
              paint: labelPaint,
            },
            beforeId,
          );
        } else {
          try {
            map.setLayoutProperty?.(labelId, 'text-field', textField);
            map.setFilter?.(labelId, defFilter);
          } catch {
            /* ignore */
          }
          siApplyMapboxPaintProps(map, labelId, labelPaint);
        }
      } else if (map.getLayer(labelId)) {
        try {
          map.removeLayer(labelId);
        } catch {
          /* ignore */
        }
      }

      // Sync the show/hide toggle to the map: flip every sub-layer's `visibility`
      // in lock-step so fill + line + circle + label respond together and the draw
      // order is preserved when the layer is switched back on.
      siSetMapboxCustomLayerStackVisibility(map, sourceId, layerVisible);
    } catch (err) {
      console.warn('Satellite Intelligence: could not paint custom layer on map canvas', sourceId, err);
    }
  }

  // Only layers that were truly removed from the panel (not merely hidden) are torn
  // down here â€” hidden layers stay mounted with visibility:none for instant toggling.
  for (const staleId of trackedSourceIds) {
    if (!nextSourceIds.has(staleId)) siRemoveMapboxCustomLayerStack(map, staleId);
  }
  trackedSourceIds.clear();
  nextSourceIds.forEach(id => trackedSourceIds.add(id));

  try {
    map.triggerRepaint?.();
  } catch {
    /* ignore */
  }
  // Portal / custom vectors remount above React-managed AOI sketch layers — restore draw stack.
  siRaiseAoiDrawingLayers(map);
}

/** Mapbox layer id `${sourceId}-fill|line|circle|cluster|cluster-count` â†’ custom layer source id. */
function siVectorLayerIdToCustomSourceId(mapboxLayerId: string): string | null {
  const m = mapboxLayerId.match(/^(.+)-(fill|line|circle|marker|cluster|cluster-count)$/);
  return m ? m[1] : null;
}

function siIdentifyLayerIsSkippable(layerId: string): boolean {
  if (!layerId) return true;
  if (layerId.startsWith('si-crop-alert-')) return true;
  if (layerId.startsWith('si-geo-ai-pin')) return true;
  if (layerId.startsWith('si-geo-ai-sel-')) return true;
  if (layerId.startsWith('si-draw-draft')) return true;
  if (layerId.startsWith('si-edit-handles')) return true;
  if (layerId === 'sentinel-layer' || layerId.startsWith('sentinel-layer-') || layerId === 'si-stac-thumb-layer') return true;
  if (layerId === 'background') return true;
  return false;
}

function siGeoJsonPointishFeatureCount(gj: unknown): number {
  if (!gj || typeof gj !== 'object') return 0;
  const feats = (gj as { features?: unknown[] }).features;
  if (!Array.isArray(feats)) return 0;
  let n = 0;
  for (const ft of feats) {
    const g = (ft as { geometry?: { type?: string; coordinates?: unknown } })?.geometry;
    const t = g?.type;
    if (t === 'Point') n += 1;
    else if (t === 'MultiPoint' && Array.isArray(g?.coordinates)) n += g.coordinates.length;
  }
  return n;
}

function siCustomLayerShouldClusterPoints(layer: { renderMode?: string; geojson?: unknown }): boolean {
  if (layer.renderMode === 'raster' || !layer.geojson) return false;
  return siGeoJsonPointishFeatureCount(layer.geojson) >= GEO_AI_CLUSTER_POINT_THRESHOLD;
}

function siIdentifyTitleForLayerId(layerId: string, customLayers: CustomLayer[]): string {
  const sid = siVectorLayerIdToCustomSourceId(layerId);
  if (sid) {
    const c = customLayers.find(l => siSafeMapboxLayerId(l.id) === sid);
    if (c?.name) return c.name;
  }
  if (layerId.startsWith('agri-pivots')) return 'Pivot markers';
  if (layerId.startsWith('si-stac-footprints')) return 'STAC footprint';
  if (layerId.startsWith('drawn-index-geometry')) return 'Drawn AOI';
  return layerId.replace(/-(fill|line|circle)$/, '') || 'Feature';
}

function siArcgisDefForIdentifyLayerId(layerId: string, customLayers: CustomLayer[]): ArcgisLayerDefLite | null {
  const sid = siVectorLayerIdToCustomSourceId(layerId);
  if (!sid) return null;
  const c = customLayers.find(l => siSafeMapboxLayerId(l.id) === sid);
  return c?.arcgisLayerDefinition && typeof c.arcgisLayerDefinition === 'object' ? c.arcgisLayerDefinition : null;
}

function siSanitizeIdentifyProperties(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('mapbox_')) continue;
    if (k === 'layer' || k === 'id' || k === 'source_layer') continue;
    out[k] = v;
  }
  return out;
}

/** Line / point fallback when honoring ArcGIS drawingInfo â€” avoids Mapbox brand greens on service symbology. */
const SI_ARCGIS_MAPBOX_NEUTRAL_LINE = 'rgba(148, 163, 184, 0.55)';
const SI_ARCGIS_MAPBOX_NEUTRAL_STROKE = 'rgba(15, 23, 42, 0.72)';

function pickSiCustomLayerStyleSnapshot(l: CustomLayer): Partial<CustomLayer> {
  return {
    symbology: l.symbology ? { ...l.symbology } : undefined,
    color: l.color,
    fillColor: l.fillColor,
    weight: l.weight,
    strokeStyle: l.strokeStyle,
    polygonFillAlpha: l.polygonFillAlpha,
    pointRadius: l.pointRadius,
    fillStyle: l.fillStyle,
    blendMode: l.blendMode,
    mapOpacity: l.mapOpacity,
    useArcGisSymbology: l.useArcGisSymbology,
    arcgisDrawingInfo: l.arcgisDrawingInfo,
  };
}

function siLayerMapboxStylePack(layer: CustomLayer): {
  fillFilter: any;
  lineFilter: any;
  pointFilter: any;
  fillPaint: Record<string, unknown>;
  linePaint: Record<string, unknown>;
  circlePaint: Record<string, unknown>;
} {
  const useAg = layer.source === 'arcgis' && layer.useArcGisSymbology !== false && layer.arcgisDrawingInfo;
  if (useAg) {
    const di = layer.arcgisDrawingInfo as any;
    const fill = arcgisDrawingInfoToFillPaint(di);
    const line = arcgisDrawingInfoToLinePaint(di, SI_ARCGIS_MAPBOX_NEUTRAL_LINE);
    if (fill) {
      const outlineDriven = Object.prototype.hasOwnProperty.call(fill, 'fill-outline-color');
      return {
        fillFilter: SI_MAPBOX_POLY_FILTER,
        lineFilter: outlineDriven ? SI_MAPBOX_LINE_ONLY_FILTER : SI_MAPBOX_LINE_POLY_FILTER,
        pointFilter: SI_MAPBOX_POINT_FILTER,
        fillPaint: fill as Record<string, unknown>,
        linePaint: (line ?? {
          'line-color': SI_ARCGIS_MAPBOX_NEUTRAL_LINE,
          'line-width': 1.5,
          'line-opacity': 0.95,
        }) as Record<string, unknown>,
        circlePaint: {
          'circle-radius': 4,
          'circle-color': SI_ARCGIS_MAPBOX_NEUTRAL_LINE,
          'circle-stroke-width': 1,
          'circle-stroke-color': SI_ARCGIS_MAPBOX_NEUTRAL_STROKE,
        },
      };
    }
    return {
      fillFilter: SI_MAPBOX_POLY_FILTER,
      lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
      pointFilter: SI_MAPBOX_POINT_FILTER,
      fillPaint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0 },
      linePaint: (line ?? {
        'line-color': SI_ARCGIS_MAPBOX_NEUTRAL_LINE,
        'line-width': 1.25,
        'line-opacity': 0.85,
      }) as Record<string, unknown>,
      circlePaint: {
        'circle-radius': 4,
        'circle-color': SI_ARCGIS_MAPBOX_NEUTRAL_LINE,
        'circle-stroke-width': 1,
        'circle-stroke-color': SI_ARCGIS_MAPBOX_NEUTRAL_STROKE,
      },
    };
  }
  return buildSiCustomVectorStylePack({
    geojson: layer.geojson,
    source: layer.source,
    symbology: layer.symbology,
    color: layer.color,
    fillColor: layer.fillColor,
    weight: layer.weight,
    strokeStyle: layer.strokeStyle as any,
    polygonFillAlpha: layer.polygonFillAlpha,
    pointRadius: layer.pointRadius,
    fillStyle: layer.fillStyle as any,
    canUseArcGisOnline:
      layer.source === 'arcgis' ||
      Boolean(layer.arcgisDrawingInfo) ||
      Boolean((layer.arcgisLayerDefinition as any)?.drawingInfo),
  });
}

/** Multiply numeric *-opacity paint props for per-layer transparency (Mapbox GL). */
function siScalePaintOpacityByFactor(paint: Record<string, unknown>, factor: number): Record<string, unknown> {
  if (!paint || factor >= 0.999) return paint;
  const out: Record<string, unknown> = { ...paint };
  for (const [k, v] of Object.entries(out)) {
    if (!k.includes('opacity')) continue;
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = Math.min(1, Math.max(0, v * factor));
    }
  }
  return out;
}

function persistCustomLayersToStorage(layers: CustomLayer[], storageKey = SATELLITE_CUSTOM_LAYERS_STORAGE_KEY) {
  if (typeof window === 'undefined') return;
  try {
    const storable = layers.filter(l => !l.ephemeral);
    window.localStorage.setItem(storageKey, JSON.stringify(storable));
  } catch (e) {
    console.warn('Satellite Intelligence: could not persist custom layers', e);
  }
}

/** Symbology dialog state (GIS Map LayerManager schema + ArcGIS max-class bake slider). */
type SiSymbologyDraft = Required<SymbologyConfig> & { arcgisMaxCategories: number };

type SiBakeRamp = SymbologyColorRamp | 'service';

type AddLayerTab = 'giscontent' | 'arcgis' | 'upload' | 'database' | 'url' | 'raster';

type SiGetDataPickAction =
  | { kind: 'tab'; tab: AddLayerTab; presetRemoteUrl?: string; statusHint?: string }
  | { kind: 'gis-map' }
  | { kind: 'sql'; platform: (typeof DATABASE_PLATFORM_OPTIONS)[number] }
  | { kind: 'toast'; message: string };

type SiGetDataSourceEntry = {
  id: string;
  title: string;
  description: string;
  iconClass: string;
  action: SiGetDataPickAction;
};

/** Power BIâ€“style â€œCommon data sourcesâ€ â€” routes into existing Satellite import tabs / SQL profile. */
const SI_GET_DATA_COMMON_SOURCES: SiGetDataSourceEntry[] = [
  {
    id: 'excel',
    title: 'Excel workbook',
    description: '.xlsx / .xls â€” use Upload after saving as CSV (with lat/lon) or as GeoJSON for mapping.',
    iconClass: 'fa-solid fa-file-excel',
    action: { kind: 'tab', tab: 'upload', statusHint: 'Excel: convert to CSV with coordinates or GeoJSON, then use Upload.' },
  },
  {
    id: 'csv',
    title: 'Text / CSV',
    description: 'Delimited text â€” include latitude / longitude columns for point layers.',
    iconClass: 'fa-solid fa-file-csv',
    action: { kind: 'tab', tab: 'upload', statusHint: 'CSV: Upload tab â€” ensure lat/lon column names (lat, lon, latitude, longitude, â€¦).' },
  },
  {
    id: 'json-geojson',
    title: 'JSON / GeoJSON file',
    description: 'FeatureCollection or single Feature â€” same as spatial upload.',
    iconClass: 'fa-solid fa-file-code',
    action: { kind: 'tab', tab: 'upload', statusHint: 'Upload .json or .geojson from the Upload tab.' },
  },
  {
    id: 'semantic-models',
    title: 'Semantic model (Power BIâ€“style)',
    description: 'Hosted datasets â€” connect via SQL or OData when your workspace exposes them.',
    iconClass: 'fa-solid fa-chart-simple',
    action: { kind: 'toast', message: 'Semantic models require a workspace connector â€” use SQL or OData for now.' },
  },
  {
    id: 'dataflows',
    title: 'Dataflows',
    description: 'Prepared ETL outputs â€” planned for enterprise connector.',
    iconClass: 'fa-solid fa-diagram-project',
    action: { kind: 'toast', message: 'Dataflows connector is not wired yet â€” export to CSV/Parquet or use Web / SQL.' },
  },
  {
    id: 'dataverse',
    title: 'Dataverse',
    description: 'Microsoft Dataverse / Dynamics tables â€” OData or SQL gateway.',
    iconClass: 'fa-solid fa-cloud',
    action: { kind: 'toast', message: 'Dataverse: use OData feed URL from the Web tab when available from your tenant.' },
  },
  {
    id: 'sql-server',
    title: 'SQL Server',
    description: 'Relational database â€” connection profile (in-app, future gateway).',
    iconClass: 'fa-solid fa-server',
    action: { kind: 'sql', platform: 'SQL Server' },
  },
  {
    id: 'analysis-services',
    title: 'Analysis Services',
    description: 'Tabular / multidimensional â€” use SQL transport or export to CSV for this client.',
    iconClass: 'fa-solid fa-cube',
    action: { kind: 'toast', message: 'Analysis Services: use SQL connection string profile below, or export a slice to CSV.' },
  },
  {
    id: 'postgres',
    title: 'PostgreSQL',
    description: 'Postgres / PostGIS-friendly profile.',
    iconClass: 'fa-solid fa-database',
    action: { kind: 'sql', platform: 'PostgreSQL' },
  },
  {
    id: 'oracle',
    title: 'Oracle',
    description: 'Oracle Database connection profile.',
    iconClass: 'fa-solid fa-database',
    action: { kind: 'sql', platform: 'Oracle' },
  },
  {
    id: 'snowflake',
    title: 'Snowflake',
    description: 'Cloud warehouse â€” JDBC/ODBC-style profile fields.',
    iconClass: 'fa-solid fa-snowflake',
    action: { kind: 'sql', platform: 'Snowflake' },
  },
  {
    id: 'bigquery',
    title: 'Google BigQuery',
    description: 'BigQuery project connection profile.',
    iconClass: 'fa-solid fa-table',
    action: { kind: 'sql', platform: 'BigQuery' },
  },
  {
    id: 'web',
    title: 'Web',
    description: 'Anonymous HTTP â€” GeoJSON, ZIP, KML, or other file URLs.',
    iconClass: 'fa-solid fa-globe',
    action: { kind: 'tab', tab: 'url', statusHint: 'Paste a direct https URL to GeoJSON, ZIP (shapefile/KMZ), or KML.' },
  },
  {
    id: 'odata',
    title: 'OData feed',
    description: 'Open Data Protocol â€” public TripPin sample URL prefilled; replace with your service root.',
    iconClass: 'fa-solid fa-table-list',
    action: {
      kind: 'tab',
      tab: 'url',
      presetRemoteUrl: 'https://services.odata.org/V4/TripPinServiceRW/',
      statusHint: 'OData: URL tab opened â€” replace with your $metadata root or file export URL when supported.',
    },
  },
  {
    id: 'rest-json',
    title: 'REST API (JSON)',
    description: 'GET endpoint returning GeoJSON or downloadable JSON â€” same as From URL.',
    iconClass: 'fa-solid fa-code',
    action: { kind: 'tab', tab: 'url', statusHint: 'REST JSON: use From URL with a stable GeoJSON or file endpoint.' },
  },
  {
    id: 'geotiff-url',
    title: 'Raster / GeoTIFF (URL)',
    description: 'GeoTIFF, image service, or tile endpoint path.',
    iconClass: 'fa-regular fa-image',
    action: { kind: 'tab', tab: 'raster', statusHint: 'Raster URL: paste path or HTTPS URL to GeoTIFF / image service.' },
  },
  {
    id: 'shapefile',
    title: 'Shapefile (ZIP)',
    description: 'Esri shapefile compressed in .zip â€” use Upload.',
    iconClass: 'fa-solid fa-draw-polygon',
    action: { kind: 'tab', tab: 'upload', statusHint: 'Shapefile: Upload tab â€” .zip containing .shp/.dbf/.shx.' },
  },
  {
    id: 'kml-kmz',
    title: 'KML / KMZ',
    description: 'Google Earth / OGC KML â€” upload or URL.',
    iconClass: 'fa-solid fa-location-dot',
    action: { kind: 'tab', tab: 'upload', statusHint: 'KML/KMZ: use Upload, or paste a .kml/.kmz URL under From URL.' },
  },
  {
    id: 'arcgis',
    title: 'ArcGIS Feature Service',
    description: 'FeatureServer layer URL â€” discover and add layers.',
    iconClass: 'fa-solid fa-link',
    action: { kind: 'tab', tab: 'arcgis', statusHint: 'ArcGIS: paste Feature Service URL, then Connect & Discover.' },
  },
  {
    id: 'gis-map',
    title: 'GIS Content',
    description: 'Hosted feature layers saved in the GIS Content portal.',
    iconClass: 'fa-solid fa-layer-group',
    action: { kind: 'gis-map' },
  },
];

const SI_GET_DATA_MENU_SECTIONS: { id: string; title: string; sourceIds: string[] }[] = [
  { id: 'files', title: 'Files & spatial formats', sourceIds: ['excel', 'csv', 'json-geojson', 'shapefile', 'kml-kmz', 'geotiff-url'] },
  { id: 'web', title: 'Web & services', sourceIds: ['web', 'odata', 'rest-json', 'arcgis'] },
  { id: 'bi', title: 'Business intelligence', sourceIds: ['semantic-models', 'dataflows', 'dataverse'] },
  { id: 'db', title: 'Databases', sourceIds: ['sql-server', 'analysis-services', 'postgres', 'oracle', 'snowflake', 'bigquery'] },
  { id: 'local', title: 'This workspace', sourceIds: ['gis-map'] },
]

function siGetDataMenuSections(): Array<{ id: string; title: string; sources: SiGetDataSourceEntry[] }> {
  const byId = new Map(SI_GET_DATA_COMMON_SOURCES.map(s => [s.id, s]))
  return SI_GET_DATA_MENU_SECTIONS.map(section => ({
    id: section.id,
    title: section.title,
    sources: section.sourceIds.map(id => byId.get(id)).filter((s): s is SiGetDataSourceEntry => Boolean(s)),
  })).filter(section => section.sources.length > 0)
}

type EnvironmentalIndexId = 'NDWI' | 'NDMI' | 'EVI' | 'SAVI' | 'NDSI' | 'ET' | 'LST';

/** ArcGIS-style tool ids: order matches vertical toolbar (draw â†’ sep â†’ selection). */
type MapDrawTool =
  | 'select'
  | 'point'
  | 'polyline'
  | 'polygon'
  | 'rectangle'
  | 'circle'
  | 'freehand'
  | 'text'
  | 'box_select'
  | 'lasso';

const RS_SKETCH_DRAW_TOOLS = new Set<MapDrawTool>(['point', 'polygon', 'rectangle', 'circle']);

function isRsSketchDrawTool(tool: MapDrawTool): boolean {
  return RS_SKETCH_DRAW_TOOLS.has(tool);
}

interface DrawnAoiStats {
  mean: number;
  min: number;
  max: number;
  std: number;
  weeklyBandMin: number;
  weeklyBandMax: number;
}

function clampUnit(t: number) {
  return Math.max(0, Math.min(1, t));
}

function environmentalIndicatorSummary(indexId: EnvironmentalIndexId, mean: number): string {
  if (indexId === 'LST') {
    if (mean < 22) return 'Cooler surface temperatures across the sampled period.';
    if (mean < 32) return 'Moderate land-surface temperatures — typical mixed land.';
    return 'Warm thermal signal — possible bare soil, urban, or water stress.';
  }
  if (indexId === 'ET') {
    if (mean < 3) return 'Low ET demand — cooler canopy / higher moisture retention.';
    if (mean < 5.5) return 'Moderate ET — typical mid-season crop water demand.';
    if (mean < 7.5) return 'Elevated ET — prioritize irrigation scouting.';
    return 'High ET demand — strong evaporative stress risk for the AOI.';
  }
  if (mean < 0.2) {
    return 'Low vegetation response — bare soil, built-up areas, or water (typical in arid regions).';
  }
  if (mean < 0.4) {
    return 'Sparse or stressed vegetation — shrubs, sparse crops, or mixed desert patches.';
  }
  if (mean < 0.6) {
    return 'Moderate healthy vegetation — grassland or active agricultural canopy.';
  }
  return 'Strong vegetation signal — dense canopy or well-irrigated crops.';
}

function createPointFeature(lng: number, lat: number) {
  return {
    type: 'Feature',
    properties: { label: 'Drawn point' },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
}

/** Base pixel tolerance to snap to first vertex when closing; see polygonCloseSnapThresholdPx. */
const POLYGON_CLOSE_SNAP_BASE_PX = 20;
/** Snap radius to first vertex when closing; scales with zoom like vertex handles. */
function polygonCloseSnapThresholdPx(map: { getZoom?: () => number } | null | undefined): number {
  if (!map) return POLYGON_CLOSE_SNAP_BASE_PX;
  try {
    return Math.max(POLYGON_CLOSE_SNAP_BASE_PX, vertexHitThresholdPx(map as any));
  } catch {
    return POLYGON_CLOSE_SNAP_BASE_PX;
  }
}

/** Shift-constrained polygon edge bearings (degrees). */
const POLYGON_SNAP_BEARING_STEP_DEG = 15;

/** Snap placed vertices to existing ones while sketching (digitizing). */
const POLYGON_VERTEX_SNAP_PX = 20;

/**
 * Optional Sentinel Hub WMS index mask (NDVI / GNDVI / NDMI / NDWI / EVI profiles): alpha is zero where index is below this value.
 * null = AOI geometry clipping only (dataMask + GEOMETRY). Example: 0.35 hides very low NDVI inside the AOI (index below threshold).
 */
const WMS_AOI_INDEX_VISIBILITY_MIN: number | null = null;

/** Cap simultaneous Mapbox WMS raster sources (each source fetches tiles independently). */
const SI_WMS_MAX_TILE_LAYERS = 8;

const DEFAULT_DRAW_STYLE: DrawStyleConfig = {
  strokeColor: '#4ade80',
  fillColor: '#22c55e',
  strokeWidth: 3,
  fillOpacity: 0.28,
  pointRadius: 11,
};

interface PivotFeature {
  id: string;
  name: string;
  color: string;
  feature: any;
  centroid: [number, number];
}

interface WeeklyComposite {
  weekIndex: number;
  startDate: string;
  endDate: string;
  label: string;
  mean: number;
  min: number;
  max: number;
  itemCount: number;
  enabled: boolean;
}

const ENVIRONMENTAL_INDICES: Record<EnvironmentalIndexId, {
  label: string;
  collection: string;
  formula: string;
  range: [number, number];
  palette: string[];
  description: string;
}> = {
  NDWI: {
    label: 'NDWI',
    collection: 'sentinel-2-l2a',
    formula: '(B03 - B08) / (B03 + B08)',
    range: [-1, 1],
    palette: ['#7c2d12', '#fde68a', '#38bdf8', '#1d4ed8'],
    description: 'Open water and moisture response.',
  },
  NDMI: {
    label: 'NDMI',
    collection: 'sentinel-2-l2a',
    formula: '(B08 - B11) / (B08 + B11)',
    range: [-1, 1],
    palette: ['#92400e', '#fef3c7', '#22d3ee', '#0f766e'],
    description: 'Canopy moisture from NIR and SWIR.',
  },
  EVI: {
    label: 'EVI',
    collection: 'sentinel-2-l2a',
    formula: '2.5 * (B08 - B04) / (B08 + 6*B04 - 7.5*B02 + 1)',
    range: [-1, 1],
    palette: ['#7f1d1d', '#fde68a', '#22c55e', '#14532d'],
    description: 'Enhanced vegetation index for high biomass areas.',
  },
  SAVI: {
    label: 'SAVI',
    collection: 'sentinel-2-l2a',
    formula: '1.5 * (B08 - B04) / (B08 + B04 + 0.5)',
    range: [-1, 1],
    palette: ['#7c2d12', '#facc15', '#4ade80', '#166534'],
    description: 'Soil-adjusted vegetation index.',
  },
  NDSI: {
    label: 'NDSI',
    collection: 'sentinel-2-l2a',
    formula: '(B03 - B11) / (B03 + B11)',
    range: [-1, 1],
    palette: ['#334155', '#e0f2fe', '#ffffff', '#bae6fd'],
    description: 'Snow or bright surface response.',
  },
  ET: {
    label: 'ET',
    collection: 'sentinel-2-l2a',
    formula: 'ET = (1 − (0.6×NDMI + 0.4×NDWI)) × 10 mm/day',
    range: [0, 10],
    palette: ['#1e3a8a', '#0ea5e9', '#22c55e', '#fde047', '#ef4444'],
    description: 'Evapotranspiration moisture proxy (mm/day) for irrigation demand.',
  },
  LST: {
    label: 'LST',
    collection: 'landsat-c2-l2',
    formula: 'Land Surface Temperature from Collection 2 Level 2 thermal bands',
    range: [15, 45],
    palette: ['#1d4ed8', '#22c55e', '#fde047', '#ef4444'],
    description: 'Land Surface Temperature in Celsius from Landsat Collection 2 Level 2.',
  },
};

const PIVOT_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#06b6d4', '#eab308'];
const SI_SYMBOLOGY_BAKE_RAMPS: Record<SymbologyColorRamp, string[]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  blues: ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'],
  greens: ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'],
  plasma: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'],
  magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
  turbo: ['#30123b', '#3b4cc0', '#26a6d1', '#3de07e', '#f9e721', '#f20c0c'],
};

const SI_STYLE_PRESET_CHIPS: Array<{ id: string; label: string; patch: Partial<SiLayerAppearancePersisted> }> = [
  { id: 'carto', label: 'Carto outline', patch: { strokeStyle: 'solid', weight: 2.5, polygonFillAlpha: 0.28, fillStyle: 'solid', blendMode: 'normal' } },
  { id: 'soft', label: 'Soft fill', patch: { polygonFillAlpha: 0.5, weight: 1, opacity: 0.92, fillStyle: 'solid', blendMode: 'normal' } },
  { id: 'survey', label: 'Survey dashed', patch: { strokeStyle: 'dashed', weight: 2, polygonFillAlpha: 0.22, fillStyle: 'pattern', blendMode: 'normal' } },
  { id: 'bold', label: 'Bold lines', patch: { weight: 5, strokeStyle: 'solid', polygonFillAlpha: 0.4, pointRadius: 10, blendMode: 'normal' } },
  { id: 'multiply', label: 'Multiply blend', patch: { blendMode: 'multiply', polygonFillAlpha: 0.45, fillStyle: 'solid' } },
];

function esriColorArrayToCss(c: unknown): string | null {
  if (!Array.isArray(c) || c.length < 3) return null;
  const r = Math.max(0, Math.min(255, Math.round(Number(c[0]))));
  const g = Math.max(0, Math.min(255, Math.round(Number(c[1]))));
  const b = Math.max(0, Math.min(255, Math.round(Number(c[2]))));
  if (![r, g, b].every(n => Number.isFinite(n))) return null;
  let a = c.length >= 4 ? Number(c[3]) : 255;
  if (!Number.isFinite(a)) a = 255;
  const alpha = a <= 1 ? a : a / 255;
  const ao = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${ao})`;
}

function rampColorAt(ramp: string[], i: number, n: number): string {
  if (!ramp.length) return '#22c55e';
  if (n <= 1) return ramp[Math.floor((ramp.length - 1) / 2)]!;
  const t = i / (n - 1);
  const idx = Math.round(t * (ramp.length - 1));
  return ramp[Math.max(0, Math.min(ramp.length - 1, idx))]!;
}

function pointInAoiGeometry(lng: number, lat: number, geometry: any): boolean {
  if (!geometry || typeof geometry !== 'object') return false;
  if (geometry.type === 'Polygon') {
    return pointInPolygonGeometry(lng, lat, geometry as { type: string; coordinates: number[][][] });
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.some(
      (coords: number[][][]) => pointInPolygonGeometry(lng, lat, { type: 'Polygon', coordinates: coords }),
    );
  }
  return false;
}

function walkCoordsLngLat2D(coords: any, points: [number, number][]) {
  if (!coords) return;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    points.push([coords[0], coords[1]]);
    return;
  }
  if (Array.isArray(coords)) {
    coords.forEach(c => walkCoordsLngLat2D(c, points));
  }
}

/** Bounds of a GeoJSON Feature (or feature-like) in geographic lng/lat. */
function getDrawnFeatureLngLatBounds(feature: any): [number, number, number, number] | null {
  const points: [number, number][] = [];
  if (feature?.type === 'Feature') {
    walkCoordsLngLat2D(feature.geometry?.coordinates, points);
  } else if (feature?.geometry?.coordinates) {
    walkCoordsLngLat2D(feature.geometry.coordinates, points);
  }
  if (points.length === 0) return null;
  let [minX, minY] = points[0]!;
  let [maxX, maxY] = points[0]!;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * One lng/lat per export row, each inside the AOI polygon when possible (quasi-random search in bbox).
 */
function sampleLngLatPointsInAoiGeometry(
  geometry: any,
  bounds: [number, number, number, number],
  rowCount: number,
): Array<{ lng: number; lat: number }> {
  const [minX, minY, maxX, maxY] = bounds;
  const w = Math.max(1e-12, maxX - minX);
  const h = Math.max(1e-12, maxY - minY);
  const out: Array<{ lng: number; lat: number }> = [];
  const golden = 2.618033988749895;
  for (let i = 0; i < rowCount; i++) {
    let picked: { lng: number; lat: number } | null = null;
    for (let k = 0; k < 500; k++) {
      const u = ((i + 1) * golden + k * 0.2718281828459045) % 1;
      const v = ((i + 1) * 1.7320508075688772 + k * 0.4142135623730951) % 1;
      const lng = minX + u * w;
      const lat = minY + v * h;
      if (pointInAoiGeometry(lng, lat, geometry)) {
        picked = { lng, lat };
        break;
      }
    }
    out.push(picked ?? { lng: minX + w / 2, lat: minY + h / 2 });
  }
  return out;
}

type StaticAoiChartExportLngLatRow = { lng: number; lat: number };

function buildStaticAoiExportLngLatPerRow(
  drawnFeature: any | null,
  rowCount: number,
): StaticAoiChartExportLngLatRow[] | undefined {
  if (!drawnFeature || rowCount <= 0) return undefined;
  const bounds = getDrawnFeatureLngLatBounds(drawnFeature);
  if (!bounds) return undefined;
  const geom = drawnFeature.geometry;
  const [minX, minY, maxX, maxY] = bounds;
  const center = { lng: (minX + maxX) / 2, lat: (minY + maxY) / 2 };
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
    return Array.from({ length: rowCount }, () => ({ ...center }));
  }
  return sampleLngLatPointsInAoiGeometry(geom, bounds, rowCount);
}

function hexToEsriRgba(hex: string): [number, number, number, number] {
  const h = (hex || '#22c55e').replace('#', '');
  const pad = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h.padEnd(6, '0').slice(0, 6);
  const r = parseInt(pad.slice(0, 2), 16) || 34;
  const g = parseInt(pad.slice(2, 4), 16) || 197;
  const b = parseInt(pad.slice(4, 6), 16) || 94;
  return [r, g, b, 255];
}

function arcgisLegendPreviewRows(
  drawingInfo: Record<string, unknown> | null | undefined,
  colorRamp: SiBakeRamp,
  maxCategories: number,
  arcDef?: ArcgisLayerDefLite | null,
): Array<{ label: string; color: string }> {
  if (!drawingInfo || typeof drawingInfo !== 'object') return [];
  const ren = (drawingInfo as any)?.renderer;
  if (!ren || typeof ren !== 'object') return [];
  const t = String(ren.type || '');
  const max = Math.max(1, Math.min(40, Math.floor(maxCategories)));
  const ramp = colorRamp === 'service' ? null : SI_SYMBOLOGY_BAKE_RAMPS[colorRamp];

  if (t === 'uniqueValue') {
    const infos = (Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : []).slice(0, max);
    const fieldsByLower = buildArcFieldsByLower(arcDef ?? null);
    const fieldName = pickRendererPrimaryField(ren) || '';
    return infos.map((uvi: any, i: number) => {
      const rawVal = uvi?.value;
      const rawStr = rawVal === null || rawVal === undefined ? '' : String(rawVal);
      const uviLabel = String(uvi?.label ?? '').trim();
      let label = uviLabel || rawStr;
      if (arcDef && fieldName && rawStr !== '') {
        const resolved = arcLegendLabelForFieldValue(fieldName, rawStr, arcDef, fieldsByLower);
        if (resolved !== rawStr) label = resolved;
      }
      const color =
        ramp != null
          ? rampColorAt(ramp, i, Math.max(infos.length, 1))
          : esriColorArrayToCss(uvi?.symbol?.color) ?? 'rgba(148, 163, 184, 0.35)';
      return { label, color };
    });
  }
  if (t === 'classBreaks') {
    const raw = Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : [];
    const sorted = [...raw]
      .filter((br: any) => Number.isFinite(Number(br?.maxValue)))
      .sort((a: any, b: any) => {
        const ma = Number(a?.minValue);
        const mb = Number(b?.minValue);
        if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
        return Number(a?.maxValue) - Number(b?.maxValue);
      });
    const sliced = sorted.slice(0, max);
    return sliced.map((br: any, i: number) => {
      const label = `${br?.minValue ?? ''} â€“ ${br?.maxValue ?? ''}`;
      const color =
        ramp != null
          ? rampColorAt(ramp, i, Math.max(sliced.length, 1))
          : esriColorArrayToCss(br?.symbol?.color) ?? 'rgba(148, 163, 184, 0.35)';
      return { label, color };
    });
  }
  if (t === 'simple') {
    const sym = ren.symbol;
    const color =
      ramp != null
        ? rampColorAt(ramp, 0, 1)
        : esriColorArrayToCss(sym?.color) ?? '#22c55e';
    return [{ label: 'Symbol', color }];
  }
  return [];
}

function applySymbologyToArcgisDrawingInfo(
  drawingInfo: Record<string, unknown>,
  colorRamp: SiBakeRamp,
  maxCategories: number,
): Record<string, unknown> | null {
  let di: any;
  try {
    di = JSON.parse(JSON.stringify(drawingInfo));
  } catch {
    return null;
  }
  const ren = di?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');
  const max = Math.max(1, Math.min(40, Math.floor(maxCategories)));
  const useRamp = colorRamp !== 'service';
  const ramp = useRamp ? SI_SYMBOLOGY_BAKE_RAMPS[colorRamp as SymbologyColorRamp] : null;

  if (t === 'uniqueValue') {
    const infos = Array.isArray(ren.uniqueValueInfos) ? [...ren.uniqueValueInfos] : [];
    const sliced = infos.slice(0, max);
    ren.uniqueValueInfos = sliced.map((uvi: any, i: number) => {
      const u = uvi && typeof uvi === 'object' ? { ...uvi } : {};
      const sym =
        u.symbol && typeof u.symbol === 'object' ? JSON.parse(JSON.stringify(u.symbol)) : { type: 'esriSFS', style: 'esriSFSSolid' };
      sym.type = sym.type || 'esriSFS';
      sym.style = sym.style || 'esriSFSSolid';
      if (useRamp && ramp) {
        sym.color = hexToEsriRgba(rampColorAt(ramp, i, Math.max(sliced.length, 1)));
      }
      return { ...u, symbol: sym };
    });
    return sanitizeArcgisDrawingInfoForClient(di);
  }

  if (t === 'classBreaks') {
    const raw = Array.isArray(ren.classBreakInfos) ? [...ren.classBreakInfos] : [];
    const sorted = raw
      .filter((br: any) => Number.isFinite(Number(br?.maxValue)))
      .sort((a: any, b: any) => {
        const ma = Number(a?.minValue);
        const mb = Number(b?.minValue);
        if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
        return Number(a?.maxValue) - Number(b?.maxValue);
      });
    const sliced = sorted.slice(0, max);
    ren.classBreakInfos = sliced.map((br: any, i: number) => {
      const b = br && typeof br === 'object' ? { ...br } : {};
      const sym =
        b.symbol && typeof b.symbol === 'object' ? JSON.parse(JSON.stringify(b.symbol)) : { type: 'esriSFS', style: 'esriSFSSolid' };
      sym.type = sym.type || 'esriSFS';
      sym.style = sym.style || 'esriSFSSolid';
      if (useRamp && ramp) {
        sym.color = hexToEsriRgba(rampColorAt(ramp, i, Math.max(sliced.length, 1)));
      }
      return { ...b, symbol: sym };
    });
    return sanitizeArcgisDrawingInfoForClient(di);
  }

  if (t === 'simple') {
    const sym =
      ren.symbol && typeof ren.symbol === 'object' ? JSON.parse(JSON.stringify(ren.symbol)) : { type: 'esriSFS', style: 'esriSFSSolid' };
    sym.type = sym.type || 'esriSFS';
    sym.style = sym.style || 'esriSFSSolid';
    if (useRamp && ramp) {
      sym.color = hexToEsriRgba(rampColorAt(ramp, 0, 1));
    }
    ren.symbol = sym;
    return sanitizeArcgisDrawingInfoForClient(di);
  }

  return null;
}

type ExploreDateSourceMode = 'manual' | 'environmental_parameter' | 'sentinel2_views';
const LOCAL_PROCESSING_TEMPLATES: Array<{ id: MpcTemplateId; label: string; collections?: string[] }> = [
  { id: 'ndvi_s2', label: 'NDVI (Sentinel-2)', collections: ['sentinel-2-l2a'] },
  { id: 'false_color_s2', label: 'False Color (Sentinel-2)', collections: ['sentinel-2-l2a'] },
  { id: 'ndmi_s2', label: 'Moisture Index / NDMI (Sentinel-2)', collections: ['sentinel-2-l2a'] },
  { id: 'ndvi_landsat', label: 'NDVI (Landsat-8/9)', collections: ['landsat-c2-l2'] },
  { id: 'false_color_landsat', label: 'False Color (Landsat-8/9)', collections: ['landsat-c2-l2'] },
];
const REMOTE_SENSING_HIDDEN_LAYER_IDS = new Set([
  'NDVI',
  'NDWI',
  'NDMI',
  'EVI',
  'GNDVI',
  'NBR',
  'NDRE',
  'BSI',
  'MNDWI',
]);
const DEFAULT_MPC_CATALOG_URL = 'https://planetarycomputer.microsoft.com/catalog';
const DEFAULT_MPC_ACS_ZIP_PATH = 'C:\\Users\\mohamed.abass.WUSOOM\\Downloads\\ACS_Files.zip';

/** Static welcome shown above the Gemini Geo AI thread (also used for clipboard copy). */
const SI_GEO_AI_WELCOME_GEMINI_TEXT =
  "Hello! I'm Agro Cloud - GeoAI - Describe a place, upload an image, or ask for directions.\nWhen a location is clear, the map will fly there.";

/** Static welcome for Claude / DeepSeek data assistant tab. */
const SI_GEO_AI_WELCOME_DATA_ASSISTANT_TEXT =
  "Hello! I'm Agro Cloud - GeoAI - Describe a place, upload an image, or ask for directions.";

export default function SatelliteIntelligence() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const siScope = useSiInstanceScope();
  const siStyleClipboardLs = siScope.scopedStorageKey(SI_MAPBOX_STYLE_CLIPBOARD_LS);
  const siStyleStudioPrefsLs = siScope.scopedStorageKey(SI_MAPBOX_STYLE_STUDIO_PREFS_LS);
  const gisContentPortal = useGisContentPortal();
  const gisContentDeepLinkRef = useRef<string | null>(null);
  const mapboxToken = useMapboxAccessToken();
  const geminiApiKey = useGeminiApiKey();
  const claudeApiKey = useClaudeApiKey();
  const deepseekApiKey = useDeepseekApiKey();
  const ollamaConfig = useOllamaConfig();
  const openWeatherApiKey = useOpenWeatherMapApiKey();
  const basemapCatalog = useMemo(() => buildBasemapCatalog(''), []);
  const initialMapViewStateRef = useRef({ ...SI_GLOBE_COCKPIT_2D_VIEW });
  const [viewState, setViewState] = useState(initialMapViewStateRef.current);
  const [mapMetrics, setMapMetrics] = useState<SiMapMetrics>(() =>
    readMapMetricsFromViewState(initialMapViewStateRef.current),
  );
  const skipMapCameraSyncRef = useRef(false);

  const [sentinelWmsRev, setSentinelWmsRev] = useState(0);
  const wmsBaseUrl = useMemo(() => getSentinelHubWmsBaseUrl(), [sentinelWmsRev]);

  useEffect(() => {
    const bump = () => setSentinelWmsRev(r => r + 1);
    const unsubWms = subscribeSentinelHubWmsInstance(bump);
    const unsubAccess = subscribeSentinelHubAccessToken(bump);
    return () => {
      unsubWms();
      unsubAccess();
    };
  }, []);

  const [wmsLayer, setWmsLayer] = useState(SI_DEFAULT_LIVE_WMS_LAYER);
  const [remoteSensingProvider, setRemoteSensingProvider] = useState('sentinel-hub');
  const [remoteSensingCollection, setRemoteSensingCollection] = useState('sentinel-2-l2a');
  const [selectedDate, setSelectedDate] = useState<Date>(() => getDefaultSentinelImageryDate());
  /** When true, imagery date follows latest scene âˆ’ 1 day for the active AOI. */
  const [imageryDateAutoFollow, setImageryDateAutoFollow] = useState(true);
  const [sentinelSceneCatalog, setSentinelSceneCatalog] = useState<SentinelSceneCatalog | null>(null);
  const [isFetchingSentinelScenes, setIsFetchingSentinelScenes] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  /** Raster/vector MapGL children â€” toggled off during basemap style swap; dock stays mounted via isMapLoaded. */
  const [isMapStyleReady, setIsMapStyleReady] = useState(false);
  /** Bumps when the Mapbox style is ready again so overlay sources remount on the canvas. */
  const [customLayersMapEpoch, setCustomLayersMapEpoch] = useState(0);
  const prevMapStyleReadyRef = useRef(isMapStyleReady);
  const [layerPopupCfgPickId, setLayerPopupCfgPickId] = useState<string | null>(null);
  const [layerPopupCfgOpen, setLayerPopupCfgOpen] = useState(false);
  /** Layer row â€œâ‹¯â€ context menu (ArcGIS-style options). */
  const [layerOptionsMenuLayerId, setLayerOptionsMenuLayerId] = useState<string | null>(null);
  const [customLayers, setCustomLayers] = useState<CustomLayer[]>(() => {
    if (typeof window === 'undefined') return [];
    return parseStoredCustomLayers(
      window.localStorage.getItem(siScope.scopedStorageKey(SATELLITE_CUSTOM_LAYERS_STORAGE_KEY)),
    );
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      persistCustomLayersToStorage(
        customLayers,
        siScope.scopedStorageKey(SATELLITE_CUSTOM_LAYERS_STORAGE_KEY),
      );
    }, 480);
    return () => window.clearTimeout(t);
  }, [customLayers, siScope]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const [searchPin, setSearchPin] = useState<{ lng: number; lat: number; label: string } | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [timeSeriesStart, setTimeSeriesStart] = useState(() => getDefaultSentinelTimeSeriesRange().start);
  const [timeSeriesEnd, setTimeSeriesEnd] = useState(() => getDefaultSentinelTimeSeriesRange().end);
  const [fieldAnalysisStatus, setFieldAnalysisStatus] = useState('');
  const [wmsLayers, setWmsLayers] = useState<WmsLayerInfo[]>(() => getBootstrapSentinelWmsLayers());
  const [isLoadingLayers, setIsLoadingLayers] = useState(false);
  const [isLayerDropdownOpen, setIsLayerDropdownOpen] = useState(false);
  const [mapToolboxEmbedHost, setMapToolboxEmbedHost] = useState<HTMLDivElement | null>(null);
  const [basemapId, setBasemapId] = useState(() => pickDefaultBasemapId(DEFAULT_BASEMAP_ID));
  const [isBasemapOpen, setIsBasemapOpen] = useState(false);
  const [isWeatherIntelOpen, setIsWeatherIntelOpen] = useState(false);
  const [weatherPickOnMap, setWeatherPickOnMap] = useState(false);
  const [weatherLocation, setWeatherLocation] = useState<WeatherLocation | null>(null);
  const [isWeatherVizOpen, setIsWeatherVizOpen] = useState(false);
  const [weatherSim, setWeatherSim] = useState<WeatherSimState>(DEFAULT_WEATHER_SIM);
  const weatherPickOnMapRef = useRef(false);
  useEffect(() => {
    weatherPickOnMapRef.current = weatherPickOnMap;
  }, [weatherPickOnMap]);

  useEffect(() => {
    setBasemapId(prev => {
      const picked = pickDefaultBasemapId(prev);
      if (catalogEntryById(basemapCatalog, picked)) return picked;
      return DEFAULT_BASEMAP_ID;
    });
  }, [basemapCatalog]);
  const [is3DView, setIs3DView] = useState(() => false);
  const is3DViewRef = useRef(is3DView);
  is3DViewRef.current = is3DView;
  /**
   * Basemap restore for the auto Elevation/Topography swap: entering 3D switches
   * the basemap to the dedicated 3D Topographic (DEM + hillshade) layer; exiting
   * 2D restores whatever the user had before. Only restored when we auto-swapped.
   */
  const basemapBefore3dRef = useRef<string | null>(null);
  /** Terrain 3D control (Elevation & Contour): popover open, contour overlay, relief height. */
  const [isTerrain3dPanelOpen, setIsTerrain3dPanelOpen] = useState(false);
  /** DEM vertical exaggeration applied to the 3D terrain mesh (1.0 = real, higher = dramatic). */
  const [terrainExaggeration, setTerrainExaggeration] = useState(1.5);
  /** Legend tool: the map legend is shown ONLY when the user activates this tool. */
  const [isLegendToolOpen, setIsLegendToolOpen] = useState(false);
  const [cloudCoverage, setCloudCoverage] = useState(20);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  /** Interval for timeline auto-advance (ms); user cycles via map timeline control. */
  const [timelinePlaybackMs, setTimelinePlaybackMs] = useState(1400);
  const cycleTimelinePlaybackSpeed = useCallback(() => {
    setTimelinePlaybackMs(prev => {
      const speeds = [1400, 900, 500, 280];
      const i = speeds.indexOf(prev);
      return speeds[(i < 0 ? 0 : i + 1) % speeds.length];
    });
  }, []);
  const [mapStaticChartsOpen, setMapStaticChartsOpen] = useState(false);
  const [imageryTimeSeriesOpen, setImageryTimeSeriesOpen] = useState(false);
  const [goToXyOpen, setGoToXyOpen] = useState(false);
  const [goToXyMarker, setGoToXyMarker] = useState<{ lng: number; lat: number } | null>(null);
  const [aoiStatsPixel, setAoiStatsPixel] = useState<{ lng: number; lat: number } | null>(null);
  const [layerLiveStatsLayers, setLayerLiveStatsLayers] = useState<LayerLiveStatsLayerId[]>(() =>
    defaultStaticAoiComparisonLayers(),
  );
  const [selectedIndex, setSelectedIndex] = useState<EnvironmentalIndexId>('NDWI');
  const selectedIndexConfig =
    ENVIRONMENTAL_INDICES[selectedIndex] ?? ENVIRONMENTAL_INDICES.NDWI;
  useEffect(() => {
    if (Object.prototype.hasOwnProperty.call(ENVIRONMENTAL_INDICES, selectedIndex)) return;
    setSelectedIndex('NDWI');
  }, [selectedIndex]);
  const [selectedPivotId, setSelectedPivotId] = useState('all');
  const [weeklyComposites, setWeeklyComposites] = useState<WeeklyComposite[]>([]);
  /** True only after the user (or RS Run path) successfully builds the field timeline â€” drives Generate âŸ· Stop label. */
  const [fieldTimelineSessionActive, setFieldTimelineSessionActive] = useState(false);
  const [stacItems, setStacItems] = useState<any[]>([]);
  const [stacStatus, setStacStatus] = useState('Ready to search Planetary Computer STAC.');
  const [isLoadingStac, setIsLoadingStac] = useState(false);
  const [stacConnection, setStacConnection] = useState<StacConnectionConfig>(() =>
    loadStacConnection(siScope.scopedStorageKey(STAC_CONNECTION_STORAGE_KEY)),
  );
  const [isStacModalOpen, setIsStacModalOpen] = useState(false);
  const [stacModalDraft, setStacModalDraft] = useState<StacConnectionConfig>(() =>
    cloneStacModalDraft(loadStacConnection(siScope.scopedStorageKey(STAC_CONNECTION_STORAGE_KEY))),
  );
  const [isAcsPickerOpen, setIsAcsPickerOpen] = useState(false);
  const [acsPickerStaging, setAcsPickerStaging] = useState<string[]>([]);
  const [acsPickerManualPath, setAcsPickerManualPath] = useState('');
  const [acsPickerFilter, setAcsPickerFilter] = useState('');
  const [exploreTab, setExploreTab] = useState<'parameters' | 'results' | 'source'>('parameters');
  const [runtimeAnalysisEngineBaseUrl, setRuntimeAnalysisEngineBaseUrl] = useState('');
  const [selectedMpcTemplateId, setSelectedMpcTemplateId] = useState<MpcTemplateId>('ndvi_s2');
  const [mpcProcessResult, setMpcProcessResult] = useState<MpcProcessResult | null>(null);
  const [mpcClipToAoi, setMpcClipToAoi] = useState(true);
  const [mpcTileSize, setMpcTileSize] = useState(1024);
  const [autoRunNdviOnScenePick, setAutoRunNdviOnScenePick] = useState(true);
  const [processingTargetStacItem, setProcessingTargetStacItem] = useState<any | null>(null);
  const [exploreCatalogLoadKey, setExploreCatalogLoadKey] = useState(0);
  const [stacCatalogCollections, setStacCatalogCollections] = useState<StacCollectionSummary[]>([]);
  const [isLoadingStacCollections, setIsLoadingStacCollections] = useState(false);
  const [stacCollectionsLoadError, setStacCollectionsLoadError] = useState('');
  const [exploreCollectionSearch, setExploreCollectionSearch] = useState('');
  const [exploreDescriptionKeyword, setExploreDescriptionKeyword] = useState('');
  const [exploreSelectedCollectionIds, setExploreSelectedCollectionIds] = useState<string[]>([]);
  const [exploreDateStart, setExploreDateStart] = useState('');
  const [exploreDateEnd, setExploreDateEnd] = useState('');
  const [exploreDateSourceMode, setExploreDateSourceMode] = useState<ExploreDateSourceMode>('environmental_parameter');
  const [exploreExtentMode, setExploreExtentMode] = useState<'map' | 'drawn' | 'layer' | 'default' | 'manual'>('default');
  const [exploreManualBbox, setExploreManualBbox] = useState({ north: '', south: '', east: '', west: '' });
  const [exploreIdsText, setExploreIdsText] = useState('');
  const [exploreUseCloudFilter, setExploreUseCloudFilter] = useState(true);
  const [exploreCloudCoverMax, setExploreCloudCoverMax] = useState(20);
  const [exploreLimit, setExploreLimit] = useState(80);
  const [exploreResultsPage, setExploreResultsPage] = useState(0);
  const [exploreResultsSortDesc, setExploreResultsSortDesc] = useState(true);
  const [exploreSelectedResultKeys, setExploreSelectedResultKeys] = useState<string[]>([]);
  const [showStacFootprintsOnMap, setShowStacFootprintsOnMap] = useState(false);
  const [isWmsOverlayVisible, setIsWmsOverlayVisible] = useState(false);
  const [aoiMaskBuilderSettings, setAoiMaskBuilderSettings] = useState<SiAoiMaskBuilderSettings>(() =>
    loadSiAoiMaskBuilderSettings({ storageKey: siScope.scopedStorageKey(SI_AOI_MASK_BUILDER_LS_KEY) }),
  );
  const [cropAlertSettings, setCropAlertSettings] = useState<CropAlertEngineSettings>(() =>
    loadCropAlertEngineSettingsForSatellitePage({
      engineKey: siScope.scopedStorageKey(SI_CROP_ALERT_ENGINE_LS_KEY),
    }),
  );
  const [cropAlertResults, setCropAlertResults] = useState<CropAlertFieldResult[]>([]);
  const [cropAlertRunning, setCropAlertRunning] = useState(false);
  const [cropAlertLastRunAt, setCropAlertLastRunAt] = useState<number | null>(null);
  const [cropAlertProgress, setCropAlertProgress] = useState<CropAlertSentinelFetchProgress | null>(null);
  const [cropAlertLiveFieldCount, setCropAlertLiveFieldCount] = useState(0);
  const cropAlertAbortRef = useRef<AbortController | null>(null);
  const [selectedCropAlertFieldKey, setSelectedCropAlertFieldKey] = useState<string | null>(null);
  const [cropAlertMapPopupFieldKey, setCropAlertMapPopupFieldKey] = useState<string | null>(null);
  const [stressZonesPopupZone, setStressZonesPopupZone] = useState<StressZoneAreaRow | null>(null);
  const [stressZonesPopupLngLat, setStressZonesPopupLngLat] = useState<{ lng: number; lat: number } | null>(
    null,
  );
  const stressZonesMapInteractRef = useRef({
    showOnMap: false,
    hasResult: false,
    sectionOpen: false,
  });
  const stressZonesPrevWmsLayerRef = useRef<string | null>(null);
  const [cropAlertNotifications, setCropAlertNotifications] = useState<
    Array<{ id: string; fieldKey: string; title: string; message: string; severity: string }>
  >([]);
  const cropAlertPrevCriticalKeysRef = useRef<Set<string>>(new Set());
  const [cropClassificationSettings, setCropClassificationSettings] = useState<CropClassificationSettings>(
    () => ({ ...DEFAULT_CROP_CLASSIFICATION_SETTINGS }),
  );
  const [cropClassificationRunning, setCropClassificationRunning] = useState(false);
  const cropClassificationRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Isolated study AOI for Crop Classification â€” never mixed with Remote Sensing sketch. */
  const [cropClassAoiGeometry, setCropClassAoiGeometry] = useState<any | null>(null);
  const [cropClassDrawingModeActive, setCropClassDrawingModeActive] = useState(false);
  const [mapDrawOwner, setMapDrawOwner] = useState<'remote-sensing' | 'crop-classification'>('remote-sensing');
  const [regionalCropTraining, setRegionalCropTraining] = useState<RegionalCropTrainingState>(
    () => ({ ...DEFAULT_REGIONAL_CROP_TRAINING_STATE }),
  );
  const regionalCropTrainingRef = useRef(regionalCropTraining);
  const regionalCropTrainingAbortRef = useRef<AbortController | null>(null);
  const [stacMapThumb, setStacMapThumb] = useState<null | { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] }>(
    null,
  );
  const [isStacThumbVisible, setIsStacThumbVisible] = useState(false);
  const [stacMapThumbLabel, setStacMapThumbLabel] = useState('');
  const [isAddLayerModalOpen, setIsAddLayerModalOpen] = useState(false);
  /** Home = pick source; gis-list = full-screen GIS Content step; source-forms = legacy wizard; tabs = GIS Map Add GIS Layer modal. */
  const [siAddLayerWizard, setSiAddLayerWizard] = useState<'home' | 'gis-list' | 'source-forms' | 'tabs'>('home');
  const [addLayerTab, setAddLayerTab] = useState<AddLayerTab>('giscontent');
  const [addLayerUrl, setAddLayerUrl] = useState('');
  const [addLayerRemoteUrl, setAddLayerRemoteUrl] = useState('');
  const [addLayerToken, setAddLayerToken] = useState(() => (typeof window !== 'undefined' ? getArcgisPortalToken() : ''));
  const [addLayerName, setAddLayerName] = useState('');
  const [addLayerStatus, setAddLayerStatus] = useState('');
  const [siUploadStagedFile, setSiUploadStagedFile] = useState<File | null>(null);
  const [siUploadPhase, setSiUploadPhase] = useState<'idle' | 'reading' | 'processing' | 'completed' | 'failed'>('idle');
  const [siUploadProgressPct, setSiUploadProgressPct] = useState(0);
  const [siUploadDropActive, setSiUploadDropActive] = useState(false);
  const [isConnectingLayer, setIsConnectingLayer] = useState(false);
  const [discoveredArcgisLayers, setDiscoveredArcgisLayers] = useState<Array<{ id: number; name: string; url: string; kind: 'layer' | 'table'; geometryType?: string }>>([]);
  const [selectedDiscoveredArcgisUrl, setSelectedDiscoveredArcgisUrl] = useState('');
  const [isAddingDiscoveredArcgisLayer, setIsAddingDiscoveredArcgisLayer] = useState(false);
  const [addingPortalRowId, setAddingPortalRowId] = useState<string | null>(null);
  const [portalBrowseStatus, setPortalBrowseStatus] = useState('');
  const [isImportingRemoteLayer, setIsImportingRemoteLayer] = useState(false);
  const [activeLayerActionDialog, setActiveLayerActionDialog] = useState<null | { mode: 'table' | 'symbology' | 'legend'; layerId: string }>(null);
  const [siTableServiceGeojson, setSiTableServiceGeojson] = useState<null | { layerId: string; geojson: any }>(null);
  const [siTableServiceLoading, setSiTableServiceLoading] = useState(false);
  const [siTableServiceError, setSiTableServiceError] = useState<string | null>(null);
  const [syncingLayerId, setSyncingLayerId] = useState<string | null>(null);
  const [tableSearchText, setTableSearchText] = useState('');
  const [tableSearchMode, setTableSearchMode] = useState<SiTableSearchMode>('description');
  const [tableFilterField, setTableFilterField] = useState('');
  const [tableFilterOperator, setTableFilterOperator] = useState<SiTableFilterOperator>('contains');
  const [tableFilterValue, setTableFilterValue] = useState('');
  const [tableShowSelectedOnly, setTableShowSelectedOnly] = useState(false);
  const [tableSelectedKeys, setTableSelectedKeys] = useState<Set<string>>(() => new Set());
  const [tableToolsCollapsed, setTableToolsCollapsed] = useState(true);
  const [draggingSiTableField, setDraggingSiTableField] = useState<string | null>(null);
  const [hiddenSiTableFieldsByLayerId, setHiddenSiTableFieldsByLayerId] = useState<Record<string, Set<string>>>({});
  const [siTableFieldOrderByLayerId, setSiTableFieldOrderByLayerId] = useState<Record<string, string[]>>({});
  const [symbologyDraft, setSymbologyDraft] = useState<SiSymbologyDraft>({
    useArcGisOnline: true,
    style: 'color',
    field: '',
    classes: 5,
    method: 'jenks',
    colorRamp: 'viridis',
    threshold: Number.NaN,
    arcgisMaxCategories: 8,
  });
  const [siSymbologyAppearance, setSiSymbologyAppearance] = useState<SiSymbologyAppearance>(() => defaultSiSymbologyAppearance());
  const [siStudioSections, setSiStudioSections] = useState<SiStudioSectionState>(() => ({
    visualization: true,
    appearance: true,
    templates: false,
    ...loadSiStudioSectionPrefs(siStyleStudioPrefsLs),
  }));
  const customLayersRef = useRef(customLayers);
  customLayersRef.current = customLayers;
  const syncLiveViewportRef = useRef<(immediate?: boolean) => void>(() => {});
  const siImperativeCustomLayerSourceIdsRef = useRef(new Set<string>());
  const siStyleSessionBackupRef = useRef<{ layerId: string; snap: Partial<CustomLayer> } | null>(null);
  const siSymbologyLiveLayerIdRef = useRef<string | null>(null);
  const [dbPlatform, setDbPlatform] = useState<(typeof DATABASE_PLATFORM_OPTIONS)[number]>('SQL Server');
  const [dbInstance, setDbInstance] = useState('');
  const [dbAuthType, setDbAuthType] = useState<'database' | 'operating-system'>('database');
  const [dbUsername, setDbUsername] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [dbSaveCredentials, setDbSaveCredentials] = useState(true);
  const [dbName, setDbName] = useState('');
  const [dbConnectionFileName, setDbConnectionFileName] = useState('');
  const [siGetDataStep, setSiGetDataStep] = useState<'menu' | 'sql'>('menu');
  const prevAddLayerTabForGetDataRef = useRef<AddLayerTab | null>(null);
  const clearStacMapThumb = useCallback(() => {
    setStacMapThumb(prev => {
      revokeStacMapOverlayBlob(prev?.url);
      return null;
    });
    setIsStacThumbVisible(true);
    setStacMapThumbLabel('');
  }, []);
  const [openExploreAccordions, setOpenExploreAccordions] = useState<Record<string, boolean>>({
    description: false,
    datetime: false,
    extent: false,
    ids: false,
    attributes: false,
    limit: false,
  });
  const [mapDrawTool, setMapDrawTool] = useState<MapDrawTool>('select');
  const [gisSelectionActive, setGisSelectionActive] = useState(false);
  const [gisSelectionTool, setGisSelectionTool] = useState<GisSelectionTool>('select');
  const [gisSelectionSetMode, setGisSelectionSetMode] = useState<GisSelectionSetMode>('new');
  const [gisSelectionHits, setGisSelectionHits] = useState<GisSelectionHit[]>([]);
  const [gisSelectionOverlapState, setGisSelectionOverlapState] = useState<MapSelectionOverlapState>(null);
  const gisSelectionOverlapRef = useRef<MapSelectionOverlapState>(null);
  const [gisSelectableLayerIds, setGisSelectableLayerIds] = useState<Set<string>>(() => new Set());
  const gisSelectionActiveRef = useRef(false);
  const gisSelectionToolRef = useRef<GisSelectionTool>('select');
  const gisLassoRingRef = useRef<[number, number][]>([]);
  const gisLassoDragRef = useRef(false);
  const [gisLassoPreviewRing, setGisLassoPreviewRing] = useState<[number, number][]>([]);
  const mapIdentifyOverlapRef = useRef<{ lng: number; lat: number; count: number; index: number } | null>(null);
  gisSelectionActiveRef.current = gisSelectionActive;
  gisSelectionToolRef.current = gisSelectionTool;
  gisSelectionOverlapRef.current = gisSelectionOverlapState;
  const [rsDrawingModeActive, setRsDrawingModeActive] = useState(false);
  const [mapPanLocked, setMapPanLocked] = useState(false);
  const [showEditHandles, setShowEditHandles] = useState(false);
  const [drawStyle, setDrawStyle] = useState<DrawStyleConfig>(() => ({ ...DEFAULT_DRAW_STYLE }));
  const [pointerLngLat, setPointerLngLat] = useState<[number, number] | null>(null);
  const [rectCirclePreview, setRectCirclePreview] = useState<
    null | { kind: 'rectangle' | 'circle' | 'box_select'; a: [number, number]; b: [number, number] }
  >(null);
  const [geomUndoStack, setGeomUndoStack] = useState<(any | null)[]>([]);
  const [geomRedoStack, setGeomRedoStack] = useState<(any | null)[]>([]);
  const [polylineStart, setPolylineStart] = useState<[number, number] | null>(null);
  const [polygonRing, setPolygonRing] = useState<[number, number][]>([]);
  const [drawnGeometry, setDrawnGeometry] = useState<any | null>(null);
  /** Show/hide the committed AOI boundary as an independent, persistent layer. */
  const [aoiLayerVisible, setAoiLayerVisible] = useState(true);
  const [aoiLayerOpacity, setAoiLayerOpacity] = useState(1);
  /** User-controlled on/off for the base map raster layer(s). */
  const [basemapVisible, setBasemapVisible] = useState(true);
  /** Unified Measurement tool (Main toolbox) â€” isolated from AOI drawing. */
  const [measureMode, setMeasureMode] = useState<MeasureMode | null>(null);
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
  const [measureFinished, setMeasureFinished] = useState(false);
  const [measurePanelOpen, setMeasurePanelOpen] = useState(false);
  const [measureUnits, setMeasureUnits] = useState<MeasureUnits>({ distance: 'm', area: 'ha' });
  const [measureRedoStack, setMeasureRedoStack] = useState<MeasurePoint[]>([]);
  const [measureCompleted, setMeasureCompleted] = useState<
    Array<{ id: string; mode: MeasureMode; points: MeasurePoint[] }>
  >([]);
  /** Primary AOI from Agro_Structures FeatureServer/21 â€” drives Sentinel Live GEOMETRY + dataMask clip. */
  const agroStructuresPrimaryAoiLoadRef = useRef(false);
  const agroStructuresViewportCacheRef = useRef(new SiViewportFeatureCache());
  const liveViewportFetchAbortRef = useRef<AbortController | null>(null);
  const liveViewportDebounceTimerRef = useRef<number | null>(null);
  const liveViewportMoveThrottleRef = useRef<number | null>(null);
  const liveViewportDisplayBBoxRef = useRef<LngLatBBox | null>(null);
  const mapMetricsCommitTimerRef = useRef<number | null>(null);
  const liveViewportBboxCommitTimerRef = useRef<number | null>(null);
  const sentinelWmsTilesSyncedRef = useRef('');
  const freezeViewportPipeline = shouldFreezeViewportDataPipeline(siScope.isIsolated);
  const cropAlertResultsStorageKey = useMemo(
    () => siScope.scopedStorageKey(SI_CROP_ALERT_RESULTS_LS_KEY),
    [siScope.scopedStorageKey],
  );
  const [liveViewportDisplayBBox, setLiveViewportDisplayBBox] = useState<LngLatBBox | null>(null);
  const [agroStructuresViewportGeoJson, setAgroStructuresViewportGeoJson] = useState<{
    type: 'FeatureCollection';
    features: unknown[];
  } | null>(null);
  const cropAlertResultsByKeyRef = useRef(new Map<string, CropAlertFieldResult>());
  const customLayersForMapPaint = useMemo(() => {
    if (freezeViewportPipeline) return customLayers;
    const viewportHasFeatures =
      Array.isArray(agroStructuresViewportGeoJson?.features) &&
      agroStructuresViewportGeoJson.features.length > 0;
    if (!viewportHasFeatures) return customLayers;
    return customLayers.map(layer =>
      isAgroStructuresLayer(layer) ? { ...layer, geojson: agroStructuresViewportGeoJson } : layer,
    );
  }, [customLayers, agroStructuresViewportGeoJson, freezeViewportPipeline]);
  const customLayersForMapPaintRef = useRef(customLayersForMapPaint);
  customLayersForMapPaintRef.current = customLayersForMapPaint;

  /** Signature of layers that should be painted on the Mapbox canvas (drives repaint). */
  const customLayersCanvasSig = useMemo(
    () =>
      customLayersForMapPaint
        .map(
          l =>
            `${l.id}:${l.visible ? 1 : 0}:${l.renderMode ?? 'vector'}:${Array.isArray(l.geojson?.features) ? l.geojson.features.length : 0}:${l.color ?? ''}:${l.fillColor ?? ''}:${l.weight ?? ''}:${l.polygonFillAlpha ?? ''}:${l.mapOpacity ?? 1}:${l.labelFieldName ?? ''}:${l.definitionQueryText ?? ''}`,
        )
        .join('|'),
    [customLayersForMapPaint],
  );
  const [multiAoiItems, setMultiAoiItems] = useState<
    Array<{
      id: string;
      name: string;
      feature: GeoJSON.Feature;
      source: 'drawn' | 'upload' | 'layer';
      color: string;
      analysis?: { mean: number; min: number; max: number; trend: 'up' | 'down' | 'flat' };
    }>
  >([]);
  const multiAoiItemsRef = useRef(multiAoiItems);
  useEffect(() => {
    multiAoiItemsRef.current = multiAoiItems;
  }, [multiAoiItems]);
  const [activeMultiAoiId, setActiveMultiAoiId] = useState<string | null>(null);
  const [multiAoiPopupIds, setMultiAoiPopupIds] = useState<string[]>([]);
  const [drawTargetMode, setDrawTargetMode] = useState<'aoi' | 'field'>('aoi');
  const drawTargetModeRef = useRef<'aoi' | 'field'>('aoi');
  const [aoiFields, setAoiFields] = useState<SiAoiFieldRecord[]>([]);
  const aoiFieldsRef = useRef<SiAoiFieldRecord[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const selectedFieldIdRef = useRef<string | null>(null);
  const [aoiFieldSnap, setAoiFieldSnap] = useState(true);
  const aoiFieldSnapRef = useRef(true);
  const [aoiFieldNoOverlap, setAoiFieldNoOverlap] = useState(false);
  const aoiFieldNoOverlapRef = useRef(false);
  const fieldEditDragRef = useRef<
    null | { fieldId: string; mode: 'vertex'; ref: VertexRef } | { fieldId: string; mode: 'pan'; last: [number, number] }
  >(null);
  const preFieldEditSnapshotRef = useRef<SiAoiFieldRecord | null>(null);
  const [drawnStats, setDrawnStats] = useState<DrawnAoiStats | null>(null);
  const [netfloraRasterPath, setNetfloraRasterPath] = useState('');
  const [netfloraInputLayerId, setNetfloraInputLayerId] = useState('');
  const [netfloraWeightsPath, setNetfloraWeightsPath] = useState('model_weights.pt');
  const [netfloraImageSize, setNetfloraImageSize] = useState(1536);
  const [netfloraThreshold, setNetfloraThreshold] = useState(0.25);
  const [netfloraDetectionMode, setNetfloraDetectionMode] = useState<NetfloraDetectionMode>('full_then_clip');
  const [netfloraAoiSource, setNetfloraAoiSource] = useState<NetfloraAoiSource>('drawn');
  const [netfloraAddInputToProject, setNetfloraAddInputToProject] = useState(true);
  const [netfloraGeneratePdf, setNetfloraGeneratePdf] = useState(false);
  const [netfloraOutputPath, setNetfloraOutputPath] = useState('');
  const [netfloraOpenOutputAfterRun, setNetfloraOpenOutputAfterRun] = useState(true);
  const [netfloraReportPath, setNetfloraReportPath] = useState('');
  const [netfloraUploadedResults, setNetfloraUploadedResults] = useState<any | null>(null);
  const [netfloraFilteredResults, setNetfloraFilteredResults] = useState<any | null>(null);
  const [netfloraStats, setNetfloraStats] = useState<NetfloraDetectionStats | null>(null);
  const [netfloraBusy, setNetfloraBusy] = useState(false);
  const [netfloraStatus, setNetfloraStatus] = useState('');
  const [treeProvider, setTreeProvider] = useState<TreeImageryProviderId>('esri');
  const [treeSensitivity] = useState(0.5);
  const [treeOverlayVisible, setTreeOverlayVisible] = useState(true);
  const [treeAnalysisMode, setTreeAnalysisMode] = useState<TreeAnalysisMode>('detect');
  const [treeConfidenceMin, setTreeConfidenceMin] = useState(0);
  const [expandedEnvSection, setExpandedEnvSection] = useState<
    | 'source'
    | 'layers'
    | 'remote-sensing'
    | 'crop-alerts'
    | 'stress-zones'
    | 'crop-classification'
    | 'ai-detection-gis'
    | 'tree-detections'
    | 'hydro-watershed'
    | 'well-site'
    | 'well-suitability'
    | 'flood-monitoring'
    | 'table-geo-ai'
  >('source');

  // --- Prithvi crop classification tool (Toolbox) ---
  const [cropAiSeason, setCropAiSeason] = useState<{ start: string; end: string }>(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 150 * 86400000);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const [cropAiMode, setCropAiMode] = useState<CropClassificationMode>('ai-prithvi');
  const [cropAiDataProvider, setCropAiDataProvider] =
    useState<CropDataProviderId>(DEFAULT_CROP_DATA_PROVIDER);
  const [cropAiTrainingSamples, setCropAiTrainingSamples] = useState<CropTrainingSample[]>([]);
  const [cropAiJob, setCropAiJob] = useState<CropClassificationJob | null>(null);
  const [cropAiSelfInference, setCropAiSelfInference] = useState(false);
  const cropAiAbortRef = useRef<AbortController | null>(null);
  const cropAiAoiRef = useRef<any | null>(null);
  const cropAiRunning =
    !!cropAiJob && cropAiJob.status !== 'done' && cropAiJob.status !== 'error';

  const cropAiSamplesValidation = useMemo(
    () =>
      validateTrainingSamples(
        cropAiTrainingSamples,
        (drawnGeometry?.geometry ?? null) as GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
      ),
    [cropAiTrainingSamples, drawnGeometry],
  );

  useEffect(() => {
    let alive = true;
    void fetchCropClassificationConfig().then(cfg => {
      if (alive && cfg) setCropAiSelfInference(Boolean(cfg.selfInference));
    });
    return () => {
      alive = false;
    };
  }, []);

  const trackCropAiJob = useCallback((jobId: string) => {
    cropAiAbortRef.current?.abort();
    const ctrl = new AbortController();
    cropAiAbortRef.current = ctrl;
    void pollJob(jobId, job => setCropAiJob(job), ctrl.signal).catch(() => {
      /* aborted or network error â€” last snapshot already shown */
    });
  }, []);

  const handleCropAiRunAoi = useCallback(() => {
    const geometry = drawnGeometryRef.current?.geometry ?? drawnGeometry?.geometry;
    if (!geometry) return;
    if (!isCropPanelProvider(cropAiDataProvider)) return;
    if (cropAiMode === 'supervised-ground-truth' && !cropAiSamplesValidation.valid) return;
    cropAiAoiRef.current = geometry;
    setCropAiJob({
      id: 'pending',
      mode: 'aoi',
      status: 'queued',
      progress: 0,
      message: 'Starting…',
      result: null,
      error: null,
    });
    const start =
      cropAiMode === 'supervised-ground-truth'
        ? startSupervisedAoiJob({
            aoi: geometry,
            season: cropAiSeason,
            timesteps: 5,
            samples: cropAiTrainingSamples,
            dataProvider: cropAiDataProvider,
          })
        : startAoiJob({
            aoi: geometry,
            season: cropAiSeason,
            timesteps: 3,
            dataProvider: cropAiDataProvider,
          });
    void start
      .then(trackCropAiJob)
      .catch(err =>
        setCropAiJob({
          id: 'error',
          mode: 'aoi',
          status: 'error',
          progress: 1,
          message: 'Failed to start.',
          result: null,
          error: String(err?.message || err),
        }),
      );
  }, [
    cropAiDataProvider,
    cropAiMode,
    cropAiSamplesValidation.valid,
    cropAiSeason,
    cropAiTrainingSamples,
    drawnGeometry,
    trackCropAiJob,
  ]);

  const handleCropAiRunChip = useCallback(
    (imageUrl: string) => {
      setCropAiJob({
        id: 'pending',
        mode: 'chip',
        status: 'queued',
        progress: 0,
        message: 'Startingâ€¦',
        result: null,
        error: null,
      });
      void startChipJob(imageUrl)
        .then(trackCropAiJob)
        .catch(err =>
          setCropAiJob({
            id: 'error',
            mode: 'chip',
            status: 'error',
            progress: 1,
            message: 'Failed to start.',
            result: null,
            error: String(err?.message || err),
          }),
        );
    },
    [trackCropAiJob],
  );

  const handleCropAiCancel = useCallback(() => {
    cropAiAbortRef.current?.abort();
    cropAiAbortRef.current = null;
    setCropAiJob(prev =>
      prev ? { ...prev, status: 'error', message: 'Cancelled.', error: 'Cancelled by user.' } : prev,
    );
  }, []);

  const handleCropAiPickAoi = useCallback(() => {
    mapDrawOwnerRef.current = 'remote-sensing';
    setMapDrawOwner('remote-sensing');
    setRsDrawingModeActive(true);
    applyMapDrawTool('polygon');
  }, []);

  const CROP_AI_PREDICTION_LAYER_ID = 'crop-ai-prediction';
  const CROP_AI_CONFIDENCE_LAYER_ID = 'crop-ai-confidence';

  const clipRasterToAoi = useCallback(
    async (
      imageUrl: string,
      bounds: [number, number, number, number],
      geometry: any,
    ): Promise<string> => {
      const rings: number[][][] =
        geometry?.type === 'Polygon'
          ? geometry.coordinates
          : geometry?.type === 'MultiPolygon'
            ? geometry.coordinates.flat()
            : [];
      if (!rings.length) return imageUrl;
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = imageUrl;
        });
        const W = img.naturalWidth || 224;
        const H = img.naturalHeight || 224;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return imageUrl;
        ctx.drawImage(img, 0, 0, W, H);
        const [w, s, e, n] = bounds;
        const toPx = (lng: number, lat: number): [number, number] => [
          ((lng - w) / (e - w)) * W,
          ((n - lat) / (n - s)) * H,
        ];
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        for (const ring of rings) {
          ring.forEach((pt, i) => {
            const [px, py] = toPx(pt[0], pt[1]);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
        }
        ctx.fill('evenodd');
        ctx.globalCompositeOperation = 'source-over';
        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
        return blob ? URL.createObjectURL(blob) : imageUrl;
      } catch {
        return imageUrl;
      }
    },
    [],
  );

  const addCropAiRasterLayer = useCallback(
    async (
      job: CropClassificationJob | null,
      layerId: string,
      layerName: string,
      rasterKey: 'prediction' | 'confidence',
      mapOpacity: number,
    ) => {
      const raster = job?.result?.[rasterKey];
      const url = raster?.url;
      const bounds = raster?.bounds;
      if (!url || !Array.isArray(bounds) || bounds.length < 4) return;
      const boundsTuple = bounds as [number, number, number, number];
      const [w, s, e, n] = boundsTuple;
      const coordinates: RasterMapCoordinates = [
        [w, n],
        [e, n],
        [e, s],
        [w, s],
      ];
      const aoiGeometry = cropAiAoiRef.current ?? drawnGeometryRef.current?.geometry ?? null;
      const proxiedUrl = /^https?:\/\//i.test(url) ? cropPredictionImageUrl(url) : url;
      const finalUrl = aoiGeometry
        ? await clipRasterToAoi(proxiedUrl, boundsTuple, aoiGeometry)
        : proxiedUrl;
      const outline = aoiGeometry
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: aoiGeometry }] }
        : siRasterExtentFootprint(coordinates);
      setCustomLayers(prev => {
        const stale = prev.find(l => l.id === layerId);
        if (stale?.raster?.url?.startsWith('blob:') && stale.raster.url !== finalUrl) {
          URL.revokeObjectURL(stale.raster.url);
        }
        const without = prev.filter(l => l.id !== layerId);
        return [
          ...without,
          {
            id: layerId,
            name: layerName,
            geojson: outline,
            visible: true,
            source: 'api',
            renderMode: 'raster',
            raster: { url: finalUrl, coordinates },
            ephemeral: true,
            mapOpacity,
          },
        ];
      });
    },
    [clipRasterToAoi],
  );

  const addCropAiPredictionLayer = useCallback(
    async (job: CropClassificationJob | null) => {
      await addCropAiRasterLayer(job, CROP_AI_PREDICTION_LAYER_ID, 'Crop Type', 'prediction', 0.9);
    },
    [addCropAiRasterLayer],
  );

  const addCropAiConfidenceLayer = useCallback(
    async (job: CropClassificationJob | null) => {
      await addCropAiRasterLayer(job, CROP_AI_CONFIDENCE_LAYER_ID, 'Crop Confidence', 'confidence', 0.75);
    },
    [addCropAiRasterLayer],
  );

  // Auto-publish the Prithvi prediction to the map as a "Crop Type" layer.
  const cropAiPublishedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (cropAiJob?.status !== 'done') return;
    const url = cropAiJob.result?.prediction?.url;
    if (!url) return;
    if (cropAiPublishedKeyRef.current === cropAiJob.id) return;
    cropAiPublishedKeyRef.current = cropAiJob.id;
    void addCropAiPredictionLayer(cropAiJob);
  }, [cropAiJob, addCropAiPredictionLayer]);

  const [geoAiFloatingOpen, setGeoAiFloatingOpen] = useState(false);
  const [layerLiveLegendOpen, setLayerLiveLegendOpen] = useState(false);
  const [geoAiFloatingExpanded, setGeoAiFloatingExpanded] = useState(false);

  const onGeoAiFloatingRailToggle = useCallback(() => {
    setGeoAiFloatingOpen(prev => {
      const next = !prev;
      if (next) {
        setIsLayerDropdownOpen(false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!geoAiFloatingOpen) return;
    setGeoAiFloatingExpanded(true);
    setExpandedEnvSection('table-geo-ai');
  }, [geoAiFloatingOpen]);

  const onProcessingWorkflowNavigateMapToolbox: MapToolboxNavigateHandler = useCallback(
    (id, meta) => {
      const sid = id as MapToolboxSectionId;
      if (sid === 'table-geo-ai') {
        setGeoAiFloatingOpen(true);
        setGeoAiFloatingExpanded(true);
        setExpandedEnvSection('table-geo-ai');
        setIsLayerDropdownOpen(false);
        return;
      }
      if (meta?.fromDockOptions) {
        setExpandedEnvSection(sid);
        setIsLayerDropdownOpen(true);
        return;
      }
      setExpandedEnvSection(sid);
      setIsLayerDropdownOpen(true);
    },
    [],
  );

  const [geoExplorerMessages, setGeoExplorerMessages] = useState<GeoExplorerMessage[]>([]);
  const [geoExplorerVisibleCount, setGeoExplorerVisibleCount] = useState(GEO_AI_CHAT_PAGE_SIZE);
  const [geoAiSmartSuggestionsEnabled, setGeoAiSmartSuggestionsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(siScope.scopedStorageKey('geo_ai_smart_suggestions_enabled_v1')) !== '0';
  });
  const [geoExplorerDraft, setGeoExplorerDraft] = useState('');
  const [geoExplorerPendingImage, setGeoExplorerPendingImage] = useState<{
    mime: string;
    base64: string;
  } | null>(null);
  const [geoExplorerBusy, setGeoExplorerBusy] = useState(false);
  /** Distinguishes full send vs in-place question edit so the UI shows â€œUpdatingâ€¦â€ instead of â€œThinkingâ€¦â€. */
  const [geoExplorerAwaitKind, setGeoExplorerAwaitKind] = useState<'send' | 'edit'>('send');
  const [geoExplorerChatError, setGeoExplorerChatError] = useState('');
  const [geoAiPinLngLat, setGeoAiPinLngLat] = useState<[number, number] | null>(null);
  const [geoAiInspectPopups, setGeoAiInspectPopups] = useState<GeoAiInspectPopupState[]>([]);
  const geoAiInspectCard = geoAiInspectPopups.length > 0 ? geoAiInspectPopups[0]! : null;
  /**
   * A resolved inspect card that is held back from auto-opening. The map drops a
   * pin and the user clicks it to open the popup (no automatic pop-up).
   */
  const [geoAiPendingInspectCard, setGeoAiPendingInspectCard] = useState<GeoAiInspectCardState | null>(null);
  const [geoAiPopupMode, setGeoAiPopupMode] = useState<GeoAiPopupMode>(() =>
    readStoredGeoAiPopupMode(siScope.scopedStorageKey(GEO_AI_POPUP_MODE_LS_KEY)),
  );
  /** When true, row highlight / map identify do not pan or zoom the map (use row â€œzoomâ€ icon to fly there). */
  const [geoAiExplorationMode, setGeoAiExplorationMode] = useState(() => {
    try {
      const v =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(siScope.scopedStorageKey(GEO_AI_EXPLORATION_LS_KEY))
          : '';
      if (v === '0' || v === 'false') return false;
    } catch {
      /* ignore */
    }
    return true;
  });
  const [geoAiTableSelectionsByTableId, setGeoAiTableSelectionsByTableId] = useState<Record<string, GeoExplorerMapLink[]>>(
    {},
  );
  const [geoAiTableMapFocusKey, setGeoAiTableMapFocusKey] = useState<string | null>(null);
  /** Last Geo AI user message (any model) â€” drives inspect-popup field pick + map identify context. */
  const geoAiLastUserMapQueryRef = useRef<string>('');
  const geoAiReverseGeocodeKeyRef = useRef<string>('');
  const geoAiSuppressPopupsUntilRef = useRef(0);
  const geoExplorerFileInputRef = useRef<HTMLInputElement | null>(null);
  const geoExplorerInFlightRef = useRef(false);
  const [geoAiModelTab, setGeoAiModelTab] = useState<'gemini' | 'claude' | 'deepseek' | 'ollama'>('ollama');

  // Preload the local model when the AgroCloud AI Chat (Ollama) tab opens so the
  // first answer returns quickly instead of paying the cold model-load cost.
  useEffect(() => {
    if (geoAiModelTab !== 'ollama') return;
    void warmOllama(ollamaConfig.baseUrl, ollamaConfig.model);
  }, [geoAiModelTab, ollamaConfig.baseUrl, ollamaConfig.model]);
  const [geoAiChatMessages, setGeoAiChatMessages] = useState<GeoExplorerMessage[]>([]);
  const geoAiChatMessagesRef = useRef<GeoExplorerMessage[]>([]);
  geoAiChatMessagesRef.current = geoAiChatMessages;
  const [geoAiClaudeVisibleCount, setGeoAiClaudeVisibleCount] = useState(GEO_AI_CHAT_PAGE_SIZE);
  const [geoAiDraft, setGeoAiDraft] = useState('');
  const [geoAiBusy, setGeoAiBusy] = useState(false);
  const [geoAiChatError, setGeoAiChatError] = useState('');
  const geoAiInFlightRef = useRef(false);
  const [geoDeepseekChatMessages, setGeoDeepseekChatMessages] = useState<GeoExplorerMessage[]>([]);
  const geoDeepseekChatMessagesRef = useRef<GeoExplorerMessage[]>([]);
  geoDeepseekChatMessagesRef.current = geoDeepseekChatMessages;
  const [geoAiDeepseekVisibleCount, setGeoAiDeepseekVisibleCount] = useState(GEO_AI_CHAT_PAGE_SIZE);
  const [geoDeepseekDraft, setGeoDeepseekDraft] = useState('');
  const [geoDeepseekBusy, setGeoDeepseekBusy] = useState(false);
  const [geoDeepseekChatError, setGeoDeepseekChatError] = useState('');
  const geoDeepseekInFlightRef = useRef(false);
  const [geoOllamaChatMessages, setGeoOllamaChatMessages] = useState<GeoExplorerMessage[]>([]);
  // Latest committed messages â€” read at send time so the async turn doesn't depend
  // on the state-updater (which React invokes twice under StrictMode).
  const geoOllamaChatMessagesRef = useRef<GeoExplorerMessage[]>([]);
  geoOllamaChatMessagesRef.current = geoOllamaChatMessages;
  const [geoAiOllamaVisibleCount, setGeoAiOllamaVisibleCount] = useState(GEO_AI_CHAT_PAGE_SIZE);
  const [geoOllamaDraft, setGeoOllamaDraft] = useState('');
  const [geoOllamaBusy, setGeoOllamaBusy] = useState(false);
  const [geoOllamaChatError, setGeoOllamaChatError] = useState('');
  const geoOllamaInFlightRef = useRef(false);
  const [polygonClosingSnap, setPolygonClosingSnap] = useState(false);
  /** 1 during interaction; animates toward 0 while clearing AOI overlays for a smooth fade-out */
  const [drawVisualOpacity, setDrawVisualOpacity] = useState(1);
  const drawFadeRafRef = useRef<number | null>(null);
  const [drawAssistHint, setDrawAssistHint] = useState('');
  const [circleRadiusM, setCircleRadiusM] = useState<number | null>(null);
  /** After initial circle drag: center + edge with N/E/S/W handles before Enter commits. */
  const [circleRefineDraft, setCircleRefineDraft] = useState<null | { center: [number, number]; edge: [number, number] }>(
    null,
  );
  const [circleRefineActiveHandle, setCircleRefineActiveHandle] = useState<
    null | 'center' | CircleCardinal | 'pan'
  >(null);
  const acsFileInputRef = useRef<HTMLInputElement | null>(null);
  const exploreCatalogSigRef = useRef('');
  const searchRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const siMapContainerRef = useRef<HTMLDivElement | null>(null);
  /** One-shot fallback to Mercator when Globe/WebGL errors (e.g. some Edge + GPU combos). */
  const siGlobeWebglFailoverRef = useRef(false);
  const siGlobeCockpitBootRef = useRef(false);
  /** True while the WebGL context is lost (between contextlost and contextrestored). */
  const siWebglContextLostRef = useRef(false);
  /** Bounded retry counter for the "map style never became ready" watchdog. */
  const siMapLoadRetryRef = useRef(0);
  /** Bounded retry bookkeeping for Sentinel-2 WMS tile errors (reset per layer/date/AOI). */
  const sentinelTileRetryRef = useRef<{ key: string; attempts: number; timer: number | null }>({
    key: '',
    attempts: 0,
    timer: null,
  });
  const basemapRasterFallbackRef = useRef(false);
  const tryFallbackBasemapFromTileError = useCallback((url: string, status?: number) => {
    if (basemapRasterFallbackRef.current) return;
    if (!basemapTileErrorShouldFallback(url, status)) return;
    basemapRasterFallbackRef.current = true;
    setBasemapId(RASTER_BASEMAP_FALLBACK_ID);
    setStacStatus('Basemap tiles unavailable â€” using Esri World Imagery.');
  }, []);
  const siTableFeatureKeyCacheRef = useRef<Map<object, string>>(new Map());
  const drawnGeometryRef = useRef<any | null>(null);
  const cropClassAoiGeometryRef = useRef<any | null>(null);
  const mapDrawOwnerRef = useRef<'remote-sensing' | 'crop-classification'>('remote-sensing');
  const cropClassDrawingModeActiveRef = useRef(false);
  mapDrawOwnerRef.current = mapDrawOwner;
  cropClassDrawingModeActiveRef.current = cropClassDrawingModeActive;
  const isSketchDrawingActiveRef = useRef(false);
  isSketchDrawingActiveRef.current = rsDrawingModeActive || cropClassDrawingModeActive || gisSelectionActive;
  const activeDrawGeomRef = () =>
    mapDrawOwnerRef.current === 'crop-classification' ? cropClassAoiGeometryRef : drawnGeometryRef;
  /** Primary Layer Source mask (Agro_Structures / AOI Mask Builder) â€” never mixed with preview sketch. */
  const primaryLayerSourceMaskRef = useRef<GeoJSON.FeatureCollection | GeoJSON.Feature | null>(null);
  const hasActiveLayerSourceAoiRef = useRef(false);
  const dragRectCircleRef = useRef<null | { kind: 'rectangle' | 'circle' | 'box_select'; start: [number, number] }>(null);
  const circleRefineDraftRef = useRef<null | { center: [number, number]; edge: [number, number] }>(null);
  const circleRefineInteractionRef = useRef<
    null | { type: 'handle'; h: 'center' | CircleCardinal } | { type: 'pan'; last: [number, number] }
  >(null);
  const circleRefineLastMoveRef = useRef<[number, number] | null>(null);
  const preEditGeomRef = useRef<any | null>(null);
  const polylineStartRef = useRef<[number, number] | null>(null);
  polylineStartRef.current = polylineStart;
  const measureModeRef = useRef<MeasureMode | null>(null);
  measureModeRef.current = measureMode;
  const measureFinishedRef = useRef(false);
  measureFinishedRef.current = measureFinished;
  const measurePointsRef = useRef<MeasurePoint[]>([]);
  measurePointsRef.current = measurePoints;
  const measureRedoRef = useRef<MeasurePoint[]>([]);
  measureRedoRef.current = measureRedoStack;
  // Keep the Measurement panel's clicks/wheel from leaking to the map underneath.
  const measureHudIsolationProps = useMapOverlayIsolation(measurePanelOpen || measureMode != null, { native: true });
  // Fully isolate the floating processing stack (Remote Sensing, Crop Alerts,
  // Crop AI, AI Detection, Tree, Hydro) from the map â€” pan/zoom/rotate/wheel and
  // every pointer/touch gesture stay inside the panel, in all tools and modes.
  const processingPanelIsolationProps = useMapOverlayIsolation(isLayerDropdownOpen, { native: true });
  const mapDrawToolRef = useRef<MapDrawTool>('select');
  mapDrawToolRef.current = mapDrawTool;
  const rsDrawingModeActiveRef = useRef(false);
  rsDrawingModeActiveRef.current = rsDrawingModeActive;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const geoExplorerMessagesRef = useRef<HTMLDivElement | null>(null);
  const geoAiClaudeMessagesRef = useRef<HTMLDivElement | null>(null);
  const geoAiDeepseekMessagesRef = useRef<HTMLDivElement | null>(null);
  const geoAiOllamaMessagesRef = useRef<HTMLDivElement | null>(null);
  const geoExplorerLoadOlderRef = useRef<{ top: number; height: number } | null>(null);
  const geoAiClaudeLoadOlderRef = useRef<{ top: number; height: number } | null>(null);
  const geoAiDeepseekLoadOlderRef = useRef<{ top: number; height: number } | null>(null);
  const geoAiOllamaLoadOlderRef = useRef<{ top: number; height: number } | null>(null);
  const netfloraUploadInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextMapClickRef = useRef(false);
  /** While drawing a polygon: index of vertex being dragged, or null. */
  const polygonRingSketchDragRef = useRef<number | null>(null);
  const editDragRef = useRef<null | { mode: 'vertex'; ref: VertexRef } | { mode: 'pan'; last: [number, number] }>(null);
  const consoleErrorRef = useRef<typeof console.error | null>(null);
  const stacFocusHydratedRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(siScope.scopedStorageKey(GEO_AI_POPUP_MODE_LS_KEY), geoAiPopupMode);
    } catch {
      /* ignore */
    }
  }, [geoAiPopupMode, siScope]);

  useEffect(() => {
    try {
      localStorage.setItem(
        siScope.scopedStorageKey(GEO_AI_EXPLORATION_LS_KEY),
        geoAiExplorationMode ? '1' : '0',
      );
    } catch {
      /* ignore */
    }
  }, [geoAiExplorationMode, siScope]);

  const geoAiMergedTableSelectionLinks = useMemo(() => {
    const out: GeoExplorerMapLink[] = [];
    const seen = new Set<string>();
    for (const arr of Object.values(geoAiTableSelectionsByTableId)) {
      for (const l of arr) {
        const k =
          l.type === 'feature' ? stableFeatureLinkKey(l) ?? '' : `c:${l.lng},${l.lat}`;
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(l);
      }
    }
    return out;
  }, [geoAiTableSelectionsByTableId]);

  const deferredGeoAiMergedSelectionLinks = useDeferredValue(geoAiMergedTableSelectionLinks);
  const geoAiMapHighlightSelectionLinks = useMemo(
    () => sampleGeoAiMapSelectionLinks(deferredGeoAiMergedSelectionLinks, SI_GEO_AI_MAP_HIGHLIGHT_MAX_LINKS),
    [deferredGeoAiMergedSelectionLinks],
  );

  const onGeoAiTableSelectionSync = useCallback((tableId: string, links: GeoExplorerMapLink[]) => {
    setGeoAiTableSelectionsByTableId(prev => ({ ...prev, [tableId]: links }));
  }, []);

  const onGeoAiQuerySelectApplied = useCallback(() => {
    geoAiSuppressPopupsUntilRef.current = Date.now() + 1000;
  }, []);

  const shouldSuppressGeoAiMapIdentifyPopup = useCallback(() => {
    if (Date.now() < geoAiSuppressPopupsUntilRef.current) return true;
    const t = mapDrawToolRef.current;
    if (t === 'box_select' || t === 'lasso' || t === 'freehand') return true;
    if (dragRectCircleRef.current != null) return true;
    return false;
  }, []);

  const wrapInspectPopup = useCallback(
    (card: GeoAiInspectCardState, featureLinkKey: string | null): GeoAiInspectPopupState => ({
      ...card,
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${Date.now()}`,
      pinned: false,
      collapsed: false,
      featureLinkKey,
    }),
    [],
  );

  const setGeoAiInspectCard = useCallback(
    (next: GeoAiInspectCardState | null | ((prev: GeoAiInspectCardState | null) => GeoAiInspectCardState | null)) => {
      if (next === null) {
        setGeoAiInspectPopups([]);
        return;
      }
      if (typeof next === 'function') {
        setGeoAiInspectPopups(prev => {
          const cur = prev[0];
          const curCard: GeoAiInspectCardState | null = cur
            ? {
                title: cur.title,
                rows: cur.rows,
                inspect: cur.inspect,
                lng: cur.lng,
                lat: cur.lat,
                areaName: cur.areaName,
                country: cur.country,
              }
            : null;
          const n = next(curCard);
          if (!n) return [];
          if (!cur) return [wrapInspectPopup(n, null)];
          return [
            {
              ...cur,
              ...n,
              id: cur.id,
              pinned: cur.pinned,
              collapsed: cur.collapsed,
              featureLinkKey: cur.featureLinkKey,
              inspect: n.inspect ?? cur.inspect,
            },
            ...prev.slice(1),
          ];
        });
        return;
      }
      setGeoAiInspectPopups([wrapInspectPopup(next, null)]);
    },
    [wrapInspectPopup],
  );

  /**
   * Stage an inspect card WITHOUT auto-opening it: close any open popup and keep
   * the card pending so the user opens it by clicking the dropped map pin.
   * (Replaces the previous behaviour where Geo AI answers popped up a card.)
   */
  const stageGeoAiInspectCard = useCallback((card: GeoAiInspectCardState) => {
    setGeoAiInspectPopups([]);
    setGeoAiPendingInspectCard(card);
  }, []);

  /** Open the staged card (invoked when the user clicks the Geo AI / search pin). */
  const openStagedGeoAiInspectCard = useCallback(() => {
    if (!geoAiPendingInspectCard) return;
    setGeoAiInspectCard(geoAiPendingInspectCard);
  }, [geoAiPendingInspectCard, setGeoAiInspectCard]);

  const mergeGeoAiInspectFromMapOrTable = useCallback(
    (card: GeoAiInspectCardState, linkForKey: GeoExplorerMapLink | null) => {
      const fk = linkForKey?.type === 'feature' ? stableFeatureLinkKey(linkForKey) : null;
      setGeoAiTableMapFocusKey(fk);
      setGeoAiInspectPopups(prev => {
        const w = wrapInspectPopup(card, fk);
        if (geoAiPopupMode === 'single') return [w];
        if (fk) {
          const ix = prev.findIndex(p => p.featureLinkKey === fk && !p.pinned);
          if (ix >= 0) {
            const cp = [...prev];
            cp[ix] = {
              ...cp[ix],
              ...card,
              featureLinkKey: fk,
              collapsed: cp[ix]!.collapsed,
              inspect: card.inspect ?? cp[ix]!.inspect,
            };
            return cp.slice(-GEO_AI_MAX_INSPECT_POPUPS);
          }
        }
        return [...prev, w].slice(-GEO_AI_MAX_INSPECT_POPUPS);
      });
    },
    [geoAiPopupMode, wrapInspectPopup],
  );

  const visibleGeoExplorerMessages = useMemo(
    () => geoExplorerMessages.slice(Math.max(0, geoExplorerMessages.length - geoExplorerVisibleCount)),
    [geoExplorerMessages, geoExplorerVisibleCount],
  );
  const geoExplorerHasOlderMessages = geoExplorerMessages.length > geoExplorerVisibleCount;
  const visibleGeoAiClaudeMessages = useMemo(
    () => geoAiChatMessages.slice(Math.max(0, geoAiChatMessages.length - geoAiClaudeVisibleCount)),
    [geoAiChatMessages, geoAiClaudeVisibleCount],
  );
  const geoAiClaudeHasOlderMessages = geoAiChatMessages.length > geoAiClaudeVisibleCount;
  const visibleGeoAiDeepseekMessages = useMemo(
    () => geoDeepseekChatMessages.slice(Math.max(0, geoDeepseekChatMessages.length - geoAiDeepseekVisibleCount)),
    [geoDeepseekChatMessages, geoAiDeepseekVisibleCount],
  );
  const geoAiDeepseekHasOlderMessages = geoDeepseekChatMessages.length > geoAiDeepseekVisibleCount;

  const loadOlderGeoExplorerMessages = useCallback(() => {
    if (!geoExplorerHasOlderMessages) return;
    const el = geoExplorerMessagesRef.current;
    if (el) geoExplorerLoadOlderRef.current = { top: el.scrollTop, height: el.scrollHeight };
    setGeoExplorerVisibleCount(prev => Math.min(geoExplorerMessages.length, prev + GEO_AI_CHAT_PAGE_SIZE));
  }, [geoExplorerHasOlderMessages, geoExplorerMessages.length]);
  const loadOlderGeoAiClaudeMessages = useCallback(() => {
    if (!geoAiClaudeHasOlderMessages) return;
    const el = geoAiClaudeMessagesRef.current;
    if (el) geoAiClaudeLoadOlderRef.current = { top: el.scrollTop, height: el.scrollHeight };
    setGeoAiClaudeVisibleCount(prev => Math.min(geoAiChatMessages.length, prev + GEO_AI_CHAT_PAGE_SIZE));
  }, [geoAiClaudeHasOlderMessages, geoAiChatMessages.length]);
  const loadOlderGeoAiDeepseekMessages = useCallback(() => {
    if (!geoAiDeepseekHasOlderMessages) return;
    const el = geoAiDeepseekMessagesRef.current;
    if (el) geoAiDeepseekLoadOlderRef.current = { top: el.scrollTop, height: el.scrollHeight };
    setGeoAiDeepseekVisibleCount(prev => Math.min(geoDeepseekChatMessages.length, prev + GEO_AI_CHAT_PAGE_SIZE));
  }, [geoAiDeepseekHasOlderMessages, geoDeepseekChatMessages.length]);

  const visibleGeoAiOllamaMessages = useMemo(
    () => geoOllamaChatMessages.slice(Math.max(0, geoOllamaChatMessages.length - geoAiOllamaVisibleCount)),
    [geoOllamaChatMessages, geoAiOllamaVisibleCount],
  );
  const geoAiOllamaHasOlderMessages = geoOllamaChatMessages.length > geoAiOllamaVisibleCount;
  const loadOlderGeoAiOllamaMessages = useCallback(() => {
    if (!geoAiOllamaHasOlderMessages) return;
    const el = geoAiOllamaMessagesRef.current;
    if (el) geoAiOllamaLoadOlderRef.current = { top: el.scrollTop, height: el.scrollHeight };
    setGeoAiOllamaVisibleCount(prev => Math.min(geoOllamaChatMessages.length, prev + GEO_AI_CHAT_PAGE_SIZE));
  }, [geoAiOllamaHasOlderMessages, geoOllamaChatMessages.length]);

  const runSatelliteGeoExplorerGeminiPipeline = useCallback(
    async (args: {
      historyWithUser: GeoExplorerMessage[];
      userTextForMapFallback: string;
      coordsSourceMessages: GeoExplorerMessage[];
      skipLocalStatsBecausePendingImage: boolean;
      questionEditInPlace: boolean;
    }) => {
      const {
        historyWithUser,
        userTextForMapFallback,
        coordsSourceMessages,
        skipLocalStatsBecausePendingImage,
        questionEditInPlace,
      } = args;
      const trimmed = userTextForMapFallback.trim();
      const apiKey = geminiApiKey.trim();
      if (!apiKey) return;
      try {
        if (!skipLocalStatsBecausePendingImage && trimmed) {
          const savedLayersForStats = await loadGisMapSavedLayers();
          const mergedLayersForStats: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedLayersForStats.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const localStats = runGeoAiStatsCommand(trimmed, mergedLayersForStats);
          if (localStats?.handled) {
            const mid =
              typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `geo-s-${Date.now()}`;
            const parts: GeoExplorerPart[] = [{ type: 'text', text: localStats.reply }];
            if (localStats.table) parts.push({ type: 'dataTable', table: localStats.table });
            const modelMsg: GeoExplorerMessage = { id: mid, role: 'model', parts };
            setGeoExplorerMessages(h => [...h, modelMsg]);
            if (localStats.mapFirstSync?.selections?.length) {
              queueMicrotask(() => applySatelliteGeoAiMapFirstSync(localStats.mapFirstSync!.selections));
            }
            return;
          }
        }
        let developAppend = '';
        if (!siScope.isolateRouting) {
          try {
            const raw =
              typeof localStorage !== 'undefined' ? localStorage.getItem(DEVELOP_DATA_CONTEXT_LS_KEY) : null;
            if (raw?.trim()) {
              developAppend = `### Develop Dashboard â€” Data pane snapshot (JSON)\n${raw.slice(0, 14000)}`;
            }
          } catch {
            /* ignore */
          }
        }
        const result = await runGeoExplorerGeminiTurn({
          apiKey,
          historyWithUser,
          userTextForMapFallback,
          primaryVectorLayers: satelliteCustomLayersToGeoAiLayers(customLayers),
          mapboxAccessToken: mapboxToken || undefined,
          openWeatherApiKey,
          pinLngLat: geoAiPinLngLat,
          lastMapQueryCoords: lastMapQueryCoordsFromMessages(coordsSourceMessages),
          inspectAnchorLngLat:
            geoAiInspectCard != null ? ([geoAiInspectCard.lng, geoAiInspectCard.lat] as [number, number]) : null,
          mapPopup: null,
          addedLayersHeading: '### Satellite â€” Added layers (this map â€” si-env / vector layers)',
          attachGisSavedLayers: true,
          extraSystemAppend:
            [geoAiLiveMapStateBlockRef.current, developAppend].filter(Boolean).join('\n\n') || undefined,
          questionEditInPlace,
        });
        setGeoExplorerMessages(h => [...h, result.modelMsg]);
        const geminiReplyText = result.modelMsg.parts
          .filter((p): p is Extract<GeoExplorerPart, { type: 'text' }> => p.type === 'text')
          .map(p => p.text)
          .join('\n');
        runGeoAiMapCommandsRef.current?.(geminiReplyText);
        const me = result.mapEffect;
        if (me) {
          setGeoAiPinLngLat(me.coords);
          setViewState(vs => ({
            ...vs,
            longitude: me.coords[0],
            latitude: me.coords[1],
            zoom: Math.max(
              geoExplorerTargetZoomForPinSource(me.pinSource),
              typeof vs.zoom === 'number' ? vs.zoom : 2,
            ),
            pitch: is3DView ? Math.max(typeof vs.pitch === 'number' ? vs.pitch : 0, 42) : vs.pitch ?? 0,
            bearing: typeof vs.bearing === 'number' ? vs.bearing : 0,
          }));
          if (me.layerHit) {
            const lyrCfg = customLayers.find(l => l.name === me.layerHit.layerName);
            const built = buildGeoAiInspectCardContent({
              properties: me.layerHit.properties,
              arcgisLayerDefinition: me.layerHit.arcgisLayerDefinition,
              popupConfig: lyrCfg?.popupConfig,
              queryContext: userTextForMapFallback,
              inspectCoords: { lng: me.coords[0], lat: me.coords[1] },
            });
            stageGeoAiInspectCard({
              title: me.layerHit.layerName,
              rows: built.rows,
              inspect: built.inspect,
              lng: me.coords[0],
              lat: me.coords[1],
              ...pickGeoAiHumanPlaceFields(me.layerHit.properties),
            });
          } else {
            stageGeoAiInspectCard({
              title: 'Location',
              rows: [
                { label: 'Longitude', value: me.coords[0].toFixed(6) },
                { label: 'Latitude', value: me.coords[1].toFixed(6) },
              ],
              lng: me.coords[0],
              lat: me.coords[1],
            });
          }
        } else {
          setGeoAiInspectCard(null);
          setGeoAiPendingInspectCard(null);
        }
      } catch (e) {
        setGeoExplorerChatError(e instanceof Error ? e.message : String(e));
      } finally {
        geoExplorerInFlightRef.current = false;
        setGeoExplorerBusy(false);
      }
    },
    [
      geminiApiKey,
      customLayers,
      mapboxToken,
      openWeatherApiKey,
      geoAiPinLngLat,
      geoAiInspectCard,
      is3DView,
      stageGeoAiInspectCard,
    ],
  );

  const saveEditedGeoExplorerGeminiQuestion = useCallback(
    (messageId: string, nextText: string) => {
      const trimmed = nextText.trim();
      if (!trimmed) return;
      if (geoExplorerInFlightRef.current) return;
      const apiKey = geminiApiKey.trim();
      if (!apiKey) {
        setGeoExplorerChatError(
          'Add a Gemini API key: System Settings â†’ API Tokens â†’ Gemini API (saved in this browser), or set VITE_GEMINI_API_KEY at build time. Never commit keys to Git.',
        );
        return;
      }

      let snapshot: GeoExplorerMessage[] | null = null;
      setGeoExplorerMessages(prev => {
        const i = prev.findIndex(m => m.id === messageId);
        if (i < 0) return prev;
        const updated = replaceUserMessageText(prev[i], trimmed);
        snapshot = [...prev.slice(0, i), updated];
        return snapshot;
      });

      if (!snapshot?.length) return;

      geoAiLastUserMapQueryRef.current = trimmed;
      setGeoExplorerChatError('');
      geoExplorerInFlightRef.current = true;
      setGeoExplorerBusy(true);
      setGeoExplorerAwaitKind('edit');
      queueMicrotask(() =>
        void runSatelliteGeoExplorerGeminiPipeline({
          historyWithUser: snapshot!,
          userTextForMapFallback: trimmed,
          coordsSourceMessages: snapshot!,
          skipLocalStatsBecausePendingImage: false,
          questionEditInPlace: true,
        }),
      );
    },
    [geminiApiKey, runSatelliteGeoExplorerGeminiPipeline],
  );

  useLayoutEffect(() => {
    const el = geoExplorerMessagesRef.current;
    const restore = geoExplorerLoadOlderRef.current;
    if (!el || !restore) return;
    el.scrollTop = restore.top + (el.scrollHeight - restore.height);
    geoExplorerLoadOlderRef.current = null;
  }, [geoExplorerVisibleCount]);
  useLayoutEffect(() => {
    const el = geoAiClaudeMessagesRef.current;
    const restore = geoAiClaudeLoadOlderRef.current;
    if (!el || !restore) return;
    el.scrollTop = restore.top + (el.scrollHeight - restore.height);
    geoAiClaudeLoadOlderRef.current = null;
  }, [geoAiClaudeVisibleCount]);
  useLayoutEffect(() => {
    const el = geoAiDeepseekMessagesRef.current;
    const restore = geoAiDeepseekLoadOlderRef.current;
    if (!el || !restore) return;
    el.scrollTop = restore.top + (el.scrollHeight - restore.height);
    geoAiDeepseekLoadOlderRef.current = null;
  }, [geoAiDeepseekVisibleCount]);

  useLayoutEffect(() => {
    const el = geoAiOllamaMessagesRef.current;
    const restore = geoAiOllamaLoadOlderRef.current;
    if (!el || !restore) return;
    el.scrollTop = restore.top + (el.scrollHeight - restore.height);
    geoAiOllamaLoadOlderRef.current = null;
  }, [geoAiOllamaVisibleCount]);

  useLayoutEffect(() => {
    const el = geoExplorerMessagesRef.current;
    if (!el || geoExplorerLoadOlderRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 56) el.scrollTop = el.scrollHeight;
  }, [geoExplorerMessages.length, geoExplorerBusy]);
  useLayoutEffect(() => {
    const el = geoAiClaudeMessagesRef.current;
    if (!el || geoAiClaudeLoadOlderRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 56) el.scrollTop = el.scrollHeight;
  }, [geoAiChatMessages.length, geoAiBusy]);
  useLayoutEffect(() => {
    const el = geoAiDeepseekMessagesRef.current;
    if (!el || geoAiDeepseekLoadOlderRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 56) el.scrollTop = el.scrollHeight;
  }, [geoDeepseekChatMessages.length, geoDeepseekBusy]);

  useLayoutEffect(() => {
    const el = geoAiOllamaMessagesRef.current;
    if (!el || geoAiOllamaLoadOlderRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 56) el.scrollTop = el.scrollHeight;
  }, [geoOllamaChatMessages.length, geoOllamaBusy]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      siScope.scopedStorageKey('geo_ai_smart_suggestions_enabled_v1'),
      geoAiSmartSuggestionsEnabled ? '1' : '0',
    );
  }, [geoAiSmartSuggestionsEnabled]);

  const geoAiSuggestContext = useMemo(() => {
    const allLayers = satelliteCustomLayersToGeoAiLayers(customLayers);
    const layerNames = allLayers.map(l => l.name).filter(Boolean);
    const fieldSet = new Set<string>();
    const numericSet = new Set<string>();
    const geomOps = new Set<string>();
    for (const layer of allLayers) {
      const fc = (layer.geojson && layer.geojson.type === 'FeatureCollection' && Array.isArray(layer.geojson.features))
        ? layer.geojson.features
        : layer.data && layer.data.type === 'FeatureCollection' && Array.isArray(layer.data.features)
          ? layer.data.features
          : [];
      for (const f of fc.slice(0, 120)) {
        const p = f.properties;
        if (p && typeof p === 'object') {
          for (const [k, v] of Object.entries(p)) {
            fieldSet.add(k);
            if (typeof v === 'number' || (typeof v === 'string' && Number.isFinite(Number(v)))) numericSet.add(k);
          }
        }
        const gt = String(f.geometry?.type ?? '');
        if (gt.includes('Polygon')) {
          geomOps.add('Within');
          geomOps.add('Intersects');
          geomOps.add('Buffer');
          geomOps.add('Contains');
          geomOps.add('Clip');
        } else if (gt.includes('Line')) {
          geomOps.add('Intersects');
          geomOps.add('Buffer');
          geomOps.add('Near');
        } else if (gt.includes('Point')) {
          geomOps.add('Within');
          geomOps.add('Near');
          geomOps.add('Buffer');
        }
      }
    }
    return {
      layers: layerNames.slice(0, 20),
      fields: [...fieldSet].sort((a, b) => a.localeCompare(b)).slice(0, 80),
      numericFields: [...numericSet].sort((a, b) => a.localeCompare(b)).slice(0, 60),
      geometryOps: [...geomOps].slice(0, 8),
    };
  }, [customLayers]);

  const applySelectedDate = (date: Date) => {
    const iso = localIsoDate(date);
    setSelectedDate(date);
    setTimeSeriesStart(prev => (prev && iso < prev ? iso : prev || iso));
    setTimeSeriesEnd(prev => (prev && iso > prev ? iso : prev || iso));
  };

  const getGeoJsonBounds = (geojson: any): [number, number, number, number] | null => {
    const points: [number, number][] = [];

    const walkCoords = (coords: any) => {
      if (!coords) return;
      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        points.push([coords[0], coords[1]]);
        return;
      }
      if (Array.isArray(coords)) {
        coords.forEach(walkCoords);
      }
    };

    if (geojson.type === 'FeatureCollection') {
      geojson.features?.forEach((f: any) => walkCoords(f.geometry?.coordinates));
    } else if (geojson.type === 'Feature') {
      walkCoords(geojson.geometry?.coordinates);
    } else if (geojson.type === 'GeometryCollection') {
      geojson.geometries?.forEach((g: any) => walkCoords(g.coordinates));
    } else if (geojson.coordinates) {
      walkCoords(geojson.coordinates);
    }

    if (points.length === 0) return null;

    let [minX, minY] = points[0];
    let [maxX, maxY] = points[0];
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return [minX, minY, maxX, maxY];
  };

  const normalizeDetectionConfidence = (props: Record<string, any>): number => {
    const candidates = [props.confidence, props.score, props.probability, props.conf];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
    }
    return 0;
  };

  const normalizeDetectionClass = (props: Record<string, any>): string => {
    const raw = props.class ?? props.class_name ?? props.species ?? props.label ?? props.name ?? 'Unknown';
    const txt = String(raw || '').trim();
    return txt || 'Unknown';
  };

  const normalizeBboxLike = (bboxLike: any): [number, number, number, number] | null => {
    if (!Array.isArray(bboxLike) || bboxLike.length < 4) return null;
    const a = Number(bboxLike[0]);
    const b = Number(bboxLike[1]);
    const c = Number(bboxLike[2]);
    const d = Number(bboxLike[3]);
    if (![a, b, c, d].every(Number.isFinite)) return null;
    if (c > a && d > b) return [a, b, c, d];
    const w = Math.abs(c);
    const h = Math.abs(d);
    if (w === 0 || h === 0) return null;
    return [a, b, a + w, b + h];
  };

  const bboxesIntersect = (a: [number, number, number, number], b: [number, number, number, number]) =>
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

  const getDetectionFeatureBbox = (feature: any): [number, number, number, number] | null => {
    const fromGeom = getGeoJsonBounds(feature);
    if (fromGeom) return fromGeom;
    const fromProps = normalizeBboxLike(feature?.properties?.bbox ?? feature?.bbox);
    return fromProps;
  };

  const normalizeNetfloraDetectionCollection = (raw: any) => {
    const fc =
      raw?.type === 'FeatureCollection'
        ? raw
        : Array.isArray(raw?.features)
          ? { type: 'FeatureCollection', features: raw.features }
          : Array.isArray(raw)
            ? { type: 'FeatureCollection', features: raw }
            : null;
    if (!fc || !Array.isArray(fc.features)) return null;
    const features = fc.features
      .map((f: any, idx: number) => {
        const props = typeof f?.properties === 'object' && f.properties ? { ...f.properties } : {};
        const confidence = normalizeDetectionConfidence(props);
        const className = normalizeDetectionClass(props);
        const bbox = getDetectionFeatureBbox(f);
        const geometry =
          f?.geometry && typeof f.geometry === 'object'
            ? f.geometry
            : bbox
              ? {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [bbox[0], bbox[1]],
                      [bbox[2], bbox[1]],
                      [bbox[2], bbox[3]],
                      [bbox[0], bbox[3]],
                      [bbox[0], bbox[1]],
                    ],
                  ],
                }
              : null;
        if (!geometry) return null;
        return {
          type: 'Feature',
          id: String(f?.id ?? `det-${idx}-${Math.random().toString(36).slice(2, 7)}`),
          geometry,
          properties: {
            ...props,
            className,
            confidence,
            confidenceBand: confidence >= 0.75 ? 'High' : confidence >= 0.5 ? 'Medium' : 'Low',
            bbox: bbox ?? null,
            bboxText: bbox ? `${bbox[0].toFixed(6)}, ${bbox[1].toFixed(6)}, ${bbox[2].toFixed(6)}, ${bbox[3].toFixed(6)}` : 'n/a',
          },
        };
      })
      .filter(Boolean);
    return { type: 'FeatureCollection', features };
  };

  const netfloraAoiFeature = useMemo(() => {
    if (netfloraAoiSource === 'drawn' && drawnGeometry) return drawnGeometry;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    const b = map?.getBounds?.();
    if (!b) return null;
    return bboxToPolygonFeature(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), 'Current map view AOI');
  }, [drawnGeometry, netfloraAoiSource]);

  const netfloraAoiBounds = useMemo(() => (netfloraAoiFeature ? getGeoJsonBounds(netfloraAoiFeature) : null), [netfloraAoiFeature]);

  const netfloraInputLayerOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = [];
    if (wmsLayer.trim()) {
      const title = wmsLayers.find(l => l.name === wmsLayer)?.title || wmsLayer;
      opts.push({
        id: `wms:${wmsLayer}`,
        label: `Raster Â· Sentinel WMS Â· ${title} (${localIsoDate(selectedDate)})`,
      });
    }
    for (const layer of customLayers) {
      const geom = getLayerGeometryKind(layer.geojson);
      const kind = geom === 'point' || geom === 'line' || geom === 'polygon' ? 'Vector' : 'Layer';
      opts.push({ id: `layer:${layer.id}`, label: `${kind} Â· ${layer.name}` });
    }
    return opts;
  }, [customLayers, selectedDate, wmsLayer, wmsLayers]);

  const runNetfloraDetection = useCallback(() => {
    if (!netfloraUploadedResults?.features?.length) {
      setNetfloraStatus('Upload NetFlora detections GeoJSON first, then run detection.');
      return;
    }
    setNetfloraBusy(true);
    try {
      const all = Array.isArray(netfloraUploadedResults.features) ? netfloraUploadedResults.features : [];
      const filtered = all.filter((ft: any) => {
        const conf = Number(ft?.properties?.confidence ?? 0);
        if (!Number.isFinite(conf) || conf < netfloraThreshold) return false;
        if (!netfloraAoiBounds) return true;
        if (netfloraDetectionMode === 'aoi_first' || netfloraDetectionMode === 'full_then_clip') {
          const box = getDetectionFeatureBbox(ft);
          if (!box) return false;
          return bboxesIntersect(box, netfloraAoiBounds);
        }
        return true;
      });
      const out = { type: 'FeatureCollection', features: filtered };
      const classAgg = new Map<string, { count: number; sum: number }>();
      let confSum = 0;
      for (const f of filtered) {
        const cls = String(f?.properties?.className || 'Unknown');
        const conf = Number(f?.properties?.confidence ?? 0);
        const row = classAgg.get(cls) ?? { count: 0, sum: 0 };
        row.count += 1;
        row.sum += Number.isFinite(conf) ? conf : 0;
        classAgg.set(cls, row);
        confSum += Number.isFinite(conf) ? conf : 0;
      }
      const byClass = Array.from(classAgg.entries())
        .map(([label, row]) => ({
          label,
          count: row.count,
          avgConfidence: row.count ? row.sum / row.count : 0,
        }))
        .sort((a, b) => b.count - a.count);
      const stats: NetfloraDetectionStats = {
        total: filtered.length,
        avgConfidence: filtered.length ? confSum / filtered.length : 0,
        byClass,
      };
      setNetfloraFilteredResults(out);
      setNetfloraStats(stats);
      setCustomLayers(prev => {
        const name = 'NetFlora AI detections';
        const nextLayer: CustomLayer = {
          id: NETFLORA_DETECTIONS_LAYER_ID,
          name,
          source: 'api',
          sourceUrl: 'netflora://local-results',
          authToken: null,
          geojson: out as any,
          visible: true,
          ...siDefaultNewVectorLayerFields(),
        };
        const has = prev.some(l => l.id === NETFLORA_DETECTIONS_LAYER_ID);
        return has ? prev.map(l => (l.id === NETFLORA_DETECTIONS_LAYER_ID ? { ...l, ...nextLayer } : l)) : [...prev, nextLayer];
      });
      setNetfloraStatus(`Detection completed: ${filtered.length} objects mapped to GIS layer.`);
    } catch (e) {
      setNetfloraStatus(e instanceof Error ? e.message : 'Failed to run detection workflow.');
    } finally {
      setNetfloraBusy(false);
    }
  }, [netfloraUploadedResults, netfloraThreshold, netfloraAoiBounds, netfloraDetectionMode]);

  const onNetfloraUploadChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const normalized = normalizeNetfloraDetectionCollection(parsed);
      if (!normalized || !normalized.features?.length) {
        setNetfloraStatus('No valid detection features found in uploaded file.');
        return;
      }
      setNetfloraUploadedResults(normalized);
      setNetfloraFilteredResults(null);
      setNetfloraStats(null);
      setNetfloraStatus(`Loaded ${normalized.features.length} detections from ${file.name}.`);
    } catch (err) {
      setNetfloraStatus(err instanceof Error ? err.message : 'Failed to parse uploaded detections file.');
    } finally {
      e.target.value = '';
    }
  }, []);

  const exportNetfloraResults = useCallback(() => {
    if (!netfloraFilteredResults?.features?.length) {
      setNetfloraStatus('No filtered detection results to export.');
      return;
    }
    downloadTextFile(
      `netflora-detections-${Date.now()}.geojson`,
      JSON.stringify(netfloraFilteredResults, null, 2),
      'application/geo+json',
    );
    setNetfloraStatus('Exported filtered detections as GeoJSON.');
  }, [netfloraFilteredResults]);

  const getMetersPerPixel = (latitude: number, zoom: number, tileSize = 512) => {
    const latRad = (latitude * Math.PI) / 180;
    return (EARTH_CIRCUMFERENCE_METERS * Math.cos(latRad)) / (tileSize * Math.pow(2, zoom));
  };

  const getGeoJsonCentroid = (geojson: any): [number, number] => {
    const bounds = getGeoJsonBounds(geojson);
    if (!bounds) return [viewState.longitude, viewState.latitude];
    return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  };

  const normalizePivotId = (value: unknown, index: number) => {
    const raw = String(value ?? '').trim();
    const match = raw.match(/\d+/);
    const number = match ? Number(match[0]) : index + 1;
    return `P-${String(number).padStart(2, '0')}`;
  };

  const pickFirstPolygonAoiFeature = (geojson: any): { type: 'Feature'; geometry: any; properties: Record<string, unknown> } | null => {
    if (!geojson || typeof geojson !== 'object') return null;
    if (geojson.type === 'Feature') {
      const g = (geojson as any).geometry;
      if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') {
        return {
          type: 'Feature',
          geometry: g,
          properties: (geojson as any).properties || {},
        };
      }
      return null;
    }
    if (geojson.type === 'FeatureCollection' && Array.isArray((geojson as any).features)) {
      for (const ft of (geojson as any).features) {
        const g = ft?.geometry;
        if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') {
          return {
            type: 'Feature',
            geometry: g,
            properties: ft?.properties || {},
          };
        }
      }
      return null;
    }
    if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
      return { type: 'Feature', geometry: geojson, properties: {} };
    }
    return null;
  };

  const collectPolygonAoiFeatures = (geojson: any): Array<{ type: 'Feature'; geometry: any; properties: Record<string, unknown> }> => {
    if (!geojson || typeof geojson !== 'object') return [];
    const out: Array<{ type: 'Feature'; geometry: any; properties: Record<string, unknown> }> = [];
    const pushIfPolygon = (featureLike: any, fallbackProps?: Record<string, unknown>) => {
      const g = featureLike?.geometry ?? featureLike;
      if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') {
        out.push({
          type: 'Feature',
          geometry: g,
          properties: (featureLike?.properties as Record<string, unknown>) || fallbackProps || {},
        });
      }
    };
    if (geojson.type === 'Feature') {
      pushIfPolygon(geojson);
      return out;
    }
    if (geojson.type === 'FeatureCollection' && Array.isArray((geojson as any).features)) {
      for (const ft of (geojson as any).features) pushIfPolygon(ft);
      return out;
    }
    pushIfPolygon({ geometry: geojson, properties: {} });
    return out;
  };

  const nextMultiAoiColor = (_idx: number): string => SI_DEFAULT_VECTOR_OUTLINE_COLOR;

  const registerMultiAoiWorkspace = (
    geojson: any,
    layerName: string,
    source: 'drawn' | 'upload' | 'layer',
    opts?: { setActiveFirst?: boolean },
  ): number => {
    const polys = collectPolygonAoiFeatures(geojson);
    if (!polys.length) return 0;
    let createdFirst: string | null = null;
    setMultiAoiItems(prev => {
      const next = [...prev];
      for (let i = 0; i < polys.length; i += 1) {
        const ft = polys[i]!;
        const id = `aoi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`;
        if (!createdFirst) createdFirst = id;
        next.push({
          id,
          name: polys.length === 1 ? layerName : `${layerName} #${i + 1}`,
          feature: ft as GeoJSON.Feature,
          source,
          color: nextMultiAoiColor(next.length),
        });
      }
      return next;
    });
    if (createdFirst && opts?.setActiveFirst) {
      setActiveMultiAoiId(createdFirst);
      setMultiAoiPopupIds(prev => (prev.includes(createdFirst!) ? prev : [...prev, createdFirst!]));
    }
    return polys.length;
  };

  const applyUploadedAoiToAnalysis = (geojson: any, layerName: string) => {
    const feature = pickFirstPolygonAoiFeature(geojson);
    if (!feature) return false;
    if (hasActiveLayerSourceAoiRef.current) {
      setGeomUndoStack([]);
      setGeomRedoStack([]);
      updateDrawnStats(feature as any);
      setMapDrawTool('select');
      setMapDragPanEnabled(true);
      setFieldAnalysisStatus(
        `Preview zone loaded from "${layerName}". Layer Source mask unchanged â€” analysis is separate.`,
      );
      return true;
    }
    registerMultiAoiWorkspace(geojson, layerName, 'upload', { setActiveFirst: true });
    setGeomUndoStack([]);
    setGeomRedoStack([]);
    updateDrawnStats(feature as any);
    setExploreExtentMode('drawn');
    setMapDrawTool('select');
    setMapDragPanEnabled(true);
    setFieldAnalysisStatus(`AOI loaded from "${layerName}". Added to Multi-AOI Workspace for independent analysis.`);
    return true;
  };

  const focusGeoJsonOnMap = (geojson: any) => {
    const bounds = getGeoJsonBounds(geojson);
    if (!bounds) return;
    const [minX, minY, maxX, maxY] = bounds;
    const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (mapInstance && typeof mapInstance.fitBounds === 'function') {
      mapInstance.fitBounds(
        [
          [minX, minY],
          [maxX, maxY]
        ],
        { padding: 80, duration: 800 }
      );
    }
  };

  const importAoiDataSourceFile = async (file: File) => {
    let rasterPreviewUrl: string | null = null;
    setSiUploadPhase('reading');
    setSiUploadProgressPct(2);
    setAddLayerStatus('Reading fileâ€¦');
    try {
      // Plain images (PNG/JPG/â€¦) carry no CRS â€” give the parser the current map
      // bounds so the overlay drops onto whatever the user is looking at.
      let imagePlacementBounds: { west: number; south: number; east: number; north: number } | undefined;
      try {
        const mapForBounds = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
        const b = mapForBounds?.getBounds?.();
        if (b) {
          imagePlacementBounds = {
            west: b.getWest(),
            south: b.getSouth(),
            east: b.getEast(),
            north: b.getNorth(),
          };
        }
      } catch {
        /* no live map bounds â€” parser falls back to a default extent */
      }
      const parsed = await parseFile(file, {
        onProgress: pct => setSiUploadProgressPct(Math.round(2 + pct * 0.35)),
        imagePlacementBounds,
      });
      setSiUploadPhase('processing');
      setSiUploadProgressPct(40);
      setAddLayerStatus('Processingâ€¦');

      if (parsed.type === 'table') {
        throw new Error('This CSV has no latitude/longitude columns. Add lat/lon columns or use GeoJSON / KML / SHP (.zip).');
      }

      const id = `custom-${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const layerName = addLayerName.trim() || baseName || file.name;

      if (parsed.type === 'raster') {
        rasterPreviewUrl = parsed.previewObjectUrl;
        const rasterExt = (file.name.split('.').pop() || '').toLowerCase();
        const rasterFormat =
          rasterExt === 'tif' || rasterExt === 'tiff' ? 'GeoTIFF' : `Image (${rasterExt.toUpperCase()})`;
        const outline = siRasterExtentFootprint(parsed.coordinates);
        setCustomLayers(prev => [
          ...prev,
          {
            id,
            name: layerName,
            geojson: outline,
            visible: true,
            source: 'upload',
            renderMode: 'raster',
            raster: { url: parsed.previewObjectUrl, coordinates: parsed.coordinates },
            ephemeral: true,
            importMetadata: {
              format: rasterFormat,
              crs: parsed.crsHint,
              bytes: file.size,
            },
          },
        ]);
        setAddLayerStatus(`Completed: ${rasterFormat} "${layerName}" (${parsed.widthPx}Ã—${parsed.heightPx}px, ${parsed.bands} band(s)).`);
        setSiUploadProgressPct(100);
        setSiUploadPhase('completed');
        setAddLayerName('');
        setSiUploadStagedFile(null);
        setIsAddLayerModalOpen(false);
        focusGeoJsonOnMap(outline);
        setFieldAnalysisStatus(
          rasterFormat === 'GeoTIFF'
            ? `Raster "${layerName}" is on the map. Draw a polygon AOI if you need to clip analysis to an area.`
            : `Image overlay "${layerName}" was placed on the current map view (no georeferencing in ${rasterFormat}). Pan/zoom before importing to change where it lands.`,
        );
        return;
      }

      if (parsed.type === 'bim') {
        const bimBlobUrl = URL.createObjectURL(file);
        const footprint = siBimAnchorFootprint(viewState.longitude, viewState.latitude);
        setCustomLayers(prev => [
          ...prev,
          {
            id,
            name: layerName,
            geojson: footprint,
            visible: true,
            source: 'upload',
            ephemeral: true,
            bimBlobUrl,
            importMetadata: { format: 'IFC', bytes: parsed.byteLength },
          },
        ]);
        setAddLayerStatus(`Completed: IFC "${layerName}" anchored to the map (${Math.round(parsed.byteLength / 1024)} KB).`);
        setSiUploadProgressPct(100);
        setSiUploadPhase('completed');
        setAddLayerName('');
        setSiUploadStagedFile(null);
        setIsAddLayerModalOpen(false);
        focusGeoJsonOnMap(footprint);
        setFieldAnalysisStatus(
          `IFC "${layerName}" stored for this session. Download from layer metadata or open in your BIM tool for full 3D geometry.`,
        );
        return;
      }

      const geo = parsed.data;
      if (!geo || typeof geo !== 'object') {
        throw new Error('Parsed file did not contain valid geospatial data.');
      }
      const featureCount = Array.isArray(geo.features) ? geo.features.length : 0;
      if (!featureCount) {
        throw new Error('No drawable features found. Check CRS and geometry types in the source file.');
      }

      setCustomLayers(prev => [
        ...prev,
        {
          id,
          name: layerName,
          geojson: geo,
          visible: true,
          source: 'upload',
          ...siDefaultNewVectorLayerFields(),
          importMetadata: {
            format: parsed.crsHint ? `Vector (${parsed.crsHint})` : 'Vector',
            crs: parsed.crsHint,
            bytes: file.size,
          },
        },
      ]);
      setAddLayerStatus(`Completed: vector layer "${layerName}" (${featureCount} feature${featureCount === 1 ? '' : 's'}).`);
      setSiUploadProgressPct(100);
      setSiUploadPhase('completed');
      setAddLayerName('');
      setSiUploadStagedFile(null);
      setIsAddLayerModalOpen(false);

      const bounds = getGeoJsonBounds(geo);
      if (bounds) {
        const [minX, minY, maxX, maxY] = bounds;
        const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
        if (mapInstance && typeof mapInstance.fitBounds === 'function') {
          mapInstance.fitBounds(
            [
              [minX, minY],
              [maxX, maxY],
            ],
            { padding: 80, duration: 800 },
          );
        } else {
          const centerLng = (minX + maxX) / 2;
          const centerLat = (minY + maxY) / 2;
          setViewState(prev => ({
            ...prev,
            longitude: centerLng,
            latitude: centerLat,
            zoom: Math.max(prev.zoom, 13),
          }));
        }
      }

      if (applyUploadedAoiToAnalysis(geo, layerName)) {
        /* AOI polygon applied */
      } else {
        setFieldAnalysisStatus(
          `Layer "${layerName}" added (points/lines or no polygon). Use a polygon layer or draw an AOI to run AOI-clipped analysis.`,
        );
      }
    } catch (error) {
      console.error('Failed to add layer', error);
      if (rasterPreviewUrl) URL.revokeObjectURL(rasterPreviewUrl);
      setSiUploadPhase('failed');
      setSiUploadProgressPct(0);
      setAddLayerStatus(error instanceof Error ? error.message : 'Failed to import file layer.');
    }
  };

  const handleLayerFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSiUploadStagedFile(file);
    setSiUploadPhase('idle');
    setSiUploadProgressPct(0);
    const mb = file.size / (1024 * 1024);
    setAddLayerStatus(
      `Ready: ${file.name} (${mb >= 0.01 ? mb.toFixed(2) : '<0.01'} MB). Click â€œImport to mapâ€ to add.`,
    );
    event.target.value = '';
  };

  const openSiUploadFilePicker = () => {
    fileInputRef.current?.click();
  };

  const commitSiLayerUpload = () => {
    if (!siUploadStagedFile) {
      setAddLayerStatus('Choose a file (browse) or drop one on the upload area, then click Import to map.');
      return;
    }
    void importAoiDataSourceFile(siUploadStagedFile);
  };

  const toggle3DView = () => {
    // Smooth, in-place toggle â€” never rebuilds the style; layers / AOI / zoom stay.
    if (is3DViewRef.current) siExitTo2dView();
    else siEnterGlobe3dView();
  };

  /** Live DEM vertical exaggeration (relief "Height") for the 3D terrain mesh. */
  const applyTerrainExaggeration = useCallback((ex: number) => {
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map || typeof map.setTerrain !== 'function') return;
    try {
      if (map.getSource?.(ESRI_WORLD_TERRAIN_SOURCE_ID)) {
        map.setTerrain({ source: ESRI_WORLD_TERRAIN_SOURCE_ID, exaggeration: ex });
      }
    } catch {
      /* style/source mid-swap */
    }
  }, []);

  const handleTerrainExaggerationChange = useCallback(
    (ex: number) => {
      setTerrainExaggeration(ex);
      // Keep the shared terrain controller in sync so camera moves/syncs don't reset the relief.
      setAgroCloudTerrainExaggeration(ex);
      if (is3DViewRef.current) applyTerrainExaggeration(ex);
    },
    [applyTerrainExaggeration],
  );

  const viewStateLiveRef = useRef(viewState);

  const scheduleMapMetricsCommit = useCallback((vs: { latitude?: number; zoom?: number }) => {
    if (mapMetricsCommitTimerRef.current != null) {
      window.clearTimeout(mapMetricsCommitTimerRef.current);
    }
    mapMetricsCommitTimerRef.current = window.setTimeout(() => {
      mapMetricsCommitTimerRef.current = null;
      const next = readMapMetricsFromViewState(vs);
      setMapMetrics(prev => mergeMapMetrics(prev, next));
    }, SI_MAP_METRICS_COMMIT_MS);
  }, []);

  /** Keep globe projection without tilting the camera (default 2D top-down). */
  const siEnsureGlobeProjection = useCallback(() => {
    const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!mapInstance) return;
    if (typeof mapInstance.setProjection === 'function') {
      try {
        mapInstance.setProjection({ name: 'globe' });
      } catch {
        /* ignore */
      }
    }
  }, []);

  /** Explicit 3D globe tilt (globe button / WebGL recovery) â€” does not change pan/zoom/orbit handlers. */
  const siEnterGlobe3dView = useCallback(() => {
    siGlobeWebglFailoverRef.current = false;
    setIs3DView(true);
    // Auto-activate the Elevation/Topography basemap (DEM mesh + hillshade, or the
    // contour topo map when Contours is on) so the 3D view shows real terrain relief
    // instead of the flat 2D imagery. Remember the user's basemap so we can restore
    // it exactly when returning to 2D.
    const terrainBase = SATELLITE_3D_BASEMAP_ID;
    setBasemapId(prev => {
      const resolved = pickDefaultBasemapId(prev);
      if (
        resolved === SATELLITE_3D_BASEMAP_ID ||
        resolved === TOPOGRAPHIC_3D_BASEMAP_ID ||
        resolved === 'terrain-opentopo'
      ) {
        basemapBefore3dRef.current = null;
        return terrainBase;
      }
      basemapBefore3dRef.current = prev;
      return terrainBase;
    });
    const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    const vs = viewStateLiveRef.current;
    const livePitch =
      mapInstance && typeof mapInstance.getPitch === 'function' ? mapInstance.getPitch() : vs.pitch ?? 0;
    const liveBearing =
      mapInstance && typeof mapInstance.getBearing === 'function'
        ? mapInstance.getBearing()
        : vs.bearing ?? 0;
    const pitch = Math.max(typeof livePitch === 'number' ? livePitch : 0, 55);
    const bearing = typeof liveBearing === 'number' ? liveBearing : 0;

    siEnsureGlobeProjection();

    if (mapInstance && typeof mapInstance.easeTo === 'function') {
      try {
        mapInstance.easeTo({ pitch, bearing, duration: 800 });
      } catch {
        /* ignore */
      }
    }

    viewStateLiveRef.current = { ...vs, pitch, bearing };
    setViewState(prev => ({ ...prev, pitch, bearing }));
  }, [siEnsureGlobeProjection]);

  /**
   * Smooth return to flat 2D â€” eases pitch/bearing to 0 on the *same* map
   * instance (no setStyle / fitBounds / jumpTo), so layers, AOI, zoom and center
   * are all preserved. Terrain is left enabled during the tilt-down and only
   * disabled once the camera settles (on moveend) so the transition never pops.
   */
  const siExitTo2dView = useCallback(() => {
    setIs3DView(false);
    // Restore the basemap that was active before the auto Elevation/Topography
    // swap (only if we performed the swap, so a manual 3D-topo pick is respected).
    if (basemapBefore3dRef.current) {
      const restore = basemapBefore3dRef.current;
      basemapBefore3dRef.current = null;
      setBasemapId(restore);
    }
    const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    const vs = viewStateLiveRef.current;
    const commitFlat = () => {
      viewStateLiveRef.current = { ...viewStateLiveRef.current, pitch: 0, bearing: 0 };
      setViewState(prev => ({ ...prev, pitch: 0, bearing: 0 }));
    };
    if (mapInstance && typeof mapInstance.easeTo === 'function') {
      try {
        mapInstance.easeTo({ pitch: 0, bearing: 0, duration: 700 });
        if (typeof mapInstance.once === 'function') {
          mapInstance.once('moveend', commitFlat);
        } else {
          commitFlat();
        }
      } catch {
        viewStateLiveRef.current = { ...vs, pitch: 0, bearing: 0 };
        setViewState(prev => ({ ...prev, pitch: 0, bearing: 0 }));
      }
    } else {
      commitFlat();
    }
  }, []);

  const handleSelectWmsLayer = (layerName: string) => {
    setWmsLayer(current => (current === layerName ? '' : layerName));
    setIsLayerDropdownOpen(false);
  };

  const openAddLayerModal = (opts?: {
    tab?: AddLayerTab;
    wizard?: 'home' | 'gis-list' | 'source-forms' | 'tabs';
    statusHint?: string;
  }) => {
    setAddLayerStatus(opts?.statusHint ?? '');
    setSiGetDataStep('menu');
    setSiUploadStagedFile(null);
    setSiUploadPhase('idle');
    setSiUploadProgressPct(0);
    setSiUploadDropActive(false);
    setSiAddLayerWizard(opts?.wizard ?? 'home');
    setAddLayerTab(opts?.tab ?? 'giscontent');
    setDiscoveredArcgisLayers([]);
    setSelectedDiscoveredArcgisUrl('');
    setAddLayerRemoteUrl('');
    setIsAddLayerModalOpen(true);
  };

  const openAoiDataSourceUploader = () => {
    openAddLayerModal();
    setSiAddLayerWizard('source-forms');
    setAddLayerTab('upload');
  };

  const handleCropAiProviderRedirect = useCallback(
    (id: CropDataProviderId) => {
      const redirect = getCropProviderRedirect(id);
      if (!redirect) return;
      if (redirect.kind === 'section') {
        setExpandedEnvSection(redirect.target as 'remote-sensing');
        setIsLayerDropdownOpen(true);
        if (id === 'drone-imagery') openAoiDataSourceUploader();
        return;
      }
      navigate(redirect.target);
    },
    [navigate],
  );

  const handleCropAiDataProviderChange = useCallback(
    (id: CropDataProviderId) => {
      setCropAiDataProvider(id);
      if (!isCropPanelProvider(id)) handleCropAiProviderRedirect(id);
    },
    [handleCropAiProviderRedirect],
  );

  const closeAddLayerModal = () => {
    setIsAddLayerModalOpen(false);
    setSiAddLayerWizard('home');
    setAddLayerStatus('');
    setSiGetDataStep('menu');
    setSiUploadStagedFile(null);
    setSiUploadPhase('idle');
    setSiUploadProgressPct(0);
    setSiUploadDropActive(false);
    setDiscoveredArcgisLayers([]);
    setSelectedDiscoveredArcgisUrl('');
  };

  const goSiAddLayerWizardHome = () => {
    setSiAddLayerWizard('home');
    setAddLayerTab('giscontent');
    setAddLayerStatus('');
    setSiUploadStagedFile(null);
    setSiUploadPhase('idle');
    setSiUploadProgressPct(0);
    setSiUploadDropActive(false);
    setAddingPortalRowId(null);
  };

  const gisContentPortalPickRows = useMemo(
    () => listGisContentPortalSavedLayers(gisContentPortal.rows),
    [gisContentPortal.rows, gisContentPortal.version],
  );

  const deriveArcgisLayerName = (serviceUrl: string, fallback = 'ArcGIS Layer') => {
    const clean = serviceUrl.replace(/\/+$/, '');
    const parts = clean.split('/');
    const last = parts[parts.length - 1] || '';
    const prev = parts[parts.length - 2] || '';
    if (/^\d+$/.test(last) && prev) return `${prev} ${last}`;
    return last || fallback;
  };

  const appendTokenIfAny = (url: string, token: string) => {
    if (!token.trim()) return url;
    const u = new URL(url);
    u.searchParams.set('token', token.trim());
    return u.toString();
  };

  const importArcgisFeatureLayer = async () => {
    const raw = addLayerUrl.trim();
    if (!raw) {
      setAddLayerStatus('Enter ArcGIS Feature Service URL.');
      return;
    }
    let baseUrl = raw;
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
    setIsConnectingLayer(true);
    setAddLayerStatus('Connecting to ArcGIS service...');
    try {
      const clean = baseUrl.replace(/[?#].*$/, '').replace(/\/+$/, '');

      // Direct single-layer/table URL (â€¦/MapServer/124 or â€¦/FeatureServer/3): load THAT
      // layer's own definition instead of enumerating the service root. Many secured/grouped
      // roots don't list their layers, so stripping to the root would wrongly report
      // "No layers/tables found" even when the specific layer is valid open data.
      const directMatch = clean.match(/\/(?:MapServer|FeatureServer)\/(\d+)$/i);
      if (directMatch) {
        const defUrl = appendTokenIfAny(`${clean}?f=pjson`, addLayerToken);
        const defRes = await fetch(defUrl);
        if (!defRes.ok) throw new Error(`discover failed (${defRes.status})`);
        const def = await defRes.json();
        if (def?.error?.message) throw new Error(def.error.message);
        const id = typeof def?.id === 'number' ? def.id : Number(directMatch[1]);
        const name = typeof def?.name === 'string' && def.name.trim() ? (def.name as string) : `Layer ${id}`;
        const isTable = typeof def?.type === 'string' && /table/i.test(def.type);
        const single = [
          {
            id,
            name,
            kind: (isTable ? 'table' : 'layer') as 'layer' | 'table',
            url: clean,
            geometryType: typeof def?.geometryType === 'string' ? (def.geometryType as string) : undefined,
          },
        ];
        setDiscoveredArcgisLayers(single);
        setSelectedDiscoveredArcgisUrl(single[0].url);
        if (!addLayerName.trim()) setAddLayerName(single[0].name);
        setAddLayerStatus('Found 1 layer/table. Select one and click Add.');
        return;
      }

      // Service root URL â†’ enumerate. Accept both MapServer and FeatureServer roots;
      // otherwise assume a service folder and try its FeatureServer endpoint.
      const serviceBase = /\/(?:MapServer|FeatureServer)$/i.test(clean) ? clean : `${clean}/FeatureServer`;

      const discoverUrl = appendTokenIfAny(`${serviceBase}?f=pjson`, addLayerToken);
      const discoverRes = await fetch(discoverUrl);
      if (!discoverRes.ok) throw new Error(`discover failed (${discoverRes.status})`);
      const discover = await discoverRes.json();
      if (discover?.error?.message) throw new Error(discover.error.message);
      const discovered = [
        ...(Array.isArray(discover?.layers) ? discover.layers.map((l: any) => ({ ...l, kind: 'layer' as const })) : []),
        ...(Array.isArray(discover?.tables) ? discover.tables.map((t: any) => ({ ...t, kind: 'table' as const })) : []),
      ]
        .filter((l: any) => typeof l?.id === 'number' && typeof l?.name === 'string')
        .map((l: any) => ({
          id: l.id as number,
          name: l.name as string,
          kind: l.kind as 'layer' | 'table',
          url: `${serviceBase}/${l.id}`,
          geometryType: typeof l?.geometryType === 'string' ? (l.geometryType as string) : undefined,
        }));

      if (!discovered.length) {
        throw new Error(
          'No layers/tables found in this service URL. For a single layer, paste its full URL ending in the layer id (e.g. â€¦/MapServer/124).',
        );
      }

      setDiscoveredArcgisLayers(discovered);
      setSelectedDiscoveredArcgisUrl(discovered[0].url);
      if (!addLayerName.trim()) {
        setAddLayerName(discovered[0].name);
      }
      setAddLayerStatus(`Found ${discovered.length} layer/table(s). Select one and click Add.`);
    } catch (error) {
      setAddLayerStatus(error instanceof Error ? error.message : 'Failed to connect ArcGIS layer.');
    } finally {
      setIsConnectingLayer(false);
    }
  };

  const addSelectedDiscoveredArcgisLayer = async () => {
    if (!selectedDiscoveredArcgisUrl) {
      setAddLayerStatus('Select a discovered layer first.');
      return;
    }
    setIsAddingDiscoveredArcgisLayer(true);
    setAddLayerStatus('Downloading layer geometryâ€¦');
    try {
      const tokenTrim = addLayerToken.trim() || undefined;
      const data = await fetchHostedFeatureLayerGeoJsonFromServiceUrl(selectedDiscoveredArcgisUrl, tokenTrim, {
        onProgress: progress => {
          if (progress.phase === 'page') {
            setAddLayerStatus(`Downloading geometryâ€¦ ${progress.featureCount} features (page ${progress.page})`);
          }
        },
      });
      const [drawingInfoRaw, pjson] = await Promise.all([
        fetchArcgisLayerDrawingInfo(selectedDiscoveredArcgisUrl, tokenTrim),
        fetchArcgisLayerPjson(selectedDiscoveredArcgisUrl, tokenTrim),
      ]);
      const arcgisDrawingInfo = drawingInfoRaw ? sanitizeArcgisDrawingInfoForClient(drawingInfoRaw) : null;
      const arcgisLayerDefinition = slimArcgisLayerDefinitionForStorage(pjson) ?? null;
      const selectedLayer = discoveredArcgisLayers.find(l => l.url === selectedDiscoveredArcgisUrl);
      const layerTitle = addLayerName.trim() || selectedLayer?.name || deriveArcgisLayerName(selectedDiscoveredArcgisUrl);
      const hostedRow = persistArcGisHostedFeatureLayerToGisContentPortal({
        title: layerTitle,
        geojson: data,
        serviceUrl: selectedDiscoveredArcgisUrl,
        registerOnMap: true,
      });
      const portalLayerUrl = gisContentPortalLayerUrl(hostedRow.id);
      const id = `arcgis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setCustomLayers(prev => [
        ...prev,
        {
          id,
          name: hostedRow.title,
          geojson: data,
          visible: true,
          source: 'arcgis',
          sourceUrl: portalLayerUrl,
          authToken: tokenTrim,
          ...siDefaultNewVectorLayerFields(),
          arcgisDrawingInfo,
          useArcGisSymbology: false,
          arcgisLayerDefinition,
        },
      ]);
      const bounds = getGeoJsonBounds(data);
      if (bounds) {
        const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
        mapInstance?.fitBounds?.(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: 80, duration: 800 },
        );
      }
      setAddLayerStatus(`Added ArcGIS layer: ${hostedRow.title} (saved to GIS Content)`);
      setIsAddLayerModalOpen(false);
      setAddLayerUrl('');
      setAddLayerToken('');
      setAddLayerName('');
      setDiscoveredArcgisLayers([]);
      setSelectedDiscoveredArcgisUrl('');
    } catch (error) {
      setAddLayerStatus(error instanceof Error ? error.message : 'Failed to add selected ArcGIS layer.');
    } finally {
      setIsAddingDiscoveredArcgisLayer(false);
    }
  };

  const addGisPortalRowToMap = useCallback(
    (row: GisContentRow) => {
      if (isGisContentRowInRecycle(row)) {
        setPortalBrowseStatus('This item is in the Recycle bin â€” restore it from GIS Content first.');
        setStacStatus('Cannot add a recycled GIS Content item to the map.');
        return;
      }
      setAddingPortalRowId(row.id);
      void (async () => {
        try {
          const payload = await buildGisContentMapLayerPayloadAsync(row);
          const agroStructures = isAgroStructuresPortalRow(row);
          if (agroStructures) {
            setCustomLayers(prev => {
              const primaryIdx = prev.findIndex(l => String(l.id) === AGRO_STRUCTURES_PRIMARY_LAYER_ID);
              if (primaryIdx < 0) return prev;
              return prev.map((l, i) =>
                i === primaryIdx ? { ...l, visible: true, name: row.title || l.name } : l,
              );
            });
            syncLiveViewportRef.current(true);
            const msg = `Synced "${row.title}" from live Agro_Structures service.`;
            setPortalBrowseStatus(msg);
            setStacStatus(msg);
            focusGeoJsonOnMap(payload.geojson);
            return;
          }
          setCustomLayers(prev => {
            const existingIdx = prev.findIndex(
              l => parseGisContentPortalLayerUrl(String(l.sourceUrl || '')) === row.id,
            );
            if (existingIdx >= 0) {
              return prev.map((l, i) =>
                i === existingIdx
                  ? {
                      ...l,
                      ...siDefaultPortalVectorLayerFields(),
                      symbology: undefined,
                      visible: true,
                      name: payload.name,
                      geojson: payload.geojson,
                    }
                  : l,
              );
            }
            return [
              ...prev,
              {
                id: payload.id,
                name: payload.name,
                geojson: payload.geojson,
                visible: true,
                source: 'api',
                sourceUrl: payload.sourceUrl,
                ...siDefaultPortalVectorLayerFields(),
              },
            ];
          });
          focusGeoJsonOnMap(payload.geojson);
          const msg = `Added "${row.title}" from GIS Content.`;
          setPortalBrowseStatus(msg);
          setStacStatus(msg);
        } catch (err) {
          const message = err instanceof Error ? err.message : `Failed to add "${row.title}".`;
          setPortalBrowseStatus(message);
          setStacStatus(message);
        } finally {
          setAddingPortalRowId(null);
        }
      })();
    },
    [focusGeoJsonOnMap],
  );

  const addGisPortalRowFromAddLayerModal = useCallback(
    (row: GisContentRow) => {
      addGisPortalRowToMap(row);
      setAddLayerStatus(`Added "${row.title}" from GIS Content.`);
      setIsAddLayerModalOpen(false);
      setSiAddLayerWizard('home');
    },
    [addGisPortalRowToMap],
  );

  const importRemoteUrlLayer = async () => {
    const raw = addLayerRemoteUrl.trim();
    if (!raw) {
      setAddLayerStatus('Enter a remote URL (GeoJSON/ZIP/KML or Raster/Image service endpoint).');
      return;
    }
    setIsImportingRemoteLayer(true);
    setAddLayerStatus('Downloading and parsing remote layer...');
    try {
      const file = await parseRemoteUrlAsFile(raw);
      const parsed = await parseFile(file);
      if (parsed.type === 'table') {
        throw new Error('Remote file is a table CSV without latitude/longitude columns.');
      }
      if (parsed.type === 'bim') {
        throw new Error('IFC must be uploaded from disk â€” remote IFC import is not enabled here.');
      }
      const id = `remote-${Date.now()}`;
      const baseName = addLayerName.trim() || parsed.filename || 'Remote Layer';

      if (parsed.type === 'raster') {
        const outline = siRasterExtentFootprint(parsed.coordinates);
        setCustomLayers(prev => [
          ...prev,
          {
            id,
            name: baseName,
            geojson: outline,
            visible: true,
            source: 'api',
            sourceUrl: raw,
            renderMode: 'raster',
            raster: { url: parsed.previewObjectUrl, coordinates: parsed.coordinates },
            ephemeral: true,
            importMetadata: {
              format: 'GeoTIFF',
              crs: parsed.crsHint,
            },
          },
        ]);
        setAddLayerStatus(`Imported remote GeoTIFF: ${parsed.filename}`);
        setAddLayerName('');
        setAddLayerRemoteUrl('');
        setIsAddLayerModalOpen(false);
        focusGeoJsonOnMap(outline);
        return;
      }

      setCustomLayers(prev => [
        ...prev,
        {
          id,
          name: baseName,
          geojson: parsed.data,
          visible: true,
          source: 'api',
          sourceUrl: raw,
          ...siDefaultNewVectorLayerFields(),
        },
      ]);
      setAddLayerStatus(`Imported remote layer: ${parsed.filename}`);
      setAddLayerName('');
      setAddLayerRemoteUrl('');
      setIsAddLayerModalOpen(false);
      focusGeoJsonOnMap(parsed.data);
    } catch (e) {
      setAddLayerStatus(e instanceof Error ? e.message : 'Failed to import remote URL layer.');
    } finally {
      setIsImportingRemoteLayer(false);
    }
  };

  useEffect(() => {
    const prev = prevAddLayerTabForGetDataRef.current;
    prevAddLayerTabForGetDataRef.current = addLayerTab;
    if (addLayerTab === 'database' && prev !== null && prev !== 'database') {
      setSiGetDataStep('menu');
    }
  }, [addLayerTab]);

  const applySiGetDataPick = (item: SiGetDataSourceEntry) => {
    const a = item.action;
    if (a.kind === 'toast') {
      setAddLayerStatus(a.message);
      return;
    }
    if (a.kind === 'gis-map') {
      setAddLayerStatus('');
      setSiAddLayerWizard('gis-list');
      setAddLayerTab('giscontent');
      return;
    }
    if (a.kind === 'sql') {
      setAddLayerStatus('');
      setDbPlatform(a.platform);
      setSiGetDataStep('sql');
      return;
    }
    if (a.kind === 'tab') {
      setAddLayerTab(a.tab);
      if (a.presetRemoteUrl !== undefined) setAddLayerRemoteUrl(a.presetRemoteUrl);
      else if (a.tab === 'upload' || a.tab === 'arcgis' || a.tab === 'raster') setAddLayerRemoteUrl('');
      setAddLayerStatus(a.statusHint ?? '');
    }
  };

  const handleDatabaseConnection = () => {
    if (!dbInstance.trim()) {
      setAddLayerStatus('Enter database instance/host first.');
      return;
    }
    if (dbAuthType === 'database' && !dbUsername.trim()) {
      setAddLayerStatus('Enter database username for database authentication.');
      return;
    }
    setAddLayerStatus(
      `Database connection profile saved: ${dbPlatform} @ ${dbInstance}${dbName ? ` / ${dbName}` : ''}.`,
    );
  };

  const toggleCustomLayerVisibility = (id: string, visible: boolean) => {
    setCustomLayers(prev => {
      const next = prev.map(layer => (layer.id === id ? { ...layer, visible } : layer));
      if (visible) {
        const layer = next.find(l => l.id === id);
        if (layer?.geojson) {
          queueMicrotask(() => focusGeoJsonOnMap(layer.geojson));
        }
      }
      return next;
    });
  };

  /** Mount Agro_Structures FS/21 layer shell â€” viewport lazy-loads features on pan/zoom. */
  useEffect(() => {
    if (agroStructuresPrimaryAoiLoadRef.current) return;
    agroStructuresPrimaryAoiLoadRef.current = true;
    let cancelled = false;
    const mount = async () => {
      const token = getArcgisPortalToken();
      const emptyGeoJson = { type: 'FeatureCollection' as const, features: [] as unknown[] };
      // 1) Mount the layer shell immediately so it ALWAYS appears in the Layers
      //    panel and can render viewport features â€” independent of the optional
      //    ArcGIS metadata fetch below (which may fail on token/CORS issues).
      if (cancelled) return;
      setCustomLayers(prev => {
        if (prev.some(l => isAgroStructuresLayer(l))) return prev;
        return [
          ...prev,
          {
            id: AGRO_STRUCTURES_PRIMARY_LAYER_ID,
            name: 'Agro_Structures',
            geojson: emptyGeoJson,
            visible: true,
            source: 'arcgis' as const,
            sourceUrl: AGRO_STRUCTURES_FS21_URL,
            authToken: token || undefined,
            arcgisLayerDefinition: null,
            ...siDefaultPortalVectorLayerFields(),
            useArcGisSymbology: false,
          },
        ];
      });
      setStacStatus('Agro_Structures ready â€” loading visible fields for current map extentâ€¦');
      // 2) Best-effort: enrich the shell with the ArcGIS layer definition
      //    (fields / symbology). Failure here must NOT remove the layer.
      try {
        const pjson = await fetchArcgisLayerPjson(AGRO_STRUCTURES_FS21_URL, token || undefined);
        const arcgisLayerDefinition = slimArcgisLayerDefinitionForStorage(pjson) ?? null;
        if (cancelled || !arcgisLayerDefinition) return;
        setCustomLayers(prev => {
          const existingIdx = prev.findIndex(l => isAgroStructuresLayer(l));
          if (existingIdx < 0) return prev;
          const existing = prev[existingIdx]!;
          const needsHydrate = layerNeedsAoiMaskFieldHydration(existing);
          if (!needsHydrate && existing.arcgisLayerDefinition?.fields?.length) return prev;
          const next = [...prev];
          next[existingIdx] = {
            ...existing,
            arcgisLayerDefinition: arcgisLayerDefinition ?? existing.arcgisLayerDefinition ?? null,
            source: 'arcgis' as const,
            sourceUrl: AGRO_STRUCTURES_FS21_URL,
          };
          return next;
        });
      } catch (err) {
        // Metadata is optional â€” the shell + viewport features still work without it.
        console.warn('[agro-structures] layer definition fetch failed; shell mounted without metadata.', err);
      }
    };
    void mount();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshArcgisLayer = async (layer: CustomLayer) => {
    if (layer.source !== 'arcgis' || !layer.sourceUrl) {
      setStacStatus(`Sync is only available for ArcGIS layers. "${layer.name}" is not ArcGIS.`);
      return;
    }
    setSyncingLayerId(layer.id);
    setStacStatus(`Syncing "${layer.name}"...`);
    try {
      if (isAgroStructuresLayer(layer)) {
        agroStructuresViewportCacheRef.current.clear();
        setAgroStructuresViewportGeoJson({ type: 'FeatureCollection', features: [] });
        setCustomLayers(prev =>
          prev.map(item =>
            item.id === layer.id ? { ...item, geojson: { type: 'FeatureCollection', features: [] } } : item,
          ),
        );
        const [drawingInfoRaw, pjson] = await Promise.all([
          fetchArcgisLayerDrawingInfo(layer.sourceUrl, layer.authToken),
          fetchArcgisLayerPjson(layer.sourceUrl, layer.authToken),
        ]);
        const arcgisDrawingInfo = drawingInfoRaw ? sanitizeArcgisDrawingInfoForClient(drawingInfoRaw) : null;
        const arcgisLayerDefinition = slimArcgisLayerDefinitionForStorage(pjson) ?? layer.arcgisLayerDefinition ?? null;
        setCustomLayers(prev =>
          prev.map(item =>
            item.id === layer.id
              ? {
                  ...item,
                  arcgisDrawingInfo: arcgisDrawingInfo ?? item.arcgisDrawingInfo ?? null,
                  arcgisLayerDefinition,
                }
              : item,
          ),
        );
        setStacStatus('Agro_Structures cache cleared â€” reloading visible extentâ€¦');
        syncLiveViewport(true);
        return;
      }
      const data = await fetchHostedFeatureLayerGeoJsonFromServiceUrl(layer.sourceUrl, layer.authToken || undefined);
      if (!data.features?.length) {
        throw new Error('Service did not return GeoJSON features.');
      }
      const [drawingInfoRaw, pjson] = await Promise.all([
        fetchArcgisLayerDrawingInfo(layer.sourceUrl, layer.authToken),
        fetchArcgisLayerPjson(layer.sourceUrl, layer.authToken),
      ]);
      const arcgisDrawingInfo = drawingInfoRaw ? sanitizeArcgisDrawingInfoForClient(drawingInfoRaw) : null;
      const arcgisLayerDefinition = slimArcgisLayerDefinitionForStorage(pjson) ?? layer.arcgisLayerDefinition ?? null;
      setCustomLayers(prev =>
        prev.map(item =>
          item.id === layer.id
            ? {
                ...item,
                geojson: data,
                arcgisDrawingInfo: arcgisDrawingInfo ?? item.arcgisDrawingInfo ?? null,
                arcgisLayerDefinition,
              }
            : item,
        ),
      );
      setStacStatus(`Layer synced: "${layer.name}".`);
    } catch (error) {
      setStacStatus(error instanceof Error ? error.message : `Failed to sync "${layer.name}".`);
    } finally {
      setSyncingLayerId(null);
    }
  };

  /** Capture viewport bbox in a ref only â€” no React state during pan/zoom (prevents repaint storms). */
  const captureLiveViewportExtent = useCallback((): LngLatBBox | null => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    let displayBbox = readMapLngLatBBox(map);
    if (!displayBbox) {
      displayBbox = approximateLngLatBBoxFromViewState(viewStateLiveRef.current);
    }
    if (!displayBbox) return null;
    liveViewportDisplayBBoxRef.current = displayBbox;
    return displayBbox;
  }, []);

  const syncAgroStructuresViewportGeoJson = useCallback((displayBbox: LngLatBBox) => {
    const cache = agroStructuresViewportCacheRef.current;
    const clipBbox = expandLngLatBBox(displayBbox, SI_VIEWPORT_PREFETCH_RATIO);
    setAgroStructuresViewportGeoJson(cache.featureCollectionInBBox(clipBbox));
  }, []);

  const commitLiveViewportExtent = useCallback(
    (displayBbox: LngLatBBox) => {
      if (freezeViewportPipeline) return;
      setLiveViewportDisplayBBox(displayBbox);
      syncAgroStructuresViewportGeoJson(displayBbox);
    },
    [freezeViewportPipeline, syncAgroStructuresViewportGeoJson],
  );

  const applyLiveViewportExtent = useCallback(() => {
    const displayBbox = captureLiveViewportExtent();
    if (!displayBbox) return;
    if (freezeViewportPipeline) return;
    commitLiveViewportExtent(displayBbox);
  }, [captureLiveViewportExtent, commitLiveViewportExtent, freezeViewportPipeline]);

  const fetchAgroStructuresForViewport = useCallback(async () => {
    if (freezeViewportPipeline) return;
    const displayBbox = captureLiveViewportExtent();
    if (!displayBbox) return;

    const prefetchBbox = expandLngLatBBox(displayBbox);
    const cache = agroStructuresViewportCacheRef.current;
    if (cache.isPrefetchCovered(prefetchBbox)) {
      syncAgroStructuresViewportGeoJson(displayBbox);
      return;
    }

    liveViewportFetchAbortRef.current?.abort();
    const ac = new AbortController();
    liveViewportFetchAbortRef.current = ac;

    try {
      const token = getArcgisPortalToken();
      let data;
      try {
        data = await fetchAgroStructuresGeoJsonInBbox(prefetchBbox, token, ac.signal);
      } catch (err) {
        if (ac.signal.aborted) return;
        if (token?.trim()) {
          data = await fetchAgroStructuresGeoJsonInBbox(prefetchBbox, undefined, ac.signal);
        } else {
          throw err;
        }
      }
      if (ac.signal.aborted) return;

      cache.merge(data.features);
      cache.markTileFetched(prefetchBbox);
      syncAgroStructuresViewportGeoJson(displayBbox);
      const updatedViewport = cache.featureCollectionInBBox(expandLngLatBBox(displayBbox, SI_VIEWPORT_PREFETCH_RATIO));
      const allCached = cache.allFeatureCollection();
      setStacStatus(
        `Agro_Structures Â· ${updatedViewport.features.length} visible (${allCached.features.length} cached) Â· Farm Plots & PIVOT`,
      );
    } catch (err) {
      if (!ac.signal.aborted && err instanceof Error && err.name !== 'AbortError') {
        setStacStatus(err.message);
      }
    }
  }, [captureLiveViewportExtent, freezeViewportPipeline, syncAgroStructuresViewportGeoJson]);

  const scheduleAgroStructuresViewportFetch = useCallback(() => {
    if (freezeViewportPipeline) return;
    if (liveViewportDebounceTimerRef.current != null) {
      window.clearTimeout(liveViewportDebounceTimerRef.current);
    }
    liveViewportDebounceTimerRef.current = window.setTimeout(() => {
      void fetchAgroStructuresForViewport();
    }, SI_VIEWPORT_DEBOUNCE_MS);
  }, [fetchAgroStructuresForViewport, freezeViewportPipeline]);

  const scheduleLiveViewportExtentCommit = useCallback(() => {
    if (freezeViewportPipeline) return;
    if (liveViewportBboxCommitTimerRef.current != null) {
      window.clearTimeout(liveViewportBboxCommitTimerRef.current);
    }
    liveViewportBboxCommitTimerRef.current = window.setTimeout(() => {
      liveViewportBboxCommitTimerRef.current = null;
      const displayBbox = liveViewportDisplayBBoxRef.current;
      if (!displayBbox) return;
      commitLiveViewportExtent(displayBbox);
      scheduleAgroStructuresViewportFetch();
    }, SI_VIEWPORT_DEBOUNCE_MS);
  }, [commitLiveViewportExtent, freezeViewportPipeline, scheduleAgroStructuresViewportFetch]);

  const applyLiveViewportExtentThrottled = useCallback(() => {
    captureLiveViewportExtent();
    if (freezeViewportPipeline) return;
    if (liveViewportMoveThrottleRef.current != null) {
      return;
    }
    liveViewportMoveThrottleRef.current = window.setTimeout(() => {
      liveViewportMoveThrottleRef.current = null;
    }, SI_VIEWPORT_MOVE_THROTTLE_MS);
    scheduleAgroStructuresViewportFetch();
  }, [captureLiveViewportExtent, freezeViewportPipeline, scheduleAgroStructuresViewportFetch]);

  const syncLiveViewport = useCallback(
    (immediate = false) => {
      if (freezeViewportPipeline) return;
      const displayBbox = captureLiveViewportExtent();
      if (!displayBbox) return;
      commitLiveViewportExtent(displayBbox);

      if (immediate) {
        void fetchAgroStructuresForViewport();
        return;
      }
      scheduleAgroStructuresViewportFetch();
    },
    [
      captureLiveViewportExtent,
      commitLiveViewportExtent,
      fetchAgroStructuresForViewport,
      freezeViewportPipeline,
      scheduleAgroStructuresViewportFetch,
    ],
  );
  syncLiveViewportRef.current = syncLiveViewport;

  useEffect(() => {
    if (!isMapLoaded || freezeViewportPipeline) return;
    syncLiveViewport(true);
    return () => {
      liveViewportFetchAbortRef.current?.abort();
      if (liveViewportDebounceTimerRef.current != null) {
        window.clearTimeout(liveViewportDebounceTimerRef.current);
      }
      if (liveViewportMoveThrottleRef.current != null) {
        window.clearTimeout(liveViewportMoveThrottleRef.current);
      }
      if (mapMetricsCommitTimerRef.current != null) {
        window.clearTimeout(mapMetricsCommitTimerRef.current);
      }
      if (liveViewportBboxCommitTimerRef.current != null) {
        window.clearTimeout(liveViewportBboxCommitTimerRef.current);
      }
    };
  }, [isMapLoaded, syncLiveViewport, freezeViewportPipeline]);

  const activeDialogLayer = useMemo(() => {
    const base = activeLayerActionDialog
      ? customLayers.find(layer => layer.id === activeLayerActionDialog.layerId) ?? null
      : null;
    if (!base) return null;
    // Viewport-lazy ArcGIS layers (e.g. Agro_Structures) keep an empty/sparse
    // local geojson, so the attribute table would read no rows. When we've
    // fetched the full feature set from the service for this layer, merge it in
    // so columns, rows, search, and selection all work against real data.
    if (siTableServiceGeojson && siTableServiceGeojson.layerId === base.id) {
      const localCount = Array.isArray(base.geojson?.features) ? base.geojson.features.length : 0;
      const fetchedCount = Array.isArray(siTableServiceGeojson.geojson?.features)
        ? siTableServiceGeojson.geojson.features.length
        : 0;
      if (fetchedCount > localCount) {
        return { ...base, geojson: siTableServiceGeojson.geojson };
      }
    }
    return base;
  }, [activeLayerActionDialog, customLayers, siTableServiceGeojson]);

  const activeLayerColumns = useMemo(() => {
    if (!activeDialogLayer) return [] as string[];
    const features = Array.isArray(activeDialogLayer.geojson?.features) ? activeDialogLayer.geojson.features : [];
    const names = new Set<string>();
    features.slice(0, 50).forEach((feature: any) => {
      Object.keys(feature?.properties || {}).forEach(key => names.add(key));
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [activeDialogLayer]);

  const orderedSiTableFields = useMemo(() => {
    if (!activeDialogLayer) return [] as string[];
    const order = siTableFieldOrderByLayerId[activeDialogLayer.id] ?? [];
    return [...order.filter(f => activeLayerColumns.includes(f)), ...activeLayerColumns.filter(f => !order.includes(f))];
  }, [activeDialogLayer, activeLayerColumns, siTableFieldOrderByLayerId]);

  const activeTableFeatures = useMemo(() => {
    if (!activeDialogLayer) return [] as any[];
    const features = Array.isArray(activeDialogLayer.geojson?.features) ? activeDialogLayer.geojson.features : [];
    return features.slice(0, SI_TABLE_MAX_FEATURES);
  }, [activeDialogLayer]);

  const siLayerActionTableSelectionLinks = useMemo((): GeoExplorerMapLink[] => {
    if (!activeDialogLayer || activeLayerActionDialog?.mode !== 'table') return [];
    const cache = siTableFeatureKeyCacheRef.current;
    const layerId = String(activeDialogLayer.id);
    return activeTableFeatures.flatMap((ft, idx) => {
      const rowKey = siComputeFeatureRowKey(ft, idx, cache);
      if (!tableSelectedKeys.has(rowKey)) return [];
      return [{ type: 'feature' as const, layerId, featureKey: computeStableGisFeatureKey(ft, idx) }];
    });
  }, [activeDialogLayer, activeLayerActionDialog?.mode, activeTableFeatures, tableSelectedKeys]);

  const geoAiHighlightLayers = useMemo(() => {
    if (!activeDialogLayer || activeLayerActionDialog?.mode !== 'table') return customLayers;
    return customLayers.map(l =>
      String(l.id) === String(activeDialogLayer.id) ? activeDialogLayer : l,
    );
  }, [customLayers, activeDialogLayer, activeLayerActionDialog?.mode]);

  const mapSelectionHighlightGeojson = useMemo(() => {
    const fc = buildGeoAiLinkedHighlightCollection(geoAiMapHighlightSelectionLinks, geoAiHighlightLayers);
    const pts = buildGeoAiCoordsHighlightPoints(
      geoAiMapHighlightSelectionLinks.filter((l): l is Extract<GeoExplorerMapLink, { type: 'coords' }> => l.type === 'coords'),
    );
    return { type: 'FeatureCollection' as const, features: [...fc.features, ...pts.features] };
  }, [geoAiMapHighlightSelectionLinks, geoAiHighlightLayers]);

  useEffect(() => {
    if (!activeLayerActionDialog || activeLayerActionDialog.mode !== 'table') {
      onGeoAiTableSelectionSync(SI_LAYER_ACTION_TABLE_ID, []);
      return;
    }
    onGeoAiTableSelectionSync(SI_LAYER_ACTION_TABLE_ID, siLayerActionTableSelectionLinks);
    if (siLayerActionTableSelectionLinks.length === 1) {
      const link = siLayerActionTableSelectionLinks[0];
      setGeoAiTableMapFocusKey(link?.type === 'feature' ? stableFeatureLinkKey(link) : null);
    } else if (siLayerActionTableSelectionLinks.length === 0) {
      setGeoAiTableMapFocusKey(null);
    }
  }, [activeLayerActionDialog, onGeoAiTableSelectionSync, siLayerActionTableSelectionLinks]);

  const arcDefSiTable = useMemo(
    () => (activeDialogLayer?.source === 'arcgis' ? activeDialogLayer.arcgisLayerDefinition ?? null : null),
    [activeDialogLayer?.arcgisLayerDefinition, activeDialogLayer?.source],
  );

  const arcFieldsByLowerSi = useMemo(() => buildArcFieldsByLower(arcDefSiTable), [arcDefSiTable]);

  const visibleSiTableFields = useMemo(() => {
    if (!activeDialogLayer) return [] as string[];
    const hidden = hiddenSiTableFieldsByLayerId[activeDialogLayer.id] ?? new Set<string>();
    return orderedSiTableFields.filter(f => !hidden.has(f));
  }, [activeDialogLayer, orderedSiTableFields, hiddenSiTableFieldsByLayerId]);

  const siFilteredTableFeatures = useMemo(() => {
    if (!activeDialogLayer) return [] as any[];
    const cache = siTableFeatureKeyCacheRef.current;
    const domainMode = 'description' as const;

    const getAdv = (ft: any, fieldName: string, raw: any) =>
      getArcDisplayValue(ft, fieldName, raw, arcDefSiTable, arcFieldsByLowerSi, domainMode);

    const getTableSearchText = (ft: any, fieldName: string, mode: SiTableSearchMode) => {
      const value = getAdv(ft, fieldName, ft?.properties?.[fieldName]);
      if (mode === 'description') return value.description || value.display || value.code;
      if (mode === 'code') return value.code;
      return [value.display, value.description, value.code].filter(Boolean).join(' ');
    };

    const passesRuleFilter = (ft: any) => {
      if (!tableFilterField) return true;
      const haystack = getTableSearchText(ft, tableFilterField, 'both').toLowerCase();
      const needle = tableFilterValue.trim().toLowerCase();
      if (tableFilterOperator === 'empty') return haystack.length === 0;
      if (tableFilterOperator === 'not_empty') return haystack.length > 0;
      if (!needle) return true;
      if (tableFilterOperator === 'equals') return haystack === needle;
      if (tableFilterOperator === 'not_equals') return haystack !== needle;
      return haystack.includes(needle);
    };

    const selectedSubset = tableShowSelectedOnly
      ? activeTableFeatures.filter((ft, idx) => tableSelectedKeys.has(siComputeFeatureRowKey(ft, idx, cache)))
      : activeTableFeatures;

    const ruleFiltered = selectedSubset.filter(passesRuleFilter);

    const q = tableSearchText.trim().toLowerCase();
    if (!q) return ruleFiltered;
    const fields = orderedSiTableFields;
    return ruleFiltered.filter(ft =>
      fields.some(fieldName => getTableSearchText(ft, fieldName, tableSearchMode).toLowerCase().includes(q)),
    );
  }, [
    activeDialogLayer,
    activeTableFeatures,
    arcDefSiTable,
    arcFieldsByLowerSi,
    orderedSiTableFields,
    tableFilterField,
    tableFilterOperator,
    tableFilterValue,
    tableShowSelectedOnly,
    tableSearchText,
    tableSearchMode,
    tableSelectedKeys,
  ]);

  const siSymbologyNormalized = useMemo(() => {
    if (!activeDialogLayer) return null;
    const canUseArcGisOnline =
      activeDialogLayer.source === 'arcgis' ||
      Boolean(activeDialogLayer.arcgisDrawingInfo) ||
      Boolean((activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo) ||
      Boolean(activeDialogLayer.sourceUrl?.trim());
    return normalizeSymbologyForLayer(activeDialogLayer.geojson, activeDialogLayer.source, symbologyDraft, canUseArcGisOnline);
  }, [activeDialogLayer, symbologyDraft]);

  const siSymbologyCtx = useMemo((): SymbologyContext | null => {
    if (!activeDialogLayer?.geojson || !siSymbologyNormalized) return null;
    return buildSymbologyContext(activeDialogLayer.geojson, siSymbologyNormalized);
  }, [activeDialogLayer?.geojson, siSymbologyNormalized]);

  const arcgisRendererType = useMemo(
    () => String((activeDialogLayer?.arcgisDrawingInfo as any)?.renderer?.type || ''),
    [activeDialogLayer],
  );
  const canUseArcGisOnline = useMemo(
    () =>
      Boolean(
        activeDialogLayer &&
          (activeDialogLayer.source === 'arcgis' ||
            activeDialogLayer.arcgisDrawingInfo ||
            (activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo ||
            activeDialogLayer.sourceUrl?.trim()),
      ),
    [activeDialogLayer],
  );

  useEffect(() => {
    if (!activeLayerActionDialog || activeLayerActionDialog.mode !== 'table') return;
    siTableFeatureKeyCacheRef.current = new Map();
    setTableSearchText('');
    setTableSearchMode('description');
    setTableFilterField('');
    setTableFilterOperator('contains');
    setTableFilterValue('');
    setTableShowSelectedOnly(false);
    setTableSelectedKeys(new Set());
    setTableToolsCollapsed(true);
    setDraggingSiTableField(null);
  }, [activeLayerActionDialog]);

  // When the attribute table / symbology / legend opens for an ArcGIS-backed
  // layer whose local geojson is empty/sparse (viewport-lazy layers such as
  // Agro_Structures), fetch the full feature set straight from the service so
  // those tools work against real data instead of "No attributes found".
  useEffect(() => {
    const mode = activeLayerActionDialog?.mode;
    if (!activeLayerActionDialog || (mode !== 'table' && mode !== 'symbology' && mode !== 'legend')) {
      setSiTableServiceGeojson(null);
      setSiTableServiceLoading(false);
      setSiTableServiceError(null);
      return;
    }
    const layer = customLayersRef.current.find(l => l.id === activeLayerActionDialog.layerId);
    if (!layer) return;
    const localCount = Array.isArray(layer.geojson?.features) ? layer.geojson.features.length : 0;
    const sourceUrl = typeof layer.sourceUrl === 'string' ? layer.sourceUrl.trim() : '';
    const isArcgis = layer.source === 'arcgis' || /\/(Feature|Map)Server\/\d+/i.test(sourceUrl);
    // Local dataset already usable, or nothing to fetch from.
    if (!sourceUrl || !isArcgis || localCount >= 50) {
      setSiTableServiceGeojson(null);
      setSiTableServiceError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setSiTableServiceLoading(true);
    setSiTableServiceError(null);
    setSiTableServiceGeojson(null);
    void (async () => {
      try {
        const token = layer.authToken || getArcgisPortalToken() || undefined;
        const fc = await fetchArcGisFeatureLayerGeoJson(sourceUrl, { token, signal: controller.signal });
        if (cancelled) return;
        setSiTableServiceGeojson({ layerId: layer.id, geojson: fc });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setSiTableServiceError(
          err instanceof Error ? err.message : 'Could not load layer attributes from the service.',
        );
      } finally {
        if (!cancelled) setSiTableServiceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeLayerActionDialog]);

  useLayoutEffect(() => {
    if (!activeLayerActionDialog || activeLayerActionDialog.mode !== 'symbology') {
      siStyleSessionBackupRef.current = null;
      return;
    }
    const lid = activeLayerActionDialog.layerId;
    const layer = customLayersRef.current.find(l => l.id === lid);
    if (layer) siStyleSessionBackupRef.current = { layerId: lid, snap: pickSiCustomLayerStyleSnapshot(layer) };
  }, [activeLayerActionDialog]);

  useEffect(() => {
    if (!activeLayerActionDialog || activeLayerActionDialog.mode !== 'symbology') {
      siSymbologyLiveLayerIdRef.current = null;
      return;
    }
    const lid = activeLayerActionDialog.layerId;
    const layer = customLayersRef.current.find(l => l.id === lid);
    if (!layer) return;
    const canUse =
      layer.source === 'arcgis' ||
      Boolean(layer.arcgisDrawingInfo) ||
      Boolean((layer.arcgisLayerDefinition as any)?.drawingInfo) ||
      Boolean(layer.sourceUrl?.trim());

    const needInit = siSymbologyLiveLayerIdRef.current !== lid;
    if (needInit) {
      siSymbologyLiveLayerIdRef.current = lid;
      const di = layer.arcgisDrawingInfo as any;
      const ren = di?.renderer;
      const t = String(ren?.type || '');
      let maxCat = 8;
      if (t === 'uniqueValue' && Array.isArray(ren.uniqueValueInfos)) {
        const n = ren.uniqueValueInfos.length;
        maxCat = n > 0 ? Math.min(8, n) : 8;
      } else if (t === 'classBreaks' && Array.isArray(ren.classBreakInfos)) {
        const n = ren.classBreakInfos.filter((br: any) => Number.isFinite(Number(br?.maxValue))).length;
        maxCat = n > 0 ? Math.min(8, n) : 8;
      }
      const savedSym = layer.symbology;
      const resolvedUseArcGisOnline = !canUse
        ? false
        : typeof savedSym?.useArcGisOnline === 'boolean'
          ? savedSym.useArcGisOnline
          : typeof layer.useArcGisSymbology === 'boolean'
            ? layer.useArcGisSymbology
            : true;
      const inferred = inferVisualizationFromArcgisRenderer(ren);
      const base: SymbologyConfig = {
        ...savedSym,
        ...inferred,
        useArcGisOnline: resolvedUseArcGisOnline,
      };
      const normalized = normalizeSymbologyForLayer(layer.geojson, layer.source, base, canUse);
      setSymbologyDraft({
        ...normalized,
        arcgisMaxCategories: maxCat,
      });
      setSiSymbologyAppearance(appearanceFromSiCustomLayerFields(layer));
      return;
    }

    if (symbologyDraft.useArcGisOnline) {
      const normalized = normalizeSymbologyForLayer(layer.geojson, layer.source, symbologyDraft, canUse);
      const symSave: SymbologyConfig = {
        useArcGisOnline: canUse ? normalized.useArcGisOnline : false,
        style: normalized.style,
        field: normalized.field,
        classes: normalized.classes,
        method: normalized.method,
        colorRamp: normalized.colorRamp,
        threshold: normalized.threshold,
      };
      setCustomLayers(prev => prev.map(l => (l.id === lid ? { ...l, symbology: symSave } : l)));
      return;
    }
    const normalized = normalizeSymbologyForLayer(layer.geojson, layer.source, symbologyDraft, canUse);
    const symSave: SymbologyConfig = {
      useArcGisOnline: canUse ? normalized.useArcGisOnline : false,
      style: normalized.style,
      field: normalized.field,
      classes: normalized.classes,
      method: normalized.method,
      colorRamp: normalized.colorRamp,
      threshold: normalized.threshold,
    };
    const ap = persistedSiAppearance(siSymbologyAppearance);
    setCustomLayers(prev =>
      prev.map(l =>
        l.id === lid
          ? {
              ...l,
              symbology: symSave,
              color: ap.color,
              fillColor: ap.fillColor,
              weight: ap.weight,
              mapOpacity: ap.opacity,
              strokeStyle: ap.strokeStyle as CustomLayer['strokeStyle'],
              polygonFillAlpha: ap.polygonFillAlpha,
              pointRadius: ap.pointRadius,
              fillStyle: ap.fillStyle as CustomLayer['fillStyle'],
              blendMode: ap.blendMode as CustomLayer['blendMode'],
            }
          : l,
      ),
    );
  }, [activeLayerActionDialog, symbologyDraft, siSymbologyAppearance]);

  const cancelSiSymbologyDialog = useCallback(() => {
    const b = siStyleSessionBackupRef.current;
    if (b) {
      setCustomLayers(prev => prev.map(l => (l.id === b.layerId ? { ...l, ...b.snap } : l)));
    }
    siStyleSessionBackupRef.current = null;
    siSymbologyLiveLayerIdRef.current = null;
    setActiveLayerActionDialog(null);
  }, []);

  const resetSiSymbologyStudio = useCallback(() => {
    const dlg = activeLayerActionDialog;
    const b = siStyleSessionBackupRef.current;
    if (!dlg || dlg.mode !== 'symbology' || !activeDialogLayer || !b || b.layerId !== dlg.layerId) return;
    const merged: CustomLayer = { ...activeDialogLayer, ...b.snap };
    setCustomLayers(prev => prev.map(l => (l.id === b.layerId ? { ...l, ...b.snap } : l)));
    const canUse =
      merged.source === 'arcgis' ||
      Boolean(merged.arcgisDrawingInfo) ||
      Boolean((merged.arcgisLayerDefinition as any)?.drawingInfo) ||
      Boolean(merged.sourceUrl?.trim());
    setSymbologyDraft(prev => ({
      ...normalizeSymbologyForLayer(merged.geojson, merged.source, merged.symbology, canUse),
      arcgisMaxCategories: prev.arcgisMaxCategories,
    }));
    setSiSymbologyAppearance(appearanceFromSiCustomLayerFields(merged));
  }, [activeLayerActionDialog, activeDialogLayer]);

  const updateSiSymbologyAppearance = useCallback((patch: Partial<SiSymbologyAppearance>) => {
    setSiSymbologyAppearance(prev => {
      let merged: SiSymbologyAppearance = { ...prev, ...patch };
      merged.weight = Math.max(0.5, Math.min(16, Number.isFinite(merged.weight) ? merged.weight : 2));
      merged.opacity = Math.max(0, Math.min(1, Number.isFinite(merged.opacity) ? merged.opacity : 1));
      merged.polygonFillAlpha = Math.max(
        0,
        Math.min(1, Number.isFinite(merged.polygonFillAlpha) ? merged.polygonFillAlpha : 0.35),
      );
      merged.pointRadius = Math.max(3, Math.min(24, Number.isFinite(merged.pointRadius) ? merged.pointRadius : 6));
      merged.previewCornerRadius = Math.max(
        0,
        Math.min(24, Number.isFinite(merged.previewCornerRadius) ? merged.previewCornerRadius : 8),
      );
      const fs = merged.fillStyle;
      merged.fillStyle = fs === 'pattern' || fs === 'hatch' || fs === 'gradient' || fs === 'solid' ? fs : 'solid';
      const bm = merged.blendMode;
      merged.blendMode =
        bm === 'multiply' || bm === 'screen' || bm === 'overlay' || bm === 'darken' || bm === 'lighten' || bm === 'normal'
          ? bm
          : 'normal';
      const ss = merged.strokeStyle;
      merged.strokeStyle = ss === 'dashed' || ss === 'dotted' || ss === 'dashdot' || ss === 'solid' ? ss : 'solid';
      return merged;
    });
  }, []);

  const applySymbologyDraft = async () => {
    if (!activeDialogLayer) return;
    const ap = persistedSiAppearance(siSymbologyAppearance);
    const appearancePatch: Pick<
      CustomLayer,
      'color' | 'fillColor' | 'weight' | 'mapOpacity' | 'strokeStyle' | 'polygonFillAlpha' | 'pointRadius' | 'fillStyle' | 'blendMode'
    > = {
      color: ap.color,
      fillColor: ap.fillColor,
      weight: ap.weight,
      mapOpacity: ap.opacity,
      strokeStyle: ap.strokeStyle as CustomLayer['strokeStyle'],
      polygonFillAlpha: ap.polygonFillAlpha,
      pointRadius: ap.pointRadius,
      fillStyle: ap.fillStyle as CustomLayer['fillStyle'],
      blendMode: ap.blendMode as CustomLayer['blendMode'],
    };
    try {
      const normalized = normalizeSymbologyForLayer(
        activeDialogLayer.geojson,
        activeDialogLayer.source,
        symbologyDraft,
        canUseArcGisOnline,
      );
      const symbologyToSave: SymbologyConfig = {
        useArcGisOnline: canUseArcGisOnline ? normalized.useArcGisOnline : false,
        style: normalized.style,
        field: normalized.field,
        classes: normalized.classes,
        method: normalized.method,
        colorRamp: normalized.colorRamp,
        threshold: normalized.threshold,
      };

      const hasArcgisRendererSupport =
        activeDialogLayer.source === 'arcgis' ||
        Boolean(activeDialogLayer.arcgisDrawingInfo) ||
        Boolean((activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo);

      const rampHex = SI_SYMBOLOGY_BAKE_RAMPS[normalized.colorRamp];
      const nextColor =
        normalized.style === 'unique'
          ? activeDialogLayer.color || '#22c55e'
          : rampHex[Math.max(0, Math.min(rampHex.length - 1, normalized.classes - 1))] ?? '#22c55e';

      if (hasArcgisRendererSupport) {
        let di =
          activeDialogLayer.arcgisDrawingInfo ??
          (sanitizeArcgisDrawingInfoForClient((activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo) as Record<
            string,
            unknown
          > | null);
        if (!di && activeDialogLayer.sourceUrl?.trim()) {
          const raw = await fetchArcgisLayerDrawingInfo(activeDialogLayer.sourceUrl!, activeDialogLayer.authToken);
          di = (raw && sanitizeArcgisDrawingInfoForClient(raw)) || null;
        }

        if (symbologyDraft.useArcGisOnline) {
          if (!di || !arcgisDrawingInfoToFillPaint(di)) {
            setStacStatus('Could not load a supported ArcGIS renderer (drawingInfo) for this layer.');
            return;
          }
          /** Keep the service renderer intact â€” do not slice unique/class lists (applySymbologyâ€¦ caps categories). */
          const baked = sanitizeArcgisDrawingInfoForClient(di) as Record<string, unknown> | null;
          if (!baked || !arcgisDrawingInfoToFillPaint(baked)) {
            setStacStatus('Could not apply symbology to this layer renderer.');
            return;
          }
          setCustomLayers(prev =>
            prev.map(l =>
              l.id === activeDialogLayer.id
                ? {
                    ...l,
                    ...appearancePatch,
                    arcgisDrawingInfo: baked,
                    useArcGisSymbology: true,
                    color: ap.color || nextColor,
                    fillColor: ap.fillColor || ap.color || nextColor,
                    symbology: symbologyToSave,
                  }
                : l,
            ),
          );
        } else {
          const maxForBake = normalized.classes;
          const baked = di
            ? applySymbologyToArcgisDrawingInfo(di as Record<string, unknown>, normalized.colorRamp, maxForBake)
            : null;
          setCustomLayers(prev =>
            prev.map(l =>
              l.id === activeDialogLayer.id
                ? {
                    ...l,
                    ...appearancePatch,
                    arcgisDrawingInfo: baked ?? l.arcgisDrawingInfo ?? null,
                    useArcGisSymbology: false,
                    color: ap.color || nextColor,
                    fillColor: ap.fillColor || ap.color || nextColor,
                    symbology: symbologyToSave,
                  }
                : l,
            ),
          );
        }
        siStyleSessionBackupRef.current = null;
        siSymbologyLiveLayerIdRef.current = null;
        setActiveLayerActionDialog(null);
        setStacStatus(`Style saved for "${activeDialogLayer.name}".`);
        return;
      }

      setCustomLayers(prev =>
        prev.map(l =>
          l.id === activeDialogLayer.id
            ? {
                ...l,
                ...appearancePatch,
                useArcGisSymbology: false,
                color: ap.color || nextColor,
                fillColor: ap.fillColor,
                symbology: symbologyToSave,
              }
            : l,
        ),
      );
      siStyleSessionBackupRef.current = null;
      siSymbologyLiveLayerIdRef.current = null;
      setActiveLayerActionDialog(null);
      setStacStatus(`Style saved for "${activeDialogLayer.name}".`);
    } catch (e) {
      setStacStatus(e instanceof Error ? e.message : 'Failed to save style.');
    }
  };

  const updateSymbologyDraft = useCallback(
    (patch: Partial<SiSymbologyDraft>) => {
      setSymbologyDraft(prev => {
        if (!activeDialogLayer) return prev;
        let merged: SiSymbologyDraft = { ...prev, ...patch };
        if (patch.useArcGisOnline === true) {
          const ren =
            (activeDialogLayer.arcgisDrawingInfo as any)?.renderer ??
            (activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo?.renderer;
          merged = { ...merged, ...inferVisualizationFromArcgisRenderer(ren) };
        }
        const normalized = normalizeSymbologyForLayer(
          activeDialogLayer.geojson,
          activeDialogLayer.source,
          merged,
          canUseArcGisOnline,
        );
        return { ...normalized, arcgisMaxCategories: merged.arcgisMaxCategories };
      });
    },
    [activeDialogLayer, canUseArcGisOnline],
  );

  const moveSiTableColumn = (from: string, to: string) => {
    if (!activeDialogLayer || !from || !to || from === to) return;
    const current = orderedSiTableFields.slice();
    const fromIndex = current.indexOf(from);
    const toIndex = current.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return;
    current.splice(fromIndex, 1);
    current.splice(toIndex, 0, from);
    setSiTableFieldOrderByLayerId(prev => ({ ...prev, [activeDialogLayer.id]: current }));
  };

  const moveSiTableColumnByOffset = (fieldName: string, offset: number) => {
    if (!activeDialogLayer) return;
    const current = orderedSiTableFields.slice();
    const fromIndex = current.indexOf(fieldName);
    const toIndex = fromIndex + offset;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return;
    current.splice(fromIndex, 1);
    current.splice(toIndex, 0, fieldName);
    setSiTableFieldOrderByLayerId(prev => ({ ...prev, [activeDialogLayer.id]: current }));
  };

  const renderSiTableHighlightedValue = (text: string) => {
    const q = tableSearchText.trim();
    if (!q) return text;
    const lower = text.toLowerCase();
    const at = lower.indexOf(q.toLowerCase());
    if (at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <mark className="gis-table-match">{text.slice(at, at + q.length)}</mark>
        {text.slice(at + q.length)}
      </>
    );
  };

  const zoomSiTableToSelection = () => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || !activeDialogLayer) return;
    const cache = siTableFeatureKeyCacheRef.current;
    const selectedFeatures = activeTableFeatures.filter((ft, idx) =>
      tableSelectedKeys.has(siComputeFeatureRowKey(ft, idx, cache)),
    );
    if (!selectedFeatures.length) return;
    const fc = { type: 'FeatureCollection', features: selectedFeatures };
    const bounds = getGeoJsonBounds(fc);
    if (!bounds || typeof map.fitBounds !== 'function') return;
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 80, duration: 800, maxZoom: 16 },
    );
  };

  const siTableGoHome = () => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || !activeDialogLayer?.geojson) return;
    const bounds = getGeoJsonBounds(activeDialogLayer.geojson);
    if (!bounds || typeof map.fitBounds !== 'function') return;
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 80, duration: 800 },
    );
  };

  const exportTableAsCsv = () => {
    if (!activeDialogLayer || !visibleSiTableFields.length) return;
    const domainMode = 'description' as const;
    const escapeCsv = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = visibleSiTableFields.map(escapeCsv).join(',');
    const rows = siFilteredTableFeatures.map(ft =>
      visibleSiTableFields
        .map(f =>
          escapeCsv(getArcDisplayValue(ft, f, ft?.properties?.[f], arcDefSiTable, arcFieldsByLowerSi, domainMode).display),
        )
        .join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${siSanitizeTableFileName(activeDialogLayer.name)}-descriptions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveSiTableFormat = () => {
    if (!activeDialogLayer) return;
    const payload = {
      displayMode: 'description' as const,
      searchMode: tableSearchMode,
      hiddenFields: Array.from(hiddenSiTableFieldsByLayerId[activeDialogLayer.id] ?? []),
      fieldOrder: orderedSiTableFields,
      filter: { field: tableFilterField, operator: tableFilterOperator, value: tableFilterValue },
    };
    try {
      localStorage.setItem(siScope.scopedStorageKey(`si-table-format:${activeDialogLayer.id}`), JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  };

  const applySiTableFormat = () => {
    if (!activeDialogLayer) return;
    try {
      const raw = localStorage.getItem(siScope.scopedStorageKey(`si-table-format:${activeDialogLayer.id}`));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.searchMode === 'description' || parsed?.searchMode === 'code' || parsed?.searchMode === 'both') {
        setTableSearchMode(parsed.searchMode);
      }
      if (Array.isArray(parsed?.hiddenFields)) {
        setHiddenSiTableFieldsByLayerId(prev => ({
          ...prev,
          [activeDialogLayer.id]: new Set(parsed.hiddenFields.map(String)),
        }));
      }
      if (Array.isArray(parsed?.fieldOrder)) {
        setSiTableFieldOrderByLayerId(prev => ({ ...prev, [activeDialogLayer.id]: parsed.fieldOrder.map(String) }));
      }
      if (parsed?.filter && typeof parsed.filter === 'object') {
        setTableFilterField(typeof parsed.filter.field === 'string' ? parsed.filter.field : '');
        setTableFilterOperator(
          ['contains', 'equals', 'not_equals', 'empty', 'not_empty'].includes(parsed.filter.operator)
            ? parsed.filter.operator
            : 'contains',
        );
        setTableFilterValue(typeof parsed.filter.value === 'string' ? parsed.filter.value : '');
      }
    } catch {
      /* ignore */
    }
  };

  const executeCustomLayerAction = useCallback(async (
    action: 'sync' | 'table' | 'symbology' | 'legend' | 'remove' | 'rename' | 'editAoi',
    layerId: string,
  ) => {
    setLayerOptionsMenuLayerId(null);
    const layer = customLayers.find(item => item.id === layerId);
    if (!layer) return;
    if (action === 'remove') {
      const ok = await appConfirm(
        `Remove layer "${layer.name}" from the map? It will stay removed after you refresh the page.`,
        { title: 'Remove layer', danger: true, confirmLabel: 'Remove', cancelLabel: 'Cancel' },
      );
      if (!ok) return;
      if (layer.raster?.url?.startsWith('blob:')) URL.revokeObjectURL(layer.raster.url);
      if (layer.bimBlobUrl?.startsWith('blob:')) URL.revokeObjectURL(layer.bimBlobUrl);
      setCustomLayers(prev => prev.filter(item => item.id !== layerId));
      setActiveLayerActionDialog(prev => (prev?.layerId === layerId ? null : prev));
      setStacStatus(`Removed layer "${layer.name}".`);
      return;
    }
    if (action === 'sync') {
      await refreshArcgisLayer(layer);
      return;
    }
    if (action === 'rename') {
      const nextNameRaw = window.prompt('Rename layer', layer.name);
      if (nextNameRaw === null) return;
      const nextName = nextNameRaw.trim();
      if (!nextName) {
        setStacStatus('Layer name cannot be empty.');
        return;
      }
      setCustomLayers(prev => prev.map(item => (item.id === layerId ? { ...item, name: nextName } : item)));
      setStacStatus(`Layer renamed to "${nextName}".`);
      return;
    }
    if (action === 'editAoi') {
      const applied = applyUploadedAoiToAnalysis(layer.geojson, layer.name);
      if (!applied) {
        setStacStatus('Selected AOI layer has no valid polygon geometry.');
        return;
      }
      focusGeoJsonOnMap(layer.geojson);
      setStacStatus(`AOI analysis now uses "${layer.name}".`);
      return;
    }
    if (action === 'table') {
      setActiveLayerActionDialog({ mode: 'table', layerId });
      return;
    }
    if (action === 'symbology') {
      setActiveLayerActionDialog({ mode: 'symbology', layerId });
      return;
    }
    setActiveLayerActionDialog({ mode: 'legend', layerId });
  }, [customLayers, refreshArcgisLayer, applyUploadedAoiToAnalysis, focusGeoJsonOnMap]);

  const handleLayerActionClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
    action: 'sync' | 'table' | 'symbology' | 'legend' | 'remove' | 'rename' | 'editAoi',
    layerId: string,
  ) => {
    event.stopPropagation();
    await executeCustomLayerAction(action, layerId);
  };

  const moveCustomLayerInStack = useCallback((layerId: string, dir: -1 | 1) => {
    setLayerOptionsMenuLayerId(null);
    setCustomLayers(prev => {
      const i = prev.findIndex(l => l.id === layerId);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const cp = [...prev];
      const a = cp[i]!;
      const b = cp[j]!;
      cp[i] = b;
      cp[j] = a;
      return cp;
    });
  }, []);

  // â”€â”€ Drag-to-reorder for user-added layers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Moves the dragged layer to the dropped layer's slot (full splice, not a
  // swap) so dragging across several rows lands exactly where the user drops.
  // The customLayers array order drives the on-map draw order.
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [dropTargetLayerId, setDropTargetLayerId] = useState<string | null>(null);
  const reorderCustomLayers = useCallback((draggedId: string, targetId: string) => {
    if (!draggedId || !targetId || draggedId === targetId) return;
    setCustomLayers(prev => {
      const from = prev.findIndex(l => l.id === draggedId);
      const to = prev.findIndex(l => l.id === targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const cp = [...prev];
      const [moved] = cp.splice(from, 1);
      cp.splice(to, 0, moved!);
      return cp;
    });
  }, []);

  // User-defined draw order for analysis result layers (AOI + Hydro steps).
  // Holds analysis entry ids (e.g. 'drawn-aoi', 'hydro-elevation') top â†’ bottom.
  const [analysisLayerOrder, setAnalysisLayerOrder] = useState<string[]>([]);
  const orderedAnalysisLayerEntryIdsRef = useRef<string[]>([]);
  const reorderAnalysisLayers = useCallback((draggedId: string, targetId: string) => {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const cur = orderedAnalysisLayerEntryIdsRef.current;
    const from = cur.indexOf(draggedId);
    const to = cur.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    const cp = [...cur];
    const [moved] = cp.splice(from, 1);
    cp.splice(to, 0, moved!);
    setAnalysisLayerOrder(cp);
  }, []);

  const zoomToCustomLayerExtent = useCallback(
    (layerId: string) => {
      setLayerOptionsMenuLayerId(null);
      const layer = customLayers.find(l => l.id === layerId);
      if (!layer) return;
      if (layer.renderMode === 'raster' && layer.raster?.coordinates) {
        const coords = layer.raster.coordinates as number[][];
        if (!Array.isArray(coords) || coords.length < 2) {
          setStacStatus('Raster layer has no corner coordinates to zoom to.');
          return;
        }
        const lngs = coords.map(c => c[0]).filter(Number.isFinite);
        const lats = coords.map(c => c[1]).filter(Number.isFinite);
        if (lngs.length < 2 || lats.length < 2) return;
        const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
        mapInstance?.fitBounds?.(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 80, duration: 800 },
        );
        return;
      }
      const feats = Array.isArray(layer.geojson?.features) ? layer.geojson.features : [];
      if (feats.length > 0) {
        focusGeoJsonOnMap(layer.geojson);
        return;
      }
      // Viewport-lazy ArcGIS layers (e.g. Agro_Structures) hold no local
      // features until you pan over them, so zoom to the layer's published
      // service extent instead of the empty geojson bounds.
      const sourceUrl = typeof layer.sourceUrl === 'string' ? layer.sourceUrl.trim() : '';
      const isArcgis = layer.source === 'arcgis' || /\/(Feature|Map)Server\/\d+/i.test(sourceUrl);
      if (sourceUrl && isArcgis) {
        setStacStatus(`Zooming to â€œ${layer.name}â€â€¦`);
        void (async () => {
          try {
            const pjson = await fetchArcgisLayerPjson(sourceUrl, layer.authToken || getArcgisPortalToken() || undefined);
            const ext = (pjson?.extent ?? pjson?.fullExtent) as any;
            const bbox = ext ? arcgisExtentToWgs84BBox(ext) : null;
            if (!bbox) {
              setStacStatus(`â€œ${layer.name}â€ has no extent to zoom to.`);
              return;
            }
            const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
            mapInstance?.fitBounds?.(
              [
                [bbox[0], bbox[1]],
                [bbox[2], bbox[3]],
              ],
              { padding: 80, duration: 800, maxZoom: 17 },
            );
            setStacStatus(`Zoomed to â€œ${layer.name}â€.`);
          } catch {
            setStacStatus(`Could not zoom to â€œ${layer.name}â€.`);
          }
        })();
        return;
      }
      focusGeoJsonOnMap(layer.geojson);
    },
    [customLayers, focusGeoJsonOnMap],
  );

  const promptCustomLayerMapOpacity = useCallback(
    (layerId: string) => {
      setLayerOptionsMenuLayerId(null);
      const layer = customLayers.find(l => l.id === layerId);
      if (!layer) return;
      const curPct = Math.round((layer.mapOpacity ?? 1) * 100);
      const raw = window.prompt('Layer opacity (10â€“100%)', String(curPct));
      if (raw === null) return;
      const n = Number.parseInt(String(raw).trim().replace(/%/g, ''), 10);
      if (!Number.isFinite(n) || n < 10 || n > 100) {
        setStacStatus('Opacity must be between 10 and 100.');
        return;
      }
      const f = n / 100;
      setCustomLayers(prev => prev.map(l => (l.id === layerId ? { ...l, mapOpacity: f } : l)));
      setStacStatus(`Layer opacity set to ${n}%.`);
    },
    [customLayers],
  );

  const openLayerPopupConfiguratorFromRow = useCallback((layerId: string) => {
    setLayerOptionsMenuLayerId(null);
    setLayerPopupCfgPickId(layerId);
    setLayerPopupCfgOpen(true);
  }, []);

  /** Candidate attribute field names for a layer (ArcGIS schema first, else feature props). */
  const collectCustomLayerFieldNames = useCallback((layer: CustomLayer): string[] => {
    const names = new Set<string>();
    const arcFields = layer.arcgisLayerDefinition?.fields;
    if (Array.isArray(arcFields)) {
      for (const f of arcFields) {
        const n = (f as { name?: unknown })?.name;
        if (typeof n === 'string' && n.trim()) names.add(n.trim());
      }
    }
    if (names.size === 0) {
      const feats = Array.isArray(layer.geojson?.features) ? layer.geojson!.features : [];
      for (const ft of feats.slice(0, 50)) {
        const props = (ft as { properties?: Record<string, unknown> })?.properties;
        if (props && typeof props === 'object') {
          for (const k of Object.keys(props)) names.add(k);
        }
      }
    }
    return [...names];
  }, []);

  // Labeling â€” pick an attribute field; features get a text label drawn from it.
  const promptCustomLayerLabeling = useCallback(
    (layerId: string) => {
      setLayerOptionsMenuLayerId(null);
      const layer = customLayers.find(l => l.id === layerId);
      if (!layer) return;
      if (layer.renderMode === 'raster') {
        setStacStatus('Labeling applies to vector layers.');
        return;
      }
      const fields = collectCustomLayerFieldNames(layer);
      if (fields.length === 0) {
        setStacStatus('No attribute fields available to label this layer. Zoom in to load features, then try again.');
        return;
      }
      const current = typeof layer.labelFieldName === 'string' ? layer.labelFieldName : '';
      const list = fields.slice(0, 40).join(', ');
      const raw = window.prompt(
        `Label features by field (leave empty to turn labels off).\n\nAvailable fields:\n${list}`,
        current,
      );
      if (raw === null) return;
      const next = raw.trim();
      if (next && !fields.some(f => f.toLowerCase() === next.toLowerCase())) {
        setStacStatus(`Field "${next}" not found on this layer.`);
        return;
      }
      const resolved = next ? fields.find(f => f.toLowerCase() === next.toLowerCase())! : '';
      setCustomLayers(prev => prev.map(l => (l.id === layerId ? { ...l, labelFieldName: resolved || null } : l)));
      setStacStatus(resolved ? `Labels on â€” showing "${resolved}".` : 'Labels turned off.');
    },
    [customLayers, collectCustomLayerFieldNames],
  );

  // Definition query â€” filter which features are drawn using a simple `field op value` expression.
  const promptCustomLayerDefinitionQuery = useCallback(
    (layerId: string) => {
      setLayerOptionsMenuLayerId(null);
      const layer = customLayers.find(l => l.id === layerId);
      if (!layer) return;
      if (layer.renderMode === 'raster') {
        setStacStatus('Definition queries apply to vector layers.');
        return;
      }
      const fields = collectCustomLayerFieldNames(layer);
      const list = fields.slice(0, 40).join(', ');
      const current = typeof layer.definitionQueryText === 'string' ? layer.definitionQueryText : '';
      const raw = window.prompt(
        `Definition query â€” only matching features are shown.\n` +
          `Examples:  crop = wheat   |   area > 1000   |   status != closed   |   name ~ farm\n` +
          `Operators: = , != , > , >= , < , <= , ~ (contains). Leave empty to clear.\n\n` +
          (list ? `Available fields:\n${list}` : ''),
        current,
      );
      if (raw === null) return;
      const text = raw.trim();
      if (!text) {
        setCustomLayers(prev =>
          prev.map(l => (l.id === layerId ? { ...l, definitionQueryText: null, definitionFilter: null } : l)),
        );
        setStacStatus('Definition query cleared â€” showing all features.');
        return;
      }
      const compiled = siCompileDefinitionQuery(text, fields);
      if (!compiled) {
        setStacStatus('Could not parse query. Use: field op value  (op = , != , > , >= , < , <= , ~).');
        return;
      }
      setCustomLayers(prev =>
        prev.map(l =>
          l.id === layerId ? { ...l, definitionQueryText: text, definitionFilter: compiled } : l,
        ),
      );
      setStacStatus(`Definition query applied: ${text}`);
    },
    [customLayers, collectCustomLayerFieldNames],
  );

  useEffect(() => {
    if (!layerOptionsMenuLayerId) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLayerOptionsMenuLayerId(null);
    };
    const close = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      // The options menu is portalled to <body>, so it is not inside the row host.
      // Keep it open for any click landing inside the floating popover (so its items fire).
      if (el && el.closest('.si-env-layer-options-menu')) return;
      const host = document.querySelector(`[data-si-env-layer-options-root="${layerOptionsMenuLayerId}"]`);
      if (host && el && host.contains(el)) return;
      setLayerOptionsMenuLayerId(null);
    };
    window.addEventListener('keydown', esc);
    document.addEventListener('mousedown', close);
    return () => {
      window.removeEventListener('keydown', esc);
      document.removeEventListener('mousedown', close);
    };
  }, [layerOptionsMenuLayerId]);

  // Suppresses the autocomplete fetch that the `setSearchQuery` inside a
  // selection would otherwise retrigger (so picking a result doesn't reopen
  // the suggestion list).
  const skipSearchRef = useRef(false);

  /** Bias ranking toward whatever the user is currently looking at. */
  const getMapProximity = useCallback((): [number, number] | null => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    const c = map?.getCenter?.();
    if (c && Number.isFinite(c.lng) && Number.isFinite(c.lat)) return [c.lng, c.lat];
    return null;
  }, []);

  const runPlaceSearch = useCallback(
    async (rawQuery: string, options: { autocomplete: boolean }): Promise<MapSearchResult[]> => {
      const q = rawQuery.trim();
      if (q.length < 2) {
        setSearchResults([]);
        setShowSearchResults(false);
        return [];
      }
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setIsSearching(true);
      try {
        const results = await searchPlaces(q, {
          mapboxToken,
          proximity: getMapProximity(),
          language: detectQueryLanguage(q),
          limit: 6,
          autocomplete: options.autocomplete,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return [];
        setSearchResults(results);
        setShowSearchResults(true);
        setSearchActiveIndex(-1);
        return results;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return [];
        return [];
      } finally {
        if (searchAbortRef.current === controller) setIsSearching(false);
      }
    },
    [mapboxToken, getMapProximity],
  );

  const handleSelectSearchResult = useCallback(
    (result: MapSearchResult) => {
      if (!result || !Number.isFinite(result.lng) || !Number.isFinite(result.lat)) return;
      searchAbortRef.current?.abort();
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      // Drop + highlight the pin at the resolved location (Google-Maps style).
      setSearchPin({ lng: result.lng, lat: result.lat, label: result.label });

      const bbox = result.bbox;
      const hasUsableBbox =
        Array.isArray(bbox) &&
        bbox.length === 4 &&
        bbox.every(Number.isFinite) &&
        (bbox[2] - bbox[0] > 1e-4 || bbox[3] - bbox[1] > 1e-4);

      if (map && hasUsableBbox && typeof map.fitBounds === 'function') {
        map.fitBounds(
          [
            [bbox![0], bbox![1]],
            [bbox![2], bbox![3]],
          ],
          { padding: 90, duration: 1200, maxZoom: 16, essential: true },
        );
      } else if (map && typeof map.flyTo === 'function') {
        map.flyTo({
          center: [result.lng, result.lat],
          zoom: zoomForPlaceKind(result.kind),
          duration: 1200,
          essential: true,
        });
      } else {
        setViewState(prev => ({
          ...prev,
          longitude: result.lng,
          latitude: result.lat,
          zoom: zoomForPlaceKind(result.kind),
        }));
      }

      skipSearchRef.current = true;
      setSearchQuery(result.label);
      setShowSearchResults(false);
      setSearchActiveIndex(-1);
    },
    [],
  );

  const performSearch = useCallback(async () => {
    const results = await runPlaceSearch(searchQuery, { autocomplete: false });
    if (results.length) handleSelectSearchResult(results[0]);
  }, [runPlaceSearch, searchQuery, handleSelectSearchResult]);

  // Debounced autocomplete-as-you-type: fast, abortable, proximity-ranked.
  useEffect(() => {
    if (!isSearchOpen) return;
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchAbortRef.current?.abort();
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    const t = window.setTimeout(() => {
      void runPlaceSearch(q, { autocomplete: true });
    }, 220);
    return () => window.clearTimeout(t);
  }, [searchQuery, isSearchOpen, runPlaceSearch]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setShowSearchResults(true);
        setSearchActiveIndex(i => Math.min(i + 1, searchResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchActiveIndex >= 0 && searchResults[searchActiveIndex]) {
          handleSelectSearchResult(searchResults[searchActiveIndex]);
        } else {
          void performSearch();
        }
      } else if (e.key === 'Escape') {
        setShowSearchResults(false);
        setSearchActiveIndex(-1);
      }
    },
    [searchResults, searchActiveIndex, handleSelectSearchResult, performSearch],
  );

  const pivots = useMemo<PivotFeature[]>(() => {
    /** Pivot polygons must not float as a â€œphantomâ€ layer when the user turned the vector layer off. */
    const uploaded = customLayers.find(
      layer =>
        layer.visible !== false &&
        Array.isArray(layer.geojson?.features) &&
        layer.geojson.features.length > 0,
    );
    const features = uploaded?.geojson?.features;
    const sourceFeatures = Array.isArray(features) ? features : [];

    return sourceFeatures.map((feature: any, index: number) => {
      const id = normalizePivotId(feature?.properties?.pivot_id ?? feature?.properties?.id ?? feature?.properties?.Name, index);
      return {
        id,
        name: feature?.properties?.name || feature?.properties?.Name || id,
        color: PIVOT_COLORS[index % PIVOT_COLORS.length],
        feature: { ...feature, properties: { ...(feature?.properties || {}), pivot_id: id } },
        centroid: getGeoJsonCentroid(feature),
      };
    });
  }, [customLayers]);

  const pivotChartRows = useMemo(() => {
    const latestMean = weeklyComposites.length ? weeklyComposites[Math.min(weeklyComposites.length - 1, 2)].mean : 0;
    return pivots.map((pivot, index) => ({
      ...pivot,
      value: Number((latestMean + (index - pivots.length / 2) * (selectedIndex === 'LST' ? 0.8 : 0.035)).toFixed(3)),
    }));
  }, [pivots, selectedIndex, weeklyComposites]);

  const pivotGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: pivots.map((pivot, i) => ({
      ...pivot.feature,
      properties: {
        ...(pivot.feature.properties || {}),
        pivot_id: pivot.id,
        name: pivot.name,
        color: pivot.color,
        analysisMean: pivotChartRows[i]?.value ?? 0,
      },
    })),
  }), [pivots, pivotChartRows]);

  const selectedPivot = useMemo(
    () => pivots.find(pivot => pivot.id === selectedPivotId) || null,
    [pivots, selectedPivotId],
  );

  const dates = useMemo(() => {
    const arr = [];
    const anchor = dateFromLocalIso(localIsoDate());
    for (let i = 13; i >= 0; i--) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      arr.push({
        day: d.getDate(),
        month: d.toLocaleString('default', { month: 'short' }),
        full: d
      });
    }
    return arr;
  }, [imageryDateAutoFollow, localIsoDate(selectedDate)]);

  const weeklyWindows = useMemo(() => {
    const windows: Array<{ weekIndex: number; startDate: string; endDate: string; label: string }> = [];
    const start = new Date(timeSeriesStart);
    const end = new Date(timeSeriesEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return windows;
    const cursor = new Date(start);
    let weekIndex = 1;
    while (cursor <= end && weekIndex <= 54) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > end) weekEnd.setTime(end.getTime());
      windows.push({
        weekIndex,
        startDate: localIsoDate(weekStart),
        endDate: localIsoDate(weekEnd),
        label: `W${String(weekIndex).padStart(2, '0')} ${weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
      });
      cursor.setDate(cursor.getDate() + 7);
      weekIndex += 1;
    }
    return windows;
  }, [timeSeriesStart, timeSeriesEnd]);

  const aoiStatsGeometry = useMemo((): GeoJSON.Geometry | null => {
    if (aoiStatsPixel) return buildSentinelPixelSamplePolygon(aoiStatsPixel.lng, aoiStatsPixel.lat);
    return drawnGeometry?.geometry ?? null;
  }, [aoiStatsPixel, drawnGeometry]);

  const aoiStatsSampleMode: AoiStatsSampleMode = aoiStatsPixel ? 'pixel' : 'aoi';

  const rsAoiStatsFetchEnabled = Boolean(
    (mapStaticChartsOpen || fieldTimelineSessionActive) && aoiStatsGeometry,
  );

  const aoiLiveTimeSeries = useAoiLiveTimeSeries({
    geometry: aoiStatsGeometry,
    fromIso: timeSeriesStart,
    toIso: timeSeriesEnd,
    primaryLayerId: wmsLayer.trim() || selectedIndex,
    weeklyWindows,
    sampleMode: aoiStatsSampleMode,
    enabled: rsAoiStatsFetchEnabled,
  });

  const exploreEffectiveDatetime = useMemo(() => {
    if (exploreDateSourceMode === 'manual') {
      return { start: exploreDateStart.trim(), end: exploreDateEnd.trim() };
    }
    return { start: timeSeriesStart.trim(), end: timeSeriesEnd.trim() };
  }, [exploreDateSourceMode, exploreDateStart, exploreDateEnd, timeSeriesStart, timeSeriesEnd]);

  const synthesizeWeeklyComposites = (itemCount: number) => {
    const range = selectedIndexConfig.range;
    const span = range[1] - range[0];
    return weeklyWindows.map((week, idx) => {
      const seasonal = Math.sin((idx / Math.max(1, weeklyWindows.length - 1)) * Math.PI);
      const base = selectedIndex === 'LST'
        ? 24 + seasonal * 12
        : range[0] + span * (0.42 + seasonal * 0.28);
      const mean = Number(base.toFixed(3));
      return {
        ...week,
        mean,
        min: Number(Math.max(range[0], mean - span * 0.08).toFixed(3)),
        max: Number(Math.min(range[1], mean + span * 0.1).toFixed(3)),
        itemCount,
        enabled: false,
      };
    });
  };

  const generateFieldAnalysisTimeline = () => {
    if (weeklyWindows.length < 1) {
      setFieldAnalysisStatus('Choose a valid start and end date for the time series.');
      return;
    }
    if (!aoiStatsGeometry) {
      setFieldAnalysisStatus('Draw an AOI on the map, then generate the timeline.');
      setFieldTimelineSessionActive(false);
      return;
    }
    setFieldTimelineSessionActive(true);
    setWeeklyComposites(synthesizeWeeklyComposites(0));
    setFieldAnalysisStatus('Loading Sentinel statistics for AOI…');
  };

  const stopFieldAnalysisTimeline = useCallback(() => {
    setIsTimelinePlaying(false);
    setWeeklyComposites([]);
    setFieldTimelineSessionActive(false);
    setFieldAnalysisStatus('Timeline stopped. Adjust the date range and tap Generate timeline to start again.');
  }, []);

  useEffect(() => {
    if (!fieldTimelineSessionActive) return;
    if (aoiLiveTimeSeries.loading) {
      setFieldAnalysisStatus('Loading Sentinel statistics for AOI…');
      return;
    }
    if (aoiLiveTimeSeries.source === 'live' && aoiLiveTimeSeries.weekly.length) {
      setFieldAnalysisStatus(
        `Live timeline: ${aoiLiveTimeSeries.weekly.length} week(s) · ${aoiStatsSampleMode === 'pixel' ? 'pixel' : 'AOI mean'} · ${selectedIndexConfig.label}.`,
      );
      return;
    }
    if (aoiLiveTimeSeries.error) {
      setFieldAnalysisStatus(aoiLiveTimeSeries.error);
    }
  }, [
    fieldTimelineSessionActive,
    aoiLiveTimeSeries.loading,
    aoiLiveTimeSeries.source,
    aoiLiveTimeSeries.weekly.length,
    aoiLiveTimeSeries.error,
    aoiStatsSampleMode,
    selectedIndexConfig.label,
  ]);

  /**
   * Bridge the live AOI statistics into the timeline strip. `weeklyComposites`
   * drives both `timelineVisible` and the chips, so without this sync the
   * timeline never appears after tapping "Generate timeline".
   */
  useEffect(() => {
    if (!fieldTimelineSessionActive) return;
    if (aoiLiveTimeSeries.source === 'live' && aoiLiveTimeSeries.weekly.length) {
      setWeeklyComposites(aoiLiveTimeSeries.weekly as WeeklyComposite[]);
    } else if (aoiLiveTimeSeries.source === 'sample') {
      setWeeklyComposites(synthesizeWeeklyComposites(0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldTimelineSessionActive, aoiLiveTimeSeries.source, aoiLiveTimeSeries.weekly]);

  /** Same control: generate weekly strip, or stop playback and clear it for a fresh run. */
  const onFieldAnalysisTimelinePrimaryClick = () => {
    if (fieldTimelineSessionActive) {
      stopFieldAnalysisTimeline();
      return;
    }
    generateFieldAnalysisTimeline();
  };

  const flyToStacItemExtent = (item: any) => {
    const geom = stacItemFootprintGeometry(item);
    if (!geom) {
      setStacStatus('Ù„Ø§ ØªÙˆØ¬Ø¯ Ù‡Ù†Ø¯Ø³Ø© footprint Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¹Ù†ØµØ±.');
      return;
    }
    const b = getGeoJsonBounds({ type: 'Feature', geometry: geom, properties: {} });
    if (!b) {
      setStacStatus('Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø­Ø³Ø§Ø¨ Ø§Ù„Ø­Ø¯ÙˆØ¯ Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¹Ù†ØµØ±.');
      return;
    }
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    map?.fitBounds?.(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 48, duration: 700 },
    );
  };

  const showStacItemThumbOnMap = async (item: any) => {
    const candidates = getStacItemThumbCandidateUrls(item, stacConnection, { forMapOverlay: true });
    let bbox = Array.isArray(item?.bbox) && item.bbox.length >= 4 ? (item.bbox as number[]) : null;
    if (!bbox && item?.geometry) {
      const gbounds = getGeoJsonBounds({ type: 'Feature', geometry: item.geometry, properties: {} });
      if (gbounds) bbox = [...gbounds];
    }
    if (!candidates.length || !bbox || bbox.length < 4) {
      setStacStatus('Ù„Ø§ ØªÙˆØ¬Ø¯ ØµÙˆØ±Ø© Ù…ØµØºÙ‘Ø±Ø© Ø£Ùˆ Ø­Ø¯ÙˆØ¯ bbox Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¹Ù†ØµØ±.');
      return;
    }
    const [w, s, e, n] = bbox;
    if (![w, s, e, n].every(Number.isFinite)) {
      setStacStatus('Ø¨ÙŠØ§Ù†Ø§Øª bbox ØºÙŠØ± ØµØ§Ù„Ø­Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¹Ù†ØµØ±.');
      return;
    }
    setStacStatus('Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ø¹Ø§ÙŠÙ†Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø±ÙŠØ·Ø©â€¦');
    const blobUrl = await fetchStacMapOverlayBlobUrl(candidates);
    if (!blobUrl) {
      setStacStatus('ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ ØµÙˆØ±Ø© Ø§Ù„Ù…Ø¹Ø§ÙŠÙ†Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø±ÙŠØ·Ø© (ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø§ØªØµØ§Ù„ Ø£Ùˆ Ø¬Ø±Ù‘Ø¨ Ø¹Ù†ØµØ±Ø§Ù‹ Ø¢Ø®Ø±).');
      return;
    }
    setStacMapThumb(prev => {
      revokeStacMapOverlayBlob(prev?.url);
      return { url: blobUrl, coordinates: bboxToRgCoordinates([w, s, e, n]) };
    });
    setIsStacThumbVisible(true);
    const collection = getStacItemCollection(item);
    const itemId = String(item?.id ?? '').trim();
    setStacMapThumbLabel(
      collection && itemId
        ? `STAC imagery: ${collection} / ${itemId}`
        : itemId
          ? `STAC imagery: ${itemId}`
          : 'STAC imagery preview',
    );
    setStacStatus(`Ù…Ø¹Ø§ÙŠÙ†Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø±ÙŠØ·Ø©: ${String(item.id ?? '')}`);
  };

  useEffect(() => {
    if (!isMapStyleReady || stacFocusHydratedRef.current || siScope.isolateRouting) return;
    try {
      const raw = sessionStorage.getItem('agri-stac-focus');
      if (!raw) return;
      stacFocusHydratedRef.current = true;
      const parsed = JSON.parse(raw) as { item?: any };
      sessionStorage.removeItem('agri-stac-focus');
      if (!parsed?.item) return;
      setProcessingTargetStacItem(parsed.item);
      window.setTimeout(() => flyToStacItemExtent(parsed.item), 450);
      void showStacItemThumbOnMap(parsed.item);
      setExpandedEnvSection('remote-sensing');
      setIsLayerDropdownOpen(true);
      setStacStatus(`Scene from new map tab: ${String(parsed.item.id ?? '')}`);
    } catch {
      /* ignore */
    }
  }, [isMapStyleReady, siScope.isolateRouting]);

  const stacActiveSearchUrl = useMemo(
    () => appendStacQueryParams(getResolvedStacSearchUrl(stacConnection), stacConnection.customParams),
    [stacConnection],
  );

  const exploreFilteredCollections = useMemo(() => {
    const q = exploreCollectionSearch.trim().toLowerCase();
    const desc = exploreDescriptionKeyword.trim().toLowerCase();
    return stacCatalogCollections.filter(c => {
      if (q && !c.id.toLowerCase().includes(q) && !c.title.toLowerCase().includes(q)) return false;
      if (
        desc &&
        !c.id.toLowerCase().includes(desc) &&
        !c.title.toLowerCase().includes(desc) &&
        !c.description.toLowerCase().includes(desc)
      ) {
        return false;
      }
      return true;
    });
  }, [stacCatalogCollections, exploreCollectionSearch, exploreDescriptionKeyword]);

  const exploreSortedStacItems = useMemo(() => {
    const arr = [...stacItems];
    arr.sort((a: any, b: any) => {
      const da = String(a?.properties?.datetime ?? '');
      const db = String(b?.properties?.datetime ?? '');
      const cmp = da.localeCompare(db);
      return exploreResultsSortDesc ? -cmp : cmp;
    });
    return arr;
  }, [stacItems, exploreResultsSortDesc]);

  const exploreResultsPageCount = Math.max(1, Math.ceil(exploreSortedStacItems.length / EXPLORE_RESULTS_PAGE_SIZE));

  const explorePaginatedStacItems = useMemo(() => {
    const start = exploreResultsPage * EXPLORE_RESULTS_PAGE_SIZE;
    return exploreSortedStacItems.slice(start, start + EXPLORE_RESULTS_PAGE_SIZE);
  }, [exploreSortedStacItems, exploreResultsPage]);

  const explorePageSelectionStats = useMemo(() => {
    const keys = explorePaginatedStacItems.map((item: any) => stacItemStableKey(item));
    const allSelected = keys.length > 0 && keys.every(k => exploreSelectedResultKeys.includes(k));
    const someSelected = keys.some(k => exploreSelectedResultKeys.includes(k));
    const selectedOnPage = keys.filter(k => exploreSelectedResultKeys.includes(k)).length;
    return { keys, allSelected, someSelected, selectedOnPage };
  }, [explorePaginatedStacItems, exploreSelectedResultKeys]);

  useEffect(() => {
    const maxPage = Math.max(0, exploreResultsPageCount - 1);
    if (exploreResultsPage > maxPage) setExploreResultsPage(maxPage);
  }, [exploreResultsPageCount, exploreResultsPage]);

  const stacFootprintsGeoJson = useMemo(() => {
    const features = stacItems
      .map((item: any) => {
        const geometry = stacItemFootprintGeometry(item);
        if (!geometry) return null;
        const stableKey = stacItemStableKey(item);
        return {
          type: 'Feature' as const,
          properties: {
            id: String(item.id ?? ''),
            collection: String(item.collection ?? ''),
            datetime: String(item.properties?.datetime ?? ''),
            stacKey: stableKey,
          },
          geometry,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f != null);
    return { type: 'FeatureCollection' as const, features };
  }, [stacItems]);

  const stacItemsByStableKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const item of stacItems) {
      m.set(stacItemStableKey(item), item);
    }
    return m;
  }, [stacItems]);

  const stacModalOkDisabled =
    !stacModalDraft.connectionName.trim() ||
    (stacModalDraft.presetId === 'custom' && !stacModalDraft.customCatalogBaseUrl.trim());

  const openStacConnectionModal = () => {
    setStacModalDraft(cloneStacModalDraft(stacConnection));
    setIsAcsPickerOpen(false);
    setIsStacModalOpen(true);
  };

  const closeStacModal = () => {
    setIsAcsPickerOpen(false);
    setIsStacModalOpen(false);
  };

  const applyStacConnectionModal = () => {
    if (stacModalOkDisabled) return;
    const next = { ...stacModalDraft, connectionName: stacModalDraft.connectionName.trim() };
    persistStacConnectionToStorage(next, siScope.scopedStorageKey(STAC_CONNECTION_STORAGE_KEY));
    setStacConnection(next);
    exploreCatalogSigRef.current = '';
    setStacCatalogCollections([]);
    setIsAcsPickerOpen(false);
    setIsStacModalOpen(false);
  };

  const showStacSearchUrlInChrome = !isDefaultPlanetaryComputerStacSearchUrl(stacActiveSearchUrl);

  const exploreStacSourcePanelContent = (
    <>
      <p className="si-env-toolbar-hint si-env-toolbar-hint--muted">
        Manage STAC catalog connections for backend imagery workflows. Toggle map overlays in <strong>Layers</strong>.
      </p>
      <div className="si-stac-source-card">
        <p className="si-stac-source-lead">
          <strong>STAC</strong> (SpatioTemporal Asset Catalog) is an open standard for cataloging imagery and raster data.
          STAC connections let you query collections over HTTP, similar to catalog workflows in ArcGIS Pro.
        </p>
        <div className="si-stac-active-banner">
          <span className="si-stac-active-label">Active connection</span>
          <strong>{stacConnection.connectionName}</strong>
          <span className="si-stac-active-meta">
            {stacConnection.presetId === 'planetary-computer'
              ? 'Microsoft Planetary Computer'
              : (stacConnection.customCatalogBaseUrl.trim() || 'Custom catalog')}
          </span>
          {showStacSearchUrlInChrome ? (
            <a
              className="si-stac-active-meta si-stac-url-truncate"
              href={stacActiveSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={stacActiveSearchUrl}
            >
              {stacActiveSearchUrl}
            </a>
          ) : null}
        </div>
        <div className="si-stac-source-actions">
          <button type="button" className="si-stac-create-connection-btn" onClick={openStacConnectionModal}>
            <i className="fa-solid fa-plug" aria-hidden />
            <span>Create STAC connection</span>
          </button>
        </div>
        <div className="si-stac-help-row">
          <a href={STAC_HELP_LINKS.spec} target="_blank" rel="noopener noreferrer">
            STAC specification
          </a>
          <a href={STAC_HELP_LINKS.docs} target="_blank" rel="noopener noreferrer">
            PC STAC docs
          </a>
          <a href={STAC_HELP_LINKS.catalog} target="_blank" rel="noopener noreferrer">
            Browse catalog
          </a>
          <a href={STAC_HELP_LINKS.esriMpc} target="_blank" rel="noopener noreferrer">
            ArcGIS for MPC
          </a>
        </div>
        <p className="si-stac-acs-note">
          Cloud Storage Connection (.acs) files from ArcGIS Pro are not applied in the browser; use the connection dialog
          (token or headers) when your catalog requires authentication.
        </p>
      </div>
      <div className="si-env-message">{stacStatus}</div>
    </>
  );

  const analysisEngineBaseUrl = useMemo(() => getAnalysisEngineBaseUrl(), []);
  const effectiveAnalysisEngineBaseUrl = analysisEngineBaseUrl || runtimeAnalysisEngineBaseUrl;

  const resolveExploreAoiFeature = useCallback((): GeoJSON.Feature => {
    const drawnGeom = drawnGeometry?.geometry;
    const pivotGeom = selectedPivot?.feature?.geometry;
    const fcBounds = getGeoJsonBounds(pivotGeoJson);
    if (exploreExtentMode === 'drawn' && drawnGeom) {
      return { type: 'Feature', geometry: drawnGeom, properties: { source: 'drawn' } };
    }
    if (exploreExtentMode === 'layer') {
      if (pivotGeom) return { type: 'Feature', geometry: pivotGeom, properties: { source: 'layer' } };
      if (fcBounds) return bboxToPolygonFeature(fcBounds[0], fcBounds[1], fcBounds[2], fcBounds[3]);
    }
    if (exploreExtentMode === 'manual') {
      const n = parseFloat(exploreManualBbox.north);
      const s = parseFloat(exploreManualBbox.south);
      const e = parseFloat(exploreManualBbox.east);
      const w = parseFloat(exploreManualBbox.west);
      if ([n, s, e, w].every(Number.isFinite)) return bboxToPolygonFeature(w, s, e, n);
    }
    if (exploreExtentMode === 'map') {
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      try {
        const b = map?.getBounds?.();
        if (b) return bboxToPolygonFeature(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
      } catch {
        /* ignore map getBounds issues */
      }
    }
    return { type: 'Feature', geometry: DUBAI_STAC_INTERSECTS, properties: { source: 'default' } };
  }, [drawnGeometry, selectedPivot, pivotGeoJson, exploreExtentMode, exploreManualBbox]);

  const findCompatibleStacItemForTemplate = useCallback(
    async (
      templateId: MpcTemplateId,
      aoi: GeoJSON.Feature,
      dStart: string,
      dEnd: string,
      collectionOverride?: string[],
      indexOverride?: string,
    ): Promise<any | null> => {
      try {
        const effectiveCollections = (collectionOverride?.length ? collectionOverride : exploreSelectedCollectionIds)
          .map(v => String(v || '').trim())
          .filter(Boolean);
        if (!effectiveCollections.length) return null;
        const res = await fetch(stacActiveSearchUrl, {
          method: 'POST',
          headers: buildStacRequestHeaders(stacConnection),
          body: JSON.stringify({
            collections: effectiveCollections,
            intersects: aoi.geometry,
            datetime: `${dStart}/${dEnd}`,
            limit: Math.max(20, Math.min(120, exploreLimit)),
            query: exploreUseCloudFilter ? { 'eo:cloud_cover': { lte: Number(exploreCloudCoverMax) } } : undefined,
          }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const features = Array.isArray(json?.features) ? json.features : [];
        for (const item of features) {
          const assets = (item?.assets && typeof item.assets === 'object' ? item.assets : {}) as Record<string, unknown>;
          const names = new Set(Object.keys(assets).map(k => String(k).toLowerCase()));
          const specs = buildProcessingPreviewSpecsForItem(templateId, item, indexOverride).filter(spec =>
            spec.assets.every(a => names.has(String(a).toLowerCase())),
          );
          if (specs.length) return item;
        }
        return null;
      } catch {
        return null;
      }
    },
    [
      stacActiveSearchUrl,
      stacConnection,
      exploreSelectedCollectionIds,
      exploreLimit,
      exploreUseCloudFilter,
      exploreCloudCoverMax,
    ],
  );

  const runMpcTemplateProcessing = async (templateOverride?: MpcTemplateId, forcedTargetItem?: any, indexOverride?: string) => {
    const templateToRun = templateOverride ?? selectedMpcTemplateId;
    const selectedKey = exploreSelectedResultKeys[0];
    const selectedItemFromResults = selectedKey
      ? exploreSortedStacItems.find((x: any) => stacItemStableKey(x) === selectedKey) ?? null
      : null;
    const targetItem = forcedTargetItem ?? processingTargetStacItem ?? selectedItemFromResults;
    if (!targetItem) {
      setStacStatus('Add STAC scene to Current Map (or select one scene in Results) before running template.');
      return;
    }
    const targetCollection = getStacItemCollection(targetItem);
    const effectiveCollections = exploreSelectedCollectionIds.length
      ? [...exploreSelectedCollectionIds]
      : targetCollection
        ? [targetCollection]
        : [];
    if (!effectiveCollections.length) {
      setStacStatus('Select at least one collection in Parameters tab.');
      return;
    }
    const dStart = exploreEffectiveDatetime.start;
    const dEnd = exploreEffectiveDatetime.end;
    if (!dStart || !dEnd) {
      setStacStatus('Set start and end date in Date and Time.');
      return;
    }
    const aoi = resolveExploreAoiFeature();
    setMpcProcessResult(null);
    setProcessingTargetStacItem(targetItem);

    if (!effectiveAnalysisEngineBaseUrl) {
      try {
        let effectiveItem = targetItem;
        const coll = getStacItemCollection(targetItem);
        const itemId = getStacItemIdForThumb(targetItem);
        if (!coll || !itemId) throw new Error('Missing STAC collection/item id for selected scene.');
        let bbox = Array.isArray(targetItem?.bbox) && targetItem.bbox.length >= 4 ? (targetItem.bbox as number[]) : null;
        if (!bbox && targetItem?.geometry) {
          const gbounds = getGeoJsonBounds({ type: 'Feature', geometry: targetItem.geometry, properties: {} });
          if (gbounds) bbox = [...gbounds];
        }
        if (!bbox || bbox.length < 4) throw new Error('Scene bbox is missing; cannot place processed preview on map.');
        const availableAssets = new Set(
          Object.keys((effectiveItem?.assets && typeof effectiveItem.assets === 'object' ? effectiveItem.assets : {}) as Record<string, unknown>).map(k =>
            String(k).toLowerCase(),
          ),
        );
        let specs = buildProcessingPreviewSpecsForItem(templateToRun, effectiveItem, indexOverride).filter(spec =>
          spec.assets.every(a => availableAssets.has(String(a).toLowerCase())),
        );
        if (!specs.length) {
            const autoItem = await findCompatibleStacItemForTemplate(
              templateToRun,
              aoi,
              dStart,
              dEnd,
              effectiveCollections,
              indexOverride,
            );
          if (autoItem) {
            effectiveItem = autoItem;
            setProcessingTargetStacItem(autoItem);
            const assets2 = (autoItem?.assets && typeof autoItem.assets === 'object' ? autoItem.assets : {}) as Record<string, unknown>;
            const names2 = new Set(Object.keys(assets2).map(k => String(k).toLowerCase()));
            specs = buildProcessingPreviewSpecsForItem(templateToRun, autoItem, indexOverride).filter(spec =>
              spec.assets.every(a => names2.has(String(a).toLowerCase())),
            );
          }
          if (!specs.length) {
            throw new Error(
              `Scene is missing required bands for ${templateToRun}. Available assets: ${
                Array.from(availableAssets).slice(0, 20).join(', ') || 'none'
              }`,
            );
          }
        }
        const effColl = getStacItemCollection(effectiveItem);
        const effItemId = getStacItemIdForThumb(effectiveItem);
        if (!effColl || !effItemId) throw new Error('Could not resolve compatible STAC item for rendering.');
        const renderBbox = mpcClipToAoi && aoi ? (getGeoJsonBounds(aoi as any) as [number, number, number, number] | null) : null;
        const targetBbox = renderBbox && renderBbox.every(v => Number.isFinite(v)) ? renderBbox : (bbox as [number, number, number, number]);
        const latMid = ((targetBbox[1] + targetBbox[3]) / 2) * (Math.PI / 180);
        const metersPerDegLat = 110540;
        const metersPerDegLon = 111320 * Math.max(0.2, Math.cos(latMid));
        const pixelW10m = Math.max(256, Math.min(4096, Math.round(((targetBbox[2] - targetBbox[0]) * metersPerDegLon) / 10)));
        const pixelH10m = Math.max(256, Math.min(4096, Math.round(((targetBbox[3] - targetBbox[1]) * metersPerDegLat) / 10)));
        const urls = [1, 0.75, 0.5].flatMap(scale =>
          specs.map(spec =>
            buildPcProcessingPreviewPngUrl(
              effColl,
              effItemId,
              spec,
              2048,
              targetBbox,
              Math.round(pixelW10m * scale),
              Math.round(pixelH10m * scale),
            ),
          ),
        );
        let blobUrl = await fetchStacMapOverlayBlobUrl(urls);
        if (!blobUrl) {
          const genericCandidates = getStacItemThumbCandidateUrls(effectiveItem, stacConnection, { forMapOverlay: true });
          blobUrl = await fetchStacMapOverlayBlobUrl(genericCandidates);
        }
        if (!blobUrl) throw new Error('Could not render processing template preview for this scene. Check required scene assets or enable backend URL.');
        const [w, s, e, n] = targetBbox;
        setStacMapThumb(prev => {
          revokeStacMapOverlayBlob(prev?.url);
          return { url: blobUrl, coordinates: bboxToRgCoordinates([w, s, e, n]) };
        });
        setIsStacThumbVisible(true);
        setStacMapThumbLabel(`STAC imagery (${templateToRun}): ${effItemId}`);
        setMpcProcessResult({
          ok: true,
          template_id: templateToRun,
          collections: [effColl],
          datetime: `${dStart}/${dEnd}`,
          item_count: 1,
          detail: 'Frontend render mode (no analysis backend URL configured).',
          label: LOCAL_PROCESSING_TEMPLATES.find(t => t.id === templateToRun)?.label ?? templateToRun,
          processing: {
            clip_to_aoi: mpcClipToAoi,
            tile_size: Math.max(256, Math.min(4096, Number(mpcTileSize) || 1024)),
            mode: 'frontend preview mode',
          },
        } as MpcProcessResult);
        setStacStatus('Processing template applied to the added STAC layer (frontend mode).');
      } catch (err) {
        setStacStatus(err instanceof Error ? err.message : 'Processing failed.');
      }
      return;
    }

    try {
      const result = await mpcProcess(effectiveAnalysisEngineBaseUrl, {
        aoi,
        collections: effectiveCollections,
        datetime: `${dStart}/${dEnd}`,
        template_id: templateToRun,
        max_items: Math.max(1, Math.min(80, exploreLimit)),
        max_cloud_cover: exploreUseCloudFilter ? exploreCloudCoverMax : undefined,
        catalog_url: DEFAULT_MPC_CATALOG_URL,
        acs_zip_path: DEFAULT_MPC_ACS_ZIP_PATH,
        clip_to_aoi: mpcClipToAoi,
        tile_size: Math.max(256, Math.min(4096, Number(mpcTileSize) || 1024)),
      });
      setMpcProcessResult(result);
      setStacStatus(`Processing template completed: ${result.label || result.template_id}.`);
    } catch (err) {
      setStacStatus(err instanceof Error ? err.message : 'Processing failed.');
    }
  };

  async function runRsAnalysisFromAssistant(options?: {
    keepCurrentSection?: boolean;
    forcedIndex?: string;
    /** When true, do not rebuild the weekly timeline or open static charts (map Run = clip AOI + layer only). */
    skipTimelineAndCharts?: boolean;
  }) {
    const previewSketch = drawnGeometryRef.current;
    const hasLayerSource = hasActiveLayerSourceAoiRef.current;
    if (!previewSketch && !hasLayerSource) {
      setFieldAnalysisStatus('Draw AOI first, then press Run Analysis.');
      openRemoteSensingDrawing('polygon');
      return;
    }
    if (hasLayerSource && !previewSketch) {
      setFieldAnalysisStatus(
        'Layer Source is active. Draw a preview zone to analyze a sub-area, or use Crop Alerts / Sentinel Live for the full mask.',
      );
      openRemoteSensingDrawing('polygon');
      return;
    }

    const templateByIndex: Record<string, MpcTemplateId> = {
      NDVI: 'ndvi_s2',
      NDMI: 'ndmi_s2',
      NDWI: 'false_color_s2',
      SAVI: 'ndvi_s2',
      EVI: 'ndvi_s2',
      GNDVI: 'ndvi_s2',
      NBR: 'false_color_s2',
      NDRE: 'ndvi_s2',
      BSI: 'false_color_s2',
      MNDWI: 'false_color_s2',
      LST: 'false_color_s2',
    };

    const activeIndex = options?.forcedIndex || wmsLayerSelectValue || selectedIndex;
    const template = templateByIndex[activeIndex] ?? 'ndvi_s2';
    const selectedTemplate = LOCAL_PROCESSING_TEMPLATES.find(t => t.id === template);
    const templateCollections = selectedTemplate?.collections ?? ['sentinel-2-l2a'];
    setSelectedMpcTemplateId(template);
    setMpcClipToAoi(true);
    setIsWmsOverlayVisible(true);

    const dStart = exploreEffectiveDatetime.start || timeSeriesStart;
    const dEnd = exploreEffectiveDatetime.end || timeSeriesEnd;
    const drawnGeom = previewSketch?.geometry as GeoJSON.Geometry | undefined;
    const aoi: GeoJSON.Feature = drawnGeom
      ? { type: 'Feature', geometry: drawnGeom, properties: { source: hasLayerSource ? 'preview' : 'drawn' } }
      : resolveExploreAoiFeature();
    if (!aoi || !dStart || !dEnd) {
      setIsStacThumbVisible(false);
      setFieldAnalysisStatus('Set AOI and date range before running analysis.');
      return;
    }

    let target = processingTargetStacItem;
    if (!target) {
      target = await findCompatibleStacItemForTemplate(template, aoi, dStart, dEnd, templateCollections, activeIndex);
    }
    if (!target) {
      setIsStacThumbVisible(false);
      setFieldAnalysisStatus(
        'No Sentinel scene in the catalog for this AOI and date range. WMS is clipped to your AOI; adjust dates in Remote Sensing.',
      );
      return;
    }

    setProcessingTargetStacItem(target);
    // Keep Explore STAC tab isolated from Remote Sensing state.
    setIsStacThumbVisible(true);
    await runMpcTemplateProcessing(template, target, activeIndex);
    if (!options?.keepCurrentSection) {
      setExpandedEnvSection('remote-sensing');
    }
    // Keep the legacy environmental index in sync whenever selected RS index is natively supported.
    if (Object.prototype.hasOwnProperty.call(ENVIRONMENTAL_INDICES, activeIndex)) {
      setSelectedIndex(activeIndex as EnvironmentalIndexId);
      setWmsLayer(activeIndex);
    }
    if (!options?.skipTimelineAndCharts) {
      generateFieldAnalysisTimeline();
    }
    setFieldAnalysisStatus(`Run completed for ${activeIndex}. Results rendered inside AOI.`);
  }

  const openAcsPicker = () => {
    setAcsPickerStaging([]);
    setAcsPickerManualPath('');
    setAcsPickerFilter('');
    setIsAcsPickerOpen(true);
  };

  const cancelAcsPicker = () => {
    setAcsPickerStaging([]);
    setAcsPickerManualPath('');
    setAcsPickerFilter('');
    setIsAcsPickerOpen(false);
  };

  const onAcsFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    if (!fl?.length) return;
    const names = Array.from(fl).map(f => f.name);
    setAcsPickerStaging(prev => {
      const s = new Set(prev);
      names.forEach(n => s.add(n));
      return [...s];
    });
    e.target.value = '';
  };

  const confirmAcsPicker = () => {
    const manualLines = acsPickerManualPath
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    const merged = [...acsPickerStaging, ...manualLines];
    setStacModalDraft(d => {
      const seen = new Set(d.cloudStorageEntries);
      const add = merged.filter(x => x && !seen.has(x) && (seen.add(x), true));
      return { ...d, cloudStorageEntries: [...d.cloudStorageEntries, ...add] };
    });
    cancelAcsPicker();
  };

  useEffect(() => {
    if (!isStacModalOpen) setIsAcsPickerOpen(false);
  }, [isStacModalOpen]);

  useEffect(() => {
    if (!isStacModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isAcsPickerOpen) {
        cancelAcsPicker();
      } else {
        closeStacModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isStacModalOpen, isAcsPickerOpen]);

  const aoiFiveClassLegend = useMemo(() => {
    const cfg = selectedIndexConfig;
    const fallbackMin = cfg.range[0];
    const fallbackMax = cfg.range[1];
    let minV = drawnStats ? Math.max(fallbackMin, Math.min(fallbackMax, drawnStats.min)) : fallbackMin;
    let maxV = drawnStats ? Math.max(fallbackMin, Math.min(fallbackMax, drawnStats.max)) : fallbackMax;
    if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV <= minV) {
      minV = fallbackMin;
      maxV = fallbackMax;
    }
    const span = maxV - minV;
    if (span < (fallbackMax - fallbackMin) * 0.08) {
      minV = fallbackMin;
      maxV = fallbackMax;
    }
    const step = (maxV - minV) / 5;
    return Array.from({ length: 5 }).map((_, i) => {
      const lower = Number((minV + i * step).toFixed(3));
      const upper = Number((i === 4 ? maxV : minV + (i + 1) * step).toFixed(3));
      return {
        idx: i,
        lower,
        upper,
        color: rampColorAt(cfg.palette, i, 5),
        label: `Class ${i + 1}: ${lower.toFixed(2)} - ${upper.toFixed(2)}`,
      };
    });
  }, [selectedIndexConfig, drawnStats]);

  const aoiHeatPointGeoJson = useMemo(() => {
    if (!drawnGeometry?.geometry || !mpcProcessResult) return null;
    const bounds = getGeoJsonBounds(drawnGeometry as any);
    if (!bounds) return null;
    const [w, s, e, n] = bounds;
    if (![w, s, e, n].every(Number.isFinite) || e <= w || n <= s) return null;
    const width = e - w;
    const height = n - s;
    const aspect = width / Math.max(height, 1e-9);
    const cols = Math.max(22, Math.min(56, Math.round(34 * Math.max(0.6, Math.min(1.8, aspect)))));
    const rows = Math.max(22, Math.min(56, Math.round(34 / Math.max(0.6, Math.min(1.8, aspect)))));
    const dx = width / cols;
    const dy = height / rows;
    const minV = mpcProcessResult.statistics?.min ?? aoiFiveClassLegend[0]?.lower ?? -1;
    const maxV = mpcProcessResult.statistics?.max ?? aoiFiveClassLegend[aoiFiveClassLegend.length - 1]?.upper ?? 1;
    const meanV = mpcProcessResult.statistics?.mean ?? (minV + maxV) / 2;
    const span = Math.max(1e-9, maxV - minV);
    const seed = selectedIndex.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const features: any[] = [];
    for (let yy = 0; yy < rows; yy += 1) {
      for (let xx = 0; xx < cols; xx += 1) {
        const cx = w + (xx + 0.5) * dx;
        const cy = s + (yy + 0.5) * dy;
        if (!pointInAoiGeometry(cx, cy, drawnGeometry.geometry)) continue;
        const gx = (xx + 0.5) / cols;
        const gy = (yy + 0.5) / rows;
        const wave = Math.sin((xx + seed * 0.01) * 0.9) * 0.12 + Math.cos((yy + seed * 0.02) * 0.85) * 0.1;
        const gradient = gx * 0.55 + gy * 0.35 + wave;
        const normalized = clampUnit(gradient);
        const value = minV + normalized * span * 0.82 + (meanV - minV) * 0.18;
        const classIdx = Math.max(0, Math.min(4, Math.floor(((value - minV) / span) * 5)));
        const cls = aoiFiveClassLegend[classIdx] ?? aoiFiveClassLegend[0];
        features.push({
          type: 'Feature',
          properties: {
            value: Number(value.toFixed(3)),
            weight: Number(clampUnit((value - minV) / span).toFixed(4)),
            classId: classIdx + 1,
            classLabel: cls?.label ?? `Class ${classIdx + 1}`,
            color: cls?.color ?? '#22c55e',
          },
          geometry: {
            type: 'Point',
            coordinates: [cx, cy],
          },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [drawnGeometry, aoiFiveClassLegend, selectedIndex, mpcProcessResult]);

  const aoiHeatmapColorExpression = useMemo(() => {
    const c = aoiFiveClassLegend.map(x => x.color);
    return [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0.0, 'rgba(0,0,0,0)',
      0.18, c[0] ?? '#7c3aed',
      0.36, c[1] ?? '#3b82f6',
      0.56, c[2] ?? '#22c55e',
      0.78, c[3] ?? '#f59e0b',
      1.0, c[4] ?? '#ef4444',
    ] as any;
  }, [aoiFiveClassLegend]);

  const seriesTrendLabel = useMemo(() => {
    if (weeklyComposites.length < 2) return null;
    const m = weeklyComposites.map(w => w.mean);
    const delta = m[m.length - 1] - m[0];
    const eps = selectedIndex === 'LST' ? 0.5 : 0.02;
    if (Math.abs(delta) < eps) return { tone: 'stable' as const, text: 'Nearly stable across weeks in this preview.' };
    if (delta > 0) return { tone: 'up' as const, text: `Rising signal (â‰ˆ ${delta.toFixed(3)} last âˆ’ first week).` };
    return { tone: 'down' as const, text: `Falling signal (â‰ˆ ${Math.abs(delta).toFixed(3)} last âˆ’ first week).` };
  }, [weeklyComposites, selectedIndex]);

  const recomputeDrawnAoiStats = (geometry: any | null) => {
    if (!geometry) {
      setDrawnStats(null);
      return;
    }
    const values = weeklyComposites.length ? weeklyComposites : synthesizeWeeklyComposites(stacItems.length);
    if (!values.length) {
      setDrawnStats(null);
      return;
    }
    const means = values.map(item => item.mean);
    const mean = means.reduce((sum, value) => sum + value, 0) / means.length;
    const variance = means.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, means.length);
    const weeklyBandMin = Math.min(...values.map(v => v.min));
    const weeklyBandMax = Math.max(...values.map(v => v.max));
    setDrawnStats({
      mean: Number(mean.toFixed(3)),
      min: Number(Math.min(...means).toFixed(3)),
      max: Number(Math.max(...means).toFixed(3)),
      std: Number(Math.sqrt(variance).toFixed(3)),
      weeklyBandMin,
      weeklyBandMax,
    });
  };

  const updateDrawGeometryLive = (geometry: any) => {
    if (mapDrawOwnerRef.current === 'crop-classification') {
      cropClassAoiGeometryRef.current = geometry;
      setCropClassAoiGeometry(geometry);
      return;
    }
    drawnGeometryRef.current = geometry;
    setDrawnGeometry(geometry);
    sentinelWmsTilesSyncedRef.current = '';
  };

  const updateDrawnStats = (geometry: any | null) => {
    if (mapDrawOwnerRef.current === 'crop-classification') {
      cropClassAoiGeometryRef.current = geometry;
      setCropClassAoiGeometry(geometry);
      return;
    }
    drawnGeometryRef.current = geometry;
    setDrawnGeometry(geometry);
    if (geometry) sentinelWmsTilesSyncedRef.current = '';
    recomputeDrawnAoiStats(geometry);
  };

  const multiAoiFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: multiAoiItems.map(row => ({
        ...row.feature,
        properties: {
          ...(row.feature.properties || {}),
          aoiId: row.id,
          aoiName: row.name,
          aoiColor: row.color,
          isActive: row.id === activeMultiAoiId ? 1 : 0,
          aoiSource: row.source,
          aoiMean: row.analysis?.mean ?? null,
        },
      })),
    }),
    [multiAoiItems, activeMultiAoiId],
  );

  const multiAoiCentroidCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: multiAoiItems
        .map(row => {
          const center = getGeoJsonCentroid(row.feature);
          if (!Array.isArray(center) || center.length < 2) return null;
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: center },
            properties: {
              aoiId: row.id,
              aoiName: row.name,
              aoiColor: row.color,
              isActive: row.id === activeMultiAoiId ? 1 : 0,
            },
          };
        })
        .filter(Boolean),
    }),
    [multiAoiItems, activeMultiAoiId],
  );

  const zoomToMultiAoi = useCallback((aoiId: string) => {
    const row = multiAoiItems.find(x => x.id === aoiId);
    if (!row) return;
    const b = getGeoJsonBounds(row.feature as any);
    if (!b) return;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    map?.fitBounds?.(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 90, duration: 620 },
    );
  }, [multiAoiItems]);

  useEffect(() => {
    drawnGeometryRef.current = drawnGeometry;
  }, [drawnGeometry]);

  useEffect(() => {
    cropClassAoiGeometryRef.current = cropClassAoiGeometry;
  }, [cropClassAoiGeometry]);

  useEffect(() => {
    drawTargetModeRef.current = drawTargetMode;
  }, [drawTargetMode]);

  useEffect(() => {
    aoiFieldsRef.current = aoiFields;
  }, [aoiFields]);

  useEffect(() => {
    selectedFieldIdRef.current = selectedFieldId;
  }, [selectedFieldId]);

  useEffect(() => {
    aoiFieldSnapRef.current = aoiFieldSnap;
  }, [aoiFieldSnap]);

  useEffect(() => {
    aoiFieldNoOverlapRef.current = aoiFieldNoOverlap;
  }, [aoiFieldNoOverlap]);

  useEffect(() => {
    if (!drawnGeometry) {
      setAoiFields([]);
      setSelectedFieldId(null);
      fieldEditDragRef.current = null;
      preFieldEditSnapshotRef.current = null;
    }
  }, [drawnGeometry]);

  // When a fresh AOI is committed (geometry appears after being empty), publish it
  // as a visible, independent layer in the Layers panel.
  const aoiHadGeometryRef = useRef(false);
  useEffect(() => {
    const has = !!drawnGeometry;
    if (has && !aoiHadGeometryRef.current) setAoiLayerVisible(true);
    aoiHadGeometryRef.current = has;
  }, [drawnGeometry]);

  useEffect(() => {
    return () => {
      if (drawFadeRafRef.current != null) cancelAnimationFrame(drawFadeRafRef.current);
    };
  }, []);

  const getMapInstance = () => mapRef.current?.getMap?.() ?? mapRef.current;

  /** Sync programmatic viewState changes to the native Mapbox camera (pan/zoom uses ref-only updates). */
  useLayoutEffect(() => {
    if (!isMapLoaded) return;
    if (skipMapCameraSyncRef.current) {
      skipMapCameraSyncRef.current = false;
      viewStateLiveRef.current = viewState;
      return;
    }
    viewStateLiveRef.current = viewState;
    syncAgroCloudMapboxCamera(getMapInstance(), viewState);
  }, [viewState, isMapLoaded]);

  const geoAiPinGeoJson = useMemo(() => {
    if (!geoAiPinLngLat) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: geoAiPinLngLat },
        },
      ],
    };
  }, [geoAiPinLngLat]);

  const clearGeoExplorerChat = useCallback(() => {
    geoExplorerInFlightRef.current = false;
    setGeoExplorerBusy(false);
    setGeoExplorerMessages([]);
    setGeoExplorerVisibleCount(GEO_AI_CHAT_PAGE_SIZE);
    setGeoExplorerDraft('');
    setGeoExplorerPendingImage(null);
    setGeoExplorerChatError('');
    setGeoAiPinLngLat(null);
    setGeoAiInspectPopups([]);
    setGeoAiPendingInspectCard(null);
    setGeoAiTableSelectionsByTableId({});
    setGeoAiTableMapFocusKey(null);
    geoAiLastUserMapQueryRef.current = '';
  }, []);

  const clearGeoAiChat = useCallback(() => {
    geoAiInFlightRef.current = false;
    setGeoAiBusy(false);
    setGeoAiChatMessages([]);
    setGeoAiClaudeVisibleCount(GEO_AI_CHAT_PAGE_SIZE);
    setGeoAiDraft('');
    setGeoAiChatError('');
    setGeoAiInspectPopups([]);
    setGeoAiPendingInspectCard(null);
    setGeoAiTableSelectionsByTableId({});
    setGeoAiTableMapFocusKey(null);
    geoAiLastUserMapQueryRef.current = '';
  }, []);

  const clearGeoDeepseekChat = useCallback(() => {
    geoDeepseekInFlightRef.current = false;
    setGeoDeepseekBusy(false);
    setGeoDeepseekChatMessages([]);
    setGeoAiDeepseekVisibleCount(GEO_AI_CHAT_PAGE_SIZE);
    setGeoDeepseekDraft('');
    setGeoDeepseekChatError('');
    setGeoAiInspectPopups([]);
    setGeoAiPendingInspectCard(null);
    setGeoAiTableSelectionsByTableId({});
    setGeoAiTableMapFocusKey(null);
    geoAiLastUserMapQueryRef.current = '';
  }, []);

  const clearGeoOllamaChat = useCallback(() => {
    geoOllamaInFlightRef.current = false;
    setGeoOllamaBusy(false);
    setGeoOllamaChatMessages([]);
    setGeoAiOllamaVisibleCount(GEO_AI_CHAT_PAGE_SIZE);
    setGeoOllamaDraft('');
    setGeoOllamaChatError('');
    setGeoAiInspectPopups([]);
    setGeoAiPendingInspectCard(null);
    setGeoAiTableSelectionsByTableId({});
    setGeoAiTableMapFocusKey(null);
    geoAiLastUserMapQueryRef.current = '';
  }, []);

  const clearCurrentGeoAiPanel = useCallback(() => {
    if (geoAiModelTab === 'gemini') clearGeoExplorerChat();
    else if (geoAiModelTab === 'claude') clearGeoAiChat();
    else if (geoAiModelTab === 'deepseek') clearGeoDeepseekChat();
    else clearGeoOllamaChat();
  }, [geoAiModelTab, clearGeoExplorerChat, clearGeoAiChat, clearGeoDeepseekChat, clearGeoOllamaChat]);

  const applySatelliteGeoAiMapUi = useCallback(
    async (userText: string, reply: string) => {
      const primary = satelliteCustomLayersToGeoAiLayers(customLayers);
      const saved = await loadGisMapSavedLayers();
      const combined = [
        ...primary,
        ...saved.map(l => ({
          name: l.name,
          visible: l.visible,
          source: l.source,
          data: l.data,
          arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
            .arcgisLayerDefinition,
        })),
      ];
      const pin = resolveGeoAiPinFromUserTextAndReply(userText, reply, combined);
      if (!pin) {
        setGeoAiInspectCard(null);
        setGeoAiPendingInspectCard(null);
        return;
      }
      setGeoAiPinLngLat(pin.coords);
      setViewState(prev => ({
        ...prev,
        longitude: pin.coords[0],
        latitude: pin.coords[1],
        zoom: Math.max(
          geoExplorerTargetZoomForPinSource(pin.pinSource),
          typeof prev.zoom === 'number' ? prev.zoom : 2,
        ),
        pitch: is3DView ? Math.max(typeof prev.pitch === 'number' ? prev.pitch : 0, 42) : prev.pitch ?? 0,
        bearing: typeof prev.bearing === 'number' ? prev.bearing : 0,
      }));
      if (pin.layerHit) {
        const lyrCfg = customLayers.find(l => l.name === pin.layerHit.layerName);
        const built = buildGeoAiInspectCardContent({
          properties: pin.layerHit.properties,
          arcgisLayerDefinition: pin.layerHit.arcgisLayerDefinition,
          popupConfig: lyrCfg?.popupConfig,
          queryContext: userText,
          inspectCoords: { lng: pin.coords[0], lat: pin.coords[1] },
        });
        stageGeoAiInspectCard({
          title: pin.layerHit.layerName,
          rows: built.rows,
          inspect: built.inspect,
          lng: pin.coords[0],
          lat: pin.coords[1],
          ...pickGeoAiHumanPlaceFields(pin.layerHit.properties),
        });
      } else {
        stageGeoAiInspectCard({
          title: 'Location',
          rows: [
            { label: 'Longitude', value: pin.coords[0].toFixed(6) },
            { label: 'Latitude', value: pin.coords[1].toFixed(6) },
          ],
          lng: pin.coords[0],
          lat: pin.coords[1],
        });
      }
    },
    [customLayers, is3DView, stageGeoAiInspectCard],
  );

  useEffect(() => {
    if (!geoAiInspectCard) {
      geoAiReverseGeocodeKeyRef.current = '';
      return;
    }
    const coordKey = `${geoAiInspectCard.lng},${geoAiInspectCard.lat}`;
    const tokenSig = mapboxToken?.trim() ? 'mb' : 'osm';
    const dedupeKey = `${coordKey}|${tokenSig}`;
    if (geoAiReverseGeocodeKeyRef.current === dedupeKey) return;

    const hasStrongCountry =
      Boolean(geoAiInspectCard.country?.trim()) && !/^\d+$/.test(String(geoAiInspectCard.country).trim());
    const hasArea = Boolean(geoAiInspectCard.areaName?.trim());
    if (hasStrongCountry && hasArea) {
      geoAiReverseGeocodeKeyRef.current = dedupeKey;
      return;
    }

    geoAiReverseGeocodeKeyRef.current = dedupeKey;
    let cancelled = false;
    void (async () => {
      const rev = await reverseLngLatForGeoAiDetails(geoAiInspectCard.lng, geoAiInspectCard.lat, mapboxToken);
      if (cancelled) return;
      setGeoAiInspectCard(prev => {
        if (!prev || `${prev.lng},${prev.lat}` !== coordKey) return prev;
        const nextArea = prev.areaName?.trim() || rev.area;
        const nextCountry =
          prev.country && !/^\d+$/.test(String(prev.country).trim())
            ? prev.country
            : rev.country || prev.country;
        if (nextArea === prev.areaName && nextCountry === prev.country) return prev;
        return { ...prev, areaName: nextArea, country: nextCountry };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [geoAiInspectCard, mapboxToken]);

  const sendGeoExplorerChat = useCallback((voiceOverrideText?: string) => {
    const trimmed = (voiceOverrideText ?? geoExplorerDraft).trim();
    if (geoExplorerInFlightRef.current) return;
    if (!trimmed && !geoExplorerPendingImage) return;
    if (trimmed) geoAiLastUserMapQueryRef.current = trimmed;
    const apiKey = geminiApiKey.trim();
    if (!apiKey) {
      setGeoExplorerChatError(
        'Add a Gemini API key: System Settings â†’ API Tokens â†’ Gemini API (saved in this browser), or set VITE_GEMINI_API_KEY at build time. Never commit keys to Git.'
      );
      return;
    }

    const userParts: GeoExplorerPart[] = [];
    if (trimmed) userParts.push({ type: 'text', text: trimmed });
    if (geoExplorerPendingImage) {
      userParts.push({
        type: 'image',
        mime: geoExplorerPendingImage.mime,
        base64: geoExplorerPendingImage.base64,
      });
    }
    if (userParts.length === 0) return;

    const userId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `geo-${Date.now()}`;
    const userMsg: GeoExplorerMessage = { id: userId, role: 'user', parts: userParts };
    const userTextForMapFallback = trimmed;

    const composerHadPendingImage = !!geoExplorerPendingImage;
    setGeoExplorerDraft('');
    setGeoExplorerPendingImage(null);
    setGeoExplorerChatError('');
    geoExplorerInFlightRef.current = true;
    setGeoExplorerBusy(true);
    setGeoExplorerAwaitKind('send');

    setGeoExplorerMessages(prev => {
      const historyWithUser = [...prev, userMsg];
      queueMicrotask(() =>
        void runSatelliteGeoExplorerGeminiPipeline({
          historyWithUser,
          userTextForMapFallback,
          coordsSourceMessages: prev,
          skipLocalStatsBecausePendingImage: composerHadPendingImage,
          questionEditInPlace: false,
        }),
      );
      return historyWithUser;
    });
  }, [
    geminiApiKey,
    geoExplorerDraft,
    geoExplorerPendingImage,
    runSatelliteGeoExplorerGeminiPipeline,
  ]);

  const onSiGeoAiTableMapAction = useCallback(
    (action: 'zoom' | 'highlight' | 'focus' | 'openTable', link: GeoExplorerMapLink) => {
      let lng: number;
      let lat: number;
      let title = 'Selected feature';
      let featureInspect: GeoAiInspectCardState | null = null;
      if (link.type === 'feature') {
        const ll = lngLatFromGeoAiFeatureLink(link, customLayers);
        if (!ll) return;
        [lng, lat] = ll;
        const resolved = resolveGeoAiFeatureFromLink(link, customLayers);
        if (resolved) {
          const clean = siSanitizeIdentifyProperties(resolved.properties);
          title = resolved.layerName;
          const lyrCfg = customLayers.find(l => String(l.id) === link.layerId);
          const built = buildGeoAiInspectCardContent({
            properties: clean,
            arcgisLayerDefinition: resolved.arcgisLayerDefinition,
            popupConfig: lyrCfg?.popupConfig,
            queryContext: geoAiLastUserMapQueryRef.current,
            inspectCoords: { lng, lat },
          });
          featureInspect = {
            title,
            rows: built.rows,
            inspect: built.inspect,
            lng,
            lat,
            ...pickGeoAiHumanPlaceFields(clean),
          };
        }
      } else {
        lng = link.lng;
        lat = link.lat;
        if (link.layerName) title = link.layerName;
      }
      const zTarget = Math.max(
        geoExplorerTargetZoomForPinSource('layer'),
        action === 'highlight' ? 14 : 17,
      );
      const moveCamera = action === 'zoom' || !geoAiExplorationMode;
      if (moveCamera) {
        setGeoAiPinLngLat([lng, lat]);
        setViewState(vs => ({
          ...vs,
          longitude: lng,
          latitude: lat,
          zoom: Math.max(typeof vs.zoom === 'number' ? vs.zoom : 2, zTarget),
          pitch: is3DView ? Math.max(typeof vs.pitch === 'number' ? vs.pitch : 0, 42) : vs.pitch ?? 0,
          bearing: typeof vs.bearing === 'number' ? vs.bearing : 0,
        }));
      } else {
        setGeoAiPinLngLat([lng, lat]);
      }
      if (action === 'focus' || action === 'openTable' || action === 'highlight' || link.type === 'feature') {
        if (featureInspect) {
          mergeGeoAiInspectFromMapOrTable(featureInspect, link);
        } else {
          mergeGeoAiInspectFromMapOrTable(
            {
              title,
              rows: [
                { label: 'Longitude', value: lng.toFixed(6) },
                { label: 'Latitude', value: lat.toFixed(6) },
              ],
              lng,
              lat,
            },
            link,
          );
        }
      } else if (link.type === 'coords' && link.layerName) {
        mergeGeoAiInspectFromMapOrTable(
          {
            title: link.layerName,
            rows: [
              { label: 'Longitude', value: lng.toFixed(6) },
              { label: 'Latitude', value: lat.toFixed(6) },
            ],
            lng,
            lat,
          },
          link,
        );
      }
    },
    [customLayers, geoAiExplorationMode, is3DView, mergeGeoAiInspectFromMapOrTable],
  );

  /** Fit map to union bounds of Geo AI query hits (multi-feature selection). */
  const applySatelliteGeoAiMapSelectionSync = useCallback(
    (selections: GeoAiMapFirstSelection[], opts?: { fitBounds?: boolean }) => {
      const fitBounds = opts?.fitBounds !== false;
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      if (!map || !selections.length) return;
      const feats: Array<{ type?: string; geometry?: unknown; properties?: unknown }> = [];
      for (const s of selections) {
        const layer = customLayers.find(l => String(l.id) === s.layerId);
        const g = layer?.geojson;
        const arr = g?.features;
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
          const f = arr[i] as { geometry?: unknown; properties?: unknown };
          if (computeStableGisFeatureKey(f, i) === s.featureKey) {
            feats.push(f);
            break;
          }
        }
      }
      if (!feats.length) return;
      if (!fitBounds) return;
      const fc = { type: 'FeatureCollection' as const, features: feats };
      const bounds = getGeoJsonBounds(fc as any);
      if (bounds && typeof map.fitBounds === 'function') {
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: 56, duration: 750, maxZoom: 17 },
        );
      }
    },
    [customLayers],
  );

  const onGeoAiTableBatchZoom = useCallback(
    (links: GeoExplorerMapLink[]) => {
      const featureLinks = links.filter(
        (l): l is Extract<GeoExplorerMapLink, { type: 'feature' }> => l.type === 'feature',
      );
      if (!featureLinks.length) return;
      applySatelliteGeoAiMapSelectionSync(
        featureLinks.map(l => ({ layerId: l.layerId, featureKey: l.featureKey })),
        { fitBounds: true },
      );
    },
    [applySatelliteGeoAiMapSelectionSync],
  );

  const applySatelliteGeoAiMapFirstSync = useCallback(
    (selections: GeoAiMapFirstSelection[]) => {
      if (!selections.length) return;
      applySatelliteGeoAiMapSelectionSync(selections, { fitBounds: !geoAiExplorationMode });
      const first = selections[0]!;
      onSiGeoAiTableMapAction('highlight', {
        type: 'feature',
        layerId: first.layerId,
        featureKey: first.featureKey,
      });
    },
    [applySatelliteGeoAiMapSelectionSync, geoAiExplorationMode, onSiGeoAiTableMapAction],
  );

  const gisSelectionSetModeRef = useRef<GisSelectionSetMode>('new');
  gisSelectionSetModeRef.current = gisSelectionSetMode;

  const gisSelectionLayerSources = useMemo<GisSelectionLayerSource[]>(() => {
    const sources: GisSelectionLayerSource[] = customLayers.map(l => ({
      id: String(l.id),
      name: l.name,
      geojson: l.geojson as GisSelectionLayerSource['geojson'],
    }));
    if (aoiFields.length) {
      sources.push({
        id: '__aoi_fields__',
        name: 'AOI Fields',
        geojson: siAoiFieldsToFeatureCollection(aoiFields) as GisSelectionLayerSource['geojson'],
      });
    }
    if (multiAoiItems.length) {
      sources.push({
        id: '__multi_aoi__',
        name: 'Multi AOI',
        geojson: {
          features: multiAoiItems.map(row => ({
            ...row.feature,
            properties: {
              ...(row.feature.properties || {}),
              aoiId: row.id,
              aoiName: row.name,
            },
          })),
        },
      });
    }
    if (drawnGeometry) {
      sources.push({
        id: '__drawn_aoi__',
        name: 'Drawn AOI',
        geojson: {
          features: [{ type: 'Feature', properties: { name: 'Drawn AOI' }, geometry: drawnGeometry }],
        },
      });
    }
    return sources;
  }, [customLayers, aoiFields, multiAoiItems, drawnGeometry]);

  useEffect(() => {
    if (!gisSelectionActive) return;
    if (!gisSelectableLayerIds.size && gisSelectionLayerSources.length) {
      setGisSelectableLayerIds(new Set(gisSelectionLayerSources.map(l => String(l.id))));
    }
  }, [gisSelectionLayerSources, gisSelectableLayerIds.size, gisSelectionActive]);

  useEffect(() => {
    if (!gisSelectionActive) return;
    const toolMap: Record<GisSelectionTool, MapDrawTool> = {
      select: 'select',
      rectangle: 'box_select',
      polygon: 'polygon',
      lasso: 'lasso',
      circle: 'circle',
      line: 'polyline',
      trace: 'polyline',
    };
    applyMapDrawTool(toolMap[gisSelectionTool]);
  }, [gisSelectionActive, gisSelectionTool]);

  const applyGisSelectionHits = useCallback(
    (incoming: GisSelectionHit[], opts?: { fitBounds?: boolean; mode?: GisSelectionSetMode }) => {
      const mode = opts?.mode ?? gisSelectionSetMode;
      if (!incoming.length && mode !== 'new') return;
      const merged = mergeSelectionHits(gisSelectionHits, incoming, mode);
      setGisSelectionHits(merged);
      const selections = merged.map(h => ({ layerId: h.layerId, featureKey: h.featureKey }));
      onGeoAiTableSelectionSync('gis-selection', selections.map(s => ({ type: 'feature' as const, ...s })));
      applySatelliteGeoAiMapSelectionSync(selections, {
        fitBounds: opts?.fitBounds ?? (merged.length <= 12 && mode === 'new'),
      });
    },
    [
      applySatelliteGeoAiMapSelectionSync,
      gisSelectionHits,
      gisSelectionSetMode,
      onGeoAiTableSelectionSync,
    ],
  );

  const applyGisFeatureSelectionFromGeometries = useCallback(
    (geometries: GeoJSON.Geometry[]) => {
      if (!geometries.length) return;
      const incoming = selectFeaturesByMask(
        gisSelectionLayerSources,
        gisSelectableLayerIds,
        geometries as Array<{ type?: string; coordinates?: unknown }>,
        'intersects',
      );
      applyGisSelectionHits(incoming);
    },
    [applyGisSelectionHits, gisSelectableLayerIds, gisSelectionLayerSources],
  );

  const exportGisSelectionGeoJson = useCallback(() => {
    const features: GeoJSON.Feature[] = [];
    for (const hit of gisSelectionHits) {
      const layer = customLayers.find(l => String(l.id) === hit.layerId);
      const arr = layer?.geojson?.features;
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i] as GeoJSON.Feature;
        if (computeStableGisFeatureKey(f, i) === hit.featureKey) {
          features.push(f);
          break;
        }
      }
    }
    downloadTextFile(
      'selected-features.geojson',
      JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
    );
  }, [customLayers, gisSelectionHits]);

  const zoomToGisSelection = useCallback(() => {
    applySatelliteGeoAiMapSelectionSync(
      gisSelectionHits.map(h => ({ layerId: h.layerId, featureKey: h.featureKey })),
      { fitBounds: true },
    );
  }, [applySatelliteGeoAiMapSelectionSync, gisSelectionHits]);

  const syncGisSelectionMapHighlight = useCallback(
    (links: GeoExplorerMapLink[]) => {
      onGeoAiTableSelectionSync('gis-selection', links);
      const featureLinks = links.filter(
        (l): l is Extract<GeoExplorerMapLink, { type: 'feature' }> => l.type === 'feature',
      );
      applySatelliteGeoAiMapSelectionSync(
        featureLinks.map(l => ({ layerId: l.layerId, featureKey: l.featureKey })),
        { fitBounds: false },
      );
    },
    [applySatelliteGeoAiMapSelectionSync, onGeoAiTableSelectionSync],
  );

  const applyGisFeatureSelectionRef = useRef(applyGisFeatureSelectionFromGeometries);
  applyGisFeatureSelectionRef.current = applyGisFeatureSelectionFromGeometries;

  const gisSelectionLayerSourcesRef = useRef(gisSelectionLayerSources);
  gisSelectionLayerSourcesRef.current = gisSelectionLayerSources;

  const clearGisSelection = useCallback(() => {
    setGisSelectionHits([]);
    setGisSelectionOverlapState(null);
    gisSelectionOverlapRef.current = null;
    onGeoAiTableSelectionSync('gis-selection', []);
    applySatelliteGeoAiMapSelectionSync([], { fitBounds: false });
  }, [applySatelliteGeoAiMapSelectionSync, onGeoAiTableSelectionSync]);

  const sendGeoAiChat = useCallback((voiceOverrideText?: string) => {
    const trimmed = (voiceOverrideText ?? geoAiDraft).trim();
    if (geoAiInFlightRef.current || !trimmed) return;
    geoAiLastUserMapQueryRef.current = trimmed;
    const apiKey = claudeApiKey.trim();
    if (!apiKey) {
      setGeoAiChatError(
        'Add a Claude API key: System Settings â†’ API Tokens â†’ Claude API (Anthropic), or set VITE_CLAUDE_API_KEY at build time. Never commit keys to Git.',
      );
      return;
    }

    const userId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `gaic-${Date.now()}`;

    setGeoAiDraft('');
    setGeoAiChatError('');
    geoAiInFlightRef.current = true;
    setGeoAiBusy(true);

    const userMsg: GeoExplorerMessage = { id: userId, role: 'user', parts: [{ type: 'text', text: trimmed }] };
    const historyWithUser = [...geoAiChatMessagesRef.current, userMsg];
    setGeoAiChatMessages(prev => [...prev, userMsg]);
    queueMicrotask(async () => {
        try {
          const savedLayersForStats = await loadGisMapSavedLayers();
          const mergedLayersForStats: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedLayersForStats.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const localStats = runGeoAiStatsCommand(trimmed, mergedLayersForStats);
          if (localStats?.handled) {
            const aid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `gaic-s-${Date.now()}`;
            const parts: GeoExplorerPart[] = [{ type: 'text', text: localStats.reply }];
            if (localStats.table) parts.push({ type: 'dataTable', table: localStats.table });
            setGeoAiChatMessages(h => [...h, { id: aid, role: 'model', parts }]);
            if (localStats.mapFirstSync?.selections?.length) {
              queueMicrotask(() => applySatelliteGeoAiMapFirstSync(localStats.mapFirstSync!.selections));
            }
            return;
          }
          const dataCtx = await buildGeoAiDataContext(undefined, {
            satelliteLayers: satelliteCustomLayersToGeoAiLayers(customLayers),
          });
          const prior = historyWithUser.slice(0, -1);
          const savedLayers = await loadGisMapSavedLayers();
          const mergedGeoAiLayers: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedLayers.map(l => ({
              name: l.name,
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const weatherAppend = await buildGeoAiFullWeatherSessionAppend({
            userText: trimmed,
            pinLngLat: geoAiPinLngLat,
            lastMapQueryCoords: lastMapQueryCoordsFromSimpleChatHistory(prior),
            inspectAnchorLngLat:
              geoAiInspectCard != null ? ([geoAiInspectCard.lng, geoAiInspectCard.lat] as [number, number]) : null,
            combinedLayers: mergedGeoAiLayers,
            mapboxAccessToken: mapboxToken || undefined,
            openWeatherApiKey,
            mapPopup: null,
          });
          const liveMapBlock = geoAiLiveMapStateBlockRef.current
            ? `\n\n---\n${geoAiLiveMapStateBlockRef.current}`
            : '';
          const system = `${GEO_AI_CHAT_SYSTEM_BASE}\n\n---\n## Geo AI Copilot mission\n${GEO_AI_COPILOT_RULES}${weatherAppend}${liveMapBlock}\n\n---\nDATA CONTEXT (authoritative for this session turn):\n${dataCtx}`;
          const turns: GeoAiChatTurn[] = prior.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            text: m.parts
              .filter((p): p is Extract<GeoExplorerPart, { type: 'text' }> => p.type === 'text')
              .map(p => p.text)
              .join('\n'),
          }));
          const reply = await claudeGeoAiComplete({
            apiKey,
            system,
            turns,
            userMessage: trimmed,
          });
          const aid =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `gaic-m-${Date.now()}`;
          setGeoAiChatMessages(h => [...h, { id: aid, role: 'model', parts: [{ type: 'text', text: reply }] }]);
          await applySatelliteGeoAiMapUi(trimmed, reply);
          runGeoAiMapCommandsRef.current?.(reply);
        } catch (e) {
          setGeoAiChatError(e instanceof Error ? e.message : String(e));
        } finally {
          geoAiInFlightRef.current = false;
          setGeoAiBusy(false);
        }
      });
  }, [
    claudeApiKey,
    geoAiDraft,
    applySatelliteGeoAiMapUi,
    applySatelliteGeoAiMapFirstSync,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
  ]);

  const sendGeoDeepseekChat = useCallback((voiceOverrideText?: string) => {
    const trimmed = (voiceOverrideText ?? geoDeepseekDraft).trim();
    if (geoDeepseekInFlightRef.current || !trimmed) return;
    geoAiLastUserMapQueryRef.current = trimmed;
    const apiKey = deepseekApiKey.trim();
    if (!apiKey) {
      setGeoDeepseekChatError(
        'Add a DeepSeek API key: System Settings â†’ API Tokens â†’ DeepSeek, or set VITE_DEEPSEEK_API_KEY at build time. Never commit keys to Git.',
      );
      return;
    }

    const userId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `gds-${Date.now()}`;

    setGeoDeepseekDraft('');
    setGeoDeepseekChatError('');
    geoDeepseekInFlightRef.current = true;
    setGeoDeepseekBusy(true);

    const userMsg: GeoExplorerMessage = { id: userId, role: 'user', parts: [{ type: 'text', text: trimmed }] };
    const historyWithUser = [...geoDeepseekChatMessagesRef.current, userMsg];
    setGeoDeepseekChatMessages(prev => [...prev, userMsg]);
    queueMicrotask(async () => {
        try {
          const savedLayersForStats = await loadGisMapSavedLayers();
          const mergedLayersForStats: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedLayersForStats.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const localStats = runGeoAiStatsCommand(trimmed, mergedLayersForStats);
          if (localStats?.handled) {
            const aid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `gds-s-${Date.now()}`;
            const parts: GeoExplorerPart[] = [{ type: 'text', text: localStats.reply }];
            if (localStats.table) parts.push({ type: 'dataTable', table: localStats.table });
            setGeoDeepseekChatMessages(h => [...h, { id: aid, role: 'model', parts }]);
            if (localStats.mapFirstSync?.selections?.length) {
              queueMicrotask(() => applySatelliteGeoAiMapFirstSync(localStats.mapFirstSync!.selections));
            }
            return;
          }
          const dataCtx = await buildGeoAiDataContext(undefined, {
            satelliteLayers: satelliteCustomLayersToGeoAiLayers(customLayers),
          });
          const prior = historyWithUser.slice(0, -1);
          const savedDs = await loadGisMapSavedLayers();
          const mergedDsLayers: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedDs.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const weatherAppendDs = await buildGeoAiFullWeatherSessionAppend({
            userText: trimmed,
            pinLngLat: geoAiPinLngLat,
            lastMapQueryCoords: lastMapQueryCoordsFromSimpleChatHistory(prior),
            inspectAnchorLngLat:
              geoAiInspectCard != null ? ([geoAiInspectCard.lng, geoAiInspectCard.lat] as [number, number]) : null,
            combinedLayers: mergedDsLayers,
            mapboxAccessToken: mapboxToken || undefined,
            openWeatherApiKey,
            mapPopup: null,
          });
          const liveMapBlockDs = geoAiLiveMapStateBlockRef.current
            ? `\n\n---\n${geoAiLiveMapStateBlockRef.current}`
            : '';
          const system = `${GEO_AI_CHAT_SYSTEM_BASE}\n\n---\n## Geo AI Copilot mission\n${GEO_AI_COPILOT_RULES}${weatherAppendDs}${liveMapBlockDs}\n\n---\nDATA CONTEXT (authoritative for this session turn):\n${dataCtx}`;
          const turns: GeoAiChatTurn[] = prior.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            text: m.parts
              .filter((p): p is Extract<GeoExplorerPart, { type: 'text' }> => p.type === 'text')
              .map(p => p.text)
              .join('\n'),
          }));
          const reply = await agroChatWithDeepSeek({
            apiKey,
            system,
            turns,
            userMessage: trimmed,
          });
          const aid =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `gds-m-${Date.now()}`;
          setGeoDeepseekChatMessages(h => [...h, { id: aid, role: 'model', parts: [{ type: 'text', text: reply }] }]);
          await applySatelliteGeoAiMapUi(trimmed, reply);
          runGeoAiMapCommandsRef.current?.(reply);
        } catch (e) {
          setGeoDeepseekChatError(e instanceof Error ? e.message : String(e));
        } finally {
          geoDeepseekInFlightRef.current = false;
          setGeoDeepseekBusy(false);
        }
      });
  }, [
    deepseekApiKey,
    geoDeepseekDraft,
    applySatelliteGeoAiMapUi,
    applySatelliteGeoAiMapFirstSync,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
  ]);

  const sendGeoOllamaChat = useCallback((voiceOverrideText?: string) => {
    const trimmed = (voiceOverrideText ?? geoOllamaDraft).trim();
    if (geoOllamaInFlightRef.current || !trimmed) return;
    geoAiLastUserMapQueryRef.current = trimmed;
    const baseUrl = ollamaConfig.baseUrl.trim();
    const model = ollamaConfig.model.trim();
    if (!baseUrl) {
      setGeoOllamaChatError(
        'Set the Ollama server URL: System Settings â†’ API Tokens â†’ Ollama (default http://localhost:11434), or VITE_OLLAMA_BASE_URL. Run "ollama serve" and pull a model first.',
      );
      return;
    }

    const userId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `goll-${Date.now()}`;

    setGeoOllamaDraft('');
    setGeoOllamaChatError('');
    geoOllamaInFlightRef.current = true;
    setGeoOllamaBusy(true);

    const userMsg: GeoExplorerMessage = { id: userId, role: 'user', parts: [{ type: 'text', text: trimmed }] };
    const historyWithUser = [...geoOllamaChatMessagesRef.current, userMsg];
    // Pure state update (no side effects in the updater â†’ safe under StrictMode).
    setGeoOllamaChatMessages(prev => [...prev, userMsg]);
    queueMicrotask(async () => {
        try {
          const savedLayersForStats = await loadGisMapSavedLayers();
          const mergedLayersForStats: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedLayersForStats.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const localStats = runGeoAiStatsCommand(trimmed, mergedLayersForStats);
          if (localStats?.handled) {
            const aid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `goll-s-${Date.now()}`;
            const parts: GeoExplorerPart[] = [{ type: 'text', text: localStats.reply }];
            if (localStats.table) parts.push({ type: 'dataTable', table: localStats.table });
            setGeoOllamaChatMessages(h => [...h, { id: aid, role: 'model', parts }]);
            if (localStats.mapFirstSync?.selections?.length) {
              queueMicrotask(() => applySatelliteGeoAiMapFirstSync(localStats.mapFirstSync!.selections));
            }
            return;
          }
          const dataCtx = await buildGeoAiDataContext(undefined, {
            satelliteLayers: satelliteCustomLayersToGeoAiLayers(customLayers),
          });
          const prior = historyWithUser.slice(0, -1);
          const savedOll = await loadGisMapSavedLayers();
          const mergedOllLayers: GeoAiMapLayer[] = [
            ...satelliteCustomLayersToGeoAiLayers(customLayers),
            ...savedOll.map(l => ({
              name: l.name,
              clientLayerId: String(l.id),
              visible: l.visible,
              source: l.source,
              data: l.data,
              arcgisLayerDefinition: (l as { arcgisLayerDefinition?: GeoAiMapLayer['arcgisLayerDefinition'] })
                .arcgisLayerDefinition,
            })),
          ];
          const weatherAppendOll = await buildGeoAiFullWeatherSessionAppend({
            userText: trimmed,
            pinLngLat: geoAiPinLngLat,
            lastMapQueryCoords: lastMapQueryCoordsFromSimpleChatHistory(prior),
            inspectAnchorLngLat:
              geoAiInspectCard != null ? ([geoAiInspectCard.lng, geoAiInspectCard.lat] as [number, number]) : null,
            combinedLayers: mergedOllLayers,
            mapboxAccessToken: mapboxToken || undefined,
            openWeatherApiKey,
            mapPopup: null,
          });
          const liveMapBlockOll = geoAiLiveMapStateBlockRef.current
            ? `\n\n---\n${geoAiLiveMapStateBlockRef.current}`
            : '';
          const system = `${GEO_AI_CHAT_SYSTEM_BASE}\n\n---\n## Geo AI Copilot mission\n${GEO_AI_COPILOT_RULES}${weatherAppendOll}${liveMapBlockOll}\n\n---\nDATA CONTEXT (authoritative for this session turn):\n${dataCtx}`;
          const turns: GeoAiChatTurn[] = prior.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            text: m.parts
              .filter((p): p is Extract<GeoExplorerPart, { type: 'text' }> => p.type === 'text')
              .map(p => p.text)
              .join('\n'),
          }));
          // Try local Ollama first (streamed token-by-token for a fast-feeling
          // reply); on failure, automatically fall back to a cloud provider whose
          // key is configured (DeepSeek â†’ Gemini) so the chat keeps working even
          // when the daemon is down / not installed.
          const aid =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `goll-m-${Date.now()}`;
          // Pre-create the assistant bubble so streamed tokens render into it.
          setGeoOllamaChatMessages(h => [...h, { id: aid, role: 'model', parts: [{ type: 'text', text: '' }] }]);
          const setAssistantText = (text: string) =>
            setGeoOllamaChatMessages(h =>
              h.map(m => (m.id === aid ? { ...m, parts: [{ type: 'text', text }] } : m)),
            );

          let reply: string;
          try {
            let streamed = '';
            reply = await agroChatWithOllamaStream({
              baseUrl,
              model,
              system,
              turns,
              userMessage: trimmed,
              onToken: delta => {
                if (!streamed) setGeoOllamaBusy(false); // first token â†’ drop the "Thinkingâ€¦" indicator
                streamed += delta;
                setAssistantText(streamed);
              },
            });
            setAssistantText(reply);
          } catch (ollamaErr) {
            const ollamaMsg = ollamaErr instanceof Error ? ollamaErr.message : 'unreachable';
            const dsKey = deepseekApiKey.trim();
            const gemKey = geminiApiKey.trim();
            setAssistantText(''); // discard any partial Ollama output before the fallback answer
            if (dsKey) {
              const fb = await agroChatWithDeepSeek({ apiKey: dsKey, system, turns, userMessage: trimmed });
              reply = `> âš ï¸ Ollama unavailable (${ollamaMsg}). Answered with DeepSeek fallback.\n\n${fb}`;
            } else if (gemKey) {
              const fb = await agroChatWithGemini({ apiKey: gemKey, systemInstruction: system, turns, userMessage: trimmed });
              reply = `> âš ï¸ Ollama unavailable (${ollamaMsg}). Answered with Gemini fallback.\n\n${fb}`;
            } else {
              setGeoOllamaChatMessages(h => h.filter(m => m.id !== aid)); // remove the empty bubble
              throw new Error(
                `${ollamaMsg}. No fallback provider configured â€” add a DeepSeek or Gemini key in System Settings â†’ API Tokens to keep chatting when Ollama is offline.`,
              );
            }
            setAssistantText(reply);
          }
          await applySatelliteGeoAiMapUi(trimmed, reply);
          runGeoAiMapCommandsRef.current?.(reply);
        } catch (e) {
          setGeoOllamaChatError(e instanceof Error ? e.message : String(e));
        } finally {
          geoOllamaInFlightRef.current = false;
          setGeoOllamaBusy(false);
        }
      });
  }, [
    ollamaConfig,
    geoOllamaDraft,
    applySatelliteGeoAiMapUi,
    applySatelliteGeoAiMapFirstSync,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
    deepseekApiKey,
    geminiApiKey,
  ]);

  const onGeoExplorerAttachChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setGeoExplorerChatError('Please attach an image file (PNG, JPEG, WebP, â€¦).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const i = dataUrl.indexOf(',');
      const base64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
      setGeoExplorerPendingImage({ mime: file.type || 'image/jpeg', base64 });
      setGeoExplorerChatError('');
    };
    reader.onerror = () => setGeoExplorerChatError('Could not read the image file.');
    reader.readAsDataURL(file);
  }, []);

  const setMapDragPanEnabled = (enabled: boolean) => {
    setMapPanLocked(!enabled);
    setMapboxDragPanEnabled(getMapInstance(), enabled);
  };

  const toggleMapPanLock = useCallback(() => {
    setMapDragPanEnabled(mapPanLocked);
  }, [mapPanLocked]);

  const endPolygonSketchDrag = useCallback(() => {
    if (polygonRingSketchDragRef.current === null) return;
    polygonRingSketchDragRef.current = null;
    circleRefineLastMoveRef.current = null;
    setMapDragPanEnabled(true);
    skipNextMapClickRef.current = true;
  }, []);

  const collectAoiFieldSnapVertices = (): [number, number][] => {
    const out: [number, number][] = [];
    const aoi = drawnGeometryRef.current;
    if (aoi?.geometry) {
      for (const v of collectVertexRefs(aoi.geometry)) out.push(v.coord);
    }
    for (const f of aoiFieldsRef.current) {
      for (const v of collectVertexRefs(f.geometry)) out.push(v.coord);
    }
    return out;
  };

  const tryAddFieldFromFeature = (feature: any, opts?: { silent?: boolean }): boolean => {
    const aoi = drawnGeometryRef.current;
    if (!aoi?.geometry) {
      if (!opts?.silent) setFieldAnalysisStatus('Draw an AOI first, then add fields inside it.');
      return false;
    }
    const g = feature?.geometry;
    if (g?.type !== 'Polygon' && g?.type !== 'MultiPolygon') {
      if (!opts?.silent) setFieldAnalysisStatus('Fields must be polygon or multipolygon geometries.');
      return false;
    }
    if (!fieldGeometryWithinAoi(aoi.geometry, g)) {
      if (!opts?.silent) setFieldAnalysisStatus('Field geometry must stay inside the AOI.');
      return false;
    }
    let created: SiAoiFieldRecord | null = null;
    setAoiFields(prev => {
      if (aoiFieldNoOverlapRef.current) {
        for (const ex of prev) {
          if (fieldGeometriesRoughOverlap(ex.geometry, g)) {
            return prev;
          }
        }
      }
      const rec = buildSiAoiFieldRecord(g, `Field ${prev.length + 1}`, prev.length);
      created = rec;
      const next = [...prev, rec];
      aoiFieldsRef.current = next;
      return next;
    });
    if (!created) {
      if (!opts?.silent) {
        setFieldAnalysisStatus('Overlap with an existing field â€” adjust or turn off â€œno overlapâ€.');
      }
      return false;
    }
    setSelectedFieldId(created.id);
    if (!opts?.silent) {
      setFieldAnalysisStatus(`Added ${created.name} (${created.areaHa.toFixed(2)} ha).`);
    }
    return true;
  };

  const commitUserGeometry = (next: any | null) => {
    if (mapDrawOwnerRef.current === 'crop-classification') {
      const cur = cropClassAoiGeometryRef.current;
      setGeomUndoStack(u => [...u, cur ? cloneDeep(cur) : null]);
      setGeomRedoStack([]);
      cropClassAoiGeometryRef.current = next;
      setCropClassAoiGeometry(next);
      if (next) {
        setCropClassificationSettings(prev => ({
          ...prev,
          statusMessage: 'Study AOI saved on classification layer.',
          analysisStep: prev.analysisStep < 2 ? 2 : prev.analysisStep,
        }));
      } else {
        setCropClassificationSettings(prev => ({
          ...prev,
          statusMessage: 'Study AOI cleared.',
        }));
      }
      return;
    }
    if (next && drawTargetModeRef.current === 'field') {
      tryAddFieldFromFeature(next);
      return;
    }
    if (next && drawTargetModeRef.current === 'aoi') {
      setAoiFields([]);
      setSelectedFieldId(null);
      if (hasActiveLayerSourceAoiRef.current) {
        setFieldAnalysisStatus(
          'Preview zone saved â€” charts and spot analysis use this area only; Layer Source mask is unchanged.',
        );
      } else {
        registerMultiAoiWorkspace(next, `Drawn AOI ${multiAoiItems.length + 1}`, 'drawn', { setActiveFirst: true });
      }
    }
    const cur = activeDrawGeomRef().current;
    setGeomUndoStack(u => [...u, cur ? cloneDeep(cur) : null]);
    setGeomRedoStack([]);
    if (next) updateDrawnStats(next);
    else {
      if (mapDrawOwnerRef.current === 'crop-classification') {
        setCropClassAoiGeometry(null);
      } else {
        setDrawnGeometry(null);
        setDrawnStats(null);
      }
    }
  };

  const undoGeometry = () => {
    setGeomUndoStack(prev => {
      if (!prev.length) return prev;
      const before = prev[prev.length - 1];
      const cur = activeDrawGeomRef().current;
      setGeomRedoStack(r => [...r, cur ? cloneDeep(cur) : null]);
      if (before) updateDrawnStats(before);
      else {
        updateDrawnStats(null);
      }
      return prev.slice(0, -1);
    });
  };

  const redoGeometry = () => {
    setGeomRedoStack(prev => {
      if (!prev.length) return prev;
      const next = prev[prev.length - 1];
      const cur = activeDrawGeomRef().current;
      setGeomUndoStack(u => [...u, cur ? cloneDeep(cur) : null]);
      if (next) updateDrawnStats(next);
      else {
        updateDrawnStats(null);
      }
      return prev.slice(0, -1);
    });
  };

  const finalizeRectOrCircleDrag = (clientX: number, clientY: number) => {
    const map = getMapInstance();
    const spec = dragRectCircleRef.current;
    dragRectCircleRef.current = null;
    setRectCirclePreview(null);
    if (!map || !spec) {
      setMapDragPanEnabled(true);
      return;
    }
    const end = clientPointToLngLat(map, clientX, clientY);
    if (!end) {
      setMapDragPanEnabled(true);
      return;
    }
    const [lng1, lat1] = spec.start;
    const [lng2, lat2] = end;
    if (Math.hypot(lng2 - lng1, lat2 - lat1) < 1e-7) {
      setMapDragPanEnabled(true);
      return;
    }
    if (spec.kind === 'circle') {
      setCircleRadiusM(null);
      setCircleRefineDraft(null);
      setCircleRefineActiveHandle(null);
      setMapDragPanEnabled(true);
      const feature = circleFromEdgeFeature(lng1, lat1, lng2, lat2, 128, 'Drawn circle');
      if (gisSelectionActiveRef.current) {
        applyGisFeatureSelectionFromGeometries([feature.geometry as GeoJSON.Geometry]);
        skipNextMapClickRef.current = true;
        return;
      }
      commitUserGeometry(feature);
      setMapDrawTool('select');
      skipNextMapClickRef.current = true;
      return;
    }
    setCircleRadiusM(null);
    setMapDragPanEnabled(true);
    const feature = bboxToPolygonFeature(
      lng1,
      lat1,
      lng2,
      lat2,
      spec.kind === 'box_select' ? 'Box AOI' : 'Drawn rectangle',
    );
    if (gisSelectionActiveRef.current) {
      applyGisFeatureSelectionFromGeometries([feature.geometry as GeoJSON.Geometry]);
      skipNextMapClickRef.current = true;
      return;
    }
    commitUserGeometry(feature);
    setMapDrawTool('select');
    skipNextMapClickRef.current = true;
  };

  const endEditDragIfNeeded = () => {
    if (fieldEditDragRef.current) {
      fieldEditDragRef.current = null;
      setMapDragPanEnabled(true);
      const snap = preFieldEditSnapshotRef.current;
      preFieldEditSnapshotRef.current = null;
      if (snap) {
        const aoi = drawnGeometryRef.current;
        const cur = aoiFieldsRef.current.find(x => x.id === snap.id);
        if (cur && aoi?.geometry && !fieldGeometryWithinAoi(aoi.geometry, cur.geometry)) {
          setAoiFields(prev => {
            const next = prev.map(x =>
              x.id === snap.id ? { ...snap, ...computeSiAoiFieldMetrics(snap.geometry) } : x,
            );
            aoiFieldsRef.current = next;
            return next;
          });
          setFieldAnalysisStatus('Edit reverted: field must stay inside the AOI.');
        }
      }
      return;
    }
    if (!editDragRef.current) return;
    editDragRef.current = null;
    setMapDragPanEnabled(true);
    const before = preEditGeomRef.current;
    preEditGeomRef.current = null;
    const after = drawnGeometryRef.current;
    if (before !== null && JSON.stringify(before) !== JSON.stringify(after)) {
      setGeomUndoStack(u => [...u, before]);
      setGeomRedoStack([]);
    }
    recomputeDrawnAoiStats(after);
  };

  const commitUserGeometryRef = useRef(commitUserGeometry);
  commitUserGeometryRef.current = commitUserGeometry;

  const polygonRingRef = useRef(polygonRing);
  polygonRingRef.current = polygonRing;
  circleRefineDraftRef.current = circleRefineDraft;

  const isMapOrbitBlocked = useCallback(() => {
    const tool = mapDrawToolRef.current;
    if (tool === 'polygon' && polygonRingRef.current.length > 0) return true;
    if (tool === 'rectangle' || tool === 'circle' || tool === 'box_select') return true;
    if (tool === 'polyline' && polylineStartRef.current) return true;
    if (tool === 'lasso' || tool === 'freehand' || tool === 'text') return true;
    if (circleRefineDraftRef.current) return true;
    return false;
  }, []);

  const mapOrbitNavigation = useAgroCloudMapOrbitNavigation({
    setViewState,
    getViewState: () => viewStateLiveRef.current,
    getMapInstance,
    isOrbitBlocked: isMapOrbitBlocked,
    onOrbitMoved: () => {
      skipNextMapClickRef.current = true;
    },
    onElevationOrbitEngaged: () => {
      if (!is3DViewRef.current) {
        setIs3DView(true);
        siEnsureGlobeProjection();
      }
    },
    listenGlobalPointerUp: false,
  });

  useEffect(() => {
    if (mapDrawTool !== 'polygon') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const ring = polygonRingRef.current;
      if (ring.length < 3) return;
      e.preventDefault();
      polygonRingSketchDragRef.current = null;
      setMapDragPanEnabled(true);
      const closed = [...ring, ring[0]];
      const feature = {
        type: 'Feature',
        properties: { label: 'Drawn polygon' },
        geometry: { type: 'Polygon', coordinates: [closed] },
      };
      commitUserGeometryRef.current(feature);
      setPolygonRing([]);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
      setMapDrawTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapDrawTool]);

  useLayoutEffect(() => {
    if (mapDrawTool !== 'polygon') return;
    if (polygonRingSketchDragRef.current !== null) return;
    setMapDragPanEnabled(false);
  }, [mapDrawTool, polygonRing.length]);

  useEffect(() => {
    if (mapDrawTool !== 'circle') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      if (e.key !== 'Enter') return;
      const d = circleRefineDraftRef.current;
      if (!d) return;
      e.preventDefault();
      circleRefineInteractionRef.current = null;
      circleRefineLastMoveRef.current = null;
      setCircleRefineActiveHandle(null);
      const feature = circleFromEdgeFeature(d.center[0], d.center[1], d.edge[0], d.edge[1], 128);
      commitUserGeometryRef.current(feature);
      setCircleRefineDraft(null);
      setDrawAssistHint('');
      setMapDrawTool('select');
      setShowEditHandles(false);
      setMapDragPanEnabled(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapDrawTool]);

  const applyMapDrawTool = (tool: MapDrawTool) => {
    dragRectCircleRef.current = null;
    polygonRingSketchDragRef.current = null;
    circleRefineInteractionRef.current = null;
    setRectCirclePreview(null);
    setPointerLngLat(null);
    setPolylineStart(null);
    setPolygonRing([]);
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setCircleRadiusM(null);
    setCircleRefineDraft(null);
    setCircleRefineActiveHandle(null);
    setShowEditHandles(tool === 'select' && !!activeDrawGeomRef().current);
    setMapDrawTool(tool);
    const lockPan =
      tool === 'rectangle' ||
      tool === 'box_select' ||
      tool === 'circle' ||
      tool === 'polygon' ||
      tool === 'polyline';
    setMapDragPanEnabled(!lockPan);
  };

  const createSketchLayerOnMap = useCallback(() => {
    const id = `sketch-${Date.now()}`;
    setCustomLayers(prev => [
      ...prev,
      {
        id,
        name: 'Sketch layer',
        geojson: { type: 'FeatureCollection', features: [] },
        visible: true,
        source: 'upload',
        ...siDefaultNewVectorLayerFields(),
      },
    ]);
    applyMapDrawTool('polygon');
    setRsDrawingModeActive(true);
    setStacStatus('Sketch layer created â€” draw on the map to add features.');
  }, []);

  const handleMapToolboxAddGisLayerAction = useCallback((action: MapToolboxAddGisLayerAction) => {
    switch (action) {
      case 'browse':
        openAddLayerModal({ tab: 'giscontent', wizard: 'home' });
        break;
      case 'url':
        openAddLayerModal({
          tab: 'url',
          wizard: 'source-forms',
          statusHint: 'Enter a remote GeoJSON, KML, ZIP, or ArcGIS service URL.',
        });
        break;
      case 'file':
        openAddLayerModal({
          tab: 'upload',
          wizard: 'source-forms',
          statusHint: 'Browse or drop a file to import as a map layer.',
        });
        break;
      case 'sketch':
        createSketchLayerOnMap();
        break;
      case 'media':
        openAddLayerModal({
          tab: 'raster',
          wizard: 'source-forms',
          statusHint: 'Add a GeoTIFF or image service as a media layer.',
        });
        break;
      default:
        break;
    }
  }, [createSketchLayerOnMap]);

  useEffect(() => {
    if (siScope.isolateRouting) return;
    const contentId = searchParams.get('content');
    if (!contentId || contentId === gisContentDeepLinkRef.current) return;
    if (!isMapLoaded) return;
    gisContentDeepLinkRef.current = contentId;
    const row = getGisContentRowById(contentId);
    const next = new URLSearchParams(searchParams);
    next.delete('content');
    setSearchParams(next, { replace: true });
    if (!row || isGisContentRowInRecycle(row)) {
      setStacStatus('GIS Content item is unavailable or in the Recycle bin.');
      return;
    }
    addGisPortalRowToMap(row);
  }, [searchParams, setSearchParams, isMapLoaded, addGisPortalRowToMap, siScope.isolateRouting]);

  useEffect(() => {
    const syncPortalLayers = () => {
      setCustomLayers(prev =>
        prev.filter(layer => {
          const rowId = parseGisContentPortalLayerUrl(String(layer.sourceUrl || ''));
          if (!rowId) return true;
          const row = getGisContentRowById(rowId);
          return Boolean(row && !isGisContentRowInRecycle(row));
        }),
      );
    };
    window.addEventListener('gis-content-portal-changed', syncPortalLayers);
    return () => window.removeEventListener('gis-content-portal-changed', syncPortalLayers);
  }, []);

  /** Undo last vertex / click while drawing (polygon, polyline start, or in-progress box/circle drag). */
  const removeLastDrawPoint = () => {
    if (dragRectCircleRef.current) {
      dragRectCircleRef.current = null;
      setRectCirclePreview(null);
      setCircleRadiusM(null);
      setMapDragPanEnabled(true);
      return;
    }
    if (circleRefineDraft) {
      circleRefineInteractionRef.current = null;
      setCircleRefineDraft(null);
      setCircleRefineActiveHandle(null);
      setDrawAssistHint('');
      setMapDragPanEnabled(false);
      return;
    }
    if (mapDrawTool === 'polygon' && polygonRing.length > 0) {
      polygonRingSketchDragRef.current = null;
      setMapDragPanEnabled(true);
      setPolygonRing(prev => prev.slice(0, -1));
      return;
    }
    if (mapDrawTool === 'polyline' && polylineStart) {
      setPolylineStart(null);
      setPointerLngLat(null);
    }
  };

  /** Abort current sketch (draft only); keeps committed AOI on the map. */
  const cancelCurrentDrawing = useCallback(() => {
    dragRectCircleRef.current = null;
    polygonRingSketchDragRef.current = null;
    circleRefineInteractionRef.current = null;
    setRectCirclePreview(null);
    setPolylineStart(null);
    setPolygonRing([]);
    setPointerLngLat(null);
    setMapDragPanEnabled(true);
    editDragRef.current = null;
    preEditGeomRef.current = null;
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setCircleRadiusM(null);
    setCircleRefineDraft(null);
    setCircleRefineActiveHandle(null);
    setMapDrawTool('select');
  }, []);

  const openRemoteSensingDrawing = useCallback((tool?: RemoteSensingDrawingTool) => {
    mapDrawOwnerRef.current = 'remote-sensing';
    setMapDrawOwner('remote-sensing');
    setCropClassDrawingModeActive(false);
    setExpandedEnvSection('remote-sensing');
    setIsLayerDropdownOpen(true);
    setRsDrawingModeActive(true);
    if (tool) applyMapDrawTool(tool);
  }, []);

  const handleRsDrawingModeChange = useCallback(
    (active: boolean) => {
      if (active) {
        mapDrawOwnerRef.current = 'remote-sensing';
        setMapDrawOwner('remote-sensing');
        setCropClassDrawingModeActive(false);
      }
      setRsDrawingModeActive(active);
      if (!active) {
        cancelCurrentDrawing();
        setMapDragPanEnabled(true);
      }
    },
    [cancelCurrentDrawing],
  );

  const handleRsDrawingToolChange = useCallback((tool: RemoteSensingDrawingTool) => {
    mapDrawOwnerRef.current = 'remote-sensing';
    setMapDrawOwner('remote-sensing');
    setCropClassDrawingModeActive(false);
    setRsDrawingModeActive(true);
    applyMapDrawTool(tool);
  }, []);

  const handleCropClassDrawingModeChange = useCallback(
    (active: boolean) => {
      if (active) {
        mapDrawOwnerRef.current = 'crop-classification';
        setMapDrawOwner('crop-classification');
        setRsDrawingModeActive(false);
      }
      setCropClassDrawingModeActive(active);
      if (!active) {
        cancelCurrentDrawing();
        setMapDragPanEnabled(true);
      }
    },
    [cancelCurrentDrawing],
  );

  const handleCropClassDrawingToolChange = useCallback((tool: RemoteSensingDrawingTool) => {
    mapDrawOwnerRef.current = 'crop-classification';
    setMapDrawOwner('crop-classification');
    setRsDrawingModeActive(false);
    setCropClassDrawingModeActive(true);
    applyMapDrawTool(tool);
  }, []);

  /* â”€â”€ Unified Measurement tool (Main toolbox): isolated multi-mode measuring â”€â”€ */
  /** Sample terrain elevation (m) at a coordinate when 3D terrain is active. */
  const sampleMeasureElevation = useCallback((lng: number, lat: number): number | null => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    try {
      if (map && typeof map.queryTerrainElevation === 'function') {
        const e = map.queryTerrainElevation([lng, lat], { exaggerated: false });
        return typeof e === 'number' && Number.isFinite(e) ? e : null;
      }
    } catch {
      /* terrain not ready */
    }
    return null;
  }, []);

  /** Push the current finished sketch into the kept-on-map list before replacing it. */
  const archiveFinishedMeasure = useCallback(() => {
    if (!measureFinishedRef.current || !measureModeRef.current || !measurePointsRef.current.length) return;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `meas-${Date.now()}`;
    const mode = measureModeRef.current;
    const points = measurePointsRef.current;
    setMeasureCompleted(prev => [...prev, { id, mode, points }]);
  }, []);

  const clearMeasure = useCallback(() => {
    // Closing keeps completed measurements on the map (until "Clear all").
    archiveFinishedMeasure();
    measureModeRef.current = null;
    measureFinishedRef.current = false;
    measurePointsRef.current = [];
    measureRedoRef.current = [];
    setMeasureMode(null);
    setMeasurePoints([]);
    setMeasureFinished(false);
    setMeasureRedoStack([]);
    setMeasurePanelOpen(false);
    setPointerLngLat(null);
  }, [archiveFinishedMeasure]);

  const openMeasurePanel = useCallback(() => {
    // Measurement works in isolation â€” turn off any AOI drawing first.
    if (rsDrawingModeActiveRef.current) handleRsDrawingModeChange(false);
    if (cropClassDrawingModeActiveRef.current) handleCropClassDrawingModeChange(false);
    applyMapDrawTool('select');
    setMapDragPanEnabled(true);
    setMeasurePanelOpen(true);
    if (!measureModeRef.current) {
      measureModeRef.current = 'distance';
      setMeasureMode('distance');
    }
  }, [handleRsDrawingModeChange, handleCropClassDrawingModeChange]);

  const handleMeasureModeSelect = useCallback(
    (mode: MeasureMode) => {
      archiveFinishedMeasure();
      measureModeRef.current = mode;
      measurePointsRef.current = [];
      measureFinishedRef.current = false;
      measureRedoRef.current = [];
      setMeasureMode(mode);
      setMeasurePoints([]);
      setMeasureFinished(false);
      setMeasureRedoStack([]);
      setPointerLngLat(null);
    },
    [archiveFinishedMeasure],
  );

  const handleMeasureMapClick = useCallback(
    (lng: number, lat: number) => {
      const mode = measureModeRef.current;
      if (!mode) return;
      const spec = getMeasureModeSpec(mode);
      const pt: MeasurePoint = { lng, lat, ele: sampleMeasureElevation(lng, lat) };
      const autoFinish = (pts: MeasurePoint[]) => {
        if (spec.autoFinishCount && pts.length >= spec.autoFinishCount) {
          measureFinishedRef.current = true;
          setMeasureFinished(true);
          setPointerLngLat(null);
        }
      };
      // A click after a finished measurement archives it and starts a fresh one.
      if (measureFinishedRef.current) {
        archiveFinishedMeasure();
        const fresh = [pt];
        measurePointsRef.current = fresh;
        measureFinishedRef.current = false;
        measureRedoRef.current = [];
        setMeasurePoints(fresh);
        setMeasureFinished(false);
        setMeasureRedoStack([]);
        autoFinish(fresh);
        return;
      }
      const next = [...measurePointsRef.current, pt];
      measurePointsRef.current = next;
      measureRedoRef.current = [];
      setMeasurePoints(next);
      setMeasureRedoStack([]);
      autoFinish(next);
    },
    [sampleMeasureElevation, archiveFinishedMeasure],
  );

  const finishMeasure = useCallback(() => {
    const mode = measureModeRef.current;
    if (!mode) return;
    const spec = getMeasureModeSpec(mode);
    const pts = measurePointsRef.current;
    let next = pts;
    // A double-click finish appends a duplicate vertex â€” drop it.
    if (pts.length >= 2) {
      const a = pts[pts.length - 1];
      const b = pts[pts.length - 2];
      if (haversineDistanceMeters(a.lng, a.lat, b.lng, b.lat) < 0.5) next = pts.slice(0, -1);
    }
    if (next.length < spec.minPoints) return;
    measurePointsRef.current = next;
    measureFinishedRef.current = true;
    setMeasurePoints(next);
    setMeasureFinished(true);
    setPointerLngLat(null);
  }, []);

  const handleMeasureUndo = useCallback(() => {
    if (measureFinishedRef.current) return;
    const pts = measurePointsRef.current;
    if (!pts.length) return;
    const removed = pts[pts.length - 1];
    const next = pts.slice(0, -1);
    measurePointsRef.current = next;
    measureRedoRef.current = [...measureRedoRef.current, removed];
    setMeasurePoints(next);
    setMeasureRedoStack(prev => [...prev, removed]);
  }, []);

  const handleMeasureRedo = useCallback(() => {
    if (measureFinishedRef.current) return;
    const redo = measureRedoRef.current;
    if (!redo.length) return;
    const restore = redo[redo.length - 1];
    const next = [...measurePointsRef.current, restore];
    measurePointsRef.current = next;
    measureRedoRef.current = redo.slice(0, -1);
    setMeasurePoints(next);
    setMeasureRedoStack(redo.slice(0, -1));
  }, []);

  const clearMeasureCurrent = useCallback(() => {
    measurePointsRef.current = [];
    measureFinishedRef.current = false;
    measureRedoRef.current = [];
    setMeasurePoints([]);
    setMeasureFinished(false);
    setMeasureRedoStack([]);
    setPointerLngLat(null);
  }, []);

  const clearMeasureAll = useCallback(() => {
    clearMeasureCurrent();
    setMeasureCompleted([]);
  }, [clearMeasureCurrent]);

  const resetActiveSketchDraftState = useCallback(() => {
    if (drawFadeRafRef.current != null) {
      cancelAnimationFrame(drawFadeRafRef.current);
      drawFadeRafRef.current = null;
    }

    dragRectCircleRef.current = null;
    polygonRingSketchDragRef.current = null;
    editDragRef.current = null;
    preEditGeomRef.current = null;
    fieldEditDragRef.current = null;
    preFieldEditSnapshotRef.current = null;
    circleRefineInteractionRef.current = null;
    circleRefineLastMoveRef.current = null;
    skipNextMapClickRef.current = false;

    setGeomUndoStack([]);
    setGeomRedoStack([]);
    setPolylineStart(null);
    setPolygonRing([]);
    setRectCirclePreview(null);
    setPointerLngLat(null);
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setCircleRadiusM(null);
    setCircleRefineDraft(null);
    setCircleRefineActiveHandle(null);
    setShowEditHandles(false);
    setDrawVisualOpacity(1);
    setMapDrawTool('select');
  }, []);

  const purgeDrawnMultiAoiWorkspace = useCallback(() => {
    const removedIds = new Set(
      multiAoiItemsRef.current.filter(item => item.source === 'drawn').map(item => item.id),
    );
    if (!removedIds.size) return;
    setMultiAoiItems(prev => prev.filter(item => item.source !== 'drawn'));
    setActiveMultiAoiId(prev => (prev && removedIds.has(prev) ? null : prev));
    setMultiAoiPopupIds(prev => prev.filter(id => !removedIds.has(id)));
  }, []);

  const persistClearedDrawWorkspace = useCallback(() => {
    saveDrawWorkspace(
      {
        feature: null,
        style: drawStyle,
        fields: [],
        selectedFieldId: null,
        drawTargetMode: 'aoi',
      },
      siScope.scopedStorageKey(SI_DRAW_WORKSPACE_LS_KEY_V2),
    );
  }, [drawStyle, siScope]);

  const clearCropClassificationAoiOnly = useCallback(() => {
    resetActiveSketchDraftState();
    cropClassAoiGeometryRef.current = null;
    setCropClassAoiGeometry(null);
    setMapDragPanEnabled(!cropClassDrawingModeActiveRef.current);
    setCropClassificationSettings(prev => ({
      ...prev,
      statusMessage: 'Study AOI cleared (classification layer unchanged).',
    }));
    sentinelWmsTilesSyncedRef.current = '';
  }, [resetActiveSketchDraftState]);

  /**
   * Instant wipe of Remote Sensing sketch layer (committed + draft + workspace mirror).
   */
  const clearRemoteSensingAoiSketchOnly = useCallback(() => {
    resetActiveSketchDraftState();
    purgeDrawnMultiAoiWorkspace();

    drawnGeometryRef.current = null;
    setDrawnGeometry(null);
    setAoiFields([]);
    aoiFieldsRef.current = [];
    setSelectedFieldId(null);
    selectedFieldIdRef.current = null;
    setDrawnStats(null);
    persistClearedDrawWorkspace();

    setMapDragPanEnabled(!rsDrawingModeActiveRef.current);
  }, [resetActiveSketchDraftState, purgeDrawnMultiAoiWorkspace, persistClearedDrawWorkspace]);

  const clearSatelliteDrawingImmediate = clearRemoteSensingAoiSketchOnly;

  /** Keep drawing owners aligned with the active toolbox panel (isolated layers). */
  useEffect(() => {
    if (expandedEnvSection === 'crop-classification') {
      setRsDrawingModeActive(false);
      mapDrawOwnerRef.current = 'crop-classification';
      setMapDrawOwner('crop-classification');
    } else if (
      expandedEnvSection === 'remote-sensing' ||
      expandedEnvSection === 'tree-detections' ||
      expandedEnvSection === 'hydro-watershed' ||
      expandedEnvSection === 'well-site' ||
      expandedEnvSection === 'well-suitability' ||
      expandedEnvSection === 'flood-monitoring'
    ) {
      setCropClassDrawingModeActive(false);
      mapDrawOwnerRef.current = 'remote-sensing';
      setMapDrawOwner('remote-sensing');
    }
  }, [expandedEnvSection]);

  // â”€â”€ Tree Detections (VHRTrees-style crown detection) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const treeDetectionsActive = expandedEnvSection === 'tree-detections';
  const treeDetection = useTreeDetection({
    geometry: drawnGeometry ?? null,
    provider: treeProvider,
    enabled: treeDetectionsActive,
    sensitivity: treeSensitivity,
    mode: treeAnalysisMode,
  });

  // Apply the confidence-filter slider: only trees scoring â‰¥ treeConfidenceMin
  // are shown on the map, counted, exported, and zoomed to.
  const treeFilteredGeojson = useMemo<GeoJSON.FeatureCollection | null>(() => {
    const fc = treeDetection.result?.geojson;
    if (!fc) return null;
    if (treeConfidenceMin <= 0) return fc;
    return {
      type: 'FeatureCollection',
      features: fc.features.filter(f => {
        const conf = Number((f.properties as Record<string, unknown> | null)?.confidence ?? 1);
        return conf >= treeConfidenceMin;
      }),
    };
  }, [treeDetection.result, treeConfidenceMin]);

  const treeVisibleCount = treeFilteredGeojson?.features.length ?? 0;

  const handleTreeDetectExport = useCallback(() => {
    const fc = treeFilteredGeojson;
    if (!fc || !fc.features.length) return;
    downloadTextFile('tree-detections.geojson', JSON.stringify(fc, null, 2), 'application/geo+json');
  }, [treeFilteredGeojson]);

  const handleTreeDetectExportShapefile = useCallback(() => {
    const fc = treeFilteredGeojson;
    if (!fc || !fc.features.length) return;
    void downloadTreeShapefile(fc, 'tree-detections');
  }, [treeFilteredGeojson]);

  const handleTreeZoomToLayer = useCallback(() => {
    const fc = treeFilteredGeojson;
    if (!fc || !fc.features.length) return;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const f of fc.features) {
      if (f.geometry?.type !== 'Point') continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || typeof map.fitBounds !== 'function') return;
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, duration: 700, maxZoom: 19 },
    );
  }, [treeFilteredGeojson]);

  const treeDetectionOverlayData = treeFilteredGeojson;

  // â”€â”€ Hydro Watershed Workflow (DEM â†’ flow â†’ streams â†’ basin â†’ mesh) â”€â”€â”€â”€â”€â”€â”€
  const hydroWatershedActive = expandedEnvSection === 'hydro-watershed';
  // Stream-density sensitivity is fixed at the balanced default (slider removed).
  const [hydroSensitivity] = useState(0.5);
  // Stream classification model â€” switchable on the map (Strahler â†” Shreve).
  const [hydroStreamModel, setHydroStreamModel] = useState<'strahler' | 'shreve'>('strahler');
  // Contour interval (m; 0 = auto) and number of drainage basins to delineate.
  const [hydroContourInterval, setHydroContourInterval] = useState(0);
  const [hydroBasinCount, setHydroBasinCount] = useState(6);
  // Show elevation labels on contour lines (toggled from the layer options menu).
  const [hydroContourLabels, setHydroContourLabels] = useState(true);
  const hydro = useHydroWatershed({
    geometry: drawnGeometry ?? null,
    enabled: hydroWatershedActive,
    sensitivity: hydroSensitivity,
    contourInterval: hydroContourInterval,
    basinCount: hydroBasinCount,
  });
  const handleHydroRunAll = useCallback(() => {
    void (async () => {
      for (const id of HYDRO_STEP_ORDER) {
        // eslint-disable-next-line no-await-in-loop
        await hydro.runStep(id);
      }
    })();
  }, [hydro]);

  // Re-run Contours / Basins when their option changes (the option refs are
  // refreshed on render, so re-running here picks up the latest interval/count).
  const hydroContoursDone = hydro.steps.contours?.status === 'done';
  const hydroBasinsDone = hydro.steps.basins?.status === 'done';
  const hydroOptionsReady = useRef(false);
  useEffect(() => {
    if (!hydroOptionsReady.current) {
      hydroOptionsReady.current = true;
      return;
    }
    if (hydroWatershedActive && hydroContoursDone) void hydro.runStep('contours');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydroContourInterval]);
  useEffect(() => {
    if (hydroWatershedActive && hydroBasinsDone) void hydro.runStep('basins');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydroBasinCount]);

  // â”€â”€ Well Site Recommendation (Hydro-AI) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const wellSiteActive = expandedEnvSection === 'well-site';
  const wellSite = useWellSiteRecommendation({
    geometry: drawnGeometry ?? null,
    enabled: wellSiteActive,
    topN: 8,
  });
  const handleWellSiteZoomToPoint = useCallback((point: WellSitePoint) => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map?.flyTo) return;
    map.flyTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom?.() ?? 13, 15), duration: 900 });
  }, []);

  const wellSuitabilityActive = expandedEnvSection === 'well-suitability';
  const wellSuitability = useWellSuitabilityAnalysis({
    geometry: drawnGeometry ?? null,
    enabled: wellSuitabilityActive,
    topN: 10,
  });
  const handleWellSuitabilityZoomToPoint = useCallback((point: WellSuitabilitySite) => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map?.flyTo) return;
    map.flyTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom?.() ?? 13, 15), duration: 900 });
  }, []);

  // Publish the latest recommended wells as a first-class Layers-panel layer
  // (Shapefile-style point layer with the full attribute table). Refreshing the
  // analysis replaces its geometry/attributes while preserving any user styling.
  useEffect(() => {
    const fc = wellSite.result?.pointsGeoJson;
    if (!fc || !Array.isArray(fc.features) || !fc.features.length) return;
    setCustomLayers(prev => {
      const idx = prev.findIndex(l => l.id === WELLSITE_RECOMMENDED_LAYER_ID);
      if (idx === -1) {
        const layer: CustomLayer = {
          id: WELLSITE_RECOMMENDED_LAYER_ID,
          name: 'Recommended Wells (Hydro-AI)',
          geojson: fc,
          visible: true,
          source: 'api',
          ephemeral: true,
          color: '#1e3a8a',
          fillColor: '#3b82f6',
          pointRadius: 6,
          weight: 2,
          labelFieldName: 'rank',
        };
        return [...prev, layer];
      }
      const next = prev.slice();
      next[idx] = { ...next[idx], geojson: fc, markerImageId: undefined };
      return next;
    });
  }, [wellSite.result]);

  useEffect(() => {
    const fc = wellSuitability.result?.pointsGeoJson;
    if (!fc || !Array.isArray(fc.features) || !fc.features.length) return;
    setCustomLayers(prev => {
      const idx = prev.findIndex(l => l.id === WELL_SUITABILITY_LAYER_ID);
      if (idx === -1) {
        const layer: CustomLayer = {
          id: WELL_SUITABILITY_LAYER_ID,
          name: 'Well Suitability (MCDA)',
          geojson: fc,
          visible: true,
          source: 'api',
          ephemeral: true,
          color: '#065f46',
          fillColor: '#10b981',
          pointRadius: 7,
          weight: 2,
          labelFieldName: 'rank',
        };
        return [...prev, layer];
      }
      const next = prev.slice();
      next[idx] = { ...next[idx], geojson: fc, markerImageId: undefined };
      return next;
    });
  }, [wellSuitability.result]);

  // â”€â”€ Flood Monitoring (SAR-based change detection) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const FLOOD_RASTER_LAYER_ID = 'flood-extent-raster';
  const FLOOD_CHANGE_LAYER_ID = 'flood-change-raster';
  const FLOOD_VECTOR_LAYER_ID = 'flood-boundaries-vector';
  const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const flood = useFloodMonitoring();
  const [floodPostDate, setFloodPostDate] = useState<string>(() => isoDaysAgo(5));
  const [floodPreDate, setFloodPreDate] = useState<string>(() => isoDaysAgo(35));
  const [floodThresholdDb, setFloodThresholdDb] = useState<number>(-17);
  const [floodLayerVisible, setFloodLayerVisible] = useState<Record<FloodLayerKind, boolean>>({
    flood: true,
    vector: true,
    change: false,
  });
  const floodLayerVisibleRef = useRef(floodLayerVisible);
  floodLayerVisibleRef.current = floodLayerVisible;

  const handleFloodRun = useCallback(() => {
    const geometry = getDrawnGeometry(drawnGeometryRef.current);
    if (!geometry || !floodPostDate) return;
    flood.run({
      aoi: geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      postDate: floodPostDate,
      preDate: floodPreDate || undefined,
      threshold: floodThresholdDb,
    });
  }, [flood, floodPostDate, floodPreDate, floodThresholdDb]);

  // Publish flood outputs as separate Layer Manager layers (raster + change + vector).
  const floodPublishedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const result = flood.result;
    if (!result) return;
    const key = `${result.stats.postDate}|${result.stats.preDate}|${result.stats.thresholdDb}`;
    if (floodPublishedKeyRef.current === key) return;
    floodPublishedKeyRef.current = key;
    const [w, s, e, n] = result.bounds;
    const coordinates: RasterMapCoordinates = [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ];
    const footprint = siRasterExtentFootprint(coordinates);
    const vis = floodLayerVisibleRef.current;
    setCustomLayers(prev => {
      const without = prev.filter(
        l => l.id !== FLOOD_RASTER_LAYER_ID && l.id !== FLOOD_CHANGE_LAYER_ID && l.id !== FLOOD_VECTOR_LAYER_ID,
      );
      return [
        ...without,
        {
          id: FLOOD_RASTER_LAYER_ID,
          name: 'Flood Extent (SAR)',
          geojson: footprint,
          visible: vis.flood,
          source: 'api',
          renderMode: 'raster',
          raster: { url: result.flood.url, coordinates },
          ephemeral: true,
          mapOpacity: 0.8,
        },
        {
          id: FLOOD_CHANGE_LAYER_ID,
          name: 'Flood Change Detection',
          geojson: footprint,
          visible: vis.change,
          source: 'api',
          renderMode: 'raster',
          raster: { url: result.change.url, coordinates },
          ephemeral: true,
          mapOpacity: 0.75,
        },
        {
          id: FLOOD_VECTOR_LAYER_ID,
          name: 'Flood Boundaries',
          geojson: result.vector as any,
          visible: vis.vector,
          source: 'api',
          renderMode: 'vector',
          ephemeral: true,
          ...siDefaultNewVectorLayerFields(),
        },
      ];
    });
  }, [flood.result]);

  const handleFloodToggleLayer = useCallback((kind: FloodLayerKind, visible: boolean) => {
    setFloodLayerVisible(prev => ({ ...prev, [kind]: visible }));
    const id =
      kind === 'flood' ? FLOOD_RASTER_LAYER_ID : kind === 'change' ? FLOOD_CHANGE_LAYER_ID : FLOOD_VECTOR_LAYER_ID;
    setCustomLayers(prev => prev.map(l => (l.id === id ? { ...l, visible } : l)));
  }, []);

  const handleFloodZoomToLayer = useCallback(() => {
    const b = flood.result?.bounds;
    if (!b) return;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || typeof map.fitBounds !== 'function') return;
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 60, duration: 700, maxZoom: 17 },
    );
  }, [flood.result]);

  const handleFloodExportGeoJson = useCallback(() => {
    const fc = flood.result?.vector;
    if (!fc || !fc.features.length) return;
    downloadTextFile('flood-boundaries.geojson', JSON.stringify(fc, null, 2), 'application/geo+json');
  }, [flood.result]);

  const handleMapPointerDown = (evt: any) => {
    const orig = evt.originalEvent as MouseEvent | undefined;
    if (orig && 'button' in orig) {
      const btn = (orig as MouseEvent).button;
      if (btn === 2) {
        if (mapOrbitNavigation.tryStartOrbitFromMapEvent(evt)) return;
        return;
      }
      if (btn !== 0) return;
    }
    const lng = evt.lngLat.lng;
    const lat = evt.lngLat.lat;
    const map = getMapInstance();
    if (!map) return;

    if (mapDrawTool === 'circle' && circleRefineDraft) {
      if (!isSketchDrawingActiveRef.current) return;
      const draft = circleRefineDraft;
      const [clng, clat] = draft.center;
      const [elng, elat] = draft.edge;
      const rDeg = circleRefineRDeg(draft.center, draft.edge);
      const cosLat = circleRefineCosLat(clat);
      const hitPx = Math.max(POLYGON_VERTEX_SNAP_PX, vertexHitThresholdPx(map) * 1.05);
      if (lngLatPixelDistance(map, [lng, lat], draft.center) <= hitPx * 1.15) {
        circleRefineInteractionRef.current = { type: 'handle', h: 'center' };
        setCircleRefineActiveHandle('center');
        circleRefineLastMoveRef.current = [lng, lat];
        setMapDragPanEnabled(false);
        return;
      }
      const dirs: CircleCardinal[] = ['n', 'e', 's', 'w'];
      for (const c of dirs) {
        const p = circleRefineCardinalLngLat(draft.center, rDeg, cosLat, c);
        if (lngLatPixelDistance(map, [lng, lat], p) <= hitPx) {
          circleRefineInteractionRef.current = { type: 'handle', h: c };
          setCircleRefineActiveHandle(c);
          circleRefineLastMoveRef.current = [lng, lat];
          setMapDragPanEnabled(false);
          return;
        }
      }
      const ringGeom = circleFromEdgeFeature(clng, clat, elng, elat, 48, 'hit').geometry;
      if (pointInPolygonGeometry(lng, lat, ringGeom)) {
        circleRefineInteractionRef.current = { type: 'pan', last: [lng, lat] };
        setCircleRefineActiveHandle('pan');
        circleRefineLastMoveRef.current = [lng, lat];
        setMapDragPanEnabled(false);
        return;
      }
      return;
    }

    if (mapDrawTool === 'polygon' && polygonRing.length > 0) {
      if (!isSketchDrawingActiveRef.current) return;
      const ring = polygonRing;
      const hitPx = Math.max(POLYGON_VERTEX_SNAP_PX, vertexHitThresholdPx(map));
      for (let vi = ring.length - 1; vi >= 0; vi -= 1) {
        const p = ring[vi]!;
        const d = lngLatPixelDistance(map, [lng, lat], p);
        if (d > hitPx) continue;
        if (vi === 0 && ring.length >= 3) continue;
        polygonRingSketchDragRef.current = vi;
        setMapDragPanEnabled(false);
        return;
      }
    }

    if (mapDrawTool === 'rectangle' || mapDrawTool === 'circle' || mapDrawTool === 'box_select') {
      if (isRsSketchDrawTool(mapDrawTool) && !isSketchDrawingActiveRef.current) return;
      if (mapDrawTool === 'circle' && circleRefineDraft) return;
      dragRectCircleRef.current = { kind: mapDrawTool, start: [lng, lat] };
      setRectCirclePreview({ kind: mapDrawTool, a: [lng, lat], b: [lng, lat] });
      setMapDragPanEnabled(false);
      return;
    }

    if (gisSelectionActiveRef.current && mapDrawTool === 'lasso') {
      gisLassoDragRef.current = true;
      gisLassoRingRef.current = [[lng, lat]];
      setGisLassoPreviewRing([[lng, lat]]);
      setMapDragPanEnabled(false);
      return;
    }

    if (mapDrawTool === 'select' && selectedFieldIdRef.current) {
      const row = aoiFieldsRef.current.find(x => x.id === selectedFieldIdRef.current);
      if (row) {
        const geom = row.geometry;
        const hitPx = vertexHitThresholdPx(map);
        const hit = findNearestVertex(map, geom, lng, lat, hitPx);
        if (hit) {
          preFieldEditSnapshotRef.current = cloneDeep(row);
          fieldEditDragRef.current = { fieldId: row.id, mode: 'vertex', ref: hit.ref };
          setMapDragPanEnabled(false);
          return;
        }
        if (geom.type === 'Polygon' && pointInPolygonGeometry(lng, lat, geom)) {
          preFieldEditSnapshotRef.current = cloneDeep(row);
          fieldEditDragRef.current = { fieldId: row.id, mode: 'pan', last: [lng, lat] };
          setMapDragPanEnabled(false);
          return;
        }
        if (geom.type === 'MultiPolygon') {
          for (const poly of geom.coordinates) {
            const fake = { type: 'Polygon' as const, coordinates: poly };
            if (pointInPolygonGeometry(lng, lat, fake as any)) {
              preFieldEditSnapshotRef.current = cloneDeep(row);
              fieldEditDragRef.current = { fieldId: row.id, mode: 'pan', last: [lng, lat] };
              setMapDragPanEnabled(false);
              return;
            }
          }
        }
      }
    }

    if (mapDrawTool === 'select' && activeDrawGeomRef().current && isSketchDrawingActiveRef.current) {
      const geom = activeDrawGeomRef().current.geometry;
      const hitPx = vertexHitThresholdPx(map);
      const hit = findNearestVertex(map, geom, lng, lat, hitPx);
      if (hit) {
        preEditGeomRef.current = activeDrawGeomRef().current ? cloneDeep(activeDrawGeomRef().current) : null;
        editDragRef.current = { mode: 'vertex', ref: hit.ref };
        setMapDragPanEnabled(false);
        return;
      }
      if (geom?.type === 'Polygon' && pointInPolygonGeometry(lng, lat, geom)) {
        preEditGeomRef.current = activeDrawGeomRef().current ? cloneDeep(activeDrawGeomRef().current) : null;
        editDragRef.current = { mode: 'pan', last: [lng, lat] };
        setMapDragPanEnabled(false);
        return;
      }
      if (geom?.type === 'LineString') {
        const coords = geom.coordinates as [number, number][];
        if (coords.length >= 2 && minPixelDistToPolyline(map, lng, lat, coords) < hitPx * 0.85) {
          preEditGeomRef.current = activeDrawGeomRef().current ? cloneDeep(activeDrawGeomRef().current) : null;
          editDragRef.current = { mode: 'pan', last: [lng, lat] };
          setMapDragPanEnabled(false);
          return;
        }
      }
      if (geom?.type === 'Point') {
        const d = lngLatPixelDistance(map, [lng, lat], geom.coordinates as [number, number]);
        if (d < hitPx) {
          preEditGeomRef.current = activeDrawGeomRef().current ? cloneDeep(activeDrawGeomRef().current) : null;
          editDragRef.current = { mode: 'pan', last: [lng, lat] };
          setMapDragPanEnabled(false);
        }
      }
    }

    if (mapOrbitNavigation.tryStartOrbitFromMapEvent(evt)) return;
  };

  const handleMapPointerMove = (evt: any) => {
    const lng = evt.lngLat.lng;
    const lat = evt.lngLat.lat;
    const map = getMapInstance();
    if (mapOrbitNavigation.applyOrbitMoveFromMapEvent(evt)) {
      const orbit = mapOrbitNavigation.orbitRef.current;
      const orig = evt?.originalEvent;
      if (orbit && orig && 'clientX' in orig) {
        const next = computeAgroCloudOrbitViewState(orbit, orig.clientX, orig.clientY);
        syncAgroCloudTerrain3d(map, activeBasemapId, next.pitch);
      }
      return;
    }
    // Measure tool: rubber-band the live segment to the cursor.
    if (measureModeRef.current && !measureFinishedRef.current) {
      setPointerLngLat([lng, lat]);
      return;
    }
    if (gisLassoDragRef.current && gisSelectionActiveRef.current) {
      const ring = gisLassoRingRef.current;
      const last = ring[ring.length - 1];
      if (!last || Math.hypot(lng - last[0], lat - last[1]) > 1e-5) {
        const next = [...ring, [lng, lat] as [number, number]];
        gisLassoRingRef.current = next;
        setGisLassoPreviewRing(next);
      }
      return;
    }
    const cri = circleRefineInteractionRef.current;
    if (cri && mapDrawTool === 'circle' && circleRefineDraft) {
      const draft = circleRefineDraft;
      const last = circleRefineLastMoveRef.current;
      if (!last) {
        circleRefineLastMoveRef.current = [lng, lat];
        return;
      }
      const dLng = lng - last[0];
      const dLat = lat - last[1];
      circleRefineLastMoveRef.current = [lng, lat];
      if (cri.type === 'handle' && cri.h === 'center') {
        setCircleRefineDraft({
          center: [draft.center[0] + dLng, draft.center[1] + dLat],
          edge: [draft.edge[0] + dLng, draft.edge[1] + dLat],
        });
      } else if (cri.type === 'handle' && cri.h !== 'center') {
        const newEdge = projectPointerToCircleCardinalEdge(draft.center, cri.h, [lng, lat]);
        setCircleRefineDraft({ center: draft.center, edge: newEdge });
      } else if (cri.type === 'pan') {
        setCircleRefineDraft({
          center: [draft.center[0] + dLng, draft.center[1] + dLat],
          edge: [draft.edge[0] + dLng, draft.edge[1] + dLat],
        });
      }
      setPolygonClosingSnap(false);
      return;
    }
    const dragSpec = dragRectCircleRef.current;
    if (dragSpec) {
      setRectCirclePreview({ kind: dragSpec.kind, a: dragSpec.start, b: [lng, lat] });
      if (dragSpec.kind === 'circle') {
        const [lng0, lat0] = dragSpec.start;
        setCircleRadiusM(haversineDistanceMeters(lng0, lat0, lng, lat));
      } else {
        setCircleRadiusM(null);
      }
      setDrawAssistHint('');
      setPolygonClosingSnap(false);
      return;
    }

    const sketchVi = polygonRingSketchDragRef.current;
    if (sketchVi !== null && mapDrawTool === 'polygon') {
      let lngLat: [number, number] = [lng, lat];
      if (map && polygonRing.length >= 1) {
        const others = polygonRing.filter((_, j) => j !== sketchVi) as [number, number][];
        const snapPool =
          drawTargetModeRef.current === 'field' && aoiFieldSnapRef.current
            ? [...others, ...collectAoiFieldSnapVertices()]
            : others;
        const { lng: sx, lat: sy, snapped } = snapLngLatToNearestVertex(map, lng, lat, snapPool, POLYGON_VERTEX_SNAP_PX);
        if (snapped) lngLat = [sx, sy];
      }
      const shiftKey = !!(evt?.originalEvent as MouseEvent | undefined)?.shiftKey;
      const nRing = polygonRing.length;
      if (map && shiftKey && nRing >= 2) {
        const prevI = (sketchVi + nRing - 1) % nRing;
        const anchor = polygonRing[prevI]!;
        lngLat = snapLngLatToBearingStep(anchor, lngLat, POLYGON_SNAP_BEARING_STEP_DEG);
      }
      const nextRing = polygonRing.map((p, j) => (j === sketchVi ? lngLat : p)) as [number, number][];
      setPolygonRing(nextRing);
      setPointerLngLat(lngLat);
      if (map && nextRing.length >= 3) {
        const closePx = polygonCloseSnapThresholdPx(map);
        const d0 = lngLatPixelDistance(map, lngLat, nextRing[0]!);
        setPolygonClosingSnap(d0 <= closePx);
        setDrawAssistHint(d0 <= closePx ? 'Click first vertex to close polygon' : '');
      } else {
        setPolygonClosingSnap(false);
        setDrawAssistHint('');
      }
      return;
    }

    const fed = fieldEditDragRef.current;
    if (fed && map) {
      const row = aoiFieldsRef.current.find(x => x.id === fed.fieldId);
      if (!row) {
        fieldEditDragRef.current = null;
      } else {
        const base = { type: 'Feature' as const, properties: {}, geometry: row.geometry };
        if (fed.mode === 'vertex') {
          const next = setVertexCoord(base, fed.ref, lng, lat);
          const ng = next.geometry;
          setAoiFields(prev => {
            const mapped = prev.map(x =>
              x.id === fed.fieldId ? { ...x, geometry: ng, ...computeSiAoiFieldMetrics(ng) } : x,
            );
            aoiFieldsRef.current = mapped;
            return mapped;
          });
        } else {
          const [plng, plat] = fed.last;
          const dLng = lng - plng;
          const dLat = lat - plat;
          fieldEditDragRef.current = { ...fed, last: [lng, lat] };
          const moved = translateFeatureCoordinates(base, dLng, dLat);
          const mg = moved.geometry;
          setAoiFields(prev => {
            const mapped = prev.map(x =>
              x.id === fed.fieldId ? { ...x, geometry: mg, ...computeSiAoiFieldMetrics(mg) } : x,
            );
            aoiFieldsRef.current = mapped;
            return mapped;
          });
        }
      }
      return;
    }

    const ed = editDragRef.current;
    const base = activeDrawGeomRef().current;
    if (ed && base) {
      if (ed.mode === 'vertex') {
        const next = setVertexCoord(base, ed.ref, lng, lat);
        updateDrawGeometryLive(next);
      } else {
        const [plng, plat] = ed.last;
        const dLng = lng - plng;
        const dLat = lat - plat;
        editDragRef.current = { mode: 'pan', last: [lng, lat] };
        const moved = translateFeatureCoordinates(base, dLng, dLat);
        updateDrawGeometryLive(moved);
      }
      return;
    }

    if (mapDrawTool === 'polyline' && polylineStart) {
      setPointerLngLat([lng, lat]);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
    } else if (mapDrawTool === 'polygon' && polygonRing.length) {
      const ring = polygonRing;
      const shiftKey = !!(evt?.originalEvent as MouseEvent | undefined)?.shiftKey;
      let ptr: [number, number] = [lng, lat];
      if (map && shiftKey && ring.length >= 1) {
        const anchor = ring[ring.length - 1]!;
        ptr = snapLngLatToBearingStep(anchor, ptr, POLYGON_SNAP_BEARING_STEP_DEG);
      }
      setPointerLngLat(ptr);
      if (map && ring.length >= 3) {
        const closePx = polygonCloseSnapThresholdPx(map);
        const d = lngLatPixelDistance(map, ptr, ring[0]);
        const snap = d <= closePx;
        setPolygonClosingSnap(snap);
        setDrawAssistHint(snap ? 'Click first vertex to close polygon' : '');
      } else {
        setPolygonClosingSnap(false);
        setDrawAssistHint(polygonRing.length ? 'Place vertices; Enter or right-click to finish' : '');
      }
    } else if (
      (mapDrawTool === 'rectangle' || mapDrawTool === 'box_select') ||
      (mapDrawTool === 'circle' && !circleRefineDraft)
    ) {
      setPointerLngLat([lng, lat]);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
    } else {
      setPointerLngLat(null);
      setPolygonClosingSnap(false);
      setDrawAssistHint('');
    }
    if (!circleRefineDraft) setCircleRadiusM(null);
  };

  const finalizeRectDragFromPointer = (clientX: number, clientY: number) => {
    if (!dragRectCircleRef.current) return;
    finalizeRectOrCircleDrag(clientX, clientY);
  };

  const interactionEndRef = useRef({
    finalizeRect: (_cx: number, _cy: number) => {},
    endEdit: () => {},
  });
  interactionEndRef.current.finalizeRect = finalizeRectDragFromPointer;
  interactionEndRef.current.endEdit = endEditDragIfNeeded;

  const endPolygonSketchDragRef = useRef(endPolygonSketchDrag);
  endPolygonSketchDragRef.current = endPolygonSketchDrag;

  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      mapOrbitNavigation.endOrbitDrag();
      if (dragRectCircleRef.current) {
        interactionEndRef.current.finalizeRect(e.clientX, e.clientY);
      }
      if (circleRefineInteractionRef.current) {
        circleRefineInteractionRef.current = null;
        circleRefineLastMoveRef.current = null;
        setCircleRefineActiveHandle(null);
        if (mapDrawToolRef.current === 'circle' && circleRefineDraftRef.current) {
          setMapDragPanEnabled(false);
        }
      }
      if (editDragRef.current) {
        interactionEndRef.current.endEdit();
      }
      if (gisLassoDragRef.current) {
        gisLassoDragRef.current = false;
        const ring = gisLassoRingRef.current;
        gisLassoRingRef.current = [];
        setGisLassoPreviewRing([]);
        setMapDragPanEnabled(true);
        if (ring.length >= 3) {
          const closed = [...ring, ring[0]!];
          applyGisFeatureSelectionRef.current([
            { type: 'Polygon', coordinates: [closed] } as GeoJSON.Polygon,
          ]);
        }
      }
      endPolygonSketchDragRef.current();
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || !isMapStyleReady) return;
    const sketch =
      mapDrawTool === 'polygon' ||
      mapDrawTool === 'rectangle' ||
      mapDrawTool === 'circle' ||
      mapDrawTool === 'box_select';
    try {
      if (sketch) map.doubleClickZoom.disable();
      else map.doubleClickZoom.enable();
    } catch {
      /* ignore */
    }
    return () => {
      try {
        map.doubleClickZoom.enable();
      } catch {
        /* ignore */
      }
    };
  }, [mapDrawTool, isMapStyleReady]);

  const undoRedoRef = useRef({ undo: undoGeometry, redo: redoGeometry });
  undoRedoRef.current = { undo: undoGeometry, redo: redoGeometry };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === 'Backspace' && mapDrawToolRef.current === 'polygon' && polygonRingRef.current.length > 0) {
        e.preventDefault();
        polygonRingSketchDragRef.current = null;
        setMapDragPanEnabled(false);
        setPolygonRing(prev => prev.slice(0, -1));
        return;
      }
      if (mod && k === 'z' && !e.shiftKey) {
        if (mapDrawToolRef.current === 'circle' && circleRefineDraftRef.current) {
          e.preventDefault();
          circleRefineInteractionRef.current = null;
          circleRefineLastMoveRef.current = null;
          setCircleRefineActiveHandle(null);
          setCircleRefineDraft(null);
          setDrawAssistHint('');
          setMapDragPanEnabled(false);
          return;
        }
        if (dragRectCircleRef.current) {
          e.preventDefault();
          dragRectCircleRef.current = null;
          setRectCirclePreview(null);
          setCircleRadiusM(null);
          const t = mapDrawToolRef.current;
          setMapDragPanEnabled(
            t !== 'rectangle' && t !== 'box_select' && t !== 'circle' && t !== 'polygon' && t !== 'polyline',
          );
          return;
        }
        if (mapDrawToolRef.current === 'polygon' && polygonRingRef.current.length > 0) {
          e.preventDefault();
          setPolygonRing(prev => prev.slice(0, -1));
          return;
        }
        if (mapDrawToolRef.current === 'polyline' && polylineStartRef.current) {
          e.preventDefault();
          setPolylineStart(null);
          setPointerLngLat(null);
          return;
        }
        e.preventDefault();
        undoRedoRef.current.undo();
        return;
      }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        undoRedoRef.current.redo();
        return;
      }
      if (e.key === 'Escape') {
        cancelCurrentDrawing();
        setGeoAiInspectCard(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelCurrentDrawing]);

  /** Layer ids passed to queryRenderedFeatures (must exist on the style). */
  const satelliteQueryableLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (!isMapStyleReady) return ids;
    for (const layer of customLayersForMapPaint) {
      if (!layer.visible) continue;
      const sid = siSafeMapboxLayerId(layer.id);
      if (siCustomLayerShouldClusterPoints(layer)) {
        ids.push(`${sid}-cluster`, `${sid}-cluster-count`, `${sid}-fill`, `${sid}-line`, `${sid}-circle`);
      } else {
        ids.push(`${sid}-fill`, `${sid}-line`, `${sid}-circle`);
      }
      if (layer.markerImageId) ids.push(`${sid}-marker`);
      if (typeof layer.labelFieldName === 'string' && layer.labelFieldName.trim()) {
        ids.push(`${sid}-label`);
      }
    }
    if (showStacFootprintsOnMap && stacFootprintsGeoJson.features.length > 0) {
      ids.push('si-stac-footprints-fill', 'si-stac-footprints-line');
    }
    if (drawnGeometry) {
      ids.push('drawn-index-geometry-fill', 'drawn-index-geometry-line', 'drawn-index-geometry-point');
    }
    if (aoiFields.length > 0) {
      ids.push('si-aoi-fields-fill', 'si-aoi-fields-line');
    }
    if (multiAoiItems.length > 0) {
      ids.push(
        'si-multi-aoi-fill',
        'si-multi-aoi-line',
        'si-multi-aoi-cluster',
        'si-multi-aoi-cluster-count',
        'si-multi-aoi-point',
      );
    }
    return ids;
  }, [
    isMapStyleReady,
    customLayersForMapPaint,
    showStacFootprintsOnMap,
    stacFootprintsGeoJson.features.length,
    drawnGeometry,
    aoiFields.length,
    multiAoiItems.length,
  ]);

  const satelliteQueryableLayerIdsRef = useRef(satelliteQueryableLayerIds);
  satelliteQueryableLayerIdsRef.current = satelliteQueryableLayerIds;

  const selectAtMapGisPointRef = useRef<(lng: number, lat: number, clickEv?: MouseEvent | null) => void>(() => {});

  const selectAtMapGisPoint = useCallback(
    (lng: number, lat: number, clickEv?: MouseEvent | null) => {
      const mode = resolveSelectionSetModeFromClick(gisSelectionSetModeRef.current, clickEv);
      const map = getMapInstance() as Parameters<typeof selectFeaturesAtMapPoint>[0]['map'] | null;
      const layers = gisSelectionLayerSourcesRef.current;
      const customMeta = customLayersForMapPaintRef.current.map(l => ({
        id: String(l.id),
        name: l.name,
        popupConfig: l.popupConfig,
        geojson: l.geojson as { features?: unknown[] } | null | undefined,
      }));

      if (map?.queryRenderedFeatures && map.project) {
        const { hits, overlapState } = selectFeaturesAtMapPoint({
          map,
          lng,
          lat,
          queryableLayerIds: satelliteQueryableLayerIdsRef.current,
          layers,
          customLayers: customMeta,
          selectableLayerIds: gisSelectableLayerIds,
          overlapState: gisSelectionOverlapRef.current,
          pickSingle: true,
        });
        gisSelectionOverlapRef.current = overlapState;
        setGisSelectionOverlapState(overlapState);
        applyGisSelectionHits(hits, { fitBounds: hits.length === 1 && mode === 'new', mode });
        return;
      }

      const fallback = selectFeaturesAtPoint(layers, gisSelectableLayerIds, lng, lat);
      applyGisSelectionHits(fallback, { fitBounds: fallback.length === 1 && mode === 'new', mode });
    },
    [applyGisSelectionHits, gisSelectableLayerIds],
  );
  selectAtMapGisPointRef.current = selectAtMapGisPoint;

  const gisSelectionContextValue = useMemo<GisSelectionContextValue>(
    () => ({
      active: gisSelectionActive,
      tool: gisSelectionTool,
      setMode: gisSelectionSetMode,
      hits: gisSelectionHits,
      layers: gisSelectionLayerSources,
      selectableLayerIds: gisSelectableLayerIds,
      overlapState: gisSelectionOverlapState,
      setActive: active => {
        setGisSelectionActive(active);
        if (!active) applyMapDrawTool('select');
      },
      setTool: setGisSelectionTool,
      setSetMode: setGisSelectionSetMode,
      setSelectableLayerIds: setGisSelectableLayerIds,
      applyHits: (incoming, opts) => applyGisSelectionHits(incoming, opts),
      clearSelection: clearGisSelection,
      syncMapHighlight: syncGisSelectionMapHighlight,
      zoomToSelection: zoomToGisSelection,
      exportSelection: exportGisSelectionGeoJson,
      selectAtMapPoint: selectAtMapGisPoint,
      setOverlapState: state => {
        gisSelectionOverlapRef.current = state;
        setGisSelectionOverlapState(state);
      },
    }),
    [
      applyGisSelectionHits,
      applyMapDrawTool,
      clearGisSelection,
      exportGisSelectionGeoJson,
      gisSelectionActive,
      gisSelectionHits,
      gisSelectionLayerSources,
      gisSelectionOverlapState,
      gisSelectionSetMode,
      gisSelectionTool,
      gisSelectableLayerIds,
      selectAtMapGisPoint,
      syncGisSelectionMapHighlight,
      zoomToGisSelection,
    ],
  );

  const handleWeatherMapPick = useCallback(
    async (lng: number, lat: number) => {
      const label = await reversePlaceLabel(lat, lng, mapboxToken);
      setWeatherLocation({ lat, lng, label });
      setIsWeatherIntelOpen(true);
      setViewState(v => ({
        ...v,
        longitude: lng,
        latitude: lat,
        zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 8),
      }));
    },
    [mapboxToken],
  );

  const handleMapClickDraw = (lng: number, lat: number, clickEv?: MouseEvent | null) => {
    if (skipNextMapClickRef.current) {
      skipNextMapClickRef.current = false;
      return;
    }
    // Standalone Measure tool consumes clicks in isolation (no AOI / identify).
    if (measureModeRef.current) {
      handleMeasureMapClick(lng, lat);
      return;
    }
    if (
      stressZonesMapInteractRef.current.showOnMap &&
      stressZonesMapInteractRef.current.hasResult &&
      stressZonesMapInteractRef.current.sectionOpen
    ) {
      setStressZonesPopupLngLat({ lng, lat });
      setStressZonesPopupZone(null);
      return;
    }
    if (
      gisSelectionActiveRef.current &&
      gisSelectionToolRef.current === 'select' &&
      mapDrawTool === 'select'
    ) {
      selectAtMapGisPointRef.current(lng, lat, clickEv ?? undefined);
      return;
    }
    if (weatherPickOnMapRef.current) {
      weatherPickOnMapRef.current = false;
      setWeatherPickOnMap(false);
      void handleWeatherMapPick(lng, lat);
      return;
    }
    if (regionalCropTrainingRef.current.pickMode) {
      const field = findAoiFieldAtLngLat(lng, lat);
      if (field) {
        setSelectedFieldId(field.id);
        void addRegionalTrainingSampleForField(field);
        return;
      }
      setRegionalCropTraining(prev => ({
        ...prev,
        statusMessage: 'Click inside a drawn field polygon to label it.',
      }));
      return;
    }
    if (mapDrawTool === 'select') {
      try {
        const map = getMapInstance() as {
          project?: (lngLat: [number, number]) => { x: number; y: number };
          queryRenderedFeatures?: (
            geometry: [number, number] | [number, number][],
            opts?: { layers?: string[] },
          ) => Array<{ layer?: { id?: string }; properties?: Record<string, unknown> }>;
          getLayer?: (id: string) => unknown;
          getStyle?: () => { layers?: Array<{ id: string }> } | null;
        } | null;
        if (map?.project && map.queryRenderedFeatures) {
          const paintLayers = customLayersForMapPaintRef.current.map(l => ({
            id: String(l.id),
            name: l.name,
            popupConfig: l.popupConfig,
            geojson: l.geojson as { features?: unknown[] } | null | undefined,
          }));

          let hits = queryMapFeaturesAtPoint(
            map as Parameters<typeof queryMapFeaturesAtPoint>[0],
            lng,
            lat,
            satelliteQueryableLayerIds,
          );

          if (!hits.length) {
            const pt = map.project([lng, lat]);
            const fallbackHits =
              map.queryRenderedFeatures([pt.x, pt.y])?.filter(
                h => !isMapIdentifyLayerSkippable(String(h?.layer?.id ?? '')),
              ) ?? [];
            hits = queryMapFeaturesAtPoint(
              map as Parameters<typeof queryMapFeaturesAtPoint>[0],
              lng,
              lat,
              fallbackHits.map(h => String(h?.layer?.id ?? '')).filter(Boolean),
            );
          }

          if (!hits.length) {
            mapIdentifyOverlapRef.current = null;
            onGeoAiTableSelectionSync('map-identify', []);
            setGeoAiInspectCard(null);
            return;
          }

          const pickIx = nextOverlapPickIndex(
            mapIdentifyOverlapRef.current,
            lng,
            lat,
            hits.length,
          );
          mapIdentifyOverlapRef.current = { lng, lat, count: hits.length, index: pickIx };
          const hit = hits[pickIx]!;
          const layerId = String(hit?.layer?.id ?? '');
          if (hit && layerId && !isMapIdentifyLayerSkippable(layerId)) {
            const title = siIdentifyTitleForLayerId(layerId, customLayersForMapPaintRef.current);
            const rawProps =
              hit.properties && typeof hit.properties === 'object' && !Array.isArray(hit.properties)
                ? (hit.properties as Record<string, unknown>)
                : {};
            const clean = sanitizeIdentifyProperties(rawProps);
            if (layerId.endsWith('-cluster') || layerId.endsWith('-cluster-count')) {
              const sourceId = layerId.replace(/-(cluster|cluster-count)$/, '');
              const clusterId = rawProps.cluster_id;
              const fullMap = (mapRef.current?.getMap?.() ?? mapRef.current) as {
                getSource?: (id: string) => {
                  getClusterExpansionZoom?: (id: number, cb: (err: Error | null, zoom: number) => void) => void;
                };
                easeTo?: (o: { center: [number, number]; zoom: number; duration?: number }) => void;
              } | null;
              const src = fullMap?.getSource?.(sourceId);
              if (
                src &&
                typeof clusterId === 'number' &&
                typeof src.getClusterExpansionZoom === 'function' &&
                typeof fullMap?.easeTo === 'function'
              ) {
                src.getClusterExpansionZoom(clusterId, (err: Error | null, z: number) => {
                  if (err != null || typeof z !== 'number' || Number.isNaN(z)) return;
                  fullMap.easeTo!({ center: [lng, lat], zoom: z, duration: 520 });
                });
                return;
              }
            }
            if (layerId.startsWith('si-multi-aoi-')) {
              if (layerId === 'si-multi-aoi-cluster' || layerId === 'si-multi-aoi-cluster-count') {
                const clusterId = rawProps.cluster_id;
                const fullMap = (mapRef.current?.getMap?.() ?? mapRef.current) as {
                  getSource?: (id: string) => {
                    getClusterExpansionZoom?: (id: number, cb: (err: Error | null, zoom: number) => void) => void;
                  };
                  easeTo?: (o: { center: [number, number]; zoom: number; duration?: number }) => void;
                } | null;
                const src = fullMap?.getSource?.('si-multi-aoi-centroids');
                if (
                  src &&
                  typeof clusterId === 'number' &&
                  typeof src.getClusterExpansionZoom === 'function' &&
                  typeof fullMap?.easeTo === 'function'
                ) {
                  src.getClusterExpansionZoom(clusterId, (err: Error | null, z: number) => {
                    if (err != null || typeof z !== 'number' || Number.isNaN(z)) return;
                    fullMap.easeTo!({ center: [lng, lat], zoom: z, duration: 520 });
                  });
                }
                return;
              }
              const aoiId = String(rawProps?.aoiId ?? '').trim();
              if (!aoiId) return;
              setActiveMultiAoiId(aoiId);
              setMultiAoiPopupIds(prev => (prev.includes(aoiId) ? prev : [...prev, aoiId]));
              const row = multiAoiItems.find(x => x.id === aoiId);
              if (row) {
                const msg = row.analysis
                  ? `Selected ${row.name}: mean ${row.analysis.mean.toFixed(3)}, min ${row.analysis.min.toFixed(3)}, max ${row.analysis.max.toFixed(3)}`
                  : `Selected ${row.name}. Run Multi-AOI analysis for independent metrics.`;
                setFieldAnalysisStatus(msg);
              }
              return;
            }
            if (layerId.startsWith('si-stac-footprints')) {
              const stacKey = String(rawProps?.stacKey ?? '').trim();
              const fromKey = stacKey ? stacItemsByStableKey.get(stacKey) : null;
              const fromFallback =
                fromKey ??
                stacItems.find(
                  item =>
                    String(item?.id ?? '') === String(rawProps?.id ?? '') &&
                    String(item?.collection ?? '') === String(rawProps?.collection ?? ''),
                ) ??
                null;
              if (fromFallback) {
                const sceneKey = stacItemStableKey(fromFallback);
                const sceneCollection = getStacItemCollection(fromFallback);
                const autoTemplate: MpcTemplateId =
                  String(sceneCollection).toLowerCase() === 'landsat-c2-l2' ? 'ndvi_landsat' : 'ndvi_s2';
                setProcessingTargetStacItem(fromFallback);
                setExploreSelectedResultKeys([sceneKey]);
                setShowStacFootprintsOnMap(true);
                setExpandedEnvSection('remote-sensing');
                setIsLayerDropdownOpen(true);
                if (sceneCollection) {
                  setExploreSelectedCollectionIds(prev => (prev.includes(sceneCollection) ? prev : [...prev, sceneCollection]));
                }
                setStacStatus(`Selected STAC footprint: ${String(fromFallback?.id ?? 'scene')}.`);
                if (autoRunNdviOnScenePick) {
                  setSelectedMpcTemplateId(autoTemplate);
                  void runMpcTemplateProcessing(autoTemplate, fromFallback);
                }
              }
              return;
            }
            const customHitLayer = resolveCustomLayerFromMapboxHit(layerId, paintLayers);
            const customHitLayerFull = customHitLayer
              ? customLayersForMapPaintRef.current.find(l => String(l.id) === customHitLayer.id)
              : null;
            if (customHitLayerFull && isAgroStructuresLayer(customHitLayerFull)) {
              const agHit = findAgroStructuresFeatureInLayer(customHitLayerFull, clean);
              if (agHit) {
                setTableSelectedKeys(new Set([agHit.featureKey]));
              }
            }
            const arcDef = siArcgisDefForIdentifyLayerId(layerId, customLayersForMapPaintRef.current);
            const built = buildGeoAiInspectCardContent({
              properties: clean,
              arcgisLayerDefinition: arcDef,
              popupConfig: customHitLayer?.popupConfig,
              queryContext: geoAiLastUserMapQueryRef.current,
              inspectCoords: { lng, lat },
            });
            const inspectCard: GeoAiInspectCardState = {
              title,
              rows: built.rows,
              inspect: built.inspect,
              lng,
              lat,
              ...pickGeoAiHumanPlaceFields(clean),
            };
            const resolvedLink = customHitLayer
              ? resolveFeatureLinkFromMapHit(hit, {
                  ...customHitLayer,
                  geojson: customHitLayerFull?.geojson as { features?: unknown[] } | null | undefined,
                })
              : null;
            const linkForTable: GeoExplorerMapLink | null = resolvedLink
              ? { type: 'feature', layerId: resolvedLink.layerId, featureKey: resolvedLink.featureKey }
              : null;
            const featureFocusKey = linkForTable
              ? `${linkForTable.layerId}::${linkForTable.featureKey}`
              : null;
            setGeoAiTableMapFocusKey(featureFocusKey);
            if (linkForTable) {
              onGeoAiTableSelectionSync('map-identify', [linkForTable]);
            } else {
              onGeoAiTableSelectionSync('map-identify', []);
            }
            if (
              customHitLayer &&
              isCustomLayerPopupEnabled(customHitLayer) &&
              !shouldSuppressGeoAiMapIdentifyPopup()
            ) {
              mergeGeoAiInspectFromMapOrTable(inspectCard, linkForTable);
            }
            return;
          }
        }
      } catch {
        /* ignore identify errors */
      }
      mapIdentifyOverlapRef.current = null;
      onGeoAiTableSelectionSync('map-identify', []);
      setGeoAiInspectCard(null);
      return;
    }
    if (mapDrawTool === 'freehand' || mapDrawTool === 'text') return;
    if (mapDrawTool === 'lasso' && !gisSelectionActiveRef.current) return;
    if (mapDrawTool === 'rectangle' || mapDrawTool === 'circle' || mapDrawTool === 'box_select') return;

    if (mapDrawTool === 'polygon') {
      if (!isSketchDrawingActiveRef.current) return;
      const map = getMapInstance();
      const shiftKey = !!clickEv?.shiftKey;
      let lngLat: [number, number] = [lng, lat];
      if (map && shiftKey && polygonRing.length >= 1) {
        const anchor = polygonRing[polygonRing.length - 1]!;
        lngLat = snapLngLatToBearingStep(anchor, lngLat, POLYGON_SNAP_BEARING_STEP_DEG);
      }
      if (map && polygonRing.length >= 3) {
        const closePx = polygonCloseSnapThresholdPx(map);
        const d = lngLatPixelDistance(map, lngLat, polygonRing[0]);
        if (d <= closePx) {
          polygonRingSketchDragRef.current = null;
          const closed = [...polygonRing, polygonRing[0]];
          const polygonGeom: GeoJSON.Polygon = { type: 'Polygon', coordinates: [closed] };
          if (gisSelectionActiveRef.current) {
            applyGisFeatureSelectionFromGeometries([polygonGeom]);
            setPolygonRing([]);
            setPolygonClosingSnap(false);
            setDrawAssistHint('');
            return;
          }
          commitUserGeometry({
            type: 'Feature',
            properties: { label: 'Drawn polygon' },
            geometry: polygonGeom,
          });
          setPolygonRing([]);
          setPolygonClosingSnap(false);
          setDrawAssistHint('');
          setMapDrawTool('select');
          return;
        }
      }
      if (map && polygonRing.length >= 1) {
        const snapPool =
          drawTargetModeRef.current === 'field' && aoiFieldSnapRef.current
            ? [...polygonRing, ...collectAoiFieldSnapVertices()]
            : polygonRing;
        const { lng: sx, lat: sy, snapped } = snapLngLatToNearestVertex(
          map,
          lngLat[0],
          lngLat[1],
          snapPool,
          POLYGON_VERTEX_SNAP_PX,
        );
        if (snapped) lngLat = [sx, sy];
      }
      setPolygonRing(prev => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(last[0] - lngLat[0], last[1] - lngLat[1]) < 1e-12) return prev;
        return [...prev, lngLat];
      });
      return;
    }

    if (mapDrawTool === 'polyline') {
      if (!polylineStart) {
        setPolylineStart([lng, lat]);
        return;
      }
      const feature = {
        type: 'Feature',
        properties: { label: 'Drawn polyline' },
        geometry: { type: 'LineString', coordinates: [polylineStart, [lng, lat]] },
      };
      if (gisSelectionActiveRef.current) {
        const mask = lineSelectionMask([polylineStart, [lng, lat]], 30);
        applyGisFeatureSelectionFromGeometries(mask as GeoJSON.Geometry[]);
        setPolylineStart(null);
        setPointerLngLat(null);
        return;
      }
      commitUserGeometry(feature);
      setPolylineStart(null);
      setPointerLngLat(null);
      setMapDrawTool('select');
      return;
    }

    if (mapDrawTool === 'point') {
      if (!isSketchDrawingActiveRef.current) return;
      commitUserGeometry(createPointFeature(lng, lat));
      setMapDrawTool('select');
    }
  };

  const handleMapContextMenu = (evt: any) => {
    if (mapDrawToolRef.current !== 'polygon') return;
    if (!isSketchDrawingActiveRef.current) return;
    const ring = polygonRingRef.current;
    if (ring.length < 3) return;
    polygonRingSketchDragRef.current = null;
    setMapDragPanEnabled(true);
    try {
      evt?.originalEvent?.preventDefault?.();
    } catch {
      /* ignore */
    }
    const closed = [...ring, ring[0]];
    commitUserGeometry({
      type: 'Feature',
      properties: { label: 'Drawn polygon' },
      geometry: { type: 'Polygon', coordinates: [closed] },
    });
    setPolygonRing([]);
    setPolygonClosingSnap(false);
    setDrawAssistHint('');
    setMapDrawTool('select');
  };

  const draftDrawGeoJson = useMemo(() => {
    const features: any[] = [];
    if (rectCirclePreview) {
      const [lng0, lat0] = rectCirclePreview.a;
      const [lng1, lat1] = rectCirclePreview.b;
      if (rectCirclePreview.kind === 'circle') {
        features.push(circleFromEdgeFeature(lng0, lat0, lng1, lat1, 72, 'Preview'));
      } else {
        features.push(bboxToPolygonFeature(lng0, lat0, lng1, lat1, 'Preview'));
      }
    }
    if (mapDrawTool === 'circle' && circleRefineDraft) {
      const { center: [clng, clat], edge: [elng, elat] } = circleRefineDraft;
      features.push(circleFromEdgeFeature(clng, clat, elng, elat, 96, 'Refine'));
      const rDeg = circleRefineRDeg([clng, clat], [elng, elat]);
      const cosLat = circleRefineCosLat(clat);
      const dirs: CircleCardinal[] = ['n', 'e', 's', 'w'];
      for (const c of dirs) {
        const p = circleRefineCardinalLngLat([clng, clat], rDeg, cosLat, c);
        features.push({
          type: 'Feature',
          properties: { draftRole: 'circleCardinal', dir: c },
          geometry: { type: 'Point', coordinates: p },
        });
      }
      features.push({
        type: 'Feature',
        properties: { draftRole: 'circleCenter' },
        geometry: { type: 'Point', coordinates: [clng, clat] },
      });
    }
    if (mapDrawTool === 'polygon') {
      const ring = polygonRing;
      if (pointerLngLat && ring.length >= 2) {
        const withPtr = [...ring, pointerLngLat, ring[0]!] as [number, number][];
        features.push({
          type: 'Feature',
          properties: { draftRole: 'polyPreviewFill' },
          geometry: { type: 'Polygon', coordinates: [withPtr] },
        });
      } else if (ring.length >= 3) {
        const closed = [...ring, ring[0]!] as [number, number][];
        features.push({
          type: 'Feature',
          properties: { draftRole: 'polyPreviewFill' },
          geometry: { type: 'Polygon', coordinates: [closed] },
        });
      }
      for (const p of ring) {
        features.push({
          type: 'Feature',
          properties: { draftRole: 'polyVertex' },
          geometry: { type: 'Point', coordinates: p },
        });
      }
      if (pointerLngLat && ring.length >= 3 && polygonClosingSnap) {
        features.push({
          type: 'Feature',
          properties: { draftRole: 'closeHint' },
          geometry: { type: 'LineString', coordinates: [ring[0], pointerLngLat] },
        });
      }
      if (pointerLngLat && ring.length) {
        const draftLine = [...ring, pointerLngLat];
        if (draftLine.length > 1) {
          features.push({
            type: 'Feature',
            properties: { draftRole: 'rubber' },
            geometry: { type: 'LineString', coordinates: draftLine },
          });
        }
      } else if (ring.length > 1) {
        features.push({
          type: 'Feature',
          properties: { draftRole: 'rubber' },
          geometry: { type: 'LineString', coordinates: ring },
        });
      }
    }
    if (mapDrawTool === 'polyline' && polylineStart) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: polylineStart } });
      if (pointerLngLat) {
        features.push({
          type: 'Feature',
          properties: { draftRole: 'rubber' },
          geometry: { type: 'LineString', coordinates: [polylineStart, pointerLngLat] },
        });
      }
    }
    if (gisSelectionActive && mapDrawTool === 'lasso' && gisLassoPreviewRing.length >= 2) {
      const closed =
        gisLassoPreviewRing.length >= 3
          ? ([...gisLassoPreviewRing, gisLassoPreviewRing[0]!] as [number, number][])
          : gisLassoPreviewRing;
      if (closed.length >= 3) {
        features.push({
          type: 'Feature',
          properties: { draftRole: 'polyPreviewFill' },
          geometry: { type: 'Polygon', coordinates: [closed] },
        });
      }
      features.push({
        type: 'Feature',
        properties: { draftRole: 'rubber' },
        geometry: { type: 'LineString', coordinates: gisLassoPreviewRing },
      });
    }
    if (!features.length) return null;
    return { type: 'FeatureCollection', features };
  }, [mapDrawTool, polygonRing, polylineStart, pointerLngLat, rectCirclePreview, polygonClosingSnap, circleRefineDraft, gisSelectionActive, gisLassoPreviewRing]);

  const editHandlesGeoJson = useMemo(() => {
    if (mapDrawTool !== 'select' || !showEditHandles) return null;
    const fieldRow = selectedFieldId ? aoiFields.find(f => f.id === selectedFieldId) : null;
    const geom = fieldRow?.geometry ?? drawnGeometry?.geometry;
    if (!geom) return null;
    const verts = collectVertexRefs(geom);
    if (!verts.length) return null;
    return {
      type: 'FeatureCollection',
      features: verts.map((v, i) => ({
        type: 'Feature',
        properties: { vi: i },
        geometry: { type: 'Point', coordinates: v.coord },
      })),
    };
  }, [mapDrawTool, showEditHandles, drawnGeometry, aoiFields, selectedFieldId]);

  const aoiFieldsMapGeoJson = useMemo(() => {
    if (!aoiFields.length) return null;
    return siAoiFieldsToFeatureCollection(aoiFields);
  }, [aoiFields]);

  const regionalCalibratedGeoJson = useMemo(() => {
    if (!regionalCropTraining.overlayVisible || !regionalCropTraining.calibration) return null;
    const fields = aoiFields.map(f => ({ id: f.id, name: f.name, geometry: f.geometry }));
    const fc = buildCalibratedFieldsGeoJson(fields, regionalCropTraining.calibration.assignments);
    return fc.features.length ? fc : null;
  }, [regionalCropTraining.overlayVisible, regionalCropTraining.calibration, aoiFields]);

  const selectedFieldRecord = useMemo(
    () => (selectedFieldId ? aoiFields.find(f => f.id === selectedFieldId) ?? null : null),
    [aoiFields, selectedFieldId],
  );

  const aoiFieldsMapLinePaint = useMemo(
    () =>
      ({
        'line-color': ['get', 'strokeColor'],
        'line-width': [
          'case',
          ['==', ['get', 'id'], selectedFieldId ?? '__si_none__'],
          4,
          ['coalesce', ['get', 'strokeWidth'], 2],
        ],
        'line-opacity': drawVisualOpacity,
      }) as Record<string, unknown>,
    [selectedFieldId, drawVisualOpacity],
  );

  const aoiFieldsMapFillPaint = useMemo(
    () =>
      ({
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': ['*', ['coalesce', ['get', 'fillOpacity'], 0], drawVisualOpacity],
      }) as Record<string, unknown>,
    [drawVisualOpacity],
  );

  const restoreDrawWorkspace = () => {
    const drawWorkspaceKey = siScope.scopedStorageKey(SI_DRAW_WORKSPACE_LS_KEY_V2);
    const w = loadDrawWorkspace(drawWorkspaceKey);
    if (!w?.feature) return;
    if (w.style) setDrawStyle({ ...DEFAULT_DRAW_STYLE, ...w.style });
    setGeomUndoStack([]);
    setGeomRedoStack([]);
    updateDrawnStats(w.feature);
    const loaded = (w.fields ?? []) as SiAoiFieldRecord[];
    setAoiFields(loaded.map(x => ({ ...x, ...computeSiAoiFieldMetrics(x.geometry) })));
    setSelectedFieldId(w.selectedFieldId ?? null);
    setDrawTargetMode(w.drawTargetMode === 'field' ? 'field' : 'aoi');
  };

  useEffect(() => {
    saveDrawWorkspace(
      {
        feature: drawnGeometry,
        style: drawStyle,
        fields: aoiFields,
        selectedFieldId,
        drawTargetMode,
      },
      siScope.scopedStorageKey(SI_DRAW_WORKSPACE_LS_KEY_V2),
    );
  }, [drawnGeometry, drawStyle, aoiFields, selectedFieldId, drawTargetMode, siScope]);

  const exportDrawn = (kind: 'geojson' | 'wkt' | 'kml') => {
    if (!drawnGeometry) return;
    if (kind === 'geojson') {
      downloadTextFile('aoi-sketch.geojson', JSON.stringify(drawnGeometry, null, 2), 'application/geo+json');
    } else if (kind === 'wkt') {
      downloadTextFile('aoi-sketch.wkt', featureToWkt(drawnGeometry), 'text/plain');
    } else {
      downloadTextFile('aoi-sketch.kml', featureToKml(drawnGeometry), 'application/vnd.google-earth.kml+xml');
    }
  };

  /** Timeline playback: prefer generated weekly composites; fallback to rolling 14-day strip */
  useEffect(() => {
    if (!isTimelinePlaying) return;

    if (weeklyComposites.length > 0) {
      const interval = setInterval(() => {
        setSelectedDate(prev => {
          const iso = localIsoDate(prev);
          let idx = weeklyComposites.findIndex(w => iso >= w.startDate && iso <= w.endDate);
          if (idx < 0) idx = 0;
          idx = (idx + 1) % weeklyComposites.length;
          const w = weeklyComposites[idx];
          const d = dateFromLocalIso(w.startDate);
          const iso2 = localIsoDate(d);
          setImageryDateAutoFollow(false);
          setTimeSeriesStart(ps => (ps && iso2 < ps ? iso2 : ps || iso2));
          setTimeSeriesEnd(pe => (pe && iso2 > pe ? iso2 : pe || iso2));
          return d;
        });
      }, timelinePlaybackMs);
      return () => clearInterval(interval);
    }

    if (!dates.length) return;

    const interval = setInterval(() => {
      setSelectedDate(prev => {
        let index = dates.findIndex(d => d.full.toDateString() === prev.toDateString());
        if (index === -1) index = 0;
        index = (index + 1) % dates.length;
        const next = dates[index].full;
        const iso = localIsoDate(next);
        setImageryDateAutoFollow(false);
        setTimeSeriesStart(ps => (ps && iso < ps ? iso : ps || iso));
        setTimeSeriesEnd(pe => (pe && iso > pe ? iso : pe || iso));
        return next;
      });
    }, Math.max(200, Math.round(timelinePlaybackMs * 0.85)));

    return () => clearInterval(interval);
  }, [isTimelinePlaying, weeklyComposites, dates, timelinePlaybackMs]);

  useEffect(() => {
    setSelectedDate(prev => {
      const iso = localIsoDate(prev);
      if (timeSeriesStart && iso < timeSeriesStart) return dateFromLocalIso(timeSeriesStart);
      if (timeSeriesEnd && iso > timeSeriesEnd) return dateFromLocalIso(timeSeriesEnd);
      return prev;
    });
  }, [timeSeriesStart, timeSeriesEnd]);

  useEffect(() => {
    const loadLayers = async () => {
      setIsLoadingLayers(true);
      try {
        const response = await fetch(
          appendSentinelHubWmsAccessToken(`${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetCapabilities`),
        );
        if (response.ok) {
          const text = await response.text();
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'application/xml');
          const parsed = mergeAgroCloudCustomWmsLayers(parseSentinelHubWmsCapabilities(xml));
          if (parsed.length > 0) {
            setWmsLayers(getSentinelHubWmsLayerCatalog(parsed));
            return;
          }
        }
      } catch (error) {
        console.error('Failed to load WMS layers', error);
      } finally {
        setIsLoadingLayers(false);
      }
    };
    loadLayers();
  }, [wmsBaseUrl, sentinelWmsRev]);

  const remoteSensingLayerSelectGroups = useMemo(
    () => buildRemoteSensingLayerSelectGroups(wmsLayers),
    [wmsLayers],
  );

  const remoteSensingLayerOptions = useMemo(
    () => flattenRemoteSensingLayerSelectGroups(remoteSensingLayerSelectGroups),
    [remoteSensingLayerSelectGroups],
  );

  /** Keep WMS layer name aligned with categorized Remote Sensing options. */
  useEffect(() => {
    if (!remoteSensingLayerOptions.length) {
      setWmsLayer('');
      return;
    }
    setWmsLayer(prev => {
      if (prev && remoteSensingLayerOptions.some(l => l.id === prev)) return prev
      return pickDefaultSentinelWmsLayer(wmsLayers) || remoteSensingLayerOptions[0]!.id
    })
  }, [wmsLayers, remoteSensingLayerOptions]);

  /** When the chosen WMS layer matches a built-in environmental index id, keep charts/AOI logic in sync. */
  useEffect(() => {
    const raw = wmsLayer.trim();
    if (!raw) return;
    const upper = raw.toUpperCase();
    const alias: EnvironmentalIndexId | null =
      upper.includes('LST') || upper.includes('TEMP') ? 'LST' :
      upper.includes('NDSI') || upper.includes('SNOW') ? 'NDSI' :
      upper.includes('EVI') && !upper.includes('NEVI') ? 'EVI' :
      upper.includes('NDMI') || upper.includes('MOISTURE') ? 'NDMI' :
      upper.includes('NDWI') || upper.includes('MNDWI') || upper.includes('WATER') ? 'NDWI' :
      upper.includes('SAVI') ? 'SAVI' :
      upper === 'NDVI' || upper.includes('GNDVI') || upper.includes('NDRE') ? null :
      null;
    if (alias) setSelectedIndex(alias);
  }, [wmsLayer]);

  const visibleWmsLayers = useMemo(
    () => wmsLayers.filter(l => !REMOTE_SENSING_HIDDEN_LAYER_IDS.has(String(l.name || '').trim().toUpperCase())),
    [wmsLayers],
  );

  const defaultWmsLayerName = useMemo(
    () => pickDefaultSentinelWmsLayer(wmsLayers) || 'NDVI',
    [wmsLayers],
  );

  const activeWmsLayer = useMemo(() => {
    const t = wmsLayer.trim();
    if (t && remoteSensingLayerOptions.some(l => l.id === t)) return t;
    if (defaultWmsLayerName) return defaultWmsLayerName;
    if (selectedIndex === 'LST') return '';
    return selectedIndex;
  }, [wmsLayer, remoteSensingLayerOptions, selectedIndex, defaultWmsLayerName]);

  const wmsLayerSelectValue = useMemo(() => {
    const t = wmsLayer.trim();
    if (t && remoteSensingLayerOptions.some(l => l.id === t)) return t;
    return defaultWmsLayerName;
  }, [wmsLayer, remoteSensingLayerOptions, defaultWmsLayerName]);

  const wmsDate = localIsoDate(selectedDate);
  const mapLatitude = mapMetrics.latitude;
  const mapZoom = mapMetrics.zoom;
  const sentinelWmsMinZoom = useMemo(
    () => sentinelHubWmsMinZoomForLatitude(mapLatitude),
    [mapLatitude],
  );
  const sentinelWmsZoomOk = typeof mapZoom === 'number' && mapZoom >= sentinelWmsMinZoom;
  const sentinelVisible = isWmsOverlayVisible && !!activeWmsLayer;
  const agroStructuresLayer = useMemo(
    () => customLayers.find(l => isAgroStructuresLayer(l) && l.visible !== false) ?? null,
    [customLayers],
  );
  const agroStructuresLayerAoiMask = useMemo(() => {
    if (aoiMaskBuilderSettings.enabled) {
      return buildAgroStructuresLayerAoiMask(agroStructuresLayer?.geojson ?? null);
    }
    if (freezeViewportPipeline && agroStructuresLayer?.geojson) {
      return buildAgroStructuresLayerAoiMask(agroStructuresLayer.geojson);
    }
    if (
      Array.isArray(agroStructuresViewportGeoJson?.features) &&
      agroStructuresViewportGeoJson.features.length > 0
    ) {
      return buildAgroStructuresLayerAoiMask(agroStructuresViewportGeoJson);
    }
    if (isWmsOverlayVisible && activeWmsLayer && agroStructuresLayer?.geojson) {
      return buildAgroStructuresLayerAoiMask(agroStructuresLayer.geojson);
    }
    return null;
  }, [
    aoiMaskBuilderSettings.enabled,
    agroStructuresLayer?.geojson,
    agroStructuresViewportGeoJson,
    isWmsOverlayVisible,
    activeWmsLayer,
    freezeViewportPipeline,
  ]);
  const agroStructuresLayerAoiKey = useMemo(
    () => (agroStructuresLayerAoiMask ? agroStructuresLayerAoiSignature(agroStructuresLayerAoiMask) : null),
    [agroStructuresLayerAoiMask],
  );
  const agroStructuresFieldCount = useMemo(
    () => countAgroStructuresPolygons(agroStructuresLayerAoiMask),
    [agroStructuresLayerAoiMask],
  );
  const aoiMaskBuilderSourceLayer = useMemo(
    () => customLayers.find(l => String(l.id) === aoiMaskBuilderSettings.sourceLayerId) ?? null,
    [customLayers, aoiMaskBuilderSettings.sourceLayerId],
  );
  const aoiMaskBuilderSelectedKeys = useMemo(() => {
    if (activeDialogLayer && String(activeDialogLayer.id) === aoiMaskBuilderSettings.sourceLayerId) {
      return tableSelectedKeys;
    }
    return new Set<string>();
  }, [activeDialogLayer, aoiMaskBuilderSettings.sourceLayerId, tableSelectedKeys]);
  const aoiMaskBuilderMask = useMemo(() => {
    if (!aoiMaskBuilderSettings.enabled) return null;
    return resolveSiAoiMaskBuilderClipGeoJson(
      aoiMaskBuilderSourceLayer,
      aoiMaskBuilderSettings,
      aoiMaskBuilderSelectedKeys,
    );
  }, [
    aoiMaskBuilderSettings.enabled,
    aoiMaskBuilderSettings.sourceLayerId,
    aoiMaskBuilderSettings.filterField,
    aoiMaskBuilderSettings.filterValues,
    aoiMaskBuilderSettings.maskMode,
    aoiMaskBuilderSourceLayer,
    aoiMaskBuilderSelectedKeys,
  ]);
  const aoiMaskBuilderMaskKey = useMemo(
    () => siAoiMaskBuilderSignature(aoiMaskBuilderSettings, aoiMaskBuilderMask, aoiMaskBuilderSelectedKeys),
    [aoiMaskBuilderSettings, aoiMaskBuilderMask, aoiMaskBuilderSelectedKeys],
  );
  const aoiMaskBuilderFeatureCount = aoiMaskBuilderMask?.features?.length ?? 0;
  const activeAoiBoundaryMask = aoiMaskBuilderSettings.enabled
    ? (aoiMaskBuilderMask ?? agroStructuresLayerAoiMask)
    : agroStructuresLayerAoiMask;
  const activeAoiMaskKey = useMemo(() => {
    if (aoiMaskBuilderSettings.enabled) return aoiMaskBuilderMaskKey;
    if (freezeViewportPipeline) return agroStructuresLayerAoiKey;
    const viewportKey = viewportAoiMaskCacheKey(liveViewportDisplayBBox, agroStructuresFieldCount);
    if (viewportKey) return viewportKey;
    return agroStructuresLayerAoiKey;
  }, [
    aoiMaskBuilderSettings.enabled,
    aoiMaskBuilderMaskKey,
    freezeViewportPipeline,
    liveViewportDisplayBBox,
    agroStructuresFieldCount,
    agroStructuresLayerAoiKey,
  ]);
  const aoiMaskDisplayOpacity = siAoiMaskBuilderDisplayOpacityMultiplier(
    aoiMaskBuilderSettings.enabled ? aoiMaskBuilderSettings.displayMode : 'transparent-outside',
  );
  const primaryLayerSourceMask = useMemo(
    () =>
      aoiMaskBuilderSettings.enabled
        ? (aoiMaskBuilderMask ?? agroStructuresLayerAoiMask)
        : agroStructuresLayerAoiMask,
    [aoiMaskBuilderSettings.enabled, aoiMaskBuilderMask, agroStructuresLayerAoiMask],
  );
  const hasActiveLayerSourceAoi = !!primaryLayerSourceMask;
  useEffect(() => {
    primaryLayerSourceMaskRef.current = primaryLayerSourceMask;
    hasActiveLayerSourceAoiRef.current = hasActiveLayerSourceAoi;
  }, [primaryLayerSourceMask, hasActiveLayerSourceAoi]);

  /** User sketch â€” takes priority over farm / viewport masks for live index WMS clip. */
  const drawnAoiClipCollection = useMemo(
    () => normalizeDrawnAoiClipCollection(drawnGeometry),
    [drawnGeometry],
  );
  const drawnAoiClipKey = useMemo(
    () => drawnAoiClipSignature(drawnAoiClipCollection),
    [drawnAoiClipCollection],
  );

  /** Crop Classification study AOI â€” isolated from Remote Sensing sketch layer. */
  const cropClassAoiClipCollection = useMemo(
    () => normalizeDrawnAoiClipCollection(cropClassAoiGeometry),
    [cropClassAoiGeometry],
  );

  /** Sentinel WMS / Live clip â€” Layer Source only; preview sketch never replaces the farm mask. */
  const effectiveSentinelAoiSource = useMemo(
    () => primaryLayerSourceMask ?? drawnGeometry,
    [primaryLayerSourceMask, drawnGeometry],
  );
  /**
   * Stable Agro Structures AOI for WMS tiles â€” fixed extent, unaffected by pan/zoom.
   * Standalone Remote Sensing: only user-drawn sketch (or mask builder); no full-canvas fallback.
   */
  const sentinelHubWmsTileClipSource = useMemo(() => {
    if (aoiMaskBuilderSettings.enabled) {
      return effectiveSentinelAoiSource ?? drawnAoiClipCollection ?? drawnGeometry ?? null;
    }
    if (drawnAoiClipCollection?.features?.length) {
      return drawnAoiClipCollection;
    }
    if (freezeViewportPipeline && agroStructuresLayerAoiMask) {
      return agroStructuresLayerAoiMask;
    }
    return null;
  }, [
    aoiMaskBuilderSettings.enabled,
    effectiveSentinelAoiSource,
    drawnAoiClipCollection,
    drawnGeometry,
    freezeViewportPipeline,
    agroStructuresLayerAoiMask,
  ]);
  /**
   * Live Layer canvas source â€” viewport-scoped on standalone; stable AOI on dashboard embed.
   */
  const sentinelHubWmsClipSource = useMemo(() => {
    if (freezeViewportPipeline) {
      return sentinelHubWmsTileClipSource;
    }
    if (aoiMaskBuilderSettings.enabled) {
      return effectiveSentinelAoiSource ?? drawnAoiClipCollection ?? drawnGeometry ?? null;
    }
    if (drawnAoiClipCollection?.features?.length) {
      return drawnAoiClipCollection;
    }
    if (liveViewportDisplayBBox) {
      const clipBbox = expandLngLatBBox(liveViewportDisplayBBox, SI_VIEWPORT_PREFETCH_RATIO);
      const fc = agroStructuresViewportCacheRef.current.featureCollectionInBBox(clipBbox);
      const viewportMask = buildAgroStructuresLayerAoiMask(fc);
      if (viewportMask?.features?.length) return viewportMask;
    }
    if (
      Array.isArray(agroStructuresViewportGeoJson?.features) &&
      agroStructuresViewportGeoJson.features.length > 0
    ) {
      const viewportMask = buildAgroStructuresLayerAoiMask(agroStructuresViewportGeoJson);
      if (viewportMask) return viewportMask;
    }
    if (effectiveSentinelAoiSource) return effectiveSentinelAoiSource;
    return drawnGeometry ?? null;
  }, [
    freezeViewportPipeline,
    sentinelHubWmsTileClipSource,
    aoiMaskBuilderSettings.enabled,
    effectiveSentinelAoiSource,
    drawnAoiClipCollection,
    drawnGeometry,
    agroStructuresViewportGeoJson,
    liveViewportDisplayBBox,
  ]);
  const normalizedDrawnAoiGeometry = useMemo(
    () => getDrawnGeometry(drawnAoiClipCollection ?? effectiveSentinelAoiSource),
    [drawnAoiClipCollection, effectiveSentinelAoiSource],
  );

  /** Index raster displays only when clipped to an AOI (sketch, mask builder, or dashboard farm mask). */
  const hasRasterDisplayClipAoi = useMemo(() => {
    if (aoiMaskBuilderSettings.enabled && aoiMaskBuilderMask?.features?.length) return true;
    if (drawnAoiClipCollection?.features?.length) return true;
    if (cropClassificationSettings.active && cropClassAoiClipCollection?.features?.length) return true;
    if (freezeViewportPipeline && agroStructuresLayerAoiMask?.features?.length) return true;
    return false;
  }, [
    aoiMaskBuilderSettings.enabled,
    aoiMaskBuilderMask,
    drawnAoiClipCollection,
    cropClassificationSettings.active,
    cropClassAoiClipCollection,
    freezeViewportPipeline,
    agroStructuresLayerAoiMask,
  ]);

  /** Show on map â€” raster pairs with AOI clip; no full-canvas overlay without geometry. */
  const sentinelWmsOnMap = sentinelVisible && !!activeWmsLayer && hasRasterDisplayClipAoi;

  /**
   * Drawing an AOI refreshes the clipped tiles but does NOT auto-show the layer â€”
   * the user explicitly enables it via the "Show on map" toggle.
   */
  useEffect(() => {
    if (!drawnAoiClipCollection?.features?.length) return;
    sentinelWmsTilesSyncedRef.current = '';
  }, [drawnAoiClipCollection, drawnAoiClipKey]);

  useEffect(() => {
    if (!drawnAoiClipCollection?.features?.length) return;
    if (wmsLayer.trim()) return;
    const fallback = pickDefaultSentinelWmsLayer(wmsLayers) || 'NDVI';
    if (fallback) setWmsLayer(fallback);
  }, [drawnAoiClipCollection, wmsLayer, wmsLayers]);

  /** Preload Agro_Structures as soon as Layer Live is enabled. */
  useEffect(() => {
    if (freezeViewportPipeline) return;
    if (!isMapLoaded || !sentinelWmsOnMap || aoiMaskBuilderSettings.enabled || !agroStructuresLayer) return;
    syncLiveViewport(true);
  }, [
    freezeViewportPipeline,
    isMapLoaded,
    sentinelWmsOnMap,
    aoiMaskBuilderSettings.enabled,
    agroStructuresLayer,
    syncLiveViewport,
  ]);

  /** Fetch Agro_Structures when Layer Live is on but the viewport cache has no visible fields yet. */
  useEffect(() => {
    if (freezeViewportPipeline) return;
    if (!isMapLoaded || !sentinelWmsOnMap || aoiMaskBuilderSettings.enabled || !agroStructuresLayer) return;
    const visibleCount = agroStructuresViewportGeoJson?.features?.length ?? 0;
    if (visibleCount > 0) return;
    void fetchAgroStructuresForViewport();
  }, [
    freezeViewportPipeline,
    isMapLoaded,
    sentinelWmsOnMap,
    aoiMaskBuilderSettings.enabled,
    agroStructuresLayer,
    agroStructuresViewportGeoJson,
    fetchAgroStructuresForViewport,
  ]);

  const sentinelAoiLabel = useMemo(() => {
    if (aoiMaskBuilderSettings.enabled && aoiMaskBuilderMask) {
      return siAoiMaskBuilderStatusLabel(
        aoiMaskBuilderSettings,
        String(aoiMaskBuilderSourceLayer?.name ?? 'Layer'),
        aoiMaskBuilderFeatureCount,
      );
    }
    if (agroStructuresLayerAoiMask) {
      return `Sentinel Live Â· Farm Plots & PIVOT (${agroStructuresFieldCount})`;
    }
    if (drawnGeometry && hasActiveLayerSourceAoi) return 'Preview zone (separate from Layer Source)';
    if (drawnGeometry) return 'Index raster (drawn AOI clip)';
    if (hasActiveLayerSourceAoi) return 'Sentinel Live Â· Layer Source mask';
    return 'Draw an AOI to show index raster';
  }, [
    aoiMaskBuilderSettings,
    aoiMaskBuilderMask,
    aoiMaskBuilderSourceLayer?.name,
    aoiMaskBuilderFeatureCount,
    agroStructuresLayerAoiMask,
    agroStructuresFieldCount,
    drawnGeometry,
    hasActiveLayerSourceAoi,
  ]);

  /** Hydrate ArcGIS field schema for AOI Mask Builder when the source layer is missing fields. */
  useEffect(() => {
    if (!aoiMaskBuilderSettings.enabled) return;
    const layer = aoiMaskBuilderSourceLayer;
    if (!layer?.sourceUrl || !layerNeedsAoiMaskFieldHydration(layer)) return;
    let cancelled = false;
    void (async () => {
      try {
        const pjson = await fetchArcgisLayerPjson(layer.sourceUrl!, layer.authToken || getArcgisPortalToken());
        if (cancelled) return;
        const arcgisLayerDefinition = slimArcgisLayerDefinitionForStorage(pjson) ?? null;
        if (!arcgisLayerDefinition?.fields?.length) return;
        setCustomLayers(prev =>
          prev.map(l =>
            String(l.id) === String(layer.id) ? { ...l, arcgisLayerDefinition } : l,
          ),
        );
      } catch {
        /* optional schema hydrate */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aoiMaskBuilderSettings.enabled, aoiMaskBuilderSourceLayer?.id, aoiMaskBuilderSourceLayer?.sourceUrl]);

  const handleCropAlertSettingsChange = useCallback((next: CropAlertEngineSettings) => {
    setCropAlertSettings(next);
    persistCropAlertEngineSettings(next, {
      engineKey: siScope.scopedStorageKey(SI_CROP_ALERT_ENGINE_LS_KEY),
    });
  }, [siScope]);

  const handleAoiMaskBuilderSettingsChange = useCallback((next: SiAoiMaskBuilderSettings) => {
    setAoiMaskBuilderSettings(next);
    persistSiAoiMaskBuilderSettings(next, {
      storageKey: siScope.scopedStorageKey(SI_AOI_MASK_BUILDER_LS_KEY),
    });
  }, [siScope]);

  const cropAlertAoiMask = useMemo(() => {
    if (cropAlertSettings.aoiMode === 'builder') {
      return aoiMaskBuilderMask ?? agroStructuresLayerAoiMask;
    }
    return agroStructuresLayerAoiMask;
  }, [cropAlertSettings.aoiMode, aoiMaskBuilderMask, agroStructuresLayerAoiMask]);

  const cropAlertFields = useMemo(
    () => extractCropAlertFieldsFromMask(cropAlertAoiMask),
    [cropAlertAoiMask],
  );

  const cropAlertResultsOnMap = useMemo(() => {
    if (!cropAlertResults.length) return cropAlertResults;
    // Always show analyzed beacons on the map â€” viewport filter hid markers after pan/zoom races.
    return cropAlertResults;
  }, [cropAlertResults]);

  const sentinelImageryAoiKey = activeAoiMaskKey ?? (normalizedDrawnAoiGeometry ? 'drawn-aoi' : 'global');

  useEffect(() => {
    const saved = loadRegionalCropTrainingState(sentinelImageryAoiKey);
    if (saved) {
      setRegionalCropTraining(prev => ({
        ...prev,
        ...saved,
        loading: false,
        pickMode: false,
      }));
    } else {
      setRegionalCropTraining({ ...DEFAULT_REGIONAL_CROP_TRAINING_STATE });
    }
  }, [sentinelImageryAoiKey]);

  useEffect(() => {
    saveRegionalCropTrainingState(sentinelImageryAoiKey, regionalCropTraining);
  }, [sentinelImageryAoiKey, regionalCropTraining]);

  const autoLiveScenes = useMemo(
    () => resolveAutoLiveScenePair(sentinelSceneCatalog?.sceneIsos ?? []),
    [sentinelSceneCatalog?.sceneIsos],
  );

  /** Crop alerts always request from today in auto mode; used scene comes from Statistical API backward search. */
  const cropAlertRequestedDate = useMemo(
    () => (imageryDateAutoFollow ? localIsoDate() : wmsDate),
    [imageryDateAutoFollow, wmsDate],
  );

  const sentinelFetchDate = useMemo(() => {
    const resolved = imageryDateAutoFollow
      ? autoLiveScenes.currentSceneDate
      : resolveSentinelFetchDate(localIsoDate(selectedDate), sentinelSceneCatalog?.sceneIsos ?? []);
    const trimmed = String(resolved || '').trim().slice(0, 10);
    return trimmed || wmsDate || localIsoDate();
  }, [
    imageryDateAutoFollow,
    autoLiveScenes.currentSceneDate,
    selectedDate,
    sentinelSceneCatalog?.sceneIsos,
    wmsDate,
  ]);

  const cropAlertImageryContext = useMemo(
    () =>
      buildCropAlertImageryContext({
        userRequestedDate: cropAlertRequestedDate,
        fetchDate: cropAlertRequestedDate,
        latestSceneIso: sentinelSceneCatalog?.latestSceneIso ?? null,
        autoFollowImagery: imageryDateAutoFollow,
      }),
    [
      cropAlertRequestedDate,
      sentinelSceneCatalog?.latestSceneIso,
      imageryDateAutoFollow,
    ],
  );

  const stressZonesAoiGeometry = useMemo(
    () => (drawnGeometry?.geometry ?? null) as GeoJSON.Geometry | null,
    [drawnGeometry],
  );

  const stressZones = useStressZonesAnalysis({
    geometry: stressZonesAoiGeometry,
    sceneDate: sentinelFetchDate,
    enabled: expandedEnvSection === 'stress-zones' && !!stressZonesAoiGeometry,
  });

  useEffect(() => {
    stressZonesMapInteractRef.current = {
      showOnMap: stressZones.showOnMap,
      hasResult: !!stressZones.result,
      sectionOpen: expandedEnvSection === 'stress-zones',
    };
  }, [stressZones.showOnMap, stressZones.result, expandedEnvSection]);

  useEffect(() => {
    if (!stressZones.showOnMap) {
      if (stressZonesPrevWmsLayerRef.current != null && wmsLayer === 'STRESS_ZONES') {
        setWmsLayer(stressZonesPrevWmsLayerRef.current);
        stressZonesPrevWmsLayerRef.current = null;
      }
      return;
    }
    if (wmsLayer !== 'STRESS_ZONES') {
      stressZonesPrevWmsLayerRef.current = wmsLayer;
      setWmsLayer('STRESS_ZONES');
      setIsWmsOverlayVisible(true);
    }
  }, [stressZones.showOnMap, wmsLayer]);

  const handleStressZoneRowClick = useCallback(
    (zone: StressZoneAreaRow) => {
      setStressZonesPopupZone(zone);
      const geom = drawnGeometry?.geometry;
      if (geom) {
        const c = getGeoJsonCentroid(geom);
        if (Array.isArray(c) && c.length >= 2) {
          setStressZonesPopupLngLat({ lng: c[0], lat: c[1] });
        }
      }
    },
    [drawnGeometry],
  );

  const closeStressZonesPopup = useCallback(() => {
    setStressZonesPopupZone(null);
    setStressZonesPopupLngLat(null);
  }, []);

  const runCropAlertAnalysis = useCallback(() => {
    if (!cropAlertSettings.enabled) return;
    if (!cropAlertFields.length) return;
    cropAlertAbortRef.current?.abort();
    const ac = new AbortController();
    cropAlertAbortRef.current = ac;
    setCropAlertRunning(true);
    setCropAlertProgress({ done: 0, total: cropAlertFields.length, live: 0, sampled: 0, failed: 0 });

    void (async () => {
      const imageryCtx = buildCropAlertImageryContext({
        userRequestedDate: cropAlertRequestedDate,
        fetchDate: cropAlertRequestedDate,
        latestSceneIso: sentinelSceneCatalog?.latestSceneIso ?? null,
        autoFollowImagery: imageryDateAutoFollow,
      });

      try {
        const catalogScenes = sentinelSceneCatalog?.sceneIsos ?? [];
        const seriesMap = await fetchCropAlertSentinelLiveBatch(cropAlertFields, cropAlertRequestedDate, {
          concurrency: 8,
          catalogSceneIsos: catalogScenes,
          signal: ac.signal,
          onProgress: setCropAlertProgress,
          cacheScope: siScope.scope,
        });

        const liveSnapshots = new Map<
          string,
          {
            current: CropAlertIndexSnapshot
            previous7: CropAlertIndexSnapshot
            previous30: CropAlertIndexSnapshot
            seasonalPeakNdvi: number
            imagery?: import('../../lib/siCropAlertImageryValidation').CropAlertFieldImageryMeta
            ndviSeries?: import('../../lib/siCropAlertNdviTimeSeries').NdviSceneSeriesAnalysis | null
            trend?: import('../../lib/siCropAlertEngine').CropAlertTrend
          }
        >();

        let liveCount = 0;
        for (const field of cropAlertFields) {
          const series = seriesMap.get(field.fieldKey);
          if (!series) continue;
          const snaps = buildSnapshotsFromSentinelSeries(
            field,
            cropAlertRequestedDate,
            series,
            imageryCtx,
            {
              catalogSceneIsos: catalogScenes,
              preferLatestAvailable: imageryDateAutoFollow,
            },
          );
          if (snaps.source === 'live' && snaps.imagery.liveVerified) liveCount += 1;
          liveSnapshots.set(field.fieldKey, {
            current: snaps.current,
            previous7: snaps.previous7,
            previous30: snaps.previous30,
            seasonalPeakNdvi: snaps.seasonalPeakNdvi,
            imagery: snaps.imagery,
            ndviSeries: snaps.ndviSeries,
            trend: snaps.trend,
          });
        }

        if (ac.signal.aborted) return;

        const results = runCropAlertEngine(
          cropAlertFields,
          cropAlertRequestedDate,
          cropAlertSettings,
          liveSnapshots,
        );
        for (const r of results) cropAlertResultsByKeyRef.current.set(r.fieldKey, r);
        const merged = [...cropAlertResultsByKeyRef.current.values()];
        setCropAlertResults(merged);
        setCropAlertLiveFieldCount(liveCount);
        setCropAlertLastRunAt(Date.now());
        persistCropAlertResultsCache(
          {
            referenceDate: cropAlertRequestedDate,
            userRequestedDate: cropAlertRequestedDate,
            imageryContext: imageryCtx,
            results,
            lastRunAt: Date.now(),
            liveFieldCount: liveCount,
          },
          { resultsKey: cropAlertResultsStorageKey },
        );
      } catch {
        if (!ac.signal.aborted && cropAlertFields.length) {
          const fallbackResults = runCropAlertEngine(
            cropAlertFields,
            cropAlertRequestedDate,
            cropAlertSettings,
          );
          for (const r of fallbackResults) cropAlertResultsByKeyRef.current.set(r.fieldKey, r);
          setCropAlertResults([...cropAlertResultsByKeyRef.current.values()]);
          setCropAlertLastRunAt(Date.now());
          setStacStatus('Crop alerts: using field model â€” configure Sentinel OAuth for live NDVI.');
        } else if (!ac.signal.aborted) {
          setCropAlertLiveFieldCount(0);
          setCropAlertLastRunAt(Date.now());
          setStacStatus('Crop alerts: no fields to analyze.');
        }
      } finally {
        if (!ac.signal.aborted) {
          setCropAlertRunning(false);
          setCropAlertProgress(null);
        }
      }
    })();
  }, [
    cropAlertFields,
    cropAlertSettings,
    cropAlertRequestedDate,
    imageryDateAutoFollow,
    sentinelSceneCatalog?.sceneIsos,
    siScope,
  ]);

  const cropClassificationHasAoi = Boolean(
    getDrawnGeometry(cropClassAoiClipCollection ?? cropClassAoiGeometry),
  );

  useEffect(() => {
    regionalCropTrainingRef.current = regionalCropTraining;
  }, [regionalCropTraining]);

  const findAoiFieldAtLngLat = useCallback(
    (lng: number, lat: number): SiAoiFieldRecord | null => {
      for (const field of aoiFieldsRef.current) {
        const g = field.geometry;
        if (g.type === 'Polygon' && pointInPolygonGeometry(lng, lat, g)) return field;
        if (g.type === 'MultiPolygon') {
          for (const poly of g.coordinates) {
            if (pointInPolygonGeometry(lng, lat, { type: 'Polygon', coordinates: poly })) return field;
          }
        }
      }
      return null;
    },
    [],
  );

  const handleCropClassificationSettingsChange = useCallback((patch: Partial<CropClassificationSettings>) => {
    setCropClassificationSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const handleRegionalCropTrainingChange = useCallback((patch: Partial<RegionalCropTrainingState>) => {
    setRegionalCropTraining(prev => ({ ...prev, ...patch }));
  }, []);

  const addRegionalTrainingSampleForField = useCallback(
    async (field: SiAoiFieldRecord, cropId?: string) => {
      const crop =
        cropDefById(regionalCropTrainingRef.current.catalog, cropId ?? regionalCropTrainingRef.current.activeCropId) ??
        cropDefById(regionalCropTrainingRef.current.catalog, regionalCropTrainingRef.current.activeCropId)
      if (!crop) {
        setRegionalCropTraining(prev => ({ ...prev, statusMessage: 'Enable at least one regional crop type.' }));
        return;
      }
      regionalCropTrainingAbortRef.current?.abort();
      const ac = new AbortController();
      regionalCropTrainingAbortRef.current = ac;
      const season = defaultCropClassificationSeason(
        cropClassificationSettings.seasonEnd || wmsDate,
        120,
      )
      setRegionalCropTraining(prev => ({
        ...prev,
        loading: true,
        statusMessage: `Extracting spectral signature for ${field.name}â€¦`,
      }))
      try {
        const features = await extractSpectralFeaturesForGeometry(
          field.geometry,
          cropClassificationSettings.seasonStart || season.seasonStart,
          cropClassificationSettings.seasonEnd || season.seasonEnd,
          ac.signal,
        )
        if (ac.signal.aborted) return
        const sample: RegionalTrainingSample = {
          id: newRegionalTrainingSampleId(),
          cropId: crop.id,
          cropLabel: crop.label,
          color: crop.color,
          geometry: field.geometry,
          fieldId: field.id,
          fieldName: field.name,
          features,
          createdAt: Date.now(),
        }
        setRegionalCropTraining(prev => ({
          ...prev,
          loading: false,
          pickMode: false,
          samples: [...prev.samples.filter(s => s.fieldId !== field.id), sample],
          statusMessage: features
            ? `Sample added: ${field.name} â†’ ${crop.label} (${features.sceneCount} scenes).`
            : `Sample saved for ${field.name} but no clear Sentinel scenes in season range.`,
        }))
      } catch (err) {
        if (ac.signal.aborted) return
        setRegionalCropTraining(prev => ({
          ...prev,
          loading: false,
          statusMessage: err instanceof Error ? err.message : 'Failed to extract training sample.',
        }))
      }
    },
    [cropClassificationSettings.seasonEnd, cropClassificationSettings.seasonStart, wmsDate],
  )

  const handleRegionalAddSampleFromField = useCallback(() => {
    const fieldId = selectedFieldIdRef.current
    const field = fieldId ? aoiFieldsRef.current.find(f => f.id === fieldId) : null
    if (!field) {
      setRegionalCropTraining(prev => ({
        ...prev,
        statusMessage: 'Select a field on the map first (draw fields inside AOI).',
      }))
      return
    }
    void addRegionalTrainingSampleForField(field)
  }, [addRegionalTrainingSampleForField])

  const handleRegionalRemoveSample = useCallback((id: string) => {
    setRegionalCropTraining(prev => ({
      ...prev,
      samples: prev.samples.filter(s => s.id !== id),
      calibration: null,
      statusMessage: 'Training sample removed.',
    }))
  }, [])

  const runRegionalCropCalibration = useCallback(async () => {
    const fields = aoiFieldsRef.current
    if (!fields.length) {
      setRegionalCropTraining(prev => ({
        ...prev,
        statusMessage: 'Draw field polygons inside AOI before calibration.',
      }))
      return
    }
    const season = defaultCropClassificationSeason(
      cropClassificationSettings.seasonEnd || wmsDate,
      120,
    )
    const seasonStart = cropClassificationSettings.seasonStart || season.seasonStart
    const seasonEnd = cropClassificationSettings.seasonEnd || season.seasonEnd
    regionalCropTrainingAbortRef.current?.abort()
    const ac = new AbortController()
    regionalCropTrainingAbortRef.current = ac
    setRegionalCropTraining(prev => ({
      ...prev,
      loading: true,
      statusMessage: 'Calibrating regional crop assignmentsâ€¦',
    }))
    try {
      const fieldFeatures = new Map<string, Awaited<ReturnType<typeof extractSpectralFeaturesForGeometry>>>()
      for (const field of fields) {
        if (ac.signal.aborted) return
        const features = await extractSpectralFeaturesForGeometry(
          field.geometry,
          seasonStart,
          seasonEnd,
          ac.signal,
        )
        fieldFeatures.set(field.id, features)
      }
      if (ac.signal.aborted) return
      const result = calibrateRegionalCrops({
        samples: regionalCropTrainingRef.current.samples,
        catalog: regionalCropTrainingRef.current.catalog,
        fields: fields.map(f => ({ id: f.id, name: f.name, geometry: f.geometry })),
        fieldFeatures,
        seasonStart,
        seasonEnd,
      })
      setRegionalCropTraining(prev => ({
        ...prev,
        loading: false,
        calibration: result,
        overlayVisible: true,
        statusMessage: result.statusMessage,
      }))
    } catch (err) {
      if (ac.signal.aborted) return
      setRegionalCropTraining(prev => ({
        ...prev,
        loading: false,
        statusMessage: err instanceof Error ? err.message : 'Regional calibration failed.',
      }))
    }
  }, [cropClassificationSettings.seasonEnd, cropClassificationSettings.seasonStart, wmsDate])

  const handleRegionalClearCalibration = useCallback(() => {
    setRegionalCropTraining(prev => ({
      ...prev,
      calibration: null,
      overlayVisible: false,
      statusMessage: 'Regional calibration overlay cleared.',
    }))
  }, [])

  const runCropClassification = useCallback(() => {
    const aoi = getDrawnGeometry(cropClassAoiClipCollection ?? cropClassAoiGeometry);
    if (!aoi) {
      setCropClassificationSettings(prev => ({
        ...prev,
        statusMessage: 'Draw a study AOI on the classification layer first.',
        analysisStep: 1,
      }));
      return;
    }
    if (cropClassificationRunTimerRef.current) {
      window.clearTimeout(cropClassificationRunTimerRef.current);
    }
    const season = defaultCropClassificationSeason(wmsDate, 120);
    setCropClassificationRunning(true);
    setCropClassificationSettings(prev => ({
      ...prev,
      ...season,
      active: true,
      analysisStep: 4,
      statusMessage: 'Building multi-temporal stack and classifying pixels inside AOIâ€¦',
    }));
    setIsWmsOverlayVisible(true);
    setWmsLayer(CROP_CLASSIFICATION_LAYER_ID);
    sentinelWmsTilesSyncedRef.current = '';
    cropClassificationRunTimerRef.current = window.setTimeout(() => {
      setCropClassificationRunning(false);
      setCropClassificationSettings(prev => ({
        ...prev,
        lastRunAt: Date.now(),
        statusMessage: `Classification layer active Â· ${season.seasonStart} â†’ ${season.seasonEnd} Â· clipped to AOI.`,
      }));
      cropClassificationRunTimerRef.current = null;
    }, 650);
  }, [cropClassAoiClipCollection, cropClassAoiGeometry, wmsDate]);

  const stopCropClassificationLayer = useCallback(() => {
    setCropClassificationSettings(prev => ({ ...prev, active: false, statusMessage: 'Classification layer hidden.' }));
    setWmsLayer(prev => (isCropClassificationLayerId(prev) ? '' : prev));
  }, []);

  useEffect(() => {
    if (!cropClassificationSettings.active) return;
    const season = defaultCropClassificationSeason(wmsDate, 120);
    setCropClassificationSettings(prev => ({
      ...prev,
      seasonStart: prev.seasonStart || season.seasonStart,
      seasonEnd: wmsDate,
    }));
    sentinelWmsTilesSyncedRef.current = '';
  }, [wmsDate, cropClassificationSettings.active]);

  useEffect(() => {
    if (!cropClassificationSettings.active || !cropClassificationHasAoi) return;
    sentinelWmsTilesSyncedRef.current = '';
  }, [cropClassAoiClipCollection, cropClassAoiGeometry, cropClassificationSettings.active, cropClassificationHasAoi]);

  useEffect(() => {
    return () => {
      if (cropClassificationRunTimerRef.current) {
        window.clearTimeout(cropClassificationRunTimerRef.current);
      }
      regionalCropTrainingAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!cropAlertSettings.enabled) {
      cropAlertAbortRef.current?.abort();
      cropAlertResultsByKeyRef.current.clear();
      setCropAlertResults([]);
      setSelectedCropAlertFieldKey(null);
      setCropAlertMapPopupFieldKey(null);
      setCropAlertLiveFieldCount(0);
      setCropAlertProgress(null);
      cropAlertPrevCriticalKeysRef.current = new Set();
      return;
    }

    const cached = loadCropAlertResultsCache(cropAlertRequestedDate, cropAlertRequestedDate, {
      resultsKey: cropAlertResultsStorageKey,
    });
    if (isCropAlertResultsCacheFresh(cached, cropAlertRequestedDate, cropAlertSettings.refreshMinutes, cropAlertRequestedDate)) {
      cropAlertResultsByKeyRef.current = new Map(cached!.results.map(r => [r.fieldKey, r]));
      setCropAlertResults(cached!.results);
      setCropAlertLastRunAt(cached!.lastRunAt);
      setCropAlertLiveFieldCount(cached!.liveFieldCount);
      return;
    }

    if (cached?.results.length) {
      cropAlertResultsByKeyRef.current = new Map(cached.results.map(r => [r.fieldKey, r]));
      setCropAlertResults(cached.results);
      setCropAlertLastRunAt(cached.lastRunAt);
      setCropAlertLiveFieldCount(cached.liveFieldCount);
    }

    runCropAlertAnalysis();
  }, [
    cropAlertSettings.enabled,
    cropAlertSettings.aoiMode,
    cropAlertSettings.indices,
    cropAlertSettings.alertTypes,
    cropAlertRequestedDate,
    cropAlertFields.length,
    runCropAlertAnalysis,
  ]);

  /** Re-analyze visible fields when map extent changes (debounced lazy load). */
  useEffect(() => {
    if (freezeViewportPipeline) return;
    if (!cropAlertSettings.enabled || !liveViewportDisplayBBox) return;
    const t = window.setTimeout(() => runCropAlertAnalysis(), SI_VIEWPORT_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [cropAlertSettings.enabled, liveViewportDisplayBBox, runCropAlertAnalysis, freezeViewportPipeline]);

  useEffect(() => {
    if (!cropAlertSettings.enabled) return;
    const ms = Math.max(1, cropAlertSettings.refreshMinutes) * 60_000;
    const id = window.setInterval(() => runCropAlertAnalysis(), ms);
    return () => window.clearInterval(id);
  }, [cropAlertSettings.enabled, cropAlertSettings.refreshMinutes, runCropAlertAnalysis]);

  useEffect(() => {
    if (!cropAlertSettings.enabled || !cropAlertSettings.notifyInApp) return;
    const critical = cropAlertResults.filter(
      r => r.liveVerified && (r.severity === 'critical' || r.status === 'critical'),
    );
    const nextKeys = new Set(critical.map(r => r.fieldKey));
    const prev = cropAlertPrevCriticalKeysRef.current;
    const fresh = critical.filter(r => !prev.has(r.fieldKey));
    cropAlertPrevCriticalKeysRef.current = nextKeys;
    if (!fresh.length) return;
    setCropAlertNotifications(prevNotes => {
      const added = fresh.slice(0, 4).map(r => ({
        id: `${r.fieldKey}-${Date.now()}`,
        fieldKey: r.fieldKey,
        title: r.title,
        message: r.message,
        severity: r.severity,
      }));
      return [...added, ...prevNotes].slice(0, 8);
    });
  }, [cropAlertResults, cropAlertSettings.enabled, cropAlertSettings.notifyInApp]);

  const handleCropAlertMarkerSelect = useCallback(
    (fieldKey: string) => {
      setSelectedCropAlertFieldKey(fieldKey);
      setCropAlertMapPopupFieldKey(fieldKey);
      const row = cropAlertResults.find(r => r.fieldKey === fieldKey);
      if (row?.centroid) {
        setViewState(v => ({
          ...v,
          longitude: row.centroid[0],
          latitude: row.centroid[1],
          zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
        }));
      }
    },
    [cropAlertResults],
  );

  const handleCropAlertPopupClose = useCallback(() => {
    setCropAlertMapPopupFieldKey(null);
  }, []);

  const resetSentinelImageryDateAuto = useCallback(() => {
    const target = resolveAutoLiveScenePair(sentinelSceneCatalog?.sceneIsos ?? []).currentSceneDate;
    setImageryDateAutoFollow(true);
    saveSentinelImageryDatePrefsForAoi(sentinelImageryAoiKey, { autoFollow: true });
    applySelectedDate(dateFromLocalIso(target));
    const range = getDefaultSentinelTimeSeriesRange(undefined, target);
    setTimeSeriesStart(range.start);
    setTimeSeriesEnd(range.end);
  }, [sentinelImageryAoiKey, sentinelSceneCatalog?.sceneIsos]);

  /** Per-AOI prefs: manual date pauses auto-update for this AOI only. */
  useEffect(() => {
    const prefs = getSentinelImageryDatePrefsForAoi(sentinelImageryAoiKey);
    setImageryDateAutoFollow(prefs.autoFollow);
    if (!prefs.autoFollow && prefs.manualIso) {
      setSelectedDate(dateFromLocalIso(prefs.manualIso));
    }
  }, [sentinelImageryAoiKey]);

  /** STAC catalog: latest Sentinel-2 L2A scenes for active AOI (drives auto date + fallback). */
  useEffect(() => {
    if (!effectiveSentinelAoiSource) {
      setSentinelSceneCatalog(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setIsFetchingSentinelScenes(true);
    fetchSentinelSceneCatalogForAoi(effectiveSentinelAoiSource, {
      signal: controller.signal,
    })
      .then(catalog => {
        if (!cancelled) setSentinelSceneCatalog(catalog);
      })
      .finally(() => {
        if (!cancelled) setIsFetchingSentinelScenes(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [effectiveSentinelAoiSource, sentinelImageryAoiKey]);

  /** Auto mode: start from today, resolve latest valid catalog scene. */
  useEffect(() => {
    if (!imageryDateAutoFollow) return;

    const syncAutoImageryDate = () => {
      const target = autoLiveScenes.currentSceneDate;
      setSelectedDate(prev => {
        if (localIsoDate(prev) === target) return prev;
        return dateFromLocalIso(target);
      });
      const range = getDefaultSentinelTimeSeriesRange(undefined, target);
      setTimeSeriesStart(range.start);
      setTimeSeriesEnd(range.end);
    };

    syncAutoImageryDate();
    const intervalId = window.setInterval(syncAutoImageryDate, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncAutoImageryDate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [imageryDateAutoFollow, autoLiveScenes.currentSceneDate, sentinelSceneCatalog?.sceneIsos]);

  useEffect(() => {
    if (!aoiMaskBuilderSettings.enabled || !aoiMaskBuilderSettings.liveUpdate) return;
    const sid = aoiMaskBuilderSettings.sentinelLayerId.trim();
    if (!sid) return;
    setWmsLayer(prev => (prev === sid ? prev : sid));
    setIsWmsOverlayVisible(true);
  }, [
    aoiMaskBuilderSettings.enabled,
    aoiMaskBuilderSettings.liveUpdate,
    aoiMaskBuilderSettings.sentinelLayerId,
  ]);
  const activeBasemapId = useMemo(() => pickDefaultBasemapId(basemapId), [basemapId]);
  const currentBasemapEntry = useMemo(() => {
    return (
      catalogEntryById(basemapCatalog, activeBasemapId) ??
      catalogEntryById(basemapCatalog, DEFAULT_BASEMAP_ID)!
    );
  }, [basemapCatalog, activeBasemapId]);
  /** Raw catalogue style for the active basemap. */
  const rawBasemapStyle = useMemo(
    () => (currentBasemapEntry ? mapboxGlStyleForEntry(currentBasemapEntry, '') : EMPTY_MAP_STYLE),
    [currentBasemapEntry],
  );
  /**
   * Ordered raster specs for the active basemap â€” only for PURE raster styles
   * (these support the flicker-free in-place tile swap). Styles with terrain
   * (3D Topographic) yield [] here and fall back to a full style rebuild.
   */
  const activeBasemapRasterSpecs = useMemo(
    () => (siIsPureRasterStyle(rawBasemapStyle) ? siExtractRasterSpecs(rawBasemapStyle) : []),
    [rawBasemapStyle],
  );
  const effectiveMapStyle = useMemo(
    () => (activeBasemapRasterSpecs.length ? siBuildStableRasterStyle(activeBasemapRasterSpecs) : rawBasemapStyle),
    [activeBasemapRasterSpecs, rawBasemapStyle],
  );
  const mapboxAccessTokenForMap = getMapboxGlRendererToken();

  const siBasemapSwapRef = useRef(activeBasemapId);
  /** How many raster layers the currently-applied basemap style has. */
  const siBasemapLayerCountRef = useRef(activeBasemapRasterSpecs.length);

  /** Swap raster basemap in-place (same as GIS Map) â€” avoids black globe when react-map-gl style prop alone updates. */
  useEffect(() => {
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map || siBasemapSwapRef.current === activeBasemapId) return;

    // â”€â”€ Fast path: pure tile swap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // When the new basemap has the same raster-layer structure as the current
    // one (the common case â€” all single-layer imagery/street basemaps), replace
    // ONLY the tile URLs of the already-present sources. The map instance, the
    // style, the camera (center/zoom/pitch/bearing) and every overlay stay
    // untouched: no setStyle, no jumpTo/fitBounds, no flicker, no zoom motion.
    const specs = activeBasemapRasterSpecs;
    const sameStructure =
      specs.length > 0 &&
      specs.length === siBasemapLayerCountRef.current &&
      specs.every((_, i) => {
        try {
          const src = map.getSource?.(`${SI_BASE_SOURCE_PREFIX}${i}`);
          return !!src && typeof (src as any).setTiles === 'function';
        } catch {
          return false;
        }
      });
    if (sameStructure) {
      let swapped = true;
      specs.forEach((spec, i) => {
        try {
          (map.getSource(`${SI_BASE_SOURCE_PREFIX}${i}`) as any).setTiles(spec.tiles);
        } catch {
          swapped = false;
        }
      });
      if (swapped) {
        siBasemapSwapRef.current = activeBasemapId;
        siBasemapLayerCountRef.current = specs.length;
        basemapRasterFallbackRef.current = false;
        // Keep terrain in sync without moving the camera.
        try {
          syncAgroCloudTerrain3d(map, activeBasemapId, viewStateLiveRef.current.pitch);
        } catch {
          /* ignore */
        }
        return;
      }
    }

    // â”€â”€ Fallback path: structural change â†’ rebuild style, preserve camera â”€â”€â”€â”€
    siBasemapSwapRef.current = activeBasemapId;
    siBasemapLayerCountRef.current = specs.length;
    basemapRasterFallbackRef.current = false;
    setIsMapStyleReady(false);
    cancelAgroCloudTerrainSync(map);
    // Preserve the exact camera (center/zoom/bearing/pitch) across the basemap
    // swap so the viewport never resets or re-zooms when the base layer changes.
    let preservedCamera: { center: [number, number]; zoom: number; bearing: number; pitch: number } | null = null;
    try {
      const c = map.getCenter?.();
      if (c) {
        preservedCamera = {
          center: [c.lng, c.lat],
          zoom: map.getZoom?.() ?? viewStateLiveRef.current.zoom,
          bearing: map.getBearing?.() ?? 0,
          pitch: map.getPitch?.() ?? 0,
        };
      }
    } catch {
      preservedCamera = null;
    }
    const restoreCamera = () => {
      if (!preservedCamera) return;
      try {
        // jumpTo is instantaneous â€” restores the viewport with no animation or reload.
        map.jumpTo?.(preservedCamera);
      } catch {
        /* ignore */
      }
    };
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(safety);
      restoreCamera();
      setIsMapStyleReady(true);
      siEnsureGlobeProjection();
      warmAgroCloudTerrainDemSource(map);
      syncAgroCloudTerrain3d(map, activeBasemapId);
      restoreCamera();
      ensureAgroCloudMapScrollZoom(map);
      applyAgroCloudMapPerformanceTuning(map);
      try {
        applyAgroCloudMapboxBranding(map.getContainer?.());
      } catch {
        /* ignore */
      }
    };
    const safety = window.setTimeout(finish, 8000);
    try {
      map.setStyle(effectiveMapStyle as any);
      restoreCamera();
      if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) finish();
      else map.once('style.load', finish);
    } catch {
      finish();
    }
    return () => {
      done = true;
      window.clearTimeout(safety);
      try {
        map.off('style.load', finish);
      } catch {
        /* ignore */
      }
    };
  }, [activeBasemapId, activeBasemapRasterSpecs, effectiveMapStyle, siEnsureGlobeProjection]);

  useEffect(() => {
    if (isMapStyleReady && !prevMapStyleReadyRef.current) {
      setCustomLayersMapEpoch(epoch => epoch + 1);
    }
    prevMapStyleReadyRef.current = isMapStyleReady;
  }, [isMapStyleReady]);

  /** Apply the user's base-map on/off toggle by hiding/showing its raster layers. */
  useEffect(() => {
    if (!isMapStyleReady) return;
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map || typeof map.getStyle !== 'function') return;
    const isBasemapRasterLayer = (id: string, type?: string) =>
      type === 'raster' &&
      (id.startsWith(SI_BASE_LAYER_PREFIX) ||
        /^layer-\d+$/.test(id) ||
        id === 'topo-base-layer' ||
        id === 'sat3d-base-layer' ||
        id === 'google-earth-sat-layer' ||
        id.startsWith('topo-fallback-layer-'));
    try {
      const layers = map.getStyle()?.layers ?? [];
      for (const layer of layers) {
        if (!isBasemapRasterLayer(layer.id, layer.type)) continue;
        map.setLayoutProperty?.(layer.id, 'visibility', basemapVisible ? 'visible' : 'none');
      }
    } catch {
      /* style mid-swap */
    }
  }, [basemapVisible, isMapStyleReady, activeBasemapId, activeBasemapRasterSpecs]);

  /** Remount overlay sources whenever Added layers change while the style is ready. */
  useEffect(() => {
    if (!isMapStyleReady) return;
    setCustomLayersMapEpoch(epoch => epoch + 1);
  }, [customLayersCanvasSig, isMapStyleReady]);

  /** Rehydrate GIS Content portal layers from the portal store (live ArcGIS refresh when linked). */
  useEffect(() => {
    void (async () => {
      const prev = customLayersRef.current;
      const entries = await Promise.all(
        prev.map(async layer => {
          const portalId = parseGisContentPortalLayerUrl(String(layer.sourceUrl || ''));
          if (!portalId) return { layer, changed: false as const };
          const row = getGisContentRowById(portalId);
          if (!row || isGisContentRowInRecycle(row)) return { layer, changed: false as const };
          try {
            const payload = await buildGisContentMapLayerPayloadAsync(row);
            if (!payload.geojson?.features?.length) return { layer, changed: false as const };
            const changed =
              layer.name !== payload.name ||
              JSON.stringify(layer.geojson) !== JSON.stringify(payload.geojson);
            if (!changed) return { layer, changed: false as const };
            return {
              layer: {
                ...layer,
                geojson: payload.geojson,
                name: payload.name,
                visible: layer.visible !== false,
              },
              changed: true as const,
            };
          } catch {
            return { layer, changed: false as const };
          }
        }),
      );
      if (!entries.some(entry => entry.changed)) return;
      setCustomLayers(entries.map(entry => entry.layer));
    })();
  }, [gisContentPortal.version]);

  /** Paint Added layers directly on the Mapbox canvas (survives basemap style swaps). */
  useEffect(() => {
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map || !isMapStyleReady) return;

    const syncVisibleLayersToCanvas = () => {
      siPaintCustomLayersOnMapboxCanvas(
        map,
        customLayersForMapPaintRef.current,
        siImperativeCustomLayerSourceIdsRef.current,
        { suppressPrimaryAoiFill: sentinelWmsOnMap },
      );
    };

    syncVisibleLayersToCanvas();
    const raf1 = window.requestAnimationFrame(() => {
      syncVisibleLayersToCanvas();
      window.requestAnimationFrame(syncVisibleLayersToCanvas);
    });
    const onStyleLoad = () => {
      siImperativeCustomLayerSourceIdsRef.current.clear();
      window.requestAnimationFrame(syncVisibleLayersToCanvas);
    };
    map.on('style.load', onStyleLoad);
    return () => {
      window.cancelAnimationFrame(raf1);
      try {
        map.off('style.load', onStyleLoad);
      } catch {
        /* ignore */
      }
      for (const staleId of siImperativeCustomLayerSourceIdsRef.current) {
        siRemoveMapboxCustomLayerStack(map, staleId);
      }
      siImperativeCustomLayerSourceIdsRef.current.clear();
    };
  }, [customLayersForMapPaint, isMapStyleReady, customLayersMapEpoch, sentinelWmsOnMap]);

  /**
   * Map-load watchdog with bounded automatic retry (exponential backoff).
   *
   * If the style never reports ready (slow GPU, transient WebGL/init hiccup), keep
   * re-asserting the globe projection / fog / camera, and on later attempts force a
   * full `setStyle()` rebuild so the globe reappears instead of staying black. As a
   * final safety net it flips into 3D-globe failover. The retry counter resets the
   * moment the style becomes ready (see the projection-retry effect below).
   */
  useEffect(() => {
    if (isMapStyleReady) {
      siMapLoadRetryRef.current = 0;
      return;
    }
    const MAX_RETRIES = 6;
    const firstDelayMs = siBrowserReportsMicrosoftEdge() ? 3500 : 6000;
    let timer: number | null = null;

    const attempt = () => {
      if (isMapStyleReady) {
        siMapLoadRetryRef.current = 0;
        return;
      }
      const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
      const n = siMapLoadRetryRef.current;
      setStacStatus('Map is taking longer than expected to load â€” retrying globe rendering.');
      siEnsureGlobeProjection();
      applySiGlobeCockpitFog(map);
      syncAgroCloudMapboxCamera(map, SI_GLOBE_COCKPIT_2D_VIEW);

      // After a couple of soft retries, force a full style rebuild to recover a
      // canvas that initialised into a blank/black state.
      if (n >= 2 && map && typeof map.setStyle === 'function') {
        try {
          map.setStyle(effectiveMapStyle as any);
          if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
            setIsMapStyleReady(true);
          } else if (typeof map.once === 'function') {
            map.once('style.load', () => setIsMapStyleReady(true));
          }
        } catch {
          /* ignore â€” next attempt or 3D failover will recover */
        }
      }

      siMapLoadRetryRef.current = n + 1;
      if (siMapLoadRetryRef.current >= MAX_RETRIES) {
        // Last resort: switch to the 3D globe terrain view, which uses a different
        // basemap/style path and reliably re-renders the globe.
        if (!siGlobeWebglFailoverRef.current) {
          siGlobeWebglFailoverRef.current = true;
          siEnterGlobe3dView();
        }
        return;
      }
      timer = window.setTimeout(attempt, siNextBackoffDelayMs(siMapLoadRetryRef.current, {
        baseMs: 1200,
        maxMs: 9000,
      }));
    };

    timer = window.setTimeout(attempt, firstDelayMs);
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, [isMapStyleReady, siEnsureGlobeProjection, effectiveMapStyle, siEnterGlobe3dView]);

  useEffect(() => {
    if (!isMapStyleReady) return;
    siMapLoadRetryRef.current = 0;
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    siEnsureGlobeProjection();
    applySiGlobeCockpitFog(map);
    syncAgroCloudTerrain3d(map, activeBasemapId);
    // Some style/basemap loads can temporarily revert to mercator; retry briefly.
    const retries = [120, 320, 700, 1200];
    const timers = retries.map(ms =>
      window.setTimeout(() => {
        siEnsureGlobeProjection();
        applySiGlobeCockpitFog(map);
        syncAgroCloudTerrain3d(map, activeBasemapId);
      }, ms),
    );
    return () => {
      timers.forEach(id => window.clearTimeout(id));
    };
  }, [isMapStyleReady, activeBasemapId, siEnsureGlobeProjection]);

  /**
   * Genuine WebGL context-loss / context-restored recovery â€” the real fix for the
   * "globe disappears / goes black" failure when the browser or GPU driver drops the
   * WebGL context (tab backgrounding, GPU reset, memory pressure; common on Edge and
   * low-VRAM machines). Mapbox only emits a generic `error` for this (unreliably), so
   * without this the canvas stays black forever. We `preventDefault()` on loss so the
   * browser restores the context, then re-apply style/projection/fog/camera/terrain
   * and force overlays + Sentinel tiles to repaint so the globe always comes back.
   */
  useEffect(() => {
    if (!isMapLoaded) return;
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map) return;

    const cleanup = installSiGlobeWebglContextRecovery(map, {
      onContextLost: () => {
        siWebglContextLostRef.current = true;
        setStacStatus('Graphics context was lost â€” restoring the globeâ€¦');
      },
      onContextRestored: () => {
        siWebglContextLostRef.current = false;
        try {
          // Rebuild the style on the restored context, then re-assert the globe look.
          if (typeof map.setStyle === 'function') {
            map.setStyle(effectiveMapStyle as any);
          }
          siEnsureGlobeProjection();
          applySiGlobeCockpitFog(map);
          syncAgroCloudMapboxCamera(map, viewStateLiveRef.current);
          warmAgroCloudTerrainDemSource(map);
          syncAgroCloudTerrain3d(map, activeBasemapId, viewStateLiveRef.current.pitch);
        } catch {
          /* ignore â€” staggered retries below still re-assert the globe */
        }
        // Force overlays (Added layers) and Sentinel tiles to repaint on the new context.
        sentinelWmsTilesSyncedRef.current = '';
        setCustomLayersMapEpoch(epoch => epoch + 1);
        setStacStatus('Globe rendering restored.');
        // Some drivers restore the context a frame before it can draw; re-assert briefly.
        [120, 400, 900].forEach(ms =>
          window.setTimeout(() => {
            siEnsureGlobeProjection();
            applySiGlobeCockpitFog(map);
          }, ms),
        );
      },
    });
    return cleanup;
  }, [isMapLoaded, effectiveMapStyle, activeBasemapId, siEnsureGlobeProjection]);

  /** Enable DEM terrain mesh whenever the camera tilts into 3D (Shift+drag orbit or navigation). */
  useEffect(() => {
    if (!isMapStyleReady) return;
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    syncAgroCloudTerrain3d(map, activeBasemapId, viewState.pitch);
  }, [isMapStyleReady, activeBasemapId, viewState.pitch]);

  /** Re-apply the user's relief "Height" (DEM exaggeration) once terrain initialises. */
  useEffect(() => {
    if (!isMapStyleReady || !is3DView) return;
    const t = window.setTimeout(() => applyTerrainExaggeration(terrainExaggeration), 450);
    return () => window.clearTimeout(t);
  }, [isMapStyleReady, is3DView, terrainExaggeration, activeBasemapId, applyTerrainExaggeration]);

  /** Wheel zoom through floating map chrome (timeline, toolbox) that sits above the canvas. */
  useEffect(() => {
    return bindAgroCloudMapWheelZoomPassthrough(siMapContainerRef.current, () =>
      mapRef.current?.getMap?.() ?? mapRef.current,
    );
  }, [isMapLoaded, isMapStyleReady]);

  const toggleWmsOverlayVisibility = () => setIsWmsOverlayVisible(v => !v);
  const toggleStacThumbVisibility = () => setIsStacThumbVisible(v => !v);
  const currentBasemapLabel = currentBasemapEntry?.label || basemapId || 'Default basemap';

  // --- Geo AI live map context -------------------------------------------------
  // Per-class area for the active index layer inside the AOI, so the assistant can
  // read the legend/classification the user is actually looking at. Only fetched
  // while the Geo AI widget is open (the legend panel fetches its own copy).
  const geoAiActiveAnalysisLayerId = wmsLayerSelectValue;
  const geoAiClassAreas = useLayerClassAreas({
    geometry: drawnGeometry,
    layerId: geoAiActiveAnalysisLayerId,
    sceneDate: wmsDate,
    enabled: geoAiFloatingOpen && !!drawnGeometry,
  });

  // Named places / POIs read live from the basemap near the current view, so the
  // assistant can analyze and answer about basemap data (not just added layers).
  // Refreshed when the Geo AI widget is open and the camera settles. Empty for
  // raster basemaps (the place-search geocoder remains the fallback there).
  const [geoAiBasemapFeatures, setGeoAiBasemapFeatures] = useState<GeoAiBasemapFeature[]>([]);
  useEffect(() => {
    if (!geoAiFloatingOpen || !isMapStyleReady) {
      setGeoAiBasemapFeatures([]);
      return;
    }
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map || typeof map.queryRenderedFeatures !== 'function') return;
    const refresh = () => {
      try {
        const docEl = typeof document !== 'undefined' ? document.documentElement : null;
        const lang: 'ar' | 'en' =
          docEl?.lang?.toLowerCase().startsWith('ar') || docEl?.dir === 'rtl' ? 'ar' : 'en';
        const near = queryBasemapFeaturesNear(map, { language: lang, limit: 14 });
        const features = near.length
          ? near
          : queryBasemapFeaturesInView(map, { language: lang, limit: 14 });
        setGeoAiBasemapFeatures(features);
      } catch {
        setGeoAiBasemapFeatures([]);
      }
    };
    refresh();
    let raf = 0;
    const onIdle = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(refresh);
    };
    map.on?.('idle', onIdle);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      map.off?.('idle', onIdle);
    };
  }, [geoAiFloatingOpen, isMapStyleReady, basemapId]);
  const geoAiBasemapFeaturesRef = useRef(geoAiBasemapFeatures);
  geoAiBasemapFeaturesRef.current = geoAiBasemapFeatures;

  const geoAiLiveMapStateBlock = useMemo(() => {
    const layers: GeoAiLayerState[] = [];
    layers.push({ name: currentBasemapLabel, kind: 'Basemap', visible: basemapVisible });
    if (activeWmsLayer && isWmsOverlayVisible) {
      layers.push({ name: `${activeWmsLayer} (Sentinel imagery)`, kind: 'Raster index', visible: true });
    }
    for (const l of customLayers) {
      const featureCount = Array.isArray(l?.geojson?.features) ? l.geojson.features.length : null;
      layers.push({
        id: l.id,
        name: l.name,
        visible: l.visible !== false,
        opacity: typeof l.mapOpacity === 'number' ? l.mapOpacity : null,
        kind: l.renderMode === 'raster' ? 'Raster' : 'Vector',
        source: l.source ?? null,
        crs: l.importMetadata?.crs ?? null,
        featureCount,
      });
    }

    let activeAnalysis: GeoAiLiveMapState['activeAnalysis'] = null;
    if ((activeWmsLayer && isWmsOverlayVisible) || geoAiClassAreas.result || geoAiClassAreas.loading) {
      const res = geoAiClassAreas.result;
      // Fixed legend ramp (colors + class ranges as defined in the index code).
      const legendSpec = geoAiActiveAnalysisLayerId
        ? resolveLayerLiveLegendSpec(geoAiActiveAnalysisLayerId)
        : null;
      const legendClasses = legendSpec?.classes;
      const classes =
        legendClasses && res
          ? legendClasses.map((c, i) => {
              const row = res.rows[i];
              return {
                name: c.label,
                color: c.color,
                areaHa: row?.areaHa ?? null,
                areaM2: row?.areaM2 ?? null,
                pct: row?.pctOfAoi ?? null,
              };
            })
          : undefined;
      const note = !classes
        ? geoAiClassAreas.loading
          ? 'per-class area computingΓÇª'
          : geoAiClassAreas.error
            ? `per-class area unavailable (${geoAiClassAreas.error})`
            : !drawnGeometry
              ? 'draw an AOI to compute per-class area'
              : null
        : null;
      activeAnalysis = {
        label: geoAiActiveAnalysisLayerId || activeWmsLayer || 'Imagery analysis',
        acquisitionDate: wmsDate || null,
        resolutionMeters: 10,
        classes,
        note,
      };
    }

    const selectedFeature = geoAiInspectCard
      ? {
          layerName: geoAiInspectCard.title,
          lng: geoAiInspectCard.lng,
          lat: geoAiInspectCard.lat,
          attributes: Array.isArray(geoAiInspectCard.rows)
            ? geoAiInspectCard.rows
                .filter(r => r && r.label != null)
                .slice(0, 10)
                .map(r => ({ label: String(r.label), value: String(r.value ?? '') }))
            : undefined,
        }
      : null;

    const state: GeoAiLiveMapState = {
      camera: {
        longitude: typeof viewState.longitude === 'number' ? viewState.longitude : null,
        latitude: typeof viewState.latitude === 'number' ? viewState.latitude : null,
        zoom: typeof viewState.zoom === 'number' ? viewState.zoom : null,
        pitch: typeof viewState.pitch === 'number' ? viewState.pitch : null,
        bearing: typeof viewState.bearing === 'number' ? viewState.bearing : null,
        is3D: is3DView,
      },
      basemapLabel: currentBasemapLabel,
      aoiGeometry: drawnGeometry,
      layers,
      activeAnalysis,
      selectedFeature,
      basemapFeatures: geoAiBasemapFeatures,
    };
    return buildGeoAiLiveMapStateBlock(state);
  }, [
    viewState,
    is3DView,
    currentBasemapLabel,
    basemapVisible,
    activeWmsLayer,
    isWmsOverlayVisible,
    customLayers,
    drawnGeometry,
    wmsDate,
    geoAiActiveAnalysisLayerId,
    geoAiClassAreas.result,
    geoAiClassAreas.loading,
    geoAiClassAreas.error,
    geoAiInspectCard,
    geoAiBasemapFeatures,
  ]);
  const geoAiLiveMapStateBlockRef = useRef(geoAiLiveMapStateBlock);
  geoAiLiveMapStateBlockRef.current = geoAiLiveMapStateBlock;

  // Execute MAP_ACTION:{ΓÇª} commands the assistant emits (layer toggle/opacity,
  // zoom-to-AOI/layer, basemap switch, fly-to) against the live map.
  const runGeoAiMapCommandsFromReply = useCallback(
    (reply: string) => {
      const commands = parseGeoAiMapCommands(reply);
      if (!commands.length) return;
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      const fitToBounds = (bounds: [number, number, number, number] | null) => {
        if (!bounds || !map || typeof map.fitBounds !== 'function') return false;
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: 56, duration: 750, maxZoom: 17 },
        );
        return true;
      };
      const findLayer = (name: string) => {
        const n = name.trim().toLowerCase();
        if (!n) return null;
        return (
          customLayers.find(l => l.name.trim().toLowerCase() === n) ??
          customLayers.find(l => l.name.trim().toLowerCase().includes(n) || n.includes(l.name.trim().toLowerCase())) ??
          null
        );
      };
      const isBasemapName = (name: string) => {
        const n = name.trim().toLowerCase();
        return n === 'basemap' || n === 'base map' || currentBasemapLabel.trim().toLowerCase().includes(n) || n.includes('basemap');
      };
      const isActiveIndexName = (name: string) => {
        const n = name.trim().toLowerCase();
        const active = String(activeWmsLayer || '').trim().toLowerCase();
        return !!active && (n === active || n.includes(active) || n.includes('sentinel') || n.includes('imagery'));
      };

      const handlers: GeoAiMapCommandHandlers = {
        flyTo: c => {
          setGeoAiPinLngLat([c.lng, c.lat]);
          setViewState(vs => ({
            ...vs,
            longitude: c.lng,
            latitude: c.lat,
            zoom: typeof c.zoom === 'number' ? c.zoom : Math.max(typeof vs.zoom === 'number' ? vs.zoom : 12, 12),
            pitch: is3DViewRef.current ? Math.max(typeof vs.pitch === 'number' ? vs.pitch : 0, 42) : vs.pitch ?? 0,
            bearing: typeof vs.bearing === 'number' ? vs.bearing : 0,
          }));
          return `Centered on ${c.label || `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`}.`;
        },
        zoomToAoi: () => {
          const g = drawnGeometryRef.current?.geometry ?? drawnGeometry?.geometry ?? drawnGeometry;
          if (!g) return 'No AOI is drawn yet.';
          return fitToBounds(getGeoJsonBounds(g as any)) ? 'Zoomed to the AOI.' : 'Could not zoom to the AOI.';
        },
        zoomToLayer: name => {
          const layer = findLayer(name);
          if (!layer?.geojson) return `Layer "${name}" not found.`;
          return fitToBounds(getGeoJsonBounds(layer.geojson)) ? `Zoomed to ${layer.name}.` : `Could not zoom to ${layer.name}.`;
        },
        setLayerVisibility: (name, visible) => {
          if (isBasemapName(name)) {
            setBasemapVisible(visible);
            return `Turned the basemap ${visible ? 'on' : 'off'}.`;
          }
          if (isActiveIndexName(name)) {
            setIsWmsOverlayVisible(visible);
            return `Turned ${activeWmsLayer} ${visible ? 'on' : 'off'}.`;
          }
          const layer = findLayer(name);
          if (!layer) return `Layer "${name}" not found.`;
          setCustomLayers(prev => prev.map(l => (l.id === layer.id ? { ...l, visible } : l)));
          return `Turned ${layer.name} ${visible ? 'on' : 'off'}.`;
        },
        setLayerOpacity: (name, opacity) => {
          const layer = findLayer(name);
          if (!layer) return `Layer "${name}" not found.`;
          setCustomLayers(prev => prev.map(l => (l.id === layer.id ? { ...l, mapOpacity: opacity } : l)));
          return `Set ${layer.name} opacity to ${Math.round(opacity * 100)}%.`;
        },
        switchBasemap: name => {
          const n = name.trim().toLowerCase();
          const entry =
            basemapCatalog.find(e => String(e.id).toLowerCase() === n) ??
            basemapCatalog.find(e => String(e.label || '').toLowerCase() === n) ??
            basemapCatalog.find(
              e =>
                String(e.label || '').toLowerCase().includes(n) ||
                String(e.id).toLowerCase().includes(n),
            ) ??
            null;
          if (!entry) return `Basemap "${name}" not found.`;
          setBasemapId(entry.id);
          setBasemapVisible(true);
          return `Switched basemap to ${entry.label || entry.id}.`;
        },
        searchPlace: query => {
          const q = (query || '').trim();
          if (!q) return 'No place name was provided to search.';
          const docEl = typeof document !== 'undefined' ? document.documentElement : null;
          const uiLang: 'ar' | 'en' =
            docEl?.lang?.toLowerCase().startsWith('ar') || docEl?.dir === 'rtl' ? 'ar' : 'en';
          void (async () => {
            try {
              const results = await searchPlaces(q, {
                mapboxToken,
                proximity: getMapProximity(),
                language: detectQueryLanguage(q) === 'ar' ? 'ar' : uiLang,
                limit: 5,
                autocomplete: false,
              });
              const top = results[0];
              if (!top) return;
              handleSelectSearchResult(top);
              stageGeoAiInspectCard({
                title: top.label,
                rows: [
                  ...(top.subtitle ? [{ label: 'Location', value: top.subtitle }] : []),
                  ...(top.kind ? [{ label: 'Type', value: top.kind }] : []),
                  { label: 'Longitude', value: top.lng.toFixed(6) },
                  { label: 'Latitude', value: top.lat.toFixed(6) },
                ],
                lng: top.lng,
                lat: top.lat,
              });
            } catch {
              /* search failure is non-fatal */
            }
          })();
          return `Searching the map for "${q}"ΓÇª`;
        },
        identifyBasemap: (lng, lat) => {
          const map = mapRef.current?.getMap?.() ?? mapRef.current;
          if (!map || typeof map.queryRenderedFeatures !== 'function') {
            return 'Basemap features are not queryable on the current basemap.';
          }
          const docEl = typeof document !== 'undefined' ? document.documentElement : null;
          const uiLang: 'ar' | 'en' =
            docEl?.lang?.toLowerCase().startsWith('ar') || docEl?.dir === 'rtl' ? 'ar' : 'en';
          const hasPoint = Number.isFinite(lng) && Number.isFinite(lat);
          const center = hasPoint ? ([lng, lat] as [number, number]) : null;
          const features = queryBasemapFeaturesNear(map, { center, language: uiLang, limit: 10 });
          if (!features.length) {
            return 'No named basemap places or POIs are rendered near here (the basemap may be raster imagery).';
          }
          const top = features[0];
          if (typeof top.lng === 'number' && typeof top.lat === 'number') {
            setGeoAiInspectCard({
              title: top.name,
              rows: [
                ...(top.category ? [{ label: 'Category', value: top.category }] : []),
                { label: 'Source', value: 'Basemap' },
                { label: 'Longitude', value: top.lng.toFixed(6) },
                { label: 'Latitude', value: top.lat.toFixed(6) },
              ],
              lng: top.lng,
              lat: top.lat,
            });
          }
          return `Nearby on the basemap:\n${summarizeBasemapFeatures(features, 8)}`;
        },
      };
      executeGeoAiMapCommands(commands, handlers);
    },
    [
      customLayers,
      drawnGeometry,
      basemapCatalog,
      activeWmsLayer,
      currentBasemapLabel,
      mapboxToken,
      getMapProximity,
      handleSelectSearchResult,
      stageGeoAiInspectCard,
    ],
  );
  const runGeoAiMapCommandsRef = useRef(runGeoAiMapCommandsFromReply);
  runGeoAiMapCommandsRef.current = runGeoAiMapCommandsFromReply;

  const addedLayerEntries = useMemo(
    () => [
      {
        id: 'basemap',
        label: currentBasemapLabel,
        meta: 'Base map',
        visible: basemapVisible,
        toggleable: true,
        actionable: false,
        onToggle: () => setBasemapVisible(v => !v),
      },
      {
        id: 'sentinel-wms',
        label: activeWmsLayer || 'Remote sensing layer',
        meta: sentinelAoiLabel,
        visible: sentinelWmsOnMap,
        toggleable: true,
        actionable: false,
        onToggle: toggleWmsOverlayVisibility,
      },
      ...(stacMapThumb
        ? [
            {
              id: 'stac-thumb',
              label: stacMapThumbLabel || 'STAC imagery preview',
              meta: 'STAC raster',
              visible: isStacThumbVisible,
              toggleable: true,
              actionable: false,
              onToggle: toggleStacThumbVisibility,
            },
          ]
        : []),
      // The drawn AOI is published as its own independent, persistent layer. It is
      // only removed when the user deletes it here (never by other tools/edits).
      ...(drawnGeometry
        ? [
            {
              id: 'drawn-aoi',
              label: 'Area of Interest',
              meta: 'AOI boundary',
              visible: aoiLayerVisible,
              toggleable: true,
              actionable: false,
              kind: 'vector' as const,
              opacity: aoiLayerOpacity,
              onOpacityChange: (v: number) => setAoiLayerOpacity(v),
              onToggle: () => setAoiLayerVisible(v => !v),
              onRemove: () => clearRemoteSensingAoiSketchOnly(),
            },
          ]
        : []),
      ...customLayers.map(layer => {
        const featureCount = Array.isArray(layer.geojson?.features) ? layer.geojson.features.length : 0;
        const lower = layer.name.toLowerCase();
        const isUploadAoiLayer =
          layer.source === 'upload' &&
          pickFirstPolygonAoiFeature(layer.geojson) !== null;
        const sourceType =
          layer.renderMode === 'raster' || layer.importMetadata?.format === 'GeoTIFF'
            ? layer.importMetadata?.format && layer.importMetadata.format.startsWith('Image (')
              ? `${layer.importMetadata.format} overlay`
              : 'GeoTIFF raster'
            : layer.importMetadata?.format === 'IFC' || layer.bimBlobUrl
              ? 'IFC (BIM anchor)'
              : lower.includes('arcgis')
                ? 'ArcGIS'
                : lower.includes('kml') || lower.includes('kmz')
                  ? 'KML/KMZ'
                  : lower.includes('shp') || lower.includes('shape')
                    ? 'SHP'
                    : 'Vector layer';
        return {
          id: `custom-${layer.id}`,
          label: layer.name,
          meta: `${isUploadAoiLayer ? 'AOI data source - ' : ''}${sourceType}${featureCount ? ` - ${featureCount} feature${featureCount === 1 ? '' : 's'}` : ''}`,
          visible: layer.visible,
          toggleable: true,
          actionable: true,
          sourceLayerId: layer.id,
          supportsAoiEdit: isUploadAoiLayer,
          supportsRename: true,
          onToggle: () => toggleCustomLayerVisibility(layer.id, !layer.visible),
        };
      }),
      // Hydro Watershed results ΓÇö each completed step is published to the Layers
      // panel automatically with show/hide + export + delete (no AOI background).
      ...HYDRO_STEP_ORDER.filter(stepId => hydro.steps[stepId]?.status === 'done' && !!hydro.steps[stepId]?.result).map(
        stepId => {
          const st = hydro.steps[stepId];
          const canExport = st.result?.kind === 'raster' && !!st.result.band;
          const layerKind: 'raster' | 'vector' = st.result?.kind === 'raster' ? 'raster' : 'vector';
          return {
            id: `hydro-${stepId}`,
            label: HYDRO_STEP_LABELS[stepId],
            meta: 'Hydro analysis',
            visible: st.visible,
            toggleable: true,
            actionable: false,
            kind: layerKind,
            opacity: st.opacity ?? 1,
            onOpacityChange: (v: number) => hydro.setOpacity(stepId, v),
            onToggle: () => hydro.toggleVisible(stepId),
            onExport: canExport ? () => hydro.exportRaster(stepId) : undefined,
            onRemove: () => hydro.removeStep(stepId),
            ...(stepId === 'contours'
              ? {
                  labelsToggle: {
                    visible: hydroContourLabels,
                    onToggle: () => setHydroContourLabels(v => !v),
                    labelOn: 'Hide elevation labels',
                    labelOff: 'Show elevation labels',
                  },
                }
              : {}),
          };
        },
      ),
    ],
    [
      activeWmsLayer,
      aoiLayerVisible,
      aoiLayerOpacity,
      basemapVisible,
      clearRemoteSensingAoiSketchOnly,
      currentBasemapLabel,
      customLayers,
      drawnGeometry,
      hydro,
      hydroContourLabels,
      isStacThumbVisible,
      sentinelAoiLabel,
      sentinelWmsOnMap,
      sentinelVisible,
      stacMapThumb,
      stacMapThumbLabel,
    ],
  );

  const userLayerEntries = useMemo(
    () => addedLayerEntries.filter(layer => layer.actionable),
    [addedLayerEntries],
  );

  const systemLayerEntries = useMemo(
    () => addedLayerEntries.filter(layer => !layer.actionable),
    [addedLayerEntries],
  );

  /** Analysis result layers (AOI + Hydro Watershed steps) ΓÇö shown in the Main tab. */
  const isAnalysisLayerId = useCallback(
    (id: string) => id === 'drawn-aoi' || id.startsWith('hydro-'),
    [],
  );
  const analysisLayerEntries = useMemo(
    () => systemLayerEntries.filter(layer => isAnalysisLayerId(layer.id)),
    [systemLayerEntries, isAnalysisLayerId],
  );
  /** Analysis layers reordered by the user's drag order (stable for unranked rows). */
  const orderedAnalysisLayerEntries = useMemo(() => {
    if (!analysisLayerOrder.length) return [...analysisLayerEntries];
    const rank = new Map(analysisLayerOrder.map((id, i) => [id, i]));
    return [...analysisLayerEntries].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Number.POSITIVE_INFINITY;
      const rb = rank.has(b.id) ? rank.get(b.id)! : Number.POSITIVE_INFINITY;
      return ra - rb;
    });
  }, [analysisLayerEntries, analysisLayerOrder]);
  useEffect(() => {
    orderedAnalysisLayerEntryIdsRef.current = orderedAnalysisLayerEntries.map(e => e.id);
  }, [orderedAnalysisLayerEntries]);
  /** Base map / index / preview overlays ΓÇö shown in the Options tab. */
  const baseOverlayEntries = useMemo(
    () => systemLayerEntries.filter(layer => !isAnalysisLayerId(layer.id)),
    [systemLayerEntries, isAnalysisLayerId],
  );

  /** Shared ΓÇ£Main toolsΓÇ¥ layers UI: user-added layers (map toolbox Main tab). */
  const mapToolboxBrowseLayersPanel = useMemo(
    () => (
      <GisPortalBrowseLayersPanel
        onAddRow={addGisPortalRowToMap}
        addingRowId={addingPortalRowId}
        statusMessage={portalBrowseStatus}
      />
    ),
    [addGisPortalRowToMap, addingPortalRowId, portalBrowseStatus],
  );

  const mapToolboxLayerLiveLegend = useMemo(
    () => (
      <LayerLiveLegendPanel
        layerOptions={remoteSensingLayerOptions}
        layerGroups={remoteSensingLayerSelectGroups}
        activeLayerId={wmsLayerSelectValue}
        aoiGeometry={drawnGeometry}
        sceneDate={sentinelFetchDate}
        seriesStart={timeSeriesStart}
        seriesEnd={timeSeriesEnd}
      />
    ),
    [remoteSensingLayerOptions, remoteSensingLayerSelectGroups, wmsLayerSelectValue, drawnGeometry, sentinelFetchDate, timeSeriesStart, timeSeriesEnd],
  );

  const layersEnvMainTools = useMemo(
    () => (
      <div className="si-env-section-card si-map-toolbox-layers-compact">
        {/* Analysis result layers (AOI + Hydro Watershed) are shown here in Main.
            Base map / index / preview overlays live in the Options tab. */}
        {orderedAnalysisLayerEntries.length ? (
          <MapToolboxLayerList
            layers={orderedAnalysisLayerEntries}
            reorderable
            onReorder={reorderAnalysisLayers}
          />
        ) : null}
        {userLayerEntries.length ? (
          <div className="si-mt-layer-list si-mt-layer-list--user">
            {userLayerEntries.map(layer => {
              const reorderId =
                'sourceLayerId' in layer && layer.sourceLayerId ? layer.sourceLayerId : null;
              const canReorder = !!reorderId && userLayerEntries.length > 1;
              return (
              <div
                key={layer.id}
                className={
                  'si-env-user-layer-row' +
                  (reorderId && draggingLayerId === reorderId ? ' is-dragging' : '') +
                  (reorderId && dropTargetLayerId === reorderId && draggingLayerId !== reorderId
                    ? ' is-drop-target'
                    : '')
                }
                data-si-env-layer-options-root={
                  'actionable' in layer && layer.actionable && 'sourceLayerId' in layer && layer.sourceLayerId
                    ? layer.sourceLayerId
                    : undefined
                }
                onDragOver={
                  canReorder
                    ? e => {
                        if (!draggingLayerId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dropTargetLayerId !== reorderId) setDropTargetLayerId(reorderId);
                      }
                    : undefined
                }
                onDrop={
                  canReorder
                    ? e => {
                        e.preventDefault();
                        if (draggingLayerId && reorderId) reorderCustomLayers(draggingLayerId, reorderId);
                        setDraggingLayerId(null);
                        setDropTargetLayerId(null);
                      }
                    : undefined
                }
                onDragLeave={
                  canReorder
                    ? () => setDropTargetLayerId(prev => (prev === reorderId ? null : prev))
                    : undefined
                }
              >
              {canReorder ? (
                <span
                  className="si-env-user-layer-grip"
                  role="button"
                  tabIndex={0}
                  draggable
                  title="Drag to reorder"
                  aria-label={`Reorder ${layer.label}`}
                  onDragStart={e => {
                    if (!reorderId) return;
                    setDraggingLayerId(reorderId);
                    e.dataTransfer.effectAllowed = 'move';
                    try {
                      e.dataTransfer.setData('text/plain', reorderId);
                    } catch {
                      /* some browsers disallow setData here */
                    }
                  }}
                  onDragEnd={() => {
                    setDraggingLayerId(null);
                    setDropTargetLayerId(null);
                  }}
                  onKeyDown={e => {
                    if (!reorderId) return;
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      moveCustomLayerInStack(reorderId, -1);
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      moveCustomLayerInStack(reorderId, 1);
                    }
                  }}
                >
                  <i className="fa-solid fa-grip-vertical" aria-hidden />
                </span>
              ) : null}
              <MapToolboxLayerRow
                label={layer.label}
                visible={layer.visible}
                toggleable={layer.toggleable}
                onToggle={layer.onToggle}
                headerActions={
                  'actionable' in layer && layer.actionable && 'sourceLayerId' in layer && layer.sourceLayerId ? (
                    <div className="si-env-layer-actions si-env-layer-actions--menu-only">
                      <div className="si-env-layer-actions-more-wrap">
                        <SiLayerOptionsMenuPortal
                          open={layerOptionsMenuLayerId === layer.sourceLayerId}
                          layerLabel={layer.label}
                          onToggleOpen={() =>
                            setLayerOptionsMenuLayerId(v => (v === layer.sourceLayerId ? null : layer.sourceLayerId!))
                          }
                        >
                        {layerOptionsMenuLayerId === layer.sourceLayerId
                          ? (() => {
                              const lid = layer.sourceLayerId!;
                              const L = customLayers.find(x => x.id === lid);
                              if (!L) return null;
                              const isRaster = L.renderMode === 'raster';
                              const ix = customLayers.findIndex(x => x.id === lid);
                              const showSync = L.source === 'arcgis' && !!L.sourceUrl;
                              const mi = (
                                label: string,
                                icon: string,
                                on: () => void,
                                opts?: { danger?: boolean; disabled?: boolean; hint?: string },
                              ) => (
                                <button
                                  key={label}
                                  type="button"
                                  role="menuitem"
                                  className={
                                    'si-env-layer-options-menu__item' +
                                    (opts?.danger ? ' si-env-layer-options-menu__item--danger' : '') +
                                    (opts?.disabled ? ' si-env-layer-options-menu__item--disabled' : '')
                                  }
                                  disabled={opts?.disabled}
                                  title={opts?.hint}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (!opts?.disabled) on();
                                  }}
                                >
                                  <i className={icon} aria-hidden />
                                  <span>{label}</span>
                                </button>
                              );
                              return (
                                <>
                                  {mi('Zoom to layer', 'fa-solid fa-magnifying-glass-location', () => zoomToCustomLayerExtent(lid))}
                                  <div className="si-env-layer-options-menu__sep" role="separator" />
                                  {mi('Attribute table', 'fa-solid fa-table-cells', () => void executeCustomLayerAction('table', lid))}
                                  {mi('Symbology', 'fa-solid fa-sliders', () => void executeCustomLayerAction('symbology', lid))}
                                  {mi('Legend', 'fa-solid fa-key', () => void executeCustomLayerAction('legend', lid))}
                                  <div className="si-env-layer-options-menu__sep" role="separator" />
                                  {mi(
                                    'Configure pop-ups',
                                    'fa-solid fa-message',
                                    () => openLayerPopupConfiguratorFromRow(lid),
                                    {
                                      disabled: isRaster,
                                      hint: isRaster ? 'Pop-up configuration applies to vector layers.' : undefined,
                                    },
                                  )}
                                  {mi('Layer opacityΓÇª', 'fa-solid fa-droplet', () => promptCustomLayerMapOpacity(lid))}
                                  <div className="si-env-layer-options-menu__sep" role="separator" />
                                  {mi('Bring forward (draw order)', 'fa-solid fa-arrow-up', () => moveCustomLayerInStack(lid, 1), {
                                    disabled: ix < 0 || ix >= customLayers.length - 1,
                                  })}
                                  {mi('Send backward (draw order)', 'fa-solid fa-arrow-down', () => moveCustomLayerInStack(lid, -1), {
                                    disabled: ix <= 0,
                                  })}
                                  <div className="si-env-layer-options-menu__sep" role="separator" />
                                  {mi('Copy layer name', 'fa-solid fa-copy', () => {
                                    setLayerOptionsMenuLayerId(null);
                                    const t = L.name;
                                    void (async () => {
                                      try {
                                        await navigator.clipboard.writeText(t);
                                        setStacStatus(`Copied layer name: ${t}`);
                                      } catch {
                                        try {
                                          const ta = document.createElement('textarea');
                                          ta.value = t;
                                          ta.style.position = 'fixed';
                                          ta.style.left = '-9999px';
                                          document.body.appendChild(ta);
                                          ta.select();
                                          document.execCommand('copy');
                                          document.body.removeChild(ta);
                                          setStacStatus(`Copied layer name: ${t}`);
                                        } catch {
                                          setStacStatus('Could not copy to clipboard.');
                                        }
                                      }
                                    })();
                                  })}
                                  <div className="si-env-layer-options-menu__sep" role="separator" />
                                  {'supportsAoiEdit' in layer && layer.supportsAoiEdit
                                    ? mi('Use as AOI for analysis', 'fa-solid fa-draw-polygon', () =>
                                        void executeCustomLayerAction('editAoi', lid),
                                      )
                                    : null}
                                  {'supportsRename' in layer && layer.supportsRename
                                    ? mi('Rename layer', 'fa-solid fa-pen-to-square', () => void executeCustomLayerAction('rename', lid))
                                    : null}
                                  {showSync
                                    ? mi('Refresh layer data', 'fa-solid fa-rotate-right', () => void executeCustomLayerAction('sync', lid))
                                    : null}
                                  {mi(
                                    L.labelFieldName ? `Labeling: ${L.labelFieldName}` : 'LabelingΓÇª',
                                    'fa-solid fa-tag',
                                    () => promptCustomLayerLabeling(lid),
                                    {
                                      disabled: isRaster,
                                      hint: isRaster
                                        ? 'Labeling applies to vector layers.'
                                        : 'Show a text label on each feature from an attribute field.',
                                    },
                                  )}
                                  {mi(
                                    L.definitionQueryText ? `Definition query: ${L.definitionQueryText}` : 'Definition queryΓÇª',
                                    'fa-solid fa-filter',
                                    () => promptCustomLayerDefinitionQuery(lid),
                                    {
                                      disabled: isRaster,
                                      hint: isRaster
                                        ? 'Definition queries apply to vector layers.'
                                        : 'Show only features matching a field expression (e.g. crop = wheat).',
                                    },
                                  )}
                                  <div className="si-env-layer-options-menu__sep" role="separator" />
                                  {mi('Remove from map', 'fa-solid fa-trash-can', () => void executeCustomLayerAction('remove', lid), {
                                    danger: true,
                                  })}
                                </>
                              );
                            })()
                          : null}
                        </SiLayerOptionsMenuPortal>
                      </div>
                    </div>
                  ) : undefined
                }
              />
              </div>
              );
            })}
          </div>
        ) : null}
      </div>
    ),
    [
      orderedAnalysisLayerEntries,
      reorderAnalysisLayers,
      userLayerEntries,
      customLayers,
      draggingLayerId,
      dropTargetLayerId,
      reorderCustomLayers,
      executeCustomLayerAction,
      handleLayerActionClick,
      layerOptionsMenuLayerId,
      moveCustomLayerInStack,
      openLayerPopupConfiguratorFromRow,
      pivots,
      promptCustomLayerMapOpacity,
      syncingLayerId,
      zoomToCustomLayerExtent,
    ],
  );

  /** Layers ΓåÆ Options: basemap, remote sensing overlay, STAC preview & footprints. */
  const layersEnvOptionsLayers = useMemo(
    () => (
      <div className="si-env-section-card si-map-toolbox-layers-compact">
        <MapToolboxLayerList layers={baseOverlayEntries} emptyMessage="No map overlays active." />
        {stacMapThumb ? (
          <button type="button" className="si-stac-clear-thumb-btn" onClick={clearStacMapThumb}>
            Remove image preview from map
          </button>
        ) : null}
      </div>
    ),
    [clearStacMapThumb, showStacFootprintsOnMap, stacMapThumb, baseOverlayEntries],
  );

  const layersEnvOptionsExtra = useMemo(() => {
    const vectorLayers = customLayers.filter(l => l.renderMode !== 'raster');
    const cfgLayer = layerPopupCfgPickId ? customLayers.find(l => l.id === layerPopupCfgPickId) : null;
    const canConfigure = cfgLayer && cfgLayer.renderMode !== 'raster';
    return (
      <>
        {layersEnvOptionsLayers}
        <div className="si-map-toolbox-layer-popup-cfg">
          {vectorLayers.length ? (
            <>
              <label className="si-map-toolbox-layer-popup-cfg__field">
                <span>Layer</span>
                <select
                  value={layerPopupCfgPickId ?? ''}
                  onChange={e => setLayerPopupCfgPickId(e.target.value || null)}
                  aria-label="Select layer for popup configuration"
                >
                  <option value="">Select a layerΓÇª</option>
                  {vectorLayers.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="si-map-toolbox-layer-popup-cfg__btn"
                disabled={!canConfigure}
                onClick={() => {
                  if (canConfigure) setLayerPopupCfgOpen(true);
                }}
              >
                <i className="fa-solid fa-gear" aria-hidden />
                <span>Open configurationΓÇª</span>
              </button>
            </>
          ) : null}
        </div>
      </>
    );
  }, [customLayers, layerPopupCfgPickId, layersEnvOptionsLayers]);

  const exploreSelectedCollectionsLabel = useMemo(() => {
    if (!exploreSelectedCollectionIds.length) return 'From selected collections';
    const preview = exploreSelectedCollectionIds.slice(0, 2).join(', ');
    const tail = exploreSelectedCollectionIds.length > 2 ? ` +${exploreSelectedCollectionIds.length - 2}` : '';
    return `From selected collections (${preview}${tail})`;
  }, [exploreSelectedCollectionIds]);

  useEffect(() => {
    const original = console.error;
    consoleErrorRef.current = original;
    console.error = (...args: any[]) => {
      const text = args.map(arg => (typeof arg === 'string' ? arg : '')).join(' ');
      if (ERROR_FILTER_PATTERNS.some(pattern => text.includes(pattern))) {
        return;
      }
      original(...args);
    };
    return () => {
      if (consoleErrorRef.current) {
        console.error = consoleErrorRef.current;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map || !map.on) return;

    const handleMapError = (e: any) => {
      const message = e?.error?.message || '';
      const url = e?.error?.url || '';
      const status = e?.error?.status;

      if (
        message.includes('ERR_ABORTED') ||
        status === 0 ||
        url.includes('api.mapbox.com/v4/mapbox.satellite') ||
        url.includes('services.sentinel-hub.com/ogc/wms')
      ) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        return;
      }
      tryFallbackBasemapFromTileError(url, status);
    };

    map.on('error', handleMapError);
    return () => {
      map.off('error', handleMapError);
    };
  }, [tryFallbackBasemapFromTileError]);

  const satelliteTimelineChips = useMemo(
    () =>
      weeklyComposites.map(w => ({
        id: `w-${w.weekIndex}-${w.startDate}`,
        shortLabel: `${w.startDate.slice(5, 7)}-${w.startDate.slice(8, 10)}`,
        fullDate: w.startDate,
        mean: w.mean,
      })),
    [weeklyComposites],
  );

  const satellitePivotBars = useMemo(
    () => pivotChartRows.map(r => ({ name: r.name, value: r.value })),
    [pivotChartRows],
  );

  const satelliteWeeklyMeans = useMemo(() => weeklyComposites.map(w => w.mean), [weeklyComposites]);

  const staticAoiChartAoiKey = useMemo(() => {
    if (!drawnGeometry) return null;
    try {
      return JSON.stringify(drawnGeometry);
    } catch {
      return 'aoi';
    }
  }, [drawnGeometry]);

  const staticAoiMultiLineData = useMemo(() => {
    if (!weeklyComposites.length) {
      return {
        labels: [] as string[],
        datasets: [] as AoiStaticMultiLayerLineChartDataset[],
        hasLst: false,
        hasEt: false,
      };
    }
    const built = buildStaticAoiMultiChartDatasets(
      weeklyComposites,
      layerLiveStatsLayers,
      staticAoiChartAoiKey,
    );
    return {
      labels: built.labels,
      datasets: built.datasets,
      hasLst: layerLiveStatsIncludesLst(layerLiveStatsLayers),
      hasEt: layerLiveStatsIncludesEt(layerLiveStatsLayers),
    };
  }, [weeklyComposites, layerLiveStatsLayers, staticAoiChartAoiKey]);

  useEffect(() => {
    if (!wmsLayerSelectValue) return;
    setLayerLiveStatsLayers(prev => {
      const u = wmsLayerSelectValue.trim().toUpperCase();
      if (prev.some(id => id.toUpperCase() === u)) return prev;
      return sortLayerLiveStatsLayerIds([wmsLayerSelectValue, ...prev], remoteSensingLayerSelectGroups);
    });
  }, [wmsLayerSelectValue, remoteSensingLayerSelectGroups]);

  const staticAoiChartExportLngLatPerRow = useMemo(
    () => buildStaticAoiExportLngLatPerRow(drawnGeometry, staticAoiMultiLineData.labels.length),
    [drawnGeometry, staticAoiMultiLineData.labels.length, staticAoiChartAoiKey],
  );

  const satelliteActiveChipId = useMemo(() => {
    if (!weeklyComposites.length) return null;
    const iso = localIsoDate(selectedDate);
    const hit =
      weeklyComposites.find(w => iso >= w.startDate && iso <= w.endDate) ?? weeklyComposites[0];
    return `w-${hit.weekIndex}-${hit.startDate}`;
  }, [weeklyComposites, selectedDate]);

  const handleSatelliteTimelineStep = (dir: -1 | 1) => {
    if (!weeklyComposites.length) return;
    const iso = localIsoDate(selectedDate);
    let i = weeklyComposites.findIndex(w => iso >= w.startDate && iso <= w.endDate);
    if (i < 0) i = 0;
    i = (i + dir + weeklyComposites.length) % weeklyComposites.length;
    const w = weeklyComposites[i];
    setImageryDateAutoFollow(false);
    applySelectedDate(dateFromLocalIso(w.startDate));
  };

  const handleSatelliteChipPick = (id: string) => {
    const w = weeklyComposites.find(x => `w-${x.weekIndex}-${x.startDate}` === id);
    if (w) {
      setImageryDateAutoFollow(false);
      applySelectedDate(dateFromLocalIso(w.startDate));
    }
  };

  const rsDrawingTool: RemoteSensingDrawingTool | null =
    mapDrawTool === 'point' ||
    mapDrawTool === 'circle' ||
    mapDrawTool === 'rectangle' ||
    mapDrawTool === 'polygon'
      ? mapDrawTool
      : null;

  const cropClassDrawingTool: RemoteSensingDrawingTool | null =
    mapDrawOwner === 'crop-classification' ? rsDrawingTool : null;

  const cropClassHasClearableDrawing = useMemo(
    () =>
      cropClassAoiGeometry != null ||
      (mapDrawOwner === 'crop-classification' &&
        (rectCirclePreview != null ||
          polygonRing.length > 0 ||
          circleRefineDraft != null ||
          polylineStart != null ||
          (cropClassDrawingModeActive &&
            (mapDrawTool === 'point' ||
              mapDrawTool === 'circle' ||
              mapDrawTool === 'rectangle' ||
              mapDrawTool === 'polygon' ||
              mapDrawTool === 'polyline')))),
    [
      cropClassAoiGeometry,
      mapDrawOwner,
      rectCirclePreview,
      polygonRing.length,
      circleRefineDraft,
      polylineStart,
      cropClassDrawingModeActive,
      mapDrawTool,
    ],
  );

  const satelliteToolbarTool: 'rectangle' | 'polygon' | 'circle' | 'select' =
    mapDrawTool === 'rectangle' || mapDrawTool === 'polygon' || mapDrawTool === 'circle' || mapDrawTool === 'select'
      ? mapDrawTool
      : 'select';

  const satelliteHasClearableDrawing = useMemo(
    () =>
      drawnGeometry != null ||
      aoiFields.length > 0 ||
      rectCirclePreview != null ||
      polygonRing.length > 0 ||
      circleRefineDraft != null ||
      polylineStart != null ||
      (rsDrawingModeActive &&
        (mapDrawTool === 'point' ||
          mapDrawTool === 'circle' ||
          mapDrawTool === 'rectangle' ||
          mapDrawTool === 'polygon' ||
          mapDrawTool === 'polyline')),
    [
      drawnGeometry,
      aoiFields.length,
      rectCirclePreview,
      polygonRing.length,
      circleRefineDraft,
      polylineStart,
      rsDrawingModeActive,
      mapDrawTool,
    ],
  );

  /** Sentinel Hub WMS ΓÇö AOI clip when geometry exists; hidden when sketch cleared. */
  const cropClassificationWmsClipSource = useMemo(() => {
    if (!cropClassificationSettings.active) return null;
    return cropClassAoiClipCollection ?? cropClassAoiGeometry ?? null;
  }, [
    cropClassificationSettings.active,
    cropClassAoiClipCollection,
    cropClassAoiGeometry,
  ]);

  const effectiveSentinelHubWmsTileClipSource = useMemo(() => {
    if (cropClassificationWmsClipSource) return cropClassificationWmsClipSource;
    return sentinelHubWmsTileClipSource;
  }, [cropClassificationWmsClipSource, sentinelHubWmsTileClipSource]);

  const effectiveWmsCloudCoverage = useMemo(() => {
    if (isCropClassificationLayerId(activeWmsLayer)) return cropClassificationSettings.cloudCoverMax;
    return cloudCoverage;
  }, [activeWmsLayer, cropClassificationSettings.cloudCoverMax, cloudCoverage]);

  const sentinelHubWmsDisplayChunks = useMemo(() => {
    return buildSentinelHubWmsDisplayChunks(effectiveSentinelHubWmsTileClipSource, activeWmsLayer, {
      indexVisibilityMin: WMS_AOI_INDEX_VISIBILITY_MIN,
      sceneDate: sentinelFetchDate,
      viewportBBox: null,
      maxTileLayers: SI_WMS_MAX_TILE_LAYERS,
    });
  }, [effectiveSentinelHubWmsTileClipSource, activeWmsLayer, sentinelFetchDate]);
  const sentinelHubWmsAoiClip = sentinelHubWmsDisplayChunks[0] ?? {
    geometryWkt3857: null,
    evalscriptB64: null,
  };

  const wmsLayerCatalog = useMemo(() => getSentinelHubWmsLayerCatalog(wmsLayers), [wmsLayers])

  const wmsGetMapLayerName = useMemo(
    () => resolveSentinelHubWmsGetMapLayerName(activeWmsLayer, wmsLayerCatalog),
    [activeWmsLayer, wmsLayerCatalog],
  );

  const wmsTileUrls = useMemo(() => {
    const deltaPreviousDate = isAgroDeltaCompositeLayerId(activeWmsLayer)
      ? resolveSentinelHubWmsDeltaPreviousDate(sentinelFetchDate, {
          autoPreviousSceneDate: autoLiveScenes.previousSceneDate,
          catalogSceneIsos: sentinelSceneCatalog?.sceneIsos ?? [],
          timeSeriesStart,
        })
      : null
    const { timeStart, timeEnd } = isCropClassificationLayerId(activeWmsLayer)
      ? resolveCropClassificationTimeWindow(
          cropClassificationSettings.seasonStart,
          cropClassificationSettings.seasonEnd,
          sentinelFetchDate,
        )
      : resolveSentinelHubWmsTimeWindow(
          activeWmsLayer,
          sentinelFetchDate,
          deltaPreviousDate,
        )
    return sentinelHubWmsDisplayChunks.map(chunk =>
      buildSentinelHubWmsGetMapUrlParts({
        baseUrl: wmsBaseUrl,
        layer: wmsGetMapLayerName,
        timeStart,
        timeEnd,
        cloudCoverage: effectiveWmsCloudCoverage,
        geometryWkt3857: chunk.geometryWkt3857 ?? undefined,
        evalscriptB64: chunk.evalscriptB64,
        tilePixels: SENTINEL_HUB_WMS_TILE_PIXELS,
      }),
    );
  }, [
    wmsGetMapLayerName,
    sentinelFetchDate,
    autoLiveScenes.previousSceneDate,
    sentinelSceneCatalog?.sceneIsos,
    timeSeriesStart,
    activeWmsLayer,
    cropClassificationSettings.seasonStart,
    cropClassificationSettings.seasonEnd,
    effectiveWmsCloudCoverage,
    wmsBaseUrl,
    sentinelHubWmsDisplayChunks,
  ]);

  const wmsTimeWindowKey = useMemo(() => {
    if (!isAgroDeltaCompositeLayerId(activeWmsLayer)) return sentinelFetchDate
    const prev = resolveSentinelHubWmsDeltaPreviousDate(sentinelFetchDate, {
      autoPreviousSceneDate: autoLiveScenes.previousSceneDate,
      catalogSceneIsos: sentinelSceneCatalog?.sceneIsos ?? [],
      timeSeriesStart,
    })
    const { timeStart, timeEnd } = resolveSentinelHubWmsTimeWindow(
      activeWmsLayer,
      sentinelFetchDate,
      prev,
    )
    return `${timeStart}/${timeEnd}`
  }, [
    activeWmsLayer,
    sentinelFetchDate,
    autoLiveScenes.previousSceneDate,
    sentinelSceneCatalog?.sceneIsos,
    timeSeriesStart,
  ]);

  /**
   * Limits Sentinel WMS tile requests to the AOI bounding box (extract-by-mask style for tiles).
   * Basemap layers are unaffected; only the raster overlay source uses these bounds.
   */
  const wmsRasterAoiBoundsLngLat = useMemo((): [number, number, number, number] | null => {
    const clipGeo = getDrawnGeometry(sentinelHubWmsTileClipSource);
    if (!clipGeo) return null;
    const raw =
      getGeoJsonBounds({
        type: 'Feature',
        geometry: clipGeo,
        properties: {},
      } as any) ?? getGeoJsonBounds(sentinelHubWmsTileClipSource as any);
    if (!raw) return null;
    let [w, s, e, n] = raw;
    if (![w, s, e, n].every(Number.isFinite)) return null;
    const eps = 1e-4;
    if (e <= w) {
      const c = (w + e) / 2;
      w = c - eps;
      e = c + eps;
    }
    if (n <= s) {
      const c = (s + n) / 2;
      s = c - eps;
      n = c + eps;
    }
    const padX = Math.max((e - w) * 0.02, 1e-6);
    const padY = Math.max((n - s) * 0.02, 1e-6);
    return [w - padX, s - padY, e + padX, n + padY];
  }, [sentinelHubWmsTileClipSource]);

  /** AOI bounds for Sentinel WMS ΓÇö keep tiles georeferenced to the mask, not the moving viewport. */
  const wmsRasterTileBoundsLngLat = wmsRasterAoiBoundsLngLat;

  const resolveSentinelWmsChunkBounds = useCallback(
    (chunk: (typeof sentinelHubWmsDisplayChunks)[number] | undefined) =>
      chunk?.aoiBoundsLngLat ?? wmsRasterTileBoundsLngLat ?? wmsRasterAoiBoundsLngLat ?? undefined,
    [wmsRasterTileBoundsLngLat, wmsRasterAoiBoundsLngLat],
  );

  const sentinelWmsTileSessionKey = useMemo(() => {
    if (aoiMaskBuilderSettings.enabled) return aoiMaskBuilderMaskKey ?? 'mask-builder';
    if (drawnAoiClipKey) return drawnAoiClipKey;
    return agroStructuresLayerAoiKey ?? (normalizedDrawnAoiGeometry ? 'drawn-aoi' : 'full-canvas');
  }, [
    aoiMaskBuilderSettings.enabled,
    aoiMaskBuilderMaskKey,
    drawnAoiClipKey,
    agroStructuresLayerAoiKey,
    normalizedDrawnAoiGeometry,
  ]);

  const wmsRasterSourceRefreshKey = useMemo(
    () =>
      [
        activeWmsLayer ?? '',
        wmsTimeWindowKey,
        sentinelWmsTileSessionKey,
        sentinelHubWmsDisplayChunks.length,
      ].join(':'),
    [
      activeWmsLayer,
      wmsTimeWindowKey,
      sentinelWmsTileSessionKey,
      sentinelHubWmsDisplayChunks.length,
    ],
  );

  /** Full-canvas Layer Live works without AOI; clipped mode needs geometry + bounds on every chunk. */
  const sentinelWmsRenderReady = useMemo(
    () =>
      isSentinelHubWmsRenderReady(activeWmsLayer, sentinelHubWmsDisplayChunks, {
        aoiBoundsLngLat: wmsRasterTileBoundsLngLat ?? wmsRasterAoiBoundsLngLat,
      }),
    [activeWmsLayer, sentinelHubWmsDisplayChunks, wmsRasterTileBoundsLngLat, wmsRasterAoiBoundsLngLat],
  );

  /**
   * react-map-gl <Source> does not apply standalone `bounds` updates (see updateSource in library).
   * Sync Mapbox RasterTileSource.setBounds after mount so AOI clipping always matches the sketch.
   */
  useLayoutEffect(() => {
    if (!isMapStyleReady || !sentinelWmsOnMap) return;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    const sync = () => {
      try {
        const urlsKey = wmsTileUrls.join('|');
        const boundsKey = sentinelHubWmsDisplayChunks
          .map((chunk, i) => {
            const b = resolveSentinelWmsChunkBounds(chunk);
            return b ? b.join(',') : `u:${wmsTileUrls[i] ?? ''}`;
          })
          .join('|');
        const syncKey = `${urlsKey}::${boundsKey}`;
        if (syncKey === sentinelWmsTilesSyncedRef.current) return;
        sentinelWmsTilesSyncedRef.current = syncKey;
        for (let i = 0; i < sentinelHubWmsDisplayChunks.length; i++) {
          const src = map.getSource(`sentinel-source-${i}`) as {
            setBounds?: (b: [number, number, number, number] | null) => void;
            setTiles?: (tiles: string[]) => void;
          } | null;
          if (!src) continue;
          if (typeof src.setTiles === 'function') {
            src.setTiles([wmsTileUrls[i] ?? '']);
          }
          if (typeof src.setBounds === 'function') {
            src.setBounds(resolveSentinelWmsChunkBounds(sentinelHubWmsDisplayChunks[i]) ?? null);
          }
        }
      } catch {
        /* ignore map/source race during style rebuild */
      }
    };
    const t = window.setTimeout(sync, 0);
    map.once('idle', sync);
    return () => {
      window.clearTimeout(t);
      map.off('idle', sync);
    };
  }, [
    isMapStyleReady,
    sentinelWmsOnMap,
    wmsRasterTileBoundsLngLat,
    wmsRasterAoiBoundsLngLat,
    wmsRasterSourceRefreshKey,
    wmsTileUrls,
    sentinelHubWmsDisplayChunks,
    resolveSentinelWmsChunkBounds,
    activeWmsLayer,
    wmsDate,
    sentinelFetchDate,
    effectiveSentinelAoiSource,
    activeAoiMaskKey,
  ]);

  /**
   * Automatic retry for failed Sentinel-2 WMS tiles (transient Sentinel Hub 5xx /
   * rate-limit / network blips). Re-issuing `setTiles(...)` with the same URLs makes
   * Mapbox drop the source's tile cache and re-request, so imagery self-heals without
   * touching the basemap or the globe. Bounded with exponential backoff and reset
   * whenever the layer/date/AOI changes, so a genuinely empty scene won't loop forever.
   */
  useEffect(() => {
    if (!isMapStyleReady || !sentinelWmsOnMap) return;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map?.on) return;

    const retryKey = wmsRasterSourceRefreshKey;
    if (sentinelTileRetryRef.current.key !== retryKey) {
      if (sentinelTileRetryRef.current.timer != null) {
        window.clearTimeout(sentinelTileRetryRef.current.timer);
      }
      sentinelTileRetryRef.current = { key: retryKey, attempts: 0, timer: null };
    }
    const MAX_TILE_RETRIES = 3;

    const isSentinelTileError = (e: any): boolean => {
      const url = String(e?.error?.url || e?.url || '');
      const sourceId = String(e?.sourceId || '');
      return (
        sourceId.startsWith('sentinel-source-') ||
        url.includes('services.sentinel-hub.com/ogc/wms') ||
        url.includes('sh.dataspace.copernicus.eu/ogc/wms')
      );
    };

    const reloadSentinelSources = () => {
      for (let i = 0; i < sentinelHubWmsDisplayChunks.length; i++) {
        const src = map.getSource?.(`sentinel-source-${i}`) as
          | { setTiles?: (tiles: string[]) => void }
          | null
          | undefined;
        const url = wmsTileUrls[i];
        if (src && typeof src.setTiles === 'function' && url) {
          try {
            src.setTiles([url]);
          } catch {
            /* ignore source race during style rebuild */
          }
        }
      }
    };

    const handleTileError = (e: any) => {
      if (!isSentinelTileError(e)) return;
      const state = sentinelTileRetryRef.current;
      if (state.timer != null || state.attempts >= MAX_TILE_RETRIES) {
        if (state.attempts >= MAX_TILE_RETRIES) {
          setStacStatus('Satellite imagery is temporarily unavailable ΓÇö basemap stays active.');
        }
        return;
      }
      const delay = siNextBackoffDelayMs(state.attempts, { baseMs: 800, maxMs: 6000 });
      state.attempts += 1;
      setStacStatus(`Reloading satellite imagery (attempt ${state.attempts}/${MAX_TILE_RETRIES})ΓÇª`);
      state.timer = window.setTimeout(() => {
        sentinelTileRetryRef.current.timer = null;
        reloadSentinelSources();
      }, delay);
    };

    // A successful settle clears the failure budget so future blips get fresh retries.
    const handleIdle = () => {
      const state = sentinelTileRetryRef.current;
      if (state.attempts > 0 && state.timer == null) {
        state.attempts = 0;
      }
    };

    map.on('error', handleTileError);
    map.on('idle', handleIdle);
    return () => {
      try {
        map.off('error', handleTileError);
        map.off('idle', handleIdle);
      } catch {
        /* ignore */
      }
    };
  }, [
    isMapStyleReady,
    sentinelWmsOnMap,
    wmsRasterSourceRefreshKey,
    wmsTileUrls,
    sentinelHubWmsDisplayChunks,
  ]);

  /** Keep AOI sketch above Sentinel raster and Agro vector fills. */
  useLayoutEffect(() => {
    if (!isMapStyleReady) return;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    const agroSid = siSafeMapboxLayerId(AGRO_STRUCTURES_PRIMARY_LAYER_ID);
    const agroFillId = `${agroSid}-fill`;
    const agroLineId = `${agroSid}-line`;
    const raise = (layerId: string) => {
      try {
        if (map.getLayer(layerId)) map.moveLayer(layerId);
      } catch {
        /* ignore race during style rebuild */
      }
    };
    const sync = () => {
      try {
        const styleLayers = map.getStyle()?.layers ?? [];
        const sentinelIds = styleLayers
          .map(l => l.id)
          .filter((id): id is string => !!id && id.startsWith('sentinel-layer-'));
        for (const sid of sentinelIds) {
          if (!map.getLayer(sid)) continue;
          if (map.getLayer(agroLineId)) map.moveLayer(sid, agroLineId);
          else if (map.getLayer(agroFillId)) map.moveLayer(sid, agroFillId);
          else map.moveLayer(sid);
        }
        if (sentinelWmsOnMap && map.getLayer(agroFillId)) {
          map.setPaintProperty?.(agroFillId, 'fill-opacity', 0);
        } else if (map.getLayer(agroFillId)) {
          const layer = customLayersRef.current.find(l => String(l.id) === AGRO_STRUCTURES_PRIMARY_LAYER_ID);
          const op = layer?.mapOpacity ?? 1;
          const pfa = layer?.polygonFillAlpha ?? SI_PORTAL_LAYER_VISIBLE_FILL_ALPHA;
          map.setPaintProperty?.(agroFillId, 'fill-opacity', pfa * op);
        }
      } catch {
        /* ignore map/source race during style rebuild */
      }
      // Portal vectors / AOI masks above imagery…
      raise('si-agro-structures-boundary-fill');
      raise('si-agro-structures-boundary-line');
      raise(agroFillId);
      raise(agroLineId);
      raise('si-crop-class-aoi-fill');
      raise('si-crop-class-aoi-line');
      raise('si-aoi-fields-fill');
      raise('si-aoi-fields-line');
      // …then drawing preview + committed AOI last so sketches stay visible.
      siRaiseAoiDrawingLayers(map);
    };
    sync();
    const onIdle = () => sync();
    const onSourceData = (e: { isSourceLoaded?: boolean; sourceId?: string }) => {
      if (!e?.isSourceLoaded) return;
      const sid = String(e.sourceId || '');
      if (
        sid.startsWith('sentinel-source-') ||
        sid === 'si-draw-draft' ||
        sid.startsWith('drawn-index-geometry') ||
        sid.includes('agro') ||
        sid.includes(agroSid)
      ) {
        sync();
      }
    };
    try {
      map.on('idle', onIdle);
      map.on('sourcedata', onSourceData);
    } catch {
      /* ignore */
    }
    return () => {
      try {
        map.off('idle', onIdle);
        map.off('sourcedata', onSourceData);
      } catch {
        /* ignore */
      }
    };
  }, [
    isMapStyleReady,
    sentinelWmsOnMap,
    normalizedDrawnAoiGeometry,
    activeAoiMaskKey,
    customLayersMapEpoch,
    sentinelHubWmsDisplayChunks.length,
    activeWmsLayer,
    draftDrawGeoJson,
    drawnGeometry,
    mapDrawTool,
    rsDrawingModeActive,
  ]);

  const circleRefineHud = useMemo(() => {
    if (!circleRefineDraft || mapDrawTool !== 'circle') return null;
    const [clng, clat] = circleRefineDraft.center;
    const [elng, elat] = circleRefineDraft.edge;
    const radiusM = haversineDistanceMeters(clng, clat, elng, elat);
    const diameterM = 2 * radiusM;
    const areaHa = (Math.PI * radiusM * radiusM) / 10_000;
    return { radiusM, diameterM, areaHa };
  }, [circleRefineDraft, mapDrawTool]);

  /** Live computed readouts/geometry/labels for the in-progress measurement. */
  const measureActiveComputed = useMemo<MeasureComputed | null>(() => {
    if (!measureMode) return null;
    const preview: MeasurePoint | null =
      !measureFinished && pointerLngLat && measurePoints.length > 0
        ? { lng: pointerLngLat[0], lat: pointerLngLat[1], ele: null }
        : null;
    return computeMeasurement(measureMode, measurePoints, preview, measureUnits, measureFinished, 'active');
  }, [measureMode, measurePoints, measureFinished, pointerLngLat, measureUnits]);

  /** Active sketch + all kept-on-map measurements ΓåÆ one overlay FeatureCollection + label set. */
  const measureRender = useMemo(() => {
    const features: any[] = [];
    const labels: Array<{ id: string; lng: number; lat: number; text: string }> = [];
    for (const c of measureCompleted) {
      const comp = computeMeasurement(c.mode, c.points, null, measureUnits, true, c.id);
      if (comp) {
        features.push(...comp.features);
        labels.push(...comp.labels);
      }
    }
    if (measureActiveComputed) {
      features.push(...measureActiveComputed.features);
      labels.push(...measureActiveComputed.labels);
    }
    return {
      geojson: features.length ? ({ type: 'FeatureCollection', features } as any) : null,
      labels,
    };
  }, [measureCompleted, measureActiveComputed, measureUnits]);

  const siMapCursor = useMemo(() => {
    if (weatherPickOnMap) return 'crosshair';
    if (measureMode) return 'crosshair';
    if (circleRefineActiveHandle === 'center') return 'move';
    if (circleRefineActiveHandle === 'n' || circleRefineActiveHandle === 's') return 'ns-resize';
    if (circleRefineActiveHandle === 'e' || circleRefineActiveHandle === 'w') return 'ew-resize';
    if (circleRefineActiveHandle === 'pan') return 'grab';
    if (['point', 'polyline', 'polygon', 'rectangle', 'circle', 'box_select'].includes(mapDrawTool)) {
      return 'crosshair';
    }
    if (mapDrawTool === 'select' && drawnGeometry) return 'pointer';
    return 'grab';
  }, [mapDrawTool, drawnGeometry, circleRefineActiveHandle, weatherPickOnMap, measureMode]);

  const siMapDrawingTitle = useMemo(() => {
    if (mapDrawTool === 'circle' && circleRefineDraft) {
      return 'Circle: drag N/E/S/W to resize, center to move, inside to pan. Enter to apply, Esc to cancel.';
    }
    if (mapDrawTool === 'circle') return 'Circle: click-drag from center outward, then adjust handles.';
    if (mapDrawTool === 'rectangle' || mapDrawTool === 'box_select') return 'Rectangle: click-drag on the map.';
    if (mapDrawTool === 'polygon') return 'Polygon: click corners; Enter or first corner to close.';
    return '';
  }, [mapDrawTool, circleRefineDraft]);

  const polygonSketchHudText = useMemo(() => '', []);

  const globeCockpit2dActive = useMemo(
    () =>
      isSiGlobeCockpit2dActive(
        { ...viewState, zoom: mapMetrics.zoom, latitude: mapMetrics.latitude },
        {
          is3DView,
          hasRegionalFocus: drawnGeometry != null || aoiFields.length > 0,
        },
      ),
    [viewState, mapMetrics.zoom, mapMetrics.latitude, is3DView, drawnGeometry, aoiFields.length],
  );

  return (
    <div className="si-page">
      <div className="si-main-content">
        {/* Map viewport: MapGL fills this box; timeline chrome below (in-map toolbox rail disabled). */}
        <div
          ref={siMapContainerRef}
          className={`si-map-container${
            ['point', 'polyline', 'polygon', 'rectangle', 'circle', 'box_select'].includes(mapDrawTool)
              ? ' si-map-container--drawing'
              : ''
          }${weatherPickOnMap ? ' si-map-container--weather-pick' : ''}${
            globeCockpit2dActive ? ' si-map-container--globe-cockpit' : ''
          }${
            weeklyComposites.length > 0 || fieldTimelineSessionActive
              ? ' si-map-container--timeline-active'
              : ''
          }`}
          title={siMapDrawingTitle || undefined}
        >
          {(circleRadiusM !== null && rectCirclePreview?.kind === 'circle') ||
          circleRefineHud ||
          drawAssistHint ||
          (mapDrawTool === 'polygon' && polygonSketchHudText) ? (
            <div className="si-draw-live-hud" aria-live="polite">
              {circleRadiusM !== null && rectCirclePreview?.kind === 'circle' ? (
                <span className="si-draw-live-hud-radius">
                  Radius:{' '}
                  {circleRadiusM < 1000
                    ? `${Math.round(circleRadiusM)} m`
                    : `${(circleRadiusM / 1000).toFixed(2)} km`}
                </span>
              ) : null}
              {circleRefineHud ? (
                <span className="si-draw-live-hud-metrics">
                  <span className="si-draw-live-hud-radius">
                    R{' '}
                    {circleRefineHud.radiusM < 1000
                      ? `${Math.round(circleRefineHud.radiusM)} m`
                      : `${(circleRefineHud.radiusM / 1000).toFixed(2)} km`}
                  </span>
                  <span className="si-draw-live-hud-sep" aria-hidden>
                    ┬╖
                  </span>
                  <span>
                    D{' '}
                    {circleRefineHud.diameterM < 1000
                      ? `${Math.round(circleRefineHud.diameterM)} m`
                      : `${(circleRefineHud.diameterM / 1000).toFixed(2)} km`}
                  </span>
                  <span className="si-draw-live-hud-sep" aria-hidden>
                    ┬╖
                  </span>
                  <span>
                    A{' '}
                    {circleRefineHud.areaHa < 100
                      ? `${circleRefineHud.areaHa.toFixed(2)} ha`
                      : `${(circleRefineHud.areaHa / 100).toFixed(2)} km┬▓`}
                  </span>
                </span>
              ) : null}
              {drawAssistHint || polygonSketchHudText ? (
                <span className="si-draw-live-hud-hint">{drawAssistHint || polygonSketchHudText}</span>
              ) : null}
            </div>
          ) : null}
          {measurePanelOpen ? (
            <div {...measureHudIsolationProps} className="si-measure-panel-anchor" dir="ltr">
              <MeasurementPanel
                activeMode={measureMode}
                onSelectMode={handleMeasureModeSelect}
                units={measureUnits}
                onUnitsChange={setMeasureUnits}
                active={measureActiveComputed}
                vertexCount={measurePoints.length}
                finished={measureFinished}
                completedCount={measureCompleted.length}
                terrainAvailable={is3DView}
                canUndo={!measureFinished && measurePoints.length > 0}
                canRedo={!measureFinished && measureRedoStack.length > 0}
                onUndo={handleMeasureUndo}
                onRedo={handleMeasureRedo}
                onFinish={finishMeasure}
                onClearCurrent={clearMeasureCurrent}
                onClearAll={clearMeasureAll}
                onClose={clearMeasure}
              />
            </div>
          ) : null}
          <MapGL
            key="si-map-globe"
            ref={mapRef}
            reuseMaps
            antialias={false}
            initialViewState={initialMapViewStateRef.current}
            onMove={evt => {
              viewStateLiveRef.current = evt.viewState;
              if (!shouldSkipLiveViewportWorkOnMove(freezeViewportPipeline)) {
                captureLiveViewportExtent();
                applyLiveViewportExtentThrottled();
              }
            }}
            onMoveStart={() => {
              siMapContainerRef.current?.classList.add('si-map-container--interacting');
            }}
            onMoveEnd={evt => {
              siMapContainerRef.current?.classList.remove('si-map-container--interacting');
              viewStateLiveRef.current = evt.viewState;
              const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
              scheduleMapMetricsCommit(evt.viewState);
              if (freezeViewportPipeline) {
                window.requestAnimationFrame(() => {
                  syncAgroCloudTerrain3d(map, activeBasemapId, viewStateLiveRef.current.pitch);
                });
                return;
              }
              captureLiveViewportExtent();
              scheduleLiveViewportExtentCommit();
              if (viewStateMateriallyChanged(viewState, evt.viewState)) {
                skipMapCameraSyncRef.current = true;
                setViewState(evt.viewState);
              }
              syncAgroCloudTerrain3d(map, activeBasemapId, viewStateLiveRef.current.pitch);
            }}
            onMouseDown={handleMapPointerDown}
            onMouseMove={handleMapPointerMove}
            onTouchStart={handleMapPointerDown}
            onTouchMove={handleMapPointerMove}
            onClick={evt => handleMapClickDraw(evt.lngLat.lng, evt.lngLat.lat, evt.originalEvent ?? undefined)}
            onDblClick={evt => {
              if (measureModeRef.current && !measureFinishedRef.current) {
                finishMeasure();
                try {
                  evt?.preventDefault?.();
                } catch {
                  /* ignore */
                }
              }
            }}
            onContextMenu={evt => {
              if (measureModeRef.current && !measureFinishedRef.current) {
                handleMeasureUndo();
                try {
                  evt?.originalEvent?.preventDefault?.();
                } catch {
                  /* ignore */
                }
                return;
              }
              handleMapContextMenu(evt);
              try {
                evt?.originalEvent?.preventDefault?.();
              } catch {
                /* ignore */
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              cursor: siMapCursor,
            }}
            mapStyle={effectiveMapStyle}
            mapboxAccessToken={mapboxAccessTokenForMap}
            attributionControl={false}
            {...AGRO_CLOUD_MAPBOX_NAVIGATION_PROPS}
            dragRotate={false}
            projection={{ name: 'globe' }}
            minZoom={0.35}
            fog={SI_GLOBE_COCKPIT_FOG}
            onError={(e: any) => {
              const message = e?.error?.message || '';
              const url = e?.error?.url || '';
              const status = e?.error?.status;
              const stack = String(e?.error?.stack || '');

              if (
                message.includes("reading 'get'") &&
                (stack.includes('updateTerrain') || stack.includes('_updateTerrain'))
              ) {
                const map = mapRef.current?.getMap?.() ?? mapRef.current;
                cancelAgroCloudTerrainSync(map);
                return;
              }

              if (
                message.includes('ERR_ABORTED') ||
                status === 0 ||
                url.includes('api.mapbox.com/v4/mapbox.satellite') ||
                url.includes('services.sentinel-hub.com/ogc/wms')
              ) {
                return;
              }
              tryFallbackBasemapFromTileError(url, status);
              const lowerMessage = String(message || '').toLowerCase();
              const mapboxHostedRequest = String(url || '').includes('api.mapbox.com');
              if (
                !siGlobeWebglFailoverRef.current &&
                (siMapErrorSuggestsGlobeOrWebglFailure(String(message)) ||
                  (mapboxHostedRequest &&
                    (lowerMessage.includes('access token') || lowerMessage.includes('mapbox'))))
              ) {
                siGlobeWebglFailoverRef.current = true;
                siEnterGlobe3dView();
                setStacStatus('Map detected a rendering issue and is retrying in 3D Globe mode.');
                return;
              }
              console.warn('Map Error:', e);
            }}
            onStyleData={() => {
              const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
              try {
                applyAgroCloudMapboxBranding(map?.getContainer?.() ?? mapRef.current?.getContainer?.());
              } catch {
                /* ignore */
              }
            }}
            onLoad={evt => {
              try {
                applyAgroCloudMapboxBranding(evt.target.getContainer());
              } catch {
                /* ignore */
              }
              setIsMapLoaded(true);
              setIsMapStyleReady(true);
              ensureAgroCloudMapScrollZoom(evt.target);
              applyAgroCloudMapPerformanceTuning(evt.target);
              try {
                evt.target.dragRotate?.disable?.();
              } catch {
                /* ignore */
              }
              applySiGlobeCockpitFog(evt.target);
              if (!siGlobeCockpitBootRef.current) {
                siGlobeCockpitBootRef.current = true;
                viewStateLiveRef.current = { ...SI_GLOBE_COCKPIT_2D_VIEW };
                setViewState(SI_GLOBE_COCKPIT_2D_VIEW);
                syncAgroCloudMapboxCamera(evt.target, SI_GLOBE_COCKPIT_2D_VIEW);
              } else {
                syncAgroCloudMapboxCamera(evt.target, viewStateLiveRef.current);
              }
              warmAgroCloudTerrainDemSource(evt.target);
              siEnsureGlobeProjection();
              syncAgroCloudTerrain3d(evt.target, activeBasemapId, viewStateLiveRef.current.pitch);
              syncLiveViewport(true);
            }}
          >
            {isMapStyleReady ? (
              <>
                {geoAiPinGeoJson ? (
                  <Source id="si-geo-ai-pin" type="geojson" data={geoAiPinGeoJson as any}>
                    <Layer
                      id="si-geo-ai-pin-glow"
                      type="circle"
                      paint={{
                        'circle-radius': 18,
                        'circle-color': '#a78bfa',
                        'circle-opacity': 0.35,
                        'circle-blur': 0.6,
                      }}
                    />
                    <Layer
                      id="si-geo-ai-pin-core"
                      type="circle"
                      paint={{
                        'circle-radius': 7,
                        'circle-color': '#c4b5fd',
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#faf5ff',
                      }}
                    />
                  </Source>
                ) : null}

                {geoAiPinLngLat && geoAiPendingInspectCard ? (
                  <Marker longitude={geoAiPinLngLat[0]} latitude={geoAiPinLngLat[1]} anchor="center">
                    <button
                      type="button"
                      className="si-geo-ai-pin-open"
                      title={`Show details ΓÇö ${geoAiPendingInspectCard.title}`}
                      aria-label={`Show details for ${geoAiPendingInspectCard.title}`}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        openStagedGeoAiInspectCard();
                      }}
                    >
                      <span className="si-geo-ai-pin-open__ring" aria-hidden />
                    </button>
                  </Marker>
                ) : null}

                {measureRender.geojson ? (
                  <Source id="si-measure-source" type="geojson" data={measureRender.geojson as any}>
                    <Layer
                      id="si-measure-fill"
                      type="fill"
                      filter={['==', ['get', 'role'], 'fill']}
                      paint={{
                        'fill-color': '#f59e0b',
                        'fill-opacity': 0.16,
                      }}
                    />
                    <Layer
                      id="si-measure-guide"
                      type="line"
                      filter={['==', ['get', 'role'], 'guide']}
                      paint={{
                        'line-color': '#f59e0b',
                        'line-width': 1.5,
                        'line-opacity': 0.85,
                        'line-dasharray': [2, 2],
                      }}
                    />
                    <Layer
                      id="si-measure-line-active"
                      type="line"
                      filter={['all', ['==', ['get', 'role'], 'line'], ['==', ['get', 'finished'], false]]}
                      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                      paint={{ 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [2, 1.5] }}
                    />
                    <Layer
                      id="si-measure-line-done"
                      type="line"
                      filter={['all', ['==', ['get', 'role'], 'line'], ['==', ['get', 'finished'], true]]}
                      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                      paint={{ 'line-color': '#f59e0b', 'line-width': 2.5 }}
                    />
                    <Layer
                      id="si-measure-vertex"
                      type="circle"
                      filter={['==', ['get', 'role'], 'vertex']}
                      paint={{
                        'circle-radius': 5,
                        'circle-color': '#fde68a',
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#b45309',
                      }}
                    />
                  </Source>
                ) : null}

                {measureRender.labels.map(l => (
                  <Marker key={l.id} longitude={l.lng} latitude={l.lat} anchor="bottom">
                    <span className="si-measure-map-label">{l.text}</span>
                  </Marker>
                ))}

                {goToXyMarker ? (
                  <Marker longitude={goToXyMarker.lng} latitude={goToXyMarker.lat} anchor="bottom">
                    <div className="si-map-search-pin si-map-search-pin--goto-xy" title="Go To XY marker">
                      <i className="fa-solid fa-location-dot si-map-search-pin__icon" aria-hidden />
                    </div>
                  </Marker>
                ) : null}

                {searchPin && (
                  <Marker longitude={searchPin.lng} latitude={searchPin.lat} anchor="bottom">
                    <div
                      className={
                        'si-map-search-pin' + (geoAiPendingInspectCard ? ' si-map-search-pin--clickable' : '')
                      }
                      title={geoAiPendingInspectCard ? `Show details ΓÇö ${searchPin.label}` : searchPin.label}
                      role={geoAiPendingInspectCard ? 'button' : undefined}
                      aria-label={geoAiPendingInspectCard ? `Show details for ${searchPin.label}` : undefined}
                      onPointerDown={geoAiPendingInspectCard ? e => e.stopPropagation() : undefined}
                      onClick={
                        geoAiPendingInspectCard
                          ? e => {
                              e.stopPropagation();
                              openStagedGeoAiInspectCard();
                            }
                          : undefined
                      }
                    >
                      <span className="si-map-search-pin__pulse" aria-hidden />
                      <i className="fa-solid fa-location-dot si-map-search-pin__icon" aria-hidden />
                    </div>
                  </Marker>
                )}

                {cropClassAoiGeometry ? (
                  <Source id="si-crop-class-aoi-source" type="geojson" data={cropClassAoiGeometry as any}>
                    <Layer
                      id="si-crop-class-aoi-fill"
                      type="fill"
                      filter={['==', ['geometry-type'], 'Polygon']}
                      paint={{
                        'fill-color': '#8b5cf6',
                        'fill-opacity': 0.16 * drawVisualOpacity,
                      }}
                    />
                    <Layer
                      id="si-crop-class-aoi-line"
                      type="line"
                      filter={['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]]}
                      paint={{
                        'line-color': '#7c3aed',
                        'line-width': 2.25,
                        'line-opacity': 0.92 * drawVisualOpacity,
                      }}
                    />
                  </Source>
                ) : null}
                {treeDetectionsActive && treeDetectionOverlayData && treeOverlayVisible ? (
                  <Source id={TREE_DETECTIONS_SOURCE_ID} type="geojson" data={treeDetectionOverlayData as any}>
                    <Layer
                      id={`${TREE_DETECTIONS_LAYER_ID}-halo`}
                      type="circle"
                      paint={{
                        'circle-radius': [
                          'interpolate',
                          ['linear'],
                          ['zoom'],
                          14,
                          ['interpolate', ['linear'], ['get', 'crownDiameterM'], 1, 3, 12, 9],
                          20,
                          ['interpolate', ['linear'], ['get', 'crownDiameterM'], 1, 7, 12, 22],
                        ],
                        'circle-color': ['get', 'color'],
                        'circle-opacity': 0.22,
                        'circle-stroke-color': ['get', 'color'],
                        'circle-stroke-width': 1.5,
                        'circle-stroke-opacity': 0.9,
                      }}
                    />
                    <Layer
                      id={TREE_DETECTIONS_LAYER_ID}
                      type="circle"
                      paint={{
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 1.6, 18, 3.2, 20, 4.5],
                        'circle-color': '#052e16',
                        'circle-stroke-color': ['get', 'color'],
                        'circle-stroke-width': 1.4,
                      }}
                    />
                  </Source>
                ) : null}
                {/* Hydro analysis layers are persistent: they stay on the map
                    regardless of whether the Hydro tool is open, and are only
                    removed when the user toggles/deletes them in the Layers panel. */}
                {HYDRO_STEP_ORDER.map(stepId => {
                      const st = hydro.steps[stepId];
                      if (!st.visible || !st.result) return null;
                      const res = st.result;
                      const userOpacity = st.opacity ?? 1;
                      if (res.kind === 'raster') {
                        return (
                          <Source
                            key={`hydro-${stepId}`}
                            id={`hydro-${stepId}-source`}
                            type="image"
                            url={res.dataUrl}
                            coordinates={res.coordinates as any}
                          >
                            <Layer
                              id={`hydro-${stepId}-raster`}
                              type="raster"
                              paint={{ 'raster-opacity': res.opacity * userOpacity, 'raster-fade-duration': 0 }}
                            />
                          </Source>
                        );
                      }
                      if (res.render === 'contours') {
                        return (
                          <Source key={`hydro-${stepId}`} id={`hydro-${stepId}-source`} type="geojson" data={res.data as any}>
                            <Layer
                              id={`hydro-${stepId}-line`}
                              type="line"
                              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                              paint={{
                                'line-color': '#92400e',
                                'line-opacity': 0.85 * userOpacity,
                                'line-width': ['case', ['==', ['get', 'index'], 1], 1.8, 0.7] as any,
                              }}
                            />
                            <Layer
                              id={`hydro-${stepId}-label`}
                              type="symbol"
                              filter={['==', ['get', 'index'], 1] as any}
                              layout={{
                                visibility: hydroContourLabels ? 'visible' : 'none',
                                'symbol-placement': 'line',
                                'text-field': ['concat', ['to-string', ['get', 'elev']], ' m'] as any,
                                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] as any,
                                'text-size': 10,
                                'symbol-spacing': 220,
                              }}
                              paint={{
                                'text-color': '#7c2d12',
                                'text-halo-color': 'rgba(255,255,255,0.9)',
                                'text-halo-width': 1.3,
                                'text-opacity': userOpacity,
                              }}
                            />
                          </Source>
                        );
                      }
                      if (res.render === 'streams') {
                        // Classify by the user-selected model; the paint expression is
                        // rebuilt whenever `hydroStreamModel` changes ΓåÆ instant re-colour.
                        const isShreve = hydroStreamModel === 'shreve';
                        const prop = isShreve ? 'shreve' : 'strahler';
                        const maxVal = Math.max(
                          2,
                          isShreve ? res.maxShreve ?? 1 : res.maxStrahler ?? 1,
                        );
                        const mid = 1 + (maxVal - 1) / 2;
                        // Distinct colour per order/magnitude: cool (low) ΓåÆ warm (high).
                        const colorRamp: any = isShreve
                          ? [
                              'interpolate',
                              ['linear'],
                              ['get', prop],
                              1,
                              '#bae6fd',
                              mid,
                              '#2563eb',
                              maxVal,
                              '#f97316',
                            ]
                          : [
                              'interpolate',
                              ['linear'],
                              ['get', prop],
                              1,
                              '#93c5fd',
                              mid,
                              '#2563eb',
                              maxVal,
                              '#dc2626',
                            ];
                        return (
                          <Source key={`hydro-${stepId}`} id={`hydro-${stepId}-source`} type="geojson" data={res.data as any}>
                            <Layer
                              id={`hydro-${stepId}-line`}
                              type="line"
                              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                              paint={{
                                'line-color': colorRamp,
                                'line-opacity': 0.95 * userOpacity,
                                'line-width': [
                                  'interpolate',
                                  ['linear'],
                                  ['get', prop],
                                  1,
                                  0.7,
                                  maxVal,
                                  3.6,
                                ] as any,
                              }}
                            />
                          </Source>
                        );
                      }
                      // mesh
                      return (
                        <Source key={`hydro-${stepId}`} id={`hydro-${stepId}-source`} type="geojson" data={res.data as any}>
                          <Layer
                            id={`hydro-${stepId}-fill`}
                            type="fill"
                            paint={{ 'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.55 * userOpacity }}
                          />
                          <Layer
                            id={`hydro-${stepId}-line`}
                            type="line"
                            paint={{ 'line-color': 'rgba(15,23,42,0.45)', 'line-opacity': userOpacity, 'line-width': 0.4 }}
                          />
                        </Source>
                      );
                    })}
                {/* Well Site Recommendation (Hydro-AI) ΓÇö suitability heatmap (points render via the managed custom layer). */}
                {wellSite.result && wellSite.heatVisible ? (
                  <Source
                    id="wellsite-heat-source"
                    type="image"
                    url={wellSite.result.raster.dataUrl}
                    coordinates={wellSite.result.raster.coordinates as any}
                  >
                    <Layer
                      id="wellsite-heat-raster"
                      type="raster"
                      paint={{
                        'raster-opacity': (wellSite.result.raster.opacity ?? 0.78) * wellSite.opacity,
                        'raster-fade-duration': 0,
                      }}
                    />
                  </Source>
                ) : null}
                {wellSuitability.result && wellSuitability.heatVisible ? (
                  <Source
                    id="well-suit-heat-source"
                    type="image"
                    url={wellSuitability.result.raster.dataUrl}
                    coordinates={wellSuitability.result.raster.coordinates as any}
                  >
                    <Layer
                      id="well-suit-heat-raster"
                      type="raster"
                      paint={{
                        'raster-opacity':
                          (wellSuitability.result.raster.opacity ?? 0.78) * wellSuitability.opacity,
                        'raster-fade-duration': 0,
                      }}
                    />
                  </Source>
                ) : null}
                {wellSuitability.result?.streams && wellSuitability.streamsVisible ? (
                  <Source
                    id="well-suit-streams-source"
                    type="geojson"
                    data={wellSuitability.result.streams.data as any}
                  >
                    <Layer
                      id="well-suit-streams-line"
                      type="line"
                      paint={{
                        'line-color': '#38bdf8',
                        'line-opacity': 0.85,
                        'line-width': 1.2,
                      }}
                    />
                  </Source>
                ) : null}
                {aoiFieldsMapGeoJson ? (
                  <Source id="si-aoi-fields-source" type="geojson" data={aoiFieldsMapGeoJson as any}>
                    <Layer
                      id="si-aoi-fields-fill"
                      type="fill"
                      filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                      paint={aoiFieldsMapFillPaint as any}
                    />
                    <Layer id="si-aoi-fields-line" type="line" paint={aoiFieldsMapLinePaint as any} />
                  </Source>
                ) : null}
                {regionalCalibratedGeoJson ? (
                  <Source id="si-regional-crop-calibrated" type="geojson" data={regionalCalibratedGeoJson as any}>
                    <Layer
                      id="si-regional-crop-calibrated-fill"
                      type="fill"
                      filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                      paint={{
                        'fill-color': ['coalesce', ['get', 'fillColor'], '#22c55e'],
                        'fill-opacity': 0.58,
                      }}
                    />
                    <Layer
                      id="si-regional-crop-calibrated-line"
                      type="line"
                      paint={{
                        'line-color': ['coalesce', ['get', 'strokeColor'], '#16a34a'],
                        'line-width': 2.25,
                      }}
                    />
                  </Source>
                ) : null}
                {isMapStyleReady && multiAoiFeatureCollection.features.length > 0 ? (
                  <Source id="si-multi-aoi-source" type="geojson" data={multiAoiFeatureCollection as any}>
                    <Layer
                      id="si-multi-aoi-fill"
                      type="fill"
                      filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                      paint={{
                        'fill-color': ['coalesce', ['get', 'aoiColor'], SI_DEFAULT_VECTOR_OUTLINE_COLOR] as any,
                        'fill-opacity': 0,
                      }}
                    />
                    <Layer
                      id="si-multi-aoi-line"
                      type="line"
                      paint={{
                        'line-color': ['coalesce', ['get', 'aoiColor'], SI_DEFAULT_VECTOR_OUTLINE_COLOR] as any,
                        'line-width': ['case', ['==', ['get', 'isActive'], 1], SI_DEFAULT_VECTOR_LINE_WEIGHT + 0.5, SI_DEFAULT_VECTOR_LINE_WEIGHT] as any,
                        'line-opacity': 1,
                      }}
                    />
                  </Source>
                ) : null}
                {isMapStyleReady && multiAoiCentroidCollection.features.length > 0 ? (
                  <Source
                    id="si-multi-aoi-centroids"
                    type="geojson"
                    data={multiAoiCentroidCollection as any}
                    cluster
                    clusterRadius={46}
                    clusterMaxZoom={13}
                  >
                    <Layer
                      id="si-multi-aoi-cluster"
                      type="circle"
                      filter={['has', 'point_count']}
                      paint={{
                        'circle-color': '#0ea5e9',
                        'circle-stroke-color': '#e0f2fe',
                        'circle-stroke-width': 1.5,
                        'circle-opacity': 0.92,
                        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 25] as any,
                      }}
                    />
                    <Layer
                      id="si-multi-aoi-cluster-count"
                      type="symbol"
                      filter={['has', 'point_count']}
                      layout={{
                        'text-field': ['to-string', ['get', 'point_count_abbreviated']] as any,
                        'text-size': 12,
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] as any,
                      }}
                      paint={{ 'text-color': '#f8fafc' }}
                    />
                    <Layer
                      id="si-multi-aoi-point"
                      type="circle"
                      filter={['!', ['has', 'point_count']]}
                      paint={{
                        'circle-color': ['coalesce', ['get', 'aoiColor'], '#22c55e'] as any,
                        'circle-stroke-color': '#ecfeff',
                        'circle-stroke-width': 1.5,
                        'circle-radius': ['case', ['==', ['get', 'isActive'], 1], 7.5, 5.5] as any,
                        'circle-opacity': 0.96,
                      }}
                    />
                  </Source>
                ) : null}
                {false && aoiHeatPointGeoJson?.features?.length ? (
                  <Source id="si-aoi-heat-source" type="geojson" data={aoiHeatPointGeoJson as any}>
                    <Layer
                      id="si-aoi-heatmap"
                      type="heatmap"
                      paint={{
                        'heatmap-weight': ['coalesce', ['get', 'weight'], 0.2],
                        'heatmap-intensity': 1.15,
                        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 7, 18, 12, 28, 16, 42],
                        'heatmap-opacity': 0.78,
                        'heatmap-color': aoiHeatmapColorExpression,
                      }}
                    />
                    <Layer
                      id="si-aoi-heat-points"
                      type="circle"
                      minzoom={13}
                      paint={{
                        'circle-radius': 2,
                        'circle-color': ['coalesce', ['get', 'color'], '#22c55e'],
                        'circle-opacity': 0.32,
                      }}
                    />
                  </Source>
                ) : null}

                {editHandlesGeoJson ? (
                  <Source id="si-edit-handles" type="geojson" data={editHandlesGeoJson as any}>
                    <Layer
                      id="si-edit-handles-circles"
                      type="circle"
                      paint={{
                        'circle-radius': 9,
                        'circle-color': drawStyle.strokeColor,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#0f172a',
                        'circle-opacity': 0.95 * drawVisualOpacity,
                        'circle-stroke-opacity': drawVisualOpacity,
                        ...SI_DRAW_CIRCLE_EMISSIVE,
                      }}
                    />
                  </Source>
                ) : null}
              </>
            ) : null}

            {isMapStyleReady && showStacFootprintsOnMap && stacFootprintsGeoJson.features.length > 0 && (
              <Source id="si-stac-footprints" type="geojson" data={stacFootprintsGeoJson as any}>
                <Layer
                  id="si-stac-footprints-fill"
                  type="fill"
                  filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                  paint={{
                    'fill-color': '#38bdf8',
                    'fill-opacity': 0.14,
                  }}
                />
                <Layer
                  id="si-stac-footprints-line"
                  type="line"
                  paint={{
                    'line-color': '#0ea5e9',
                    'line-width': 1.25,
                    'line-dasharray': [2, 1],
                  }}
                />
              </Source>
            )}

            {isMapStyleReady && sentinelWmsOnMap && sentinelWmsRenderReady && sentinelWmsZoomOk && !!sentinelFetchDate
              ? sentinelHubWmsDisplayChunks.map((chunk, chunkIdx) => (
                  <Source
                    key={`sentinel-${chunkIdx}`}
                    id={`sentinel-source-${chunkIdx}`}
                    type="raster"
                    tiles={[wmsTileUrls[chunkIdx] ?? '']}
                    tileSize={SENTINEL_HUB_WMS_TILE_PIXELS}
                    minzoom={sentinelWmsMinZoom}
                    bounds={resolveSentinelWmsChunkBounds(chunk)}
                  >
                    <Layer
                      id={`sentinel-layer-${chunkIdx}`}
                      type="raster"
                      paint={{
                        'raster-opacity': (chunk.evalscriptB64 ? 1 : 0.96) * aoiMaskDisplayOpacity,
                        'raster-fade-duration': 0,
                        'raster-resampling': 'linear',
                      }}
                    />
                  </Source>
                ))
              : null}

            {isMapStyleReady && activeAoiBoundaryMask ? (
              <Source
                id="si-agro-structures-boundary"
                type="geojson"
                data={activeAoiBoundaryMask as GeoJSON.FeatureCollection}
              >
                <Layer
                  id="si-agro-structures-boundary-fill"
                  type="fill"
                  paint={{
                    'fill-color': '#38bdf8',
                    'fill-opacity': 0.06,
                  }}
                />
                <Layer
                  id="si-agro-structures-boundary-line"
                  type="line"
                  paint={{
                    'line-color': '#38bdf8',
                    'line-width': 2.25,
                    'line-opacity': 0.95,
                  }}
                />
              </Source>
            ) : null}

            {isMapStyleReady && cropAlertSettings.enabled && cropAlertResultsOnMap.length > 0 ? (
              <SiCropAlertMapMarkersLayer
                results={cropAlertResultsOnMap}
                selectedFieldKey={selectedCropAlertFieldKey}
                popupFieldKey={cropAlertMapPopupFieldKey}
                onSelect={handleCropAlertMarkerSelect}
                onClosePopup={handleCropAlertPopupClose}
              />
            ) : null}

            {isMapStyleReady && stressZonesPopupLngLat && stressZones.result ? (
              <Marker
                longitude={stressZonesPopupLngLat.lng}
                latitude={stressZonesPopupLngLat.lat}
                anchor="bottom"
                style={{ zIndex: 900 }}
              >
                <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                  <SiStressZonesMapPopup
                    zone={stressZonesPopupZone}
                    result={stressZones.result}
                    onClose={closeStressZonesPopup}
                  />
                </div>
              </Marker>
            ) : null}

            {isMapStyleReady && stacMapThumb && isStacThumbVisible && (
              <Source
                key={stacMapThumb.url}
                id="si-stac-thumb-raster"
                type="image"
                url={stacMapThumb.url}
                coordinates={stacMapThumb.coordinates}
              >
                <Layer
                  id="si-stac-thumb-layer"
                  type="raster"
                  paint={{
                    'raster-opacity': 0.92,
                    'raster-fade-duration': 0,
                  }}
                />
              </Source>
            )}

            {isMapStyleReady && drawnGeometry && aoiLayerVisible ? (
              <Source id="drawn-index-geometry-source" type="geojson" data={drawnGeometry as any}>
                <Layer
                  id="drawn-index-geometry-fill"
                  type="fill"
                  filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                  paint={{
                    'fill-color': hasActiveLayerSourceAoi ? '#f59e0b' : drawStyle.fillColor,
                    // Keep a light fill so the sketch remains visible over basemap / imagery.
                    'fill-opacity':
                      Math.min(0.35, Math.max(0.12, drawStyle.fillOpacity)) *
                      drawVisualOpacity *
                      aoiLayerOpacity,
                    ...SI_DRAW_FILL_EMISSIVE,
                  }}
                />
              </Source>
            ) : null}

            {isMapStyleReady && drawnGeometry && aoiLayerVisible ? (
              <Source id="drawn-index-geometry-outline-source" type="geojson" data={drawnGeometry as any}>
                <Layer
                  id="drawn-index-geometry-line-halo"
                  type="line"
                  filter={[
                    'in',
                    ['geometry-type'],
                    ['literal', ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']],
                  ]}
                  paint={{
                    'line-color': '#0f172a',
                    'line-width': [
                      'case',
                      ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
                      Math.max(5, drawStyle.strokeWidth + 4),
                      Math.max(5, drawStyle.strokeWidth + 3),
                    ],
                    'line-opacity': 0.8 * drawVisualOpacity * aoiLayerOpacity,
                    'line-blur': 0.2,
                    ...SI_DRAW_LINE_EMISSIVE,
                  }}
                />
                <Layer
                  id="drawn-index-geometry-line"
                  type="line"
                  filter={[
                    'in',
                    ['geometry-type'],
                    ['literal', ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']],
                  ]}
                  paint={{
                    'line-color': hasActiveLayerSourceAoi ? '#fbbf24' : drawStyle.strokeColor,
                    'line-width': [
                      'case',
                      ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
                      Math.max(2.5, drawStyle.strokeWidth + 1),
                      Math.max(2.5, drawStyle.strokeWidth),
                    ],
                    'line-opacity': drawVisualOpacity * aoiLayerOpacity,
                    ...(hasActiveLayerSourceAoi ? { 'line-dasharray': [2, 2] as [number, number] } : {}),
                    ...SI_DRAW_LINE_EMISSIVE,
                  }}
                />
                <Layer
                  id="drawn-index-geometry-point"
                  type="circle"
                  filter={['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]]}
                  paint={{
                    'circle-radius': drawStyle.pointRadius,
                    'circle-color': drawStyle.fillColor,
                    'circle-opacity': Math.min(1, drawStyle.fillOpacity + 0.55) * drawVisualOpacity * aoiLayerOpacity,
                    'circle-stroke-color': '#0f172a',
                    'circle-stroke-width': Math.max(2, drawStyle.strokeWidth / 2),
                    'circle-stroke-opacity': drawVisualOpacity * aoiLayerOpacity,
                    ...SI_DRAW_CIRCLE_EMISSIVE,
                  }}
                />
              </Source>
            ) : null}

            {/* Draft sketch must mount after Sentinel rasters so vertices/lines stay visible while drawing. */}
            {isMapStyleReady && draftDrawGeoJson ? (
              <Source id="si-draw-draft" type="geojson" data={draftDrawGeoJson as any}>
                <Layer
                  id="si-draw-draft-fill"
                  type="fill"
                  filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                  paint={{
                    'fill-color': drawStyle.fillColor,
                    'fill-opacity': Math.min(0.45, drawStyle.fillOpacity + 0.12) * drawVisualOpacity,
                    ...SI_DRAW_FILL_EMISSIVE,
                  }}
                />
                {/* Dark halo so green strokes remain visible over NDVI / cropland imagery. */}
                <Layer
                  id="si-draw-draft-poly-halo"
                  type="line"
                  filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                  paint={{
                    'line-color': '#0f172a',
                    'line-width': Math.max(5, drawStyle.strokeWidth + 3),
                    'line-opacity': 0.85 * drawVisualOpacity,
                    'line-blur': 0.25,
                    ...SI_DRAW_LINE_EMISSIVE,
                  }}
                />
                <Layer
                  id="si-draw-draft-poly-line"
                  type="line"
                  filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                  paint={{
                    'line-color': drawStyle.strokeColor,
                    'line-width': Math.max(2.5, drawStyle.strokeWidth),
                    'line-opacity': 0.98 * drawVisualOpacity,
                    ...SI_DRAW_LINE_EMISSIVE,
                  }}
                />
                <Layer
                  id="si-draw-draft-line"
                  type="line"
                  filter={[
                    'all',
                    ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
                    ['!=', ['get', 'draftRole'], 'closeHint'],
                  ]}
                  paint={{
                    'line-color': drawStyle.strokeColor,
                    'line-width': Math.max(2.5, drawStyle.strokeWidth),
                    'line-dasharray': [2, 2],
                    'line-opacity': 0.95 * drawVisualOpacity,
                    ...SI_DRAW_LINE_EMISSIVE,
                  }}
                />
                <Layer
                  id="si-draw-draft-close-hint"
                  type="line"
                  filter={['==', ['get', 'draftRole'], 'closeHint']}
                  paint={{
                    'line-color': '#4ade80',
                    'line-width': Math.max(2, drawStyle.strokeWidth),
                    'line-dasharray': [1, 2],
                    'line-opacity': 0.95 * drawVisualOpacity,
                    ...SI_DRAW_LINE_EMISSIVE,
                  }}
                />
                <Layer
                  id="si-draw-draft-vertex"
                  type="circle"
                  filter={[
                    'any',
                    ['==', ['get', 'draftRole'], 'polyVertex'],
                    ['==', ['get', 'draftRole'], 'circleCenter'],
                    ['==', ['get', 'draftRole'], 'circleCardinal'],
                  ]}
                  paint={{
                    'circle-radius': [
                      'match',
                      ['get', 'draftRole'],
                      'circleCenter',
                      12,
                      'circleCardinal',
                      10,
                      9,
                    ] as any,
                    'circle-color': [
                      'match',
                      ['get', 'draftRole'],
                      'circleCenter',
                      '#fbbf24',
                      'circleCardinal',
                      '#86efac',
                      '#fef08a',
                    ] as any,
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#0f172a',
                    'circle-opacity': drawVisualOpacity,
                    'circle-stroke-opacity': drawVisualOpacity,
                    ...SI_DRAW_CIRCLE_EMISSIVE,
                  }}
                />
                <Layer
                  id="si-draw-draft-pt"
                  type="circle"
                  filter={[
                    'all',
                    ['==', ['geometry-type'], 'Point'],
                    ['!=', ['get', 'draftRole'], 'polyVertex'],
                    ['!=', ['get', 'draftRole'], 'circleCenter'],
                    ['!=', ['get', 'draftRole'], 'circleCardinal'],
                  ]}
                  paint={{
                    'circle-radius': 7,
                    'circle-color': drawStyle.strokeColor,
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#0f172a',
                    'circle-opacity': drawVisualOpacity,
                    'circle-stroke-opacity': drawVisualOpacity,
                    ...SI_DRAW_CIRCLE_EMISSIVE,
                  }}
                />
              </Source>
            ) : null}

            {isMapStyleReady && mapSelectionHighlightGeojson.features.length > 0 ? (
              <Source id="si-geo-ai-table-selection" type="geojson" data={mapSelectionHighlightGeojson as any}>
                <Layer
                  id="si-geo-ai-sel-fill"
                  type="fill"
                  filter={['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]}
                  paint={{
                    'fill-color': SI_GEO_AI_MAP_SELECTION_PAINT.fillColor,
                    'fill-opacity': SI_GEO_AI_MAP_SELECTION_PAINT.fillOpacity,
                  }}
                />
                <Layer
                  id="si-geo-ai-sel-line"
                  type="line"
                  filter={['in', ['geometry-type'], ['literal', ['LineString', 'Polygon', 'MultiPolygon']]]}
                  paint={{
                    'line-color': SI_GEO_AI_MAP_SELECTION_PAINT.lineColor,
                    'line-width': SI_GEO_AI_MAP_SELECTION_PAINT.lineWidth,
                    'line-opacity': SI_GEO_AI_MAP_SELECTION_PAINT.lineOpacity,
                  }}
                />
                <Layer
                  id="si-geo-ai-sel-point"
                  type="circle"
                  filter={['==', ['geometry-type'], 'Point']}
                  paint={{
                    'circle-radius': SI_GEO_AI_MAP_SELECTION_PAINT.pointRadius,
                    'circle-color': SI_GEO_AI_MAP_SELECTION_PAINT.pointColor,
                    'circle-opacity': SI_GEO_AI_MAP_SELECTION_PAINT.pointOpacity,
                    'circle-stroke-width': SI_GEO_AI_MAP_SELECTION_PAINT.pointStrokeWidth,
                    'circle-stroke-color': SI_GEO_AI_MAP_SELECTION_PAINT.pointStrokeColor,
                  }}
                />
              </Source>
            ) : null}

            {isMapStyleReady &&
              multiAoiPopupIds.map(pid => {
                const row = multiAoiItems.find(x => x.id === pid);
                if (!row) return null;
                const c = getGeoJsonCentroid(row.feature);
                if (!Array.isArray(c) || c.length < 2) return null;
                return (
                  <Marker key={`si-multi-aoi-popup-${pid}`} longitude={c[0]} latitude={c[1]} anchor="bottom">
                    <div className="si-multi-aoi-popup" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                      <div className="si-multi-aoi-popup__head">
                        <strong>{row.name}</strong>
                        <button
                          type="button"
                          onClick={() => setMultiAoiPopupIds(prev => prev.filter(x => x !== pid))}
                          aria-label="Close AOI popup"
                        >
                          ├ù
                        </button>
                      </div>
                      <div className="si-multi-aoi-popup__row">
                        <span>Source</span>
                        <em>{row.source}</em>
                      </div>
                      <div className="si-multi-aoi-popup__row">
                        <span>Mean</span>
                        <em>{row.analysis ? row.analysis.mean.toFixed(3) : 'ΓÇö'}</em>
                      </div>
                      <div className="si-multi-aoi-popup__row">
                        <span>Range</span>
                        <em>{row.analysis ? `${row.analysis.min.toFixed(3)} .. ${row.analysis.max.toFixed(3)}` : 'ΓÇö'}</em>
                      </div>
                    </div>
                  </Marker>
                );
              })}

            {isMapStyleReady &&
            (geoAiPopupMode === 'single' || geoAiPopupMode === 'multiple') &&
            geoAiInspectPopups.length > 0 &&
            geoAiInspectPopups.map((pop, popIdx) => (
              <Marker
                key={pop.id}
                className="si-geo-ai-inspect-marker"
                longitude={pop.lng}
                latitude={pop.lat}
                anchor="bottom"
                offset={[((popIdx * 47) % 160) - 80, 6 - (popIdx % 7) * 11]}
              >
                <SiFeatureInspectPopup
                  pop={pop}
                  anchored
                  featureIndex={popIdx}
                  featureTotal={geoAiInspectPopups.length}
                  onToggleCollapse={() =>
                    setGeoAiInspectPopups(prev =>
                      prev.map(p => (p.id === pop.id ? { ...p, collapsed: !p.collapsed } : p)),
                    )
                  }
                  onClose={() => setGeoAiInspectPopups(prev => prev.filter(p => p.id !== pop.id))}
                  onZoomTo={() =>
                    setViewState(v => ({
                      ...v,
                      longitude: pop.lng,
                      latitude: pop.lat,
                      zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                    }))
                  }
                  onPrevFeature={
                    popIdx > 0
                      ? () => {
                          const prevPop = geoAiInspectPopups[popIdx - 1];
                          if (!prevPop) return;
                          setViewState(v => ({
                            ...v,
                            longitude: prevPop.lng,
                            latitude: prevPop.lat,
                            zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                          }));
                        }
                      : undefined
                  }
                  onNextFeature={
                    popIdx < geoAiInspectPopups.length - 1
                      ? () => {
                          const nextPop = geoAiInspectPopups[popIdx + 1];
                          if (!nextPop) return;
                          setViewState(v => ({
                            ...v,
                            longitude: nextPop.lng,
                            latitude: nextPop.lat,
                            zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                          }));
                        }
                      : undefined
                  }
                />
              </Marker>
            ))}

            {isMapStyleReady && isWeatherIntelOpen && weatherLocation ? (
              <Marker
                longitude={weatherLocation.lng}
                latitude={weatherLocation.lat}
                anchor="bottom"
                className="si-weather-map-pin"
              >
                <span className="si-weather-map-pin__dot" aria-hidden />
              </Marker>
            ) : null}

          </MapGL>

          {isWeatherVizOpen ? (
            <WeatherVizOverlay sim={weatherSim} />
          ) : null}

          {cropAlertSettings.enabled && cropAlertSettings.showLegend && cropAlertResultsOnMap.length > 0 ? (
            <SiCropAlertMapLegend />
          ) : null}

          <LayerLiveLegendFloatingPanel
            open={layerLiveLegendOpen}
            onClose={() => setLayerLiveLegendOpen(false)}
            containerRef={siMapContainerRef}
            layerOptions={remoteSensingLayerOptions}
            layerGroups={remoteSensingLayerSelectGroups}
            activeLayerId={wmsLayerSelectValue}
            aoiGeometry={drawnGeometry}
            sceneDate={sentinelFetchDate}
            seriesStart={timeSeriesStart}
            seriesEnd={timeSeriesEnd}
          />

          <SiImageryTimeSeriesFloatingPanel
            open={imageryTimeSeriesOpen}
            onClose={() => setImageryTimeSeriesOpen(false)}
            containerRef={siMapContainerRef}
            agroStructuresMask={agroStructuresLayerAoiMask}
            aoiFields={aoiFields}
            committedAoiGeometry={drawnGeometry?.geometry ?? null}
            defaultLayerId={wmsLayerSelectValue}
            analysisDate={imageryDateAutoFollow ? localIsoDate() : localIsoDate(selectedDate)}
            onMapDateFromChart={iso => {
              setImageryDateAutoFollow(false);
              applySelectedDate(dateFromLocalIso(iso));
            }}
            mapboxToken={mapboxToken}
          />

          <SiGoToXyBar
            open={goToXyOpen}
            onClose={() => setGoToXyOpen(false)}
            longitude={viewState.longitude}
            latitude={viewState.latitude}
            bottomOffset={weeklyComposites.length > 0 ? 92 : 12}
            onFlyTo={(lng, lat, opts) => {
              setViewState(v => ({
                ...v,
                longitude: lng,
                latitude: lat,
                zoom: opts?.panOnly
                  ? typeof v.zoom === 'number'
                    ? v.zoom
                    : 12
                  : Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                transitionDuration: 700,
              }));
            }}
            onPlaceMarker={(lng, lat) => setGoToXyMarker({ lng, lat })}
          />

          {isWeatherIntelOpen && weatherLocation ? (
            <WeatherIntelligencePanel
              open
              onClose={() => {
                setIsWeatherIntelOpen(false);
                setWeatherPickOnMap(false);
              }}
              onBeginMapPick={() => {
                setWeatherPickOnMap(true);
                setIsWeatherIntelOpen(false);
              }}
              location={weatherLocation}
              onLocationChange={loc => {
                setWeatherLocation(loc);
                setViewState(v => ({
                  ...v,
                  longitude: loc.lng,
                  latitude: loc.lat,
                  zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 8),
                }));
              }}
              mapPickActive={weatherPickOnMap}
              onMapPickToggle={setWeatherPickOnMap}
              mapboxToken={mapboxToken}
            />
          ) : null}

          {isWeatherVizOpen ? (
            <WeatherVisualizationPanel
              open
              onClose={() => setIsWeatherVizOpen(false)}
              sim={weatherSim}
              onChange={patch => setWeatherSim(prev => ({ ...prev, ...patch }))}
              onReset={() => setWeatherSim(DEFAULT_WEATHER_SIM)}
              getMap={() => (mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current)}
              getCamera={(): WeatherVizCamera | null => {
                const v = viewStateLiveRef.current ?? viewState;
                if (!v) return null;
                return {
                  longitude: typeof v.longitude === 'number' ? v.longitude : 0,
                  latitude: typeof v.latitude === 'number' ? v.latitude : 0,
                  zoom: typeof v.zoom === 'number' ? v.zoom : 2,
                  pitch: typeof v.pitch === 'number' ? v.pitch : 0,
                  bearing: typeof v.bearing === 'number' ? v.bearing : 0,
                };
              }}
              onApplyCamera={cam => {
                setViewState(prev => ({
                  ...prev,
                  longitude: cam.longitude,
                  latitude: cam.latitude,
                  zoom: cam.zoom,
                  pitch: cam.pitch,
                  bearing: cam.bearing,
                }));
              }}
            />
          ) : null}

          {isMapStyleReady && geoAiPopupMode === 'side' && geoAiInspectPopups.length > 0 ? (
            <div className="si-geo-ai-inspect-side-stack" role="region" aria-label="Geo AI attribute inspector">
              {geoAiInspectPopups.map((pop, popIdx) => (
                <SiFeatureInspectPopup
                  key={pop.id}
                  pop={pop}
                  className="si-feature-identify-card--side"
                  featureIndex={popIdx}
                  featureTotal={geoAiInspectPopups.length}
                  onToggleCollapse={() =>
                    setGeoAiInspectPopups(prev =>
                      prev.map(p => (p.id === pop.id ? { ...p, collapsed: !p.collapsed } : p)),
                    )
                  }
                  onClose={() => setGeoAiInspectPopups(prev => prev.filter(p => p.id !== pop.id))}
                  onZoomTo={() =>
                    setViewState(v => ({
                      ...v,
                      longitude: pop.lng,
                      latitude: pop.lat,
                      zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                    }))
                  }
                  onPrevFeature={
                    popIdx > 0
                      ? () => {
                          const prevPop = geoAiInspectPopups[popIdx - 1];
                          if (!prevPop) return;
                          setViewState(v => ({
                            ...v,
                            longitude: prevPop.lng,
                            latitude: prevPop.lat,
                            zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                          }));
                        }
                      : undefined
                  }
                  onNextFeature={
                    popIdx < geoAiInspectPopups.length - 1
                      ? () => {
                          const nextPop = geoAiInspectPopups[popIdx + 1];
                          if (!nextPop) return;
                          setViewState(v => ({
                            ...v,
                            longitude: nextPop.lng,
                            latitude: nextPop.lat,
                            zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                          }));
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          ) : null}

          <SatelliteAoiStaticChartsMapOverlay
            open={mapStaticChartsOpen}
            onClose={() => setMapStaticChartsOpen(false)}
            indexLabel={selectedIndexConfig.label}
            layerLiveStatsLayerGroups={remoteSensingLayerSelectGroups}
            layerLiveStatsLayers={layerLiveStatsLayers}
            onLayerLiveStatsLayersChange={setLayerLiveStatsLayers}
            primaryLayerId={wmsLayerSelectValue}
            staticMultiLineLabels={staticAoiMultiLineData.labels}
            staticMultiLineDatasets={staticAoiMultiLineData.datasets}
            staticMultiLineHasLst={staticAoiMultiLineData.hasLst}
            staticMultiLineHasEt={staticAoiMultiLineData.hasEt}
            staticChartExportLngLatPerRow={staticAoiChartExportLngLatPerRow}
            weeklyMeans={satelliteWeeklyMeans}
            pivotBars={satellitePivotBars}
          />

          <SatelliteGeoAiFloatingWidget
            open={geoAiFloatingOpen}
            expanded={geoAiFloatingExpanded}
            onToggleExpanded={() => setGeoAiFloatingExpanded(v => !v)}
            onRequestClose={() => {
              setGeoAiFloatingOpen(false);
              setGeoAiFloatingExpanded(true);
            }}
          >
                      <div className="si-geo-explorer-root si-geo-explorer-root--unified">
                        <div className="si-env-section-card si-geo-explorer">
                          <div className="si-geo-explorer-header">
                            <h2 className="si-geo-explorer-title">Geo AI Exploration</h2>
                            <div className="si-geo-explorer-header-actions">
                              <button
                                type="button"
                                className="si-geo-explorer-icon-btn"
                                onClick={() => setGeoAiSmartSuggestionsEnabled(v => !v)}
                                aria-label={geoAiSmartSuggestionsEnabled ? 'Disable smart suggestions' : 'Enable smart suggestions'}
                                title={geoAiSmartSuggestionsEnabled ? 'Smart Suggestions: on' : 'Smart Suggestions: off'}
                              >
                                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="si-geo-explorer-icon-btn"
                                onClick={clearCurrentGeoAiPanel}
                                aria-label="Clear chat"
                                title="Clear chat"
                              >
                                <i className="fa-solid fa-trash" aria-hidden />
                              </button>
                              <label className="si-geo-ai-popup-mode-label si-geo-ai-exploration-toggle" title="Off: row highlight & map identify do not pan/zoom (use table zoom icon to fly).">
                                <span className="si-geo-ai-popup-mode-label-text">Explore</span>
                                <button
                                  type="button"
                                  className={`si-geo-ai-exploration-btn${geoAiExplorationMode ? ' si-geo-ai-exploration-btn--on' : ''}`}
                                  aria-pressed={geoAiExplorationMode}
                                  onClick={() => setGeoAiExplorationMode(v => !v)}
                                >
                                  {geoAiExplorationMode ? 'On' : 'Off'}
                                </button>
                              </label>
                              <label className="si-geo-ai-popup-mode-label">
                                <span className="si-geo-ai-popup-mode-label-text">Popup</span>
                                <select
                                  className="si-geo-ai-popup-mode-select"
                                  value={geoAiPopupMode}
                                  onChange={e => setGeoAiPopupMode(e.target.value as GeoAiPopupMode)}
                                  title="How feature identify windows appear (linked with map / table)"
                                  aria-label="Geo AI popup mode"
                                >
                                  <option value="single">Single</option>
                                  <option value="multiple">Multiple</option>
                                  <option value="docked">Docked panel</option>
                                  <option value="side">Side inspector</option>
                                </select>
                              </label>
                            </div>
                          </div>
                          <div className="si-geo-ai-model-tabs" role="tablist" aria-label="AI model">
                            <button
                              type="button"
                              role="tab"
                              aria-selected={geoAiModelTab === 'claude'}
                              className={`si-geo-ai-model-tab${geoAiModelTab === 'claude' ? ' si-geo-ai-model-tab--active' : ''}`}
                              onClick={() => setGeoAiModelTab('claude')}
                            >
                              Claude
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={geoAiModelTab === 'deepseek'}
                              className={`si-geo-ai-model-tab${geoAiModelTab === 'deepseek' ? ' si-geo-ai-model-tab--active' : ''}`}
                              onClick={() => setGeoAiModelTab('deepseek')}
                            >
                              DeepSeek
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={geoAiModelTab === 'gemini'}
                              className={`si-geo-ai-model-tab${geoAiModelTab === 'gemini' ? ' si-geo-ai-model-tab--active' : ''}`}
                              onClick={() => setGeoAiModelTab('gemini')}
                            >
                              Gemini
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={geoAiModelTab === 'ollama'}
                              className={`si-geo-ai-model-tab${geoAiModelTab === 'ollama' ? ' si-geo-ai-model-tab--active' : ''}`}
                              onClick={() => setGeoAiModelTab('ollama')}
                            >
                              AgroCloud AI Chat
                            </button>
                          </div>

                          {geoAiModelTab === 'gemini' ? (
                            <>
                              <div
                                className="si-geo-explorer-messages"
                                ref={geoExplorerMessagesRef}
                                onScroll={() => {
                                  const el = geoExplorerMessagesRef.current;
                                  if (!el || !geoExplorerHasOlderMessages) return;
                                  if (el.scrollTop <= 24) loadOlderGeoExplorerMessages();
                                }}
                              >
                                {geoExplorerHasOlderMessages ? (
                                  <button
                                    type="button"
                                    className="si-geo-explorer-load-more"
                                    onClick={loadOlderGeoExplorerMessages}
                                    aria-label="Load older messages"
                                  >
                                    Load earlier messages
                                  </button>
                                ) : null}
                                <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                  <div className="si-geo-explorer-avatar" aria-hidden>
                                    <i className="fa-solid fa-globe" />
                                  </div>
                                  <div className="si-geo-explorer-bubble">
                                    <div className="si-geo-explorer-bubble-with-copy">
                                      <p className="si-geo-explorer-bubble-text">{SI_GEO_AI_WELCOME_GEMINI_TEXT}</p>
                                      <SiCopyTextButton
                                        text={SI_GEO_AI_WELCOME_GEMINI_TEXT}
                                        className="si-geo-explorer-bubble-copy-btn"
                                        title="Copy intro"
                                        ariaLabel="Copy welcome text"
                                        variant="compact"
                                      />
                                    </div>
                                  </div>
                                </div>
                                {visibleGeoExplorerMessages.map(msg => (
                                  <div
                                    key={msg.id}
                                    className={`si-geo-explorer-row si-geo-explorer-row--${msg.role}`}
                                  >
                                    {msg.role === 'model' ? (
                                      <div className="si-geo-explorer-avatar" aria-hidden>
                                        <i className="fa-solid fa-wand-magic-sparkles" />
                                      </div>
                                    ) : null}
                                    <div className="si-geo-explorer-bubble">
                                      <GeoExplorerGeminiMessageParts
                                        msg={msg}
                                        cssPrefix="si-geo-explorer"
                                        onTableMapAction={onSiGeoAiTableMapAction}
                                        onTableBatchZoom={onGeoAiTableBatchZoom}
                                        onSaveEditedUserMessage={saveEditedGeoExplorerGeminiQuestion}
                                        onSendEditedToComposer={setGeoExplorerDraft}
                                        suggestLayers={geoAiSuggestContext.layers}
                                        suggestFields={geoAiSuggestContext.fields}
                                        suggestNumericFields={geoAiSuggestContext.numericFields}
                                        onTableSelectionLinksChange={onGeoAiTableSelectionSync}
                                        mapFocusFeatureKey={geoAiTableMapFocusKey}
                                        onTableQuerySelectApplied={onGeoAiQuerySelectApplied}
                                      />
                                    </div>
                                  </div>
                                ))}
                                {geoExplorerBusy ? (
                                  <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                    <div className="si-geo-explorer-avatar" aria-hidden>
                                      <i className="fa-solid fa-wand-magic-sparkles" />
                                    </div>
                                    <div className="si-geo-explorer-bubble si-geo-explorer-bubble--typing">
                                      <i className="fa-solid fa-spinner fa-spin" aria-hidden />{' '}
                                      {geoExplorerAwaitKind === 'edit' ? 'UpdatingΓÇª' : 'ThinkingΓÇª'}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                                {geoExplorerChatError ? (
                                <div className="si-geo-explorer-error-row">
                                  <p className="si-geo-explorer-error">{geoExplorerChatError}</p>
                                  <SiCopyTextButton
                                    text={geoExplorerChatError}
                                    className="si-geo-explorer-error-copy-btn"
                                    title="Copy error message"
                                    ariaLabel="Copy error text"
                                    variant="compact"
                                  />
                                </div>
                              ) : null}
                              {geoExplorerPendingImage ? (
                                <p className="si-geo-explorer-pending-img">
                                  <i className="fa-solid fa-image" aria-hidden /> Image ready to send
                                  <button
                                    type="button"
                                    className="si-geo-explorer-linkish"
                                    onClick={() => setGeoExplorerPendingImage(null)}
                                  >
                                    Remove
                                  </button>
                                </p>
                              ) : null}
                              <GeoExplorerGeminiInputRow
                                cssPrefix="si-geo-explorer"
                                draft={geoExplorerDraft}
                                onDraftChange={setGeoExplorerDraft}
                                onSend={sendGeoExplorerChat}
                                busy={geoExplorerBusy}
                                pendingImage={geoExplorerPendingImage}
                                fileInputRef={geoExplorerFileInputRef}
                                onAttachChange={onGeoExplorerAttachChange}
                                textareaAriaLabel="Geo AI Gemini message"
                                availableLayers={geoAiSuggestContext.layers}
                                availableFields={geoAiSuggestContext.fields}
                                availableNumericFields={geoAiSuggestContext.numericFields}
                                availableGeometryOps={geoAiSuggestContext.geometryOps}
                                smartSuggestionsEnabled={geoAiSmartSuggestionsEnabled}
                              />
                            </>
                          ) : null}

                          {geoAiModelTab === 'claude' || geoAiModelTab === 'deepseek' ? (
                            <>
                              <div
                                className="si-geo-explorer-messages"
                                ref={geoAiModelTab === 'claude' ? geoAiClaudeMessagesRef : geoAiDeepseekMessagesRef}
                                onScroll={() => {
                                  const isClaude = geoAiModelTab === 'claude';
                                  const el = isClaude ? geoAiClaudeMessagesRef.current : geoAiDeepseekMessagesRef.current;
                                  const hasOlder = isClaude ? geoAiClaudeHasOlderMessages : geoAiDeepseekHasOlderMessages;
                                  if (!el || !hasOlder) return;
                                  if (el.scrollTop <= 24) {
                                    if (isClaude) loadOlderGeoAiClaudeMessages();
                                    else loadOlderGeoAiDeepseekMessages();
                                  }
                                }}
                              >
                                {(geoAiModelTab === 'claude' ? geoAiClaudeHasOlderMessages : geoAiDeepseekHasOlderMessages) ? (
                                  <button
                                    type="button"
                                    className="si-geo-explorer-load-more"
                                    onClick={() => {
                                      if (geoAiModelTab === 'claude') loadOlderGeoAiClaudeMessages();
                                      else loadOlderGeoAiDeepseekMessages();
                                    }}
                                    aria-label="Load older messages"
                                  >
                                    Load earlier messages
                                  </button>
                                ) : null}
                                <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                  <div className="si-geo-explorer-avatar" aria-hidden>
                                    <i className="fa-solid fa-database" />
                                  </div>
                                  <div className="si-geo-explorer-bubble">
                                    <div className="si-geo-explorer-bubble-with-copy">
                                      <p className="si-geo-explorer-bubble-text">{SI_GEO_AI_WELCOME_DATA_ASSISTANT_TEXT}</p>
                                      <SiCopyTextButton
                                        text={SI_GEO_AI_WELCOME_DATA_ASSISTANT_TEXT}
                                        className="si-geo-explorer-bubble-copy-btn"
                                        title="Copy intro"
                                        ariaLabel="Copy welcome text"
                                        variant="compact"
                                      />
                                    </div>
                                  </div>
                                </div>
                                {(geoAiModelTab === 'claude' ? visibleGeoAiClaudeMessages : visibleGeoAiDeepseekMessages).map(msg => (
                                  <div
                                    key={msg.id}
                                    className={`si-geo-explorer-row si-geo-explorer-row--${
                                      msg.role === 'user' ? 'user' : 'model'
                                    }`}
                                  >
                                    {msg.role === 'model' ? (
                                      <div className="si-geo-explorer-avatar" aria-hidden>
                                        <i className="fa-solid fa-robot" />
                                      </div>
                                    ) : null}
                                    <div className="si-geo-explorer-bubble">
                                      <GeoExplorerGeminiMessageParts
                                        msg={msg}
                                        cssPrefix="si-geo-explorer"
                                        onTableMapAction={onSiGeoAiTableMapAction}
                                        onTableBatchZoom={onGeoAiTableBatchZoom}
                                        onUpdateUserMessage={(messageId, nextText) => {
                                          const setter =
                                            geoAiModelTab === 'claude' ? setGeoAiChatMessages : setGeoDeepseekChatMessages;
                                          setter(prev =>
                                            prev.map(m =>
                                              m.id === messageId && m.role === 'user'
                                                ? replaceUserMessageText(m, nextText)
                                                : m,
                                            ),
                                          );
                                        }}
                                        onSendEditedToComposer={
                                          geoAiModelTab === 'claude' ? setGeoAiDraft : setGeoDeepseekDraft
                                        }
                                        suggestLayers={geoAiSuggestContext.layers}
                                        suggestFields={geoAiSuggestContext.fields}
                                        suggestNumericFields={geoAiSuggestContext.numericFields}
                                        onTableSelectionLinksChange={onGeoAiTableSelectionSync}
                                        mapFocusFeatureKey={geoAiTableMapFocusKey}
                                        onTableQuerySelectApplied={onGeoAiQuerySelectApplied}
                                      />
                                    </div>
                                  </div>
                                ))}
                                {(geoAiModelTab === 'claude' ? geoAiBusy : geoDeepseekBusy) ? (
                                  <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                    <div className="si-geo-explorer-avatar" aria-hidden>
                                      <i className="fa-solid fa-robot" />
                                    </div>
                                    <div className="si-geo-explorer-bubble si-geo-explorer-bubble--typing">
                                      <i className="fa-solid fa-spinner fa-spin" aria-hidden /> ThinkingΓÇª
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              {geoAiModelTab === 'claude' && geoAiChatError ? (
                                <div className="si-geo-explorer-error-row">
                                  <p className="si-geo-explorer-error">{geoAiChatError}</p>
                                  <SiCopyTextButton
                                    text={geoAiChatError}
                                    className="si-geo-explorer-error-copy-btn"
                                    title="Copy error message"
                                    ariaLabel="Copy error text"
                                    variant="compact"
                                  />
                                </div>
                              ) : null}
                              {geoAiModelTab === 'deepseek' && geoDeepseekChatError ? (
                                <div className="si-geo-explorer-error-row">
                                  <p className="si-geo-explorer-error">{geoDeepseekChatError}</p>
                                  <SiCopyTextButton
                                    text={geoDeepseekChatError}
                                    className="si-geo-explorer-error-copy-btn"
                                    title="Copy error message"
                                    ariaLabel="Copy error text"
                                    variant="compact"
                                  />
                                </div>
                              ) : null}
                              <GeoExplorerGeminiInputRow
                                cssPrefix="si-geo-explorer"
                                draft={geoAiModelTab === 'claude' ? geoAiDraft : geoDeepseekDraft}
                                onDraftChange={v =>
                                  geoAiModelTab === 'claude' ? setGeoAiDraft(v) : setGeoDeepseekDraft(v)
                                }
                                onSend={t =>
                                  geoAiModelTab === 'claude' ? sendGeoAiChat(t) : sendGeoDeepseekChat(t)
                                }
                                busy={geoAiModelTab === 'claude' ? geoAiBusy : geoDeepseekBusy}
                                pendingImage={null}
                                showAttach={false}
                                placeholder={
                                  geoAiModelTab === 'claude'
                                    ? 'e.g. List layer names and fields from the attached GIS / Develop dataΓÇª'
                                    : 'e.g. Summarize saved layers and Develop Dashboard fields (same context as Claude)ΓÇª'
                                }
                                textareaAriaLabel={
                                  geoAiModelTab === 'claude' ? 'Geo AI Claude message' : 'Geo AI DeepSeek message'
                                }
                                availableLayers={geoAiSuggestContext.layers}
                                availableFields={geoAiSuggestContext.fields}
                                availableNumericFields={geoAiSuggestContext.numericFields}
                                availableGeometryOps={geoAiSuggestContext.geometryOps}
                                smartSuggestionsEnabled={geoAiSmartSuggestionsEnabled}
                              />
                              <p className="si-geo-explorer-footnote">
                                {geoAiModelTab === 'claude' ? (
                                  <>
                                    Powered by Anthropic Claude. Set <code>VITE_CLAUDE_API_KEY</code> or System Settings ΓåÆ API
                                    Tokens ΓåÆ Claude API. Context is rebuilt each send from GIS Content + Develop Dashboard Data.
                                  </>
                                ) : (
                                  <>
                                    Powered by DeepSeek. Set <code>VITE_DEEPSEEK_API_KEY</code> or System Settings ΓåÆ API Tokens
                                    ΓåÆ DeepSeek. Same GIS + Develop context as Claude; rebuilt each send.
                                  </>
                                )}
                              </p>
                            </>
                          ) : null}
                          {geoAiModelTab === 'ollama' ? (
                            <>
                              <div
                                className="si-geo-explorer-messages"
                                ref={geoAiOllamaMessagesRef}
                                onScroll={() => {
                                  const el = geoAiOllamaMessagesRef.current;
                                  if (!el || !geoAiOllamaHasOlderMessages) return;
                                  if (el.scrollTop <= 24) loadOlderGeoAiOllamaMessages();
                                }}
                              >
                                {geoAiOllamaHasOlderMessages ? (
                                  <button
                                    type="button"
                                    className="si-geo-explorer-load-more"
                                    onClick={loadOlderGeoAiOllamaMessages}
                                    aria-label="Load older messages"
                                  >
                                    Load earlier messages
                                  </button>
                                ) : null}
                                <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                  <div className="si-geo-explorer-avatar" aria-hidden>
                                    <i className="fa-solid fa-database" />
                                  </div>
                                  <div className="si-geo-explorer-bubble">
                                    <div className="si-geo-explorer-bubble-with-copy">
                                      <p className="si-geo-explorer-bubble-text">{SI_GEO_AI_WELCOME_DATA_ASSISTANT_TEXT}</p>
                                      <SiCopyTextButton
                                        text={SI_GEO_AI_WELCOME_DATA_ASSISTANT_TEXT}
                                        className="si-geo-explorer-bubble-copy-btn"
                                        title="Copy intro"
                                        ariaLabel="Copy welcome text"
                                        variant="compact"
                                      />
                                    </div>
                                  </div>
                                </div>
                                {visibleGeoAiOllamaMessages.map(msg => (
                                  <div
                                    key={msg.id}
                                    className={`si-geo-explorer-row si-geo-explorer-row--${
                                      msg.role === 'user' ? 'user' : 'model'
                                    }`}
                                  >
                                    {msg.role === 'model' ? (
                                      <div className="si-geo-explorer-avatar" aria-hidden>
                                        <i className="fa-solid fa-robot" />
                                      </div>
                                    ) : null}
                                    <div className="si-geo-explorer-bubble">
                                      <GeoExplorerGeminiMessageParts
                                        msg={msg}
                                        cssPrefix="si-geo-explorer"
                                        onTableMapAction={onSiGeoAiTableMapAction}
                                        onTableBatchZoom={onGeoAiTableBatchZoom}
                                        onUpdateUserMessage={(messageId, nextText) => {
                                          setGeoOllamaChatMessages(prev =>
                                            prev.map(m =>
                                              m.id === messageId && m.role === 'user'
                                                ? replaceUserMessageText(m, nextText)
                                                : m,
                                            ),
                                          );
                                        }}
                                        onSendEditedToComposer={setGeoOllamaDraft}
                                        suggestLayers={geoAiSuggestContext.layers}
                                        suggestFields={geoAiSuggestContext.fields}
                                        suggestNumericFields={geoAiSuggestContext.numericFields}
                                        onTableSelectionLinksChange={onGeoAiTableSelectionSync}
                                        mapFocusFeatureKey={geoAiTableMapFocusKey}
                                        onTableQuerySelectApplied={onGeoAiQuerySelectApplied}
                                      />
                                    </div>
                                  </div>
                                ))}
                                {geoOllamaBusy ? (
                                  <div className="si-geo-explorer-row si-geo-explorer-row--model">
                                    <div className="si-geo-explorer-avatar" aria-hidden>
                                      <i className="fa-solid fa-robot" />
                                    </div>
                                    <div className="si-geo-explorer-bubble si-geo-explorer-bubble--typing">
                                      <i className="fa-solid fa-spinner fa-spin" aria-hidden /> ThinkingΓÇª
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              {geoOllamaChatError ? (
                                <div className="si-geo-explorer-error-row">
                                  <p className="si-geo-explorer-error">{geoOllamaChatError}</p>
                                  <SiCopyTextButton
                                    text={geoOllamaChatError}
                                    className="si-geo-explorer-error-copy-btn"
                                    title="Copy error message"
                                    ariaLabel="Copy error text"
                                    variant="compact"
                                  />
                                </div>
                              ) : null}
                              <GeoExplorerGeminiInputRow
                                cssPrefix="si-geo-explorer"
                                draft={geoOllamaDraft}
                                onDraftChange={setGeoOllamaDraft}
                                onSend={t => sendGeoOllamaChat(t)}
                                busy={geoOllamaBusy}
                                pendingImage={null}
                                showAttach={false}
                                placeholder="e.g. Summarize saved layers (runs locally via Ollama ΓÇö same GIS + Develop context)ΓÇª"
                                textareaAriaLabel="Geo AI Ollama message"
                                availableLayers={geoAiSuggestContext.layers}
                                availableFields={geoAiSuggestContext.fields}
                                availableNumericFields={geoAiSuggestContext.numericFields}
                                availableGeometryOps={geoAiSuggestContext.geometryOps}
                                smartSuggestionsEnabled={geoAiSmartSuggestionsEnabled}
                              />
                            </>
                          ) : null}
                          {geoAiPopupMode === 'docked' && geoAiInspectPopups.length > 0 ? (
                            <div className="si-geo-ai-inspect-dock-panel" role="region" aria-label="Identify ΓÇö docked">
                              {geoAiInspectPopups.map((pop, popIdx) => (
                                <SiFeatureInspectPopup
                                  key={pop.id}
                                  pop={pop}
                                  className="si-feature-identify-card--docked"
                                  featureIndex={popIdx}
                                  featureTotal={geoAiInspectPopups.length}
                                  onToggleCollapse={() =>
                                    setGeoAiInspectPopups(prev =>
                                      prev.map(p => (p.id === pop.id ? { ...p, collapsed: !p.collapsed } : p)),
                                    )
                                  }
                                  onClose={() => setGeoAiInspectPopups(prev => prev.filter(p => p.id !== pop.id))}
                                  onZoomTo={() =>
                                    setViewState(v => ({
                                      ...v,
                                      longitude: pop.lng,
                                      latitude: pop.lat,
                                      zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                                    }))
                                  }
                                  onPrevFeature={
                                    popIdx > 0
                                      ? () => {
                                          const prevPop = geoAiInspectPopups[popIdx - 1];
                                          if (!prevPop) return;
                                          setViewState(v => ({
                                            ...v,
                                            longitude: prevPop.lng,
                                            latitude: prevPop.lat,
                                            zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                                          }));
                                        }
                                      : undefined
                                  }
                                  onNextFeature={
                                    popIdx < geoAiInspectPopups.length - 1
                                      ? () => {
                                          const nextPop = geoAiInspectPopups[popIdx + 1];
                                          if (!nextPop) return;
                                          setViewState(v => ({
                                            ...v,
                                            longitude: nextPop.lng,
                                            latitude: nextPop.lat,
                                            zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                                          }));
                                        }
                                      : undefined
                                  }
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
          </SatelliteGeoAiFloatingWidget>

          <SatelliteMapAnalysisChrome
            weeklyChips={satelliteTimelineChips}
            activeChipId={satelliteActiveChipId}
            onPickChip={handleSatelliteChipPick}
            timelinePlaying={isTimelinePlaying}
            onTogglePlay={() => setIsTimelinePlaying(p => !p)}
            onStep={handleSatelliteTimelineStep}
            timelineVisible={weeklyComposites.length > 0 || fieldTimelineSessionActive}
            timelinePlaybackMs={timelinePlaybackMs}
            onCycleTimelineSpeed={cycleTimelinePlaybackSpeed}
            mapTool={satelliteToolbarTool}
            onMapTool={t => openRemoteSensingDrawing(t as RemoteSensingDrawingTool)}
            hasClearableDrawing={satelliteHasClearableDrawing}
            onClearDrawing={clearSatelliteDrawingImmediate}
            hasAoi={!!drawnGeometry}
            staticChartsOpen={mapStaticChartsOpen}
            onToggleStaticCharts={() => setMapStaticChartsOpen(o => !o)}
            weeklyMeans={satelliteWeeklyMeans}
            pivotBars={satellitePivotBars}
            indexLabel={selectedIndexConfig.label}
            staticMultiLineLabels={staticAoiMultiLineData.labels}
            staticMultiLineDatasets={staticAoiMultiLineData.datasets}
            staticMultiLineHasLst={staticAoiMultiLineData.hasLst}
            staticMultiLineHasEt={staticAoiMultiLineData.hasEt}
            staticChartExportLngLatPerRow={staticAoiChartExportLngLatPerRow}
            layerLiveStatsLayerGroups={remoteSensingLayerSelectGroups}
            layerLiveStatsLayers={layerLiveStatsLayers}
            onLayerLiveStatsLayersChange={setLayerLiveStatsLayers}
            primaryLayerId={wmsLayerSelectValue}
            mapRef={mapRef}
            mapLoaded={isMapLoaded}
            onProcessingWorkflowNavigate={onProcessingWorkflowNavigateMapToolbox}
            processingDropdownOpen={isLayerDropdownOpen}
            processingEmbedSection={isLayerDropdownOpen ? expandedEnvSection : null}
            onMapToolboxEmbedHost={setMapToolboxEmbedHost}
            onToolboxPanelClose={() => setIsLayerDropdownOpen(false)}
            mapToolboxLayersMain={layersEnvMainTools}
            mapToolboxLayersOptionsExtra={layersEnvOptionsExtra}
            geoAiFloatingOpen={geoAiFloatingOpen}
            onGeoAiFloatingRailToggle={onGeoAiFloatingRailToggle}
            onMapToolboxAddGisLayerAction={handleMapToolboxAddGisLayerAction}
            onMapToolboxAddGisLayerPrimaryClick={() => openAddLayerModal({ tab: 'giscontent', wizard: 'home' })}
            mapToolboxBrowseLayersPanel={mapToolboxBrowseLayersPanel}
            mapToolboxLayerLiveLegend={mapToolboxLayerLiveLegend}
            imageryTimeSeriesOpen={imageryTimeSeriesOpen}
            onImageryTimeSeriesOpenChange={setImageryTimeSeriesOpen}
            goToXyOpen={goToXyOpen}
            onGoToXyOpenChange={setGoToXyOpen}
            layerLiveLegendOpen={layerLiveLegendOpen}
            onLayerLiveLegendOpenChange={setLayerLiveLegendOpen}
            mapToolboxDrawingActive={rsDrawingModeActive}
            onMapToolboxToggleDrawing={() => {
              if (rsDrawingModeActiveRef.current) {
                handleRsDrawingModeChange(false);
                return;
              }
              if (measureModeRef.current) clearMeasure();
              if (gisSelectionActive) setGisSelectionActive(false);
              handleRsDrawingModeChange(true);
              applyMapDrawTool('polygon');
            }}
            mapToolboxSelectionActive={gisSelectionActive}
            onMapToolboxToggleSelection={() => {
              if (gisSelectionActive) {
                setGisSelectionActive(false);
                applyMapDrawTool('select');
                return;
              }
              if (rsDrawingModeActiveRef.current) handleRsDrawingModeChange(false);
              if (measureModeRef.current) clearMeasure();
              setGisSelectionActive(true);
              setGisSelectionTool('select');
              applyMapDrawTool('select');
            }}
            measureMode={measureMode}
            onMeasureOpenPanel={openMeasurePanel}
            onMeasureClear={clearMeasure}
            showMapToolbox={true}
          />

          {false && aoiHeatPointGeoJson?.features?.length ? (
            <div className="si-aoi-class-legend" dir="ltr">
              <div className="si-aoi-class-legend-title">{selectedIndex} classified (5 classes)</div>
              {aoiFiveClassLegend.map(row => (
                <div key={row.idx} className="si-aoi-class-legend-row">
                  <span className="si-aoi-class-legend-swatch" style={{ background: row.color }} />
                  <span>{row.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          {mpcProcessResult && stacMapThumb ? (
            <div className="si-map-analysis-pill" dir="ltr">
              <div className="si-map-analysis-pill-title">
                {mpcProcessResult.label || mpcProcessResult.template_id}
              </div>
              <div className="si-map-analysis-pill-row">
                <span>Items: {mpcProcessResult.item_count}</span>
                <span>{mpcProcessResult.datetime}</span>
              </div>
              {mpcProcessResult.statistics ? (
                <div className="si-map-analysis-pill-row">
                  <span>min {mpcProcessResult.statistics.min.toFixed(3)}</span>
                  <span>max {mpcProcessResult.statistics.max.toFixed(3)}</span>
                  <span>mean {mpcProcessResult.statistics.mean.toFixed(3)}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="si-crop-alert-toasts" aria-live="polite">
              {cropAlertNotifications.map(note => (
                <button
                  key={note.id}
                  type="button"
                  className={`si-crop-alert-toast si-crop-alert-toast--${note.severity}`}
                  onClick={() => {
                    setSelectedCropAlertFieldKey(note.fieldKey);
                    setCropAlertMapPopupFieldKey(note.fieldKey);
                    setCropAlertNotifications(prev => prev.filter(n => n.id !== note.id));
                  }}
                >
                  <strong>{note.title}</strong>
                  <span>{note.message}</span>
                  <i className="fa-solid fa-xmark si-crop-alert-toast__close" aria-hidden />
                </button>
              ))}
            </div>

          <GisSelectionProvider value={gisSelectionContextValue}>
            <GisSelectionWorkbench />
          </GisSelectionProvider>

          <SiMapDrawWidget
            active={rsDrawingModeActive}
            activeTool={rsDrawingTool}
            onToolChange={handleRsDrawingToolChange}
            hasClearableDrawing={satelliteHasClearableDrawing}
            onClearDrawing={clearSatelliteDrawingImmediate}
            onDeactivate={() => handleRsDrawingModeChange(false)}
            panActive={!mapPanLocked}
            panLocked={mapPanLocked}
            onPan={() => {
              setMapDragPanEnabled(true);
              applyMapDrawTool('select');
            }}
            onTogglePanLock={toggleMapPanLock}
          />

          <HydroLegendTool
            steps={hydro.steps}
            streamModel={hydroStreamModel}
            open={isLegendToolOpen}
            onClose={() => setIsLegendToolOpen(false)}
          />

          <div className="si-map-floating-controls">
            <div className="si-map-floating-controls__row">
              <div className="si-map-floating-controls__left">
          <div
            ref={searchRef}
            className={`si-map-search ${isSearchOpen ? 'open' : 'collapsed'}`}
          >
            <button
              type="button"
              className="si-map-search-toggle"
              onClick={() => setIsSearchOpen(open => !open)}
            >
              <i className={isSearchOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-magnifying-glass'}></i>
            </button>

            {isSearchOpen && (
              <div className="si-map-search-inner">
                <i className="fa-solid fa-magnifying-glass si-map-search-icon"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowSearchResults(true);
                  }}
                  placeholder="Search places"
                  className="si-map-search-input"
                  role="combobox"
                  aria-expanded={showSearchResults && searchResults.length > 0}
                  aria-autocomplete="list"
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={handleSearchKeyDown}
                />
                <button
                  type="button"
                  className="si-map-search-button"
                  onClick={() => void performSearch()}
                  aria-label="Search"
                >
                  {isSearching ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-arrow-right"></i>}
                </button>
              </div>
            )}

            {isSearchOpen && showSearchResults && searchResults.length > 0 && (
              <div className="si-map-search-results" role="listbox">
                {searchResults.map((result, idx) => (
                  <button
                    type="button"
                    key={result.id}
                    role="option"
                    aria-selected={idx === searchActiveIndex}
                    className={`si-map-search-result${idx === searchActiveIndex ? ' is-active' : ''}`}
                    onMouseEnter={() => setSearchActiveIndex(idx)}
                    onClick={() => handleSelectSearchResult(result)}
                  >
                    <i className="fa-solid fa-location-dot si-map-search-result-icon" aria-hidden></i>
                    <span className="si-map-search-result-text">
                      <span className="si-map-search-result-title">{result.label}</span>
                      {result.subtitle && (
                        <span className="si-map-search-result-subtitle">{result.subtitle}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
              <div className="si-layer-live-toggle">
                <button
                  type="button"
                  className={`si-basemap-button si-layer-live-button ${isWmsOverlayVisible ? 'active' : ''}`}
                  onClick={() => setIsWmsOverlayVisible(v => !v)}
                  title={
                    isWmsOverlayVisible
                      ? `Hide ${wmsLayerSelectValue || 'index'} imagery (Layer Live)`
                      : `Show ${wmsLayerSelectValue || 'index'} imagery (Layer Live)`
                  }
                  aria-label="Toggle Layer Live index imagery on map"
                  aria-pressed={isWmsOverlayVisible}
                >
                  <i className="fa-regular fa-image" aria-hidden></i>
                </button>
              </div>
              <div className="si-basemap-toggle">
                <button
                  type="button"
                  className={`si-basemap-button ${isBasemapOpen ? 'active' : ''}`}
                  onClick={() => {
                    setIsBasemapOpen(open => !open);
                    setIsWeatherIntelOpen(false);
                    setWeatherPickOnMap(false);
                  }}
                  title="Basemap"
                >
                  <i className="fa-solid fa-globe"></i>
                </button>
                {isBasemapOpen && (
                  <div className="si-basemap-widget si-basemap-widget--grid">
                    {basemapCatalog.map(entry => {
                      const thumb = getBasemapThumbnail(entry, '');
                      const isHybrid =
                        entry.id === 'esri-imagery-hybrid';
                      const isTerrain3d =
                        entry.id === TOPOGRAPHIC_3D_BASEMAP_ID || entry.id === SATELLITE_3D_BASEMAP_ID;
                      return (
                        <button
                          type="button"
                          key={entry.id}
                          className={`si-basemap-card ${activeBasemapId === entry.id ? 'active' : ''}`}
                          onClick={() => {
                            basemapRasterFallbackRef.current = false;
                            setBasemapId(entry.id);
                            setIsBasemapOpen(false);
                          }}
                        >
                          <span className="si-basemap-card-thumb">
                            <img src={thumb} alt="" />
                            {isHybrid && <span className="si-basemap-card-hybrid">Labels</span>}
                            {isTerrain3d && <span className="si-basemap-card-hybrid">3D</span>}
                            {activeBasemapId === entry.id && (
                              <span className="si-basemap-card-check" aria-hidden>
                                <i className="fa-solid fa-check" />
                              </span>
                            )}
                          </span>
                          <span className="si-basemap-card-label">{entry.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="si-weather-toggle">
                <button
                  type="button"
                  className={`si-weather-button ${
                    weatherPickOnMap || (isWeatherIntelOpen && weatherLocation) ? 'active' : ''
                  }`}
                  title="Open-Meteo ┬╖ Weather Intelligence"
                  onClick={() => {
                    const engaged = weatherPickOnMap || isWeatherIntelOpen;
                    if (engaged) {
                      setWeatherPickOnMap(false);
                      setIsWeatherIntelOpen(false);
                    } else {
                      setWeatherPickOnMap(true);
                      setIsWeatherIntelOpen(false);
                    }
                    setIsBasemapOpen(false);
                  }}
                >
                  <i className="fa-solid fa-temperature-half" aria-hidden />
                </button>
              </div>
              <div className="si-weather-toggle">
                <button
                  type="button"
                  className={`si-weather-button ${isWeatherVizOpen ? 'active' : ''}`}
                  title="Weather visualization"
                  aria-label="Weather visualization"
                  aria-pressed={isWeatherVizOpen}
                  onClick={() => {
                    setIsWeatherVizOpen(open => !open);
                    setIsBasemapOpen(false);
                  }}
                >
                  <i className="fa-solid fa-cloud-sun-rain" aria-hidden />
                </button>
              </div>
              <div className={`si-view3d-toggle si-view3d-toggle--merged ${isTerrain3dPanelOpen ? 'is-open' : ''}`}>
                <div className="si-view3d-cluster">
                  <button
                    type="button"
                    className={`si-basemap-button si-view3d-button ${is3DView ? 'active' : ''}`}
                    title={is3DView ? 'Switch to 2D view' : 'Switch to 3D view'}
                    aria-label={is3DView ? 'Switch to 2D view' : 'Switch to 3D view'}
                    aria-pressed={is3DView}
                    onClick={toggle3DView}
                  >
                    <i className={`fa-solid ${is3DView ? 'fa-map' : 'fa-cube'}`} aria-hidden />
                    <span className="si-view3d-button__tag">{is3DView ? '2D' : '3D'}</span>
                  </button>
                </div>
                {isTerrain3dPanelOpen ? (
                  <div className="si-terrain3d-panel" role="dialog" aria-label="Terrain 3D controls">
                    <div className="si-terrain3d-panel__head">
                      <span className="si-terrain3d-panel__title">
                        <i className="fa-solid fa-mountain-sun" aria-hidden /> Terrain 3D
                      </span>
                      <button
                        type="button"
                        className="si-terrain3d-panel__close"
                        aria-label="Close terrain controls"
                        onClick={() => setIsTerrain3dPanelOpen(false)}
                      >
                        <i className="fa-solid fa-xmark" aria-hidden />
                      </button>
                    </div>

                    <div className={`si-terrain3d-opt ${is3DView ? '' : 'is-disabled'}`}>
                      <div className="si-terrain3d-opt__row">
                        <span className="si-terrain3d-opt__label">Relief height</span>
                        <span className="si-terrain3d-opt__val">{terrainExaggeration.toFixed(2)}├ù</span>
                      </div>
                      <input
                        type="range"
                        className="si-terrain3d-range"
                        min={1}
                        max={3}
                        step={0.05}
                        value={terrainExaggeration}
                        disabled={!is3DView}
                        onChange={e => handleTerrainExaggerationChange(Number(e.target.value))}
                        aria-label="Terrain relief height (vertical exaggeration)"
                      />
                    </div>

                  </div>
                ) : null}
              </div>
              <div className="si-legend-toggle">
                <button
                  type="button"
                  className={`si-basemap-button si-legend-button ${isLegendToolOpen ? 'active' : ''}`}
                  title={isLegendToolOpen ? 'Hide legend' : 'Show legend'}
                  aria-label={isLegendToolOpen ? 'Hide legend' : 'Show legend'}
                  aria-pressed={isLegendToolOpen}
                  onClick={() => {
                    setIsLegendToolOpen(v => !v);
                    setIsBasemapOpen(false);
                    setIsTerrain3dPanelOpen(false);
                  }}
                >
                  <i className="fa-solid fa-layer-group" aria-hidden />
                  <span className="si-view3d-button__tag">Key</span>
                </button>
              </div>
              </div>
              <div className="si-map-floating-controls__right si-map-floating-controls__right--proc-stack">
            <div className="si-env-rail si-env-rail--proc-anchor">
              <input
                ref={fileInputRef}
                type="file"
                className="add-layer-input"
                accept=".kml,.kmz,.zip,.geojson,.json,.csv,.tif,.tiff,.ifc,.gpx,.img,.vrt,.jp2,.ecw,.png,.jpg,.jpeg,.webp,.gif,.bmp"
                onChange={handleLayerFileChange}
              />
              <SatelliteMapProcessingOptionsPortal portalTarget={mapToolboxEmbedHost}>
                {isLayerDropdownOpen ? (
                  <div
                    className={`si-env-panel si-env-panel--satellite-toolbox si-env-panel--single-surface${
                      mapToolboxEmbedHost ? ' si-env-panel--toolbox-embed' : ' si-env-panel--mapbox-drop'
                    }`}
                    dir="auto"
                    {...processingPanelIsolationProps}
                  >
                  <div
                    className={`si-env-panel-header${mapToolboxEmbedHost ? ' si-env-panel-header--toolbox-primary' : ''}`}
                  >
                    <div className="si-env-header-top">
                      <div>
                        <div className="si-env-title">
                          {expandedEnvSection === 'remote-sensing'
                              ? 'Remote sensing'
                              : expandedEnvSection === 'crop-alerts'
                                ? 'Agro Sentinel Alert Engine'
                              : expandedEnvSection === 'stress-zones'
                                ? 'Stress Zones Detection'
                              : expandedEnvSection === 'crop-classification'
                                ? 'Prithvi Crop Classification'
                              : expandedEnvSection === 'ai-detection-gis'
                                ? 'AI Detection in GIS'
                              : expandedEnvSection === 'tree-detections'
                                ? 'Tree Detections'
                              : expandedEnvSection === 'hydro-watershed'
                                ? 'Hydro Watershed Workflow'
                              : expandedEnvSection === 'well-site'
                                ? 'Well Site (Hydro-AI)'
                              : expandedEnvSection === 'well-suitability'
                                ? 'Well Suitability (MCDA)'
                              : expandedEnvSection === 'flood-monitoring'
                                ? 'Flood Monitoring (SAR-Based)'
                                : expandedEnvSection === 'layers'
                                  ? 'Layers'
                                  : expandedEnvSection === 'source'
                                    ? 'Source catalog'
                                    : 'Processing Options'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="si-env-close"
                        onClick={() => setIsLayerDropdownOpen(false)}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  </div>
                    {expandedEnvSection === 'crop-alerts' && (
                      <div className="si-env-section-card si-field-analysis si-crop-alert-panel si-rs-panel--glass">
                        <SiCropAlertCenterPanel
                          settings={cropAlertSettings}
                          onChange={handleCropAlertSettingsChange}
                          results={cropAlertResults}
                          referenceDate={sentinelFetchDate}
                          userRequestedDate={wmsDate}
                          imageryContext={cropAlertImageryContext}
                          fieldCount={cropAlertFields.length}
                          isRunning={cropAlertRunning}
                          lastRunAt={cropAlertLastRunAt}
                          progress={cropAlertProgress}
                          liveFieldCount={cropAlertLiveFieldCount}
                          selectedFieldKey={selectedCropAlertFieldKey}
                          onSelectField={key => {
                            setSelectedCropAlertFieldKey(key);
                            if (key) {
                              setCropAlertMapPopupFieldKey(key);
                              const row = cropAlertResults.find(r => r.fieldKey === key);
                              if (row) {
                                setViewState(v => ({
                                  ...v,
                                  longitude: row.centroid[0],
                                  latitude: row.centroid[1],
                                  zoom: Math.max(typeof v.zoom === 'number' ? v.zoom : 2, 14),
                                }));
                              }
                            } else {
                              setCropAlertMapPopupFieldKey(null);
                            }
                          }}
                          onRefresh={runCropAlertAnalysis}
                        />
                      </div>
                    )}
                    {expandedEnvSection === 'stress-zones' && (
                      <div className="si-env-section-card si-rs-panel--glass">
                        <SiStressZonesPanel
                          fieldName="Current AOI"
                          sceneDate={sentinelFetchDate}
                          loading={stressZones.loading}
                          error={stressZones.error}
                          result={stressZones.result}
                          timeSeries={stressZones.timeSeries}
                          showOnMap={stressZones.showOnMap}
                          compareEnabled={stressZones.compareEnabled}
                          onShowOnMapChange={stressZones.setShowOnMap}
                          onCompareEnabledChange={stressZones.setCompareEnabled}
                          onRefresh={() => void stressZones.refresh()}
                          onZoneClick={handleStressZoneRowClick}
                        />
                      </div>
                    )}
                    {expandedEnvSection === 'crop-classification' && (
                      <div className="si-env-section-card si-rs-panel--glass">
                        <SiPrithviCropToolPanel
                          aoiGeometry={drawnGeometry?.geometry ?? null}
                          hasSelfInference={cropAiSelfInference}
                          dataProvider={cropAiDataProvider}
                          onDataProviderChange={handleCropAiDataProviderChange}
                          mode={cropAiMode}
                          onModeChange={setCropAiMode}
                          trainingSamples={cropAiTrainingSamples}
                          onTrainingSamplesChange={setCropAiTrainingSamples}
                          samplesValid={cropAiSamplesValidation.valid}
                          season={cropAiSeason}
                          onSeasonChange={setCropAiSeason}
                          job={cropAiJob}
                          isRunning={cropAiRunning}
                          onPickAoi={handleCropAiPickAoi}
                          onRunAoi={handleCropAiRunAoi}
                          onRunChip={handleCropAiRunChip}
                          onCancel={handleCropAiCancel}
                          onAddToMap={() => void addCropAiPredictionLayer(cropAiJob)}
                          onAddConfidenceToMap={() => void addCropAiConfidenceLayer(cropAiJob)}
                        />
                      </div>
                    )}
                    {expandedEnvSection === 'remote-sensing' && (
                      <RemoteSensingToolboxPanel
                        provider={remoteSensingProvider}
                        onProviderChange={setRemoteSensingProvider}
                        collection={remoteSensingCollection}
                        onCollectionChange={setRemoteSensingCollection}
                        wmsDate={wmsDate}
                        onWmsDateChange={v => {
                          setImageryDateAutoFollow(false);
                          saveSentinelImageryDatePrefsForAoi(sentinelImageryAoiKey, {
                            autoFollow: false,
                            manualIso: v,
                          });
                          applySelectedDate(dateFromLocalIso(v));
                        }}
                        onResetImageryDateAuto={resetSentinelImageryDateAuto}
                        imageryDateAutoFollow={imageryDateAutoFollow}
                        isFetchingSentinelScenes={isFetchingSentinelScenes}
                        imageryDateMeta={
                          imageryDateAutoFollow
                            ? `Auto ┬╖ requested ${cropAlertRequestedDate} ┬╖ scene ${autoLiveScenes.currentSceneDate}${
                                autoLiveScenes.previousSceneDate ? ` ┬╖ prev ${autoLiveScenes.previousSceneDate}` : ''
                              }${isFetchingSentinelScenes ? ' ┬╖ updatingΓÇª' : ''}`
                            : sentinelFetchDate !== wmsDate
                              ? `Nearest scene ${sentinelFetchDate}${sentinelFetchDate !== wmsDate ? ` (req. ${wmsDate})` : ''}`
                              : null
                        }
                        layerGroups={remoteSensingLayerSelectGroups}
                        layerValue={wmsLayerSelectValue}
                        onLayerChange={layerId => {
                          setWmsLayer(layerId);
                          const ids = Object.keys(ENVIRONMENTAL_INDICES) as EnvironmentalIndexId[];
                          if (ids.includes(layerId as EnvironmentalIndexId)) {
                            setSelectedIndex(layerId as EnvironmentalIndexId);
                          }
                        }}
                        isLoadingLayers={isLoadingLayers}
                        showOnMap={isWmsOverlayVisible}
                        onShowOnMapChange={setIsWmsOverlayVisible}
                        showOnMapLabel={`Show ${wmsLayerSelectValue || 'layer'} on map`}
                        wmsZoomWarning={
                          isWmsOverlayVisible && !sentinelWmsZoomOk
                            ? `Zoom ${sentinelWmsMinZoom}+ for Sentinel-2 (max 200 m/px).`
                            : null
                        }
                        onAddDataSource={openAoiDataSourceUploader}
                        aoiMaskBuilderSettings={aoiMaskBuilderSettings}
                        onAoiMaskBuilderChange={handleAoiMaskBuilderSettingsChange}
                        customLayers={customLayers}
                        sentinelLayerOptions={remoteSensingLayerOptions}
                        maskFeatureCount={aoiMaskBuilderFeatureCount}
                        selectedFeatureCount={aoiMaskBuilderSelectedKeys.size}
                        timeSeriesStart={timeSeriesStart}
                        timeSeriesEnd={timeSeriesEnd}
                        onTimeSeriesStartChange={v => {
                          setImageryDateAutoFollow(false);
                          setTimeSeriesStart(v);
                        }}
                        onTimeSeriesEndChange={v => {
                          setImageryDateAutoFollow(false);
                          setTimeSeriesEnd(v);
                        }}
                        mapPanLocked={mapPanLocked}
                        rsDrawingModeActive={rsDrawingModeActive}
                        onRsDrawingModeChange={handleRsDrawingModeChange}
                        rsDrawingTool={rsDrawingTool}
                        onRsDrawingToolChange={handleRsDrawingToolChange}
                        onPanNavigate={() => {
                          setMapDragPanEnabled(true);
                          applyMapDrawTool('select');
                        }}
                        onToggleMapPanLock={toggleMapPanLock}
                        onMeasureTool={() => applyMapDrawTool('polyline')}
                        hasClearableDrawing={satelliteHasClearableDrawing}
                        onClearDrawing={clearSatelliteDrawingImmediate}
                        onOpenLayerLegend={() => setLayerLiveLegendOpen(o => !o)}
                        layerLegendOpen={layerLiveLegendOpen}
                        fieldTimelineActive={fieldTimelineSessionActive}
                        onTimelinePrimaryClick={onFieldAnalysisTimelinePrimaryClick}
                        fieldAnalysisStatus={fieldAnalysisStatus}
                        onClose={() => setIsLayerDropdownOpen(false)}
                      />
                    )}
                    {expandedEnvSection === 'ai-detection-gis' && (
                      <div className="si-env-section-card si-field-analysis">
                        <div className="si-field-analysis-header">
                          <h2 className="si-field-analysis-title">AI Detection in GIS</h2>
                          <button
                            type="button"
                            className="si-field-analysis-close"
                            onClick={() => setIsLayerDropdownOpen(false)}
                            aria-label="Close panel"
                          >
                            <i className="fa-solid fa-xmark" aria-hidden />
                          </button>
                        </div>
                        <input
                          ref={netfloraUploadInputRef}
                          type="file"
                          accept=".geojson,.json"
                          className="add-layer-input"
                          onChange={onNetfloraUploadChange}
                        />
                        {netfloraStats ? (
                          <div className="si-field-analysis-section">
                            <div className="si-field-analysis-kicker">Detection analytics (inside AOI)</div>
                            <div className="si-netflora-stats-grid">
                              <div className="si-netflora-stat-card">
                                <span>Total detections</span>
                                <strong>{netfloraStats.total}</strong>
                              </div>
                              <div className="si-netflora-stat-card">
                                <span>Average confidence</span>
                                <strong>{(netfloraStats.avgConfidence * 100).toFixed(1)}%</strong>
                              </div>
                            </div>
                            <div className="si-netflora-class-list">
                              {netfloraStats.byClass.map(row => (
                                <div key={row.label} className="si-netflora-class-row">
                                  <div className="si-netflora-class-meta">
                                    <strong>{row.label}</strong>
                                    <span>{row.count} detections</span>
                                  </div>
                                  <div className="si-netflora-class-bar">
                                    <span style={{ width: `${Math.max(8, (row.count / Math.max(1, netfloraStats.total)) * 100)}%` }} />
                                  </div>
                                  <em>{(row.avgConfidence * 100).toFixed(1)}%</em>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {expandedEnvSection === 'tree-detections' && (
                      <div className="si-env-section-card si-rs-panel--glass">
                        <TreeDetectionsPanel
                          provider={treeProvider}
                          onProviderChange={setTreeProvider}
                          analysisMode={treeAnalysisMode}
                          onAnalysisModeChange={setTreeAnalysisMode}
                          hasAoi={!!drawnGeometry}
                          phase={treeDetection.phase}
                          busy={treeDetection.busy}
                          error={treeDetection.error}
                          notice={
                            treeDetection.usedLocalFallback
                              ? 'Model service offline ΓÇö used the on-device detector. Start backend/services/tree-detection for higher accuracy.'
                              : null
                          }
                          result={treeDetection.result}
                          overlayVisible={treeOverlayVisible}
                          onToggleOverlay={setTreeOverlayVisible}
                          confidenceMin={treeConfidenceMin}
                          onConfidenceChange={setTreeConfidenceMin}
                          visibleCount={treeVisibleCount}
                          onRunDetection={treeDetection.rerun}
                          onExport={handleTreeDetectExport}
                          onExportShapefile={handleTreeDetectExportShapefile}
                          onZoomToLayer={handleTreeZoomToLayer}
                        />
                      </div>
                    )}
                    {expandedEnvSection === 'hydro-watershed' && (
                      <div className="si-env-section-card si-rs-panel--glass">
                        <HydroWatershedPanel
                          steps={hydro.steps}
                          demLoading={hydro.demLoading}
                          demError={hydro.demError}
                          hasAoi={hydro.hasAoi}
                          streamModel={hydroStreamModel}
                          onStreamModelChange={setHydroStreamModel}
                          contourInterval={hydroContourInterval}
                          onContourIntervalChange={setHydroContourInterval}
                          basinCount={hydroBasinCount}
                          onBasinCountChange={setHydroBasinCount}
                          onRunStep={hydro.runStep}
                          onToggleVisible={hydro.toggleVisible}
                          onRemoveStep={hydro.removeStep}
                          onExportRaster={hydro.exportRaster}
                          onRunAll={handleHydroRunAll}
                        />
                      </div>
                    )}
                    {expandedEnvSection === 'well-site' && (
                      <div className="si-env-section-card si-rs-panel--glass">
                        <WellSiteRecommendationPanel
                          status={wellSite.status}
                          hasAoi={wellSite.hasAoi}
                          demLoading={wellSite.demLoading}
                          demError={wellSite.demError}
                          error={wellSite.error}
                          points={wellSite.result?.points ?? []}
                          stats={wellSite.result?.stats ?? []}
                          legendSwatches={wellSite.result?.raster.legend?.swatches ?? []}
                          heatVisible={wellSite.heatVisible}
                          opacity={wellSite.opacity}
                          hasResult={!!wellSite.result}
                          onRun={wellSite.run}
                          onToggleHeat={wellSite.toggleHeat}
                          onOpacityChange={wellSite.setOpacity}
                          onExportGeoTiff={wellSite.exportHeatGeoTiff}
                          onExportGeoJson={wellSite.exportPointsGeoJson}
                          onExportCsv={wellSite.exportPointsCsv}
                          onExportXlsx={wellSite.exportXlsx}
                          onZoomToPoint={handleWellSiteZoomToPoint}
                        />
                      </div>
                    )}
                    {expandedEnvSection === 'well-suitability' && (
                      <div className="si-env-section-card si-rs-panel--glass">
                        <WellSuitabilityPanel
                          status={wellSuitability.status}
                          hasAoi={wellSuitability.hasAoi}
                          demLoading={wellSuitability.demLoading}
                          demError={wellSuitability.demError}
                          error={wellSuitability.error}
                          progressLabel={wellSuitability.progress?.label ?? null}
                          progressPct={wellSuitability.progress?.pct ?? 0}
                          weights={wellSuitability.weights}
                          topN={wellSuitability.topN}
                          points={wellSuitability.result?.points ?? []}
                          stats={wellSuitability.result?.stats ?? []}
                          legendSwatches={wellSuitability.result?.raster.legend?.swatches ?? []}
                          heatVisible={wellSuitability.heatVisible}
                          streamsVisible={wellSuitability.streamsVisible}
                          opacity={wellSuitability.opacity}
                          hasResult={!!wellSuitability.result}
                          onRun={wellSuitability.run}
                          onWeightChange={wellSuitability.setCriterionWeight}
                          onTopNChange={wellSuitability.setTopN}
                          onToggleHeat={wellSuitability.toggleHeat}
                          onToggleStreams={wellSuitability.toggleStreams}
                          onOpacityChange={wellSuitability.setOpacity}
                          onExportGeoTiff={wellSuitability.exportHeatGeoTiff}
                          onExportGeoJson={wellSuitability.exportPointsGeoJson}
                          onExportCsv={wellSuitability.exportPointsCsv}
                          onExportXlsx={wellSuitability.exportXlsx}
                          onExportPdf={wellSuitability.exportPdf}
                          onExportShapefile={() => void wellSuitability.exportShapefile()}
                          onExportKmz={() => void wellSuitability.exportKmz()}
                          onZoomToPoint={handleWellSuitabilityZoomToPoint}
                        />
                      </div>
                    )}
                    {expandedEnvSection === 'flood-monitoring' && (
                      <div className="si-env-section-card si-rs-panel--glass">
                        <FloodMonitoringPanel
                          hasAoi={!!drawnGeometry}
                          configured={flood.config?.configured ?? false}
                          configHint={flood.config?.hint ?? null}
                          phase={flood.phase}
                          busy={flood.busy}
                          progress={flood.progress}
                          message={flood.message}
                          error={flood.error}
                          result={flood.result}
                          preDate={floodPreDate}
                          postDate={floodPostDate}
                          thresholdDb={floodThresholdDb}
                          onPreDateChange={setFloodPreDate}
                          onPostDateChange={setFloodPostDate}
                          onThresholdChange={setFloodThresholdDb}
                          layerVisible={floodLayerVisible}
                          onToggleLayer={handleFloodToggleLayer}
                          onRun={handleFloodRun}
                          onZoomToLayer={handleFloodZoomToLayer}
                          onExportGeoJson={handleFloodExportGeoJson}
                          onClose={() => setIsLayerDropdownOpen(false)}
                        />
                      </div>
                    )}
                    {expandedEnvSection === 'source' && (
                      <div className="si-env-section-card">{exploreStacSourcePanelContent}</div>
                    )}
                    {expandedEnvSection === 'layers' && (
                      <>
                        {/* Embedded panel has no Main/Options tabs. Main content already
                            renders analysis + user layers; add base overlays once here. */}
                        <div className="si-env-section-card si-map-toolbox-layers-compact">
                          <MapToolboxLayerList layers={baseOverlayEntries} emptyMessage="No map overlays active." />
                        </div>
                        {layersEnvMainTools}
                      </>
                    )}
                </div>
                ) : null}
              </SatelliteMapProcessingOptionsPortal>
            </div>
          </div>
            </div>
          </div>
        </div>
      </div>
      {layerPopupCfgOpen
        ? (() => {
            const cfgLayer = layerPopupCfgPickId ? customLayers.find(l => l.id === layerPopupCfgPickId) : null;
            const canConfigure = cfgLayer && cfgLayer.renderMode !== 'raster';
            return canConfigure && cfgLayer ? (
              <SiLayerPopupConfigurator
                key={cfgLayer.id}
                layer={{
                  id: cfgLayer.id,
                  name: cfgLayer.name,
                  geojson: cfgLayer.geojson,
                  popupConfig: cfgLayer.popupConfig,
                  arcgisLayerDefinition: cfgLayer.arcgisLayerDefinition,
                }}
                onSave={next =>
                  setCustomLayers(prev =>
                    prev.map(l => (l.id === cfgLayer.id ? { ...l, popupConfig: normalizeSiLayerPopupConfig(next) } : l)),
                  )
                }
                onClose={() => setLayerPopupCfgOpen(false)}
              />
            ) : null;
          })()
        : null}
      {isAddLayerModalOpen ? (
        <div
          className={`gis-modal-overlay si-add-layer-gis-overlay${siAddLayerWizard === 'tabs' ? ' gis-map-add-layer-overlay' : ''}`}
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) closeAddLayerModal();
          }}
        >
          <div
            className={`si-add-source-modal gis-modal gis-modal-compact ddb-add-source-modal si-add-source-modal--lux${siAddLayerWizard === 'home' ? ' ddb-add-source-modal--home' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="si-layer-modal-title"
            onMouseDown={e => e.stopPropagation()}
          >
            {siAddLayerWizard === 'home' ? (
              <>
                <div className="gis-modal-compact-hero">
                  <h2 className="gis-modal-compact-hero-title" id="si-layer-modal-title">
                    Add Source Data
                  </h2>
                  <p className="gis-modal-compact-hero-lead">Choose a source to add layers to this map.</p>
                </div>
                <div className="si-add-source-options" role="radiogroup" aria-label="Layer source type">
                  {[
                    {
                      id: 'giscontent',
                      tab: 'giscontent' as AddLayerTab,
                      title: 'Select from GIS Content',
                      sub: 'Layers saved in GIS Content (this browser).',
                      icon: 'fa-solid fa-layer-group',
                      iconStyle: { background: '#ede9fe', color: '#7c3aed' },
                    },
                    {
                      id: 'arcgis',
                      tab: 'arcgis' as AddLayerTab,
                      title: 'ArcGIS Server layer URL',
                      sub: 'Connect to a feature service and pick a layer.',
                      icon: 'fa-solid fa-link',
                      iconStyle: { background: '#e0e7ff', color: '#4f46e5' },
                    },
                    {
                      id: 'upload',
                      tab: 'upload' as AddLayerTab,
                      title: 'Upload a file',
                      sub: 'GeoJSON, KML, KMZ, Shapefile, CSV, GeoTIFF, PNG / JPG, IFC (.ifc), and more.',
                      icon: 'fa-solid fa-file-arrow-up',
                      iconStyle: { background: '#d1fae5', color: '#059669' },
                    },
                    {
                      id: 'ifc',
                      tab: 'upload' as AddLayerTab,
                      title: 'IFC / BIM model',
                      sub: 'Import IFC 2├ù3 or IFC4 as discipline BIM layers on the map.',
                      icon: 'fa-solid fa-building',
                      iconStyle: { background: '#ffedd5', color: '#ea580c' },
                    },
                    {
                      id: 'url',
                      tab: 'url' as AddLayerTab,
                      title: 'From URL',
                      sub: 'Remote GeoJSON, ZIP, or KML.',
                      icon: 'fa-solid fa-globe',
                      iconStyle: { background: '#e0f2fe', color: '#0284c7' },
                    },
                    {
                      id: 'raster',
                      tab: 'raster' as AddLayerTab,
                      title: 'Raster path / URL',
                      sub: 'GeoTIFF, image service, or tile endpoint.',
                      icon: 'fa-regular fa-image',
                      iconStyle: { background: '#fce7f3', color: '#db2777' },
                    },
                    {
                      id: 'database',
                      tab: 'database' as AddLayerTab,
                      title: 'Get Data',
                      sub: 'Excel, CSV, SQL, Web, OData sources.',
                      icon: 'fa-solid fa-database',
                      iconStyle: { background: '#ede9fe', color: '#7c3aed' },
                    },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      className="si-add-source-option"
                      onClick={() => {
                        setAddLayerTab(opt.tab);
                        if (opt.tab === 'giscontent') setSiAddLayerWizard('gis-list');
                        else setSiAddLayerWizard('source-forms');
                      }}
                    >
                      <span
                        className="si-add-source-option-icon"
                        aria-hidden
                        style={{ background: '#dcfce7', color: '#16a34a' }}
                      >
                        <i className={opt.icon} />
                      </span>
                      <span className="si-add-source-option-main">
                        <strong>{opt.title}</strong>
                        <small>{opt.sub}</small>
                      </span>
                      <i className="fa-solid fa-chevron-right si-add-source-option-chevron" aria-hidden />
                    </button>
                  ))}
                </div>
                <div className="gis-modal-footer si-add-source-footer">
                  <button type="button" className="gis-link-btn" onClick={closeAddLayerModal}>
                    Cancel
                  </button>
                </div>
              </>
            ) : siAddLayerWizard === 'gis-list' ? (
              <>
                <div className="ddb-add-source-modal__head">
                  <div className="gis-modal-compact-title" id="si-layer-modal-title">
                    Add Source Data
                  </div>
                  <button type="button" className="ddb-add-source-back" onClick={goSiAddLayerWizardHome}>
                    <i className="fa-solid fa-arrow-left" aria-hidden /> All options
                  </button>
                </div>
                <div className="ddb-add-source-gis-list gis-modal-body">
                  <p className="gis-modal-gis-content-hint">
                    Hosted feature layers from <strong>GIS Content</strong> are published as Feature Layer services and can be
                    added to this map.
                  </p>
                  {gisContentPortalPickRows.length === 0 ? (
                    <div className="gis-modal-gis-content-empty" role="status">
                      <i className="fa-regular fa-folder-open" aria-hidden />
                      <p>No hosted feature layers in GIS Content yet. Publish a layer from GIS Content or GIS Map.</p>
                    </div>
                  ) : (
                    <ul className="gis-modal-gis-content-list" aria-label="GIS Content layers">
                      {gisContentPortalPickRows.map(row => {
                        const busy = addingPortalRowId === row.id;
                        const typeLabel = gisContentPortalDisplayTypeLabel(row, getGisContentItemDetails(row.id));
                        return (
                          <li key={row.id} className="gis-modal-gis-content-row">
                            <div className="gis-modal-gis-content-meta">
                              <span className="gis-modal-gis-content-name">{row.title}</span>
                              <span className="gis-modal-gis-content-badges">
                                <span className="gis-modal-gis-content-badge">{typeLabel}</span>
                                <span className="gis-modal-gis-content-badge gis-modal-gis-content-badge--muted">Hosted</span>
                              </span>
                            </div>
                            <button
                              type="button"
                              className="gis-modal-gis-content-add-btn"
                              disabled={busy}
                              onClick={() => addGisPortalRowFromAddLayerModal(row)}
                            >
                              <i
                                className={`gis-modal-gis-content-add-btn__icon fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-plus'}`}
                                aria-hidden
                              />
                              <span className="gis-modal-gis-content-add-btn__label">{busy ? 'AddingΓÇª' : 'Add'}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : siAddLayerWizard === 'tabs' || siAddLayerWizard === 'source-forms' ? (
              <>
                {siAddLayerWizard === 'tabs' ? (
                  <div className="gis-modal-compact-title" id="si-layer-modal-title">
                    Add GIS Layer
                  </div>
                ) : (
                  <div className="ddb-add-source-modal__head">
                    <div className="gis-modal-compact-title" id="si-layer-modal-title">
                      Add Source Data
                    </div>
                    <button type="button" className="ddb-add-source-back" onClick={goSiAddLayerWizardHome}>
                      <i className="fa-solid fa-arrow-left" aria-hidden /> All options
                    </button>
                  </div>
                )}
                <div className="gis-modal-compact-tabs" role="tablist" aria-label="Add GIS layer source">
                  {siAddLayerWizard === 'tabs' ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={addLayerTab === 'giscontent'}
                      aria-label="GIS Content ΓÇö hosted feature layers"
                      title="GIS Content ΓÇö saved hosted layers"
                      className={(addLayerTab === 'giscontent' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                      onClick={() => setAddLayerTab('giscontent')}
                    >
                      <i className="fa-solid fa-layer-group" aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addLayerTab === 'arcgis'}
                    className={(addLayerTab === 'arcgis' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="ArcGIS Feature Service"
                    aria-label="ArcGIS Feature Service"
                    onClick={() => setAddLayerTab('arcgis')}
                  >
                    <i className={siAddLayerWizard === 'tabs' ? 'fa-solid fa-cloud' : 'fa-solid fa-link'} aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addLayerTab === 'database'}
                    className={(addLayerTab === 'database' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="Database connection"
                    aria-label="Database connection"
                    onClick={() => setAddLayerTab('database')}
                  >
                    <i className="fa-solid fa-database" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addLayerTab === 'upload'}
                    className={(addLayerTab === 'upload' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="Upload file"
                    aria-label="Upload file"
                    onClick={() => setAddLayerTab('upload')}
                  >
                    <i className="fa-solid fa-file-arrow-up" aria-hidden />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addLayerTab === 'url'}
                    className={(addLayerTab === 'url' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                    title="From URL"
                    aria-label="URL or web data"
                    onClick={() => setAddLayerTab('url')}
                  >
                    <i className="fa-solid fa-globe" aria-hidden />
                  </button>
                  {siAddLayerWizard === 'source-forms' ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={addLayerTab === 'raster'}
                      className={(addLayerTab === 'raster' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                      title="Raster path / URL"
                      onClick={() => setAddLayerTab('raster')}
                    >
                      <i className="fa-regular fa-image" aria-hidden />
                    </button>
                  ) : null}
                </div>
                <div className="gis-modal-body">
              {addLayerTab === 'giscontent' && siAddLayerWizard === 'tabs' ? (
                <div role="tabpanel" aria-label="GIS Content">
                  <p className="gis-modal-gis-content-hint">
                    Hosted feature layers from <strong>GIS Content</strong> are published as Feature Layer services (REST) and
                    can be reused on this map, dashboards, and apps.
                  </p>
                  {gisContentPortalPickRows.length === 0 ? (
                    <div className="gis-modal-gis-content-empty" role="status">
                      <i className="fa-regular fa-folder-open" aria-hidden />
                      <p>No hosted feature layers in GIS Content yet. Upload data or publish a feature layer in GIS Content.</p>
                    </div>
                  ) : (
                    <ul className="gis-modal-gis-content-list" aria-label="GIS Content layers">
                      {gisContentPortalPickRows.map(row => {
                        const busy = addingPortalRowId === row.id;
                        const typeLabel = gisContentPortalDisplayTypeLabel(row, getGisContentItemDetails(row.id));
                        return (
                          <li key={row.id} className="gis-modal-gis-content-row">
                            <div className="gis-modal-gis-content-meta">
                              <span className="gis-modal-gis-content-name">{row.title}</span>
                              <span className="gis-modal-gis-content-badges">
                                <span className="gis-modal-gis-content-badge">{typeLabel}</span>
                                <span className="gis-modal-gis-content-badge gis-modal-gis-content-badge--muted">Hosted</span>
                              </span>
                            </div>
                            <button
                              type="button"
                              className="gis-modal-gis-content-add-btn"
                              disabled={busy}
                              onClick={() => addGisPortalRowFromAddLayerModal(row)}
                            >
                              <i
                                className={`gis-modal-gis-content-add-btn__icon fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-plus'}`}
                                aria-hidden
                              />
                              <span className="gis-modal-gis-content-add-btn__label">{busy ? 'AddingΓÇª' : 'Add'}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : addLayerTab === 'arcgis' ? (
                <div key="arcgis" role="tabpanel" aria-label="ArcGIS Feature Service">
                  <input
                    type="url"
                    className="gis-input"
                    placeholder="Feature Service URL"
                    value={addLayerUrl}
                    onChange={e => setAddLayerUrl(e.target.value)}
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    className="gis-input"
                    placeholder="Token / API Key (optional)"
                    value={addLayerToken}
                    onChange={e => setAddLayerToken(e.target.value)}
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    className="gis-input"
                    placeholder="Layer Name (optional)"
                    value={addLayerName}
                    onChange={e => setAddLayerName(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="button" className="gis-btn-outline" onClick={importArcgisFeatureLayer} disabled={isConnectingLayer}>
                    <i className="fa-solid fa-link" aria-hidden /> {isConnectingLayer ? 'Connecting...' : 'Connect & Discover Layers'}
                  </button>
                  {discoveredArcgisLayers.length > 0 ? (
                    <div className="gis-discover-panel" aria-label="Discovered layers">
                      <div className="gis-discover-meta">FOUND {discoveredArcgisLayers.length} LAYER/TABLE(S):</div>
                      <div className="gis-form-field">
                        <div className="gis-form-label">Select Layer</div>
                        <div className="gis-select-wrap">
                        <select
                            className="gis-input gis-select"
                          value={selectedDiscoveredArcgisUrl}
                          onChange={e => {
                            const next = e.target.value;
                            setSelectedDiscoveredArcgisUrl(next);
                            const found = discoveredArcgisLayers.find(l => l.url === next);
                            if (found && !addLayerName.trim()) setAddLayerName(found.name);
                          }}
                            aria-label="Select discovered layer"
                        >
                          {discoveredArcgisLayers.map(l => (
                            <option key={l.url} value={l.url}>
                              {l.kind === 'table' ? `${l.name} (Table)` : l.geometryType ? `${l.name} (${l.geometryType})` : l.name}
                            </option>
                          ))}
                        </select>
                          <i className="fa-solid fa-chevron-down" aria-hidden />
                      </div>
                      </div>
                      <div className="gis-discovered-row">
                        <span className="gis-discovered-name">
                          {discoveredArcgisLayers.find(l => l.url === selectedDiscoveredArcgisUrl)?.name || 'Selected layer'}
                        </span>
                        <button
                          type="button"
                          className="gis-discovered-add"
                          onClick={addSelectedDiscoveredArcgisLayer}
                          disabled={!selectedDiscoveredArcgisUrl || isAddingDiscoveredArcgisLayer}
                        >
                          {isAddingDiscoveredArcgisLayer ? 'AddingΓÇª' : 'Add'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : addLayerTab === 'database' ? (
                <div key="database" role="tabpanel" aria-label="Get data">
                  {siGetDataStep === 'menu' ? (
                    <div className="si-get-data-panel">
                      <div className="si-get-data-hero">
                        <div className="si-get-data-hero-icon" aria-hidden>
                          <i className="fa-solid fa-database" />
                        </div>
                        <div className="si-get-data-hero-copy">
                          <h3 className="si-get-data-hero-title">Get data</h3>
                          <p className="si-get-data-hero-sub">Choose a common source to connect files, web services, or databases.</p>
                        </div>
                      </div>
                      <div className="si-get-data-scroll">
                        {siGetDataMenuSections().map(section => (
                          <section key={section.id} className="si-get-data-section" aria-label={section.title}>
                            <h4 className="si-get-data-section-label">{section.title}</h4>
                            <div className="si-get-data-list" role="list">
                              {section.sources.map(row => (
                                <button
                                  key={row.id}
                                  type="button"
                                  role="listitem"
                                  className="si-get-data-row"
                                  onClick={() => applySiGetDataPick(row)}
                                >
                                  <span
                                    className={`si-get-data-row-icon${row.id === 'excel' ? ' si-get-data-row-icon--excel' : ''}${
                                      row.id === 'csv' ? ' si-get-data-row-icon--csv' : ''
                                    }`}
                                    aria-hidden
                                  >
                                    <i className={row.iconClass} />
                                  </span>
                                  <span className="si-get-data-row-text">
                                    <span className="si-get-data-row-title">{row.title}</span>
                                    <span className="si-get-data-row-desc">{row.description}</span>
                                  </span>
                                  <i className="fa-solid fa-chevron-right si-get-data-row-chevron" aria-hidden />
                                </button>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                      <div className="si-get-data-footer">
                        <button
                          type="button"
                          className="si-get-data-more-btn"
                          onClick={() => {
                            setAddLayerTab('upload');
                            setAddLayerStatus('More spatial formats: use Upload, From URL, Raster, or ArcGIS tabs in the bar above.');
                          }}
                        >
                          MoreΓÇª <span className="si-get-data-more-hint">(all GIS / BIM upload formats)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="si-get-data-back" onClick={() => setSiGetDataStep('menu')}>
                        <i className="fa-solid fa-arrow-left" aria-hidden /> Common data sources
                      </button>
                      <p className="si-get-data-sql-lead">Database connection ΓÇö profile is stored in-app for future gateway support.</p>
                      <div className="si-layer-form-grid-2">
                        <label className="si-layer-field">
                          <span>Database Platform</span>
                          <select
                            className="gis-input"
                            value={dbPlatform}
                            onChange={e => setDbPlatform(e.target.value as (typeof DATABASE_PLATFORM_OPTIONS)[number])}
                          >
                            {DATABASE_PLATFORM_OPTIONS.map(platform => (
                              <option key={platform} value={platform}>
                                {platform}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="si-layer-field">
                          <span>Instance / Host</span>
                          <input
                            type="text"
                            className="gis-input"
                            placeholder="server\\instance or host:port"
                            value={dbInstance}
                            onChange={e => setDbInstance(e.target.value)}
                          />
                        </label>
                      </div>
                      <label className="si-layer-field">
                        <span>Authentication Type</span>
                        <select className="gis-input" value={dbAuthType} onChange={e => setDbAuthType(e.target.value as 'database' | 'operating-system')}>
                          <option value="database">Database authentication</option>
                          <option value="operating-system">Operating system authentication</option>
                        </select>
                      </label>
                      {dbAuthType === 'database' ? (
                        <div className="si-layer-form-grid-2">
                          <label className="si-layer-field">
                            <span>User Name</span>
                            <input type="text" className="gis-input" placeholder="db_user" value={dbUsername} onChange={e => setDbUsername(e.target.value)} />
                          </label>
                          <label className="si-layer-field">
                            <span>Password</span>
                            <input type="password" className="gis-input" placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó" value={dbPassword} onChange={e => setDbPassword(e.target.value)} />
                          </label>
                        </div>
                      ) : null}
                      <label className="si-layer-inline-check">
                        <input type="checkbox" checked={dbSaveCredentials} onChange={e => setDbSaveCredentials(e.target.checked)} />
                        <span>Save User/Password</span>
                      </label>
                      <div className="si-layer-form-grid-2">
                        <label className="si-layer-field">
                          <span>Database</span>
                          <input type="text" className="gis-input" placeholder="optional" value={dbName} onChange={e => setDbName(e.target.value)} />
                        </label>
                        <label className="si-layer-field">
                          <span>Connection File Name</span>
                          <input
                            type="text"
                            className="gis-input"
                            placeholder="optional"
                            value={dbConnectionFileName}
                            onChange={e => setDbConnectionFileName(e.target.value)}
                          />
                        </label>
                      </div>
                      <details className="si-layer-advanced">
                        <summary>Additional Properties</summary>
                        <small>
                          This profile is prepared in-app for future backend connector support. Validate required fields and save.
                        </small>
                      </details>
                      <button type="button" className="gis-btn-primary-full" onClick={handleDatabaseConnection}>
                        <i className="fa-solid fa-plug" aria-hidden /> Validate & Save Connection
                      </button>
                    </>
                  )}
                </div>
              ) : addLayerTab === 'url' || addLayerTab === 'raster' ? (
                <div key="url" role="tabpanel" aria-label="Remote URL">
                  <input
                    type="url"
                    className="gis-input"
                    placeholder={
                      addLayerTab === 'raster'
                        ? 'Raster path / URL (GeoTIFF, Image Service, tile endpoint)'
                        : 'https://.../layer.geojson or .zip'
                    }
                    value={addLayerRemoteUrl}
                    onChange={e => setAddLayerRemoteUrl(e.target.value)}
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    className="gis-input"
                    placeholder="Layer Name (optional)"
                    value={addLayerName}
                    onChange={e => setAddLayerName(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="button" className="gis-btn-primary-full" onClick={() => void importRemoteUrlLayer()} disabled={isImportingRemoteLayer}>
                    <i className="fa-solid fa-cloud-arrow-down" aria-hidden />{' '}
                    {isImportingRemoteLayer ? 'ImportingΓÇª' : addLayerTab === 'raster' ? 'Import Raster path / URL' : 'Import from URL'}
                  </button>
                </div>
              ) : (
                <div key="upload" role="tabpanel" aria-label="Upload file">
                  {(() => {
                    const siUploadBusy = siUploadPhase === 'reading' || siUploadPhase === 'processing';
                    return (
                      <>
                        <div
                          className={`gis-dropzone${siUploadDropActive ? ' drag-over' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-label="Drop a file here or click to browse"
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openSiUploadFilePicker();
                            }
                          }}
                          onClick={() => openSiUploadFilePicker()}
                          onDragEnter={e => {
                            e.preventDefault();
                            setSiUploadDropActive(true);
                          }}
                          onDragLeave={e => {
                            e.preventDefault();
                            if (e.currentTarget === e.target) setSiUploadDropActive(false);
                          }}
                          onDragOver={e => {
                            e.preventDefault();
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            setSiUploadDropActive(false);
                            const file = e.dataTransfer?.files?.[0];
                            if (!file) return;
                            setSiUploadStagedFile(file);
                            setSiUploadPhase('idle');
                            setSiUploadProgressPct(0);
                            const mb = file.size / (1024 * 1024);
                            setAddLayerStatus(
                              `Ready: ${file.name} (${mb >= 0.01 ? mb.toFixed(2) : '<0.01'} MB). Click ΓÇ£Import to mapΓÇ¥.`,
                            );
                          }}
                        >
                          <div className="gis-dropzone-icon" aria-hidden>
                            <i className="fa-solid fa-cloud-arrow-up" />
                          </div>
                          <div className="gis-dropzone-text">Drop a file here or click to browse</div>
                          <div className="gis-dropzone-subtext">
                            SHP (.zip) ┬╖ GeoJSON ┬╖ KML / KMZ ┬╖ CSV (lat/lon) ┬╖ GeoTIFF (.tif / .tiff) ┬╖ Image (PNG / JPG) ┬╖ IFC (.ifc)
                          </div>
                        </div>
                        <GisUploadCloudSources
                          cloudOnly
                          onFile={file => {
                            setSiUploadStagedFile(file);
                            setSiUploadPhase('idle');
                            setSiUploadProgressPct(0);
                            const mb = file.size / (1024 * 1024);
                            setAddLayerStatus(
                              `Ready: ${file.name} (${mb >= 0.01 ? mb.toFixed(2) : '<0.01'} MB). Click ΓÇ£Import to mapΓÇ¥.`,
                            );
                          }}
                          onStatus={setAddLayerStatus}
                        />
                        {siUploadStagedFile && !siUploadBusy ? (
                          <div className="si-upload-staged-card">
                            <div className="si-upload-staged-main">
                              <span className="si-upload-staged-name">{siUploadStagedFile.name}</span>
                              <span className="si-upload-staged-meta">
                                {(siUploadStagedFile.size / (1024 * 1024)).toFixed(2)} MB ┬╖{' '}
                                {String(siUploadStagedFile.name.split('.').pop() || '').toUpperCase()}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="si-upload-staged-clear"
                              onClick={() => {
                                setSiUploadStagedFile(null);
                                setAddLayerStatus('');
                                setSiUploadPhase('idle');
                              }}
                            >
                              Clear
                            </button>
                          </div>
                        ) : null}
                        {siUploadBusy ? (
                          <div
                            className="si-upload-progress"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={siUploadProgressPct}
                            aria-label="Import progress"
                          >
                            <div className="si-upload-progress__track">
                              <div className="si-upload-progress__fill" style={{ width: `${siUploadProgressPct}%` }} />
                            </div>
                            <div className="si-upload-progress__label">
                              {siUploadPhase === 'reading' ? 'Uploading / reading' : 'Processing'} ┬╖ {siUploadProgressPct}%
                            </div>
                          </div>
                        ) : null}
                        <input type="text" className="gis-input" placeholder="Layer Name (optional)" value={addLayerName} onChange={e => setAddLayerName(e.target.value)} />
                        <button
                          type="button"
                          className="gis-btn-primary-full"
                          onClick={() => commitSiLayerUpload()}
                          disabled={siUploadBusy}
                        >
                          <i className="fa-solid fa-circle-check" aria-hidden />{' '}
                          {siUploadBusy ? 'WorkingΓÇª' : siUploadStagedFile ? 'Import to map' : 'Import to map (choose file first)'}
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}
                </div>
              </>
            ) : null}
            {addLayerStatus ? <p className="gis-modal-compact-status">{addLayerStatus}</p> : null}
            {siAddLayerWizard !== 'home' ? (
              <div className="gis-modal-footer">
                <button type="button" className="gis-link-btn" onClick={closeAddLayerModal}>
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {activeLayerActionDialog && activeDialogLayer ? (
        <div
          className="si-layer-action-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="si-layer-action-title"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              if (activeLayerActionDialog.mode === 'symbology') cancelSiSymbologyDialog();
              else setActiveLayerActionDialog(null);
            }
          }}
        >
          <div
            className={
              activeLayerActionDialog.mode === 'symbology'
                ? 'si-layer-action-modal gis-modal gis-modal-styles'
                : `si-layer-action-modal${activeLayerActionDialog.mode === 'table' ? ' si-layer-action-modal--gis-table' : ''}`
            }
            onMouseDown={e => e.stopPropagation()}
          >
            {activeLayerActionDialog.mode === 'symbology' ? (
              <div className="gis-modal-header">
                <div className="gis-modal-header-left">
                  <div className="gis-modal-icon" aria-hidden="true">
                    <i className="fa-solid fa-palette" />
                  </div>
                  <div className="gis-modal-title" id="si-layer-action-title">
                    Styles - {activeDialogLayer.name}
                  </div>
                </div>
                <button
                  className="gis-sidebar-close"
                  type="button"
                  onClick={() => cancelSiSymbologyDialog()}
                  aria-label="Close dialog"
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="si-layer-action-modal-header">
                <h3 id="si-layer-action-title">
                  {activeLayerActionDialog.mode === 'table' ? (
                    <>
                      <span className="si-layer-action-modal-table-title" aria-hidden>
                        <AgroCloudMark size={28} className="gis-table-browser-mark" title="Table Browser" />
                      </span>
                      <span>Table Browser ΓÇö {activeDialogLayer.name}</span>
                    </>
                  ) : (
                    `Legend - ${activeDialogLayer.name}`
                  )}
                </h3>
                <button type="button" className="si-layer-action-close" onClick={() => setActiveLayerActionDialog(null)} aria-label="Close layer dialog">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            )}
            <div className={activeLayerActionDialog.mode === 'symbology' ? 'gis-modal-body' : 'si-layer-action-modal-body'}>
              {activeLayerActionDialog.mode === 'table' ? (
                activeLayerColumns.length ? (
                  <div
                    className={`si-layer-action-table-layout si-layer-action-table-layout--gis${tableToolsCollapsed ? ' si-layer-action-table-layout--tools-collapsed' : ''}`}
                  >
                    <aside
                      className={`gis-workspace-sidebar gis-table-dock-sidebar si-layer-action-table-tools${
                        tableToolsCollapsed ? ' collapsed' : ''
                      }`}
                      aria-label="GIS workspace ΓÇö table tools, search, and filters"
                    >
                      <div className="gis-workspace-sidebar__scope" aria-hidden={tableToolsCollapsed ? true : undefined}>
                        <AgroCloudMark size={22} className="gis-table-browser-mark" title="Table Browser" />
                        <div className="gis-workspace-sidebar__scope-text">
                          <span className="gis-workspace-sidebar__scope-label">Table Browser</span>
                          <span className="gis-workspace-sidebar__scope-hint">Attribute workspace</span>
                        </div>
                      </div>
                      <div className="gis-workspace-sidebar__tools" role="toolbar" aria-label="Table actions">
                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => void zoomSiTableToSelection()}
                          disabled={tableSelectedKeys.size === 0}
                          title="Zoom to selection"
                        >
                          <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
                          <span className="gis-table-tooltext">Zoom to selection</span>
                        </button>
                        <button className="gis-table-toolbtn" type="button" onClick={siTableGoHome} title="Home">
                          <i className="fa-solid fa-house" aria-hidden />
                          <span className="gis-table-tooltext">Home</span>
                        </button>
                        <div className="gis-table-toolsep" role="separator" />
                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => setTableSelectedKeys(new Set())}
                          disabled={tableSelectedKeys.size === 0}
                          title="Clear selection"
                        >
                          <i className="fa-solid fa-eraser" aria-hidden />
                          <span className="gis-table-tooltext">Clear selection</span>
                        </button>
                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => setTableShowSelectedOnly(true)}
                          disabled={tableSelectedKeys.size === 0}
                          title="Show selected"
                        >
                          <i className="fa-solid fa-filter" aria-hidden />
                          <span className="gis-table-tooltext">Show selected</span>
                        </button>
                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => setTableShowSelectedOnly(false)}
                          disabled={!tableShowSelectedOnly}
                          title="Show all"
                        >
                          <i className="fa-solid fa-list" aria-hidden />
                          <span className="gis-table-tooltext">Show all</span>
                        </button>
                        <div className="gis-table-toolsep" role="separator" />
                        <button
                          className="gis-table-toolbtn"
                          type="button"
                          onClick={() => void refreshArcgisLayer(activeDialogLayer)}
                          disabled={
                            activeDialogLayer.source !== 'arcgis' ||
                            !activeDialogLayer.sourceUrl?.trim() ||
                            syncingLayerId === activeDialogLayer.id
                          }
                          title="Refresh"
                        >
                          <i className="fa-solid fa-rotate-right" aria-hidden />
                          <span className="gis-table-tooltext">{syncingLayerId === activeDialogLayer.id ? 'RefreshingΓÇª' : 'Refresh'}</span>
                        </button>
                        <div className="gis-table-toolsep" role="separator" />
                        <button className="gis-table-toolbtn" type="button" onClick={exportTableAsCsv} title="Export CSV">
                          <i className="fa-solid fa-file-export" aria-hidden />
                          <span className="gis-table-tooltext">Export CSV</span>
                        </button>
                        <button className="gis-table-toolbtn" type="button" onClick={saveSiTableFormat} title="Save format">
                          <i className="fa-solid fa-floppy-disk" aria-hidden />
                          <span className="gis-table-tooltext">Save format</span>
                        </button>
                        <button className="gis-table-toolbtn" type="button" onClick={applySiTableFormat} title="Apply format">
                          <i className="fa-solid fa-layer-group" aria-hidden />
                          <span className="gis-table-tooltext">Apply format</span>
                        </button>
                      </div>
                      <div className="gis-workspace-sidebar__rich" role="region" aria-label="Table search and filters">
                        <details className="gis-workspace-acc">
                          <summary className="gis-workspace-acc__summary">Search &amp; browse</summary>
                          <div className="gis-workspace-acc__body gis-workspace-acc__body--stack">
                            <div className="gis-table-controls gis-table-controls--workspace">
                              <label className="gis-table-domain-toggle">
                                <span>Search mode</span>
                                <select
                                  value={tableSearchMode}
                                  onChange={e => setTableSearchMode(e.target.value as SiTableSearchMode)}
                                  aria-label="Table search mode"
                                >
                                  <option value="description">Description</option>
                                  <option value="code">Code</option>
                                  <option value="both">Both</option>
                                </select>
                              </label>
                              <label className="gis-table-search">
                                <i className="fa-solid fa-magnifying-glass" aria-hidden />
                                <input
                                  value={tableSearchText}
                                  onChange={e => setTableSearchText(e.target.value)}
                                  placeholder={
                                    tableSearchMode === 'code'
                                      ? 'Search codes...'
                                      : tableSearchMode === 'both'
                                        ? 'Search descriptions or codes...'
                                        : 'Search descriptions...'
                                  }
                                  aria-label="Search table"
                                />
                              </label>
                            </div>
                          </div>
                        </details>
                        <details className="gis-workspace-acc">
                          <summary className="gis-workspace-acc__summary">Field filter</summary>
                          <div className="gis-workspace-acc__body gis-workspace-acc__body--stack">
                            <div className="gis-table-advanced-controls gis-table-advanced-controls--workspace" aria-label="Advanced table filter">
                              <label>
                                <span>Filter field</span>
                                <select value={tableFilterField} onChange={e => setTableFilterField(e.target.value)}>
                                  <option value="">All records</option>
                                  {orderedSiTableFields.map(f => (
                                    <option key={f} value={f}>
                                      {f}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Rule</span>
                                <select
                                  value={tableFilterOperator}
                                  onChange={e => setTableFilterOperator(e.target.value as SiTableFilterOperator)}
                                >
                                  <option value="contains">Contains</option>
                                  <option value="equals">Equals</option>
                                  <option value="not_equals">Not equals</option>
                                  <option value="empty">Is empty</option>
                                  <option value="not_empty">Is not empty</option>
                                </select>
                              </label>
                              <label>
                                <span>Value</span>
                                <input
                                  value={tableFilterValue}
                                  onChange={e => setTableFilterValue(e.target.value)}
                                  disabled={tableFilterOperator === 'empty' || tableFilterOperator === 'not_empty'}
                                  placeholder="Filter value"
                                />
                              </label>
                              <button
                                className="gis-table-filter-clear"
                                type="button"
                                onClick={() => {
                                  setTableFilterField('');
                                  setTableFilterOperator('contains');
                                  setTableFilterValue('');
                                }}
                              >
                                Clear filter
                              </button>
                            </div>
                          </div>
                        </details>
                        <details className="gis-workspace-acc">
                          <summary className="gis-workspace-acc__summary">Map &amp; analysis hub</summary>
                          <div className="gis-workspace-acc__body gis-workspace-acc__body--prose">
                            <p>
                              Layer styling, pop-ups, GeoAI, and map tools use the main Satellite Intelligence panels so they are not
                              duplicated in this table workspace.
                            </p>
                          </div>
                        </details>
                      </div>
                      <button
                        className="gis-table-toolbtn gis-table-toolbtn--icon-only gis-workspace-sidebar__collapse"
                        type="button"
                        onClick={() => setTableToolsCollapsed(v => !v)}
                        aria-expanded={!tableToolsCollapsed}
                        aria-label={tableToolsCollapsed ? 'Expand workspace' : 'Collapse workspace'}
                        title={tableToolsCollapsed ? 'Expand workspace' : 'Collapse workspace'}
                      >
                        <i className={tableToolsCollapsed ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left'} aria-hidden />
                      </button>
                    </aside>
                    <div className="si-layer-action-table-main gis-layer-table-wrap gis-table-dock-table">
                      <div className="gis-table-dock-header si-table-modal-subheader">
                        <div className="gis-table-dock-meta si-table-modal-meta">
                          {activeTableFeatures.length} record{activeTableFeatures.length === 1 ? '' : 's'}, {tableSelectedKeys.size} selected
                        </div>
                      </div>
                      <div className="gis-layer-table-meta gis-layer-table-meta--table-only">
                        <div className="gis-layer-table-metatext">
                          {tableShowSelectedOnly ? `Showing selected: ${siFilteredTableFeatures.length}` : `Showing ${siFilteredTableFeatures.length}`}{' '}
                          of {activeTableFeatures.length} feature(s)
                          {activeTableFeatures.length >= SI_TABLE_MAX_FEATURES ? ` (first ${SI_TABLE_MAX_FEATURES} loaded)` : ''}
                        </div>
                      </div>
                      <div className="si-layer-action-table-wrap">
                        <table className="gis-layer-table si-layer-action-table">
                          <thead>
                            <tr>
                              <th className="gis-layer-table-select">
                                <input
                                  type="checkbox"
                                  aria-label="Select all rows"
                                  checked={
                                    siFilteredTableFeatures.length > 0 &&
                                    siFilteredTableFeatures.every(ft => {
                                      const idx = activeTableFeatures.indexOf(ft);
                                      if (idx < 0) return false;
                                      return tableSelectedKeys.has(
                                        siComputeFeatureRowKey(ft, idx, siTableFeatureKeyCacheRef.current),
                                      );
                                    })
                                  }
                                  onChange={() => {
                                    const cache = siTableFeatureKeyCacheRef.current;
                                    const keysOnScreen = siFilteredTableFeatures
                                      .map(ft => {
                                        const idx = activeTableFeatures.indexOf(ft);
                                        return idx >= 0 ? siComputeFeatureRowKey(ft, idx, cache) : '';
                                      })
                                      .filter(Boolean);
                                    const everySel =
                                      keysOnScreen.length > 0 && keysOnScreen.every(k => tableSelectedKeys.has(k));
                                    setTableSelectedKeys(prev => {
                                      const next = new Set(prev);
                                      if (everySel) keysOnScreen.forEach(k => next.delete(k));
                                      else keysOnScreen.forEach(k => next.add(k));
                                      return next;
                                    });
                                  }}
                                />
                              </th>
                              {visibleSiTableFields.map(f => (
                                <th
                                  key={f}
                                  draggable
                                  className={draggingSiTableField === f ? 'gis-table-column-dragging' : undefined}
                                  title="Drag to reorder column"
                                  onDragStart={e => {
                                    setDraggingSiTableField(f);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', f);
                                  }}
                                  onDragOver={e => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                  }}
                                  onDrop={e => {
                                    e.preventDefault();
                                    moveSiTableColumn(e.dataTransfer.getData('text/plain') || draggingSiTableField || '', f);
                                    setDraggingSiTableField(null);
                                  }}
                                  onDragEnd={() => setDraggingSiTableField(null)}
                                >
                                  <span className="gis-table-column-label">
                                    <i className="fa-solid fa-grip-vertical" aria-hidden />
                                    {f}
                                    <span className="gis-table-column-actions">
                                      <button
                                        type="button"
                                        onClick={() => moveSiTableColumnByOffset(f, -1)}
                                        disabled={orderedSiTableFields.indexOf(f) <= 0}
                                        aria-label={`Move ${f} column left`}
                                        title="Move left"
                                      >
                                        <i className="fa-solid fa-chevron-left" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => moveSiTableColumnByOffset(f, 1)}
                                        disabled={orderedSiTableFields.indexOf(f) >= orderedSiTableFields.length - 1}
                                        aria-label={`Move ${f} column right`}
                                        title="Move right"
                                      >
                                        <i className="fa-solid fa-chevron-right" aria-hidden />
                                      </button>
                                    </span>
                                  </span>
                                </th>
                              ))}
                              <th className="gis-layer-table-actions" aria-label="Actions" />
                              <th className="gis-layer-table-fieldvis" aria-label="Field visibility">
                                <FieldVisibilityControl
                                  layerId={activeDialogLayer.id}
                                  fields={orderedSiTableFields}
                                  hiddenFields={hiddenSiTableFieldsByLayerId[activeDialogLayer.id] ?? new Set()}
                                  onChangeHiddenFields={next =>
                                    setHiddenSiTableFieldsByLayerId(prev => ({ ...prev, [activeDialogLayer.id]: next }))
                                  }
                                />
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {siFilteredTableFeatures.map(ft => {
                              const idx = activeTableFeatures.indexOf(ft);
                              const rowKey =
                                idx >= 0 ? siComputeFeatureRowKey(ft, idx, siTableFeatureKeyCacheRef.current) : '';
                              const isSel = rowKey ? tableSelectedKeys.has(rowKey) : false;
                              return (
                                <tr
                                  key={rowKey || JSON.stringify(ft?.properties ?? {})}
                                  className={isSel ? 'gis-row-selected' : undefined}
                                  data-row-key={rowKey || undefined}
                                  onClick={e => {
                                    const t = e.target;
                                    if (t instanceof Element && t.closest('input,button,a,select,textarea,label')) return;
                                    if (!rowKey || !activeDialogLayer) return;
                                    setTableSelectedKeys(new Set([rowKey]));
                                  }}
                                >
                                  <td className="gis-layer-table-select">
                                    <input
                                      type="checkbox"
                                      aria-label="Select row"
                                      checked={isSel}
                                      disabled={!rowKey}
                                      onClick={e => e.stopPropagation()}
                                      onChange={() => {
                                        if (!rowKey) return;
                                        setTableSelectedKeys(prev => {
                                          const next = new Set(prev);
                                          if (next.has(rowKey)) next.delete(rowKey);
                                          else next.add(rowKey);
                                          return next;
                                        });
                                      }}
                                    />
                                  </td>
                                  {visibleSiTableFields.map(f => {
                                    const v = ft?.properties?.[f];
                                    const out = getArcDisplayValue(ft, f, v, arcDefSiTable, arcFieldsByLowerSi, 'description');
                                    return (
                                      <td key={f} title={out.title}>
                                        <span
                                          className={[
                                            'gis-domain-cell',
                                            out.missingDescription ? 'missing-description' : '',
                                          ]
                                            .filter(Boolean)
                                            .join(' ')}
                                        >
                                          {out.missingDescription ? (
                                            <i className="fa-solid fa-triangle-exclamation" aria-hidden title="No domain description" />
                                          ) : null}
                                          {renderSiTableHighlightedValue(out.display)}
                                        </span>
                                      </td>
                                    );
                                  })}
                                  <td className="gis-layer-table-actions">
                                    <button
                                      className="gis-table-rowbtn"
                                      type="button"
                                      aria-label="Zoom to feature"
                                      title="Zoom to feature"
                                      onClick={() => {
                                        const map = mapRef.current?.getMap?.() ?? mapRef.current;
                                        if (!map || !ft?.geometry) return;
                                        const b = getGeoJsonBounds({
                                          type: 'Feature',
                                          geometry: ft.geometry,
                                          properties: {},
                                        });
                                        if (!b || typeof map.fitBounds !== 'function') return;
                                        map.fitBounds(
                                          [
                                            [b[0], b[1]],
                                            [b[2], b[3]],
                                          ],
                                          { padding: 120, duration: 600, maxZoom: 17 },
                                        );
                                      }}
                                    >
                                      <i className="fa-solid fa-crosshairs" aria-hidden />
                                    </button>
                                  </td>
                                  <td className="gis-layer-table-fieldvis" aria-hidden />
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="si-layer-action-empty">No attributes found for this layer.</p>
                )
              ) : activeLayerActionDialog.mode === 'symbology' ? (
                <>
                  <div className="gis-style-hero">
                    <div className="gis-style-subtitle">Choose an attribute and visualization style. Preview updates live on the map.</div>
                    <label
                      className={`gis-style-check${
                        !canUseArcGisOnline && !symbologyDraft.useArcGisOnline ? ' gis-style-check--disabled' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(symbologyDraft.useArcGisOnline)}
                        disabled={!canUseArcGisOnline && !symbologyDraft.useArcGisOnline}
                        onChange={e => {
                          const on = e.target.checked;
                          if (on) {
                            updateSymbologyDraft({ useArcGisOnline: true });
                            if (
                              !activeDialogLayer.arcgisDrawingInfo &&
                              typeof activeDialogLayer.sourceUrl === 'string' &&
                              activeDialogLayer.sourceUrl.trim()
                            ) {
                              void (async () => {
                                try {
                                  const raw = await fetchArcgisLayerDrawingInfo(activeDialogLayer.sourceUrl!, activeDialogLayer.authToken);
                                  const cleaned = raw ? sanitizeArcgisDrawingInfoForClient(raw) : null;
                                  if (!cleaned) return;
                                  setCustomLayers(prev =>
                                    prev.map(l => (l.id === activeDialogLayer.id ? { ...l, arcgisDrawingInfo: cleaned } : l)),
                                  );
                                } catch {
                                  /* keep toggle usable even if renderer fetch fails */
                                }
                              })();
                            }
                          } else {
                            updateSymbologyDraft({ useArcGisOnline: false });
                          }
                        }}
                      />
                      <span>Use ArcGIS Online symbology</span>
                    </label>
                  </div>

                  <div className="gis-style-toolbar" role="toolbar" aria-label="Style actions">
                    <button
                      type="button"
                      className="gis-style-toolbtn"
                      onClick={() => resetSiSymbologyStudio()}
                      disabled={symbologyDraft.useArcGisOnline}
                      title={
                        symbologyDraft.useArcGisOnline
                          ? 'Unavailable while ArcGIS renderer is active'
                          : 'Restore visualization and symbol properties from when this panel opened'
                      }
                    >
                      <i className="fa-solid fa-rotate-left" aria-hidden />
                      Reset
                    </button>
                    <button
                      type="button"
                      className="gis-style-toolbtn"
                      onClick={() => writeSiStyleClipboard(persistedSiAppearance(siSymbologyAppearance), siStyleClipboardLs)}
                      disabled={symbologyDraft.useArcGisOnline}
                      title="Copy symbol appearance to local storage"
                    >
                      <i className="fa-solid fa-copy" aria-hidden />
                      Copy style
                    </button>
                    <button
                      type="button"
                      className="gis-style-toolbtn"
                      onClick={() => {
                        const clip = readSiStyleClipboard(siStyleClipboardLs);
                        if (!clip) return;
                        updateSiSymbologyAppearance({
                          ...clip,
                          previewCornerRadius: siSymbologyAppearance.previewCornerRadius,
                        });
                      }}
                      disabled={symbologyDraft.useArcGisOnline}
                      title="Paste symbol appearance from clipboard"
                    >
                      <i className="fa-solid fa-paste" aria-hidden />
                      Paste
                    </button>
                    <button
                      type="button"
                      className="gis-style-toolbtn"
                      onClick={() => {
                        const snap = persistedSiAppearance(siSymbologyAppearance);
                        setCustomLayers(prev =>
                          prev.map(l =>
                            l.renderMode !== 'raster' && l.geojson && l.visible
                              ? {
                                  ...l,
                                  color: snap.color,
                                  fillColor: snap.fillColor,
                                  weight: snap.weight,
                                  mapOpacity: snap.opacity,
                                  strokeStyle: snap.strokeStyle as CustomLayer['strokeStyle'],
                                  polygonFillAlpha: snap.polygonFillAlpha,
                                  pointRadius: snap.pointRadius,
                                  fillStyle: snap.fillStyle as CustomLayer['fillStyle'],
                                  blendMode: snap.blendMode as CustomLayer['blendMode'],
                                }
                              : l,
                          ),
                        );
                      }}
                      disabled={symbologyDraft.useArcGisOnline}
                      title="Apply current appearance fields to every visible vector layer"
                    >
                      <i className="fa-solid fa-layer-group" aria-hidden />
                      Apply to all layers
                    </button>
                    <button
                      type="button"
                      className="gis-style-toolbtn"
                      onClick={() =>
                        setDrawStyle(d => ({
                          ...d,
                          fillColor: siSymbologyAppearance.fillColor,
                          strokeColor: siSymbologyAppearance.color,
                          strokeWidth: Math.max(1, Math.round(siSymbologyAppearance.weight)),
                          fillOpacity: siSymbologyAppearance.polygonFillAlpha,
                          pointRadius: Math.round(siSymbologyAppearance.pointRadius),
                        }))
                      }
                      disabled={symbologyDraft.useArcGisOnline}
                      title="Use current colors for new AOI / draw shapes"
                    >
                      <i className="fa-solid fa-pen-ruler" aria-hidden />
                      Sync draw colors
                    </button>
                  </div>

                  {symbologyDraft.useArcGisOnline ? (
                    <>
                      <div className="gis-style-info">
                        ArcGIS renderer preview is enabled. Uncheck &quot;Use ArcGIS Online symbology&quot; to configure custom styles.
                      </div>
                      {(() => {
                        const renderer =
                          (activeDialogLayer.arcgisDrawingInfo as any)?.renderer ??
                          (activeDialogLayer.arcgisLayerDefinition as any)?.drawingInfo?.renderer;
                        const visLabel = describeArcGisRendererVisualization(renderer);
                        const styleLabel =
                          symbologyDraft.style === 'unique'
                            ? 'Types (unique symbols)'
                            : symbologyDraft.style === 'color_size'
                              ? 'Counts and Amounts (color + size)'
                              : symbologyDraft.style === 'size'
                                ? 'Counts and Amounts (size)'
                                : symbologyDraft.style === 'dot_density'
                                  ? 'Dot density'
                                  : symbologyDraft.style === 'threshold_markers'
                                    ? 'Single symbol + threshold markers'
                                    : 'Counts and Amounts (color)';
                        return (
                          <div className="gis-style-card" aria-label="ArcGIS visualization">
                            <div className="gis-style-grid">
                              <div className="gis-style-field">
                                <div className="gis-style-label">Visualization style</div>
                                <div className="gis-style-readonly" title={visLabel}>
                                  {renderer ? visLabel : 'Loading or unavailable ΓÇö sync the layer if symbols look wrong.'}
                                </div>
                              </div>
                              <div className="gis-style-field">
                                <div className="gis-style-label">Linked custom style (when unchecked)</div>
                                <div className="gis-style-readonly">
                                  {styleLabel}
                                  {symbologyDraft.field ? ` ┬╖ ${symbologyDraft.field}` : ''}
                                </div>
                              </div>
                            </div>
                            {renderer?.type === 'heatmap' ? (
                              <div className="gis-style-info" style={{ marginTop: 10 }}>
                                Heatmap renderers are not reproduced on this Mapbox map; use custom styles or a heatmap-capable client for this
                                visualization.
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    (() => {
                      const allFields = getGeoJsonFields(activeDialogLayer.geojson);
                      const numericFields = getNumericFields(activeDialogLayer.geojson);
                      const ctx = siSymbologyCtx;
                      const geometryKind = ctx?.geometryKind ?? getLayerGeometryKind(activeDialogLayer.geojson);
                      const isUnique = symbologyDraft.style === 'unique';
                      const isSingle = symbologyDraft.style === 'single';
                      const classes = clampInt(symbologyDraft.classes, 2, 12);
                      const showColor =
                        symbologyDraft.style === 'color' ||
                        symbologyDraft.style === 'color_size' ||
                        (isUnique && geometryKind !== 'line');
                      const showSize = symbologyDraft.style === 'size' || symbologyDraft.style === 'color_size';
                      const showMethod =
                        symbologyDraft.style !== 'unique' &&
                        symbologyDraft.style !== 'threshold_markers' &&
                        symbologyDraft.style !== 'single';
                      const showClasses = !isSingle;
                      const arcDef = activeDialogLayer.arcgisLayerDefinition ?? null;
                      const fieldsByLower = buildArcFieldsByLower(arcDef);
                      const fieldNm = symbologyDraft.field;
                      const layerFeatures = Array.isArray((activeDialogLayer.geojson as any)?.features)
                        ? ((activeDialogLayer.geojson as any).features as any[])
                        : [];
                      const uniqueLegendLabel = (val: string) => {
                        if (!fieldNm) return val;
                        const rep = layerFeatures.find((f: any) => {
                          const r = f?.properties?.[fieldNm];
                          if (r === null || r === undefined || r === '') return false;
                          return String(r) === val;
                        });
                        if (rep && arcDef) {
                          const raw = rep.properties?.[fieldNm];
                          return (
                            getArcDisplayValue(rep, fieldNm, raw, arcDef, fieldsByLower, 'description').display || val
                          );
                        }
                        if (arcDef) return arcLegendLabelForFieldValue(fieldNm, val, arcDef, fieldsByLower);
                        return val;
                      };
                      const legendItems = (() => {
                        const items: Array<{
                          label: string;
                          kind: 'line' | 'point' | 'polygon';
                          color: string;
                          width: number;
                          dash?: string;
                          fill?: string;
                        }> = [];
                        if (!ctx) return items;
                        const baseStroke = siSymbologyAppearance.color || activeDialogLayer.color || '#22c55e';
                        const baseWeight = siSymbologyAppearance.weight;
                        const previewDash = strokeDashSvgFromStyle(siSymbologyAppearance.strokeStyle);
                        const kind: 'line' | 'point' | 'polygon' =
                          geometryKind === 'polygon' ? 'polygon' : geometryKind === 'point' ? 'point' : 'line';
                        if (symbologyDraft.style === 'single') {
                          const fill = siSymbologyAppearance.fillColor;
                          items.push({
                            label: 'Base symbol',
                            kind,
                            color: baseStroke,
                            width: baseWeight,
                            dash: previewDash || undefined,
                            fill,
                          });
                          return items;
                        }
                        if (symbologyDraft.style === 'unique') {
                          if (kind === 'line') {
                            const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.uniqueDashes);
                            vals.slice(0, 12).forEach(val => {
                              items.push({
                                label: uniqueLegendLabel(val),
                                kind,
                                color: baseStroke,
                                width: baseWeight,
                                dash: ctx.uniqueDashes[val] ?? '',
                              });
                            });
                            if (vals.length === 0) items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight });
                            return items;
                          }
                          const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.categoryColors);
                          vals.slice(0, 12).forEach(val => {
                            const fill = ctx.categoryColors[val] ?? ctx.otherColor;
                            items.push({
                              label: uniqueLegendLabel(val),
                              kind,
                              color: darkenColor(fill, 0.25),
                              width: baseWeight,
                              fill,
                            });
                          });
                          if (vals.length === 0)
                            items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight, fill: baseStroke });
                          return items;
                        }
                        if (symbologyDraft.style === 'threshold_markers') {
                          items.push({ label: 'Base', kind, color: baseStroke, width: baseWeight });
                          items.push({
                            label: `Marker ΓëÑ ${ctx.threshold.toFixed(2)}`,
                            kind: 'point',
                            color: '#ef4444',
                            width: 4,
                            fill: '#ef4444',
                          });
                          return items;
                        }
                        const breaks = ctx.breaks;
                        for (let i = 0; i < Math.min(classes, breaks.length - 1); i += 1) {
                          const a = breaks[i];
                          const b = breaks[i + 1];
                          const label = `${a.toFixed(2)} ΓÇô ${b.toFixed(2)}`;
                          const color = showColor ? ctx.colors[i] ?? baseStroke : baseStroke;
                          const width = showSize ? ctx.widths[i] ?? baseWeight : baseWeight;
                          const dash = symbologyDraft.style === 'dot_density' ? ctx.dotDashes[i] : undefined;
                          if (kind === 'polygon') {
                            const fill = showColor ? color : baseStroke;
                            items.push({ label, kind, color: darkenColor(fill, 0.25), width, dash, fill });
                          } else if (kind === 'point') {
                            const fill = showColor ? color : baseStroke;
                            items.push({ label, kind, color: darkenColor(fill, 0.25), width, dash, fill });
                          } else {
                            items.push({ label, kind, color, width, dash });
                          }
                        }
                        return items;
                      })();

                      return (
                        <>
                          <div className="gis-style-card">
                            <div className="gis-style-grid">
                              <div className="gis-style-field">
                                <div className="gis-style-label">Style</div>
                                <div className="gis-style-selectwrap">
                                  <select
                                    className="gis-style-select"
                                    value={symbologyDraft.style}
                                    onChange={e => updateSymbologyDraft({ style: e.target.value as SymbologyStyle })}
                                  >
                                    <option value="single">Location (single symbol)</option>
                                    <option value="unique">Types (unique symbols)</option>
                                    <option value="color">Counts and Amounts (color)</option>
                                    <option value="size">Counts and Amounts (size)</option>
                                    <option value="color_size">Counts and Amounts (color + size)</option>
                                    <option value="dot_density">Dot density</option>
                                    <option value="threshold_markers">Single symbol + threshold markers</option>
                                  </select>
                                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                </div>
                              </div>

                              {!isSingle ? (
                              <div className="gis-style-field">
                                <div className="gis-style-label">{isUnique ? 'Attribute (categorical)' : 'Attribute (numeric)'}</div>
                                <div className="gis-style-selectwrap">
                                  <select
                                    className="gis-style-select"
                                    value={symbologyDraft.field}
                                    onChange={e => updateSymbologyDraft({ field: e.target.value })}
                                  >
                                    {isUnique ? (
                                      allFields.length ? null : (
                                        <option value="">No fields</option>
                                      )
                                    ) : numericFields.length ? null : (
                                      <option value="">No numeric fields</option>
                                    )}
                                    {(isUnique ? allFields : numericFields).map(f => (
                                      <option key={f} value={f}>
                                        {f}
                                      </option>
                                    ))}
                                  </select>
                                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                </div>
                              </div>
                              ) : null}

                              {showColor ? (
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Color ramp</div>
                                  <div className="gis-style-selectwrap">
                                    <select
                                      className="gis-style-select"
                                      value={symbologyDraft.colorRamp}
                                      onChange={e => updateSymbologyDraft({ colorRamp: e.target.value as SymbologyColorRamp })}
                                    >
                                      <option value="viridis">Viridis</option>
                                      <option value="blues">Blues</option>
                                      <option value="greens">Greens</option>
                                      <option value="plasma">Plasma</option>
                                      <option value="magma">Magma</option>
                                      <option value="turbo">Turbo</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                  </div>
                                </div>
                              ) : null}

                              {showClasses ? (
                                <div className="gis-style-field">
                                  <div className="gis-style-label">{isUnique ? 'Max categories' : 'Classes'}</div>
                                  <div className="gis-style-selectwrap">
                                    <select
                                      className="gis-style-select"
                                      value={String(classes)}
                                      onChange={e => updateSymbologyDraft({ classes: parseInt(e.target.value, 10) })}
                                    >
                                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                        <option key={n} value={String(n)}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                  </div>
                                </div>
                              ) : null}

                              {showMethod ? (
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Method</div>
                                  <div className="gis-style-selectwrap">
                                    <select
                                      className="gis-style-select"
                                      value={symbologyDraft.method}
                                      onChange={e => updateSymbologyDraft({ method: e.target.value as SymbologyClassMethod })}
                                    >
                                      <option value="jenks">Natural breaks</option>
                                      <option value="quantile">Quantile</option>
                                      <option value="equal_interval">Equal interval</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                  </div>
                                </div>
                              ) : null}

                              {symbologyDraft.style === 'threshold_markers' ? (
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Threshold</div>
                                  <input
                                    className="gis-style-input"
                                    type="number"
                                    value={Number.isFinite(symbologyDraft.threshold) ? String(symbologyDraft.threshold) : ''}
                                    onChange={e =>
                                      updateSymbologyDraft({
                                        threshold: e.target.value === '' ? Number.NaN : Number(e.target.value),
                                      })
                                    }
                                    placeholder="Threshold"
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="gis-style-acc-trigger"
                            onClick={() =>
                              setSiStudioSections(s => {
                                const n = { ...s, appearance: !s.appearance };
                                saveSiStudioSectionPrefs(n, siStyleStudioPrefsLs);
                                return n;
                              })
                            }
                          >
                            <i className={`fa-solid fa-chevron-${siStudioSections.appearance ? 'down' : 'right'}`} aria-hidden />
                            <span>Symbol appearance (live map)</span>
                          </button>
                          {siStudioSections.appearance ? (
                            <div className="gis-style-card" aria-label="Symbol appearance">
                              <div className="gis-style-grid">
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Outline color</div>
                                  <input
                                    className="gis-style-input"
                                    type="color"
                                    value={siSymbologyAppearance.color.startsWith('#') ? siSymbologyAppearance.color : '#15803d'}
                                    onChange={e => updateSiSymbologyAppearance({ color: e.target.value })}
                                    aria-label="Outline color"
                                  />
                                </div>
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Fill color</div>
                                  <input
                                    className="gis-style-input"
                                    type="color"
                                    value={siSymbologyAppearance.fillColor.startsWith('#') ? siSymbologyAppearance.fillColor : '#22c55e'}
                                    onChange={e => updateSiSymbologyAppearance({ fillColor: e.target.value })}
                                    aria-label="Fill color"
                                  />
                                </div>
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Stroke style</div>
                                  <div className="gis-style-selectwrap">
                                    <select
                                      className="gis-style-select"
                                      value={siSymbologyAppearance.strokeStyle}
                                      onChange={e =>
                                        updateSiSymbologyAppearance({ strokeStyle: e.target.value as SiSymbologyAppearance['strokeStyle'] })
                                      }
                                    >
                                      <option value="solid">Solid</option>
                                      <option value="dashed">Dashed</option>
                                      <option value="dotted">Dotted</option>
                                      <option value="dashdot">Dash / dot</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down" aria-hidden />
                                  </div>
                                </div>
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Fill style</div>
                                  <div className="gis-style-selectwrap">
                                    <select
                                      className="gis-style-select"
                                      value={siSymbologyAppearance.fillStyle}
                                      onChange={e =>
                                        updateSiSymbologyAppearance({ fillStyle: e.target.value as SiSymbologyAppearance['fillStyle'] })
                                      }
                                    >
                                      <option value="solid">Solid</option>
                                      <option value="pattern">Pattern</option>
                                      <option value="hatch">Hatch</option>
                                      <option value="gradient">Gradient</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down" aria-hidden />
                                  </div>
                                </div>
                                <div className="gis-style-field">
                                  <div className="gis-style-label">Blend mode (stored)</div>
                                  <div className="gis-style-selectwrap">
                                    <select
                                      className="gis-style-select"
                                      value={siSymbologyAppearance.blendMode}
                                      onChange={e =>
                                        updateSiSymbologyAppearance({ blendMode: e.target.value as SiSymbologyAppearance['blendMode'] })
                                      }
                                    >
                                      <option value="normal">Normal</option>
                                      <option value="multiply">Multiply</option>
                                      <option value="screen">Screen</option>
                                      <option value="overlay">Overlay</option>
                                      <option value="darken">Darken</option>
                                      <option value="lighten">Lighten</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down" aria-hidden />
                                  </div>
                                  <div className="gis-style-hint">Vector blend is stored for export; Mapbox GL paints use opacity.</div>
                                </div>
                              </div>
                              <div className="gis-style-slider-stack">
                                <div className="gis-style-label">Layer opacity ({Math.round(siSymbologyAppearance.opacity * 100)}%)</div>
                                <input
                                  type="range"
                                  min={5}
                                  max={100}
                                  value={Math.round(siSymbologyAppearance.opacity * 100)}
                                  onChange={e => updateSiSymbologyAppearance({ opacity: Number(e.target.value) / 100 })}
                                />
                                <div className="gis-style-label">Polygon fill strength ({Math.round(siSymbologyAppearance.polygonFillAlpha * 100)}%)</div>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={Math.round(siSymbologyAppearance.polygonFillAlpha * 100)}
                                  onChange={e => updateSiSymbologyAppearance({ polygonFillAlpha: Number(e.target.value) / 100 })}
                                />
                                <div className="gis-style-label">Outline width ({siSymbologyAppearance.weight.toFixed(1)} px)</div>
                                <input
                                  type="range"
                                  min={5}
                                  max={160}
                                  value={Math.round(siSymbologyAppearance.weight * 10)}
                                  onChange={e => updateSiSymbologyAppearance({ weight: Number(e.target.value) / 10 })}
                                />
                                <div className="gis-style-label">Point size ({siSymbologyAppearance.pointRadius}px)</div>
                                <input
                                  type="range"
                                  min={3}
                                  max={24}
                                  value={siSymbologyAppearance.pointRadius}
                                  onChange={e => updateSiSymbologyAppearance({ pointRadius: Number(e.target.value) })}
                                />
                                <div className="gis-style-label">Legend corner radius ({siSymbologyAppearance.previewCornerRadius}px)</div>
                                <input
                                  type="range"
                                  min={0}
                                  max={24}
                                  value={siSymbologyAppearance.previewCornerRadius}
                                  onChange={e => updateSiSymbologyAppearance({ previewCornerRadius: Number(e.target.value) })}
                                />
                              </div>
                            </div>
                          ) : null}

                          <button
                            type="button"
                            className="gis-style-acc-trigger"
                            onClick={() =>
                              setSiStudioSections(s => {
                                const n = { ...s, templates: !s.templates };
                                saveSiStudioSectionPrefs(n, siStyleStudioPrefsLs);
                                return n;
                              })
                            }
                          >
                            <i className={`fa-solid fa-chevron-${siStudioSections.templates ? 'down' : 'right'}`} aria-hidden />
                            <span>Style templates</span>
                          </button>
                          {siStudioSections.templates ? (
                            <div className="gis-style-card" aria-label="Presets">
                              <div className="gis-style-preset-row" role="list">
                                {SI_STYLE_PRESET_CHIPS.map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="gis-style-preset-chip"
                                    role="listitem"
                                    onClick={() => updateSiSymbologyAppearance({ ...p.patch })}
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="gis-style-card gis-style-card-legend">
                            <div className="gis-style-legend">
                              {legendItems.map((it, idx) => (
                                <div key={idx} className="gis-style-legend-row">
                                  <svg width="62" height="14" viewBox="0 0 62 14" aria-hidden="true">
                                    {it.kind === 'line' ? (
                                      <line
                                        x1="4"
                                        y1="7"
                                        x2="58"
                                        y2="7"
                                        stroke={it.color}
                                        strokeWidth={it.width}
                                        strokeLinecap="round"
                                        strokeDasharray={it.dash || undefined}
                                      />
                                    ) : it.kind === 'polygon' ? (
                                      <rect
                                        x="18"
                                        y="2"
                                        width="26"
                                        height="10"
                                        rx={Math.min(8, siSymbologyAppearance.previewCornerRadius)}
                                        fill={it.fill || it.color}
                                        stroke={it.color}
                                        strokeWidth="2"
                                      />
                                    ) : (
                                      <circle cx="31" cy="7" r="5" fill={it.fill || it.color} stroke={it.color} strokeWidth="2" />
                                    )}
                                  </svg>
                                  <div className="gis-style-legend-text">{it.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()
                  )}

                  <div className="gis-style-footer">
                    <button className="gis-btn" type="button" onClick={() => cancelSiSymbologyDialog()}>
                      Cancel
                    </button>
                    <button className="gis-btn gis-btn-primary" type="button" onClick={() => void applySymbologyDraft()}>
                      Save Style
                    </button>
                  </div>
                </>
              ) : (
                <div className="si-layer-action-legend">
                  <div className="si-layer-action-legend-row">
                    <span className="si-layer-action-legend-swatch" style={{ background: activeDialogLayer.color || '#22c55e' }} />
                    <div>
                      <strong>{activeDialogLayer.name}</strong>
                      <small>{Array.isArray(activeDialogLayer.geojson?.features) ? `${activeDialogLayer.geojson.features.length} feature(s)` : 'No feature count'}</small>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {isStacModalOpen ? (
        <>
        <div
          className="si-stac-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="si-stac-modal-title"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              if (isAcsPickerOpen) return;
              closeStacModal();
            }
          }}
        >
          <div className="si-stac-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="si-stac-modal-header">
              <h2 id="si-stac-modal-title">Create STAC connection</h2>
              <button type="button" className="si-stac-modal-close" aria-label="Close" onClick={closeStacModal}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="si-stac-modal-body">
              <label className="si-stac-field">
                <span>Connection name</span>
                <input
                  type="text"
                  value={stacModalDraft.connectionName}
                  onChange={e => setStacModalDraft(d => ({ ...d, connectionName: e.target.value }))}
                  placeholder="e.g. My Planetary Computer"
                  autoComplete="off"
                />
              </label>
              <label className="si-stac-field">
                <span>Connection</span>
                <select
                  value={stacModalDraft.presetId}
                  onChange={e =>
                    setStacModalDraft(d => ({
                      ...d,
                      presetId: e.target.value as StacPresetId,
                    }))
                  }
                >
                  <option value="planetary-computer">Microsoft Planetary Computer</option>
                  <option value="custom">Custom STAC API URL</option>
                </select>
              </label>
              {stacModalDraft.presetId === 'custom' ? (
                <label className="si-stac-field">
                  <span>Catalog or search URL</span>
                  <input
                    type="url"
                    value={stacModalDraft.customCatalogBaseUrl}
                    onChange={e => setStacModalDraft(d => ({ ...d, customCatalogBaseUrl: e.target.value }))}
                    placeholder="https://example.com/stac/v1"
                  />
                  <small className="si-stac-field-hint">Provide API root (ΓÇª/v1) or a full ΓÇª/search URL.</small>
                </label>
              ) : null}

              <details className="si-stac-details">
                <summary>STAC API Authentication (Optional)</summary>
                <div className="si-stac-details-inner">
                  <label className="si-stac-field">
                    <span>Method</span>
                    <select
                      value={stacModalDraft.authMode}
                      onChange={e =>
                        setStacModalDraft(d => ({
                          ...d,
                          authMode: e.target.value as StacAuthMode,
                        }))
                      }
                    >
                      <option value="none">No Authentication</option>
                      <option value="bearer">Bearer token</option>
                    </select>
                  </label>
                  {stacModalDraft.authMode === 'bearer' ? (
                    <label className="si-stac-field">
                      <span>Token</span>
                      <input
                        type="password"
                        autoComplete="off"
                        value={stacModalDraft.bearerToken}
                        onChange={e => setStacModalDraft(d => ({ ...d, bearerToken: e.target.value }))}
                        placeholder="Session only ΓÇö not saved to disk"
                      />
                    </label>
                  ) : null}
                  <button type="button" className="si-stac-signin-placeholder" disabled title="Use a bearer token above when your catalog requires it">
                    Sign In
                  </button>
                </div>
              </details>

              <details className="si-stac-details">
                <summary>Custom Headers (Optional)</summary>
                <div className="si-stac-details-inner">
                  <div className="si-stac-kv-table">
                    <div className="si-stac-kv-head"><span>Name</span><span>Value</span><span className="si-stac-kv-actions-h" /></div>
                    {stacModalDraft.customHeaders.map(row => (
                      <div key={row.id} className="si-stac-kv-row">
                        <input
                          value={row.name}
                          onChange={e =>
                            setStacModalDraft(d => ({
                              ...d,
                              customHeaders: d.customHeaders.map(r => (r.id === row.id ? { ...r, name: e.target.value } : r)),
                            }))
                          }
                          placeholder="Header-Name"
                        />
                        <input
                          value={row.value}
                          onChange={e =>
                            setStacModalDraft(d => ({
                              ...d,
                              customHeaders: d.customHeaders.map(r => (r.id === row.id ? { ...r, value: e.target.value } : r)),
                            }))
                          }
                          placeholder="value"
                        />
                        <button
                          type="button"
                          className="si-stac-kv-remove"
                          aria-label="Remove row"
                          onClick={() =>
                            setStacModalDraft(d => ({
                              ...d,
                              customHeaders: d.customHeaders.filter(r => r.id !== row.id),
                            }))
                          }
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="si-stac-add-row"
                    onClick={() => setStacModalDraft(d => ({ ...d, customHeaders: [...d.customHeaders, newStacKvRow()] }))}
                  >
                    <i className="fa-solid fa-plus" /> Add header
                  </button>
                </div>
              </details>

              <details className="si-stac-details">
                <summary>Custom Parameters (Optional)</summary>
                <div className="si-stac-details-inner">
                  <div className="si-stac-kv-table">
                    <div className="si-stac-kv-head"><span>Name</span><span>Value</span><span className="si-stac-kv-actions-h" /></div>
                    {stacModalDraft.customParams.map(row => (
                      <div key={row.id} className="si-stac-kv-row">
                        <input
                          value={row.name}
                          onChange={e =>
                            setStacModalDraft(d => ({
                              ...d,
                              customParams: d.customParams.map(r => (r.id === row.id ? { ...r, name: e.target.value } : r)),
                            }))
                          }
                        />
                        <input
                          value={row.value}
                          onChange={e =>
                            setStacModalDraft(d => ({
                              ...d,
                              customParams: d.customParams.map(r => (r.id === row.id ? { ...r, value: e.target.value } : r)),
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="si-stac-kv-remove"
                          aria-label="Remove"
                          onClick={() =>
                            setStacModalDraft(d => ({
                              ...d,
                              customParams: d.customParams.filter(r => r.id !== row.id),
                            }))
                          }
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="si-stac-add-row"
                    onClick={() => setStacModalDraft(d => ({ ...d, customParams: [...d.customParams, newStacKvRow()] }))}
                  >
                    <i className="fa-solid fa-plus" /> Add parameter
                  </button>
                  <small className="si-stac-field-hint">Sent as query string on the STAC search request.</small>
                </div>
              </details>

              <div className="si-stac-details si-stac-cloud-block">
                <button
                  type="button"
                  className="si-stac-cloud-summary-btn"
                  onClick={openAcsPicker}
                  aria-expanded={isAcsPickerOpen}
                >
                  <span className="si-stac-cloud-summary-chevron" aria-hidden>Γû╕</span>
                  <span className="si-stac-cloud-summary-label">Cloud Storage Connections (Optional)</span>
                  <span
                    className="si-stac-info-icon"
                    title="┘à┘ä┘ü╪º╪¬ .acs ┘à┘å https://github.com/Esri/arcgis-for-mpc ΓÇö ┘ä┘ä┘à╪▒╪¼╪╣┘è╪⌐╪¢ ArcGIS Pro ┘è╪│╪¬┘ç┘ä┘â┘ç╪º ┘à╪¡┘ä┘è╪º┘ï"
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <i className="fa-solid fa-circle-info" aria-hidden />
                  </span>
                </button>
                <div className="si-stac-details-inner si-stac-cloud-summary-body">
                  {stacModalDraft.cloudStorageEntries.length === 0 ? (
                    <p className="si-stac-cloud-hint">
                      ╪º┘å┘é╪▒ <strong>Cloud Storage Connections</strong> ┘ä┘ü╪¬╪¡ ┘å╪º┘ü╪░╪⌐ ╪º╪«╪¬┘è╪º╪▒ ╪º┘ä┘à┘ä┘ü╪º╪¬ ╪ú┘ê ╪º┘ä┘à╪│╪º╪▒╪º╪¬.
                    </p>
                  ) : (
                    <ul className="si-stac-cloud-list si-stac-cloud-list--compact">
                      {stacModalDraft.cloudStorageEntries.map((entry, idx) => (
                        <li key={`${idx}-${entry.slice(0, 48)}`}>
                          <span>{entry}</span>
                          <button
                            type="button"
                            className="si-stac-cloud-remove"
                            aria-label="Remove"
                            onClick={() =>
                              setStacModalDraft(d => ({
                                ...d,
                                cloudStorageEntries: d.cloudStorageEntries.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            <div className="si-stac-modal-footer">
              <a className="si-stac-modal-help" href={STAC_HELP_LINKS.docs} target="_blank" rel="noopener noreferrer">
                Learn more about STAC
              </a>
              <div className="si-stac-modal-actions">
                <button type="button" className="si-stac-modal-cancel" onClick={closeStacModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="si-stac-modal-ok"
                  disabled={stacModalOkDisabled}
                  onClick={applyStacConnectionModal}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
        {isAcsPickerOpen && (
          <div
            className="si-acs-picker-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="si-acs-picker-title"
            onMouseDown={e => {
              if (e.target === e.currentTarget) cancelAcsPicker();
            }}
          >
            <div className="si-acs-picker" onMouseDown={e => e.stopPropagation()}>
              <input
                ref={acsFileInputRef}
                type="file"
                className="si-acs-file-input-hidden"
                accept=".acs,.ACS,application/octet-stream"
                multiple
                onChange={onAcsFilesPicked}
              />
              <div className="si-acs-picker-header">
                <div>
                  <h2 id="si-acs-picker-title">Add Cloud Storage Connection File</h2>
                  <p className="si-acs-picker-subtitle">╪Ñ╪╢╪º┘ü╪⌐ ┘à┘ä┘ü╪º╪¬ (.acs) ╪ú┘ê ┘à╪│╪º╪▒╪º╪¬ ΓÇö ╪º┘ä┘à╪¬╪╡┘ü╪¡ ┘è╪╣╪▒╪╢ ╪ú╪│┘à╪º╪í ╪º┘ä┘à┘ä┘ü╪º╪¬ ╪º┘ä┘à╪«╪¬╪º╪▒╪⌐╪¢ ╪º┘ä╪╡┘è╪║╪⌐ ╪º┘ä┘â╪º┘à┘ä╪⌐ ╪¬┘Å┘ä╪╡┘Ä┘é ┘è╪»┘ê┘è╪º┘ï</p>
                </div>
                <button type="button" className="si-stac-modal-close" aria-label="Close" onClick={cancelAcsPicker}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <div className="si-acs-picker-breadcrumb-row">
                <span className="si-acs-breadcrumb" title="┘à╪½╪º┘ä ┘ç┘è┘â┘ä ┘à╪¼┘ä╪»╪º╪¬ MPC">
                  Downloads <span className="si-acs-bc-sep">ΓÇ║</span> arcgis-for-mpc-main <span className="si-acs-bc-sep">ΓÇ║</span> AMPC_Resources <span className="si-acs-bc-sep">ΓÇ║</span> ACS_Files
                </span>
                <input
                  type="search"
                  className="si-acs-search"
                  placeholder="Search ACS_Files"
                  value={acsPickerFilter}
                  onChange={e => setAcsPickerFilter(e.target.value)}
                  aria-label="Filter file list"
                />
              </div>
              <div className="si-acs-picker-main">
                <div className="si-acs-file-list-head">
                  <span>Name</span>
                  <span>Type</span>
                </div>
                <ul className="si-acs-file-list">
                  {acsPickerStaging.length === 0 ? (
                    <li className="si-acs-file-list-empty">No files selected ΓÇö use Browse to choose .acs files</li>
                  ) : (
                    acsPickerStaging
                      .filter(
                        n =>
                          !acsPickerFilter.trim() ||
                          n.toLowerCase().includes(acsPickerFilter.toLowerCase().trim()),
                      )
                      .map(name => (
                        <li key={name}>
                          <span className="si-acs-col-name">{name}</span>
                          <span className="si-acs-col-type">ArcGIS Cloud Storage Connection</span>
                          <button
                            type="button"
                            className="si-acs-row-remove"
                            aria-label={`Remove ${name}`}
                            onClick={() =>
                              setAcsPickerStaging(s => {
                                const i = s.indexOf(name);
                                return i === -1 ? s : [...s.slice(0, i), ...s.slice(i + 1)];
                              })
                            }
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </li>
                      ))
                  )}
                </ul>
              </div>
              <div className="si-acs-picker-bottom">
                <label className="si-acs-manual-path">
                  <span>Name / full path (one per line)</span>
                  <textarea
                    value={acsPickerManualPath}
                    onChange={e => setAcsPickerManualPath(e.target.value)}
                    rows={3}
                    placeholder="C:\Users\ΓÇª\esrims_pc_sentinel-2-l2a.acs"
                  />
                </label>
                <div className="si-acs-picker-bottom-bar">
                  <label className="si-acs-filter-dd">
                    <span className="si-sr-only">File type</span>
                    <select disabled aria-hidden className="si-acs-filter-select">
                      <option>Cloud Storage Connections</option>
                    </select>
                  </label>
                  <button type="button" className="si-acs-browse-btn" onClick={() => acsFileInputRef.current?.click()}>
                    <i className="fa-solid fa-folder-open" aria-hidden /> BrowseΓÇª
                  </button>
                  <div className="si-acs-picker-okcancel">
                    <button type="button" className="si-stac-modal-cancel" onClick={cancelAcsPicker}>
                      Cancel
                    </button>
                    <button type="button" className="si-stac-modal-ok" onClick={confirmAcsPicker}>
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
      ) : null}
    </div>
  );
}
