import { resolveAgroStructureFieldByKey } from '../../dashboards/agroCloudPlatform/acpMapSpatial';import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine';
import type { SiAoiFieldRecord } from '../../../lib/siAoiFields';
import {
  SI_IMAGERY_COMMITTED_AOI_KEY,
} from './siImageryTimeSeriesAoi';

export {
  buildSiImageryFieldAoiOptionGroups,
  buildSiImageryFieldOptions,
  flattenImageryFieldAoiOptions,
  SI_IMAGERY_COMMITTED_AOI_KEY,
  SI_IMAGERY_DRAW_AOI_ACTION_KEY,
  type ImageryAoi,
  type ImageryFieldAoiOptionGroups,
} from './siImageryTimeSeriesAoi';

function ringCentroid(ring: number[][]): [number, number] {
  if (!ring.length) return [0, 0];
  let sx = 0;
  let sy = 0;
  const n =
    ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.length - 1
      : ring.length;
  for (let i = 0; i < n; i++) {
    sx += ring[i]![0];
    sy += ring[i]![1];
  }
  const d = Math.max(1, n);
  return [sx / d, sy / d];
}

function geometryCentroid(geometry: GeoJSON.Geometry): [number, number] {
  if (geometry.type === 'Point') return [geometry.coordinates[0]!, geometry.coordinates[1]!];
  if (geometry.type === 'Polygon' && geometry.coordinates[0]?.length) {
    return ringCentroid(geometry.coordinates[0] as number[][]);
  }
  if (geometry.type === 'MultiPolygon' && geometry.coordinates[0]?.[0]?.length) {
    return ringCentroid(geometry.coordinates[0]![0] as number[][]);
  }
  return [0, 0];
}

export function resolveSiImageryField(
  agroStructuresMask: GeoJSON.FeatureCollection | null | undefined,
  aoiFields: SiAoiFieldRecord[],
  committedAoiGeometry: GeoJSON.Geometry | null | undefined,
  fieldKey: string,
): CropAlertFieldInput | null {
  const agro = resolveAgroStructureFieldByKey(agroStructuresMask, fieldKey);
  if (agro) return agro;
  if (fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY && committedAoiGeometry) {
    return {
      fieldKey,
      objectId: 'aoi',
      farmName: 'Current Map AOI',
      farmCode: '',
      structureType: 'AOI',
      country: '',
      city: '',
      centroid: geometryCentroid(committedAoiGeometry),
      geometry: committedAoiGeometry,
    };
  }
  const sketch = aoiFields.find(f => f.id === fieldKey);
  if (!sketch) return null;
  return {
    fieldKey: sketch.id,
    objectId: sketch.id,
    farmName: sketch.name,
    farmCode: '',
    structureType: 'Field',
    country: '',
    city: '',
    centroid: sketch.centroid,
    geometry: sketch.geometry,
  };
}
