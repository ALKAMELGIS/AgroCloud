import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'

type RemoteSensingLayerSelectProps = {
  groups: RemoteSensingLayerSelectGroup[]
  value: string
  onChange: (layerId: string) => void
  disabled?: boolean
  loading?: boolean
  loadingLabel?: string
  emptyLabel?: string
  'aria-label'?: string
}

function findSelectedOption(groups: RemoteSensingLayerSelectGroup[], value: string) {
  const u = value.trim().toUpperCase()
  if (!u) return null
  for (const group of groups) {
    const opts = Array.isArray(group?.options) ? group.options : []
    for (const opt of opts) {
      if (opt.id.toUpperCase() === u) return opt
    }
  }
  return null
}

function layerOptionTitle(opt: { label: string; scientificName?: string }): string {
  return opt.scientificName ? `${opt.label} — ${opt.scientificName}` : opt.label
}

export function RemoteSensingLayerSelect({
  groups = [],
  value,
  onChange,
  disabled = false,
  loading = false,
  loadingLabel = 'Loading Sentinel Hub layers…',
  emptyLabel = 'No Sentinel Hub WMS layers — check API tokens / instance ID.',
  'aria-label': ariaLabel = 'Layer',
}: RemoteSensingLayerSelectProps) {
  const listboxId = useId()
  const searchId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const safeGroups = Array.isArray(groups) ? groups : []
  const selected = useMemo(() => findSelectedOption(safeGroups, value), [safeGroups, value])
  const firstOption = safeGroups[0]?.options?.[0] ?? null
  const selectedLabel = selected?.label ?? firstOption?.label ?? value

  // If the parent still holds a stale layer id (e.g. NDVI after switching Collection),
  // coerce to the first option of the current catalogue.
  useEffect(() => {
    if (!safeGroups.length || !firstOption) return
    if (findSelectedOption(safeGroups, value)) return
    onChange(firstOption.id)
    // intentionally omit onChange — parent often passes an inline function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeGroups, value, firstOption?.id])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return safeGroups
    return safeGroups
      .map(group => {
        const opts = Array.isArray(group?.options) ? group.options : []
        const groupMatch = String(group?.label || '')
          .toLowerCase()
          .includes(q)
        const options = opts.filter(opt => {
          if (groupMatch) return true
          const hay = [opt.label, opt.id, opt.scientificName ?? ''].join(' ').toLowerCase()
          return hay.includes(q)
        })
        return options.length ? { ...group, options } : null
      })
      .filter((g): g is RemoteSensingLayerSelectGroup => g != null)
  }, [safeGroups, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    // Focus without scroll/animation so the menu does not flash or jump.
    const t = window.setTimeout(() => {
      searchRef.current?.focus({ preventScroll: true })
    }, 0)
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

  if (loading) {
    return (
      <div className="si-rs-layer-select si-rs-layer-select--disabled" aria-busy="true">
        <button type="button" className="si-rs-layer-select__trigger si-field-analysis-select" disabled>
          <span className="si-rs-layer-select__abbr">{loadingLabel}</span>
        </button>
      </div>
    )
  }

  if (!safeGroups.length) {
    return (
      <div className="si-rs-layer-select si-rs-layer-select--disabled">
        <button type="button" className="si-rs-layer-select__trigger si-field-analysis-select" disabled>
          <span className="si-rs-layer-select__abbr">{emptyLabel}</span>
        </button>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={`si-rs-layer-select${open ? ' is-open' : ''}${disabled ? ' si-rs-layer-select--disabled' : ''}`}
    >
      <button
        type="button"
        className="si-rs-layer-select__trigger si-field-analysis-select"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        title={selected ? layerOptionTitle(selected) : selectedLabel}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="si-rs-layer-select__abbr">{selectedLabel}</span>
        <span className="si-rs-layer-select__chevron" aria-hidden />
      </button>

      {open ? (
        <div id={listboxId} className="si-rs-layer-select__menu" role="listbox" aria-label={ariaLabel}>
          <div className="si-rs-layer-select__search-wrap">
            <i className="fa-solid fa-magnifying-glass si-rs-layer-select__search-icon" aria-hidden />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              className="si-rs-layer-select__search"
              placeholder="Search layers…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              aria-label="Search layers"
            />
          </div>
          {filteredGroups.length ? (
            filteredGroups.map(group => (
              <div key={group.id} className="si-rs-layer-select__group">
                <div className="si-rs-layer-select__group-label">{group.label}</div>
                {group.options.map(opt => {
                  const active = opt.id.toUpperCase() === value.trim().toUpperCase()
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`si-rs-layer-select__option${active ? ' is-active' : ''}`}
                      title={layerOptionTitle(opt)}
                      onClick={() => {
                        onChange(opt.id)
                        setOpen(false)
                      }}
                    >
                      <span className="si-rs-layer-select__abbr">{opt.label}</span>
                      {opt.scientificName ? (
                        <span className="si-rs-layer-select__science">{opt.scientificName}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))
          ) : (
            <p className="si-rs-layer-select__empty">No layers match &ldquo;{query.trim()}&rdquo;</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
