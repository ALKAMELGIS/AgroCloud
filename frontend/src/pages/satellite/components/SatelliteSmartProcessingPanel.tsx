import { useMemo, useState } from 'react';

export type SatelliteProcessingEnvSection =
  | 'layers'
  | 'remote-sensing'
  | 'ai-detection-gis'
  | 'table-geo-ai';

export type SatelliteSmartProcessingPanelProps = {
  /** Short hint for dynamic tools (layer name, index, etc.) */
  layerContextHint?: string;
  layerKind?: 'raster' | 'vector' | 'none';
  onOpenEnvSection: (id: SatelliteProcessingEnvSection) => void;
  /** Prefill Geo AI / Gemini input and open Geo AI section */
  onGeoAiQuickPrompt?: (text: string) => void;
};

type CatId = 'selection' | 'query' | 'analysis' | 'geometry' | 'quick';

const CATS: Array<{ id: CatId; label: string; icon: string }> = [
  { id: 'selection', label: 'Selection', icon: 'fa-solid fa-object-group' },
  { id: 'query', label: 'Query', icon: 'fa-solid fa-database' },
  { id: 'analysis', label: 'Analysis', icon: 'fa-solid fa-chart-area' },
  { id: 'geometry', label: 'Geometry', icon: 'fa-solid fa-draw-polygon' },
  { id: 'quick', label: 'Quick actions', icon: 'fa-solid fa-bolt' },
];

export function SatelliteSmartProcessingPanel(props: SatelliteSmartProcessingPanelProps) {
  const { layerContextHint, layerKind = 'none', onOpenEnvSection, onGeoAiQuickPrompt } = props;
  const [openCat, setOpenCat] = useState<CatId>('quick');

  const dynamicNote = useMemo(() => {
    if (layerKind === 'vector') return 'Vector layer context — selection & attribute tools are available.';
    if (layerKind === 'raster') return 'Raster / imagery context — zonal stats and AI summaries use the current AOI.';
    return 'Pick a layer in Layers to unlock context-sensitive shortcuts.';
  }, [layerKind]);

  const runPrompt = (text: string) => {
    if (onGeoAiQuickPrompt) onGeoAiQuickPrompt(text);
    else onOpenEnvSection('table-geo-ai');
  };

  return (
    <div className="si-sat-smart-proc">
      <div className="si-sat-smart-proc__hero">
        <div className="si-sat-smart-proc__hero-k">GIS workflow</div>
        <h3 className="si-sat-smart-proc__hero-title">Smart processing</h3>
        <p className="si-sat-smart-proc__hero-desc">
          Map-connected actions update charts and Geo AI context immediately — no page reload.
        </p>
        {layerContextHint ? (
          <p className="si-sat-smart-proc__ctx" title={layerContextHint}>
            <i className="fa-solid fa-layer-group" aria-hidden /> {layerContextHint}
          </p>
        ) : null}
        <p className="si-sat-smart-proc__dyn">{dynamicNote}</p>
      </div>

      <div className="si-sat-smart-proc__cats" role="tablist" aria-label="Processing categories">
        {CATS.map(c => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={openCat === c.id}
            className={'si-sat-smart-proc__cat' + (openCat === c.id ? ' si-sat-smart-proc__cat--on' : '')}
            onClick={() => setOpenCat(c.id)}
          >
            <i className={c.icon} aria-hidden />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <div className="si-sat-smart-proc__body" role="tabpanel">
        {openCat === 'selection' && (
          <ul className="si-sat-smart-proc__actions">
            <li>
              <button type="button" className="si-sat-smart-proc__btn" onClick={() => runPrompt('Select by attributes: filter visible vector features with a SQL WHERE clause and highlight results on the map.')}>
                <i className="fa-solid fa-table-list" aria-hidden />
                <span>
                  <strong>Select by attributes</strong>
                  <small>SQL-style WHERE on attributes</small>
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="si-sat-smart-proc__btn" onClick={() => runPrompt('Select by location: select features that intersect or are completely within the current AOI polygon.')}>
                <i className="fa-solid fa-location-crosshairs" aria-hidden />
                <span>
                  <strong>Select by location</strong>
                  <small>Within / intersects AOI</small>
                </span>
              </button>
            </li>
          </ul>
        )}

        {openCat === 'query' && (
          <ul className="si-sat-smart-proc__actions">
            <li>
              <button type="button" className="si-sat-smart-proc__btn" onClick={() => runPrompt('Open SQL query builder: describe the fields I need and build a WHERE clause for the active vector layer.')}>
                <i className="fa-solid fa-code" aria-hidden />
                <span>
                  <strong>SQL query builder</strong>
                  <small>Natural language → WHERE</small>
                </span>
              </button>
            </li>
          </ul>
        )}

        {openCat === 'analysis' && (
          <ul className="si-sat-smart-proc__actions">
            <li>
              <button type="button" className="si-sat-smart-proc__btn" onClick={() => runPrompt('Spatial analysis: summarize raster values inside the committed AOI for the active timeline window.')}>
                <i className="fa-solid fa-vector-square" aria-hidden />
                <span>
                  <strong>Spatial analysis</strong>
                  <small>Zonal stats & AOI scope</small>
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="si-sat-smart-proc__btn" onClick={() => runPrompt('AI processing: interpret the current map view and AOI, suggest next remote-sensing steps.')}>
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
                <span>
                  <strong>AI processing</strong>
                  <small>AI Agent reasoning on map context</small>
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="si-sat-smart-proc__btn" onClick={() => onOpenEnvSection('remote-sensing')}>
                <i className="fa-solid fa-satellite" aria-hidden />
                <span>
                  <strong>Remote sensing</strong>
                  <small>Indices, templates, timeline</small>
                </span>
              </button>
            </li>
          </ul>
        )}

        {openCat === 'geometry' && (
          <ul className="si-sat-smart-proc__actions">
            <li>
              <button type="button" className="si-sat-smart-proc__btn" onClick={() => onOpenEnvSection('layers')}>
                <i className="fa-solid fa-pen-ruler" aria-hidden />
                <span>
                  <strong>Geometry tools</strong>
                  <small>Layers & sketch context</small>
                </span>
              </button>
            </li>
            <li>
              <p className="si-sat-smart-proc__hint">
                Use the <strong>AOI sketch</strong> tool on the rail for rectangle, polygon, circle, and select — drawing updates stats and Geo AI without reload.
              </p>
            </li>
          </ul>
        )}

        {openCat === 'quick' && (
          <ul className="si-sat-smart-proc__actions">
            <li>
              <button type="button" className="si-sat-smart-proc__btn si-sat-smart-proc__btn--accent" onClick={() => onOpenEnvSection('layers')}>
                <i className="fa-solid fa-layer-group" aria-hidden />
                <span>
                  <strong>Layers & processing</strong>
                  <small>Full processing hub</small>
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="si-sat-smart-proc__btn" onClick={() => onOpenEnvSection('table-geo-ai')}>
                <i className="fa-solid fa-sparkles" aria-hidden />
                <span>
                  <strong>AI Agent</strong>
                  <small>Chat, map links, popups</small>
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="si-sat-smart-proc__btn" onClick={() => onOpenEnvSection('ai-detection-gis')}>
                <i className="fa-solid fa-magnifying-glass-location" aria-hidden />
                <span>
                  <strong>AI detection in GIS</strong>
                  <small>Vision-assisted map tasks</small>
                </span>
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
