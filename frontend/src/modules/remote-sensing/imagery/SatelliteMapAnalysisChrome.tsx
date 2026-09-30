import './satelliteMapAnalysisChrome.css';
import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { eoTimelineIndexFromFraction, SiEoTimelineSlider } from '../temporal-analysis/EoTimelineSlider';
import type {
  AoiStaticExportLngLat,
  AoiStaticMultiLayerLineChartDataset,
} from '../temporal-analysis/AoiStaticMultiLayerLineChart';
import {
  type LayerLiveStatsLayerId,
} from '../temporal-analysis/staticAoiMultiChartData';
import type { RemoteSensingLayerSelectGroup } from '../indices/agroCompositeIndices';
import { SatelliteContextualAnalysisDock } from './SatelliteContextualAnalysisDock';
import type { SmartProcessingSectionId } from './SmartProcessingWorkflowPanel';

/** Optional metadata when opening a processing section from the map toolbox. */
export type MapToolboxNavigateMeta = { fromDockOptions?: boolean };
export type MapToolboxNavigateHandler = (
  sectionId: SmartProcessingSectionId,
  meta?: MapToolboxNavigateMeta,
) => void;
import { MapToolsDock } from '@/modules/gis/map/MapToolsDock';

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
  /** Pointer-down on the imagery track. Parent pauses playback and owns the blend. */
  onTimelineScrubStart?: () => void;
  /** Continuous 0–1 position while dragging. Parent cross-fades the two nearest dates. */
  onTimelineScrub?: (fraction: number) => void;
  /** Pointer-up. Fraction is the exact 0–1 position, not a snapped date index. */
  onTimelineScrubEnd?: (fraction: number) => void;
  /** Continuous 0–1 playhead. Must not re-render the map page. */
  onTimelinePlayProgress?: (fraction: number) => void;
  /** Play loop pushes a 0–1 thumb position without re-rendering the map page. */
  onBindTimelineVisualFraction?: (sink: ((fraction: number | null) => void) | null) => void;
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
    | 'crop-alerts'
    | 'wapi-alerts'
    | 'stress-zones'
    | 'crop-classification'
    | 'tree-detections'
    | 'agri-field-boundary'
    | 'segformer-detection'
    | 'hydro-watershed'
    | 'cut-fill-analysis'
    | 'elevation-profile'
    | 'well-site'
    | 'well-suitability'
    | 'flood-monitoring'
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
    action: import('@/modules/gis/map/MapToolboxAddGisLayerFlyout').MapToolboxAddGisLayerAction,
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
  elevationProfileOpen?: boolean;
  onElevationProfileRailToggle?: () => void;
  /** Main toolbox Select tool: feature selection mode active. */
  mapToolboxSelectionActive?: boolean;
  /** Toggle GIS feature selection from the map toolbox rail. */
  onMapToolboxToggleSelection?: () => void;
  /** Imagery Time Series floating panel open state (map variant). */
  imageryTimeSeriesOpen?: boolean;
  onImageryTimeSeriesOpenChange?: (open: boolean) => void;
  /** MapSwipe compare overlay open state (map variant). */
  mapSwipeOpen?: boolean;
  onMapSwipeOpenChange?: (open: boolean) => void;
  goToXyOpen?: boolean;
  onGoToXyOpenChange?: (open: boolean) => void;
  cropAiPanelOpen?: boolean;
  onCropAiPanelOpenChange?: (open: boolean) => void;
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
  const {
    weeklyChips,
    activeChipId,
    onPickChip,
    timelinePlaying,
    onTogglePlay,
    onStep,
    onTimelineScrubStart,
    onTimelineScrub,
    onTimelineScrubEnd,
    onTimelinePlayProgress,
    onBindTimelineVisualFraction,
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
    elevationProfileOpen,
    onElevationProfileRailToggle,
    mapToolboxSelectionActive,
    onMapToolboxToggleSelection,
    imageryTimeSeriesOpen,
    onImageryTimeSeriesOpenChange,
    mapSwipeOpen,
    onMapSwipeOpenChange,
    goToXyOpen,
    onGoToXyOpenChange,
    cropAiPanelOpen,
    onCropAiPanelOpenChange,
  } = props;

  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const weeklyChipsRef = useRef(weeklyChips);
  weeklyChipsRef.current = weeklyChips;
  const selectedTimeRef = useRef<HTMLTimeElement | null>(null);

  const bindTimelineVisualFraction = useCallback(
    (sink: ((fraction: number | null) => void) | null) => {
      if (!onBindTimelineVisualFraction) return;
      if (!sink) {
        onBindTimelineVisualFraction(null);
        return;
      }
      onBindTimelineVisualFraction(fraction => {
        sink(fraction);
        if (fraction == null) return;
        const chips = weeklyChipsRef.current;
        const max = chips.length - 1;
        if (max <= 0) return;
        const idx = Math.min(max, Math.max(0, Math.round(fraction * max)));
        const iso = chips[idx]?.fullDate;
        const el = selectedTimeRef.current;
        if (!el || !iso || el.textContent === iso) return;
        el.textContent = iso;
        el.dateTime = iso;
      });
    },
    [onBindTimelineVisualFraction],
  );

  const activeIndex = useMemo(() => {
    if (!weeklyChips.length) return 0;
    const i = weeklyChips.findIndex(c => c.id === activeChipId);
    return i < 0 ? 0 : i;
  }, [weeklyChips, activeChipId]);

  const labelIndex =
    scrubFraction != null ? eoTimelineIndexFromFraction(scrubFraction, weeklyChips.length) : activeIndex;
  const activeFull = weeklyChips[labelIndex]?.fullDate ?? weeklyChips[0]?.fullDate ?? '';

  const playbackSpeedLabel = useMemo(() => {
    const base = 1400;
    const x = base / Math.max(1, timelinePlaybackMs);
    if (x < 1.12) return '1×';
    if (x < 9.5) return `${x.toFixed(1)}×`;
    return `${Math.round(x)}×`;
  }, [timelinePlaybackMs]);

  const handleTimelineIndex = (index: number) => {
    const chip = weeklyChips[index];
    if (chip) onPickChip(chip.id);
  };

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
      elevationProfileOpen={elevationProfileOpen}
      onElevationProfileRailToggle={onElevationProfileRailToggle}
      mapToolboxSelectionActive={mapToolboxSelectionActive}
      onMapToolboxToggleSelection={onMapToolboxToggleSelection}
      imageryTimeSeriesOpen={imageryTimeSeriesOpen}
      onImageryTimeSeriesOpenChange={onImageryTimeSeriesOpenChange}
      mapSwipeOpen={mapSwipeOpen}
      onMapSwipeOpenChange={onMapSwipeOpenChange}
      goToXyOpen={goToXyOpen}
      onGoToXyOpenChange={onGoToXyOpenChange}
      cropAiPanelOpen={cropAiPanelOpen}
      onCropAiPanelOpenChange={onCropAiPanelOpenChange}
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
              <SiEoTimelineSlider
                steps={weeklyChips}
                activeIndex={activeIndex}
                onSelectIndex={handleTimelineIndex}
                playing={timelinePlaying}
                playbackMs={timelinePlaybackMs}
                onPlayProgress={fraction => {
                  const chips = weeklyChipsRef.current;
                  const max = chips.length - 1;
                  if (max > 0 && selectedTimeRef.current) {
                    const idx = Math.min(max, Math.max(0, Math.round(fraction * max)));
                    const iso = chips[idx]?.fullDate;
                    const el = selectedTimeRef.current;
                    if (iso && el.textContent !== iso) {
                      el.textContent = iso;
                      el.dateTime = iso;
                    }
                  }
                  onTimelinePlayProgress?.(fraction);
                }}
                onScrubStart={() => {
                  setScrubFraction(null);
                  onTimelineScrubStart?.();
                }}
                onScrubFraction={fraction => {
                  setScrubFraction(fraction);
                  onTimelineScrub?.(fraction);
                }}
                onScrubEnd={fraction => {
                  setScrubFraction(null);
                  onTimelineScrubEnd?.(fraction);
                }}
                onBindVisualFraction={bindTimelineVisualFraction}
              />
            </div>

            <div className="si-map-analysis-timeline-meta">
              <div className="si-map-analysis-timeline-date-block">
                <span className="si-map-analysis-timeline-date-label">Selected</span>
                <time
                  ref={selectedTimeRef}
                  className="si-map-analysis-timeline-date"
                  dateTime={activeFull || undefined}
                  title={activeFull}
                >
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
