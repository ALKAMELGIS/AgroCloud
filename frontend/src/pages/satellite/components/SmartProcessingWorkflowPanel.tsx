import { useMemo, useState } from 'react';

/** Sections that map to the existing environment / Processing Options stack in Satellite Intelligence. */
export type SmartProcessingSectionId =
  | 'layers'
  | 'remote-sensing'
  | 'crop-alerts'
  | 'ai-detection-gis'
  | 'table-geo-ai';

export type SmartProcessingWorkflowPanelProps = {
  /** Short label for current imagery / vector context (optional). */
  activeLayerSummary?: string | null;
  /** Open the full processing UI for a catalog section (no reload). */
  onNavigateSection: (id: SmartProcessingSectionId) => void;
  /**
   * Single Layers hub inside Map Toolbox: primary catalog control, no duplicate “Layers” quick chip,
   * same workflow links as the former quick strip (STAC, RS, AI…).
   */
  layersHubMode?: boolean;
};

type CatKey = 'quick' | 'selection' | 'spatial' | 'ai' | 'geom' | 'edit';

const QUICK_LINKS: Array<{ id: SmartProcessingSectionId; icon: string; label: string }> = [
  { id: 'layers', icon: 'fa-solid fa-layer-group', label: 'Layers' },
  { id: 'remote-sensing', icon: 'fa-solid fa-satellite-dish', label: 'Remote sensing' },
  { id: 'crop-alerts', icon: 'fa-solid fa-wheat-awn-circle-exclamation', label: 'Crop alerts' },
  { id: 'ai-detection-gis', icon: 'fa-solid fa-magnifying-glass-location', label: 'AI Detection in GIS' },
  { id: 'table-geo-ai', icon: 'fa-solid fa-comments', label: 'Geo AI' },
];

const WORKFLOW_ROWS: Array<{
  cat: CatKey;
  title: string;
  subtitle: string;
  tools: Array<{ id: string; icon: string; label: string; hint: string; target: SmartProcessingSectionId }>;
}> = [
  {
    cat: 'selection',
    title: 'Selection & queries',
    subtitle: 'Map-backed selection with Geo AI stats where applicable.',
    tools: [
      {
        id: 'sel-attr',
        icon: 'fa-solid fa-table-list',
        label: 'Select by attributes',
        hint: 'Opens Geo AI / tabular workflows for attribute-driven filters.',
        target: 'table-geo-ai',
      },
      {
        id: 'sel-loc',
        icon: 'fa-solid fa-location-crosshairs',
        label: 'Select by location',
        hint: 'Spatial picks, inspect, and GIS detection context.',
        target: 'ai-detection-gis',
      },
      {
        id: 'sql',
        icon: 'fa-solid fa-code',
        label: 'SQL query builder',
        hint: 'Structured filters via Geo AI (SQL-style WHERE in prompts).',
        target: 'table-geo-ai',
      },
    ],
  },
  {
    cat: 'spatial',
    title: 'Spatial analysis',
    subtitle: 'Raster, zonal, and AOI-scoped processing.',
    tools: [
      {
        id: 'spa',
        icon: 'fa-solid fa-chart-area',
        label: 'Spatial & zonal',
        hint: 'Remote sensing templates, timeline, and AOI tools.',
        target: 'remote-sensing',
      },
      {
        id: 'crop-alerts',
        icon: 'fa-solid fa-wheat-awn-circle-exclamation',
        label: 'Agro Sentinel alerts',
        hint: 'Real-time crop health, water stress, and harvest signals from Sentinel Live.',
        target: 'crop-alerts',
      },
    ],
  },
  {
    cat: 'ai',
    title: 'AI processing',
    subtitle: 'Copilot, tables, and partial refresh without page reload.',
    tools: [
      {
        id: 'ai',
        icon: 'fa-solid fa-robot',
        label: 'Geo AI & copilot',
        hint: 'Natural language and semi-structured geospatial requests.',
        target: 'table-geo-ai',
      },
    ],
  },
  {
    cat: 'geom',
    title: 'Geometry tools',
    subtitle: 'Sketch, measure, and edit on the canvas (draw → commit AOI).',
    tools: [
      {
        id: 'geom',
        icon: 'fa-solid fa-draw-polygon',
        label: 'Draw & measure',
        hint: 'Use Remote Sensing embedded draw tools or Layers for context.',
        target: 'layers',
      },
    ],
  },
  {
    cat: 'edit',
    title: 'Editing & layer actions',
    subtitle: 'Opacity, ordering, identify, and popups.',
    tools: [
      {
        id: 'edit',
        icon: 'fa-solid fa-sliders',
        label: 'Layer actions',
        hint: 'Layers catalog, visibility, and exports.',
        target: 'layers',
      },
    ],
  },
];

export function SmartProcessingWorkflowPanel(props: SmartProcessingWorkflowPanelProps) {
  const { activeLayerSummary, onNavigateSection, layersHubMode = false } = props;
  const [openCat, setOpenCat] = useState<CatKey | null>('quick');

  const layerLine = useMemo(() => {
    const t = typeof activeLayerSummary === 'string' ? activeLayerSummary.trim() : '';
    if (t) return t;
    return layersHubMode
      ? 'Pick imagery or a vector layer in the catalog to drive overlays and analysis.'
      : 'No layer summary — pick imagery or a vector layer in Layers.';
  }, [activeLayerSummary, layersHubMode]);

  const quickLinks = useMemo(
    () => (layersHubMode ? QUICK_LINKS.filter(l => l.id !== 'layers') : QUICK_LINKS),
    [layersHubMode],
  );

  return (
    <div
      className={'si-smart-proc' + (layersHubMode ? ' si-smart-proc--layers-hub' : '')}
      role="region"
      aria-label={layersHubMode ? 'Layers and processing workflows' : 'Smart processing workflow'}
    >
      {layersHubMode ? (
        <button
          type="button"
          className="si-smart-proc__layers-hero"
          onClick={() => onNavigateSection('layers')}
          title="Opacity, ordering, vector tables, and overlay toggles"
        >
          <span className="si-smart-proc__layers-hero-icon" aria-hidden>
            <i className="fa-solid fa-layer-group" />
          </span>
          <span className="si-smart-proc__layers-hero-text">
            <span className="si-smart-proc__layers-hero-title">Layer settings</span>
            <span className="si-smart-proc__layers-hero-desc">
              Opacity, ordering, and imagery context — open the full catalog without leaving the map.
            </span>
          </span>
          <i className="fa-solid fa-arrow-up-right-from-square si-smart-proc__layers-hero-go" aria-hidden />
        </button>
      ) : null}

      <div className="si-smart-proc__context">
        <div className="si-smart-proc__context-kicker">{layersHubMode ? 'Active layer' : 'Active context'}</div>
        <div className="si-smart-proc__context-body">{layerLine}</div>
        <p className="si-smart-proc__context-hint">
          {layersHubMode
            ? 'One toolbox entry for layers: use the hero above for the catalog, or jump to STAC / sensing / AI below. Map interactions stay live — no reload.'
            : 'Tools adapt by layer and data type. Results update in place (no reload). Use the map for click, hover, draw, selection, and popups while a tool runs.'}
        </p>
      </div>

      <div className="si-smart-proc__quick">
        <div className="si-smart-proc__cat-head">
          <button
            type="button"
            className={'si-smart-proc__cat-toggle' + (openCat === 'quick' ? ' si-smart-proc__cat-toggle--on' : '')}
            onClick={() => setOpenCat(c => (c === 'quick' ? null : 'quick'))}
            aria-expanded={openCat === 'quick'}
          >
            <span>{layersHubMode ? 'Linked workflows' : 'Quick processing'}</span>
            <i className={`fa-solid fa-chevron-${openCat === 'quick' ? 'up' : 'down'}`} aria-hidden />
          </button>
        </div>
        {openCat === 'quick' ? (
          <div className="si-smart-proc__chip-grid" role="group" aria-label={layersHubMode ? 'Workflow shortcuts' : 'Quick links'}>
            {quickLinks.map(l => (
              <button
                key={l.id}
                type="button"
                className="si-smart-proc__chip"
                title={l.label}
                onClick={() => onNavigateSection(l.id)}
              >
                <i className={l.icon} aria-hidden />
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="si-smart-proc__cats" role="navigation" aria-label="Workflow categories">
        {WORKFLOW_ROWS.map(block => (
          <section key={block.cat} className="si-smart-proc__cat">
            <button
              type="button"
              className={'si-smart-proc__cat-toggle' + (openCat === block.cat ? ' si-smart-proc__cat-toggle--on' : '')}
              onClick={() => setOpenCat(c => (c === block.cat ? null : block.cat))}
              aria-expanded={openCat === block.cat}
            >
              <span className="si-smart-proc__cat-title">{block.title}</span>
              <i className={`fa-solid fa-chevron-${openCat === block.cat ? 'up' : 'down'}`} aria-hidden />
            </button>
            <p className="si-smart-proc__cat-sub">{block.subtitle}</p>
            {openCat === block.cat ? (
              <div className="si-smart-proc__tool-grid">
                {block.tools.map(t => (
                  <button key={t.id} type="button" className="si-smart-proc__tool" title={t.hint} onClick={() => onNavigateSection(t.target)}>
                    <i className={t.icon} aria-hidden />
                    <span className="si-smart-proc__tool-label">{t.label}</span>
                    <span className="si-smart-proc__tool-hint">{t.hint}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
