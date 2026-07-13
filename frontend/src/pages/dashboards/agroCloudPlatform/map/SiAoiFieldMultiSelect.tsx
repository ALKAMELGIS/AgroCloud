import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AcpStructureFieldOption } from '../acpMapSpatial'

type Props = {
  options: AcpStructureFieldOption[]
  selectedKeys: string[]
  onSelectedKeysChange: (keys: string[]) => void
  disabled?: boolean
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

  if (!options.length) {
    return (
      <div className="acp-ts-layer-select acp-ts-layer-select--disabled">
        <button type="button" className="acp-ts-layer-select__trigger" disabled>
          No AOI layers
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
          {filteredOptions.map(opt => {
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
          })}
        </div>
      ) : null}
    </div>
  )
}
