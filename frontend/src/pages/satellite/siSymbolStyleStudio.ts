/**
 * Satellite Intelligence — vector symbol appearance + Mapbox paint helpers
 * (aligned with GisMap / LayerManager field names for persistence).
 */
import type { SymbologyConfig, SymbologyStyle } from './components/LayerManager';
import {
  buildSymbologyContext,
  darkenColor,
  getLayerGeometryKind,
  normalizeSymbologyForLayer,
} from './symbologyHelpers';
import { sanitizeMapboxPaint } from '../../lib/mapboxPaintSanitize';

export const SI_MAPBOX_STYLE_CLIPBOARD_LS = 'agri-si-style-clipboard-v1';
export const SI_MAPBOX_STYLE_STUDIO_PREFS_LS = 'agri-si-style-studio-prefs-v1';

export type SiStrokeStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot';
export type SiFillStyle = 'solid' | 'pattern' | 'hatch' | 'gradient';
export type SiBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export type SiLayerAppearancePersisted = {
  color: string;
  fillColor: string;
  weight: number;
  opacity: number;
  strokeStyle: SiStrokeStyle;
  polygonFillAlpha: number;
  pointRadius: number;
  fillStyle: SiFillStyle;
  blendMode: SiBlendMode;
};

export type SiSymbologyAppearance = SiLayerAppearancePersisted & { previewCornerRadius: number };

export type SiStudioSectionState = {
  visualization: boolean;
  appearance: boolean;
  templates: boolean;
};

/** Default vector layer style for all newly added map layers (GIS professional outline). */
export const SI_DEFAULT_VECTOR_OUTLINE_COLOR = '#000000';
export const SI_DEFAULT_VECTOR_LINE_WEIGHT = 1.75;
export const SI_DEFAULT_VECTOR_POLYGON_FILL_ALPHA = 0;

export function siDefaultNewVectorLayerFields(): {
  color: string;
  fillColor: string;
  weight: number;
  polygonFillAlpha: number;
  strokeStyle: SiStrokeStyle;
  fillStyle: SiFillStyle;
} {
  return {
    color: SI_DEFAULT_VECTOR_OUTLINE_COLOR,
    fillColor: SI_DEFAULT_VECTOR_OUTLINE_COLOR,
    weight: SI_DEFAULT_VECTOR_LINE_WEIGHT,
    polygonFillAlpha: SI_DEFAULT_VECTOR_POLYGON_FILL_ALPHA,
    strokeStyle: 'solid',
    fillStyle: 'solid',
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const defaultSiSymbologyAppearance = (): SiSymbologyAppearance => ({
  color: SI_DEFAULT_VECTOR_OUTLINE_COLOR,
  fillColor: SI_DEFAULT_VECTOR_OUTLINE_COLOR,
  weight: SI_DEFAULT_VECTOR_LINE_WEIGHT,
  opacity: 1,
  strokeStyle: 'solid',
  polygonFillAlpha: SI_DEFAULT_VECTOR_POLYGON_FILL_ALPHA,
  pointRadius: 6,
  fillStyle: 'solid',
  blendMode: 'normal',
  previewCornerRadius: 8,
});

export function appearanceFromSiCustomLayerFields(layer: {
  color?: string;
  fillColor?: string;
  weight?: number;
  mapOpacity?: number;
  strokeStyle?: string;
  polygonFillAlpha?: number;
  pointRadius?: number;
  fillStyle?: string;
  blendMode?: string;
}): SiSymbologyAppearance {
  const mo =
    typeof layer.mapOpacity === 'number' && Number.isFinite(layer.mapOpacity)
      ? clamp01(layer.mapOpacity)
      : 1;
  const ss = layer.strokeStyle;
  const strokeStyle: SiStrokeStyle =
    ss === 'dashed' || ss === 'dotted' || ss === 'dashdot' || ss === 'solid' ? ss : 'solid';
  const fs = layer.fillStyle;
  const fillStyle: SiFillStyle =
    fs === 'pattern' || fs === 'hatch' || fs === 'gradient' || fs === 'solid' ? fs : 'solid';
  const bm = layer.blendMode;
  const blendMode: SiBlendMode =
    bm === 'multiply' || bm === 'screen' || bm === 'overlay' || bm === 'darken' || bm === 'lighten' || bm === 'normal'
      ? bm
      : 'normal';
  const pfa =
    typeof layer.polygonFillAlpha === 'number' && Number.isFinite(layer.polygonFillAlpha)
      ? clamp01(layer.polygonFillAlpha)
      : SI_DEFAULT_VECTOR_POLYGON_FILL_ALPHA;
  const pr =
    typeof layer.pointRadius === 'number' && Number.isFinite(layer.pointRadius)
      ? Math.max(3, Math.min(24, layer.pointRadius))
      : 6;
  const w =
    typeof layer.weight === 'number' && Number.isFinite(layer.weight)
      ? Math.max(0.5, Math.min(16, layer.weight))
      : SI_DEFAULT_VECTOR_LINE_WEIGHT;
  return {
    color:
      typeof layer.color === 'string' && layer.color.trim() ? layer.color.trim() : SI_DEFAULT_VECTOR_OUTLINE_COLOR,
    fillColor:
      typeof layer.fillColor === 'string' && layer.fillColor.trim()
        ? layer.fillColor.trim()
        : typeof layer.color === 'string' && layer.color.trim()
          ? layer.color.trim()
          : SI_DEFAULT_VECTOR_OUTLINE_COLOR,
    weight: w,
    opacity: mo,
    strokeStyle,
    polygonFillAlpha: pfa,
    pointRadius: pr,
    fillStyle,
    blendMode,
    previewCornerRadius: 8,
  };
}

export function persistedSiAppearance(a: SiSymbologyAppearance): SiLayerAppearancePersisted {
  const { previewCornerRadius: _p, ...rest } = a;
  return rest;
}

export function mapboxLineDashFromStrokeStyle(style?: SiStrokeStyle): number[] | undefined {
  if (style === 'dashed') return [6, 4]
  if (style === 'dotted') return [2, 5]
  if (style === 'dashdot') return [10, 4, 2, 4]
  return undefined
}

export const SI_STYLE_PRESET_CHIPS: Array<{ id: string; label: string; patch: Partial<SiLayerAppearancePersisted> }> = [
  { id: 'carto', label: 'Carto outline', patch: { strokeStyle: 'solid', weight: 2.5, polygonFillAlpha: 0.28, fillStyle: 'solid', blendMode: 'normal' } },
  { id: 'soft', label: 'Soft fill', patch: { polygonFillAlpha: 0.5, weight: 1, opacity: 0.92, fillStyle: 'solid', blendMode: 'normal' } },
  { id: 'survey', label: 'Survey dashed', patch: { strokeStyle: 'dashed', weight: 2, polygonFillAlpha: 0.22, fillStyle: 'pattern', blendMode: 'normal' } },
  { id: 'bold', label: 'Bold lines', patch: { weight: 5, strokeStyle: 'solid', polygonFillAlpha: 0.4, pointRadius: 10, blendMode: 'normal' } },
  { id: 'multiply', label: 'Multiply blend', patch: { blendMode: 'multiply', polygonFillAlpha: 0.45, fillStyle: 'solid' } },
];

export const SI_COLOR_RAMPS: Array<{ id: string; label: string; colors: string[]; category: 'sequential' | 'diverging' | 'qualitative' }> = [
  { id: 'viridis', label: 'Viridis', category: 'sequential', colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  { id: 'blues', label: 'Blues', category: 'sequential', colors: ['#f7fbff', '#6baed6', '#08519c'] },
  { id: 'greens', label: 'Greens', category: 'sequential', colors: ['#f7fcf5', '#74c476', '#006d2c'] },
  { id: 'plasma', label: 'Plasma', category: 'sequential', colors: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'] },
  { id: 'magma', label: 'Magma', category: 'sequential', colors: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'] },
  { id: 'turbo', label: 'Turbo', category: 'diverging', colors: ['#30123b', '#3b4cc0', '#26a6d1', '#3de07e', '#f9e721', '#f20c0c'] },
];

export function strokeDashSvgFromStyle(style?: SiStrokeStyle): string {
  if (style === 'dashed') return '8 4'
  if (style === 'dotted') return '2 4'
  if (style === 'dashdot') return '12 4 2 4'
  return ''
}

export function fillOpacityFactorForSiFillStyle(fillStyle: SiFillStyle | undefined): number {
  if (fillStyle === 'pattern') return 0.92
  if (fillStyle === 'hatch') return 0.88
  if (fillStyle === 'gradient') return 0.9
  return 1
}

type SiStyleClipboardV1 = { v: 1; appearance: SiLayerAppearancePersisted }

export function readSiStyleClipboard(storageKey = SI_MAPBOX_STYLE_CLIPBOARD_LS): SiLayerAppearancePersisted | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const j = JSON.parse(raw) as SiStyleClipboardV1
    if (!j || j.v !== 1 || !j.appearance || typeof j.appearance !== 'object') return null
    return j.appearance
  } catch {
    return null
  }
}

export function writeSiStyleClipboard(appearance: SiLayerAppearancePersisted, storageKey = SI_MAPBOX_STYLE_CLIPBOARD_LS) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ v: 1, appearance }))
  } catch {
    /* ignore */
  }
}

export function loadSiStudioSectionPrefs(storageKey = SI_MAPBOX_STYLE_STUDIO_PREFS_LS): SiStudioSectionState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const j = JSON.parse(raw) as Partial<SiStudioSectionState>
    if (!j || typeof j !== 'object') return null
    return {
      visualization: Boolean(j.visualization),
      appearance: Boolean(j.appearance),
      templates: Boolean(j.templates),
    }
  } catch {
    return null
  }
}

export function saveSiStudioSectionPrefs(s: SiStudioSectionState, storageKey = SI_MAPBOX_STYLE_STUDIO_PREFS_LS) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const SI_MAPBOX_POLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const SI_MAPBOX_LINE_POLY_FILTER: any = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
];
const SI_MAPBOX_LINE_ONLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const SI_MAPBOX_POINT_FILTER: any = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

function finalizeSiVectorStylePack(pack: SiVectorStylePack): SiVectorStylePack {
  return {
    ...pack,
    fillPaint: sanitizeMapboxPaint(pack.fillPaint),
    linePaint: sanitizeMapboxPaint(pack.linePaint),
    circlePaint: sanitizeMapboxPaint(pack.circlePaint),
  };
}

function matchExprFromCategoryColors(
  field: string,
  categoryColors: Record<string, string>,
  otherColor: string,
  hidden?: Record<string, boolean>,
): any {
  const keys = Object.keys(categoryColors).filter(k => !hidden?.[k])
  const expr: any[] = ['match', ['to-string', ['get', field]]]
  for (const k of keys) {
    expr.push(k, categoryColors[k] ?? otherColor)
  }
  expr.push(otherColor)
  return expr
}

function matchExprFillOpacityFromHidden(field: string, hidden: Record<string, boolean>, baseOpacity: number): any | number {
  const keys = Object.keys(hidden).filter(k => hidden[k])
  if (!keys.length) return baseOpacity
  const expr: any[] = ['match', ['to-string', ['get', field]], ...keys.flatMap(k => [k, 0]), baseOpacity]
  return expr
}

function matchExprLineDashFromUnique(field: string, uniqueDashes: Record<string, string>, fallback: number[]): any {
  const keys = Object.keys(uniqueDashes)
  const expr: any[] = ['match', ['to-string', ['get', field]]]
  for (const k of keys) {
    const raw = uniqueDashes[k] ?? ''
    const parts = raw
      .split(/\s+/)
      .map(s => parseFloat(s))
      .filter(n => Number.isFinite(n))
    expr.push(k, ['literal', parts.length ? parts : fallback])
  }
  expr.push(['literal', fallback])
  return expr
}

export type SiVectorStylePack = {
  fillFilter: any;
  lineFilter: any;
  pointFilter: any;
  fillPaint: Record<string, unknown>;
  linePaint: Record<string, unknown>;
  circlePaint: Record<string, unknown>;
};

/**
 * Mapbox paints for custom (non–ArcGIS drawingInfo) vector layers, including
 * data-driven symbology from `symbology` + base appearance from layer fields.
 */
export function buildSiCustomVectorStylePack(opts: {
  geojson: any;
  source?: string;
  symbology?: SymbologyConfig;
  color?: string;
  fillColor?: string;
  weight?: number;
  strokeStyle?: SiStrokeStyle;
  polygonFillAlpha?: number;
  pointRadius?: number;
  fillStyle?: SiFillStyle;
  canUseArcGisOnline?: boolean;
}): SiVectorStylePack {
  const appearance = appearanceFromSiCustomLayerFields(opts)
  const baseLine = appearance.color
  const baseFill = appearance.fillColor
  const weight = appearance.weight
  const lineDash = mapboxLineDashFromStrokeStyle(appearance.strokeStyle)
  const cfg = normalizeSymbologyForLayer(
    opts.geojson,
    opts.source,
    opts.symbology,
    Boolean(opts.canUseArcGisOnline),
  )
  const style = cfg.style as SymbologyStyle
  const dataDrivenColor =
    style === 'unique' ||
    style === 'color' ||
    style === 'color_size' ||
    style === 'dot_density' ||
    style === 'threshold_markers'
  // Outline-only layers (fill alpha 0) stay invisible for graduated/unique fills —
  // raise a sensible default so Symbology Studio changes are visible on the map.
  const fillOpBase =
    (dataDrivenColor && appearance.polygonFillAlpha <= 0.001
      ? 0.45
      : appearance.polygonFillAlpha) * fillOpacityFactorForSiFillStyle(appearance.fillStyle)
  const radius = appearance.pointRadius

  const ctx = buildSymbologyContext(opts.geojson, cfg)
  const geometryKind = getLayerGeometryKind(opts.geojson)
  const field = cfg.field || ''

  const baseLinePaint: Record<string, unknown> = {
    'line-color': baseLine,
    'line-width': weight,
    'line-opacity': 1,
    ...(lineDash ? { 'line-dasharray': lineDash } : {}),
  }

  const baseFillPaint: Record<string, unknown> = {
    'fill-color': baseFill,
    'fill-opacity': fillOpBase,
  }

  const baseCirclePaint: Record<string, unknown> = {
    'circle-radius': radius,
    'circle-color': fillOpBase <= 0 ? 'rgba(0,0,0,0)' : baseFill,
    'circle-opacity': fillOpBase <= 0 ? 0 : 1,
    'circle-stroke-width': Math.max(1, Math.min(4, weight * 0.65)),
    'circle-stroke-color': baseLine,
  }

  const numericFallbackPaint = (): SiVectorStylePack =>
    finalizeSiVectorStylePack({
      fillFilter: SI_MAPBOX_POLY_FILTER,
      lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
      pointFilter: SI_MAPBOX_POINT_FILTER,
      fillPaint: baseFillPaint,
      linePaint: baseLinePaint,
      circlePaint: baseCirclePaint,
    })

  if (style === 'single' || !opts.symbology) {
    return numericFallbackPaint()
  }

  if (opts.symbology?.useArcGisOnline) {
    return numericFallbackPaint()
  }

  if (!field) {
    return numericFallbackPaint()
  }

  if (style === 'unique' && field) {
    if (geometryKind === 'line') {
      const dashExpr =
        Object.keys(ctx.uniqueDashes).length > 0
          ? matchExprLineDashFromUnique(field, ctx.uniqueDashes, lineDash ?? [1, 0])
          : lineDash
            ? lineDash
            : undefined
      return finalizeSiVectorStylePack({
        fillFilter: SI_MAPBOX_POLY_FILTER,
        lineFilter: SI_MAPBOX_LINE_ONLY_FILTER,
        pointFilter: SI_MAPBOX_POINT_FILTER,
        fillPaint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0 },
        linePaint: {
          'line-color': baseLine,
          'line-width': weight,
          ...(dashExpr ? { 'line-dasharray': dashExpr } : {}),
        },
        circlePaint: baseCirclePaint,
      })
    }
    const fillExpr = matchExprFromCategoryColors(field, ctx.categoryColors, ctx.otherColor, ctx.categoryHidden)
    const strokeByCat: Record<string, string> = {}
    for (const k of Object.keys(ctx.categoryColors)) {
      if (ctx.categoryHidden[k]) continue
      strokeByCat[k] = darkenColor(ctx.categoryColors[k] ?? ctx.otherColor, 0.28)
    }
    const strokeExpr = matchExprFromCategoryColors(field, strokeByCat, darkenColor(ctx.otherColor, 0.28), ctx.categoryHidden)
    const fillOpacityExpr = matchExprFillOpacityFromHidden(field, ctx.categoryHidden, fillOpBase)
    return finalizeSiVectorStylePack({
      fillFilter: SI_MAPBOX_POLY_FILTER,
      lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
      pointFilter: SI_MAPBOX_POINT_FILTER,
      fillPaint: {
        'fill-color': fillExpr,
        'fill-opacity': fillOpacityExpr,
      },
      linePaint: {
        'line-color': strokeExpr,
        'line-width': weight,
        ...(lineDash ? { 'line-dasharray': lineDash } : {}),
      },
      circlePaint: {
        'circle-radius': radius,
        'circle-color': fillExpr,
        'circle-opacity': fillOpacityExpr,
        'circle-stroke-width': Math.max(1, Math.min(4, weight * 0.65)),
        'circle-stroke-color': strokeExpr,
      },
    })
  }

  if (
    (style === 'color' ||
      style === 'size' ||
      style === 'color_size' ||
      style === 'dot_density' ||
      style === 'threshold_markers') &&
    field &&
    ctx.breaks.length >= 2
  ) {
    const breaks = ctx.breaks
    const colors = ctx.colors
    const widths = ctx.widths
    const outlineColors = colors.map(c => darkenColor(c ?? baseFill, 0.28))

    const colorStep: any[] = ['step', ['to-number', ['get', field], 0], colors[0] ?? baseFill]
    for (let i = 1; i < breaks.length; i += 1) {
      colorStep.push(breaks[i], colors[Math.min(i, colors.length - 1)] ?? colors[0])
    }

    const lineColorStep: any[] = ['step', ['to-number', ['get', field], 0], outlineColors[0] ?? baseLine]
    for (let i = 1; i < breaks.length; i += 1) {
      lineColorStep.push(breaks[i], outlineColors[Math.min(i, outlineColors.length - 1)] ?? outlineColors[0])
    }

    const widthStep: any[] = ['step', ['to-number', ['get', field], 0], widths[0] ?? weight]
    for (let i = 1; i < breaks.length; i += 1) {
      widthStep.push(breaks[i], widths[Math.min(i, widths.length - 1)] ?? weight)
    }

    const radiusAt = (w: number) => Math.max(4, Math.min(18, 3 + w * 2))
    const radiusStep: any[] = ['step', ['to-number', ['get', field], 0], radiusAt(widths[0] ?? weight)]
    for (let i = 1; i < breaks.length; i += 1) {
      radiusStep.push(breaks[i], radiusAt(widths[Math.min(i, widths.length - 1)] ?? weight))
    }

    const fillC =
      style === 'color' || style === 'color_size' || style === 'dot_density' || style === 'threshold_markers'
        ? colorStep
        : baseFill
    const lineC =
      style === 'color' || style === 'color_size' || style === 'dot_density' || style === 'threshold_markers'
        ? lineColorStep
        : baseLine

    const dotDash =
      style === 'dot_density' && ctx.dotDashes.length
        ? ([
            'step',
            ['to-number', ['get', field], 0],
            ['literal', stringToDashLiteral(ctx.dotDashes[0])],
            ...flatStepDashPairs(breaks, ctx.dotDashes),
          ] as any)
        : lineDash

    const lineW = style === 'size' || style === 'color_size' ? widthStep : weight

    const circleRad =
      style === 'size' || style === 'color_size' || style === 'dot_density' ? radiusStep : radius

    return finalizeSiVectorStylePack({
      fillFilter: SI_MAPBOX_POLY_FILTER,
      lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
      pointFilter: SI_MAPBOX_POINT_FILTER,
      fillPaint: {
        'fill-color': fillC,
        'fill-opacity': fillOpBase,
      },
      linePaint: {
        'line-color': lineC,
        'line-width': lineW,
        ...(dotDash ? { 'line-dasharray': dotDash } : {}),
      },
      circlePaint: {
        'circle-radius': circleRad,
        'circle-color': fillC,
        'circle-stroke-width': Math.max(1, Math.min(4, weight * 0.65)),
        'circle-stroke-color': lineC,
      },
    });
  }

  return numericFallbackPaint()
}

function stringToDashLiteral(s: string): number[] {
  const parts = s
    .trim()
    .split(/\s+/)
    .map(x => parseFloat(x))
    .filter(n => Number.isFinite(n))
  return parts.length ? parts : [2, 2]
}

function flatStepDashPairs(breaks: number[], dashes: string[]): any[] {
  const out: any[] = []
  for (let i = 1; i < breaks.length && i - 1 < dashes.length; i += 1) {
    out.push(breaks[i], ['literal', stringToDashLiteral(dashes[i - 1] ?? dashes[0])])
  }
  return out
}
