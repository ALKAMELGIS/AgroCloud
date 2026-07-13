/**
 * Unified factory for Satellite Intelligence imported GIS layers.
 * Ensures every import path produces a complete layer object with metadata,
 * styling defaults, geometry/CRS hints, and map-opacity controls.
 */
import type { ArcgisLayerDefLite } from './arcgisAttributeDisplay';
import type { ArcGisRasterTilesConfig, ArcGisServiceType, ArcGisVectorTilesConfig } from './arcgisDynamicLayer';
import type { RasterMapCoordinates } from './raster/siRasterMapLayer';
import { getLayerGeometryKind } from '../pages/satellite/symbologyHelpers';
import { siDefaultNewVectorLayerFields } from '../pages/satellite/siSymbolStyleStudio';

export type SiLayerGeometryKind = 'point' | 'line' | 'polygon' | 'raster' | 'mixed' | 'unknown';

export type SiLayerImportMetadata = {
  format?: string;
  crs?: string;
  bytes?: number;
  geometryType?: SiLayerGeometryKind;
  featureCount?: number;
  widthPx?: number;
  heightPx?: number;
  bands?: number;
  sourceUrl?: string;
  importedAt?: string;
};

export type SiCustomLayerBase = {
  id: string;
  name: string;
  geojson: any;
  visible: boolean;
  source?: 'arcgis' | 'upload' | 'api' | 'stac';
  sourceUrl?: string;
  authToken?: string;
  arcgisDrawingInfo?: Record<string, unknown> | null;
  arcgisDrawingInfoService?: Record<string, unknown> | null;
  useArcGisSymbology?: boolean;
  arcgisLayerDefinition?: ArcgisLayerDefLite | null;
  renderMode?: 'vector' | 'raster';
  raster?: { url: string; coordinates: RasterMapCoordinates };
  ephemeral?: boolean;
  importMetadata?: SiLayerImportMetadata;
  bimBlobUrl?: string;
  mapOpacity?: number;
  color?: string;
  fillColor?: string;
  weight?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted' | 'dashdot';
  polygonFillAlpha?: number;
  pointRadius?: number;
  fillStyle?: 'solid' | 'pattern' | 'hatch' | 'gradient';
  arcgisServiceType?: ArcGisServiceType;
  viewportStreaming?: boolean;
  arcgisRasterTiles?: ArcGisRasterTilesConfig;
  arcgisVectorTiles?: ArcGisVectorTilesConfig;
};

function geometryKindFromArcgis(geometryType?: string | null): SiLayerGeometryKind {
  const gt = String(geometryType || '').toLowerCase();
  if (gt.includes('point') || gt.includes('multipoint')) return 'point';
  if (gt.includes('polyline') || gt.includes('line')) return 'line';
  if (gt.includes('polygon')) return 'polygon';
  return 'unknown';
}

/** Detect dominant geometry type from GeoJSON features or ArcGIS service metadata. */
export function detectImportedGeometryKind(
  geojson: any,
  arcgisLayerDefinition?: { geometryType?: string } | null,
  renderMode?: 'vector' | 'raster',
): SiLayerGeometryKind {
  if (renderMode === 'raster') return 'raster';
  const fromFeatures = getLayerGeometryKind(geojson);
  if (fromFeatures !== 'other') return fromFeatures;
  const fromArc = geometryKindFromArcgis(arcgisLayerDefinition?.geometryType);
  if (fromArc !== 'unknown') return fromArc;
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  if (!features.length) return 'unknown';
  const kinds = new Set<string>();
  for (let i = 0; i < Math.min(features.length, 40); i += 1) {
    const t = features[i]?.geometry?.type;
    if (t === 'Point' || t === 'MultiPoint') kinds.add('point');
    else if (t === 'LineString' || t === 'MultiLineString') kinds.add('line');
    else if (t === 'Polygon' || t === 'MultiPolygon') kinds.add('polygon');
  }
  if (kinds.size > 1) return 'mixed';
  if (kinds.has('point')) return 'point';
  if (kinds.has('line')) return 'line';
  if (kinds.has('polygon')) return 'polygon';
  return 'unknown';
}

export function buildSiLayerImportMetadata(input: {
  format?: string;
  crs?: string;
  bytes?: number;
  geojson?: any;
  arcgisLayerDefinition?: { geometryType?: string } | null;
  renderMode?: 'vector' | 'raster';
  featureCount?: number;
  widthPx?: number;
  heightPx?: number;
  bands?: number;
  sourceUrl?: string;
}): SiLayerImportMetadata {
  const featureCount =
    input.featureCount ??
    (Array.isArray(input.geojson?.features) ? input.geojson.features.length : undefined);
  return {
    format: input.format,
    crs: input.crs,
    bytes: input.bytes,
    geometryType: detectImportedGeometryKind(input.geojson, input.arcgisLayerDefinition, input.renderMode),
    featureCount,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    bands: input.bands,
    sourceUrl: input.sourceUrl,
    importedAt: new Date().toISOString(),
  };
}

export function siNewCustomLayerId(prefix = 'custom'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Apply shared defaults every imported layer should carry. */
export function withSiImportedLayerDefaults(
  layer: SiCustomLayerBase,
  opts?: { portalStyle?: boolean; portalColors?: { color: string; fillColor: string; weight: number; polygonFillAlpha: number } },
): SiCustomLayerBase {
  const vectorDefaults = opts?.portalStyle && opts.portalColors
    ? {
        ...siDefaultNewVectorLayerFields(),
        color: opts.portalColors.color,
        fillColor: opts.portalColors.fillColor,
        weight: opts.portalColors.weight,
        polygonFillAlpha: opts.portalColors.polygonFillAlpha,
      }
    : siDefaultNewVectorLayerFields();

  const isRaster = layer.renderMode === 'raster' || layer.importMetadata?.geometryType === 'raster';
  const enrichedMeta = layer.importMetadata
    ? {
        ...layer.importMetadata,
        geometryType:
          layer.importMetadata.geometryType ??
          detectImportedGeometryKind(layer.geojson, layer.arcgisLayerDefinition, layer.renderMode),
      }
    : buildSiLayerImportMetadata({
        geojson: layer.geojson,
        arcgisLayerDefinition: layer.arcgisLayerDefinition,
        renderMode: layer.renderMode,
        format: isRaster ? 'Raster' : 'Vector',
      });

  return {
    mapOpacity: 1,
    pointRadius: 6,
    ...(!isRaster ? vectorDefaults : {}),
    ...layer,
    importMetadata: enrichedMeta,
    visible: layer.visible !== false,
  };
}

export function createSiVectorImportLayer(input: {
  id?: string;
  name: string;
  geojson: any;
  source: 'upload' | 'api' | 'arcgis' | 'stac';
  sourceUrl?: string;
  format?: string;
  crs?: string;
  bytes?: number;
  authToken?: string;
  arcgisDrawingInfo?: Record<string, unknown> | null;
  arcgisDrawingInfoService?: Record<string, unknown> | null;
  useArcGisSymbology?: boolean;
  arcgisLayerDefinition?: ArcgisLayerDefLite | null;
  arcgisServiceType?: ArcGisServiceType;
  viewportStreaming?: boolean;
  portalStyle?: boolean;
  portalColors?: { color: string; fillColor: string; weight: number; polygonFillAlpha: number };
  ephemeral?: boolean;
}): SiCustomLayerBase {
  const featureCount = Array.isArray(input.geojson?.features) ? input.geojson.features.length : 0;
  return withSiImportedLayerDefaults(
    {
      id: input.id ?? siNewCustomLayerId(input.source === 'arcgis' ? 'arcgis' : input.source === 'api' ? 'remote' : 'custom'),
      name: input.name,
      geojson: input.geojson,
      visible: true,
      source: input.source,
      sourceUrl: input.sourceUrl,
      authToken: input.authToken,
      arcgisDrawingInfo: input.arcgisDrawingInfo,
      arcgisDrawingInfoService: input.arcgisDrawingInfoService ?? input.arcgisDrawingInfo ?? null,
      useArcGisSymbology: input.useArcGisSymbology,
      arcgisLayerDefinition: input.arcgisLayerDefinition,
      arcgisServiceType: input.arcgisServiceType,
      viewportStreaming: input.viewportStreaming,
      ephemeral: input.ephemeral,
      importMetadata: buildSiLayerImportMetadata({
        format: input.format ?? 'Vector',
        crs: input.crs,
        bytes: input.bytes,
        geojson: input.geojson,
        arcgisLayerDefinition: input.arcgisLayerDefinition,
        featureCount,
        sourceUrl: input.sourceUrl,
      }),
    },
    { portalStyle: input.portalStyle, portalColors: input.portalColors },
  );
}

export function createSiRasterImportLayer(input: {
  id?: string;
  name: string;
  geojson: any;
  raster: { url: string; coordinates: RasterMapCoordinates };
  source: 'upload' | 'api' | 'arcgis' | 'stac';
  sourceUrl?: string;
  format?: string;
  crs?: string;
  bytes?: number;
  widthPx?: number;
  heightPx?: number;
  bands?: number;
  authToken?: string;
  arcgisServiceType?: ArcGisServiceType;
  arcgisRasterTiles?: ArcGisRasterTilesConfig;
  arcgisVectorTiles?: ArcGisVectorTilesConfig;
  ephemeral?: boolean;
}): SiCustomLayerBase {
  return withSiImportedLayerDefaults({
    id: input.id ?? siNewCustomLayerId('raster'),
    name: input.name,
    geojson: input.geojson,
    visible: true,
    source: input.source,
    sourceUrl: input.sourceUrl,
    authToken: input.authToken,
    renderMode: 'raster',
    raster: input.raster,
    arcgisServiceType: input.arcgisServiceType,
    arcgisRasterTiles: input.arcgisRasterTiles,
    arcgisVectorTiles: input.arcgisVectorTiles,
    ephemeral: input.ephemeral ?? true,
    importMetadata: buildSiLayerImportMetadata({
      format: input.format ?? 'Raster',
      crs: input.crs,
      bytes: input.bytes,
      geojson: input.geojson,
      renderMode: 'raster',
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      bands: input.bands,
      sourceUrl: input.sourceUrl,
    }),
    mapOpacity: 1,
  });
}

export function createSiBimImportLayer(input: {
  id?: string;
  name: string;
  geojson: any;
  bimBlobUrl: string;
  bytes?: number;
}): SiCustomLayerBase {
  return withSiImportedLayerDefaults({
    id: input.id ?? siNewCustomLayerId('bim'),
    name: input.name,
    geojson: input.geojson,
    visible: true,
    source: 'upload',
    ephemeral: true,
    bimBlobUrl: input.bimBlobUrl,
    importMetadata: buildSiLayerImportMetadata({
      format: 'IFC (BIM)',
      geojson: input.geojson,
      bytes: input.bytes,
      geometryType: 'polygon',
    }),
  });
}

export function formatSiLayerMetaSummary(meta?: SiLayerImportMetadata): string {
  if (!meta) return '';
  const parts: string[] = [];
  if (meta.format) parts.push(meta.format);
  if (meta.geometryType && meta.geometryType !== 'unknown') {
    const g =
      meta.geometryType === 'point'
        ? 'Points'
        : meta.geometryType === 'line'
          ? 'Lines'
          : meta.geometryType === 'polygon'
            ? 'Polygons'
            : meta.geometryType === 'raster'
              ? 'Raster'
              : meta.geometryType === 'mixed'
                ? 'Mixed geometry'
                : '';
    if (g) parts.push(g);
  }
  if (meta.crs) parts.push(meta.crs);
  if (typeof meta.featureCount === 'number' && meta.featureCount > 0) {
    parts.push(`${meta.featureCount} feature${meta.featureCount === 1 ? '' : 's'}`);
  }
  if (meta.widthPx && meta.heightPx) parts.push(`${meta.widthPx}×${meta.heightPx}px`);
  return parts.join(' · ');
}
