import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArcgisLayerDefLite } from '../../../lib/arcgisAttributeDisplay';
import {
  defaultSiLayerPopupConfig,
  normalizeSiLayerPopupConfig,
  type SiLayerPopupConfig,
  type SiLayerPopupDensityMode,
  type SiLayerPopupFieldGroup,
  type SiLayerPopupViewMode,
} from '../../../lib/siLayerPopupConfig';
import './SiLayerPopupConfigurator.css';

function collectLayerFieldKeys(geojson: unknown): string[] {
  const s = new Set<string>();
  const gj = geojson as { features?: unknown[] } | null | undefined;
  const feats = gj?.features;
  if (!Array.isArray(feats)) return [];
  for (const f of feats.slice(0, 2500)) {
    const p = (f as { properties?: Record<string, unknown> })?.properties;
    if (!p || typeof p !== 'object') continue;
    for (const k of Object.keys(p)) {
      if (k && !k.startsWith('mapbox_')) s.add(k);
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

function mergeFieldOrder(order: string[], all: string[]): string[] {
  const o = order.filter(k => all.includes(k));
  const rest = all.filter(k => !o.includes(k));
  return [...o, ...rest];
}

export type SiLayerPopupConfiguratorLayer = {
  id: string;
  name: string;
  geojson: unknown;
  popupConfig?: SiLayerPopupConfig | null;
  arcgisLayerDefinition?: ArcgisLayerDefLite | null;
};

type Props = {
  layer: SiLayerPopupConfiguratorLayer;
  onSave: (next: SiLayerPopupConfig) => void;
  onClose: () => void;
};

export function SiLayerPopupConfigurator({ layer, onSave, onClose }: Props) {
  const allKeys = useMemo(() => collectLayerFieldKeys(layer.geojson), [layer.geojson, layer.id]);
  const [draft, setDraft] = useState<SiLayerPopupConfig>(() => normalizeSiLayerPopupConfig(layer.popupConfig));
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() =>
    mergeFieldOrder(normalizeSiLayerPopupConfig(layer.popupConfig).fieldOrder, collectLayerFieldKeys(layer.geojson)),
  );

  useEffect(() => {
    const cfg = normalizeSiLayerPopupConfig(layer.popupConfig);
    setDraft(cfg);
    setOrderedKeys(mergeFieldOrder(cfg.fieldOrder, collectLayerFieldKeys(layer.geojson)));
  }, [layer.id, layer.popupConfig, layer.geojson]);

  const hidden = useMemo(() => new Set(draft.hiddenFieldKeys), [draft.hiddenFieldKeys]);

  const toggleHidden = (key: string) => {
    setDraft(d => {
      const h = new Set(d.hiddenFieldKeys)
      if (h.has(key)) h.delete(key)
      else h.add(key)
      return { ...d, hiddenFieldKeys: [...h] }
    })
  }

  const moveKey = (key: string, dir: -1 | 1) => {
    setOrderedKeys(prev => {
      const i = prev.indexOf(key)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const cp = [...prev]
      const t = cp[i]!
      cp[i] = cp[j]!
      cp[j] = t
      return cp
    })
  }

  const addGroup = () => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `g-${Date.now()}`
    setDraft(d => ({
      ...d,
      groups: [...d.groups, { id, title: 'New section', fieldKeys: [] }],
    }))
  }

  const updateGroup = (id: string, patch: Partial<SiLayerPopupFieldGroup>) => {
    setDraft(d => ({ ...d, groups: d.groups.map(g => (g.id === id ? { ...g, ...patch } : g)) }))
  }

  const removeGroup = (id: string) => {
    setDraft(d => ({ ...d, groups: d.groups.filter(g => g.id !== id) }))
  }

  const toggleKeyInGroup = (gid: string, key: string) => {
    setDraft(d => ({
      ...d,
      groups: d.groups.map(g => {
        if (g.id !== gid) return g
        const has = g.fieldKeys.includes(key)
        return { ...g, fieldKeys: has ? g.fieldKeys.filter(k => k !== key) : [...g.fieldKeys, key] }
      }),
    }))
  }

  const save = useCallback(() => {
    onSave({
      ...draft,
      fieldOrder: [...orderedKeys],
    })
    onClose()
  }, [draft, onSave, onClose, orderedKeys])

  return (
    <div className="si-layer-popupcfg-overlay" role="dialog" aria-modal aria-labelledby="si-layer-popupcfg-title">
      <div className="si-layer-popupcfg-modal">
        <header className="si-layer-popupcfg-head">
          <div>
            <h2 id="si-layer-popupcfg-title" className="si-layer-popupcfg-title">
              Configure Layer Popups
            </h2>
            <p className="si-layer-popupcfg-sub">{layer.name}</p>
          </div>
          <button type="button" className="si-layer-popupcfg-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="si-layer-popupcfg-body">
          <div className="si-layer-popupcfg-row2">
            <label className="si-layer-popupcfg-field">
              <span>Display style</span>
              <select
                value={draft.viewMode}
                onChange={e => setDraft(d => ({ ...d, viewMode: e.target.value as SiLayerPopupViewMode }))}
              >
                <option value="table">Table view</option>
                <option value="card">Card view</option>
                <option value="compact">Compact view</option>
              </select>
            </label>
            <label className="si-layer-popupcfg-field">
              <span>Density</span>
              <select
                value={draft.densityMode}
                onChange={e => setDraft(d => ({ ...d, densityMode: e.target.value as SiLayerPopupDensityMode }))}
              >
                <option value="auto">Auto (by data)</option>
                <option value="compact">Always compact</option>
                <option value="tabbed">Tabbed</option>
                <option value="relationship">Relationship explorer</option>
              </select>
            </label>
          </div>
          <div className="si-layer-popupcfg-toggles">
            <label>
              <input
                type="checkbox"
                checked={draft.showRelated}
                onChange={e => setDraft(d => ({ ...d, showRelated: e.target.checked }))}
              />{' '}
              Related records
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.showAttachments}
                onChange={e => setDraft(d => ({ ...d, showAttachments: e.target.checked }))}
              />{' '}
              Attachments
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.showMedia}
                onChange={e => setDraft(d => ({ ...d, showMedia: e.target.checked }))}
              />{' '}
              Media (images / files)
            </label>
          </div>
          <div className="si-layer-popupcfg-kicker">Field visibility & order</div>
          <p className="si-layer-popupcfg-hint">Uncheck to hide a field. Use arrows to change column order in the popup.</p>
          <div className="si-layer-popupcfg-fields">
            {orderedKeys.map(k => (
              <div key={k} className="si-layer-popupcfg-field-row">
                <label className="si-layer-popupcfg-check">
                  <input type="checkbox" checked={!hidden.has(k)} onChange={() => toggleHidden(k)} />
                  <code>{k}</code>
                </label>
                <div className="si-layer-popupcfg-order">
                  <button type="button" onClick={() => moveKey(k, -1)} title="Move up" aria-label={`Move ${k} up`}>
                    <i className="fa-solid fa-arrow-up" aria-hidden />
                  </button>
                  <button type="button" onClick={() => moveKey(k, 1)} title="Move down" aria-label={`Move ${k} down`}>
                    <i className="fa-solid fa-arrow-down" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="si-layer-popupcfg-kicker">Field groups (optional)</div>
          <p className="si-layer-popupcfg-hint">Grouped fields show under sticky section headers on the map. Ungrouped fields stay in “Other”.</p>
          <button type="button" className="si-layer-popupcfg-add" onClick={addGroup}>
            + Add section
          </button>
          {draft.groups.map(g => (
            <div key={g.id} className="si-layer-popupcfg-group">
              <div className="si-layer-popupcfg-group-head">
                <input
                  className="si-layer-popupcfg-group-title"
                  value={g.title}
                  onChange={e => updateGroup(g.id, { title: e.target.value })}
                  aria-label="Section title"
                />
                <button type="button" className="si-layer-popupcfg-remove" onClick={() => removeGroup(g.id)}>
                  Remove
                </button>
              </div>
              <div className="si-layer-popupcfg-group-keys">
                {allKeys.map(k => (
                  <label key={`${g.id}-${k}`} className="si-layer-popupcfg-chip">
                    <input
                      type="checkbox"
                      checked={g.fieldKeys.includes(k)}
                      onChange={() => toggleKeyInGroup(g.id, k)}
                    />{' '}
                    {k}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="si-layer-popupcfg-actions">
            <button type="button" className="si-layer-popupcfg-btn si-layer-popupcfg-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="si-layer-popupcfg-btn si-layer-popupcfg-btn--primary" onClick={save}>
              Save configuration
            </button>
            <button
              type="button"
              className="si-layer-popupcfg-btn si-layer-popupcfg-btn--ghost"
              onClick={() => {
                setDraft(defaultSiLayerPopupConfig())
                setOrderedKeys(allKeys)
              }}
            >
              Reset defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
