export type VectorPreviewInfo = {
  filename: string;
  bytes: number;
  geometryTypes: string[];
  featureCount: number;
  emptyGeometryCount: number;
  bbox: [number, number, number, number] | null;
  sampleFields: string[];
  crsHint?: string;
  /** Rough client-side memory estimate in bytes (geometry + properties). */
  memoryEstimate: number;
};

export type RasterPreviewInfo = {
  filename: string;
  bytes: number;
  widthPx?: number;
  heightPx?: number;
  bands?: number;
  crsHint?: string;
  coordinates?: [[number, number], [number, number], [number, number], [number, number]];
};

export type ValidationIssue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
};

function expandBbox(
  bbox: [number, number, number, number] | null,
  lng: number,
  lat: number,
): [number, number, number, number] {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return bbox ?? [0, 0, 0, 0];
  if (!bbox) return [lng, lat, lng, lat];
  return [Math.min(bbox[0], lng), Math.min(bbox[1], lat), Math.max(bbox[2], lng), Math.max(bbox[3], lat)];
}

function walkCoords(coords: unknown, visit: (lng: number, lat: number) => void) {
  if (!Array.isArray(coords) || coords.length === 0) return;
  if (typeof coords[0] === 'number') {
    visit(Number(coords[0]), Number(coords[1]));
    return;
  }
  for (const c of coords) walkCoords(c, visit);
}

/** Build a lightweight summary of a GeoJSON FeatureCollection (or Feature). */
export function buildVectorPreview(
  geojson: any,
  filename: string,
  bytes: number,
  crsHintOverride?: string,
): VectorPreviewInfo {
  const features: any[] =
    geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)
      ? geojson.features
      : geojson?.type === 'Feature'
        ? [geojson]
        : [];

  const typeSet = new Set<string>();
  let bbox: [number, number, number, number] | null = null;
  const fieldSet = new Set<string>();
  let emptyGeometryCount = 0;

  for (const f of features) {
    const geom = f?.geometry;
    const gType = geom && typeof geom === 'object' ? String(geom.type || '') : '';
    if (!gType) {
      emptyGeometryCount += 1;
      continue;
    }
    typeSet.add(gType);
    if (geom.coordinates) {
      walkCoords(geom.coordinates, (lng, lat) => {
        bbox = expandBbox(bbox, lng, lat);
      });
    }
    const props = f?.properties;
    if (props && typeof props === 'object') {
      for (const k of Object.keys(props)) {
        if (fieldSet.size < 24) fieldSet.add(k);
      }
    }
  }

  const crsHint =
    crsHintOverride ||
    (typeof geojson?.crs === 'object' && geojson.crs
      ? String(geojson.crs.properties?.name || geojson.crs.type || 'crs present')
      : typeof geojson?.crsHint === 'string'
        ? geojson.crsHint
        : undefined);

  const memoryEstimate = Math.max(
    bytes,
    features.length * 220 + fieldSet.size * 32 + (bbox ? 64 : 0),
  );

  return {
    filename,
    bytes,
    geometryTypes: [...typeSet].sort(),
    featureCount: features.length,
    emptyGeometryCount,
    bbox: bbox && Number.isFinite(bbox[0]) ? bbox : null,
    sampleFields: [...fieldSet],
    crsHint,
    memoryEstimate,
  };
}

/** Lightweight stub preview for raster / BIM / table staging cards. */
export function buildStubPreview(input: {
  filename: string;
  bytes: number;
  geometryType: string;
  crsHint?: string;
  featureCount?: number;
  fields?: string[];
}): VectorPreviewInfo {
  return {
    filename: input.filename,
    bytes: input.bytes,
    geometryTypes: [input.geometryType],
    featureCount: input.featureCount ?? 0,
    emptyGeometryCount: 0,
    bbox: null,
    sampleFields: input.fields ?? [],
    crsHint: input.crsHint,
    memoryEstimate: Math.max(input.bytes, 1024),
  };
}

/** Derive user-facing validation issues from a vector preview. */
export function buildValidationIssues(preview: VectorPreviewInfo): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Rasters carry no vector geometry by design, so the "no drawable features" error must
  // never apply to them — georeferencing is resolved during import. Show an informational
  // note instead. (Tables/other vector types still flag missing geometry below.)
  const isRaster = preview.geometryTypes.includes('raster');

  if (isRaster) {
    issues.push({
      severity: 'info',
      code: 'raster_layer',
      message: 'Raster layer — georeferencing is checked on import; no vector features expected.',
    });
  } else if (preview.featureCount === 0) {
    issues.push({
      severity: 'error',
      code: 'missing_features',
      message: 'No drawable features found in this layer.',
    });
  }

  if (!preview.crsHint) {
    issues.push({
      severity: 'warning',
      code: 'missing_crs',
      message: 'No CRS metadata detected — coordinates are assumed to be WGS84 lon/lat.',
    });
  }

  if (
    !isRaster &&
    (preview.emptyGeometryCount > 0 ||
      (preview.featureCount > 0 && (!preview.bbox || preview.geometryTypes.length === 0)))
  ) {
    issues.push({
      severity: 'error',
      code: 'empty_geom',
      message:
        preview.emptyGeometryCount > 0
          ? `${preview.emptyGeometryCount} feature(s) have missing or empty geometry.`
          : 'Features are present but geometry is missing or empty.',
    });
  }

  if (preview.bytes > 80 * 1024 * 1024) {
    issues.push({
      severity: 'warning',
      code: 'large_file',
      message: `Large file (~${Math.round(preview.bytes / (1024 * 1024))} MB) may be slow in the browser.`,
    });
  }

  return issues;
}
