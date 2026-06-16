export type FeatureLayerMethod =
  | 'define-own'
  | 'existing'
  | 'template'
  | 'arcgis-url'
  | 'upload'

export type FeatureLayerGeometryType = 'point' | 'line' | 'polygon'

export const GIS_FEATURE_LAYER_METHODS: {
  id: FeatureLayerMethod
  title: string
  description: string
  icon: string
}[] = [
  {
    id: 'define-own',
    title: 'Define your own layer',
    description: 'Specify the layers and tables.',
    icon: 'fa-regular fa-square',
  },
  {
    id: 'existing',
    title: 'Select an existing feature layer',
    description: 'Use the layers and fields from an existing feature layer in your organization.',
    icon: 'fa-solid fa-layer-group',
  },
  {
    id: 'template',
    title: 'Use a template',
    description: 'Use the layers and fields from a template.',
    icon: 'fa-solid fa-file-circle-plus',
  },
  {
    id: 'arcgis-url',
    title: 'Provide an ArcGIS Server layer URL',
    description: 'Use the layer and fields from an ArcGIS Server feature layer.',
    icon: 'fa-solid fa-link',
  },
  {
    id: 'upload',
    title: 'Upload a file',
    description:
      'Use the layers, fields, and the data contained in a CSV, Excel, Shapefile or other supported file type.',
    icon: 'fa-solid fa-arrow-up-from-bracket',
  },
]

export const GIS_FEATURE_LAYER_GEOMETRY_TYPES: {
  id: FeatureLayerGeometryType
  label: string
  icon: string
}[] = [
  { id: 'point', label: 'Point layer', icon: 'fa-solid fa-location-crosshairs' },
  { id: 'line', label: 'Line layer', icon: 'fa-solid fa-bezier-curve' },
  { id: 'polygon', label: 'Polygon layer', icon: 'fa-solid fa-draw-polygon' },
]

export type GisExistingFeatureLayer = {
  id: string
  title: string
  modified: string
  owner: string
  thumbVariant: 'world' | 'fields' | 'sensors' | 'valves' | 'default'
}

export const GIS_EXISTING_FEATURE_LAYERS: GisExistingFeatureLayer[] = [
  { id: 'fl-world', title: 'World_Countries', modified: 'May 5, 2020', owner: 'Elite Agro Projects LLC', thumbVariant: 'world' },
  { id: 'fl-valve', title: 'Irrigation_Valve', modified: 'Apr 12, 2026', owner: 'Elite Agro Projects LLC', thumbVariant: 'valves' },
  { id: 'fl-sensors', title: 'Irrigation_Sensors', modified: 'Apr 10, 2026', owner: 'Elite Agro Projects LLC', thumbVariant: 'sensors' },
]

export const GIS_FEATURE_LAYER_TEMPLATES: GisExistingFeatureLayer[] = [
  { id: 'tpl-point', title: 'Editable point template', modified: 'Template', owner: 'Elite Agro Projects LLC', thumbVariant: 'default' },
  { id: 'tpl-line', title: 'Utility line template', modified: 'Template', owner: 'Elite Agro Projects LLC', thumbVariant: 'default' },
  { id: 'tpl-polygon', title: 'Field boundary template', modified: 'Template', owner: 'Elite Agro Projects LLC', thumbVariant: 'fields' },
]

export const GIS_SUPPORTED_UPLOAD_TYPES =
  'https://doc.arcgis.com/en/arcgis-online/manage-data/supported-data-types.htm'

export const GIS_ARCGIS_URL_PLACEHOLDER =
  'https://myserver.com/arcgis/rest/services/folder/service/FeatureServer'
