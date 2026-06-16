/** Pure helpers for map drawing: geometry construction, hit tests, export formats. */

import type { Map as MapboxMap } from 'mapbox-gl';

export interface DrawStyleConfig {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fillOpacity: number;
  pointRadius: number;
}

export function cloneDeep<T>(v: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(v);
    } catch {
      /* non-cloneable values — fall back */
    }
  }
  return JSON.parse(JSON.stringify(v));
}

export function bboxToPolygonFeature(
  lng0: number,
  lat0: number,
  lng1: number,
  lat1: number,
  label = 'Drawn rectangle'
) {
  const minX = Math.min(lng0, lng1);
  const maxX = Math.max(lng0, lng1);
  const minY = Math.min(lat0, lat1);
  const maxY = Math.max(lat0, lat1);
  const coords = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
  return {
    type: 'Feature' as const,
    properties: { label },
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
  };
}

/** Geodesic distance between two WGS84 points (meters). */
export function haversineDistanceMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371008.8;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Snap pointer to nearest candidate vertex within pixel threshold; returns adjusted lng/lat. */
export function snapLngLatToNearestVertex(
  map: MapboxMap,
  lng: number,
  lat: number,
  candidates: [number, number][],
  pxThreshold: number
): { lng: number; lat: number; snapped: boolean } {
  if (!candidates.length || pxThreshold <= 0) return { lng, lat, snapped: false };
  const click: [number, number] = [lng, lat];
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = lngLatPixelDistance(map, click, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best && bestD <= pxThreshold) {
    return { lng: best[0], lat: best[1], snapped: true };
  }
  return { lng, lat, snapped: false };
}

/**
 * Constrain `point` to a ray from `anchor` in lng/lat plane space, snapped to `stepDeg` increments (0 = off).
 * Used for Shift-constrained polygon edges (adequate for typical AOI sizes).
 */
export function snapLngLatToBearingStep(
  anchor: [number, number],
  point: [number, number],
  stepDeg: number,
): [number, number] {
  if (!Number.isFinite(stepDeg) || stepDeg <= 0) return point;
  const [lng0, lat0] = anchor;
  const [lng1, lat1] = point;
  const dx = lng1 - lng0;
  const dy = lat1 - lat0;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-14) return point;
  const bearingDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapped = Math.round(bearingDeg / stepDeg) * stepDeg;
  const rad = (snapped * Math.PI) / 180;
  return [lng0 + dist * Math.cos(rad), lat0 + dist * Math.sin(rad)];
}

/** Pixel hit radius that scales slightly with zoom (easier to grab vertices when zoomed out). */
export function vertexHitThresholdPx(map: MapboxMap, base = 16): number {
  try {
    const z = map.getZoom?.() ?? 10;
    return Math.max(12, Math.min(40, base + (14 - z) * 1.25));
  } catch {
    return base;
  }
}

export function circleFromEdgeFeature(
  centerLng: number,
  centerLat: number,
  edgeLng: number,
  edgeLat: number,
  steps = 96,
  label = 'Drawn circle'
) {
  const latRad = (centerLat * Math.PI) / 180;
  const cosLat = Math.max(0.2, Math.cos(latRad));

  const dLng = edgeLng - centerLng;
  const dLat = edgeLat - centerLat;
  const rDeg = Math.sqrt((dLng * cosLat) ** 2 + dLat ** 2);
  if (rDeg < 1e-8) {
    return bboxToPolygonFeature(centerLng, centerLat, centerLng + 1e-6, centerLat + 1e-6, label);
  }

  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    ring.push([centerLng + (Math.cos(theta) * rDeg) / cosLat, centerLat + Math.sin(theta) * rDeg]);
  }
  return {
    type: 'Feature' as const,
    properties: { label },
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
}

export type CircleCardinal = 'n' | 'e' | 's' | 'w';

export function circleRefineCosLat(centerLat: number): number {
  const latRad = (centerLat * Math.PI) / 180;
  return Math.max(0.2, Math.cos(latRad));
}

/** Radius in "degree space" matching {@link circleFromEdgeFeature} (scaled Δlng). */
export function circleRefineRDeg(center: [number, number], edge: [number, number]): number {
  const cosLat = circleRefineCosLat(center[1]);
  const dLng = edge[0] - center[0];
  const dLat = edge[1] - center[1];
  return Math.sqrt((dLng * cosLat) ** 2 + dLat ** 2);
}

export function circleRefineCardinalLngLat(
  center: [number, number],
  rDeg: number,
  cosLat: number,
  cardinal: CircleCardinal,
): [number, number] {
  const [clng, clat] = center;
  const theta =
    cardinal === 'e' ? 0 : cardinal === 'n' ? Math.PI / 2 : cardinal === 'w' ? Math.PI : -Math.PI / 2;
  return [clng + (Math.cos(theta) * rDeg) / cosLat, clat + Math.sin(theta) * rDeg];
}

/** Project pointer onto the cardinal ray from center so the circle edge stays N/E/S/W aligned. */
export function projectPointerToCircleCardinalEdge(
  center: [number, number],
  cardinal: CircleCardinal,
  pointer: [number, number],
): [number, number] {
  const [clng, clat] = center;
  const [plng, plat] = pointer;
  const cosLat = circleRefineCosLat(clat);
  let ex = 1;
  let ey = 0;
  if (cardinal === 'n') {
    ex = 0;
    ey = 1;
  } else if (cardinal === 's') {
    ex = 0;
    ey = -1;
  } else if (cardinal === 'w') {
    ex = -1;
    ey = 0;
  }
  const vx = (plng - clng) * cosLat;
  const vy = plat - clat;
  const t = Math.max(1e-10, vx * ex + vy * ey);
  return [clng + (ex * t) / cosLat, clat + ey * t];
}

export function minPixelDistToPolyline(map: MapboxMap, lng: number, lat: number, coords: [number, number][]): number {
  const p: [number, number] = [lng, lat];
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const x = a[0] + t * (b[0] - a[0]);
      const y = a[1] + t * (b[1] - a[1]);
      const d = lngLatPixelDistance(map, p, [x, y]);
      if (d < min) min = d;
    }
  }
  return min;
}

export function lngLatPixelDistance(map: MapboxMap, lngLatA: [number, number], lngLatB: [number, number]): number {
  const a = map.project(lngLatA as [number, number]);
  const b = map.project(lngLatB as [number, number]);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clientPointToLngLat(map: MapboxMap, clientX: number, clientY: number): [number, number] | null {
  const canvas = map.getCanvas();
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const p = map.unproject([clientX - rect.left, clientY - rect.top]);
  return [p.lng, p.lat];
}

export type VertexRef =
  | { kind: 'LineString'; index: number }
  | { kind: 'Polygon'; ring: number; index: number; polyIndex?: number };

export function collectVertexRefs(geometry: any): { ref: VertexRef; coord: [number, number] }[] {
  const out: { ref: VertexRef; coord: [number, number] }[] = [];
  if (!geometry) return out;
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    out.push({ ref: { kind: 'LineString', index: 0 }, coord: [...geometry.coordinates] as [number, number] });
    return out;
  }
  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((c: number[], i: number) => {
      out.push({ ref: { kind: 'LineString', index: i }, coord: c as [number, number] });
    });
    return out;
  }
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((ring: number[][], ringIndex: number) => {
      const lastDup =
        ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1];
      const max = lastDup ? ring.length - 1 : ring.length;
      for (let i = 0; i < max; i++) {
        out.push({ ref: { kind: 'Polygon', ring: ringIndex, index: i }, coord: ring[i] as [number, number] });
      }
    });
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((poly: number[][][], polyIndex: number) => {
      poly.forEach((ring: number[][], ringIndex: number) => {
        const lastDup =
          ring.length > 1 &&
          ring[0][0] === ring[ring.length - 1][0] &&
          ring[0][1] === ring[ring.length - 1][1];
        const max = lastDup ? ring.length - 1 : ring.length;
        for (let i = 0; i < max; i++) {
          out.push({
            ref: { kind: 'Polygon', ring: ringIndex, index: i, polyIndex },
            coord: ring[i] as [number, number],
          });
        }
      });
    });
  }
  return out;
}

export function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-18) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygonGeometry(lng: number, lat: number, geometry: { type: string; coordinates: number[][][] }): boolean {
  const outer = geometry.coordinates?.[0];
  if (!outer) return false;
  if (!pointInRing(lng, lat, outer)) return false;
  for (let r = 1; r < geometry.coordinates.length; r++) {
    if (pointInRing(lng, lat, geometry.coordinates[r])) return false;
  }
  return true;
}

export function findNearestVertex(
  map: MapboxMap,
  geometry: any,
  lng: number,
  lat: number,
  pxThreshold: number
): { ref: VertexRef; coord: [number, number] } | null {
  const pts = collectVertexRefs(geometry);
  let best: { ref: VertexRef; coord: [number, number]; d: number } | null = null;
  const click: [number, number] = [lng, lat];
  for (const p of pts) {
    const d = lngLatPixelDistance(map, click, p.coord);
    if (d <= pxThreshold && (!best || d < best.d)) {
      best = { ...p, d };
    }
  }
  return best;
}

export function translateFeatureCoordinates(feature: any, deltaLng: number, deltaLat: number): any {
  const f = cloneDeep(feature);
  const g = f.geometry;
  if (!g) return f;
  const tr = (c: number[]): number[] => [c[0] + deltaLng, c[1] + deltaLat];
  if (g.type === 'Point') {
    g.coordinates = tr(g.coordinates);
    return f;
  }
  if (g.type === 'LineString') {
    g.coordinates = g.coordinates.map(tr);
    return f;
  }
  if (g.type === 'Polygon') {
    g.coordinates = g.coordinates.map((ring: number[][]) => ring.map(tr));
    if (g.coordinates[0]?.length > 1) {
      const r0 = g.coordinates[0];
      const first = r0[0];
      const last = r0[r0.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) {
        r0[r0.length - 1] = [...first];
      }
    }
    return f;
  }
  if (g.type === 'MultiPolygon') {
    g.coordinates = g.coordinates.map((poly: number[][][]) =>
      poly.map((ring: number[][]) => {
        const nr = ring.map(tr);
        if (nr.length > 1) {
          const first = nr[0];
          const last = nr[nr.length - 1];
          if (first[0] === last[0] && first[1] === last[1]) {
            nr[nr.length - 1] = [...first];
          }
        }
        return nr;
      }),
    );
    return f;
  }
  return f;
}

export function setVertexCoord(feature: any, ref: VertexRef, lng: number, lat: number): any {
  const f = cloneDeep(feature);
  const g = f.geometry;
  if (!g) return f;
  if (g.type === 'Point' && ref.kind === 'LineString') {
    g.coordinates = [lng, lat];
    return f;
  }
  if (g.type === 'LineString' && ref.kind === 'LineString') {
    g.coordinates[ref.index] = [lng, lat];
    return f;
  }
  if (g.type === 'Polygon' && ref.kind === 'Polygon') {
    const ring = g.coordinates[ref.ring];
    if (!ring) return f;
    ring[ref.index] = [lng, lat];
    const lastDup =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    if (lastDup && ref.index === 0) {
      ring[ring.length - 1] = [lng, lat];
    } else if (lastDup && ref.index === ring.length - 1) {
      ring[0] = [lng, lat];
    }
    return f;
  }
  if (g.type === 'MultiPolygon' && ref.kind === 'Polygon' && ref.polyIndex != null) {
    const poly = g.coordinates[ref.polyIndex];
    if (!poly) return f;
    const ring = poly[ref.ring];
    if (!ring) return f;
    ring[ref.index] = [lng, lat];
    const lastDup =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    if (lastDup && ref.index === 0) {
      ring[ring.length - 1] = [lng, lat];
    } else if (lastDup && ref.index === ring.length - 1) {
      ring[0] = [lng, lat];
    }
    return f;
  }
  return f;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function geometryToWkt(geometry: any): string {
  if (!geometry) return '';
  const fmt = (c: number[]) => `${c[0]} ${c[1]}`;
  if (geometry.type === 'Point') return `POINT (${fmt(geometry.coordinates)})`;
  if (geometry.type === 'LineString') {
    return `LINESTRING (${geometry.coordinates.map(fmt).join(', ')})`;
  }
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates.map(
      (ring: number[][]) => `(${ring.map(fmt).join(', ')})`
    );
    return `POLYGON (${rings.join(', ')})`;
  }
  return '';
}

export function featureToWkt(feature: any): string {
  return geometryToWkt(feature?.geometry);
}

export function featureToKml(feature: any, name = 'AOI'): string {
  const desc = escapeXml(feature?.properties?.label || name);
  const g = feature?.geometry;
  if (!g) return '';
  let coordsXml = '';
  if (g.type === 'Point') {
    const [lng, lat] = g.coordinates;
    coordsXml = `<Point><coordinates>${lng},${lat},0</coordinates></Point>`;
  } else if (g.type === 'LineString') {
    const coordStr = g.coordinates.map(([lng, lat]: number[]) => `${lng},${lat},0`).join(' ');
    coordsXml = `<LineString><coordinates>${coordStr}</coordinates></LineString>`;
  } else if (g.type === 'Polygon') {
    const rings = g.coordinates
      .map(
        (ring: number[][]) =>
          `<LinearRing><coordinates>${ring.map(([lng, lat]: number[]) => `${lng},${lat},0`).join(' ')}</coordinates></LinearRing>`
      )
      .join('');
    coordsXml = `<Polygon>${rings}</Polygon>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>${desc}</name>
      ${coordsXml}
    </Placemark>
  </Document>
</kml>`;
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const LS_KEY_V2 = 'si-satellite-draw-workspace-v2';
const LS_KEY_V1 = 'si-satellite-draw-workspace-v1';

export const SI_DRAW_WORKSPACE_LS_KEY_V2 = LS_KEY_V2;

export type SiAoiFieldPersistV2 = {
  id: string;
  name: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  style: { fillColor: string; strokeColor: string; strokeWidth: number; fillOpacity: number };
};

export function saveDrawWorkspace(
  payload: {
  feature: any | null;
  style: DrawStyleConfig;
  fields?: SiAoiFieldPersistV2[];
  selectedFieldId?: string | null;
  drawTargetMode?: 'aoi' | 'field';
},
  storageKey = LS_KEY_V2,
) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        feature: payload.feature,
        style: payload.style,
        fields: payload.fields ?? [],
        selectedFieldId: payload.selectedFieldId ?? null,
        drawTargetMode: payload.drawTargetMode ?? 'aoi',
      }),
    );
  } catch {
    /* ignore quota */
  }
}

export function loadDrawWorkspace(storageKey = LS_KEY_V2): {
  feature: any | null;
  style: DrawStyleConfig | null;
  fields: SiAoiFieldPersistV2[];
  selectedFieldId: string | null;
  drawTargetMode: 'aoi' | 'field';
} | null {
  try {
    const rawV2 = localStorage.getItem(storageKey);
    if (rawV2) {
      const data = JSON.parse(rawV2);
      return {
        feature: data.feature ?? null,
        style: data.style ?? null,
        fields: Array.isArray(data.fields) ? data.fields : [],
        selectedFieldId: typeof data.selectedFieldId === 'string' ? data.selectedFieldId : null,
        drawTargetMode: data.drawTargetMode === 'field' ? 'field' : 'aoi',
      };
    }
    const raw = localStorage.getItem(LS_KEY_V1);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      feature: data.feature ?? null,
      style: data.style ?? null,
      fields: [],
      selectedFieldId: null,
      drawTargetMode: 'aoi',
    };
  } catch {
    return null;
  }
}
