import shp from 'shpjs';
import JSZip from 'jszip';
import Papa from 'papaparse';
import * as toGeoJSON from '@tmcw/togeojson';
import * as XLSX from 'xlsx';

const MAX_PARSE_BYTES = 480 * 1024 * 1024; // soft cap — browser memory still limits practical size

const LAT_KEYS = ['lat', 'latitude', 'y'] as const;
const LON_KEYS = ['lon', 'lng', 'longitude', 'x'] as const;
const WKT_KEYS = ['wkt', 'geometry', 'geom'] as const;

export type RasterMapCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

export type ParsedData =
  | { type: 'geojson'; data: any; filename: string; crsHint?: string }
  | { type: 'table'; data: any[]; filename: string }
  | {
      type: 'raster';
      filename: string;
      previewObjectUrl: string;
      coordinates: RasterMapCoordinates;
      crsHint?: string;
      widthPx: number;
      heightPx: number;
      bands: number;
    }
  | { type: 'bim'; filename: string; byteLength: number };

type ParseOptions = {
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  /**
   * Geographic placement for plain (non-georeferenced) image overlays
   * (PNG/JPG/WebP/GIF/BMP). Normally the caller passes the current map bounds so
   * the image drops onto the visible view. Defaults to a small box near [0,0].
   */
  imagePlacementBounds?: { west: number; south: number; east: number; north: number };
};

/** Raster image formats that carry NO georeferencing (placed on the current view). */
export const PLAIN_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);

function readAsArrayBuffer(file: File, opts?: ParseOptions): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const signal = opts?.signal;

    const abort = () => {
      try {
        reader.abort();
      } catch {
        /* ignore */
      }
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });

    reader.onprogress = e => {
      if (!opts?.onProgress) return;
      if (!e.lengthComputable) return;
      const pct = e.total > 0 ? Math.max(0, Math.min(100, (e.loaded / e.total) * 100)) : 0;
      opts.onProgress(pct);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

function readAsText(file: File, opts?: ParseOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const signal = opts?.signal;

    const abort = () => {
      try {
        reader.abort();
      } catch {
        /* ignore */
      }
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });

    reader.onprogress = e => {
      if (!opts?.onProgress) return;
      if (!e.lengthComputable) return;
      const pct = e.total > 0 ? Math.max(0, Math.min(100, (e.loaded / e.total) * 100)) : 0;
      opts.onProgress(pct);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}

function readSliceAsText(file: File, start: number, end: number): Promise<string> {
  const blob = file.slice(start, end);
  return readAsText(new File([blob], file.name, { type: file.type }), undefined);
}

function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/** shpjs may return a FeatureCollection, a Feature, a Geometry, or an object map of layer name → GeoJSON. */
export function mergeShpLikeToFeatureCollection(geo: unknown): { type: 'FeatureCollection'; features: any[] } {
  if (!geo || typeof geo !== 'object') return { type: 'FeatureCollection', features: [] };
  const g = geo as any;
  /** KML `<MultiGeometry>` and some exports surface as a root or nested GeometryCollection. */
  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
    const feats = g.geometries
      .filter((geom: any) => geom && typeof geom === 'object')
      .map((geom: any) => ({ type: 'Feature', properties: {}, geometry: geom }));
    return mergeShpLikeToFeatureCollection({ type: 'FeatureCollection', features: feats });
  }
  if (g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    return { type: 'FeatureCollection', features: g.features.filter(Boolean) };
  }
  if (g.type === 'Feature') {
    return { type: 'FeatureCollection', features: [g] };
  }
  if (typeof g.type === 'string' && g.type.endsWith('Polygon') && g.coordinates) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] };
  }
  if (typeof g.type === 'string' && (g.type === 'LineString' || g.type === 'Point' || g.type === 'MultiPolygon' || g.type === 'MultiLineString' || g.type === 'MultiPoint')) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] };
  }
  const features: any[] = [];
  for (const v of Object.values(geo as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as any;
    if (o.type === 'FeatureCollection' && Array.isArray(o.features)) {
      features.push(...o.features.filter(Boolean));
    } else if (o.type === 'Feature') {
      features.push(o);
    }
  }
  return { type: 'FeatureCollection', features };
}

function flattenGeometryCollectionPieces(geom: any): any[] {
  if (!geom || typeof geom !== 'object') return [];
  if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    const out: any[] = [];
    for (const inner of geom.geometries) {
      out.push(...flattenGeometryCollectionPieces(inner));
    }
    return out;
  }
  return [geom];
}

export function normalizeGeoJsonEnvelope(data: unknown): { type: 'FeatureCollection'; features: any[] } {
  const merged = mergeShpLikeToFeatureCollection(data);
  const expanded: any[] = [];
  for (const f of merged.features) {
    if (!f || typeof f !== 'object') continue;
    const geom = (f as any).geometry;
    if (!geom || typeof geom !== 'object') continue;
    const pieces = flattenGeometryCollectionPieces(geom);
    if (pieces.length === 0) continue;
    if (pieces.length === 1) {
      expanded.push({ ...f, geometry: pieces[0] });
    } else {
      for (const piece of pieces) {
        expanded.push({ ...f, geometry: piece });
      }
    }
  }
  const cleaned = expanded.filter(
    f => f && f.geometry && typeof f.geometry === 'object' && typeof (f.geometry as any).type === 'string',
  );
  return { type: 'FeatureCollection', features: cleaned };
}

function assertXmlHasNoParserErrors(doc: Document, label: string) {
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err && err.textContent?.trim()) {
    throw new Error(`${label} is not valid XML.`);
  }
}

function findRowKey(row: Record<string, unknown>, candidates: readonly string[]): string | undefined {
  return Object.keys(row).find(k => candidates.includes(k.toLowerCase()));
}

/** Minimal WKT → GeoJSON for POINT / LINESTRING / POLYGON (2D). */
function parseSimpleWkt(wktRaw: string): any | null {
  const wkt = String(wktRaw || '').trim();
  if (!wkt) return null;

  const parsePair = (s: string): [number, number] | null => {
    const parts = s.trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) return null;
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    return [x, y];
  };

  const pointM = /^POINT\s*\(\s*([^)]+)\s*\)$/i.exec(wkt);
  if (pointM) {
    const xy = parsePair(pointM[1]);
    return xy ? { type: 'Point', coordinates: xy } : null;
  }

  const lineM = /^LINESTRING\s*\(\s*(.+)\s*\)$/i.exec(wkt);
  if (lineM) {
    const coords = lineM[1]
      .split(',')
      .map(parsePair)
      .filter((c): c is [number, number] => c !== null);
    return coords.length >= 2 ? { type: 'LineString', coordinates: coords } : null;
  }

  const polyM = /^POLYGON\s*\(\s*\(\s*(.+)\s*\)\s*\)$/i.exec(wkt);
  if (polyM) {
    const ring = polyM[1]
      .split(',')
      .map(parsePair)
      .filter((c): c is [number, number] => c !== null);
    if (ring.length < 3) return null;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first] as [number, number]);
    return { type: 'Polygon', coordinates: [ring] };
  }

  return null;
}

/** Convert tabular rows to GeoJSON points (lat/lon) or WKT geometries, else a plain table. */
function rowsToGeoOrTable(rows: any[], filename: string): ParsedData {
  if (!rows.length) return { type: 'table', data: [], filename };

  const sample = rows[0] as Record<string, unknown>;
  const keys = Object.keys(sample).map(k => k.toLowerCase());
  const hasLat = keys.some(k => (LAT_KEYS as readonly string[]).includes(k));
  const hasLon = keys.some(k => (LON_KEYS as readonly string[]).includes(k));
  const wktKey = findRowKey(sample, WKT_KEYS);

  if (wktKey) {
    const features = rows
      .map((row: any) => {
        const geom = parseSimpleWkt(String(row[wktKey] ?? ''));
        if (!geom) return null;
        return { type: 'Feature', geometry: geom, properties: row };
      })
      .filter(Boolean);
    if (features.length) {
      return { type: 'geojson', data: { type: 'FeatureCollection', features }, filename };
    }
  }

  if (hasLat && hasLon) {
    const latKey = findRowKey(sample, LAT_KEYS);
    const lonKey = findRowKey(sample, LON_KEYS);
    if (latKey && lonKey) {
      const features = rows
        .map((row: any) => {
          const lat = parseFloat(row[latKey]);
          const lon = parseFloat(row[lonKey]);
          if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: row,
          };
        })
        .filter(f => f !== null);
      if (features.length) {
        return { type: 'geojson', data: { type: 'FeatureCollection', features }, filename };
      }
    }
  }

  return { type: 'table', data: rows, filename };
}

/* ── Minimal TopoJSON → GeoJSON (arcs + transform) ─────────────────────── */

function topoPosition(transform: any, x: number, y: number): [number, number] {
  if (!transform) return [x, y];
  const scale = transform.scale || [1, 1];
  const translate = transform.translate || [0, 0];
  return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
}

function decodeTopoArc(topology: any, index: number): number[][] {
  const arcs = topology.arcs;
  if (!Array.isArray(arcs)) return [];
  const reverse = index < 0;
  const i = reverse ? ~index : index;
  const arc = arcs[i];
  if (!Array.isArray(arc) || !arc.length) return [];

  const transform = topology.transform;
  let x = 0;
  let y = 0;
  const coords: number[][] = [];
  for (const p of arc) {
    if (!Array.isArray(p) || p.length < 2) continue;
    x += Number(p[0]) || 0;
    y += Number(p[1]) || 0;
    coords.push(topoPosition(transform, x, y));
  }
  if (reverse) coords.reverse();
  return coords;
}

function stitchTopoArcs(topology: any, arcIndexes: number[]): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < arcIndexes.length; a++) {
    const ring = decodeTopoArc(topology, arcIndexes[a]);
    if (!ring.length) continue;
    if (out.length && ring.length) {
      // Drop duplicate shared vertex between consecutive arcs.
      out.push(...ring.slice(1));
    } else {
      out.push(...ring);
    }
  }
  return out;
}

function topoGeometryToGeoJSON(topology: any, geom: any): any | null {
  if (!geom || typeof geom !== 'object') return null;
  const t = geom.type;

  if (t === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    const geometries = geom.geometries.map((g: any) => topoGeometryToGeoJSON(topology, g)).filter(Boolean);
    return geometries.length ? { type: 'GeometryCollection', geometries } : null;
  }

  if (t === 'Point') {
    const raw = Array.isArray(geom.coordinates) ? geom.coordinates : null;
    if (!raw || raw.length < 2) return null;
    return { type: 'Point', coordinates: topoPosition(topology.transform, Number(raw[0]), Number(raw[1])) };
  }
  if (t === 'MultiPoint') {
    const raw = Array.isArray(geom.coordinates) ? geom.coordinates : null;
    if (!raw) return null;
    return {
      type: 'MultiPoint',
      coordinates: raw.map((p: number[]) => topoPosition(topology.transform, Number(p[0]), Number(p[1]))),
    };
  }

  const arcs = geom.arcs;
  if (t === 'LineString' && Array.isArray(arcs)) {
    return { type: 'LineString', coordinates: stitchTopoArcs(topology, arcs) };
  }
  if (t === 'MultiLineString' && Array.isArray(arcs)) {
    return {
      type: 'MultiLineString',
      coordinates: arcs.map((line: number[]) => stitchTopoArcs(topology, line)),
    };
  }
  if (t === 'Polygon' && Array.isArray(arcs)) {
    return {
      type: 'Polygon',
      coordinates: arcs.map((ring: number[]) => stitchTopoArcs(topology, ring)),
    };
  }
  if (t === 'MultiPolygon' && Array.isArray(arcs)) {
    return {
      type: 'MultiPolygon',
      coordinates: arcs.map((poly: number[][]) => poly.map((ring: number[]) => stitchTopoArcs(topology, ring))),
    };
  }

  // Already-decoded GeoJSON geometry embedded in the topology object.
  if (geom.coordinates && typeof t === 'string') {
    return { type: t, coordinates: geom.coordinates };
  }

  return null;
}

/** Convert a TopoJSON Topology into a GeoJSON FeatureCollection. */
export function topologyToGeoJSON(topology: any): { type: 'FeatureCollection'; features: any[] } {
  if (!topology || topology.type !== 'Topology' || !topology.objects) {
    throw new Error('Not a TopoJSON Topology (expected type "Topology" with objects).');
  }
  const features: any[] = [];

  for (const [name, obj] of Object.entries(topology.objects as Record<string, any>)) {
    if (!obj || typeof obj !== 'object') continue;

    if (obj.type === 'GeometryCollection' && Array.isArray(obj.geometries)) {
      for (const g of obj.geometries) {
        const geometry = topoGeometryToGeoJSON(topology, g);
        if (!geometry) continue;
        features.push({
          type: 'Feature',
          properties: { ...(g.properties || {}), __topoObject: name, ...(g.id != null ? { id: g.id } : {}) },
          geometry,
          ...(g.id != null ? { id: g.id } : {}),
        });
      }
      continue;
    }

    // Single geometry object (or Feature-like).
    if (obj.type === 'Feature' && obj.geometry) {
      const geometry = topoGeometryToGeoJSON(topology, obj.geometry);
      if (geometry) {
        features.push({
          type: 'Feature',
          properties: { ...(obj.properties || {}), __topoObject: name },
          geometry,
        });
      }
      continue;
    }

    const geometry = topoGeometryToGeoJSON(topology, obj);
    if (geometry) {
      if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
        for (const g of geometry.geometries) {
          features.push({
            type: 'Feature',
            properties: { ...(obj.properties || {}), __topoObject: name },
            geometry: g,
          });
        }
      } else {
        features.push({
          type: 'Feature',
          properties: { ...(obj.properties || {}), __topoObject: name, ...(obj.id != null ? { id: obj.id } : {}) },
          geometry,
          ...(obj.id != null ? { id: obj.id } : {}),
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

function parseJsonLikeToParsedData(json: any, filename: string): ParsedData {
  if (json && json.type === 'Topology' && json.objects) {
    const fc = topologyToGeoJSON(json);
    const normalized = normalizeGeoJsonEnvelope(fc);
    if (!normalized.features.length) throw new Error('TopoJSON contains no drawable features.');
    return { type: 'geojson', data: normalized, filename, crsHint: 'TopoJSON' };
  }
  const normalized = normalizeGeoJsonEnvelope(json);
  if (!normalized.features.length) throw new Error('GeoJSON contains no drawable features.');
  return { type: 'geojson', data: normalized, filename };
}

async function parseExcelFile(file: File, opts?: ParseOptions): Promise<ParsedData> {
  const ab = await readAsArrayBuffer(file, opts);
  await yieldToBrowser();
  const wb = XLSX.read(ab, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { type: 'table', data: [], filename: file.name };
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  return rowsToGeoOrTable(rows, file.name);
}

function looksLikeGeographicBbox(w: number, s: number, e: number, n: number): boolean {
  return [w, s, e, n].every(Number.isFinite) && Math.abs(w) <= 180 && Math.abs(e) <= 180 && Math.abs(s) <= 90 && Math.abs(n) <= 90;
}

function mapboxImageCoordinatesFromBounds(west: number, south: number, east: number, north: number): RasterMapCoordinates {
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

/**
 * GeoTIFF → Mapbox-ready raster via the SI georef pipeline (proj4 corners + PNG preview).
 * Projected CRS GeoTIFFs are supported; WGS84-only AABB placement is intentionally not used.
 */
async function parseGeoTiffToRaster(file: File, opts?: ParseOptions): Promise<ParsedData> {
  opts?.onProgress?.(10);
  const { processRasterFiles } = await import('../lib/aiDetection/siAiDlRasterPipeline');
  opts?.onProgress?.(40);
  const result = await processRasterFiles([file], opts?.imagePlacementBounds);
  opts?.onProgress?.(100);
  return {
    type: 'raster',
    filename: file.name,
    previewObjectUrl: result.previewUrl,
    coordinates: result.coordinates,
    crsHint: result.validation.sourceCrs,
    widthPx: result.validation.widthPx,
    heightPx: result.validation.heightPx,
    bands: result.validation.bands,
  };
}

const parseKmz = async (file: File, opts?: ParseOptions): Promise<ParsedData> => {
  const ab = await readAsArrayBuffer(file, opts);
  const zip = await JSZip.loadAsync(ab);
  const kmlFile = Object.values(zip.files).find(f => !f.dir && f.name.toLowerCase().endsWith('.kml'));
  if (kmlFile) {
    const text = await kmlFile.async('string');
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    assertXmlHasNoParserErrors(dom, 'KML');
    const geojson = toGeoJSON.kml(dom);
    return { type: 'geojson', data: normalizeGeoJsonEnvelope(geojson), filename: file.name };
  }
  throw new Error('No KML document found inside this ZIP/KMZ archive.');
};

async function tryZipAsGeoJsonArchive(file: File, opts?: ParseOptions): Promise<ParsedData> {
  const ab = await readAsArrayBuffer(file, opts);
  const zip = await JSZip.loadAsync(ab);
  const candidates = Object.values(zip.files).filter(
    f => !f.dir && /\.(geojson|json)$/i.test(f.name) && !f.name.toLowerCase().includes('metadata'),
  );
  const pick = candidates.sort((a, b) => a.name.length - b.name.length)[0];
  if (!pick) throw new Error('ZIP does not contain a .geojson or .json layer.');
  const text = await pick.async('string');
  const trimmed = text.replace(/^\uFEFF/, '');
  let json: any;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new Error(`Could not parse JSON inside ZIP (${pick.name}).`);
  }
  const normalized = normalizeGeoJsonEnvelope(json);
  if (!normalized.features.length) throw new Error('GeoJSON in ZIP has no usable features.');
  return { type: 'geojson', data: normalized, filename: file.name, crsHint: pick.name };
}

/** Read intrinsic pixel dimensions of an image file (createImageBitmap, with an <img> fallback). */
async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      if (size.width > 0 && size.height > 0) return size;
    }
  } catch {
    /* fall through to <img> */
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
      URL.revokeObjectURL(url);
      if (size.width > 0 && size.height > 0) resolve(size);
      else reject(new Error('Image has no readable dimensions.'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image (unsupported or corrupt file).'));
    };
    img.src = url;
  });
}

/**
 * Aspect-preserving placement of a non-georeferenced image overlay: centred on,
 * and fitted within, the supplied geographic bounds (cos-latitude corrected so
 * the image is not east-west stretched).
 */
function fitImageWithinBounds(
  bounds: { west: number; south: number; east: number; north: number },
  width: number,
  height: number,
): RasterMapCoordinates {
  const cx = (bounds.east + bounds.west) / 2;
  const cy = (bounds.north + bounds.south) / 2;
  const cosLat = Math.max(1e-6, Math.cos((cy * Math.PI) / 180));
  const viewWm = Math.abs(bounds.east - bounds.west) * cosLat;
  const viewHm = Math.abs(bounds.north - bounds.south);
  const imgAspect = width > 0 && height > 0 ? width / height : 1;
  // Fit the image rectangle inside the view rectangle, preserving aspect.
  let wm = viewWm;
  let hm = wm / imgAspect;
  if (hm > viewHm) {
    hm = viewHm;
    wm = hm * imgAspect;
  }
  const halfWdeg = wm / cosLat / 2;
  const halfHdeg = hm / 2;
  return mapboxImageCoordinatesFromBounds(cx - halfWdeg, cy - halfHdeg, cx + halfWdeg, cy + halfHdeg);
}

/**
 * Parse a plain raster image (PNG/JPG/WebP/GIF/BMP) into a map-ready overlay.
 * These formats carry no CRS, so the overlay is placed on the current map view
 * (passed via `opts.imagePlacementBounds`) preserving the image aspect ratio.
 */
async function parsePlainImageToRaster(file: File, opts?: ParseOptions): Promise<ParsedData> {
  const { width, height } = await readImageSize(file);
  const bounds =
    opts?.imagePlacementBounds && Number.isFinite(opts.imagePlacementBounds.west)
      ? opts.imagePlacementBounds
      : { west: -0.05, south: -0.05, east: 0.05, north: 0.05 };
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const bands = ext === 'png' || ext === 'webp' || ext === 'gif' ? 4 : 3;
  return {
    type: 'raster',
    filename: file.name,
    // PNG/JPG/… can be used directly as a Mapbox image-source URL (no re-encode).
    previewObjectUrl: URL.createObjectURL(file),
    coordinates: fitImageWithinBounds(bounds, width, height),
    crsHint: 'Image overlay (no georeferencing — placed on current map view)',
    widthPx: width,
    heightPx: height,
    bands,
  };
}

export const parseFile = async (file: File, opts?: ParseOptions): Promise<ParsedData> => {
  const filename = file.name;
  if (file.size > MAX_PARSE_BYTES) {
    throw new Error(`File is too large (${Math.round(file.size / (1024 * 1024))} MB). Try splitting or compressing before upload.`);
  }
  const extension = filename.split('.').pop()?.toLowerCase();

  if (extension === 'zip') {
    try {
      const arrayBuffer = await readAsArrayBuffer(file, opts);
      await yieldToBrowser();
      const raw = await shp(arrayBuffer);
      const geojson = mergeShpLikeToFeatureCollection(raw);
      if (!geojson.features.length) throw new Error('Shapefile ZIP parsed but contains no features.');
      return { type: 'geojson', data: geojson, filename };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        return await parseKmz(file, opts);
      } catch {
        try {
          return await tryZipAsGeoJsonArchive(file, opts);
        } catch {
          throw new Error(
            `Could not read this ZIP as shapefile, KMZ, or GeoJSON archive. (${msg})`,
          );
        }
      }
    }
  } else if (extension === 'kmz') {
    return parseKmz(file, opts);
  } else if (extension === 'kml') {
    const text = await readAsText(file, opts);
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    assertXmlHasNoParserErrors(dom, 'KML');
    const geojson = toGeoJSON.kml(dom);
    return { type: 'geojson', data: normalizeGeoJsonEnvelope(geojson), filename };
  } else if (extension === 'gpx') {
    const text = await readAsText(file, opts);
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    assertXmlHasNoParserErrors(dom, 'GPX');
    const geojson = (toGeoJSON as any).gpx(dom);
    return { type: 'geojson', data: normalizeGeoJsonEnvelope(geojson), filename };
  } else if (extension === 'json' || extension === 'geojson' || extension === 'topojson') {
    const text = await readAsText(file, opts);
    const trimmed = text.replace(/^\uFEFF/, '');
    let json: any;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new Error(
        extension === 'topojson'
          ? 'Invalid JSON — file is not valid TopoJSON.'
          : 'Invalid JSON — file is not valid GeoJSON.',
      );
    }
    return parseJsonLikeToParsedData(json, filename);
  } else if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: results => {
          resolve(rowsToGeoOrTable(results.data as any[], filename));
        },
        error: (err: any) => reject(err),
      });
    });
  } else if (extension === 'xlsx' || extension === 'xls') {
    return parseExcelFile(file, opts);
  } else if (extension === 'shp') {
    throw new Error('Please compress your Shapefile (.shp, .shx, .dbf, …) into a single .zip before uploading.');
  } else if (extension === 'tif' || extension === 'tiff') {
    return parseGeoTiffToRaster(file, opts);
  } else if (extension && PLAIN_IMAGE_EXTENSIONS.has(extension)) {
    return parsePlainImageToRaster(file, opts);
  } else if (extension === 'ifc') {
    if (file.size < 32) throw new Error('IFC file is empty or truncated.');
    const head = await readSliceAsText(file, 0, Math.min(8192, file.size));
    if (!/ISO-10303-21/i.test(head)) {
      throw new Error('Not a valid IFC STEP physical file (expected ISO-10303-21 header).');
    }
    return { type: 'bim', filename, byteLength: file.size };
  } else {
    throw new Error(`Unsupported file type: .${extension || 'unknown'}`);
  }
};

function safeBasename(name: string): string {
  const n = name.replace(/[/\\]/g, '').trim();
  return n || 'download';
}

function filenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(cd);
  if (star?.[1]) {
    try {
      return safeBasename(decodeURIComponent(star[1].replace(/^"+|"+$/g, '')));
    } catch {
      return safeBasename(star[1]);
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(cd);
  if (quoted?.[1]) return safeBasename(quoted[1]);
  const plain = /filename\s*=\s*([^;\s]+)/i.exec(cd);
  if (plain?.[1]) return safeBasename(plain[1].replace(/^"+|"+$/g, ''));
  return null;
}

function basenameFromUrl(u: URL): string | null {
  const parts = u.pathname.split('/').filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : '';
  if (!last) return null;
  try {
    return safeBasename(decodeURIComponent(last));
  } catch {
    return safeBasename(last);
  }
}

function extensionFromMime(mime: string | null): string | null {
  if (!mime) return null;
  const base = mime.split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'application/geo+json': 'geojson',
    'application/json': 'json',
    'text/csv': 'csv',
    'text/xml': 'xml',
    'application/xml': 'xml',
    'application/vnd.google-earth.kml+xml': 'kml',
    'application/vnd.google-earth.kmz': 'kmz',
    'image/tiff': 'tiff',
    'image/geotiff': 'tiff',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
  };
  return map[base] ?? null;
}

/** Fetch a remote URL and build a `File` so existing `parseFile` logic can import it (GeoJSON, KML, CSV zip, etc.). */
export async function parseRemoteUrlAsFile(url: string, opts?: ParseOptions): Promise<File> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error('Invalid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }

  const res = await fetch(parsed.toString(), { method: 'GET', signal: opts?.signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch URL (${res.status}).`);
  }

  const blob = await res.blob();
  let filename =
    filenameFromContentDisposition(res.headers.get('content-disposition')) ?? basenameFromUrl(parsed) ?? 'layer';

  if (!/\.[a-z0-9]{2,8}$/i.test(filename)) {
    const ext = extensionFromMime(res.headers.get('content-type') || blob.type || null);
    if (ext) filename = `${filename}.${ext}`;
  }

  return new File([blob], filename, { type: blob.type || res.headers.get('content-type') || undefined });
}

/** Honest vector formats accepted by the map upload UI / parseFile. */
export const VECTOR_UPLOAD_EXTENSIONS = [
  'geojson',
  'json',
  'topojson',
  'zip',
  'kml',
  'kmz',
  'gpx',
  'csv',
  'xlsx',
  'xls',
  'shp',
] as const;

export const RASTER_UPLOAD_EXTENSIONS = ['tif', 'tiff', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] as const;

export const BIM_UPLOAD_EXTENSIONS = ['ifc'] as const;

export const VECTOR_ACCEPT =
  '.geojson,.json,.topojson,.zip,.kml,.kmz,.gpx,.csv,.xlsx,.xls,.shp,.dbf,.shx,.prj,.cpg';

export const RASTER_ACCEPT = '.tif,.tiff,.geotiff,.jp2,.j2k,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tfw,.pgw,.jgw,.jpgw,.wld,.prj,.xml,.aux.xml';

