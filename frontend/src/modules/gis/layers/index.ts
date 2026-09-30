/**
 * Shared GIS layer registry helpers for SI / ACP / GisMap unification.
 */
export type GisRegistryLayerKind = 'vector' | 'raster' | 'bim' | 'service';

export type GisRegistryLayerCard = {
  id: string;
  name: string;
  kind: GisRegistryLayerKind;
  crs?: string;
  featureCount?: number;
  bytes?: number;
  visible: boolean;
  opacity: number;
  locked?: boolean;
  groupId?: string | null;
};

export type GisLayerGroup = {
  id: string;
  name: string;
  collapsed?: boolean;
};

export function toRegistryCard(input: {
  id: string;
  name: string;
  visible: boolean;
  mapOpacity?: number;
  importMetadata?: {
    crs?: string;
    featureCount?: number;
    bytes?: number;
    geometryType?: string;
    format?: string;
  };
  renderMode?: 'vector' | 'raster';
  bimBlobUrl?: string;
  groupId?: string | null;
  locked?: boolean;
}): GisRegistryLayerCard {
  const geom = input.importMetadata?.geometryType;
  const kind: GisRegistryLayerKind =
    input.bimBlobUrl || geom === 'bim'
      ? 'bim'
      : input.renderMode === 'raster' || geom === 'raster'
        ? 'raster'
        : input.importMetadata?.format?.toLowerCase().includes('service')
          ? 'service'
          : 'vector';
  return {
    id: input.id,
    name: input.name,
    kind,
    crs: input.importMetadata?.crs,
    featureCount: input.importMetadata?.featureCount,
    bytes: input.importMetadata?.bytes,
    visible: input.visible,
    opacity: typeof input.mapOpacity === 'number' ? input.mapOpacity : 1,
    locked: input.locked,
    groupId: input.groupId ?? null,
  };
}

/** Build ArcGIS-Pro-style context menu actions for a layer. */
export const GIS_LAYER_CONTEXT_ACTIONS = [
  { id: 'zoom', label: 'Zoom To Layer', icon: 'fa-solid fa-crosshairs' },
  { id: 'table', label: 'Open Attribute Table', icon: 'fa-solid fa-table' },
  { id: 'properties', label: 'Properties', icon: 'fa-solid fa-sliders' },
  { id: 'metadata', label: 'Metadata', icon: 'fa-solid fa-circle-info' },
  { id: 'symbology', label: 'Symbology', icon: 'fa-solid fa-palette' },
  { id: 'labels', label: 'Labels', icon: 'fa-solid fa-font' },
  { id: 'filter', label: 'Filter', icon: 'fa-solid fa-filter' },
  { id: 'export', label: 'Export', icon: 'fa-solid fa-file-export' },
  { id: 'duplicate', label: 'Duplicate', icon: 'fa-regular fa-copy' },
  { id: 'rename', label: 'Rename', icon: 'fa-solid fa-i-cursor' },
  { id: 'remove', label: 'Remove', icon: 'fa-solid fa-trash' },
  { id: 'group', label: 'Move to Group', icon: 'fa-solid fa-folder' },
  { id: 'ai', label: 'AI Analysis', icon: 'fa-solid fa-brain' },
  { id: 'report', label: 'Generate Report', icon: 'fa-solid fa-file-lines' },
] as const;

export type GisLayerContextActionId = (typeof GIS_LAYER_CONTEXT_ACTIONS)[number]['id'];
