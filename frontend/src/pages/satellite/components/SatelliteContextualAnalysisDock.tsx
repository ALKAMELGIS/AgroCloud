import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLanguage } from '@/lib/i18n';
import { useSiInstanceScope } from '../siInstanceScope';
// Map overlay event isolation — keeps panel clicks/scroll from leaking to the map.
import { useMapOverlayIsolation } from '../useMapOverlayIsolation';
import type { AoiStaticExportLngLat, AoiStaticMultiLayerLineChartDataset } from './AoiStaticMultiLayerLineChart';
import { AoiStaticMultiLayerLineChart } from './AoiStaticMultiLayerLineChart';
import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import {
  type LayerLiveStatsLayerId,
} from '../utils/staticAoiMultiChartData'
import { LayerLiveStatsLayerDropdown } from './LayerLiveStatsLayerDropdown'
import type { SmartProcessingSectionId } from './SmartProcessingWorkflowPanel';
import {
  MapToolboxAddGisLayerFlyout,
  type MapToolboxAddGisLayerAction,
} from './MapToolboxAddGisLayerFlyout';
export type SatelliteContextPanelId =
  | 'layers'
  | 'add-gis-layer'
  | 'remote-sensing'
  | 'crop-alerts'
  | 'crop-classification'
  | 'layer-live-legend'
  | 'ai-detection-gis'
  | 'tree-detections'
  | 'hydro-watershed'
  | 'flood-monitoring'
  | 'table-geo-ai'
  | 'spatial'
  | 'aoi'
  | 'charts'
  | 'stats'
  | 'weather'
  | 'raster'
  | 'feature';

export type SatelliteContextDockVariant = 'map' | 'embedded';

export type SatelliteContextualAnalysisDockProps = {
  variant: SatelliteContextDockVariant;
  /** When true, Charts tab shows a shortcut instead of the full chart (e.g. narrow embedded host). */
  chartsCompact?: boolean;
  className?: string;
  mapTool: 'rectangle' | 'polygon' | 'circle' | 'select' | string;
  onMapTool: (tool: 'rectangle' | 'polygon' | 'circle' | 'select') => void;
  hasClearableDrawing?: boolean;
  onClearDrawing?: () => void;
  hasAoi: boolean;
  staticChartsOpen: boolean;
  onToggleStaticCharts: () => void;
  indexLabel?: string;
  staticMultiLineLabels?: string[];
  staticMultiLineDatasets?: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst?: boolean;
  staticChartExportLngLatPerRow?: AoiStaticExportLngLat[];
  layerLiveStatsLayerGroups?: RemoteSensingLayerSelectGroup[];
  layerLiveStatsLayers?: LayerLiveStatsLayerId[];
  onLayerLiveStatsLayersChange?: (ids: LayerLiveStatsLayerId[]) => void;
  primaryLayerId?: string;
  weeklyMeans?: number[];
  pivotBars?: Array<{ name: string; value: number }>;
  sparkPathBuilder?: (values: number[], w: number, h: number) => string;
  /** Map toolbox: opens the same processing stack as Satellite Intelligence (no reload). */
  onProcessingWorkflowNavigate?: (sectionId: SmartProcessingSectionId, meta?: { fromDockOptions?: boolean }) => void;
  /** When true, the dock panel body hosts the floating Processing Options UI (portal target). */
  processingDropdownOpen?: boolean;
  /**
   * Active section inside the portaled Processing Options (matches parent `expandedEnvSection`).
   * Keeps toolbox header and rail highlight aligned with RS / AI — not stuck on Layers.
   */
  processingEmbedSection?:
    | 'source'
    | 'layers'
    | 'remote-sensing'
    | 'crop-alerts'
    | 'crop-classification'
    | 'ai-detection-gis'
    | 'tree-detections'
    | 'hydro-watershed'
    | 'flood-monitoring'
    | 'table-geo-ai'
    | null;
  /** Called with the embed host element whenever the map panel mounts/updates; null when unmounted. */
  onMapToolboxEmbedHost?: (el: HTMLDivElement | null) => void;
  /** Close the floating processing dropdown (e.g. when the toolbox panel closes). */
  onToolboxPanelClose?: () => void;
  /** Layers tool → Main tab: Added layers list (same as Processing Options). */
  mapToolboxLayersMain?: ReactNode;
  /** Map toolbox Layers → Options tab: advanced tools (e.g. popup configuration). */
  mapToolboxLayersOptionsExtra?: ReactNode;
  /** Geo AI floating widget visibility — keeps rail highlight without opening the processing stack. */
  geoAiFloatingOpen?: boolean;
  /** Toggle Geo AI floating widget from the map toolbox rail (same button as highlight). */
  onGeoAiFloatingRailToggle?: () => void;
  /** Map toolbox + → Add GIS layer source actions (URL, file, sketch, media). */
  onMapToolboxAddGisLayerAction?: (action: MapToolboxAddGisLayerAction) => void;
  /** When set, the + button opens the full Add GIS Layer modal (GIS Map parity) instead of the flyout. */
  onMapToolboxAddGisLayerPrimaryClick?: () => void;
  /** Browse layers panel body (GIS Content portal table). */
  mapToolboxBrowseLayersPanel?: ReactNode;
  /** Layer Live NDVI legend (Main toolbox panel). */
  mapToolboxLayerLiveLegend?: ReactNode;
  /** Layer Live legend pinned on map (right float). */
  layerLiveLegendOpen?: boolean;
  onLayerLiveLegendOpenChange?: (open: boolean) => void;
  /** Main toolbox: Edit/draw activation toggle for the system drawing tool. */
  mapToolboxDrawingActive?: boolean;
  /** Toggle the system drawing tool from the Main toolbox Edit button. */
  onMapToolboxToggleDrawing?: () => void;
  /** Main toolbox: active measurement mode or null when off. */
  measureMode?: string | null;
  /** Open the unified measurement panel from the Main toolbox Measure button. */
  onMeasureOpenPanel?: () => void;
  /** Turn measurement off / clear the current measurement. */
  onMeasureClear?: () => void;
};

const RAIL: Array<{ id: SatelliteContextPanelId; icon: string; label: string; title: string; hint: string }> = [
  {
    id: 'layers',
    icon: 'fa-solid fa-layer-group',
    label: 'Layers',
    title: 'Layer settings',
    hint: 'Opacity, ordering, and imagery context while mapping.',
  },
  {
    id: 'remote-sensing',
    icon: 'fa-solid fa-satellite-dish',
    label: 'Remote sensing',
    title: 'Remote sensing',
    hint: 'Indices, WMS layers, timeline, and AOI tools.',
  },
  {
    id: 'crop-alerts',
    icon: 'fa-solid fa-wheat-awn-circle-exclamation',
    label: 'Crop alerts',
    title: 'Agro Sentinel Alert Engine',
    hint: 'Real-time NDVI/NDWI/NDMI monitoring for Farm Plots & PIVOT.',
  },
  {
    id: 'crop-classification',
    icon: 'fa-solid fa-wheat-awn',
    label: 'Crop AI',
    title: 'Prithvi Crop Classification',
    hint: 'AOI → Sentinel/HLS → Prithvi inference → classified map.',
  },
  {
    id: 'layer-live-legend',
    icon: 'fa-solid fa-swatchbook',
    label: 'Legend',
    title: 'Layer Live legend',
    hint: 'Color keys for every Sentinel Live layer (indices, composites, SAR, SCL).',
  },
  {
    id: 'ai-detection-gis',
    icon: 'fa-solid fa-magnifying-glass-location',
    label: 'AI Detection in GIS',
    title: 'AI Detection in GIS',
    hint: 'Map-aware detection and inspect workflows.',
  },
  {
    id: 'tree-detections',
    icon: 'fa-solid fa-tree',
    label: 'Tree Detections',
    title: 'Tree Detections',
    hint: 'AOI → auto-detect & classify tree crowns from VHR imagery.',
  },
  {
    id: 'hydro-watershed',
    icon: 'fa-solid fa-mountain-sun',
    label: 'Hydro Watershed',
    title: 'Hydro Watershed Workflow',
    hint: 'AOI → DEM, flow, streams, watershed & mesh for distributed hydrology.',
  },
  {
    id: 'flood-monitoring',
    icon: 'fa-solid fa-house-flood-water',
    label: 'Flood (SAR)',
    title: 'Flood Monitoring (SAR-Based)',
    hint: 'AOI → Sentinel-1 SAR change detection → flood extent, boundaries & stats.',
  },
  {
    id: 'table-geo-ai',
    icon: 'fa-solid fa-comments',
    label: 'Geo AI',
    title: 'Geo AI',
    hint: 'Copilot, attributes, and SQL-style prompts.',
  },
  {
    id: 'spatial',
    icon: 'fa-solid fa-vector-square',
    label: 'Analysis',
    title: 'Spatial analysis',
    hint: 'Zonal summaries and AOI-scoped workflows.',
  },
  {
    id: 'aoi',
    icon: 'fa-solid fa-draw-polygon',
    label: 'AOI sketch',
    title: 'AOI drawing tools',
    hint: 'Rectangle, polygon, circle, select, and clear.',
  },
  {
    id: 'charts',
    icon: 'fa-solid fa-chart-column',
    label: 'Charts',
    title: 'Charts',
    hint: 'Timeline charts and comparison indices.',
  },
  {
    id: 'stats',
    icon: 'fa-solid fa-chart-pie',
    label: 'Statistics',
    title: 'Statistics',
    hint: 'Sparkline, bars, and mix summaries for the AOI.',
  },
  {
    id: 'weather',
    icon: 'fa-solid fa-cloud-sun',
    label: 'Weather',
    title: 'Weather data',
    hint: 'Forecasts and context near the map or AOI.',
  },
  {
    id: 'raster',
    icon: 'fa-solid fa-image',
    label: 'Imagery',
    title: 'Raster controls',
    hint: 'Dates, WMS layer, and playback in Remote Sensing.',
  },
  {
    id: 'feature',
    icon: 'fa-solid fa-circle-info',
    label: 'Feature info',
    title: 'Feature information',
    hint: 'Identify results and attribute tables.',
  },
];

const RAIL_GROUPS: SatelliteContextPanelId[][] = [
  ['layers', 'spatial', 'aoi'],
  ['charts', 'stats', 'weather'],
  ['raster', 'feature'],
];

/** In-map toolbox: Main (layers + STAC + RS) and Options (AI GIS + Geo AI). */
const RAIL_MAP_TOOLBOX_IDS = new Set<SatelliteContextPanelId>([
  'layers',
  'add-gis-layer',
  'remote-sensing',
  'crop-alerts',
  'crop-classification',
  'layer-live-legend',
  'ai-detection-gis',
  'tree-detections',
  'hydro-watershed',
  'flood-monitoring',
  'table-geo-ai',
]);

/** Rail tools that open the floating processing stack instead of the docked panel. */
const MAP_RAIL_FLOAT_IDS = new Set<SatelliteContextPanelId>([
  'remote-sensing',
  'crop-alerts',
  'crop-classification',
  'ai-detection-gis',
  'tree-detections',
  'hydro-watershed',
  'flood-monitoring',
]);

const RAIL_GROUPS_MAP: SatelliteContextPanelId[][] = [
  ['layers', 'remote-sensing', 'crop-alerts', 'crop-classification', 'layer-live-legend', 'hydro-watershed'],
  ['ai-detection-gis', 'tree-detections', 'flood-monitoring', 'table-geo-ai'],
];

const RAIL_BY_ID = RAIL.reduce(
  (acc, r) => {
    acc[r.id] = r
    return acc
  },
  {} as Record<SatelliteContextPanelId, (typeof RAIL)[number]>,
)

function defaultSparkPath(values: number[], w: number, h: number): string {
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

export function SatelliteContextualAnalysisDock(props: SatelliteContextualAnalysisDockProps) {
  const { direction } = useLanguage();
  const {
    variant,
    className = '',
    mapTool,
    onMapTool,
    hasClearableDrawing = false,
    onClearDrawing,
    hasAoi,
    staticChartsOpen,
    onToggleStaticCharts,
    chartsCompact = false,
    indexLabel = '',
    staticMultiLineLabels = [],
    staticMultiLineDatasets = [],
    staticMultiLineHasLst = false,
    staticChartExportLngLatPerRow,
    layerLiveStatsLayerGroups = [],
    layerLiveStatsLayers = [],
    onLayerLiveStatsLayersChange,
    primaryLayerId,
    weeklyMeans = [],
    pivotBars = [],
    sparkPathBuilder = defaultSparkPath,
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
    layerLiveLegendOpen = false,
    onLayerLiveLegendOpenChange,
    mapToolboxDrawingActive = false,
    onMapToolboxToggleDrawing,
    measureMode = null,
    onMeasureOpenPanel,
  } = props;

  const { scopedStorageKey } = useSiInstanceScope();
  const panelWidthMin = 260;
  const panelWidthDefault = 300;
  const lsSurface = scopedStorageKey('si-sat-ctx-surface');
  const lsPanelW = scopedStorageKey('si-sat-ctx-panel-w');
  const lsRailLabeled = scopedStorageKey('si-sat-ctx-rail-labeled');
  const lsMapStripHidden = scopedStorageKey('si-sat-map-ctx-strip-hidden');
  const lsMapRailLabeled = scopedStorageKey('si-sat-map-ctx-rail-labeled');

  const [addGisFlyoutOpen, setAddGisFlyoutOpen] = useState(false);
  // Capture all pointer/touch/wheel events on the dock so they never pan, zoom,
  // or click the map canvas beneath it. The map-variant dock is portaled INSIDE
  // the Mapbox canvas container (see MapToolsDock), so React synthetic handlers
  // alone fire too late — `native` adds DOM listeners that stop the gesture
  // before it reaches Mapbox's own pan/zoom handlers.
  const panelIsolationProps = useMapOverlayIsolation(true, { native: variant === 'map' });

  const [panelOpen, setPanelOpen] = useState(false);
  const [activeId, setActiveId] = useState<SatelliteContextPanelId | null>(null);
  const [surface, setSurface] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem(lsSurface) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [panelWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem(lsPanelW));
      if (Number.isFinite(n) && n >= panelWidthMin && n <= 560) return n;
    } catch {
      /* ignore */
    }
    return variant === 'embedded'
      ? Math.min(panelWidthDefault, typeof window !== 'undefined' ? window.innerWidth - 48 : panelWidthDefault)
      : panelWidthDefault;
  });
  const [innerTab, setInnerTab] = useState<string>('main');
  const [railLabeled, setRailLabeled] = useState(() => {
    try {
      const stored = localStorage.getItem(lsRailLabeled)
      if (stored === null) return false
      return stored !== '0'
    } catch {
      return false
    }
  });
  /** Map variant: hide entire toolbox to map edge (reopen tab). */
  const [mapStripHidden, setMapStripHidden] = useState(() => {
    try {
      return localStorage.getItem(lsMapStripHidden) === '1';
    } catch {
      return false;
    }
  });
  /** Map variant: expanded rail shows labels + wide targets; collapsed = icons + tooltips (ArcGIS-style). */
  const [mapRailLabeled, setMapRailLabeled] = useState(() => {
    try {
      const stored = localStorage.getItem(lsMapRailLabeled)
      if (stored === null) return false
      return stored === '1'
    } catch {
      return false
    }
  });
  const lastActiveRef = useRef<SatelliteContextPanelId>('layers');
  /** When minimizing the map toolbox strip, remember label mode so restoring the strip does not reset it. */
  const mapRailLabeledBeforeStripHideRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (layerLiveLegendOpen) return
    if (activeId === 'layer-live-legend') {
      setActiveId(null)
    }
  }, [layerLiveLegendOpen, activeId])

  useEffect(() => {
    try {
      localStorage.setItem(lsSurface, surface);
    } catch {
      /* ignore */
    }
  }, [surface]);

  /** Keep map toolbox surface aligned with global app theme (light → white glass). */
  useEffect(() => {
    const syncSurfaceFromAppTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme === 'light') setSurface('light');
      else if (theme === 'dark') setSurface('dark');
    };
    syncSurfaceFromAppTheme();
    const observer = new MutationObserver(syncSurfaceFromAppTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(lsPanelW, String(panelWidth));
    } catch {
      /* ignore */
    }
  }, [panelWidth]);

  useEffect(() => {
    if (variant === 'map') return;
    try {
      localStorage.setItem(lsRailLabeled, railLabeled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [railLabeled, variant]);

  useEffect(() => {
    if (variant !== 'map') return;
    try {
      localStorage.setItem(lsMapStripHidden, mapStripHidden ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [mapStripHidden, variant]);

  useEffect(() => {
    if (variant !== 'map') return;
    try {
      localStorage.setItem(lsMapRailLabeled, mapRailLabeled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [mapRailLabeled, variant]);

  const isMapVariant = variant === 'map';
  const railMenuGroups = useMemo(
    () => (isMapVariant ? RAIL_GROUPS_MAP : RAIL_GROUPS),
    [isMapVariant],
  );

  useEffect(() => {
    if (!isMapVariant) return;
    if (activeId && !RAIL_MAP_TOOLBOX_IDS.has(activeId)) {
      setPanelOpen(false);
      setActiveId(null);
    }
  }, [isMapVariant, activeId]);

  useEffect(() => {
    if (!isMapVariant) return;
    if (processingDropdownOpen) return;
    if (activeId && MAP_RAIL_FLOAT_IDS.has(activeId)) {
      setPanelOpen(false);
      setActiveId(null);
    }
  }, [processingDropdownOpen, activeId, isMapVariant]);

  const openPanel = useCallback(
    (id: SatelliteContextPanelId) => {
      lastActiveRef.current = id;
      setActiveId(id);
      setPanelOpen(true);
      setInnerTab('main');
    },
    [],
  );

  const toggleRail = useCallback(
    (id: SatelliteContextPanelId) => {
      if (isMapVariant && id === 'layer-live-legend') {
        const next = !layerLiveLegendOpen;
        onLayerLiveLegendOpenChange?.(next);
        /* Legend floats alone — never close the dock / processing stack (primary panel stays on the rail). */
        if (next && processingDropdownOpen && !panelOpen) {
          const section = processingEmbedSection;
          if (
            section &&
            section !== 'source' &&
            section !== 'table-geo-ai' &&
            RAIL_MAP_TOOLBOX_IDS.has(section as SatelliteContextPanelId)
          ) {
            setActiveId(section as SatelliteContextPanelId);
          }
          setPanelOpen(true);
        }
        return;
      }
      if (isMapVariant && id === 'table-geo-ai') {
        onGeoAiFloatingRailToggle?.();
        return;
      }
      if (isMapVariant && MAP_RAIL_FLOAT_IDS.has(id) && onProcessingWorkflowNavigate) {
        if (panelOpen && activeId === id) {
          setPanelOpen(false);
          setActiveId(null);
          onToolboxPanelClose?.();
          return;
        }
        openPanel(id);
        onProcessingWorkflowNavigate(id as SmartProcessingSectionId, undefined);
        return;
      }
      /* Docked-only tools (e.g. Layers): never stack under portaled Processing Options */
      if (panelOpen && activeId === id) {
        setPanelOpen(false);
        if (isMapVariant && processingDropdownOpen) {
          onToolboxPanelClose?.();
        }
        return;
      }
      if (isMapVariant && processingDropdownOpen) {
        onToolboxPanelClose?.();
      }
      openPanel(id);
    },
    [
      activeId,
      isMapVariant,
      onProcessingWorkflowNavigate,
      onToolboxPanelClose,
      onGeoAiFloatingRailToggle,
      layerLiveLegendOpen,
      onLayerLiveLegendOpenChange,
      openPanel,
      panelOpen,
      processingDropdownOpen,
      processingEmbedSection,
    ],
  );

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    if (isMapVariant) {
      onMapToolboxEmbedHost?.(null);
      onToolboxPanelClose?.();
    }
  }, [isMapVariant, onMapToolboxEmbedHost, onToolboxPanelClose]);

  const mapToolboxEmbedHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      onMapToolboxEmbedHost?.(node);
    },
    [onMapToolboxEmbedHost],
  );

  const activeMeta =
    activeId === 'add-gis-layer'
      ? {
          id: 'add-gis-layer' as const,
          icon: 'fa-solid fa-circle-plus',
          label: 'Add GIS Layer',
          title: 'Browse layers',
          hint: 'Add layers from GIS Content and other sources.',
        }
      : activeId
        ? RAIL.find(r => r.id === activeId)
        : null;
  /** Section title for map toolbox dock chrome only (portaled panel hides its own header to avoid duplicates). */
  const processingEmbedTitle = useMemo(() => {
    if (!processingEmbedSection) return null;
    if (processingEmbedSection === 'source') return 'Source catalog';
    const row = RAIL_BY_ID[processingEmbedSection as SatelliteContextPanelId];
    if (row) return row.label;
    return 'Processing';
  }, [processingEmbedSection]);
  const maxPivot = pivotBars.length ? Math.max(...pivotBars.map(p => Math.abs(p.value))) : 1;

  const handleAddGisLayerAction = useCallback(
    (action: MapToolboxAddGisLayerAction) => {
      if (action === 'browse') {
        if (onMapToolboxAddGisLayerPrimaryClick) {
          setAddGisFlyoutOpen(false);
          onMapToolboxAddGisLayerPrimaryClick();
          return;
        }
        if (processingDropdownOpen) onToolboxPanelClose?.();
        openPanel('add-gis-layer');
        return;
      }
      onMapToolboxAddGisLayerAction?.(action);
    },
    [
      onMapToolboxAddGisLayerAction,
      onMapToolboxAddGisLayerPrimaryClick,
      onToolboxPanelClose,
      openPanel,
      processingDropdownOpen,
    ],
  );
  const isMap = isMapVariant;
  const mapPanelCollapsed = isMap && mapStripHidden;
  const panelLayoutOpen = panelOpen && !mapPanelCollapsed;
  const railWide = isMap ? !mapStripHidden && mapRailLabeled : railLabeled;

  const rootClass = [
    'si-sat-ctx-dock',
    isMap ? 'si-sat-ctx-dock--map si-sat-ctx-dock--map-tall si-sat-ctx-dock--map-toolbox si-sat-ctx-dock--compact' : 'si-sat-ctx-dock--embedded',
    mapPanelCollapsed ? 'si-sat-ctx-dock--map-strip-minimized' : '',
    panelLayoutOpen ? 'si-sat-ctx-dock--open' : 'si-sat-ctx-dock--closed',
    surface === 'light' ? 'si-sat-ctx-dock--light' : 'si-sat-ctx-dock--dark',
    railWide ? 'si-sat-ctx-dock--rail-labeled' : 'si-sat-ctx-dock--rail-narrow',
    className.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  const railHintTitle = (item: (typeof RAIL)[number]) =>
    railWide ? item.title : `${item.title} — ${item.hint}`;

  return (
    <div className={rootClass} role="presentation" dir={direction} {...panelIsolationProps}>
      <nav
        className={'si-sat-ctx-rail' + (railWide ? ' si-sat-ctx-rail--labeled' : '')}
        aria-label={isMap ? 'Map toolbox' : 'Analysis contextual tools'}
        data-toolbox-density={isMap ? (railWide ? 'labels' : 'icons') : undefined}
      >
        {isMap ? (
          <div
            className={
              'si-sat-ctx-rail-brand' +
              (railWide && !mapStripHidden ? ' si-sat-ctx-rail-brand--open' : '') +
              (mapStripHidden ? ' si-sat-ctx-rail-brand--minimized' : '')
            }
          >
            <span className="si-sat-ctx-rail-brand__mark" aria-hidden>
              <i className="fa-solid fa-toolbox" />
            </span>
            {railWide && !mapStripHidden ? (
              <span className="si-sat-ctx-rail-brand__title">Map toolbox</span>
            ) : null}
          </div>
        ) : null}
        {isMap && !mapStripHidden ? (
          <div className="si-sat-ctx-rail-add-gis-wrap">
            <button
              id="map-toolbox-add-gis-layer-btn"
              type="button"
              className={
                'si-sat-ctx-rail-btn si-sat-ctx-rail-btn--map si-sat-ctx-rail-btn--add-gis' +
                (isMap && railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : '') +
                (isMap && !railWide ? ' si-sat-ctx-rail-btn--map-collapsed' : '') +
                (addGisFlyoutOpen || activeId === 'add-gis-layer' ? ' si-sat-ctx-rail-btn--active' : '')
              }
              title="Add GIS Layer"
              aria-label="Add GIS Layer"
              aria-haspopup={onMapToolboxAddGisLayerPrimaryClick ? undefined : 'menu'}
              aria-expanded={onMapToolboxAddGisLayerPrimaryClick ? undefined : addGisFlyoutOpen}
              onClick={() => {
                if (onMapToolboxAddGisLayerPrimaryClick) {
                  setAddGisFlyoutOpen(false);
                  onMapToolboxAddGisLayerPrimaryClick();
                  return;
                }
                setAddGisFlyoutOpen(v => !v);
              }}
            >
              <i className="fa-solid fa-circle-plus" aria-hidden />
              {railWide ? (
                <span className="si-sat-ctx-rail-label" aria-hidden={!railWide}>
                  <span className="si-sat-ctx-rail-label-title">Add layer</span>
                  <span className="si-sat-ctx-rail-label-desc">Browse, URL, file, sketch</span>
                </span>
              ) : null}
            </button>
            {!onMapToolboxAddGisLayerPrimaryClick ? (
              <MapToolboxAddGisLayerFlyout
                open={addGisFlyoutOpen}
                onClose={() => setAddGisFlyoutOpen(false)}
                onSelect={handleAddGisLayerAction}
              />
            ) : null}
          </div>
        ) : null}
        {isMap && !mapStripHidden && onMapToolboxToggleDrawing ? (
          <button
            type="button"
            className={
              'si-sat-ctx-rail-btn si-sat-ctx-rail-btn--map si-sat-ctx-rail-btn--edit-activation' +
              (railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : ' si-sat-ctx-rail-btn--map-collapsed') +
              (mapToolboxDrawingActive ? ' si-sat-ctx-rail-btn--active' : '')
            }
            title={mapToolboxDrawingActive ? 'Drawing tool on — click to turn off' : 'Edit — activate drawing tool'}
            aria-label={mapToolboxDrawingActive ? 'Drawing tool on' : 'Edit — activate drawing tool'}
            aria-pressed={mapToolboxDrawingActive}
            onClick={() => onMapToolboxToggleDrawing()}
          >
            <i className="fa-solid fa-pen-to-square" aria-hidden />
            {railWide ? (
              <span className="si-sat-ctx-rail-label">
                <span className="si-sat-ctx-rail-label-title">Edit</span>
                <span className="si-sat-ctx-rail-label-desc">Activate drawing tool</span>
              </span>
            ) : null}
          </button>
        ) : null}
        {isMap && !mapStripHidden && onMeasureOpenPanel ? (
          <button
            id="map-toolbox-measure-btn"
            type="button"
            className={
              'si-sat-ctx-rail-btn si-sat-ctx-rail-btn--map si-sat-ctx-rail-btn--measure' +
              (railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : ' si-sat-ctx-rail-btn--map-collapsed') +
              (measureMode ? ' si-sat-ctx-rail-btn--active' : '')
            }
            title={measureMode ? 'Measurement tools on' : 'Measure — distance, area, terrain'}
            aria-label="Measurement tools"
            aria-pressed={!!measureMode}
            onClick={() => onMeasureOpenPanel()}
          >
            <i className="fa-solid fa-ruler-combined" aria-hidden />
            {railWide ? (
              <span className="si-sat-ctx-rail-label">
                <span className="si-sat-ctx-rail-label-title">Measure</span>
                <span className="si-sat-ctx-rail-label-desc">Distance, area & terrain</span>
              </span>
            ) : null}
          </button>
        ) : null}
        {isMap && !mapStripHidden ? (
          <div className="si-sat-ctx-rail-sep" role="separator" aria-hidden />
        ) : null}
        {railMenuGroups.map((group, gi) => (
          <Fragment key={group.join('-')}>
            {group.map(id => {
              const item = RAIL_BY_ID[id];
              if (!item) return null;
              const railPressed =
                (isMap &&
                  processingDropdownOpen &&
                  processingEmbedSection !== null &&
                  processingEmbedSection === item.id) ||
                (item.id === 'table-geo-ai' && geoAiFloatingOpen) ||
                (item.id === 'layer-live-legend' && layerLiveLegendOpen) ||
                (activeId === item.id &&
                  (MAP_RAIL_FLOAT_IDS.has(item.id) ? !panelOpen : panelOpen));
              return (
                <button
                  key={item.id}
                  type="button"
                  className={
                    'si-sat-ctx-rail-btn' +
                    (isMap ? ' si-sat-ctx-rail-btn--map' : '') +
                    (isMap && railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : '') +
                    (isMap && !railWide ? ' si-sat-ctx-rail-btn--map-collapsed' : '') +
                    (!isMap && railWide ? ' si-sat-ctx-rail-btn--row' : '') +
                    (railPressed ? ' si-sat-ctx-rail-btn--active' : '')
                  }
                  title={railHintTitle(item)}
                  aria-label={railWide ? item.label : railHintTitle(item)}
                  aria-pressed={railPressed}
                  onClick={() => toggleRail(item.id)}
                >
                  <i className={item.icon} aria-hidden />
                  {isMap ? (
                    <span className="si-sat-ctx-rail-label" aria-hidden={!railWide}>
                      <span className="si-sat-ctx-rail-label-title">{item.label}</span>
                      <span className="si-sat-ctx-rail-label-desc">{item.hint}</span>
                    </span>
                  ) : railWide ? (
                    <span className="si-sat-ctx-rail-label">
                      <span className="si-sat-ctx-rail-label-title">{item.label}</span>
                      <span className="si-sat-ctx-rail-label-desc">{item.hint}</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
            {gi < railMenuGroups.length - 1 ? (
              <div className="si-sat-ctx-rail-sep" role="separator" aria-hidden />
            ) : null}
          </Fragment>
        ))}
        <div className="si-sat-ctx-rail-spacer" aria-hidden />
        {isMap ? (
          <button
            type="button"
            className="si-sat-ctx-rail-strip-hide"
            title={mapStripHidden ? 'Show toolbox' : 'Hide toolbox'}
            aria-label={mapStripHidden ? 'Show toolbox' : 'Hide toolbox'}
            onClick={() => setMapStripHidden(hidden => !hidden)}
          >
            <i
              className={
                mapStripHidden
                  ? 'fa-solid fa-angles-left'
                  : 'fa-solid fa-angles-right'
              }
              aria-hidden
            />
          </button>
        ) : null}
        {!isMap ? (
          <div className="si-sat-ctx-rail-footer">
            <button
              type="button"
              className={
                'si-sat-ctx-rail-collapse' +
                (railWide ? ' si-sat-ctx-rail-collapse--labeled' : '')
              }
              title={
                railWide
                  ? 'Collapse sidebar, close context panel, and show icons only'
                  : 'Expand sidebar (show labels)'
              }
              aria-label={railWide ? 'Collapse sidebar and close panel' : 'Expand toolbox labels'}
              aria-pressed={railWide}
              onClick={() => {
                if (railWide) {
                  if (panelOpen) closePanel();
                  setRailLabeled(false);
                } else {
                  setRailLabeled(true);
                }
              }}
            >
              <span className="si-sat-ctx-rail-collapse__icon-wrap" aria-hidden>
                <i className={railWide ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left'} />
              </span>
            </button>
          </div>
        ) : null}
      </nav>

      <div
        className="si-sat-ctx-panel-wrap"
        style={panelLayoutOpen ? { width: panelWidth, flexBasis: panelWidth } : { width: 0, flexBasis: 0 }}
        aria-hidden={!panelLayoutOpen}
      >
        <aside
          className={
            'si-sat-ctx-panel' +
            (isMap && panelOpen && processingDropdownOpen ? ' si-sat-ctx-panel--processing-embed-mode' : '')
          }
          role="complementary"
          aria-label={
            isMap && processingDropdownOpen && processingEmbedTitle
              ? `${processingEmbedTitle} panel`
              : activeMeta
                ? `${activeMeta.title} panel`
                : 'Context panel'
          }
        >
          {panelOpen && activeId ? (
            <>
              <header className="si-sat-ctx-panel-header">
                <div className="si-sat-ctx-panel-header-text">
                  {isMap && processingDropdownOpen && processingEmbedTitle ? (
                    <h2 className="si-sat-ctx-panel-title si-sat-ctx-panel-title--toolbox-embed-root">
                      {processingEmbedTitle}
                    </h2>
                  ) : (
                    <>
                      <span className="si-sat-ctx-panel-kicker">
                        {!isMap ? 'Analysis tools' : 'Context'}
                      </span>
                      <h2 className="si-sat-ctx-panel-title">{activeMeta?.title ?? 'Panel'}</h2>
                    </>
                  )}
                </div>
                <div className="si-sat-ctx-panel-header-actions">
                  <button
                    type="button"
                    className="si-sat-ctx-icon-btn"
                    title={surface === 'dark' ? 'Light surface' : 'Dark surface'}
                    aria-label="Toggle panel theme"
                    onClick={() => setSurface(s => (s === 'dark' ? 'light' : 'dark'))}
                  >
                    <i className={`fa-solid ${surface === 'dark' ? 'fa-sun' : 'fa-moon'}`} aria-hidden />
                  </button>
                  <button type="button" className="si-sat-ctx-icon-btn" title="Close" aria-label="Close panel" onClick={closePanel}>
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
              </header>

              {isMap && processingDropdownOpen ? (
                <div
                  ref={mapToolboxEmbedHostRef}
                  className="si-sat-ctx-map-toolbox-host"
                  data-si-map-toolbox-portal=""
                />
              ) : (
                <>
                  <div className="si-sat-ctx-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={innerTab === 'main'}
                      className={'si-sat-ctx-tab' + (innerTab === 'main' ? ' si-sat-ctx-tab--on' : '')}
                      onClick={() => setInnerTab('main')}
                    >
                      Main
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={innerTab === 'options'}
                      className={'si-sat-ctx-tab' + (innerTab === 'options' ? ' si-sat-ctx-tab--on' : '')}
                      onClick={() => setInnerTab('options')}
                    >
                      Options
                    </button>
                  </div>

                  <div
                    className={
                      'si-sat-ctx-panel-body' +
                      (!isMap ? ' si-sat-ctx-panel-body--embedded-analysis' : '')
                    }
                    data-agrocloud-map-wheel-scroll=""
                  >
                    {!isMap ? (
                      <nav className="si-sat-ctx-analysis-launcher" aria-label="Contextual analysis tools">
                        {RAIL.map(item => {
                          /* Embedded dock: no portaled float stack — active follows panel + selection */
                          const launcherPressed = activeId === item.id && panelOpen;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={
                                'si-sat-ctx-analysis-launcher-btn' +
                                (launcherPressed ? ' si-sat-ctx-analysis-launcher-btn--active' : '')
                              }
                              title={railHintTitle(item)}
                              aria-label={railWide ? item.label : railHintTitle(item)}
                              aria-pressed={launcherPressed}
                              onClick={() => toggleRail(item.id)}
                            >
                              <i className={item.icon} aria-hidden />
                              <span className="si-sat-ctx-analysis-launcher-label">{item.label}</span>
                            </button>
                          );
                        })}
                      </nav>
                    ) : null}
                    <div className="si-sat-ctx-panel-body-core">
                {innerTab === 'main' ? (
                  <>
                    {activeId === 'layers' && mapToolboxLayersMain}
                    {activeId === 'add-gis-layer' && mapToolboxBrowseLayersPanel}
                    {activeId === 'layer-live-legend' && !isMap && mapToolboxLayerLiveLegend}
                    {activeId === 'spatial' && (
                      <div className="si-sat-ctx-prose">
                        <p>
                          <strong>Spatial analysis</strong> runs on the committed AOI and selected imagery window (timeline).
                        </p>
                        <p className="si-sat-ctx-muted">Raster zonal summaries and STAC workflows stay aligned with the current map extent.</p>
                      </div>
                    )}
                    {activeId === 'aoi' && (
                      <div className="si-sat-ctx-aoi-tools">
                        <p className="si-sat-ctx-muted">
                          AOI sketching lives in <strong>Remote Sensing → Drawing tools</strong> so it stays isolated from
                          layers and other analyses.
                        </p>
                        <button
                          type="button"
                          className="si-sat-ctx-primary-btn"
                          onClick={() => onMapTool('polygon')}
                        >
                          Open Remote Sensing drawing
                        </button>
                        {hasAoi ? (
                          <p className="si-sat-ctx-muted">An AOI is committed on the map.</p>
                        ) : null}
                        <button
                          type="button"
                          className="si-sat-ctx-aoi-btn si-sat-ctx-aoi-btn--danger"
                          disabled={!hasClearableDrawing}
                          title="Clear AOI sketch only — analysis layers stay visible"
                          onClick={() => onClearDrawing?.()}
                        >
                          <i className="fa-solid fa-eraser" aria-hidden />
                          <span>Clear drawing</span>
                        </button>
                      </div>
                    )}
                    {activeId === 'charts' &&
                      (chartsCompact ? (
                        <div className="si-sat-ctx-prose">
                          <p>
                            <strong>Charts</strong> open on the map for full multi-layer timelines and exports.
                          </p>
                          <button type="button" className="si-sat-ctx-primary-btn" onClick={() => onToggleStaticCharts()}>
                            {staticChartsOpen ? 'Hide map charts' : 'Show map charts'}
                          </button>
                        </div>
                      ) : (
                        <div className="si-sat-ctx-charts-block">
                          <p className="si-sat-ctx-muted">
                            {indexLabel} · AOI-scoped timeline. Primary map layer unchanged; add comparison layers below.
                          </p>
                          <LayerLiveStatsLayerDropdown
                            groups={layerLiveStatsLayerGroups}
                            selectedIds={layerLiveStatsLayers}
                            onSelectedIdsChange={onLayerLiveStatsLayersChange ?? (() => {})}
                            primaryLayerId={primaryLayerId}
                            aria-label="Layer Live statistical analysis layers"
                          />
                          <AoiStaticMultiLayerLineChart
                            title="Raster mean in AOI by week"
                            labels={staticMultiLineLabels}
                            datasets={staticMultiLineDatasets}
                            hasLst={staticMultiLineHasLst}
                            exportLngLatPerRow={staticChartExportLngLatPerRow}
                          />
                        </div>
                      ))}
                    {activeId === 'stats' && (
                      <div className="si-sat-ctx-stats">
                        <div className="si-map-analysis-chart-card">
                          <div className="si-map-analysis-chart-kicker">Time series (spark)</div>
                          <svg className="si-map-analysis-spark" viewBox="0 0 120 40" preserveAspectRatio="none">
                            <path
                              className="si-map-analysis-spark-path"
                              d={sparkPathBuilder(weeklyMeans.length ? weeklyMeans : [0], 120, 40)}
                              fill="none"
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>
                        </div>
                        <div className="si-map-analysis-chart-card">
                          <div className="si-map-analysis-chart-kicker">Fields (bar)</div>
                          <div className="si-map-analysis-bars">
                            {pivotBars.slice(0, 8).map(row => (
                              <div key={row.name} className="si-map-analysis-bar-row">
                                <span className="si-map-analysis-bar-name">{row.name}</span>
                                <div className="si-map-analysis-bar-track">
                                  <span
                                    className="si-map-analysis-bar-fill"
                                    style={{ width: `${Math.min(100, (Math.abs(row.value) / maxPivot) * 100)}%` }}
                                  />
                                </div>
                                <span className="si-map-analysis-bar-val">{row.value.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="si-map-analysis-chart-card si-map-analysis-chart-card--pie">
                          <div className="si-map-analysis-chart-kicker">Mix (pie)</div>
                          <div className="si-map-analysis-pie-wrap">
                            {pivotBars.slice(0, 6).map((row, i, arr) => {
                              const sum = arr.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
                              const pct = (Math.abs(row.value) / sum) * 100;
                              const hue = 140 + i * 28;
                              return (
                                <div key={row.name} className="si-map-analysis-pie-seg">
                                  <span className="si-map-analysis-pie-dot" style={{ background: `hsl(${hue} 65% 46%)` }} />
                                  <span className="si-map-analysis-pie-lbl">{row.name}</span>
                                  <span className="si-map-analysis-pie-pct">{pct.toFixed(0)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                    {activeId === 'weather' && (
                      <div className="si-sat-ctx-prose">
                        <p>
                          <strong>Weather data</strong> is attached to Geo AI context when API keys are configured (OpenWeather).
                        </p>
                        <p className="si-sat-ctx-muted">Use Geo AI prompts for forecasts near the map pin or AOI centroid.</p>
                      </div>
                    )}
                    {activeId === 'raster' && (
                      <div className="si-sat-ctx-prose">
                        <p>
                          <strong>Raster controls</strong> — imagery date, WMS layer, and timeline playback live in Remote Sensing
                          and the bottom timeline bar.
                        </p>
                      </div>
                    )}
                    {activeId === 'feature' && (
                      <div className="si-sat-ctx-prose">
                        <p>
                          <strong>Feature information</strong> appears when you identify a vector feature or use Geo AI table map
                          links.
                        </p>
                        <p className="si-sat-ctx-muted">Select a feature on the map or open the attribute table from Layers.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="si-sat-ctx-prose">
                    {activeId === 'layers' && isMap && onProcessingWorkflowNavigate ? (
                      <div className="si-sat-ctx-layers-options-stack">
                        <div className="si-sat-ctx-subnav" role="navigation" aria-label="Layers options navigation">
                          <button
                            type="button"
                            className="si-sat-ctx-subnav-back"
                            onClick={() => setInnerTab('main')}
                            aria-label="Back to Layers main"
                          >
                            <i className="fa-solid fa-arrow-left" aria-hidden />
                            <span>Main</span>
                          </button>
                          <span className="si-sat-ctx-subnav-crumb">Layers · Options</span>
                        </div>
                        {mapToolboxLayersOptionsExtra}
                      </div>
                    ) : null}
                  </div>
                )}
                    </div>
              </div>
                </>
              )}
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
