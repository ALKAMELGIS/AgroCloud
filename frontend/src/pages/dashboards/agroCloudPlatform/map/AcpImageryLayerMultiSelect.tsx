import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { RemoteSensingLayerSelectGroup } from '../../../../lib/agroCompositeIndices'

type Props = {
  groups: RemoteSensingLayerSelectGroup[]
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  'aria-label'?: string
}

function normalizeId(id: string): string {
  return id.trim().toUpperCase()
}

function findOptionLabel(groups: RemoteSensingLayerSelectGroup[], layerId: string): string {
  const want = normalizeId(layerId)
  for (const group of groups) {
    for (const opt of group.options) {
      if (normalizeId(opt.id) === want) return opt.label
    }
  }
  return layerId
}

function isSelected(selectedIds: string[], layerId: string): boolean {
  const want = normalizeId(layerId)
  return selectedIds.some(id => normalizeId(id) === want)
}

function toggleLayerId(selectedIds: string[], layerId: string): string[] {
  const want = normalizeId(layerId)
  if (isSelected(selectedIds, want)) {
    if (selectedIds.length <= 1) return selectedIds
    return selectedIds.filter(id => normalizeId(id) !== want)
  }
  return [...selectedIds, want]
}

export function AcpImageryLayerMultiSelect({
  groups,
  selectedIds,
  onSelectedIdsChange,
  'aria-label': ariaLabel = 'Layers',
}: Props) {
  const listboxId = useId()
  const searchId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedSummary = useMemo(() => {
    if (!selectedIds.length) return 'Select layers'
    const labels = selectedIds.map(id => findOptionLabel(groups, id))
    if (labels.length <= 2) return labels.join(', ')
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
  }, [groups, selectedIds])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map(group => {
        const groupMatch = group.label.toLowerCase().includes(q)
        const options = group.options.filter(opt => {
          if (groupMatch) return true
          const hay = [opt.label, opt.id, opt.scientificName ?? ''].join(' ').toLowerCase()
          return hay.includes(q)
        })
        return options.length ? { ...group, options } : null
      })
      .filter((g): g is RemoteSensingLayerSelectGroup => g != null)
  }, [groups, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0)
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!groups.length) {
    return (
      <div className="acp-ts-layer-select acp-ts-layer-select--disabled">
        <button type="button" className="acp-ts-layer-select__trigger" disabled>
          No layers
        </button>
      </div>
    )
  }

  return (
    <div ref={rootRef} className={`acp-ts-layer-select${open ? ' is-open' : ''}`}>
      <span className="acp-ts__field-label">Layer</span>
      <button
        type="button"
        className="acp-ts-layer-select__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="acp-ts-layer-select__summary">{selectedSummary}</span>
        <span className="acp-ts-layer-select__count">
          {selectedIds.length} layer{selectedIds.length === 1 ? '' : 's'}
        </span>
        <span className="acp-ts-layer-select__chevron" aria-hidden />
      </button>

      {open ? (
        <div id={listboxId} className="acp-ts-layer-select__menu" role="listbox" aria-multiselectable="true" aria-label={ariaLabel}>
          <div className="acp-ts-layer-select__search-wrap">
            <i className="fa-solid fa-magnifying-glass acp-ts-layer-select__search-icon" aria-hidden />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              className="acp-ts-layer-select__search"
              placeholder="Search layers…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search layers"
            />
          </div>
          {filteredGroups.length ? (
            filteredGroups.map(group => (
              <div key={group.id} className="acp-ts-layer-select__group">
                <div className="acp-ts-layer-select__group-label">{group.label}</div>
                {group.options.map(opt => {
                  const checked = isSelected(selectedIds, opt.id)
                  const onlyOne = selectedIds.length <= 1
                  return (
                    <label
                      key={opt.id}
                      className={`acp-ts-layer-select__option${checked ? ' is-checked' : ''}`}
                      title={opt.scientificName ? `${opt.label} — ${opt.scientificName}` : opt.label}
                    >
                      <input
                        type="checkbox"
                        className="acp-ts-layer-select__checkbox"
                        checked={checked}
                        disabled={checked && onlyOne}
                        onChange={() => onSelectedIdsChange(toggleLayerId(selectedIds, opt.id))}
                      />
                      <span className="acp-ts-layer-select__option-text">
                        <span className="acp-ts-layer-select__option-abbr">{opt.label}</span>
                        {opt.scientificName ? (
                          <span className="acp-ts-layer-select__option-science">{opt.scientificName}</span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </div>
            ))
          ) : (
            <p className="acp-ts-layer-select__empty">No layers match &ldquo;{query.trim()}&rdquo;</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
