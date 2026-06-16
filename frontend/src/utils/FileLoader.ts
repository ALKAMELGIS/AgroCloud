import shp from 'shpjs';
import JSZip from 'jszip';
import Papa from 'papaparse';
import * as toGeoJSON from '@tmcw/togeojson';

const MAX_PARSE_BYTES = 480 * 1024 * 1024; // soft cap — browser memory still limits practical size

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
};

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

async function parseGeoTiffToRaster(file: File, opts?: ParseOptions): Promise<ParsedData> {
  let fromArrayBuffer: (buf: ArrayBuffer) => Promise<any>;
  try {
    ({ fromArrayBuffer } = await import('geotiff'));
  } catch {
    throw new Error(
      'GeoTIFF reader is not installed. From the frontend folder run: npm install geotiff — then reload the app.',
    );
  }

  const ab = await readAsArrayBuffer(file, opts);
  await yieldToBrowser();
  const tiff = await fromArrayBuffer(ab);
  const image = await tiff.getImage();
  const bbox = image.getBoundingBox();
  const [w, s, e1, n] = bbox;
  if (!looksLikeGeographicBbox(w, s, e1, n)) {
    throw new Error(
      'GeoTIFF extent is not in WGS84 lon/lat. Reproject to EPSG:4326 (or use a GeoTIFF with geographic GeoKeys) and upload again.',
    );
  }
  const west = Math.min(w, e1);
  const east = Math.max(w, e1);
  const south = Math.min(s, n);
  const north = Math.max(s, n);

  const iw = image.getWidth();
  const ih = image.getHeight();
  const maxDim = 2048;
  const scale = Math.min(1, maxDim / Math.max(iw, ih, 1));
  const tw = Math.max(1, Math.floor(iw * scale));
  const th = Math.max(1, Math.floor(ih * scale));

  const samples = image.getSamplesPerPixel();
  const rasters = await image.readRasters(
    samples >= 3 ? { width: tw, height: th, interleave: true } : { width: tw, height: th },
  );
  await yieldToBrowser();

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas for GeoTIFF preview.');

  const imgData = ctx.createImageData(tw, th);
  const out = imgData.data;

  if (samples >= 3 && rasters && (rasters as any).length >= tw * th * 3) {
    const data = rasters as any as ArrayLike<number>;
    let mx = 1e-9;
    const px = tw * th;
    for (let i = 0; i < px * 3; i++) {
      const v = Math.abs(Number(data[i]));
      if (Number.isFinite(v) && v > mx) mx = v;
    }
    const scale = mx > 255 ? 255 / mx : 1;
    let p = 0;
    for (let i = 0; i < px; i++) {
      const o = i * 3;
      out[p++] = Math.min(255, Math.max(0, Math.round(Number(data[o]) * scale)));
      out[p++] = Math.min(255, Math.max(0, Math.round(Number(data[o + 1]) * scale)));
      out[p++] = Math.min(255, Math.max(0, Math.round(Number(data[o + 2]) * scale)));
      out[p++] = 255;
    }
  } else {
    const band0 = Array.isArray(rasters) ? (rasters as any)[0] : rasters;
    const flat: number[] = band0 && (band0 as any).length ? Array.from(band0 as any) : [];
    let mn = Number.POSITIVE_INFINITY;
    let mx = Number.NEGATIVE_INFINITY;
    for (const v of flat) {
      if (!Number.isFinite(v)) continue;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx) || mx <= mn) {
      mn = 0;
      mx = 255;
    }
    for (let i = 0; i < tw * th; i++) {
      const v = flat[i];
      const t = Number.isFinite(v) ? (v - mn) / (mx - mn) : 0;
      const g = Math.max(0, Math.min(255, Math.round(t * 255)));
      const o = i * 4;
      out[o] = g;
      out[o + 1] = g;
      out[o + 2] = g;
      out[o + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const previewObjectUrl = await new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('GeoTIFF preview encoding failed.'));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      'image/png',
      0.92,
    );
  });

  let crsHint: string | undefined;
  try {
    const fd = image.getFileDirectory?.() as any;
    const gk = fd?.GeoKeyDirectory;
    if (gk && typeof gk === 'object') crsHint = `GeoKeys present (${Object.keys(gk).length} entries)`;
  } catch {
    /* ignore */
  }

  return {
    type: 'raster',
    filename: file.name,
    previewObjectUrl,
    coordinates: mapboxImageCoordinatesFromBounds(west, south, east, north),
    crsHint,
    widthPx: iw,
    heightPx: ih,
    bands: samples,
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
  } else if (extension === 'json' || extension === 'geojson') {
    const text = await readAsText(file, opts);
    const trimmed = text.replace(/^\uFEFF/, '');
    let json: any;
    try {
      json = JSON.parse(trimmed);
    } catch (err) {
      throw new Error('Invalid JSON — file is not valid GeoJSON.');
    }
    const normalized = normalizeGeoJsonEnvelope(json);
    if (!normalized.features.length) throw new Error('GeoJSON contains no drawable features.');
    return { type: 'geojson', data: normalized, filename };
  } else if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: results => {
          const rows = results.data as any[];
          if (rows.length === 0) {
            resolve({ type: 'table', data: [], filename });
            return;
          }

          const keys = Object.keys(rows[0]).map(k => k.toLowerCase());
          const hasLat = keys.some(k => k === 'lat' || k === 'latitude' || k === 'y');
          const hasLon = keys.some(k => k === 'lon' || k === 'lng' || k === 'longitude' || k === 'x');

          if (hasLat && hasLon) {
            const latKey = Object.keys(rows[0]).find(k => ['lat', 'latitude', 'y'].includes(k.toLowerCase()));
            const lonKey = Object.keys(rows[0]).find(k => ['lon', 'lng', 'longitude', 'x'].includes(k.toLowerCase()));

            if (latKey && lonKey) {
              const features = rows
                .map((row: any) => {
                  const lat = parseFloat(row[latKey]);
                  const lon = parseFloat(row[lonKey]);
                  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
                  return {
                    type: 'Feature',
                    geometry: {
                      type: 'Point',
                      coordinates: [lon, lat],
                    },
                    properties: row,
                  };
                })
                .filter(f => f !== null);

              resolve({
                type: 'geojson',
                data: { type: 'FeatureCollection', features },
                filename,
              });
              return;
            }
          }

          resolve({ type: 'table', data: rows, filename });
        },
        error: (err: any) => reject(err),
      });
    });
  } else if (extension === 'xlsx' || extension === 'xls') {
    throw new Error('Excel upload is not supported here. Please convert to CSV.');
  } else if (extension === 'shp') {
    throw new Error('Please compress your Shapefile (.shp, .shx, .dbf, …) into a single .zip before uploading.');
  } else if (extension === 'tif' || extension === 'tiff') {
    return parseGeoTiffToRaster(file, opts);
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
