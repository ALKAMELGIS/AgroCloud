export {
  VECTOR_UPLOAD_EXTENSIONS,
  RASTER_UPLOAD_EXTENSIONS,
  BIM_UPLOAD_EXTENSIONS,
  VECTOR_ACCEPT,
  RASTER_ACCEPT,
  PLAIN_IMAGE_EXTENSIONS,
} from '../../utils/FileLoader';

/** Short chip labels for the vector dropzone. */
export const VECTOR_FORMAT_LABEL_LIST = [
  'SHP ZIP',
  'GeoJSON',
  'TopoJSON',
  'KML/KMZ',
  'GPX',
  'CSV',
  'Excel',
] as const;

/** Short chip labels for the raster dropzone. */
export const RASTER_FORMAT_LABEL_LIST = [
  'GeoTIFF / COG',
  'JP2',
  'PNG / JPG (+ world file / DIMAP)',
  'WebP',
  'GIF',
  'BMP',
] as const;

/** Human-readable labels for vector upload formats. */
export const VECTOR_FORMAT_LABELS: Record<string, string> = {
  geojson: 'GeoJSON',
  json: 'JSON / GeoJSON',
  topojson: 'TopoJSON',
  zip: 'Shapefile ZIP / KMZ / GeoJSON ZIP',
  kml: 'KML',
  kmz: 'KMZ',
  gpx: 'GPX',
  csv: 'CSV (lat/lon or table)',
  xlsx: 'Excel workbook',
  xls: 'Excel (legacy)',
  shp: 'Shapefile (.shp — zip with sidecars)',
  dbf: 'Shapefile attributes',
  shx: 'Shapefile index',
  prj: 'Projection',
  cpg: 'Code page',
};

/** Human-readable labels for raster upload formats. */
export const RASTER_FORMAT_LABELS: Record<string, string> = {
  tif: 'GeoTIFF',
  tiff: 'GeoTIFF',
  png: 'PNG image overlay',
  jpg: 'JPEG image overlay',
  jpeg: 'JPEG image overlay',
  webp: 'WebP image overlay',
  gif: 'GIF image overlay',
  bmp: 'BMP image overlay',
  tfw: 'TIFF world file',
  pgw: 'PNG world file',
  jgw: 'JPEG world file',
  wld: 'Generic world file',
  prj: 'Projection',
};

export const BIM_FORMAT_LABELS: Record<string, string> = {
  ifc: 'IFC (BIM)',
};
