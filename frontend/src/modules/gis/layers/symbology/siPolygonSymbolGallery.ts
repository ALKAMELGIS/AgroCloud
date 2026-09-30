import type { SiStrokeStyle } from './siSymbolStyleStudio'

/** ArcGIS Pro–style polygon symbol presets (2D outline + land-use fills). */
export type SiPolygonSymbolGalleryItem = {
  id: string
  label: string
  category: 'Outlines' | 'Land Use' | 'Agriculture'
  fillColor: string
  strokeColor: string
  weight: number
  strokeStyle: SiStrokeStyle
  /** 0 = hollow (outline only), like ArcGIS Black Outline. */
  polygonFillAlpha: number
}

export const SI_POLYGON_SYMBOL_CATEGORIES = ['All', 'Outlines', 'Land Use', 'Agriculture'] as const

export const SI_POLYGON_SYMBOL_GALLERY: SiPolygonSymbolGalleryItem[] = [
  // Outlines — ArcGIS Pro “Black Outline” family
  {
    id: 'poly-black-outline',
    label: 'Black Outline',
    category: 'Outlines',
    fillColor: '#000000',
    strokeColor: '#000000',
    weight: 1.5,
    strokeStyle: 'solid',
    polygonFillAlpha: 0,
  },
  {
    id: 'poly-black-outline-thick',
    label: 'Black Outline (thick)',
    category: 'Outlines',
    fillColor: '#000000',
    strokeColor: '#000000',
    weight: 3.5,
    strokeStyle: 'solid',
    polygonFillAlpha: 0,
  },
  {
    id: 'poly-dashed-black',
    label: 'Dashed Black Outline',
    category: 'Outlines',
    fillColor: '#000000',
    strokeColor: '#000000',
    weight: 2,
    strokeStyle: 'dashed',
    polygonFillAlpha: 0,
  },
  {
    id: 'poly-dotted-black',
    label: 'Dotted Black Outline',
    category: 'Outlines',
    fillColor: '#000000',
    strokeColor: '#000000',
    weight: 2,
    strokeStyle: 'dotted',
    polygonFillAlpha: 0,
  },
  {
    id: 'poly-white-outline',
    label: 'White Outline',
    category: 'Outlines',
    fillColor: '#ffffff',
    strokeColor: '#ffffff',
    weight: 2,
    strokeStyle: 'solid',
    polygonFillAlpha: 0,
  },
  {
    id: 'poly-cyan-outline',
    label: 'Cyan Outline',
    category: 'Outlines',
    // Matches fieldBoundaryStyle.ts (Agri Field Boundary default).
    fillColor: '#22d3ee',
    strokeColor: '#22d3ee',
    weight: 2,
    strokeStyle: 'solid',
    polygonFillAlpha: 0,
  },

  // Land Use — ArcGIS 2D–style soft fills
  {
    id: 'poly-airport',
    label: 'Airport',
    category: 'Land Use',
    fillColor: '#e8dcc8',
    strokeColor: '#9a8b72',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.92,
  },
  {
    id: 'poly-airport-runway',
    label: 'Airport Runway',
    category: 'Land Use',
    fillColor: '#cfd4da',
    strokeColor: '#7a828c',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.92,
  },
  {
    id: 'poly-building',
    label: 'Building Footprint',
    category: 'Land Use',
    fillColor: '#d4b896',
    strokeColor: '#8a6d4b',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.92,
  },
  {
    id: 'poly-cemetery',
    label: 'Cemetery',
    category: 'Land Use',
    fillColor: '#d8e8c8',
    strokeColor: '#7a9470',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.9,
  },
  {
    id: 'poly-commercial',
    label: 'Commercial',
    category: 'Land Use',
    fillColor: '#f0d0c4',
    strokeColor: '#b07a6a',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.92,
  },
  {
    id: 'poly-cultural',
    label: 'Cultural',
    category: 'Land Use',
    fillColor: '#f5e6a8',
    strokeColor: '#b8a050',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.92,
  },
  {
    id: 'poly-education',
    label: 'Education',
    category: 'Land Use',
    fillColor: '#e8efc4',
    strokeColor: '#9aa86a',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.9,
  },
  {
    id: 'poly-government',
    label: 'Government',
    category: 'Land Use',
    fillColor: '#cbb896',
    strokeColor: '#8a7350',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.92,
  },
  {
    id: 'poly-health',
    label: 'Health/Medical',
    category: 'Land Use',
    fillColor: '#c8dff0',
    strokeColor: '#6a92b0',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.9,
  },
  {
    id: 'poly-industrial',
    label: 'Industrial',
    category: 'Land Use',
    fillColor: '#d8dce0',
    strokeColor: '#7a8288',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.9,
  },
  {
    id: 'poly-land',
    label: 'Land',
    category: 'Land Use',
    fillColor: '#f4f0e0',
    strokeColor: '#b0a888',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.88,
  },
  {
    id: 'poly-landmark',
    label: 'Landmark/POI',
    category: 'Land Use',
    fillColor: '#ddd0e8',
    strokeColor: '#8a78a8',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.9,
  },
  {
    id: 'poly-park',
    label: 'Park',
    category: 'Land Use',
    fillColor: '#b8d99a',
    strokeColor: '#5a8a48',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.9,
  },
  {
    id: 'poly-recreation',
    label: 'Recreation',
    category: 'Land Use',
    fillColor: '#f0c090',
    strokeColor: '#b07840',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.9,
  },
  {
    id: 'poly-water',
    label: 'Water (area)',
    category: 'Land Use',
    fillColor: '#7ec8e8',
    strokeColor: '#3a7ca8',
    weight: 1.25,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.88,
  },

  // Agriculture — AgroCloud context
  {
    id: 'poly-cropland',
    label: 'Cropland',
    category: 'Agriculture',
    fillColor: '#c6e48b',
    strokeColor: '#5a7a30',
    weight: 1.5,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.85,
  },
  {
    id: 'poly-orchard',
    label: 'Orchard',
    category: 'Agriculture',
    fillColor: '#a8d080',
    strokeColor: '#4a7040',
    weight: 1.5,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.85,
  },
  {
    id: 'poly-greenhouse',
    label: 'Greenhouse',
    category: 'Agriculture',
    fillColor: '#b8e8e0',
    strokeColor: '#3a8880',
    weight: 1.5,
    strokeStyle: 'solid',
    polygonFillAlpha: 0.75,
  },
  {
    id: 'poly-aoi',
    label: 'AOI boundary',
    category: 'Agriculture',
    fillColor: '#000000',
    strokeColor: '#000000',
    weight: 2,
    strokeStyle: 'solid',
    polygonFillAlpha: 0,
  },
]

export function applySiPolygonGalleryItem(
  item: SiPolygonSymbolGalleryItem,
): {
  color: string
  fillColor: string
  weight: number
  strokeStyle: SiStrokeStyle
  polygonFillAlpha: number
  fillStyle: 'solid'
} {
  return {
    color: item.strokeColor,
    fillColor: item.fillColor,
    weight: item.weight,
    strokeStyle: item.strokeStyle,
    polygonFillAlpha: item.polygonFillAlpha,
    fillStyle: 'solid',
  }
}
