import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AcpStructureFieldOption } from '../acpMapSpatial'

type Props = {
  options: AcpStructureFieldOption[]
  value: string
  onChange: (fieldKey: string) => void
  disabled?: boolean
  emptyLabel?: string
  searchPlaceholder?: string
  'aria-label'?: string
}

function filterFieldOptions(options: AcpStructureFieldOption[], query: string): AcpStructureFieldOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter(
    opt =>
      opt.displayName.toLowerCase().includes(q) ||
      opt.fieldKey.toLowerCase().includes(q) ||
      opt.objectId.toLowerCase().includes(q),
  )
}

export function SiAoiFieldSelect({
  options,
  value,
  onChange,
  disabled = false,
  emptyLabel = 'No AOI fields',
  searchPlaceholder = 'Search fields…',
  'aria-label': ariaLabel = 'Field name',
}: Props) {
  const listboxId = useId()
  const searchId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedLabel = options.find(o => o.fieldKey === value)?.displayName ?? 'Select field'

  const filteredOptions = useMemo(() => filterFieldOptions(options, query), [options, query])

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

  const selectValue = (fieldKey: string) => {
    onChange(fieldKey)
    setOpen(false)
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
    <div className={`acp-ts-layer-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="acp-ts-layer-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
      >
        <span className="acp-ts-layer-select__summary">{selectedLabel}</span>
        <i className="fa-solid fa-chevron-down acp-ts-layer-select__chevron" aria-hidden />
      </button>
      {open ? (
        <div className="acp-ts-layer-select__menu" role="listbox" id={listboxId} aria-label={ariaLabel}>
          <div className="acp-ts-layer-select__search-wrap">
            <i className="fa-solid fa-magnifying-glass acp-ts-layer-select__search-icon" aria-hidden />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              className="acp-ts-layer-select__search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search fields"
            />
          </div>
          {filteredOptions.length ? (
            filteredOptions.map(opt => {
              const selected = value === opt.fieldKey
              return (
                <button
                  key={opt.fieldKey}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`acp-ts-layer-select__option acp-ts-layer-select__option--single${selected ? ' is-checked' : ''}`}
                  title={opt.displayName}
                  onClick={() => selectValue(opt.fieldKey)}
                >
                  <span className="acp-ts-layer-select__option-text">
                    <span className="acp-ts-layer-select__option-abbr">{opt.displayName}</span>
                  </span>
                </button>
              )
            })
          ) : (
            <p className="acp-ts-layer-select__empty">No fields match &ldquo;{query.trim()}&rdquo;</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
