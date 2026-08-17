import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SymbologyClassMethod, SymbologyColorRamp, SymbologyStyle } from './LayerManager';
import type { ArcgisLayerDefLite } from '../../../lib/arcgisAttributeDisplay';
import {
  arcLegendLabelForFieldValue,
  buildArcFieldsByLower,
  getArcDisplayValue,
} from '../../../lib/arcgisAttributeDisplay';
import {
  buildArcgisUniqueValueLegendItems,
  flattenArcgisUniqueValueInfos,
  pickRendererPrimaryField,
  resolveLayerArcgisDrawingInfo,
} from '../../../lib/arcgisDrawingInfoMapbox';
import {
  clampInt,
  darkenColor,
  getGeoJsonFields,
  getLayerGeometryKind,
  getNumericFields,
  pickPreferredField,
  resolveLayerGeometryKind,
  SI_SYMBOLOGY_MAX_CLASSES,
  SI_SYMBOLOGY_MAX_UNIQUE,
  type SymbologyContext,
} from '../symbologyHelpers';
import {
  SI_COLOR_RAMPS,
  SI_STYLE_PRESET_CHIPS,
  strokeDashSvgFromStyle,
  type SiSymbologyAppearance,
} from '../siSymbolStyleStudio';
import { SiPointSymbolSection } from './SiPointSymbolSection';
import { SiSymbologyClassesTable } from './SiSymbologyClassesTable';
import type { SymbologyClassOverride, SymbologyBreakOverride } from './LayerManager';
import './SiPointSymbolSection.css';
import './SiSymbologyClassesTable.css';
import './SiSymbologyStudioPanel.css';

export type SiSymbologyDraft = {
  useArcGisOnline: boolean;
  style: SymbologyStyle;
  field: string;
  classes: number;
  method: SymbologyClassMethod;
  colorRamp: SymbologyColorRamp;
  threshold: number;
  arcgisMaxCategories: number;
  classOverrides?: Record<string, SymbologyClassOverride>;
  breakOverrides?: SymbologyBreakOverride[];
};

const FIELD_SYMBOLOGY_PRESETS: Array<{
  id: string;
  label: string;
  style: SymbologyStyle;
  preferredFields: string[];
}> = [
  {
    id: 'unique-crop',
    label: 'Unique — crop / class',
    style: 'unique',
    preferredFields: ['Crop Type', 'class_name', 'Structure_Type', 'crop_type'],
  },
  {
    id: 'grad-area',
    label: 'Graduated — area (ha)',
    style: 'color',
    preferredFields: ['area_ha', 'Area_ha', 'Estimated Area (ha)', 'area'],
  },
  {
    id: 'grad-ndvi',
    label: 'Graduated — NDVI',
    style: 'color',
    preferredFields: ['NDVI', 'ndvi', 'Crop Health', 'Vegetation Coverage (%)'],
  },
  {
    id: 'unique-structure',
    label: 'Unique — structure type',
    style: 'unique',
    preferredFields: ['Structure_Type', 'structure_type', 'kind'],
  },
];

type SymbologyLayer = {
  id: string;
  name: string;
  geojson?: GeoJSON.FeatureCollection | null;
  source?: string;
  sourceUrl?: string;
  authToken?: string;
  arcgisDrawingInfo?: unknown;
  arcgisLayerDefinition?: ArcgisLayerDefLite | null;
  color?: string;
};

export type SiSymbologyStudioPanelProps = {
  layer: SymbologyLayer;
  symbologyDraft: SiSymbologyDraft;
  appearance: SiSymbologyAppearance;
  canUseArcGisOnline: boolean;
  symbologyCtx: SymbologyContext | null;
  searchQuery?: string;
  onDraftChange: (patch: Partial<SiSymbologyDraft>) => void;
  onAppearanceChange: (patch: Partial<SiSymbologyAppearance>) => void;
  onReset: () => void;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  onApplyToAllLayers: () => void;
  onSyncDrawColors: () => void;
  onArcgisToggleOn: () => void;
};

type SectionDef = {
  id: string;
  title: string;
  icon: ReactNode;
  keywords: string[];
};

const SECTIONS: SectionDef[] = [
  { id: 'renderer', title: 'Renderer', icon: <RendererIcon />, keywords: ['style', 'arcgis', 'attribute', 'geometry'] },
  { id: 'classification', title: 'Classes', icon: <HistogramIcon />, keywords: ['breaks', 'jenks', 'quantile', 'classes', 'unique', 'graduated'] },
  { id: 'symbols', title: 'Symbol', icon: <BrushIcon />, keywords: ['outline', 'fill', 'stroke', 'size', 'point'] },
  { id: 'color', title: 'Color', icon: <PaletteIcon />, keywords: ['ramp', 'palette', 'hex', 'wheel'] },
  { id: 'transparency', title: 'Transparency', icon: <TransparencyIcon />, keywords: ['opacity', 'alpha'] },
  { id: 'legend', title: 'Legend preview', icon: <LegendIcon />, keywords: ['legend', 'preview'] },
  { id: 'advanced', title: 'Advanced', icon: <SettingsIcon />, keywords: ['template', 'copy', 'paste', 'reset', 'preset'] },
  { id: 'more', title: 'More (coming soon)', icon: <SparklesIcon />, keywords: ['labels', 'scale', 'blend', 'cluster'] },
];

function SectionCard({
  section,
  expanded,
  onToggle,
  children,
}: {
  section: SectionDef;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`si-sym-section${expanded ? ' si-sym-section--open' : ''}`}>
      <button type="button" className="si-sym-section__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="si-sym-section__icon" aria-hidden>
          {section.icon}
        </span>
        <span className="si-sym-section__title">{section.title}</span>
        <svg className="si-sym-section__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d={expanded ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>
      {expanded ? <div className="si-sym-section__body">{children}</div> : null}
    </div>
  );
}

function RendererIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 6h16M4 12h10M4 18h14" />
    </svg>
  );
}
function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="10" r="1.2" fill="currentColor" />
      <circle cx="14" cy="8" r="1.2" fill="currentColor" />
      <circle cx="16" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}
function BrushIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M18 4l2 2-10 10-4 1 1-4 10-10z" />
    </svg>
  );
}
function HistogramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="4" y="12" width="3" height="8" />
      <rect x="10" y="8" width="3" height="12" />
      <rect x="16" y="4" width="3" height="16" />
    </svg>
  );
}
function LabelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    </svg>
  );
}
function SparklesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  );
}
function TransparencyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="4" y="4" width="16" height="16" rx="2" opacity="0.45" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  );
}
function LayersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />
    </svg>
  );
}
function BlendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </svg>
  );
}
function ClusterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="8" cy="8" r="2" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="12" cy="16" r="2" />
    </svg>
  );
}
function LegendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="4" y="5" width="6" height="4" rx="1" />
      <path d="M12 7h8M12 12h8M12 17h8" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function FieldRow({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="si-sym-field">
      <span className="si-sym-field__label">{label}</span>
      {children}
      {hint ? <span className="si-sym-field__hint">{hint}</span> : null}
    </label>
  );
}

function SelectInput({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="si-sym-select">
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        {children}
      </select>
    </div>
  );
}

export function SiSymbologyStudioPanel({
  layer,
  symbologyDraft,
  appearance,
  canUseArcGisOnline,
  symbologyCtx,
  searchQuery = '',
  onDraftChange,
  onAppearanceChange,
  onReset,
  onCopyStyle,
  onPasteStyle,
  onApplyToAllLayers,
  onSyncDrawColors,
  onArcgisToggleOn,
}: SiSymbologyStudioPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ renderer: true });
  const [selectedPointSymbolId, setSelectedPointSymbolId] = useState<string | undefined>();

  const toggle = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      s => s.title.toLowerCase().includes(q) || s.keywords.some(k => k.includes(q)),
    );
  }, [q]);

  const resolvedGeom = resolveLayerGeometryKind(layer.geojson, layer.arcgisLayerDefinition);
  const geometryKind =
    resolvedGeom !== 'other'
      ? resolvedGeom
      : symbologyCtx?.geometryKind ?? getLayerGeometryKind(layer.geojson);
  const allFields = getGeoJsonFields(layer.geojson);
  const numericFields = getNumericFields(layer.geojson);
  const isUnique = symbologyDraft.style === 'unique';
  const isGraduated = symbologyDraft.style === 'color' || symbologyDraft.style === 'color_size';
  const isSingle = symbologyDraft.style === 'single';
  const maxClasses = isUnique ? SI_SYMBOLOGY_MAX_UNIQUE : SI_SYMBOLOGY_MAX_CLASSES;
  const classes = clampInt(symbologyDraft.classes, 2, maxClasses);
  const disabled = symbologyDraft.useArcGisOnline;
  const arcDef = layer.arcgisLayerDefinition ?? null;
  const fieldsByLower = buildArcFieldsByLower(arcDef);
  const fieldNm = symbologyDraft.field;

  // Keep Classes + Color open while editing Unique / Graduated so the table is obvious.
  useEffect(() => {
    if (symbologyDraft.useArcGisOnline) return;
    if (!isUnique && !isGraduated) return;
    setExpanded(prev => ({
      ...prev,
      classification: true,
      color: true,
      legend: true,
    }));
  }, [isUnique, isGraduated, symbologyDraft.useArcGisOnline, symbologyDraft.field]);

  const resolvedDrawingInfo = useMemo(() => resolveLayerArcgisDrawingInfo(layer), [layer]);

  const arcgisSubtypeLegend = useMemo(() => {
    if (!symbologyDraft.useArcGisOnline || !resolvedDrawingInfo) return [];
    const items = buildArcgisUniqueValueLegendItems(resolvedDrawingInfo, appearance.opacity);
    const field = pickRendererPrimaryField((resolvedDrawingInfo as any)?.renderer);
    return items.map(it => {
      let label = it.label;
      if (field && arcDef) {
        label =
          arcLegendLabelForFieldValue(field, it.value, arcDef, fieldsByLower) ||
          arcLegendLabelForFieldValue(field, it.label, arcDef, fieldsByLower) ||
          it.label;
      }
      const kind: 'line' | 'point' | 'polygon' =
        geometryKind === 'polygon' ? 'polygon' : geometryKind === 'point' ? 'point' : 'line';
      return {
        label,
        kind,
        color: it.outlineColor,
        width: Math.max(1, it.outlineWidth),
        fill: it.hollow ? 'transparent' : it.fillColor,
      };
    });
  }, [symbologyDraft.useArcGisOnline, resolvedDrawingInfo, appearance.opacity, geometryKind, arcDef, fieldsByLower]);

  const legendItems = useMemo(() => {
    if (symbologyDraft.useArcGisOnline) return arcgisSubtypeLegend;
    const items: Array<{
      label: string;
      kind: 'line' | 'point' | 'polygon';
      color: string;
      width: number;
      dash?: string;
      fill?: string;
    }> = [];
    const ctx = symbologyCtx;
    if (!ctx) return items;
    const baseStroke = appearance.color || layer.color || '#60a5fa';
    const baseWeight = appearance.weight;
    const previewDash = strokeDashSvgFromStyle(appearance.strokeStyle);
    const kind: 'line' | 'point' | 'polygon' =
      geometryKind === 'polygon' ? 'polygon' : geometryKind === 'point' ? 'point' : 'line';
    const layerFeatures = Array.isArray((layer.geojson as any)?.features) ? ((layer.geojson as any).features as any[]) : [];

    const uniqueLegendLabel = (val: string) => {
      if (!fieldNm) return val;
      const rep = layerFeatures.find((f: any) => {
        const r = f?.properties?.[fieldNm];
        if (r === null || r === undefined || r === '') return false;
        return String(r) === val;
      });
      if (rep && arcDef) {
        const raw = rep.properties?.[fieldNm];
        return getArcDisplayValue(rep, fieldNm, raw, arcDef, fieldsByLower, 'description').display || val;
      }
      if (arcDef) return arcLegendLabelForFieldValue(fieldNm, val, arcDef, fieldsByLower);
      return val;
    };

    if (symbologyDraft.style === 'single') {
      items.push({ label: 'Base symbol', kind, color: baseStroke, width: baseWeight, dash: previewDash || undefined, fill: appearance.fillColor });
      return items;
    }
    if (symbologyDraft.style === 'unique') {
      if (kind === 'line') {
        const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.uniqueDashes);
        vals.slice(0, maxClasses).forEach(val => {
          if (symbologyDraft.classOverrides?.[val]?.visible === false) return;
          items.push({ label: uniqueLegendLabel(val), kind, color: baseStroke, width: baseWeight, dash: ctx.uniqueDashes[val] ?? '' });
        });
        if (!vals.length) items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight });
        return items;
      }
      const vals = ctx.categories.length ? ctx.categories : Object.keys(ctx.categoryColors);
      vals.slice(0, maxClasses).forEach(val => {
        if (symbologyDraft.classOverrides?.[val]?.visible === false) return;
        const fill = symbologyDraft.classOverrides?.[val]?.color ?? ctx.categoryColors[val] ?? ctx.otherColor;
        const label = symbologyDraft.classOverrides?.[val]?.label ?? uniqueLegendLabel(val);
        items.push({ label, kind, color: darkenColor(fill, 0.25), width: baseWeight, fill });
      });
      if (!vals.length) items.push({ label: 'No values', kind, color: baseStroke, width: baseWeight, fill: baseStroke });
      return items;
    }
    if (symbologyDraft.style === 'threshold_markers') {
      items.push({ label: 'Base', kind, color: baseStroke, width: baseWeight });
      items.push({ label: `Marker ≥ ${ctx.threshold.toFixed(2)}`, kind: 'point', color: '#ef4444', width: 4, fill: '#ef4444' });
      return items;
    }
    const breaks = ctx.breaks;
    const showColor = symbologyDraft.style === 'color' || symbologyDraft.style === 'color_size' || (isUnique && geometryKind !== 'line');
    const showSize = symbologyDraft.style === 'size' || symbologyDraft.style === 'color_size';
    for (let i = 0; i < Math.min(classes, breaks.length - 1); i += 1) {
      const a = breaks[i];
      const b = breaks[i + 1];
      const label = `${a.toFixed(2)} – ${b.toFixed(2)}`;
      const color = showColor ? ctx.colors[i] ?? baseStroke : baseStroke;
      const width = showSize ? ctx.widths[i] ?? baseWeight : baseWeight;
      const dash = symbologyDraft.style === 'dot_density' ? ctx.dotDashes[i] : undefined;
      if (kind === 'polygon' || kind === 'point') {
        const fill = showColor ? color : baseStroke;
        items.push({ label, kind, color: darkenColor(fill, 0.25), width, dash, fill });
      } else {
        items.push({ label, kind, color, width, dash });
      }
    }
    return items;
  }, [symbologyCtx, arcgisSubtypeLegend, symbologyDraft, appearance, layer, geometryKind, classes, isUnique, fieldNm, arcDef, fieldsByLower, maxClasses]);

  const showColor =
    symbologyDraft.style === 'color' ||
    symbologyDraft.style === 'color_size' ||
    (isUnique && geometryKind !== 'line');
  const showSize = symbologyDraft.style === 'size' || symbologyDraft.style === 'color_size';
  const showMethod = !isSingle && symbologyDraft.style !== 'threshold_markers' && symbologyDraft.style !== 'unique';
  const showClassesTable = isUnique || isGraduated;

  const applyFieldPreset = (preset: (typeof FIELD_SYMBOLOGY_PRESETS)[number]) => {
    const fields = preset.style === 'unique' ? allFields : numericFields.length ? numericFields : allFields;
    const field = pickPreferredField(fields, preset.preferredFields) ?? fields[0] ?? '';
    onDraftChange({
      useArcGisOnline: false,
      style: preset.style,
      field,
      classOverrides: {},
      breakOverrides: [],
    });
  };

  if (!visibleSections.length) {
    return <p className="si-sym-empty">No settings match your search.</p>;
  }

  return (
    <div className="si-sym-studio">
      {visibleSections.map(section => {
        const isOpen = Boolean(expanded[section.id]);
        const body = (() => {
          switch (section.id) {
            case 'renderer':
              return (
                <>
                  <label className="si-sym-check">
                    <input
                      type="checkbox"
                      checked={Boolean(symbologyDraft.useArcGisOnline)}
                      disabled={!canUseArcGisOnline && !symbologyDraft.useArcGisOnline}
                      onChange={e => {
                        if (e.target.checked) onArcgisToggleOn();
                        else onDraftChange({ useArcGisOnline: false });
                      }}
                    />
                    <span>Use Original ArcGIS Online Symbology</span>
                  </label>
                  {!disabled ? (
                    <>
                      <FieldRow label="Geometry type">
                        <div className="si-sym-readonly">{geometryKind === 'polygon' ? 'Polygon' : geometryKind === 'point' ? 'Point' : 'Line'}</div>
                      </FieldRow>
                      <FieldRow label="Renderer">
                        <SelectInput value={symbologyDraft.style} onChange={v => onDraftChange({ style: v as SymbologyStyle })}>
                          <option value="single">Single symbol</option>
                          <option value="unique">Unique values</option>
                          <option value="color">Graduated colors</option>
                          <option value="size">Proportional symbols</option>
                          <option value="color_size">Graduated colors + size</option>
                          <option value="dot_density">Dot density</option>
                          <option value="threshold_markers">Threshold markers</option>
                        </SelectInput>
                      </FieldRow>
                      {!isSingle ? (
                        <FieldRow label={isUnique ? 'Attribute (categorical)' : 'Attribute (numeric)'}>
                          <SelectInput value={symbologyDraft.field} onChange={v => onDraftChange({ field: v })}>
                            {!(isUnique ? allFields : numericFields).length ? (
                              <option value="">{isUnique ? 'No fields' : 'No numeric fields'}</option>
                            ) : null}
                            {(isUnique ? allFields : numericFields).map(f => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </SelectInput>
                        </FieldRow>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <FieldRow label="Geometry type">
                        <div className="si-sym-readonly">{geometryKind === 'polygon' ? 'Polygon' : geometryKind === 'point' ? 'Point' : 'Line'}</div>
                      </FieldRow>
                      <FieldRow label="ArcGIS field">
                        <div className="si-sym-readonly">
                          {pickRendererPrimaryField((resolvedDrawingInfo as any)?.renderer) || 'Structure_Type'}
                        </div>
                      </FieldRow>
                      <p className="si-sym-muted">
                        {flattenArcgisUniqueValueInfos((resolvedDrawingInfo as any)?.renderer).length} subtype
                        {flattenArcgisUniqueValueInfos((resolvedDrawingInfo as any)?.renderer).length === 1 ? '' : 's'} from
                        ArcGIS Online
                      </p>
                    </>
                  )}
                </>
              );
            case 'symbols':
              return (
                <SiPointSymbolSection
                  geometryKind={geometryKind}
                  arcgisLocked={disabled}
                  drawingInfo={resolvedDrawingInfo}
                  appearance={appearance}
                  onAppearanceChange={onAppearanceChange}
                  selectedGalleryId={selectedPointSymbolId}
                  onGallerySelect={item => setSelectedPointSymbolId(item.id)}
                />
              );
            case 'color':
              if (disabled) return <p className="si-sym-muted">Available when custom symbology is enabled.</p>;
              return (
                <>
                  {showColor ? (
                    <FieldRow label="Color ramp">
                      <div className="si-sym-ramp-gallery" role="list">
                        {SI_COLOR_RAMPS.map(ramp => (
                          <button
                            key={ramp.id}
                            type="button"
                            role="listitem"
                            className={`si-sym-ramp${symbologyDraft.colorRamp === ramp.id ? ' si-sym-ramp--active' : ''}`}
                            onClick={() => onDraftChange({ colorRamp: ramp.id as SymbologyColorRamp })}
                            title={ramp.label}
                          >
                            <span className="si-sym-ramp__bar" style={{ background: `linear-gradient(90deg, ${ramp.colors.join(',')})` }} />
                            <span className="si-sym-ramp__name">{ramp.label}</span>
                          </button>
                        ))}
                      </div>
                    </FieldRow>
                  ) : (
                    <p className="si-sym-muted">Select a graduated or unique renderer to edit color ramps.</p>
                  )}
                  <div className="si-sym-grid">
                    <FieldRow label="Outline">
                      <input
                        className="si-sym-color"
                        type="color"
                        value={
                          typeof appearance.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(appearance.color)
                            ? appearance.color
                            : '#000000'
                        }
                        onChange={e => onAppearanceChange({ color: e.target.value })}
                      />
                    </FieldRow>
                    <FieldRow label="Outline HEX">
                      <input className="si-sym-input" value={appearance.color} onChange={e => onAppearanceChange({ color: e.target.value })} />
                    </FieldRow>
                    {geometryKind === 'polygon' ? (
                      <>
                        <FieldRow label="Fill">
                          <input
                            className="si-sym-color"
                            type="color"
                            value={
                              typeof appearance.fillColor === 'string' &&
                              /^#[0-9A-Fa-f]{6}$/.test(appearance.fillColor)
                                ? appearance.fillColor
                                : '#000000'
                            }
                            onChange={e => onAppearanceChange({ fillColor: e.target.value })}
                          />
                        </FieldRow>
                        <FieldRow label="Fill HEX">
                          <input
                            className="si-sym-input"
                            value={appearance.fillColor}
                            onChange={e => onAppearanceChange({ fillColor: e.target.value })}
                          />
                        </FieldRow>
                        <FieldRow
                          label={`Fill transparency (${Math.round((1 - (Number.isFinite(appearance.polygonFillAlpha) ? appearance.polygonFillAlpha : 0)) * 100)}%)`}
                        >
                          <input
                            className="si-sym-range"
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(
                              (1 - (Number.isFinite(appearance.polygonFillAlpha) ? appearance.polygonFillAlpha : 0)) *
                                100,
                            )}
                            onChange={e =>
                              onAppearanceChange({
                                polygonFillAlpha: Math.max(0, Math.min(1, 1 - Number(e.target.value) / 100)),
                              })
                            }
                          />
                        </FieldRow>
                      </>
                    ) : (
                      <FieldRow label="Fill HEX">
                        <input
                          className="si-sym-input"
                          value={appearance.fillColor}
                          onChange={e => onAppearanceChange({ fillColor: e.target.value })}
                        />
                      </FieldRow>
                    )}
                  </div>
                </>
              );
            case 'classification':
              if (disabled) return <p className="si-sym-muted">Available when custom symbology is enabled.</p>;
              return (
                <>
                  <div className="si-sym-grid">
                    {showMethod ? (
                      <FieldRow label="Method">
                        <SelectInput value={symbologyDraft.method} onChange={v => onDraftChange({ method: v as SymbologyClassMethod })}>
                          <option value="jenks">Natural breaks (Jenks)</option>
                          <option value="quantile">Quantile</option>
                          <option value="equal_interval">Equal interval</option>
                        </SelectInput>
                      </FieldRow>
                    ) : null}
                    {!isSingle ? (
                      <FieldRow label={isUnique ? 'Max categories' : 'Classes'}>
                        <SelectInput value={String(classes)} onChange={v => onDraftChange({ classes: parseInt(v, 10) })}>
                          {Array.from({ length: maxClasses - 1 }, (_, i) => i + 2).map(n => (
                            <option key={n} value={String(n)}>
                              {n}
                            </option>
                          ))}
                        </SelectInput>
                      </FieldRow>
                    ) : null}
                    {symbologyDraft.style === 'threshold_markers' ? (
                      <FieldRow label="Threshold">
                        <input
                          className="si-sym-input"
                          type="number"
                          value={Number.isFinite(symbologyDraft.threshold) ? String(symbologyDraft.threshold) : ''}
                          onChange={e => onDraftChange({ threshold: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
                        />
                      </FieldRow>
                    ) : null}
                  </div>
                  {showClassesTable ? (
                    <SiSymbologyClassesTable
                      mode={isUnique ? 'unique' : 'graduated'}
                      symbologyCtx={symbologyCtx}
                      classOverrides={symbologyDraft.classOverrides}
                      breakOverrides={symbologyDraft.breakOverrides}
                      onClassOverrideChange={(valueKey, patch) =>
                        onDraftChange({
                          classOverrides: {
                            ...(symbologyDraft.classOverrides ?? {}),
                            [valueKey]: { ...(symbologyDraft.classOverrides?.[valueKey] ?? {}), ...patch },
                          },
                        })
                      }
                      onBreakOverrideChange={(index, patch) => {
                        const prev = [...(symbologyDraft.breakOverrides ?? [])];
                        while (prev.length <= index) prev.push({ min: 0, max: 0 });
                        prev[index] = { ...prev[index], ...patch };
                        onDraftChange({ breakOverrides: prev });
                      }}
                    />
                  ) : (
                    <p className="si-sym-muted">Choose Unique values or Graduated colors to edit per-class symbols.</p>
                  )}
                  {legendItems.length > 0 ? (
                    <div className="si-sym-histogram">
                      {legendItems.map((it, i) => (
                        <div key={i} className="si-sym-histogram__bar" style={{ flex: 1, background: it.fill || it.color, opacity: 0.85 }} title={it.label} />
                      ))}
                    </div>
                  ) : null}
                </>
              );
            case 'more':
              return (
                <p className="si-sym-muted">
                  Labels, scale range, blend modes, and feature reduction are planned. Use Labels from the layer
                  options menu for field labeling today.
                </p>
              );
            case 'labels':
            case 'effects':
            case 'scale':
            case 'blend':
            case 'reduction':
              return null;
            case 'transparency':
              if (disabled) return <p className="si-sym-muted">Available when custom symbology is enabled.</p>;
              return (
                <>
                  <FieldRow label={`Layer opacity (${Math.round(appearance.opacity * 100)}%)`}>
                    <input className="si-sym-range" type="range" min={5} max={100} value={Math.round(appearance.opacity * 100)} onChange={e => onAppearanceChange({ opacity: Number(e.target.value) / 100 })} />
                  </FieldRow>
                  <FieldRow label={`Polygon fill (${Math.round(appearance.polygonFillAlpha * 100)}%)`}>
                    <input className="si-sym-range" type="range" min={0} max={100} value={Math.round(appearance.polygonFillAlpha * 100)} onChange={e => onAppearanceChange({ polygonFillAlpha: Number(e.target.value) / 100 })} />
                  </FieldRow>
                </>
              );
            case 'legend':
              return (
                <div className="si-sym-legend">
                  {legendItems.length ? (
                    legendItems.map((it, idx) => (
                      <div key={idx} className="si-sym-legend__row">
                        <svg width="56" height="14" viewBox="0 0 56 14" aria-hidden>
                          {it.kind === 'line' ? (
                            <line x1="4" y1="7" x2="52" y2="7" stroke={it.color} strokeWidth={it.width} strokeDasharray={it.dash || undefined} />
                          ) : it.kind === 'polygon' ? (
                            <rect x="14" y="2" width="28" height="10" rx={Math.min(8, appearance.previewCornerRadius)} fill={it.fill || it.color} stroke={it.color} strokeWidth="2" />
                          ) : (
                            <circle cx="28" cy="7" r="5" fill={it.fill || it.color} stroke={it.color} strokeWidth="2" />
                          )}
                        </svg>
                        <span>{it.label}</span>
                      </div>
                    ))
                  ) : (
                    <p className="si-sym-muted">Legend updates as you configure the renderer.</p>
                  )}
                </div>
              );
            case 'advanced':
              return (
                <>
                  <div className="si-sym-presets" role="list">
                    {FIELD_SYMBOLOGY_PRESETS.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="si-sym-preset"
                        role="listitem"
                        onClick={() => applyFieldPreset(p)}
                        disabled={disabled}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="si-sym-toolbar">
                    <button type="button" className="si-sym-btn" onClick={onReset} disabled={disabled}>
                      Reset
                    </button>
                    <button type="button" className="si-sym-btn" onClick={onCopyStyle} disabled={disabled}>
                      Copy
                    </button>
                    <button type="button" className="si-sym-btn" onClick={onPasteStyle} disabled={disabled}>
                      Paste
                    </button>
                  </div>
                  <div className="si-sym-presets" role="list">
                    {SI_STYLE_PRESET_CHIPS.map(p => (
                      <button key={p.id} type="button" className="si-sym-preset" role="listitem" onClick={() => onAppearanceChange({ ...p.patch })} disabled={disabled}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="si-sym-toolbar">
                    <button type="button" className="si-sym-btn" onClick={onApplyToAllLayers} disabled={disabled}>
                      Apply to all layers
                    </button>
                    <button type="button" className="si-sym-btn" onClick={onSyncDrawColors} disabled={disabled}>
                      Sync draw colors
                    </button>
                  </div>
                </>
              );
            default:
              return null;
          }
        })();

        return (
          <SectionCard key={section.id} section={section} expanded={isOpen} onToggle={() => toggle(section.id)}>
            {body}
          </SectionCard>
        );
      })}
    </div>
  );
}
