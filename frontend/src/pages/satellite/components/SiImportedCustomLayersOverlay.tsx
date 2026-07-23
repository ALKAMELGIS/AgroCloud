/**
 * Declarative Mapbox overlays for imported GIS layers.
 * Imperative addSource/addLayer gets wiped by react-map-gl style diffs;
 * React Source/Layer children are re-applied with the style and stay visible.
 */
import { Source, Layer } from 'react-map-gl/mapbox';
import type { SiCustomLayerBase } from '../../../lib/siCustomLayerFactory';
import { rasterTilesSourceMaxNativeZoom } from '../../../lib/rasterTileZoom';

const POLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const LINE_FILTER: any = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
];
const POINT_FILTER: any = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

export function siSafeCustomOverlayId(value: unknown): string {
  return String(value ?? 'layer')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 80);
}

type OverlayLayer = SiCustomLayerBase & {
  visible?: boolean;
  color?: string;
  fillColor?: string;
  weight?: number;
  polygonFillAlpha?: number;
  pointRadius?: number;
  mapOpacity?: number;
  definitionQueryText?: string;
};

function paintPack(layer: OverlayLayer) {
  const op = typeof layer.mapOpacity === 'number' ? layer.mapOpacity : 1;
  const lineColor = layer.color || '#22c55e';
  const fillColor = layer.fillColor || layer.color || '#22c55e';
  const fillOpacity =
    (typeof layer.polygonFillAlpha === 'number' ? layer.polygonFillAlpha : 0.38) * op;
  const lineWidth = typeof layer.weight === 'number' ? layer.weight : 2.5;
  const radius = typeof layer.pointRadius === 'number' ? layer.pointRadius : 7;
  return {
    fill: {
      'fill-color': fillColor,
      'fill-opacity': fillOpacity,
      'fill-outline-color': lineColor,
    },
    line: {
      'line-color': lineColor,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        2,
        Math.max(1, lineWidth * 0.4),
        12,
        lineWidth,
        18,
        lineWidth * 1.35,
      ],
      'line-opacity': 0.98 * op,
    },
    circle: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        Math.max(3, radius * 0.55),
        14,
        radius,
        18,
        radius * 1.4,
      ],
      'circle-color': fillColor,
      'circle-stroke-color': '#0f172a',
      'circle-stroke-width': 1.6,
      'circle-opacity': 0.98 * op,
      'circle-stroke-opacity': 0.95 * op,
    },
    raster: {
      'raster-opacity': 0.92 * op,
      'raster-fade-duration': 0,
    },
  };
}

type Props = {
  layers: OverlayLayer[];
  /** Layer ids whose polygon fill should be invisible (e.g. under live Sentinel WMS). */
  suppressFillOpacityLayerIds?: ReadonlySet<string> | string[];
};

/**
 * Renders imported custom layers as first-class react-map-gl children so they
 * survive basemap style updates and always draw above the satellite basemap.
 */
export function SiImportedCustomLayersOverlay({ layers, suppressFillOpacityLayerIds }: Props) {
  const suppress =
    suppressFillOpacityLayerIds instanceof Set
      ? suppressFillOpacityLayerIds
      : new Set(suppressFillOpacityLayerIds ?? []);

  return (
    <>
      {layers.map(layer => {
        if (layer.visible === false) return null;
        const sid = siSafeCustomOverlayId(layer.id);
        const paint = paintPack(layer);
        if (suppress.has(String(layer.id))) {
          paint.fill = { ...paint.fill, 'fill-opacity': 0 };
        }
        const visibility = layer.visible === false ? 'none' : 'visible';

        if (layer.arcgisRasterTiles?.tiles?.length) {
          // Cap the source at the service's native zoom so Mapbox over-zooms the
          // last real tiles instead of requesting levels the cache doesn't have
          // (which come back as gray "Map data not yet available" placeholders).
          const maxNativeZoom = rasterTilesSourceMaxNativeZoom(layer.arcgisRasterTiles);
          return (
            <Source
              key={`rax-${sid}`}
              id={sid}
              type="raster"
              tiles={layer.arcgisRasterTiles.tiles}
              tileSize={layer.arcgisRasterTiles.tileSize ?? 256}
              {...(typeof maxNativeZoom === 'number' ? { maxzoom: maxNativeZoom } : {})}
            >
              <Layer
                id={`${sid}-arcgis-raster`}
                type="raster"
                layout={{ visibility }}
                paint={paint.raster as any}
              />
            </Source>
          );
        }

        if (layer.renderMode === 'raster' && layer.raster?.url && layer.raster.coordinates) {
          return (
            <Source
              key={`img-${sid}`}
              id={sid}
              type="image"
              url={layer.raster.url}
              coordinates={layer.raster.coordinates as any}
            >
              <Layer
                id={`${sid}-raster`}
                type="raster"
                layout={{ visibility }}
                paint={paint.raster as any}
              />
            </Source>
          );
        }

        const geojson = layer.geojson;
        if (!geojson || typeof geojson !== 'object') return null;
        const features = Array.isArray((geojson as { features?: unknown[] }).features)
          ? (geojson as { features: unknown[] }).features
          : [];
        // Still mount empty ArcGIS shells so viewport streaming can populate later via parent update.
        if (!features.length && !(layer.viewportStreaming && layer.source === 'arcgis')) return null;

        return (
          <Source key={`vec-${sid}`} id={sid} type="geojson" data={geojson as any}>
            <Layer
              id={`${sid}-fill`}
              type="fill"
              filter={POLY_FILTER}
              layout={{ visibility }}
              paint={paint.fill as any}
            />
            <Layer
              id={`${sid}-line`}
              type="line"
              filter={LINE_FILTER}
              layout={{ visibility }}
              paint={paint.line as any}
            />
            <Layer
              id={`${sid}-circle`}
              type="circle"
              filter={POINT_FILTER}
              layout={{ visibility }}
              paint={paint.circle as any}
            />
          </Source>
        );
      })}
    </>
  );
}

export default SiImportedCustomLayersOverlay;
