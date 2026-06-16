/**
 * Per-layer Geo AI / map identify popup configuration (Satellite Intelligence custom layers).
 */

export type SiLayerPopupViewMode = 'table' | 'card' | 'compact';

export type SiLayerPopupFieldGroup = {
  id: string;
  title: string;
  /** Field keys (feature property names) belonging to this section. */
  fieldKeys: string[];
};

export type SiLayerPopupDensityMode = 'auto' | 'compact' | 'tabbed' | 'relationship';

export type SiLayerPopupConfig = {
  v: 1;
  /** Property keys hidden in popups. */
  hiddenFieldKeys: string[];
  /** Preferred order (keys not listed follow in discovery order). */
  fieldOrder: string[];
  groups: SiLayerPopupFieldGroup[];
  showRelated: boolean;
  showAttachments: boolean;
  showMedia: boolean;
  viewMode: SiLayerPopupViewMode;
  densityMode: SiLayerPopupDensityMode;
};

export const defaultSiLayerPopupConfig = (): SiLayerPopupConfig => ({
  v: 1,
  hiddenFieldKeys: [],
  fieldOrder: [],
  groups: [],
  showRelated: true,
  showAttachments: true,
  showMedia: true,
  viewMode: 'table',
  densityMode: 'auto',
});

export function normalizeSiLayerPopupConfig(raw: unknown): SiLayerPopupConfig {
  const d = defaultSiLayerPopupConfig();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 && o.v !== undefined) return d;
  const hidden = Array.isArray(o.hiddenFieldKeys) ? o.hiddenFieldKeys.map(x => String(x)) : d.hiddenFieldKeys;
  const order = Array.isArray(o.fieldOrder) ? o.fieldOrder.map(x => String(x)) : d.fieldOrder;
  const groups = Array.isArray(o.groups)
    ? o.groups
        .map((g, i) => {
          if (!g || typeof g !== 'object') return null;
          const gg = g as Record<string, unknown>;
          const id = typeof gg.id === 'string' && gg.id.trim() ? gg.id.trim() : `grp-${i}`;
          const title = typeof gg.title === 'string' && gg.title.trim() ? gg.title.trim() : 'Section';
          const fieldKeys = Array.isArray(gg.fieldKeys) ? gg.fieldKeys.map(x => String(x)) : [];
          return { id, title, fieldKeys };
        })
        .filter(Boolean) as SiLayerPopupFieldGroup[]
    : d.groups;
  const viewMode =
    o.viewMode === 'card' || o.viewMode === 'compact' || o.viewMode === 'table' ? o.viewMode : d.viewMode;
  const densityMode =
    o.densityMode === 'auto' ||
    o.densityMode === 'compact' ||
    o.densityMode === 'tabbed' ||
    o.densityMode === 'relationship'
      ? o.densityMode
      : d.densityMode;
  return {
    v: 1,
    hiddenFieldKeys: hidden,
    fieldOrder: order,
    groups,
    showRelated: typeof o.showRelated === 'boolean' ? o.showRelated : d.showRelated,
    showAttachments: typeof o.showAttachments === 'boolean' ? o.showAttachments : d.showAttachments,
    showMedia: typeof o.showMedia === 'boolean' ? o.showMedia : d.showMedia,
    viewMode,
    densityMode,
  };
}
