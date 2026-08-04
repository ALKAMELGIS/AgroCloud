import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AcpStructureFieldOption } from '../acpMapSpatial'

type Props = {
  options: AcpStructureFieldOption[]
  selectedKeys: string[]
  onSelectedKeysChange: (keys: string[]) => void
  disabled?: boolean
  emptyLabel?: string
  'aria-label'?: string
}

function toggleKey(selected: string[], key: string): string[] {
  if (selected.includes(key)) return selected.filter(k => k !== key)
  return [...selected, key]
}

export function SiAoiFieldMultiSelect({
  options,
  selectedKeys,
  onSelectedKeysChange,
  disabled = false,
  emptyLabel = 'No AOI layers',
  'aria-label': ariaLabel = 'AOI layers',
}: Props) {
  const listboxId = useId()
  const searchId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedSummary = useMemo(() => {
    if (!selectedKeys.length) return 'Select AOI layers'
    const labels = selectedKeys.map(
      key => options.find(o => o.fieldKey === key)?.displayName ?? key,
    )
    if (labels.length <= 2) return labels.join(', ')
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
  }, [options, selectedKeys])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(opt => opt.displayName.toLowerCase().includes(q) || opt.fieldKey.toLowerCase().includes(q))
  }, [options, query])

  const filteredKeys = useMemo(() => filteredOptions.map(o => o.fieldKey), [filteredOptions])
  const allFilteredSelected =
    filteredKeys.length > 0 && filteredKeys.every(key => selectedKeys.includes(key))
  const someFilteredSelected = filteredKeys.some(key => selectedKeys.includes(key))

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

  const selectAllFiltered = () => {
    if (!filteredKeys.length) return
    if (allFilteredSelected) {
      const drop = new Set(filteredKeys)
      onSelectedKeysChange(selectedKeys.filter(key => !drop.has(key)))
      return
    }
    const merged = new Set([...selectedKeys, ...filteredKeys])
    onSelectedKeysChange(options.map(o => o.fieldKey).filter(key => merged.has(key)))
  }

  const clearAll = () => {
    onSelectedKeysChange([])
  }

  if (!options.length) {
    return (
      <div className="acp-ts-layer-select acp-ts-layer-select--disabled">
        <button type="button" className="acp-ts-layer-select__trigger" disabled>
          {emptyLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="acp-ts-layer-select" ref={rootRef}>
      <button
        type="button"
        className="acp-ts-layer-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
      >
        <span className="acp-ts-layer-select__summary">{selectedSummary}</span>
        {selectedKeys.length ? (
          <span className="acp-ts-layer-select__count">{selectedKeys.length}</span>
        ) : null}
        <i className="fa-solid fa-chevron-down acp-ts-layer-select__chevron" aria-hidden />
      </button>
      {open ? (
        <div className="acp-ts-layer-select__menu" role="listbox" id={listboxId} aria-label={ariaLabel} aria-multiselectable>
          <div className="acp-ts-layer-select__search-wrap">
            <i className="fa-solid fa-magnifying-glass acp-ts-layer-select__search-icon" aria-hidden />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              className="acp-ts-layer-select__search"
              placeholder="Search AOI layers…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search AOI layers"
            />
          </div>
          <div className="acp-ts-layer-select__bulk">
            <label
              className={
                'acp-ts-layer-select__option acp-ts-layer-select__option--bulk' +
                (allFilteredSelected ? ' is-checked' : '')
              }
            >
              <input
                type="checkbox"
                className="acp-ts-layer-select__checkbox"
                checked={allFilteredSelected}
                ref={el => {
                  if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected
                }}
                onChange={selectAllFiltered}
                aria-label={allFilteredSelected ? 'Deselect all' : 'Select all'}
              />
              <span className="acp-ts-layer-select__option-text">
                <span className="acp-ts-layer-select__option-abbr">
                  {allFilteredSelected ? 'Deselect all' : 'Select all'}
                  {query.trim() ? ` (${filteredKeys.length})` : ''}
                </span>
              </span>
            </label>
            {selectedKeys.length ? (
              <button type="button" className="acp-ts-layer-select__clear" onClick={clearAll}>
                Clear
              </button>
            ) : null}
          </div>
          {filteredOptions.length ? (
            filteredOptions.map(opt => {
              const on = selectedKeys.includes(opt.fieldKey)
              return (
                <label
                  key={opt.fieldKey}
                  className={'acp-ts-layer-select__option' + (on ? ' is-checked' : '')}
                  title={opt.displayName}
                >
                  <input
                    type="checkbox"
                    className="acp-ts-layer-select__checkbox"
                    checked={on}
                    onChange={() => onSelectedKeysChange(toggleKey(selectedKeys, opt.fieldKey))}
                  />
                  <span className="acp-ts-layer-select__option-text">
                    <span className="acp-ts-layer-select__option-abbr">{opt.displayName}</span>
                  </span>
                </label>
              )
            })
          ) : (
            <div className="acp-ts-layer-select__empty">No matching plots</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
