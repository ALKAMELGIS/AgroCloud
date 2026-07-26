import './satelliteMapAnalysisChrome.css';
import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import type {
  AoiStaticExportLngLat,
  AoiStaticMultiLayerLineChartDataset,
} from './AoiStaticMultiLayerLineChart';
import {
  type LayerLiveStatsLayerId,
} from '../utils/staticAoiMultiChartData';
import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices';
import { SatelliteContextualAnalysisDock } from './SatelliteContextualAnalysisDock';
import type { SmartProcessingSectionId } from './SmartProcessingWorkflowPanel';

/** Optional metadata when opening a processing section from the map toolbox. */
export type MapToolboxNavigateMeta = { fromDockOptions?: boolean };
export type MapToolboxNavigateHandler = (
  sectionId: SmartProcessingSectionId,
  meta?: MapToolboxNavigateMeta,
) => void;
import { MapToolsDock } from './MapToolsDock';

export type TimelineChip = {
  id: string;
  shortLabel: string;
  fullDate: string;
  mean: number;
};

export type SatelliteMapAnalysisToolbarProps = {
  mapTool: 'rectangle' | 'polygon' | 'circle' | 'select' | string;
  onMapTool: (tool: 'rectangle' | 'polygon' | 'circle' | 'select') => void;
  /** AOI sketch committed or any drawing/edit session active — disables Clear when false */
  hasClearableDrawing?: boolean;
  /** Clear committed AOI sketch + drafts only; analysis / imagery layers remain on map */
  onClearDrawing?: () => void;
  hasAoi: boolean;
  staticChartsOpen: boolean;
  onToggleStaticCharts: () => void;
  /** When true, toolbar sits inside Remote Sensing card (no floating map position). */
  embedded?: boolean;
  /** When true, Charts tab is a compact shortcut (optional). */
  chartsCompact?: boolean;
  className?: string;
  /** Optional — enriches embedded contextual Stats tab */
  weeklyMeans?: number[];
  pivotBars?: Array<{ name: string; value: number }>;
  indexLabel?: string;
  layerLiveStatsLayerGroups?: RemoteSensingLayerSelectGroup[];
  layerLiveStatsLayers?: LayerLiveStatsLayerId[];
  onLayerLiveStatsLayersChange?: (ids: LayerLiveStatsLayerId[]) => void;
  primaryLayerId?: string;
  staticMultiLineLabels?: string[];
  staticMultiLineDatasets?: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst?: boolean;
  staticMultiLineHasEt?: boolean;
  /** One WGS84 point per timeline row for CSV export (inside AOI when polygon). */
  staticChartExportLngLatPerRow?: AoiStaticExportLngLat[];
};

export function SatelliteMapAnalysisToolbar({
  mapTool,
  onMapTool,
  hasClearableDrawing = false,
  onClearDrawing,
  hasAoi,
  staticChartsOpen,
  onToggleStaticCharts,
  embedded = false,
  chartsCompact = false,
  className = '',
  weeklyMeans = [],
  pivotBars = [],
  indexLabel = '',
  layerLiveStatsLayerGroups = [],
  layerLiveStatsLayers = [],
  onLayerLiveStatsLayersChange,
  primaryLayerId,
  staticMultiLineLabels = [],
  staticMultiLineDatasets = [],
  staticMultiLineHasLst = false,
  staticMultiLineHasEt = false,
  staticChartExportLngLatPerRow,
}: SatelliteMapAnalysisToolbarProps) {
  return (
    <SatelliteContextualAnalysisDock
      variant={embedded ? 'embedded' : 'map'}
      className={[embedded ? 'si-map-analysis-toolbar--embedded' : '', className.trim()].filter(Boolean).join(' ')}
      mapTool={mapTool}
      onMapTool={onMapTool}
      hasClearableDrawing={hasClearableDrawing}
      onClearDrawing={onClearDrawing}
      hasAoi={hasAoi}
      staticChartsOpen={staticChartsOpen}
      onToggleStaticCharts={onToggleStaticCharts}
      chartsCompact={chartsCompact}
      weeklyMeans={weeklyMeans}
      pivotBars={pivotBars}
      indexLabel={indexLabel}
      staticMultiLineLabels={staticMultiLineLabels}
      staticMultiLineDatasets={staticMultiLineDatasets}
      staticMultiLineHasLst={staticMultiLineHasLst}
      staticMultiLineHasEt={staticMultiLineHasEt}
      staticChartExportLngLatPerRow={staticChartExportLngLatPerRow}
      layerLiveStatsLayerGroups={layerLiveStatsLayerGroups}
      layerLiveStatsLayers={layerLiveStatsLayers}
      onLayerLiveStatsLayersChange={onLayerLiveStatsLayersChange}
      primaryLayerId={primaryLayerId}
    />
  );
}

export type SatelliteMapAnalysisChromeProps = {
  weeklyChips: TimelineChip[];
  activeChipId: string | null;
  onPickChip: (id: string) => void;
  timelinePlaying: boolean;
  onTogglePlay: () => void;
  onStep: (dir: -1 | 1) => void;
  timelineVisible: boolean;
  /** Milliseconds between automatic steps while timeline is playing (drives interval in parent). */
  timelinePlaybackMs?: number;
  /** Cycle playback speed (parent owns state). */
  onCycleTimelineSpeed?: () => void;
  mapTool: 'rectangle' | 'polygon' | 'circle' | 'select' | string;
  onMapTool: (tool: 'rectangle' | 'polygon' | 'circle' | 'select') => void;
  hasClearableDrawing?: boolean;
  onClearDrawing?: () => void;
  hasAoi: boolean;
  staticChartsOpen: boolean;
  onToggleStaticCharts: () => void;
  /** @deprecated Map uses contextual dock; flag ignored. */
  showFloatingToolbar?: boolean;
  /** Sparkline means (0–1 normalized optional) */
  weeklyMeans: number[];
  pivotBars: Array<{ name: string; value: number }>;
  indexLabel: string;
  /** Multi-layer temporal line chart (WMS-style indices). */
  staticMultiLineLabels: string[];
  staticMultiLineDatasets: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst: boolean;
  staticMultiLineHasEt?: boolean;
  staticChartExportLngLatPerRow?: AoiStaticExportLngLat[];
  layerLiveStatsLayerGroups: RemoteSensingLayerSelectGroup[];
  layerLiveStatsLayers: LayerLiveStatsLayerId[];
  onLayerLiveStatsLayersChange: (ids: LayerLiveStatsLayerId[]) => void;
  primaryLayerId?: string;
  /** With `mapLoaded`, portals the contextual dock into `mapboxgl-canvas-container` for a true in-map overlay. */
  mapRef?: RefObject<any>;
  mapLoaded?: boolean;
  /** When false, the right-rail map toolbox is omitted (timeline and other chrome still render). */
  showMapToolbox?: boolean;
  onProcessingWorkflowNavigate?: MapToolboxNavigateHandler;
  processingDropdownOpen?: boolean;
  /** Section shown inside portaled Processing Options — syncs toolbox chrome (title / rail) with content. */
  processingEmbedSection?:
    | 'source'
    | 'layers'
    | 'remote-sensing'
    | 'eo-enrichment'
      | 'crop-alerts'
    | 'stress-zones'
    | 'crop-classification'
    | 'ai-detection-gis'
    | 'tree-detections'
    | 'sam-detection'
    | 'agri-field-boundary'
    | 'hydro-watershed'
    | 'well-site'
    | 'well-suitability'
    | 'flood-monitoring'
    | 'image-classification'
    | 'raster-georeference'
    | 'table-geo-ai'
    | null;
  onMapToolboxEmbedHost?: (el: HTMLDivElement | null) => void;
  onToolboxPanelClose?: () => void;
  /** Layers tool → Main tab: Added layers (optional; parent provides memoized JSX). */
  mapToolboxLayersMain?: ReactNode;
  /** Layers tool → Options tab: e.g. per-layer popup configuration (optional). */
  mapToolboxLayersOptionsExtra?: ReactNode;
  /** AI Agent opens as a floating map widget (not inside the processing panel). */
  geoAiFloatingOpen?: boolean;
  onGeoAiFloatingRailToggle?: () => void;
  onMapToolboxAddGisLayerAction?: (
    action: import('./MapToolboxAddGisLayerFlyout').MapToolboxAddGisLayerAction,
  ) => void;
  /** Opens the full Add GIS Layer modal from the map toolbox + button (GIS Map parity). */
  onMapToolboxAddGisLayerPrimaryClick?: () => void;
  mapToolboxBrowseLayersPanel?: ReactNode;
  /** Layer Live NDVI legend panel for Main toolbox. */
  mapToolboxLayerLiveLegend?: ReactNode;
  layerLiveLegendOpen?: boolean;
  onLayerLiveLegendOpenChange?: (open: boolean) => void;
  /** Main toolbox Edit button: whether the system drawing tool is active. */
  mapToolboxDrawingActive?: boolean;
  /** Main toolbox Edit button: toggle the system drawing tool. */
  onMapToolboxToggleDrawing?: () => void;
  /** Main toolbox Measure tool: active measurement mode (or null). */
  measureMode?: string | null;
  /** Main toolbox Measure tool: open the unified measurement panel. */
  onMeasureOpenPanel?: () => void;
  /** Main toolbox Measure tool: stop / clear measuring. */
  onMeasureClear?: () => void;
  /** Main toolbox Select tool: feature selection mode active. */
  mapToolboxSelectionActive?: boolean;
  /** Toggle GIS feature selection from the map toolbox rail. */
  onMapToolboxToggleSelection?: () => void;
  /** Imagery Time Series floating panel open state (map variant). */
  imageryTimeSeriesOpen?: boolean;
  onImageryTimeSeriesOpenChange?: (open: boolean) => void;
  goToXyOpen?: boolean;
  onGoToXyOpenChange?: (open: boolean) => void;
};

function sparkPath(values: number[], w: number, h: number): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts.join(' L ')}`;
}

export function SatelliteMapAnalysisChrome(props: SatelliteMapAnalysisChromeProps) {
  const chipStripRef = useRef<HTMLDivElement | null>(null);

  const {
    weeklyChips,
    activeChipId,
    onPickChip,
    timelinePlaying,
    onTogglePlay,
    onStep,
    timelineVisible,
    timelinePlaybackMs = 1400,
    onCycleTimelineSpeed,
    mapTool,
    onMapTool,
    hasClearableDrawing = false,
    onClearDrawing,
    hasAoi,
    staticChartsOpen,
    onToggleStaticCharts,
    weeklyMeans,
    pivotBars,
    indexLabel,
    staticMultiLineLabels,
    staticMultiLineDatasets,
    staticMultiLineHasLst,
    staticMultiLineHasEt = false,
    staticChartExportLngLatPerRow,
    layerLiveStatsLayerGroups,
    layerLiveStatsLayers,
    onLayerLiveStatsLayersChange,
    primaryLayerId,
    mapRef,
    mapLoaded = false,
    showMapToolbox = true,
    onProcessingWorkflowNavigate,
    processingDropdownOpen = false,
    processingEmbedSection = null,
    onMapToolboxEmbedHost,
    onToolboxPanelClose,
    mapToolboxLayersMain,
    mapToolboxLayersOptionsExtra,
    geoAiFloatingOpen = false,
    onGeoAiFloatingRailToggle,
    onMapToolboxAddGisLayerAction,
    onMapToolboxAddGisLayerPrimaryClick,
    mapToolboxBrowseLayersPanel,
    mapToolboxLayerLiveLegend,
    layerLiveLegendOpen,
    onLayerLiveLegendOpenChange,
    mapToolboxDrawingActive,
    onMapToolboxToggleDrawing,
    measureMode,
    onMeasureOpenPanel,
    onMeasureClear,
    mapToolboxSelectionActive,
    onMapToolboxToggleSelection,
    imageryTimeSeriesOpen,
    onImageryTimeSeriesOpenChange,
    goToXyOpen,
    onGoToXyOpenChange,
  } = props;

  const activeFull =
    weeklyChips.find(c => c.id === activeChipId)?.fullDate ??
    weeklyChips[0]?.fullDate ??
    '';

  const activeIndex = useMemo(() => {
    if (!weeklyChips.length) return 0;
    const i = weeklyChips.findIndex(c => c.id === activeChipId);
    return i < 0 ? 0 : i;
  }, [weeklyChips, activeChipId]);

  const timelineProgress = useMemo(() => {
    if (weeklyChips.length <= 1) return 1;
    return activeIndex / (weeklyChips.length - 1);
  }, [weeklyChips.length, activeIndex]);

  const rangeStartLabel = weeklyChips[0]?.fullDate ?? '';
  const rangeEndLabel = weeklyChips[weeklyChips.length - 1]?.fullDate ?? '';

  const playbackSpeedLabel = useMemo(() => {
    const base = 1400;
    const x = base / Math.max(1, timelinePlaybackMs);
    if (x < 1.12) return '1×';
    if (x < 9.5) return `${x.toFixed(1)}×`;
    return `${Math.round(x)}×`;
  }, [timelinePlaybackMs]);

  useLayoutEffect(() => {
    if (!activeChipId || !chipStripRef.current) return;
    const strip = chipStripRef.current;
    const esc =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(activeChipId)
        : activeChipId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const chip = strip.querySelector<HTMLElement>(`[data-timeline-chip="${esc}"]`);
    if (!chip) return;
    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [activeChipId, weeklyChips.length]);

  const contextualDock = showMapToolbox ? (
    <SatelliteContextualAnalysisDock
      variant="map"
      mapTool={mapTool}
      onMapTool={onMapTool}
      hasClearableDrawing={hasClearableDrawing}
      onClearDrawing={onClearDrawing}
      hasAoi={hasAoi}
      staticChartsOpen={staticChartsOpen}
      onToggleStaticCharts={onToggleStaticCharts}
      indexLabel={indexLabel}
      staticMultiLineLabels={staticMultiLineLabels}
      staticMultiLineDatasets={staticMultiLineDatasets}
      staticMultiLineHasLst={staticMultiLineHasLst}
      staticMultiLineHasEt={staticMultiLineHasEt}
      staticChartExportLngLatPerRow={staticChartExportLngLatPerRow}
      layerLiveStatsLayerGroups={layerLiveStatsLayerGroups}
      layerLiveStatsLayers={layerLiveStatsLayers}
      onLayerLiveStatsLayersChange={onLayerLiveStatsLayersChange}
      primaryLayerId={primaryLayerId}
      weeklyMeans={weeklyMeans}
      pivotBars={pivotBars}
      sparkPathBuilder={sparkPath}
      onProcessingWorkflowNavigate={onProcessingWorkflowNavigate}
      processingDropdownOpen={processingDropdownOpen}
      processingEmbedSection={processingEmbedSection}
      onMapToolboxEmbedHost={onMapToolboxEmbedHost}
      onToolboxPanelClose={onToolboxPanelClose}
      mapToolboxLayersMain={mapToolboxLayersMain}
      mapToolboxLayersOptionsExtra={mapToolboxLayersOptionsExtra}
      geoAiFloatingOpen={geoAiFloatingOpen}
      onGeoAiFloatingRailToggle={onGeoAiFloatingRailToggle}
      onMapToolboxAddGisLayerAction={onMapToolboxAddGisLayerAction}
      onMapToolboxAddGisLayerPrimaryClick={onMapToolboxAddGisLayerPrimaryClick}
      mapToolboxBrowseLayersPanel={mapToolboxBrowseLayersPanel}
      mapToolboxLayerLiveLegend={mapToolboxLayerLiveLegend}
      layerLiveLegendOpen={layerLiveLegendOpen}
      onLayerLiveLegendOpenChange={onLayerLiveLegendOpenChange}
      mapToolboxDrawingActive={mapToolboxDrawingActive}
      onMapToolboxToggleDrawing={onMapToolboxToggleDrawing}
      measureMode={measureMode}
      onMeasureOpenPanel={onMeasureOpenPanel}
      onMeasureClear={onMeasureClear}
      mapToolboxSelectionActive={mapToolboxSelectionActive}
      onMapToolboxToggleSelection={onMapToolboxToggleSelection}
      imageryTimeSeriesOpen={imageryTimeSeriesOpen}
      onImageryTimeSeriesOpenChange={onImageryTimeSeriesOpenChange}
      goToXyOpen={goToXyOpen}
      onGoToXyOpenChange={onGoToXyOpenChange}
    />
  ) : null;

  return (
    <>
      {timelineVisible && weeklyChips.length > 0 ? (
        <div className="si-map-analysis-timeline" role="region" aria-label="Imagery timeline">
          <div className="si-map-analysis-timeline-inner si-map-analysis-timeline-inner--eo">
            <div className="si-map-analysis-timeline-transport">
              <button
                type="button"
                className="si-map-analysis-tl-btn"
                aria-label="Previous period"
                onClick={() => onStep(-1)}
              >
                <i className="fa-solid fa-backward-step" aria-hidden />
              </button>
              <button
                type="button"
                className={`si-map-analysis-tl-play ${timelinePlaying ? 'si-map-analysis-tl-play--on' : ''}`}
                aria-label={timelinePlaying ? 'Pause timeline' : 'Play timeline'}
                aria-pressed={timelinePlaying}
                onClick={onTogglePlay}
              >
                <i className={timelinePlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} aria-hidden />
              </button>
              <button type="button" className="si-map-analysis-tl-btn" aria-label="Next period" onClick={() => onStep(1)}>
                <i className="fa-solid fa-forward-step" aria-hidden />
              </button>
            </div>

            <div className="si-map-analysis-timeline-track-wrap">
              <div
                ref={chipStripRef}
                className={[
                  'si-map-analysis-timeline-chips',
                  weeklyChips.length > 22 ? 'si-map-analysis-timeline-chips--dense' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-agrocloud-map-wheel-scroll=""
                role="tablist"
              >
                {weeklyChips.map(chip => (
                  <button
                    key={chip.id}
                    type="button"
                    role="tab"
                    data-timeline-chip={chip.id}
                    aria-selected={chip.id === activeChipId}
                    className={`si-map-analysis-chip ${chip.id === activeChipId ? 'si-map-analysis-chip--active' : ''}`}
                    onClick={() => onPickChip(chip.id)}
                    title={`${chip.fullDate} · index mean ≈ ${chip.mean.toFixed(3)}`}
                  >
                    {chip.shortLabel}
                  </button>
                ))}
              </div>

              <div className="si-map-analysis-timeline-scrub">
                <button
                  type="button"
                  className="si-map-analysis-tl-nudge"
                  aria-label="Step timeline backward (rail)"
                  onClick={() => onStep(-1)}
                >
                  <i className="fa-solid fa-chevron-left" aria-hidden />
                </button>
                <div className="si-map-analysis-timeline-scrub-core">
                  <span className="si-map-analysis-timeline-range-edge" title={rangeStartLabel}>
                    {rangeStartLabel || '—'}
                  </span>
                  <div className="si-map-analysis-timeline-progress-track" aria-hidden>
                    <div className="si-map-analysis-timeline-progress-bg" />
                    <div
                      className="si-map-analysis-timeline-progress-fill"
                      style={{ transform: `scaleX(${timelineProgress})` }}
                    />
                  </div>
                  <span className="si-map-analysis-timeline-range-edge" title={rangeEndLabel}>
                    {rangeEndLabel || '—'}
                  </span>
                </div>
                <button
                  type="button"
                  className="si-map-analysis-tl-nudge"
                  aria-label="Step timeline forward (rail)"
                  onClick={() => onStep(1)}
                >
                  <i className="fa-solid fa-chevron-right" aria-hidden />
                </button>
              </div>
            </div>

            <div className="si-map-analysis-timeline-meta">
              <div className="si-map-analysis-timeline-date-block">
                <span className="si-map-analysis-timeline-date-label">Selected</span>
                <time className="si-map-analysis-timeline-date" dateTime={activeFull || undefined} title={activeFull}>
                  {activeFull || '—'}
                </time>
              </div>
              {onCycleTimelineSpeed ? (
                <button
                  type="button"
                  className="si-map-analysis-tl-speed"
                  title={`Playback interval ${timelinePlaybackMs} ms — click to change speed`}
                  aria-label={`Playback speed ${playbackSpeedLabel}, click to cycle`}
                  onClick={onCycleTimelineSpeed}
                >
                  {playbackSpeedLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* si-map-container: MapGL + chrome; MapToolsDock portals into mapboxgl-canvas-container */}
      {contextualDock ? (
        mapRef ? (
          <MapToolsDock mapRef={mapRef} mapLoaded={mapLoaded}>
            {contextualDock}
          </MapToolsDock>
        ) : (
          contextualDock
        )
      ) : null}
    </>
  );
}
