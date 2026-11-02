import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useLanguage } from '@/core/localization/i18n'
import { dsfTranslations } from './dsfTranslations'

/** Saved GIS layer as listed in the data-source settings picker. */
export type SavedLayer = { id: string; name: string; fields: string[] }

const getLayerGroupKey = (id: string) => {
  const trimmed = String(id || '').trim()
  const prefix = trimmed.includes(':') ? trimmed.slice(0, trimmed.indexOf(':')).toLowerCase() : ''
  if (prefix) return prefix
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return 'url'
  return 'custom'
}

const groupLabel: Record<string, string> = {
  arcgis: 'ArcGIS',
  geojson: 'GeoJSON',
  url: 'URL',
  custom: 'Custom',
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked
  }, [indeterminate, checked])
  return <input ref={ref} className="dsf-indeterminate-cb" type="checkbox" checked={checked} onChange={onChange} aria-label={ariaLabel} />
}

export function AdvancedLayerMultiSelect({
  layers,
  selectedIds,
  onToggle,
  onSelectMany,
  onClearMany,
  search,
  onSearchChange,
}: {
  layers: SavedLayer[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onSelectMany: (ids: string[]) => void
  onClearMany: (ids: string[]) => void
  search: string
  onSearchChange: (value: string) => void
}) {
  const { language } = useLanguage()
  const ui = dsfTranslations[language]
  const [view, setView] = useState<'list' | 'grid' | 'tree'>('grid')
  const [typeFilter, setTypeFilter] = useState<'all' | 'arcgis' | 'geojson' | 'url' | 'custom'>('all')
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [scrollTop, setScrollTop] = useState(0)
  const listViewportRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return layers
      .filter(l => {
        if (typeFilter !== 'all' && getLayerGroupKey(l.id) !== typeFilter) return false
        if (showSelectedOnly && !selectedIds.has(l.id)) return false
        if (!q) return true
        return l.name.toLowerCase().includes(q) || l.id.toLowerCase().includes(q)
      })
      .slice()
  }, [layers, search, typeFilter, showSelectedOnly, selectedIds])

  const selectedInFiltered = useMemo(() => filtered.filter(l => selectedIds.has(l.id)).length, [filtered, selectedIds])
  const allFilteredIds = useMemo(() => filtered.map(l => l.id), [filtered])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      onSelectMany(allFilteredIds)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClearMany(allFilteredIds)
    }
  }

  const rowHeight = 30
  const viewportHeight = 192
  const overscan = 10
  const total = filtered.length
  const startIndex = view === 'list' ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0
  const endIndex = view === 'list' ? Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan) : total
  const visible = view === 'list' ? filtered.slice(startIndex, endIndex) : filtered
  const padTop = view === 'list' ? startIndex * rowHeight : 0
  const padBottom = view === 'list' ? Math.max(0, (total - endIndex) * rowHeight) : 0

  const grouped = useMemo(() => {
    const map = new Map<string, SavedLayer[]>()
    for (const l of filtered) {
      const k = getLayerGroupKey(l.id)
      const arr = map.get(k) ?? []
      arr.push(l)
      map.set(k, arr)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  return (
    <div className="dsf-layer-picker" onKeyDown={handleKeyDown}>
      <div className="dsf-layer-toolbar">
        <div className="dsf-layer-toolbar__left">
          <div className="dsf-layer-toolbar__views" role="group" aria-label="Layer view">
            <button
              type="button"
              className={`dsf-layer-toolbar__icon-btn${view === 'grid' ? ' is-active' : ''}`}
              onClick={() => setView('grid')}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              title="Grid"
            >
              <i className="fa-solid fa-table-cells-large" aria-hidden />
            </button>
            <button
              type="button"
              className={`dsf-layer-toolbar__icon-btn${view === 'list' ? ' is-active' : ''}`}
              onClick={() => setView('list')}
              aria-label="List view"
              aria-pressed={view === 'list'}
              title="List"
            >
              <i className="fa-solid fa-list-ul" aria-hidden />
            </button>
          </div>

          <select
            className="dsf-layer-toolbar__select"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            aria-label="Layer type filter"
          >
            <option value="all">All</option>
            <option value="arcgis">ArcGIS</option>
            <option value="geojson">GeoJSON</option>
            <option value="url">URL</option>
            <option value="custom">Custom</option>
          </select>

          <label className="dsf-layer-filter-toggle">
            <input type="checkbox" checked={showSelectedOnly} onChange={() => setShowSelectedOnly(v => !v)} aria-label="Show selected only" />
            <span className="dsf-layer-filter-toggle__ui" aria-hidden />
            <span className="dsf-layer-filter-toggle__text">Selected only</span>
          </label>
        </div>

        <div className="dsf-layer-toolbar__right">
          <div className="dsf-layer-toolbar__count" aria-live="polite">
            <span className="dsf-layer-toolbar__count-num">{selectedInFiltered}</span>
            <span className="dsf-layer-toolbar__count-sep">/</span>
            <span>{filtered.length}</span>
            <span className="dsf-layer-toolbar__count-label">selected</span>
          </div>
          <button type="button" className="dsf-layer-toolbar__btn" onClick={() => onSelectMany(allFilteredIds)} disabled={filtered.length === 0} aria-label="Select all filtered">
            <i className="fa-solid fa-check-double" aria-hidden />
            Select all
          </button>
          <button type="button" className="dsf-layer-toolbar__btn dsf-layer-toolbar__btn--ghost" onClick={() => onClearMany(allFilteredIds)} disabled={selectedInFiltered === 0} aria-label="Clear all filtered">
            <i className="fa-solid fa-xmark" aria-hidden />
            Clear
          </button>
        </div>
      </div>

      <div className="dsf-layer-search-wrap">
        <i className="fa-solid fa-magnifying-glass dsf-layer-search-wrap__icon" aria-hidden />
        <input
          className="dsf-layer-search"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search layers…"
          aria-label="Search available layers"
        />
      </div>

      {view === 'tree' ? (
        <div className="dsf-layer-tree-scroll" style={{ maxHeight: viewportHeight }}>
          {grouped.length ? (
            grouped.map(([k, items]) => {
              const label = groupLabel[k] ?? k
              const totalCount = items.length
              const selectedCount = items.filter(l => selectedIds.has(l.id)).length
              const allChecked = totalCount > 0 && selectedCount === totalCount
              const indeterminate = selectedCount > 0 && selectedCount < totalCount
              const expanded = expandedGroups[k] ?? true
              return (
                <div key={k} style={{ border: '1px solid var(--ds-color-border)', borderRadius: 12, background: 'var(--ds-color-surface)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 10px', background: 'var(--ds-color-surface-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <IndeterminateCheckbox
                        checked={allChecked}
                        indeterminate={indeterminate}
                        onChange={() => {
                          const ids = items.map(i => i.id)
                          if (allChecked) onClearMany(ids)
                          else onSelectMany(ids)
                        }}
                        ariaLabel={`Select group ${label}`}
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedGroups(prev => ({ ...prev, [k]: !(prev[k] ?? true) }))}
                        style={{ border: '1px solid var(--ds-color-border)', background: 'var(--ds-color-surface)', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', fontWeight: 900, fontSize: 12 }}
                        aria-label={`Toggle group ${label}`}
                      >
                        {expanded ? '▾' : '▸'} {label} <span style={{ color: 'var(--ds-color-text-muted)', fontWeight: 800 }}>({selectedCount}/{totalCount})</span>
                      </button>
                    </div>
                  </div>
                  {!expanded ? null : (
                    <div className="dsf-layer-tree-items">
                      {items.map(l => {
                        const checked = selectedIds.has(l.id)
                        return (
                          <label key={l.id} className={`dsf-layer-row${checked ? ' dsf-layer-row--selected' : ''}`}>
                            <input type="checkbox" className="dsf-layer-row-native" checked={checked} onChange={() => onToggle(l.id)} aria-label={`Select layer ${l.name}`} />
                            <span className="dsf-layer-row-indicator" aria-hidden />
                            <span className="dsf-layer-row-label">{l.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <div className="dsf-layer-empty">No layers found.</div>
          )}
        </div>
      ) : view === 'grid' ? (
        <div className="dsf-layer-grid">
          {filtered.length ? (
            filtered.map(l => {
              const checked = selectedIds.has(l.id)
              return (
                <label key={l.id} className={`dsf-layer-card${checked ? ' dsf-layer-card--selected' : ''}`}>
                  <input type="checkbox" className="dsf-layer-card-native" checked={checked} onChange={() => onToggle(l.id)} aria-label={`Select layer ${l.name}`} />
                  <span className="dsf-layer-card-body">
                    <span className="dsf-layer-card-top">
                      <span className="dsf-layer-card-title">{l.name}</span>
                      <span className="dsf-layer-card-badge" aria-hidden>
                        <i className="fa-solid fa-check" />
                      </span>
                    </span>
                    <span className="dsf-layer-card-meta">{l.fields.length ? `${l.fields.length} fields` : 'Fields: unknown'}</span>
                  </span>
                </label>
              )
            })
          ) : (
            <div className="dsf-layer-grid-empty">No layers found.</div>
          )}
        </div>
      ) : (
        <div
          ref={listViewportRef}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          className="dsf-layer-list-scroll"
          style={{ height: viewportHeight }}
          role="listbox"
          aria-multiselectable="true"
          aria-label="Available layers"
          tabIndex={0}
        >
          <div style={{ paddingTop: padTop, paddingBottom: padBottom, display: 'grid', gap: 6 }}>
            {total ? (
              visible.map(l => {
                const checked = selectedIds.has(l.id)
                return (
                  <label key={l.id} className={`dsf-layer-row dsf-layer-row--compact${checked ? ' dsf-layer-row--selected' : ''}`} style={{ height: rowHeight }}>
                    <input type="checkbox" className="dsf-layer-row-native" checked={checked} onChange={() => onToggle(l.id)} aria-label={`Select layer ${l.name}`} />
                    <span className="dsf-layer-row-indicator" aria-hidden />
                    <span className="dsf-layer-row-label">{l.name}</span>
                  </label>
                )
              })
            ) : (
              <div className="dsf-layer-empty">No layers found.</div>
            )}
          </div>
        </div>
      )}

      <div className="dsf-shortcuts">
        <i className="fa-regular fa-keyboard dsf-shortcuts__icon" aria-hidden />
        <span>{ui.shortcutsHint}</span>
      </div>
    </div>
  )
}
