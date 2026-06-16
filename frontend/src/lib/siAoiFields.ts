/**
 * AOI-scoped field sketches (nested under the main drawn AOI in Satellite Intelligence).
 * GeoJSON-first; metrics are client-side approximations in WGS84 (good for UI / relative sizing).
 */

import { pointInPolygonGeometry } from '../pages/satellite/drawingUtils';

export type SiAoiFieldStyle = {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  fillOpacity: number;
};

export type SiAoiFieldRecord = {
  id: string;
  name: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  style: SiAoiFieldStyle;
  areaHa: number;
  perimeterM: number;
  centroid: [number, number];
};

export const SI_AOI_FIELD_STYLE_PALETTE: SiAoiFieldStyle[] = [
  {
    fillColor: '#000000',
    strokeColor: '#000000',
    strokeWidth: 1.75,
    fillOpacity: 0,
  },
];

export function pickSiAoiFieldStyle(_index: number): SiAoiFieldStyle {
  return { ...SI_AOI_FIELD_STYLE_PALETTE[0]! };
}

export function newSiAoiFieldId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `fld-${crypto.randomUUID()}` : `fld-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ringCentroid(ring: number[][]): [number, number] {
  if (!ring.length) return [0, 0];
  let sx = 0;
  let sy = 0;
  const n = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i++) {
    sx += ring[i]![0];
    sy += ring[i]![1];
  }
  const d = Math.max(1, n);
  return [sx / d, sy / d];
}

/** Shoelace area in m² using local degree→meter scaling at mean latitude (adequate for field-scale AOIs). */
function ringAreaM2(ring: number[][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  const latMean = (ring.reduce((s, p) => s + p[1], 0) / n) * (Math.PI / 180);
  const mx = 111320 * Math.max(0.2, Math.cos(latMean));
  const my = 110574;
  let a = 0;
  const upto = ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1] ? n - 1 : n;
  for (let i = 0; i < upto; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % upto]!;
    a += p[0] * mx * q[1] * my - q[0] * mx * p[1] * my;
  }
  return Math.abs(a / 2);
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const s =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function ringPerimeterM(ring: number[][]): number {
  if (ring.length < 2) return 0;
  const closed =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.length - 1 : ring.length;
  let p = 0;
  for (let i = 0; i < closed; i++) {
    const a = ring[i] as [number, number];
    const b = ring[(i + 1) % closed] as [number, number];
    p += haversineM(a, b);
  }
  return p;
}

export function computeSiAoiFieldMetrics(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): {
  areaHa: number;
  perimeterM: number;
  centroid: [number, number];
} {
  if (geometry.type === 'Polygon') {
    const outer = geometry.coordinates[0] ?? [];
    const areaM2 = ringAreaM2(outer);
    let per = ringPerimeterM(outer);
    for (let r = 1; r < geometry.coordinates.length; r++) {
      per += ringPerimeterM(geometry.coordinates[r] ?? []);
    }
    return {
      areaHa: areaM2 / 10000,
      perimeterM: per,
      centroid: ringCentroid(outer),
    };
  }
  let areaM2 = 0;
  let per = 0;
  const cents: [number, number][] = [];
  for (const poly of geometry.coordinates) {
    const outer = poly[0] ?? [];
    areaM2 += ringAreaM2(outer);
    per += ringPerimeterM(outer);
    for (let r = 1; r < poly.length; r++) per += ringPerimeterM(poly[r] ?? []);
    cents.push(ringCentroid(outer));
  }
  const cx = cents.reduce((s, c) => s + c[0], 0) / Math.max(1, cents.length);
  const cy = cents.reduce((s, c) => s + c[1], 0) / Math.max(1, cents.length);
  return { areaHa: areaM2 / 10000, perimeterM: per, centroid: [cx, cy] };
}

export function pointInAoiGeometry(lng: number, lat: number, aoiGeom: GeoJSON.Geometry): boolean {
  if (!aoiGeom || typeof aoiGeom !== 'object') return false;
  if (aoiGeom.type === 'Polygon') {
    return pointInPolygonGeometry(lng, lat, aoiGeom as { type: string; coordinates: number[][][] });
  }
  if (aoiGeom.type === 'MultiPolygon') {
    const polys = (aoiGeom as GeoJSON.MultiPolygon).coordinates;
    for (const poly of polys) {
      const fake = { type: 'Polygon' as const, coordinates: poly };
      if (pointInPolygonGeometry(lng, lat, fake as { type: string; coordinates: number[][][] })) return true;
    }
    return false;
  }
  return false;
}

/** Sample bbox corners + centroid of field geometry; all must fall inside AOI outer rings. */
export function fieldGeometryWithinAoi(aoiGeom: GeoJSON.Geometry, fieldGeom: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  const samples: [number, number][] = [];
  const pushRing = (ring: number[][]) => {
    const c = ringCentroid(ring);
    samples.push(c);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    samples.push([minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [(minX + maxX) / 2, (minY + maxY) / 2]);
  };
  if (fieldGeom.type === 'Polygon') {
    pushRing(fieldGeom.coordinates[0] ?? []);
  } else {
    for (const poly of fieldGeom.coordinates) {
      pushRing(poly[0] ?? []);
    }
  }
  for (const [lng, lat] of samples) {
    if (!pointInAoiGeometry(lng, lat, aoiGeom)) return false;
  }
  return true;
}

function bboxOverlap2d(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function geometryBBox(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consumeRing = (ring: number[][]) => {
    for (const p of ring) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
  };
  if (g.type === 'Polygon') {
    for (const ring of g.coordinates) consumeRing(ring);
  } else {
    for (const poly of g.coordinates) {
      for (const ring of poly) consumeRing(ring);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Fast overlap guard: intersecting bboxes + centroid of each inside the other's bbox. */
export function fieldGeometriesRoughOverlap(a: GeoJSON.Polygon | GeoJSON.MultiPolygon, b: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  const ba = geometryBBox(a);
  const bb = geometryBBox(b);
  if (!bboxOverlap2d(ba, bb)) return false;
  const [ax, ay] = computeSiAoiFieldMetrics(a).centroid;
  const [bx, by] = computeSiAoiFieldMetrics(b).centroid;
  const pin = (x: number, y: number, box: typeof ba) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
  return pin(ax, ay, bb) || pin(bx, by, ba);
}

export function buildSiAoiFieldRecord(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  name: string,
  styleIndex: number,
  id?: string,
): SiAoiFieldRecord {
  const metrics = computeSiAoiFieldMetrics(geometry);
  const style = pickSiAoiFieldStyle(styleIndex);
  return {
    id: id ?? newSiAoiFieldId(),
    name,
    geometry,
    style: { ...style },
    ...metrics,
  };
}

export function siAoiFieldToMapFeature(f: SiAoiFieldRecord): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: f.id,
    properties: {
      id: f.id,
      name: f.name,
      fillColor: f.style.fillColor,
      strokeColor: f.style.strokeColor,
      strokeWidth: f.style.strokeWidth,
      fillOpacity: f.style.fillOpacity,
      areaHa: Number(f.areaHa.toFixed(4)),
      perimeterM: Number(f.perimeterM.toFixed(2)),
      centroidLng: f.centroid[0],
      centroidLat: f.centroid[1],
    },
    geometry: f.geometry,
  };
}

export function siAoiFieldsToFeatureCollection(fields: SiAoiFieldRecord[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: fields.map(siAoiFieldToMapFeature) };
}

/** Merge two polygon fields into a single MultiPolygon record (topology union is not computed). */
export function mergeSiAoiPolygonFields(a: SiAoiFieldRecord, b: SiAoiFieldRecord, name: string): SiAoiFieldRecord | null {
  if (a.geometry.type !== 'Polygon' || b.geometry.type !== 'Polygon') return null;
  const geometry: GeoJSON.MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [a.geometry.coordinates, b.geometry.coordinates],
  };
  const metrics = computeSiAoiFieldMetrics(geometry);
  const style = { ...a.style, strokeWidth: Math.max(a.style.strokeWidth, b.style.strokeWidth) };
  return {
    id: newSiAoiFieldId(),
    name,
    geometry,
    style,
    ...metrics,
  };
}

export function rotateLngLatAround(
  lng: number,
  lat: number,
  cx: number,
  cy: number,
  rad: number,
  cosLat: number,
): [number, number] {
  const x = (lng - cx) * cosLat;
  const y = lat - cy;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xr = x * cos - y * sin;
  const yr = x * sin + y * cos;
  return [cx + xr / cosLat, cy + yr];
}

export function rotatePolygonGeometry(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  deg: number,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  const rad = (deg * Math.PI) / 180;
  const metrics = computeSiAoiFieldMetrics(geometry);
  const [cx, cy] = metrics.centroid;
  const cosLat = Math.max(0.2, Math.cos((cy * Math.PI) / 180));
  const mapRing = (ring: number[][]) =>
    ring.map(([lng, lat]) => rotateLngLatAround(lng, lat, cx, cy, rad, cosLat));
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map(ring => mapRing(ring)),
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map(poly => poly.map(ring => mapRing(ring))),
  };
}
