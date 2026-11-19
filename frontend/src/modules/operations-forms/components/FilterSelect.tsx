import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type Option = { value: string; count?: number }

type Props = {
  label: string
  options: Option[]
  selected: string[]
  onChange: (values: string[]) => void
  searchPlaceholder: string
  clearLabel: string
}

/** Multi-select filter with search and counts (closes on outside click / Esc). */
export function FilterSelect({ label, options, selected, onChange, searchPlaceholder, clearLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? options.filter(o => o.value.toLowerCase().includes(s)) : options
  }, [options, q])

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  return (
    <div className="ops-dd" ref={ref}>
      <button type="button" className="ops-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {label}
        {selected.length ? <span className="ops-badge-count">{selected.length}</span> : null}
        <ChevronDown aria-hidden />
      </button>
      {open ? (
        <div className="ops-dd__panel" role="listbox" aria-multiselectable="true" aria-label={label}>
          <input className="ops-input" placeholder={searchPlaceholder} value={q} onChange={e => setQ(e.target.value)} autoFocus aria-label={searchPlaceholder} />
          <div className="ops-dd__list">
            {visible.map(o => (
              <label key={o.value} className="ops-dd__opt">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                <span>{o.value}</span>
                {o.count != null ? <span className="ops-dd__count">{o.count.toLocaleString()}</span> : null}
              </label>
            ))}
            {!visible.length ? <p className="ops-dd__count" style={{ padding: 8 }}>—</p> : null}
          </div>
          {selected.length ? (
            <button type="button" className="ops-btn ops-btn--ghost ops-btn--sm" style={{ margin: 6 }} onClick={() => onChange([])}>
              {clearLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
