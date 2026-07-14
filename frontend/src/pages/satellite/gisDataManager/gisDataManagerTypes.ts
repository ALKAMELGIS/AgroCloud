import type { GisContentRow } from '../../master/gisContentPortalData';

export type GisDataManagerCategory =
  | 'recent'
  | 'favorites'
  | 'vector'
  | 'raster'
  | 'database'
  | 'cloud'
  | 'web'
  | 'bim'
  | 'lidar'
  | 'realtime'
  | 'ai'
  | 'enterprise'
  | 'giscontent';

export type GisImportWizardStep =
  | 'source'
  | 'preview'
  | 'projection'
  | 'symbology'
  | 'validation'
  | 'import'
  | 'ready';

export type GisDataManagerToast = {
  id: string;
  tone: 'ok' | 'warn' | 'error' | 'info';
  message: string;
};

export type GisDataManagerPortalItem = {
  id: string;
  title: string;
  typeLabel: string;
  row: GisContentRow;
};

export type GisDataManagerCallbacks = {
  onImportFiles: (files: File[], opts?: { layerName?: string; forceRaster?: boolean }) => Promise<void> | void;
  onImportRemoteUrl: (url: string, opts?: { layerName?: string; asRaster?: boolean }) => Promise<void> | void;
  onConnectArcGis: (url: string, token?: string, layerName?: string) => Promise<void> | void;
  onAddDiscoveredArcGis?: (url: string) => Promise<void> | void;
  onDiscoverArcGis?: (
    url: string,
    token?: string,
  ) => Promise<{ layers: { url: string; name: string; kind?: string; geometryType?: string }[]; selectedUrl?: string }>;
  onAddPortalRow: (row: GisContentRow) => void;
  onSaveDbProfile?: (profile: {
    platform: string;
    host: string;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
    name: string;
  }) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string };
  onImportWfs?: (baseUrl: string, typeName: string, token?: string) => Promise<void> | void;
  onImportOgcTile?: (kind: 'wms' | 'wmts' | 'xyz', url: string, layerName?: string) => Promise<void> | void;
  getMapBounds?: () => { west: number; south: number; east: number; north: number } | null;
  addingPortalRowId?: string | null;
  discoveredArcGisLayers?: { url: string; name: string; kind?: string; geometryType?: string }[];
  selectedDiscoveredArcGisUrl?: string;
  onSelectDiscoveredArcGisUrl?: (url: string) => void;
  isConnecting?: boolean;
  isAddingDiscovered?: boolean;
  isImportingRemote?: boolean;
};

export const GIS_DM_CATEGORIES: {
  id: GisDataManagerCategory;
  label: string;
  icon: string;
  ready: boolean;
  hint?: string;
}[] = [
  { id: 'recent', label: 'Recent', icon: 'fa-solid fa-clock-rotate-left', ready: true },
  { id: 'favorites', label: 'Favorites', icon: 'fa-solid fa-star', ready: true },
  { id: 'giscontent', label: 'GIS Content', icon: 'fa-solid fa-layer-group', ready: true },
  { id: 'vector', label: 'Vector', icon: 'fa-solid fa-draw-polygon', ready: true },
  { id: 'raster', label: 'Raster', icon: 'fa-regular fa-image', ready: true },
  { id: 'database', label: 'Database', icon: 'fa-solid fa-database', ready: true },
  { id: 'cloud', label: 'Cloud', icon: 'fa-solid fa-cloud', ready: true },
  { id: 'web', label: 'Web Services', icon: 'fa-solid fa-globe', ready: true },
  { id: 'bim', label: 'BIM / CAD', icon: 'fa-solid fa-building', ready: true },
  { id: 'lidar', label: 'LiDAR', icon: 'fa-solid fa-mountain', ready: true },
  { id: 'realtime', label: 'Real-Time', icon: 'fa-solid fa-bolt', ready: false, hint: 'Stream connectors coming soon' },
  { id: 'ai', label: 'AI Import', icon: 'fa-solid fa-brain', ready: false, hint: 'Smart format detection coming soon' },
  { id: 'enterprise', label: 'Enterprise', icon: 'fa-solid fa-building-columns', ready: false, hint: 'Requires GIS gateway' },
];

export const WIZARD_STEPS: { id: GisImportWizardStep; label: string }[] = [
  { id: 'source', label: 'Source' },
  { id: 'preview', label: 'Preview' },
  { id: 'projection', label: 'Projection' },
  { id: 'symbology', label: 'Symbology' },
  { id: 'validation', label: 'Validation' },
  { id: 'import', label: 'Import' },
  { id: 'ready', label: 'Ready' },
];
