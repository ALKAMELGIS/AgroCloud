import {
  buildAgroStructureFieldOptions,
  type AcpStructureFieldOption,
} from '../../dashboards/agroCloudPlatform/acpMapSpatial';
import type { SiAoiFieldRecord } from '../../../lib/siAoiFields';

export const SI_IMAGERY_COMMITTED_AOI_KEY = '__aoi__';
export const SI_IMAGERY_DRAW_AOI_ACTION_KEY = '__draw_aoi__';

export type ImageryAoiGeometryType = 'polygon' | 'rectangle' | 'point';

export type ImageryAoiSource = 'field' | 'draw' | 'saved' | 'current';

export type ImageryAoi = {
  id: string;
  type: ImageryAoiGeometryType;
  geometry: GeoJSON.Geometry | null;
  area: number | null;
  centroid: { lat: number; lng: number } | null;
  source: ImageryAoiSource;
  label: string;
};

export type ImageryFieldAoiOptionKind =
  | 'field'
  | 'action'
  | 'current-aoi'
  | 'saved-aoi';

export type ImageryFieldAoiOption = AcpStructureFieldOption & {
  kind: ImageryFieldAoiOptionKind;
  disabled?: boolean;
};

export type ImageryFieldAoiOptionGroups = {
  fields: ImageryFieldAoiOption[];
  aoi: ImageryFieldAoiOption[];
};

export function flattenImageryFieldAoiOptions(
  groups: ImageryFieldAoiOptionGroups,
): ImageryFieldAoiOption[] {
  return [...groups.fields, ...groups.aoi.filter(o => o.kind !== 'action')];
}

export function isImageryFieldAoiActionKey(fieldKey: string): boolean {
  return fieldKey === SI_IMAGERY_DRAW_AOI_ACTION_KEY;
}

export function buildSiImageryFieldAoiOptionGroups(
  agroStructuresMask: GeoJSON.FeatureCollection | null | undefined,
  aoiFields: SiAoiFieldRecord[],
  committedAoiGeometry: GeoJSON.Geometry | null | undefined,
): ImageryFieldAoiOptionGroups {
  const fields: ImageryFieldAoiOption[] = buildAgroStructureFieldOptions(agroStructuresMask).map(opt => ({
    ...opt,
    kind: 'field' as const,
  }));

  const hasCurrentMapAoi = Boolean(committedAoiGeometry);

  const aoi: ImageryFieldAoiOption[] = [
    {
      fieldKey: SI_IMAGERY_DRAW_AOI_ACTION_KEY,
      displayName: '+ Draw AOI',
      objectId: 'draw',
      kind: 'action',
    },
    {
      fieldKey: SI_IMAGERY_COMMITTED_AOI_KEY,
      displayName: 'Current Map AOI',
      objectId: 'aoi',
      kind: 'current-aoi',
      disabled: !hasCurrentMapAoi,
    },
    ...aoiFields
      .map(f => ({
        fieldKey: f.id,
        displayName: f.name,
        objectId: f.id,
        kind: 'saved-aoi' as const,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })),
  ];

  return { fields, aoi };
}

function inferGeometryType(geometry: GeoJSON.Geometry | null | undefined): ImageryAoiGeometryType {
  if (!geometry) return 'polygon';
  if (geometry.type === 'Point') return 'point';
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') return 'polygon';
  return 'polygon';
}

export function buildImageryAoiFromFieldKey(input: {
  fieldKey: string;
  label: string;
  geometry: GeoJSON.Geometry | null | undefined;
  areaHa?: number | null;
  centroid?: [number, number] | null;
  source: ImageryAoiSource;
}): ImageryAoi | null {
  if (!input.geometry) return null;
  const [lng, lat] = input.centroid ?? [0, 0];
  return {
    id: input.fieldKey,
    type: inferGeometryType(input.geometry),
    geometry: input.geometry,
    area: input.areaHa != null ? input.areaHa * 10_000 : null,
    centroid: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    source: input.source,
    label: input.label,
  };
}

/** @deprecated Use buildSiImageryFieldAoiOptionGroups — kept for callers expecting flat field list. */
export function buildSiImageryFieldOptions(
  agroStructuresMask: GeoJSON.FeatureCollection | null | undefined,
  aoiFields: SiAoiFieldRecord[],
  committedAoiGeometry: GeoJSON.Geometry | null | undefined,
): AcpStructureFieldOption[] {
  const groups = buildSiImageryFieldAoiOptionGroups(
    agroStructuresMask,
    aoiFields,
    committedAoiGeometry,
  );
  const flat = flattenImageryFieldAoiOptions(groups);
  if (flat.length) return flat;
  return [];
}
