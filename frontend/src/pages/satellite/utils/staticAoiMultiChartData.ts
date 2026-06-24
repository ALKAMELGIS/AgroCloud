/**
 * AOI static multi-layer chart: builds per-week synthetic means per analysis layer
 * for temporal comparison (same timeline as {@link WeeklyComposite} strip).
 * Values are sample-quality signals derived from week index + AOI fingerprint so
 * the chart reacts when the AOI changes; wire a backend stats endpoint later for production means.
 */

import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import { resolveRemoteSensingLayerScientificName } from '../../../lib/agroCompositeIndices'

export type WeeklyCompositeLite = {
  weekIndex: number;
  startDate: string;
  endDate: string;
  mean: number;
};

export type StaticAoiChartLayerId =
  | 'NDVI'
  | 'NDWI'
  | 'NDMI'
  | 'EVI'
  | 'SAVI'
  | 'NDSI'
  | 'LST';

/** Any Layer Live layer id used for multi-layer statistical analysis. */
export type LayerLiveStatsLayerId = string;

export const STATIC_AOI_CHART_LAYER_OPTIONS: Array<{
  id: StaticAoiChartLayerId;
  label: string;
  subtitle: string;
  range: [number, number];
}> = [
  { id: 'NDVI', label: 'NDVI', subtitle: 'Vegetation (NIR / red)', range: [-1, 1] },
  { id: 'NDWI', label: 'NDWI', subtitle: 'Water / moisture (green–NIR)', range: [-1, 1] },
  { id: 'NDMI', label: 'NDMI', subtitle: 'Soil / canopy moisture (NIR–SWIR)', range: [-1, 1] },
  { id: 'SAVI', label: 'SAVI', subtitle: 'Soil-adjusted vegetation', range: [-1, 1] },
  { id: 'EVI', label: 'EVI', subtitle: 'Enhanced vegetation', range: [-1, 1] },
  { id: 'NDSI', label: 'NDSI', subtitle: 'Snow / bright surfaces', range: [-1, 1] },
  { id: 'LST', label: 'LST', subtitle: 'Land surface temperature (°C)', range: [15, 45] },
];

/** One-click chips for core AOI chart indices (shown above the full Layer Live checklist). */
export const LAYER_LIVE_STATS_QUICK_ACCESS_IDS = ['NDVI', 'NDMI', 'NDWI', 'SAVI', 'LST'] as const

export type LayerLiveStatsQuickAccessId = (typeof LAYER_LIVE_STATS_QUICK_ACCESS_IDS)[number]

export function resolveLayerLiveStatsQuickAccessMeta(id: string) {
  const u = String(id || '').trim().toUpperCase()
  const known = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === u)
  return known ?? { id: u, label: u, subtitle: resolveRemoteSensingLayerScientificName(u) ?? u, range: [-1, 1] as [number, number] }
}

export function defaultStaticAoiComparisonLayers(): LayerLiveStatsLayerId[] {
  return ['NDVI', 'NDWI', 'EVI'];
}

export function buildLayerLiveStatsLayerOrder(groups: RemoteSensingLayerSelectGroup[]): string[] {
  const order: string[] = []
  for (const group of groups) {
    for (const opt of group.options) {
      order.push(opt.id.toUpperCase())
    }
  }
  return order
}

export function sortLayerLiveStatsLayerIds(
  ids: LayerLiveStatsLayerId[],
  groups: RemoteSensingLayerSelectGroup[],
): LayerLiveStatsLayerId[] {
  const order = buildLayerLiveStatsLayerOrder(groups)
  return [...ids].sort((a, b) => {
    const ia = order.indexOf(a.toUpperCase())
    const ib = order.indexOf(b.toUpperCase())
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

/** @deprecated use sortLayerLiveStatsLayerIds */
export function sortStaticAoiChartLayerIds(ids: StaticAoiChartLayerId[]): StaticAoiChartLayerId[] {
  const order = STATIC_AOI_CHART_LAYER_OPTIONS.map(o => o.id)
  return [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

export function toggleLayerLiveStatsLayerId(
  prev: LayerLiveStatsLayerId[],
  layerId: string,
  groups: RemoteSensingLayerSelectGroup[],
): LayerLiveStatsLayerId[] {
  const u = layerId.trim().toUpperCase()
  if (prev.some(id => id.toUpperCase() === u)) {
    if (prev.length <= 1) return prev
    return sortLayerLiveStatsLayerIds(
      prev.filter(id => id.toUpperCase() !== u),
      groups,
    )
  }
  const canonical =
    groups.flatMap(g => g.options).find(o => o.id.toUpperCase() === u)?.id ?? layerId
  return sortLayerLiveStatsLayerIds([...prev, canonical], groups)
}

export function layerLiveStatsIncludesLst(ids: LayerLiveStatsLayerId[]): boolean {
  return ids.some(id => id.trim().toUpperCase() === 'LST')
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function aoiNoise(aoiKey: string | null, layerId: string, weekIdx: number): number {
  const n = simpleHash(`${aoiKey ?? 'world'}|${layerId}|${weekIdx}`) % 2000;
  return n / 10000 - 0.1;
}

export function metaForLayerLiveStats(layerId: string) {
  const u = String(layerId || '').trim().toUpperCase()
  const known = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === u)
  if (known) return known
  return {
    id: u,
    label: u,
    subtitle: resolveRemoteSensingLayerScientificName(u) ?? 'Layer Live analytical index',
    range: [-1, 1] as [number, number],
  }
}

/** Per-layer weekly mean in physical range for that index (sample trajectory). */
export function staticAoiLayerMeanForWeek(
  layerId: string,
  weekIdx: number,
  totalWeeks: number,
  aoiKey: string | null,
  anchorWeeklyMean: number,
): number {
  const { range } = metaForLayerLiveStats(layerId);
  const span = range[1] - range[0];
  const seasonal = Math.sin((weekIdx / Math.max(1, totalWeeks - 1)) * Math.PI);
  const phase = (simpleHash(layerId) % 23) / 120;
  const anchor01 =
    layerId === 'LST'
      ? (anchorWeeklyMean - 15) / 30
      : Math.max(0, Math.min(1, (anchorWeeklyMean - range[0]) / (span || 1)));
  const mix = 0.55 * seasonal + 0.45 * (anchor01 * 2 - 1) * 0.35;
  const base =
    layerId === 'LST'
      ? 24 + seasonal * 11 + phase * 4
      : range[0] + span * (0.38 + mix * 0.32 + phase * 0.08);
  const v = base + aoiNoise(aoiKey, layerId, weekIdx);
  if (layerId === 'LST') return Number(Math.max(range[0], Math.min(range[1], v)).toFixed(2));
  return Number(Math.max(range[0], Math.min(range[1], v)).toFixed(3));
}

export function formatStaticChartWeekLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate.slice(5);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

const DATASET_COLORS = ['#4f46e5', '#0d9488', '#ca8a04', '#b91c1c', '#7c3aed', '#15803d', '#0369a1'];

export function buildStaticAoiMultiChartDatasets(
  weekly: WeeklyCompositeLite[],
  layerIds: LayerLiveStatsLayerId[],
  aoiKey: string | null,
): {
  labels: string[];
  datasets: Array<{
    id: string;
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    yAxisID: string;
  }>;
} {
  if (!weekly.length || !layerIds.length) {
    return { labels: [], datasets: [] };
  }
  const n = weekly.length;
  const labels = weekly.map(w => formatStaticChartWeekLabel(w.startDate));
  const datasets = layerIds.map((id, di) => {
    const opt = metaForLayerLiveStats(id);
    const color = DATASET_COLORS[di % DATASET_COLORS.length]!;
    const data = weekly.map((w, i) => staticAoiLayerMeanForWeek(id, i, n, aoiKey, w.mean));
    return {
      id,
      label: opt.label,
      data,
      borderColor: color,
      backgroundColor: `${color}22`,
      yAxisID: id === 'LST' ? 'yLST' : 'yIndex',
    };
  });
  return { labels, datasets };
}
