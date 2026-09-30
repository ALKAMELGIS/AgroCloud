export type ThreeDLayerKind =
  | '3d-object'
  | 'building'
  | 'mesh'
  | 'gaussian-splat'
  | 'point-cloud'
  | '3d-point'
  | 'voxel'

export type ThreeDLayerCreateMethod = 'define-own' | 'upload-data'

export const GIS_3D_LAYER_LEARN_MORE_URL =
  'https://doc.arcgis.com/en/arcgis-online/manage-data/publish-scenes.htm'

export const GIS_3D_LAYER_TYPES: {
  id: ThreeDLayerKind
  title: string
  description: string
}[] = [
  {
    id: '3d-object',
    title: '3D object layer',
    description:
      'Each 3D model is represented as a single feature. You can work with formats such as glTF, OBJ, OpenUSD, IFC, Collada or FBX.',
  },
  {
    id: 'building',
    title: 'Building layer',
    description: 'Each BIM model is represented in a hierarchical structure organizing many features.',
  },
  {
    id: 'mesh',
    title: 'Mesh layer',
    description: 'A continuous meshed surface generated from lidar or photogrammetry.',
  },
  {
    id: 'gaussian-splat',
    title: 'Gaussian splat layer',
    description: 'A photorealistic representation generated from photogrammetry.',
  },
  {
    id: 'point-cloud',
    title: 'Point cloud layer',
    description: 'A dense collection of spatial points captured from lidar or photogrammetry.',
  },
  {
    id: '3d-point',
    title: '3D point layer',
    description:
      'Point features with labels, marker symbols, or 3D symbols optimized for fast visualization in 3D scenes.',
  },
  {
    id: 'voxel',
    title: 'Voxel layer',
    description: 'A volumetric representation of spatial data organized into regular 3D grids.',
  },
]

export const GIS_3D_LAYER_CREATE_METHODS: {
  id: ThreeDLayerCreateMethod
  title: string
  description: string
}[] = [
  {
    id: 'define-own',
    title: 'Define your own layer',
    description: 'Specify an empty layer that you can edit and search.',
  },
  {
    id: 'upload-data',
    title: 'Upload data',
    description: 'Upload a package or zipped data source from your local drive.',
  },
]

export const GIS_3D_UPLOAD_ACCEPT =
  '.gltf,.glb,.obj,.usd,.usdz,.ifc,.dae,.fbx,.zip,.las,.laz,.ply,.slp,.3tz,.3ds,.json'

export function threeDLayerDefaultName(kind: ThreeDLayerKind): string {
  const item = GIS_3D_LAYER_TYPES.find(t => t.id === kind)
  return item ? `${item.title.replace(/\s+layer$/i, '')}_1` : '3D_Layer_1'
}
