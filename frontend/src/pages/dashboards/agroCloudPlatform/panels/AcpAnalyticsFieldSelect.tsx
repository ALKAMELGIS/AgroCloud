import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AcpFieldTableRow } from '../acpMapSpatial'

export const ACP_ANALYTICS_ALL_FIELDS_KEY = '__all__'

type Props = {
  options: AcpFieldTableRow[]
  value: string
  onChange: (fieldKey: string) => void
  'aria-label'?: string
}

function filterFieldOptions(rows: AcpFieldTableRow[], query: string): AcpFieldTableRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(row => {
    const hay = [row.displayName, row.fieldKey, row.objectId, row.country].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

export function AcpAnalyticsFieldSelect({
  options,
  value,
  onChange,
  'aria-label': ariaLabel = 'Select field for vegetation coverage',
}: Props) {
  const listboxId = useId()
  const searchId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedLabel =
    value === ACP_ANALYTICS_ALL_FIELDS_KEY
      ? 'All fields'
      : options.find(row => row.fieldKey === value)?.displayName ?? 'Field'

  const filteredOptions = useMemo(() => filterFieldOptions(options, query), [options, query])

  const showAllFields =
    !query.trim() ||
    'all fields'.includes(query.trim().toLowerCase()) ||
    ACP_ANALYTICS_ALL_FIELDS_KEY.includes(query.trim().toLowerCase())

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0)
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selectValue = (fieldKey: string) => {
    onChange(fieldKey)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={`acp-analytics-field-select${open ? ' is-open' : ''}`}>
      <span className="acp-analytics__field-select-label">Field</span>
      <div className="acp-analytics-field-select__control">
        <button
          type="button"
          className="acp-analytics-field-select__trigger"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => setOpen(prev => !prev)}
        >
          <span className="acp-analytics-field-select__summary">{selectedLabel}</span>
          <span className="acp-analytics-field-select__chevron" aria-hidden />
        </button>

        {open ? (
          <div id={listboxId} className="acp-analytics-field-select__menu" role="listbox" aria-label={ariaLabel}>
            <div className="acp-analytics-field-select__search-wrap">
              <i className="fa-solid fa-magnifying-glass acp-analytics-field-select__search-icon" aria-hidden />
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                className="acp-analytics-field-select__search"
                placeholder="Search field…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search field"
              />
            </div>
            {showAllFields ? (
              <button
                type="button"
                role="option"
                aria-selected={value === ACP_ANALYTICS_ALL_FIELDS_KEY}
                className={`acp-analytics-field-select__option${value === ACP_ANALYTICS_ALL_FIELDS_KEY ? ' is-selected' : ''}`}
                onClick={() => selectValue(ACP_ANALYTICS_ALL_FIELDS_KEY)}
              >
                All fields
              </button>
            ) : null}
            {filteredOptions.length ? (
              filteredOptions.map(row => (
                <button
                  key={row.fieldKey}
                  type="button"
                  role="option"
                  aria-selected={value === row.fieldKey}
                  className={`acp-analytics-field-select__option${value === row.fieldKey ? ' is-selected' : ''}`}
                  onClick={() => selectValue(row.fieldKey)}
                >
                  {row.displayName}
                </button>
              ))
            ) : !showAllFields ? (
              <p className="acp-analytics-field-select__empty">No fields match &ldquo;{query.trim()}&rdquo;</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
