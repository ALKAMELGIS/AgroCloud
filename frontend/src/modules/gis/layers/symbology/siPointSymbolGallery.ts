export type SiPointSymbolGalleryItem = {
  id: string;
  label: string;
  category: string;
  fillColor: string;
  strokeColor: string;
  radius: number;
  shape: 'circle' | 'square' | 'diamond' | 'triangle' | 'star';
};

export const SI_POINT_SYMBOL_CATEGORIES = [
  'All',
  'Basic Shapes',
  'GIS Markers',
  'Agriculture',
  'Infrastructure',
  'Transportation',
  'Environment',
  'Weather',
  'Emergency',
] as const;

export const SI_POINT_SYMBOL_GALLERY: SiPointSymbolGalleryItem[] = [
  { id: 'basic-circle', label: 'Circle', category: 'Basic Shapes', fillColor: '#3b82f6', strokeColor: '#1e3a8a', radius: 7, shape: 'circle' },
  { id: 'basic-square', label: 'Square', category: 'Basic Shapes', fillColor: '#6366f1', strokeColor: '#312e81', radius: 7, shape: 'square' },
  { id: 'basic-diamond', label: 'Diamond', category: 'Basic Shapes', fillColor: '#8b5cf6', strokeColor: '#4c1d95', radius: 7, shape: 'diamond' },
  { id: 'basic-triangle', label: 'Triangle', category: 'Basic Shapes', fillColor: '#0ea5e9', strokeColor: '#0c4a6e', radius: 7, shape: 'triangle' },
  { id: 'gis-pin', label: 'Map pin', category: 'GIS Markers', fillColor: '#ef4444', strokeColor: '#7f1d1d', radius: 8, shape: 'triangle' },
  { id: 'gis-node', label: 'Node', category: 'GIS Markers', fillColor: '#22c55e', strokeColor: '#14532d', radius: 6, shape: 'circle' },
  { id: 'agri-crop', label: 'Crop field', category: 'Agriculture', fillColor: '#84cc16', strokeColor: '#365314', radius: 7, shape: 'square' },
  { id: 'agri-irrigation', label: 'Irrigation', category: 'Agriculture', fillColor: '#06b6d4', strokeColor: '#164e63', radius: 7, shape: 'circle' },
  { id: 'infra-building', label: 'Structure', category: 'Infrastructure', fillColor: '#a855f7', strokeColor: '#581c87', radius: 7, shape: 'square' },
  { id: 'infra-pipeline', label: 'Pipeline', category: 'Infrastructure', fillColor: '#f97316', strokeColor: '#7c2d12', radius: 6, shape: 'diamond' },
  { id: 'trans-road', label: 'Road node', category: 'Transportation', fillColor: '#64748b', strokeColor: '#0f172a', radius: 6, shape: 'circle' },
  { id: 'trans-hub', label: 'Hub', category: 'Transportation', fillColor: '#eab308', strokeColor: '#713f12', radius: 8, shape: 'star' },
  { id: 'env-tree', label: 'Vegetation', category: 'Environment', fillColor: '#16a34a', strokeColor: '#14532d', radius: 7, shape: 'circle' },
  { id: 'env-water', label: 'Water', category: 'Environment', fillColor: '#0284c7', strokeColor: '#0c4a6e', radius: 7, shape: 'circle' },
  { id: 'weather-storm', label: 'Storm', category: 'Weather', fillColor: '#7c3aed', strokeColor: '#4c1d95', radius: 8, shape: 'star' },
  { id: 'weather-sun', label: 'Clear', category: 'Weather', fillColor: '#facc15', strokeColor: '#854d0e', radius: 7, shape: 'circle' },
  { id: 'emergency-alert', label: 'Alert', category: 'Emergency', fillColor: '#dc2626', strokeColor: '#450a0a', radius: 8, shape: 'triangle' },
  { id: 'emergency-rescue', label: 'Rescue', category: 'Emergency', fillColor: '#f43f5e', strokeColor: '#881337', radius: 7, shape: 'diamond' },
];
