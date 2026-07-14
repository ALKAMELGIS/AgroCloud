/**
 * BIM / LiDAR ingest stubs for GIS Data Manager Release 5.
 * IFC is handled in FileLoader; these helpers prepare derived footprints / metadata.
 */

export type LidarFormat = 'las' | 'laz' | 'copc' | 'ept' | 'xyz' | 'ply';

export const LIDAR_EXTENSIONS = ['las', 'laz', 'copc', 'xyz', 'ply'] as const;

export function detectLidarFormat(filename: string): LidarFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if ((LIDAR_EXTENSIONS as readonly string[]).includes(ext)) return ext as LidarFormat;
  if (filename.toLowerCase().includes('/ept.json') || filename.toLowerCase().endsWith('ept.json')) return 'ept';
  return null;
}

export type LidarIngestPlan = {
  format: LidarFormat;
  strategy: 'worker-points' | 'ept-stream' | 'gateway-convert';
  message: string;
};

export function planLidarIngest(filename: string): LidarIngestPlan {
  const format = detectLidarFormat(filename) || 'las';
  if (format === 'ept' || format === 'copc') {
    return {
      format,
      strategy: 'ept-stream',
      message: 'Streaming point cloud — open via gateway or COPC-compatible viewer.',
    };
  }
  if (format === 'laz' || format === 'las') {
    return {
      format,
      strategy: 'gateway-convert',
      message: 'LAS/LAZ conversion to DSM/DTM/intensity requires the GIS processing gateway.',
    };
  }
  return {
    format,
    strategy: 'worker-points',
    message: 'XYZ/PLY can be sampled client-side in a later worker pipeline.',
  };
}

export type BimDerivedInfo = {
  floorsHint?: number;
  hasIfcHeader: boolean;
  byteLength: number;
};

export async function inspectIfcHeader(file: File): Promise<BimDerivedInfo> {
  const slice = file.slice(0, Math.min(file.size, 64 * 1024));
  const text = await slice.text();
  const hasIfcHeader = /ISO-10303-21/i.test(text);
  const storeyMatches = text.match(/IFCBUILDINGSTOREY/gi);
  return {
    hasIfcHeader,
    floorsHint: storeyMatches ? storeyMatches.length : undefined,
    byteLength: file.size,
  };
}
