/**
 * Sentinel Hub OGC WMS AOI clipping: GEOMETRY (EPSG:3857 WKT) + EVALSCRIPT with dataMask-driven alpha.
 * @see https://docs.sentinel-hub.com/api/latest/api/ogc/additional-request-parameters/
 * @see https://www.sentinel-hub.com/faq/how-can-i-clip-image-specific-polygon/
 */

import { buildAgroCompositeLayerEvalscript } from './agroCompositeIndexEvalscripts'
import { buildCropClassificationEvalscript } from './siCropClassificationEvalscript'
import { buildLulcClassificationEvalscript } from './siLulcClassificationEvalscript'
import { isAgroCompositeLayerId } from './agroCompositeIndices'
import { isCropClassificationLayerId } from './siCropClassification'
import { isLulcClassificationLayerId } from './siLulcClassification'
import { buildDataMaskLayerEvalscript, isDataMaskLayerId } from './dataMaskLayer'
import {
  buildSentinelIndexColorRampEvalscript,
  isSentinelIndexColorRampProfile,
  type SentinelIndexEvalProfile,
} from './sentinelHubWmsIndexEvalscripts'
import {
  getBootstrapSentinelWmsLayers,
  resolveSentinelHubWmsNativeIndexLayerName,
  usesSentinelHubWmsClientEvalscript,
  getSentinelHubWmsLayerCatalog,
} from './sentinelHubWmsLayers'
import {
  filterOuterRingsByLngLatBBox,
  lngLatBoundsFromOuterRings,
  type LngLatBBox,
} from './siMapViewport'

export type WmsAoiEvalProfile =
  | 'native'
  | 'true_color'
  | 'false_color'
  | SentinelIndexEvalProfile
  | 'generic_rgb'
  | 'agro_composite'
  | 'crop_classification'
  | 'lulc_classification'
  | 'data_mask';

export type BuildSentinelHubWmsAoiClipOptions = {
  /** When set (0–1), multiply alpha by (index >= minIndex) for index-style profiles (e.g. NDVI). Ignored for RGB-only profiles. */
  indexVisibilityMin?: number | null;
  /** Acquisition date (YYYY-MM-DD) — drives seasonal ET energy factor. */
  sceneDate?: string | null;
  /** When set, only include AOI rings intersecting this WGS84 bbox (viewport lazy clip). */
  viewportBBox?: LngLatBBox | null;
  /** Cap simultaneous WMS tile layers (packed multipolygon GEOMETRY clips). */
  maxTileLayers?: number | null;
  /** One GEOMETRY clip per field ring (higher fidelity, up to maxTileLayers). */
  preferSingleRingChunks?: boolean;
  /** @deprecated Use maxTileLayers — no longer skips GEOMETRY clip. */
  maxAoiClipRings?: number | null;
};

/** Rough planar area for ranking rings (largest farms first when tile budget is tight). */
export function outerRingApproxArea(ring: [number, number][]): number {
  if (!ring || ring.length < 3) return 0
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of ring) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  if (!Number.isFinite(minLng)) return 0
  return Math.max(0, maxLng - minLng) * Math.max(0, maxLat - minLat)
}

export function sortOuterRingsByApproxAreaDesc(rings: [number, number][][]): [number, number][][] {
  if (!Array.isArray(rings) || !rings.length) return []
  return [...rings].sort((a, b) => outerRingApproxArea(b) - outerRingApproxArea(a))
}

export type WmsAoiWktChunkGroup = {
  geometryWkt3857: string
  outerRings: [number, number][][]
}

export type SentinelHubWmsAoiClipPart = {
  geometryWkt3857: string | null
  evalscriptB64: string | null
  /** Per-chunk tile bounds — smaller than full AOI when rings are packed into groups. */
  aoiBoundsLngLat?: LngLatBBox | null
}

function singleRingClipParts(
  rings: [number, number][][],
  evalscriptB64: string | null,
): SentinelHubWmsAoiClipPart[] {
  const safe = Array.isArray(rings) ? rings.filter(r => Array.isArray(r) && r.length >= 3) : []
  return safe.map(ring => ({
    geometryWkt3857: multiPolygon3857Wkt([ring]),
    evalscriptB64,
    aoiBoundsLngLat: lngLatBoundsFromOuterRings([ring]),
  }))
}

/** Merge WKT chunk groups down to maxGroups while keeping all rings (full AOI coverage). */
export function mergeWktChunkGroupsToCap(
  groups: WmsAoiWktChunkGroup[],
  maxGroups: number,
  evalscriptB64: string | null,
): WmsAoiWktChunkGroup[] {
  const list = Array.isArray(groups)
    ? groups.filter(g => g && Array.isArray(g.outerRings) && g.outerRings.length > 0)
    : []
  const cap = Math.max(1, Math.floor(maxGroups))
  if (list.length <= cap) return list

  const budget = wktBudgetForEvalscript(evalscriptB64)
  let merged = [...list]

  const allRings = merged.flatMap(g => g.outerRings)
  const allWkt = multiPolygon3857Wkt(allRings)
  if (allWkt.length <= budget && cap >= 1) {
    return [{ geometryWkt3857: allWkt, outerRings: allRings }]
  }

  const tryMergeRings = (rings: [number, number][][], verts?: number): WmsAoiWktChunkGroup | null => {
    let candidate = rings
    if (verts != null) {
      candidate = rings.map(r => simplifyOuterRingWgs84(r, verts))
    }
    const wkt = multiPolygon3857Wkt(candidate)
    if (wkt.length > budget) return null
    return { geometryWkt3857: wkt, outerRings: candidate }
  }

  while (merged.length > cap) {
    let mergedPair = false
    for (let i = 0; i < merged.length - 1; i++) {
      const combinedRings = [...merged[i]!.outerRings, ...merged[i + 1]!.outerRings]
      const next = tryMergeRings(combinedRings)
      if (next) {
        merged = [...merged.slice(0, i), next, ...merged.slice(i + 2)]
        mergedPair = true
        break
      }
    }
    if (mergedPair) continue

    let bestI = 0
    let bestJ = 1
    let bestSize = Infinity
    let bestNext: WmsAoiWktChunkGroup | null = null
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const combinedRings = [...merged[i]!.outerRings, ...merged[j]!.outerRings]
        const next = tryMergeRings(combinedRings)
        if (next && next.geometryWkt3857.length < bestSize) {
          bestSize = next.geometryWkt3857.length
          bestI = i
          bestJ = j
          bestNext = next
        }
      }
    }
    if (bestNext) {
      merged = merged.filter((_, idx) => idx !== bestI && idx !== bestJ)
      merged.push(bestNext)
      continue
    }

    // Last resort: simplify before merging so we still stay under URL budget.
    let simplifiedPair = false
    for (const verts of [12, 8, 6, 5]) {
      for (let i = 0; i < merged.length - 1; i++) {
        const combinedRings = [...merged[i]!.outerRings, ...merged[i + 1]!.outerRings]
        const next = tryMergeRings(combinedRings, verts)
        if (next) {
          merged = [...merged.slice(0, i), next, ...merged.slice(i + 2)]
          simplifiedPair = true
          break
        }
      }
      if (simplifiedPair) break
    }
    if (simplifiedPair) continue
    return forceWktGroupsToCap(merged, cap, evalscriptB64)
  }

  if (merged.length > cap) return forceWktGroupsToCap(merged, cap, evalscriptB64)
  return merged
}

function capWmsDisplayChunks(
  chunks: SentinelHubWmsAoiClipPart[],
  maxTileLayers?: number | null,
): SentinelHubWmsAoiClipPart[] {
  const cap = maxTileLayers
  if (cap == null || !Number.isFinite(cap) || cap <= 0 || chunks.length <= cap) return chunks
  // Never slice — dropping chunks hides AOIs. Packing below must already honor the cap.
  return chunks
}

const MAX_WKT_CHARS = 5600;
/** Raw WKT budget before encodeURIComponent — keeps full GetMap URLs under common proxy limits. */
const SAFE_WKT_CHARS = 3600;
const MAX_RING_VERTICES = 96;

/** WGS84 lon/lat → Web Mercator (EPSG:3857), meters. */
export function lngLatToWebMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180);
  return [x, y];
}

function ringClosed(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const a = ring[0]!;
  const b = ring[ring.length - 1]!;
  if (a[0] === b[0] && a[1] === b[1]) return ring;
  return [...ring, a];
}

/** Tiny closed rectangle so a collapsed/small AOI still produces valid WKT. */
export function ringBboxFallback(ring: [number, number][]): [number, number][] {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const pt of ring) {
    const lng = Number(pt?.[0])
    const lat = Number(pt?.[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }
  if (!Number.isFinite(minLng)) return ring
  const pad = 1e-6
  if (maxLng - minLng < pad) {
    minLng -= pad
    maxLng += pad
  }
  if (maxLat - minLat < pad) {
    minLat -= pad
    maxLat += pad
  }
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ]
}

/** Keep every AOI paint-able: never drop a ring that collapsed under simplification. */
export function ensurePaintableOuterRing(ring: [number, number][]): [number, number][] {
  const finite = (Array.isArray(ring) ? ring : []).filter(
    pt => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]),
  ) as [number, number][]
  const closed = ringClosed(finite)
  if (closed.length >= 4) return closed
  return ringBboxFallback(finite.length ? finite : ring)
}

/** Union bbox of many rings — last-resort GEOMETRY when a bucket cannot fit as MULTIPOLYGON. */
function envelopeRingFromRings(rings: [number, number][][]): [number, number][] {
  const pts: [number, number][] = []
  for (const ring of rings) {
    if (!Array.isArray(ring)) continue
    for (const pt of ring) {
      if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) pts.push(pt)
    }
  }
  return ringBboxFallback(pts)
}

function perpendicularDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return Math.hypot(x - nx, y - ny);
}

function douglasPeucker(ring: [number, number][], epsilonDeg: number): [number, number][] {
  if (ring.length <= 2) return ring;
  let dmax = 0;
  let index = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = perpendicularDistance(ring[i]!, ring[0]!, ring[ring.length - 1]!);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }
  if (dmax > epsilonDeg) {
    const a = douglasPeucker(ring.slice(0, index + 1), epsilonDeg);
    const b = douglasPeucker(ring.slice(index), epsilonDeg);
    return [...a.slice(0, -1), ...b];
  }
  return [ring[0]!, ring[ring.length - 1]!];
}

function decimateMax(ring: [number, number][], maxPts: number): [number, number][] {
  if (ring.length <= maxPts) return ring;
  const step = Math.ceil(ring.length / maxPts);
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]!);
  const last = ring[ring.length - 1]!;
  const prev = out[out.length - 1]!;
  if (prev[0] !== last[0] || prev[1] !== last[1]) out.push(last);
  return out;
}

function maxVerticesForRingCount(ringCount: number): number {
  if (ringCount <= 1) return MAX_RING_VERTICES;
  if (ringCount <= 4) return 64;
  if (ringCount <= 8) return 48;
  if (ringCount <= 16) return 36;
  if (ringCount <= 24) return 28;
  if (ringCount <= 40) return 24;
  if (ringCount <= 80) return 20;
  if (ringCount <= 200) return 16;
  return 16;
}

function simplifyOuterRingWgs84(ring: [number, number][], maxVertices = MAX_RING_VERTICES): [number, number][] {
  const closed = ringClosed(ring);
  let eps = 0.000025;
  let simplified = douglasPeucker(closed, eps);
  for (let k = 0; k < 8 && simplified.length > maxVertices; k++) {
    eps *= 1.75;
    simplified = douglasPeucker(closed, eps);
  }
  simplified = decimateMax(simplified, maxVertices);
  return ensurePaintableOuterRing(simplified);
}

/** Comma-separated "x y" pairs in EPSG:3857 (meters), fixed precision to shorten URLs. */
function ringWgs84To3857CoordPairs(ring: [number, number][]): string {
  if (!Array.isArray(ring) || ring.length < 2) return ''
  return ring
    .map(([lng, lat]) => {
      const [x, y] = lngLatToWebMercator(lng, lat);
      return `${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(', ');
}

/** OGC WKT POLYGON with one outer ring: POLYGON(( x y, ... )) */
function polygon3857WktFromRing(ring: [number, number][]): string {
  const pts = ringWgs84To3857CoordPairs(ring);
  if (!pts) return 'POLYGON EMPTY'
  return `POLYGON((${pts}))`;
}

/** OGC MULTIPOLYGON from several outer rings. */
function multiPolygon3857Wkt(rings: [number, number][][]): string {
  const safe = Array.isArray(rings) ? rings.filter(r => Array.isArray(r) && r.length >= 3) : []
  if (!safe.length) return 'POLYGON EMPTY'
  if (safe.length === 1) return polygon3857WktFromRing(safe[0]!);
  const parts = safe.map(r => `((${ringWgs84To3857CoordPairs(r)}))`).join(', ');
  return `MULTIPOLYGON(${parts})`;
}

export function inferWmsEvalProfile(layerName: string): WmsAoiEvalProfile {
  const u = String(layerName || '').toUpperCase();
  if (isDataMaskLayerId(u)) return 'data_mask';
  if (isCropClassificationLayerId(u)) return 'crop_classification';
  if (isLulcClassificationLayerId(u)) return 'lulc_classification';
  if (isAgroCompositeLayerId(u)) return 'agro_composite';
  if (usesPresetSentinelHubWmsLayer(layerName)) return 'native';
  if (u.includes('GNDVI')) return 'gndvi';
  if (u.includes('NDSI') || u.includes('SNOW')) return 'ndsi';
  if (u.includes('NDRE')) return 'ndre';
  if (u.includes('BSI')) return 'native';
  if (u.includes('MNDWI')) return 'mndwi';
  if (u.includes('SAVI')) return 'savi';
  if (u.includes('NDVI')) return 'ndvi';
  if (u.includes('EVI') && !u.includes('NEVI')) return 'evi';
  if (u.includes('NDMI') || (u.includes('MOISTURE') && !u.includes('EVAPO'))) return 'ndmi';
  if (u === 'ET' || u.includes('EVAPOTRANSPIRATION') || u.includes('EVAPO')) return 'et';
  if (u === 'LST' || u.includes('LAND_SURFACE_TEMP') || (u.includes('SURFACE') && u.includes('TEMP'))) {
    return 'lst'
  }
  if (u.includes('NDWI') || u.includes('WATER')) return 'ndwi';
  if (u.includes('FALSE') || u.includes('SWIR') || u.includes('COLOR_INFRARED')) return 'false_color';
  if (u.includes('TRUE') || u.includes('NATURAL') || u.includes('RGB')) return 'true_color';
  return 'native';
}

/** Sentinel Hub preset visualization layers — keep server evalscript; clip with GEOMETRY only. */
export function usesPresetSentinelHubWmsLayer(layerName: string): boolean {
  const u = String(layerName || '').toUpperCase();
  return /HIGHLIGHT|OPTIMIZED|ENHANCED|VIVID|CONTRAST|MOMA|AGRICULTURE|COLOR.?BLIND|ATMOSPHERIC|PERSPECTIVE/i.test(u);
}

function buildEvalscriptV3(
  profile: WmsAoiEvalProfile,
  indexVisibilityMin: number | null,
  layerName: string,
  sceneDate?: string | null,
): string {
  if (profile === 'agro_composite') {
    return buildAgroCompositeLayerEvalscript(layerName, indexVisibilityMin) ?? '';
  }
  if (profile === 'data_mask') {
    return buildDataMaskLayerEvalscript();
  }
  if (profile === 'crop_classification') {
    return buildCropClassificationEvalscript();
  }
  if (profile === 'lulc_classification') {
    return buildLulcClassificationEvalscript();
  }
  if (isSentinelIndexColorRampProfile(profile)) {
    return buildSentinelIndexColorRampEvalscript(profile, indexVisibilityMin, { sceneDate });
  }

  switch (profile) {
    case 'native':
      return '';
    case 'true_color':
    case 'generic_rgb':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  return [
    Math.max(0, Math.min(1, s.B04 * 2.5)),
    Math.max(0, Math.min(1, s.B03 * 2.5)),
    Math.max(0, Math.min(1, s.B02 * 2.5)),
    1
  ];
}`;
    case 'false_color':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "B08", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  return [
    Math.max(0, Math.min(1, s.B08 * 2.5)),
    Math.max(0, Math.min(1, s.B04 * 2.5)),
    Math.max(0, Math.min(1, s.B03 * 2.5)),
    1
  ];
}`;
    default:
      return buildEvalscriptV3('generic_rgb', indexVisibilityMin, layerName);
  }
}

export function evalscriptToBase64Param(script: string): string {
  const bin = unescape(encodeURIComponent(script.replace(/\r\n/g, '\n').trim()));
  return btoa(bin);
}

/** Minimal geometry typing (drawn AOI is Polygon / MultiPolygon). */
export type DrawnAoiGeometry =
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] };

function mergePolygonGeometries(geoms: DrawnAoiGeometry[]): DrawnAoiGeometry | null {
  const polys: [number, number][][][] = [];
  for (const geom of geoms) {
    if (geom.type === 'Polygon') polys.push(geom.coordinates);
    else polys.push(...geom.coordinates);
  }
  if (!polys.length) return null;
  if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0]! };
  return { type: 'MultiPolygon', coordinates: polys };
}

export function getDrawnGeometry(geo: unknown): DrawnAoiGeometry | null {
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as {
    type?: string;
    geometry?: DrawnAoiGeometry;
    features?: Array<{ geometry?: DrawnAoiGeometry }>;
  };
  if (g.type === 'Feature' && g.geometry) return getDrawnGeometry(g.geometry);
  if (g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    const merged: DrawnAoiGeometry[] = [];
    for (const feature of g.features) {
      const part = getDrawnGeometry(feature);
      if (part) merged.push(part);
    }
    return mergePolygonGeometries(merged);
  }
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') return g as DrawnAoiGeometry;
  return null;
}

export function extractOuterRingsWgs84(drawn: unknown): [number, number][][] {
  const geom = getDrawnGeometry(drawn);
  if (!geom) return [];
  const toLngLatRing = (ring: unknown): [number, number][] | null => {
    if (!Array.isArray(ring) || ring.length < 2) return null;
    const out: [number, number][] = [];
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      out.push([lng, lat]);
    }
    if (!out.length) return null;
    return ensurePaintableOuterRing(out);
  };
  const rawOuterRings: [number, number][][] = [];
  if (geom.type === 'Polygon') {
    const outer = toLngLatRing(geom.coordinates[0]);
    if (outer) rawOuterRings.push(outer);
  } else {
    for (const poly of geom.coordinates) {
      const outer = toLngLatRing(poly?.[0]);
      if (outer) rawOuterRings.push(outer);
    }
  }
  return rawOuterRings;
}

function buildEvalscriptB64ForLayer(
  layerName: string,
  options?: BuildSentinelHubWmsAoiClipOptions,
): string | null {
  if (usesPresetSentinelHubWmsLayer(layerName)) return null
  if (resolveSentinelHubWmsNativeIndexLayerName(layerName, getSentinelHubWmsLayerCatalog())) {
    return null
  }
  const inferred = inferWmsEvalProfile(layerName);
  const profile = inferred === 'native' ? 'true_color' : inferred;
  const indexMin = options?.indexVisibilityMin ?? null;
  let evalPlain = buildEvalscriptV3(profile, indexMin, layerName, options?.sceneDate);
  return evalPlain ? evalscriptToBase64Param(evalPlain) : null;
}

function simplifyOuterRingsForWms(rawOuterRings: [number, number][][]): [number, number][][] {
  const ringBudget = maxVerticesForRingCount(rawOuterRings.length);
  let outerRings = rawOuterRings.map(r => simplifyOuterRingWgs84(r, ringBudget));
  let geometryWkt3857 = multiPolygon3857Wkt(outerRings);
  if (geometryWkt3857.length <= MAX_WKT_CHARS) return outerRings;

  const coarserBudget = Math.max(6, Math.floor(ringBudget * 0.65));
  outerRings = rawOuterRings.map(r =>
    decimateMax(douglasPeucker(ringClosed(r), 0.0002), coarserBudget),
  );
  geometryWkt3857 = multiPolygon3857Wkt(outerRings);
  if (geometryWkt3857.length <= MAX_WKT_CHARS) return outerRings;

  return rawOuterRings.map(r => decimateMax(r, Math.max(16, Math.min(32, ringBudget))));
}

function wktBudgetForEvalscript(evalscriptB64: string | null): number {
  const evalLen = evalscriptB64?.length ?? 0;
  // Prefer the safer raw budget so encodeURIComponent(GEOMETRY)+EVALSCRIPT still fit.
  return Math.max(1200, Math.min(SAFE_WKT_CHARS, MAX_WKT_CHARS) - Math.min(evalLen, 1800) - 48);
}

/** Absolute ceiling on Mapbox WMS raster sources for one Layers AOI stack. */
export const SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES = 64

/**
 * How many WMS GEOMETRY sources a Layers AOI mask needs for reliable URLs.
 * Scales with feature count — never assumes a fixed farm count.
 */
export function resolveLayersAoiWmsMaxTileLayers(featureCount: number): number {
  const n = Math.max(0, Math.floor(Number(featureCount) || 0))
  if (n <= 0) return 16
  if (n <= 16) return Math.min(SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES, Math.max(8, n))
  if (n <= 80) return 24
  if (n <= 250) return 36
  if (n <= 600) return 48
  return SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES
}

function wktForSingleRingWithinBudget(ring: [number, number][], budget: number): string {
  let wkt = multiPolygon3857Wkt([ring]);
  if (wkt.length <= budget) return wkt;
  let tighter = decimateMax(ring, Math.max(8, Math.floor(ring.length * 0.55)));
  wkt = multiPolygon3857Wkt([tighter]);
  if (wkt.length <= budget) return wkt;
  tighter = decimateMax(ring, Math.max(6, Math.floor(ring.length * 0.35)));
  return multiPolygon3857Wkt([tighter]);
}

/** Pack field rings into WKT chunks that fit Sentinel Hub URL limits (greedy multipolygon batches). */
export function packOuterRingsIntoWktChunkGroups(
  outerRings: [number, number][][],
  evalscriptB64: string | null,
): WmsAoiWktChunkGroup[] {
  if (!outerRings.length) return [];
  const budget = wktBudgetForEvalscript(evalscriptB64);
  const groups: WmsAoiWktChunkGroup[] = [];
  let batch: [number, number][][] = [];

  const flushBatch = () => {
    if (!batch.length) return;
    groups.push({
      geometryWkt3857: multiPolygon3857Wkt(batch),
      outerRings: batch,
    });
    batch = [];
  };

  for (const ring of outerRings) {
    const candidate = [...batch, ring];
    if (multiPolygon3857Wkt(candidate).length <= budget) {
      batch = candidate;
      continue;
    }
    flushBatch();
    if (multiPolygon3857Wkt([ring]).length <= budget) {
      batch = [ring];
    } else {
      groups.push({
        geometryWkt3857: wktForSingleRingWithinBudget(ring, budget),
        outerRings: [ring],
      });
    }
  }
  flushBatch();
  return groups;
}

export function packOuterRingsIntoWktChunks(
  outerRings: [number, number][][],
  evalscriptB64: string | null,
): string[] {
  return packOuterRingsIntoWktChunkGroups(outerRings, evalscriptB64).map(g => g.geometryWkt3857);
}

function ringCentroid(ring: [number, number][]): [number, number] {
  let cx = 0
  let cy = 0
  let n = 0
  for (const [lng, lat] of ring) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    cx += lng
    cy += lat
    n += 1
  }
  if (!n) return [0, 0]
  return [cx / n, cy / n]
}

/** Geographic grid so envelope fallback stays local instead of hashing distant fields together. */
function partitionRingsIntoSpatialBuckets(
  outerRings: [number, number][][],
  bucketCount: number,
): [number, number][][][] {
  const cap = Math.max(1, Math.floor(bucketCount))
  if (!outerRings.length) return []
  if (outerRings.length <= cap) return outerRings.map(ring => [ring])

  const cents = outerRings.map(ringCentroid)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of cents) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const cols = Math.max(1, Math.round(Math.sqrt(cap)))
  const rows = Math.max(1, Math.ceil(cap / cols))
  const buckets: [number, number][][][] = Array.from({ length: cap }, () => [])
  for (let i = 0; i < outerRings.length; i++) {
    const [x, y] = cents[i]!
    const col = Math.min(cols - 1, Math.max(0, Math.floor(((x - minX) / spanX) * cols)))
    const row = Math.min(rows - 1, Math.max(0, Math.floor(((y - minY) / spanY) * rows)))
    const idx = Math.min(cap - 1, row * cols + col)
    buckets[idx]!.push(outerRings[i]!)
  }
  return buckets.filter(batch => batch.length > 0)
}

/** One GEOMETRY per bucket: simplify rings to fit the URL, else clip to the bucket envelope. */
function packBatchAsSingleGroup(
  batch: [number, number][][],
  budget: number,
): WmsAoiWktChunkGroup {
  const paintable = batch.map(ensurePaintableOuterRing)
  if (paintable.length === 1) {
    const ring = paintable[0]!
    return {
      geometryWkt3857: wktForSingleRingWithinBudget(ring, budget),
      outerRings: [ring],
    }
  }

  let verts = paintable.length > 80 ? 8 : paintable.length > 40 ? 10 : paintable.length > 16 ? 16 : 24
  let rings = paintable.map(r => simplifyOuterRingWgs84(r, verts))
  let wkt = multiPolygon3857Wkt(rings)
  while (wkt.length > budget && verts > 4) {
    verts = Math.max(4, Math.floor(verts * 0.65))
    rings = paintable.map(r => simplifyOuterRingWgs84(r, verts))
    wkt = multiPolygon3857Wkt(rings)
  }
  if (wkt.length <= budget && wkt !== 'POLYGON EMPTY') {
    return { geometryWkt3857: wkt, outerRings: paintable }
  }

  const env = envelopeRingFromRings(paintable)
  return {
    geometryWkt3857: multiPolygon3857Wkt([env]),
    outerRings: paintable,
  }
}

function forceWktGroupsToCap(
  groups: WmsAoiWktChunkGroup[],
  maxGroups: number,
  evalscriptB64: string | null,
): WmsAoiWktChunkGroup[] {
  const cap = Math.max(1, Math.floor(maxGroups))
  if (groups.length <= cap) return groups
  const rings = groups.flatMap(g => g.outerRings)
  return packOuterRingsIntoFixedBucketGroups(rings, cap, evalscriptB64)
}

/**
 * Pack every ring into ≤ maxGroups GEOMETRY parts (spatial buckets).
 * Each bucket is exactly one WMS source: a MULTIPOLYGON when the URL fits,
 * otherwise the bucket envelope — never more sources than the cap.
 */
export function packOuterRingsIntoFixedBucketGroups(
  outerRings: [number, number][][],
  maxGroups: number,
  evalscriptB64: string | null,
): WmsAoiWktChunkGroup[] {
  if (!outerRings.length) return []
  const cap = Math.min(
    SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES,
    Math.max(1, Math.floor(maxGroups)),
  )
  const budget = wktBudgetForEvalscript(evalscriptB64)

  if (outerRings.length <= cap) {
    return outerRings.map(ring => {
      const paintable = ensurePaintableOuterRing(ring)
      return {
        geometryWkt3857: wktForSingleRingWithinBudget(paintable, budget),
        outerRings: [paintable],
      }
    })
  }

  return partitionRingsIntoSpatialBuckets(outerRings, cap).map(batch =>
    packBatchAsSingleGroup(batch, budget),
  )
}

/**
 * Builds one or more GEOMETRY + EVALSCRIPT parts (chunked for large Agro_Structures layers).
 *
 * Zoom/pan must not change GEOMETRY: callers should pass a stable clip + null viewportBBox
 * once Layers AOI is pinned. Large masks use budget-aware packing covering every ring so
 * Mapbox reuses the same WMS templates and only fetches new BBOX tiles.
 */
export function buildSentinelHubWmsAoiClipChunks(
  drawn: unknown,
  layerName: string,
  options?: BuildSentinelHubWmsAoiClipOptions,
): SentinelHubWmsAoiClipPart[] {
  let rawOuterRings = extractOuterRingsWgs84(drawn);
  if (options?.viewportBBox) {
    const filtered = filterOuterRingsByLngLatBBox(rawOuterRings, options.viewportBBox);
    if (filtered.length) rawOuterRings = filtered;
  }
  if (!rawOuterRings.length) return [];

  const evalscriptB64 = buildEvalscriptB64ForLayer(layerName, options);
  const rankedRings = sortOuterRingsByApproxAreaDesc(rawOuterRings).map(ensurePaintableOuterRing);
  const requestedCap =
    options?.maxTileLayers != null && Number.isFinite(options.maxTileLayers) && options.maxTileLayers > 0
      ? Math.floor(options.maxTileLayers)
      : null

  // One GEOMETRY per polygon only when N fits the hard Mapbox/WMS source cap.
  // Thousands of AOIs always pack into ≤ SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES.
  const singleRingBudget = Math.min(
    SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES,
    requestedCap != null ? requestedCap : SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES,
  )
  if (options?.preferSingleRingChunks && rankedRings.length <= singleRingBudget) {
    const parts = singleRingClipParts(simplifyOuterRingsForWms(rankedRings), evalscriptB64);
    if (parts.length) return parts
  }

  const suggested = resolveLayersAoiWmsMaxTileLayers(rankedRings.length)
  const maxTiles = Math.min(
    SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES,
    requestedCap != null ? Math.max(requestedCap, suggested) : suggested,
  )

  // Budget-first packing (reliable URLs), then spatial re-bucket if source count is too high.
  let simplified = simplifyOuterRingsForWms(rankedRings);
  let groups = packOuterRingsIntoWktChunkGroups(simplified, evalscriptB64);
  if (!groups.length) {
    groups = packOuterRingsIntoFixedBucketGroups(simplified, maxTiles, evalscriptB64)
  }
  if (!groups.length) {
    return singleRingClipParts(simplified.slice(0, SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES), evalscriptB64)
  }

  if (groups.length > maxTiles) {
    groups = packOuterRingsIntoFixedBucketGroups(simplified, maxTiles, evalscriptB64);
  }

  return groups.map(group => ({
    geometryWkt3857: group.geometryWkt3857,
    evalscriptB64,
    aoiBoundsLngLat: lngLatBoundsFromOuterRings(group.outerRings),
  }));
}

/**
 * Map canvas WMS parts — AOI GEOMETRY clip when mask/drawn geometry exists (Agro_Structures),
 * otherwise full-canvas evalscript for Layer Live without an AOI.
 */
export function buildSentinelHubWmsDisplayChunks(
  drawn: unknown,
  layerName: string,
  options?: BuildSentinelHubWmsAoiClipOptions,
): SentinelHubWmsAoiClipPart[] {
  const u = String(layerName || '').trim()
  if (!u) return []

  const allRings = extractOuterRingsWgs84(drawn)
  const tileCap = options?.maxTileLayers ?? null

  if (allRings.length > 0) {
    let clipped = buildSentinelHubWmsAoiClipChunks(drawn, layerName, options)
    if (!clipped.length && options?.viewportBBox) {
      clipped = buildSentinelHubWmsAoiClipChunks(drawn, layerName, {
        ...options,
        viewportBBox: null,
      })
    }
    if (clipped.length) return capWmsDisplayChunks(clipped, tileCap)
    const evalscriptB64 = buildEvalscriptB64ForLayer(u, options)
    const fallbackRings = allRings.map(ensurePaintableOuterRing)
    const fallback = singleRingClipParts(
      simplifyOuterRingsForWms(fallbackRings).slice(0, SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES),
      evalscriptB64,
    )
    if (fallback.length) return capWmsDisplayChunks(fallback, tileCap)
    const packed = packOuterRingsIntoFixedBucketGroups(
      fallbackRings,
      Math.min(tileCap ?? SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES, SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES),
      evalscriptB64,
    )
    if (packed.length) {
      return capWmsDisplayChunks(
        packed.map(group => ({
          geometryWkt3857: group.geometryWkt3857,
          evalscriptB64,
          aoiBoundsLngLat: lngLatBoundsFromOuterRings(group.outerRings),
        })),
        tileCap,
      )
    }
    const extent = ensurePaintableOuterRing(allRings.flat())
    const extentWkt = packOuterRingsIntoWktChunks([extent], evalscriptB64)[0]
    if (extentWkt) {
      return [
        {
          geometryWkt3857: extentWkt,
          evalscriptB64,
          aoiBoundsLngLat: lngLatBoundsFromOuterRings([extent]),
        },
      ]
    }
    return []
  }

  const evalscriptB64 = buildEvalscriptB64ForLayer(u, options)
  if (evalscriptB64) {
    return [{ geometryWkt3857: null, evalscriptB64 }]
  }

  const clippedPreset = buildSentinelHubWmsAoiClipChunks(drawn, layerName, options)
  if (clippedPreset.length) return capWmsDisplayChunks(clippedPreset, tileCap)

  if (usesSentinelHubWmsClientEvalscript(u)) {
    return []
  }

  return [{ geometryWkt3857: null, evalscriptB64: null }]
}

export function canRenderSentinelHubWmsLayerOnMap(
  layerName: string,
  chunks: SentinelHubWmsAoiClipPart[],
): boolean {
  if (!String(layerName || '').trim() || !chunks.length) return false;
  return chunks.every(
    part => part.evalscriptB64 != null || !usesSentinelHubWmsClientEvalscript(layerName),
  );
}

/** True when WMS raster sources can mount (full canvas or AOI-clipped chunks are consistent). */
export function isSentinelHubWmsRenderReady(
  layerName: string,
  chunks: SentinelHubWmsAoiClipPart[],
  options?: {
    aoiBoundsLngLat?: [number, number, number, number] | null;
  },
): boolean {
  if (!canRenderSentinelHubWmsLayerOnMap(layerName, chunks)) return false;
  const usesAoiClip = chunks.some(part => !!part.geometryWkt3857);
  if (!usesAoiClip) return true;
  return chunks.every(
    part =>
      !!part.geometryWkt3857 &&
      !!(part.aoiBoundsLngLat ?? options?.aoiBoundsLngLat ?? part.geometryWkt3857),
  );
}

/**
 * Builds EPSG:3857 WKT for GEOMETRY=… (same CRS as WMS BBOX) and base64 EVALSCRIPT for RGBA + dataMask alpha.
 */
export function buildSentinelHubWmsAoiClip(
  drawn: unknown,
  layerName: string,
  options?: BuildSentinelHubWmsAoiClipOptions,
): { geometryWkt3857: string | null; evalscriptB64: string | null } {
  const parts = buildSentinelHubWmsDisplayChunks(drawn, layerName, options);
  if (!parts.length) return { geometryWkt3857: null, evalscriptB64: null };
  return parts[0]!;
}
