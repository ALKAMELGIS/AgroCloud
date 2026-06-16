import { createPortal } from 'react-dom'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSiInstanceScope } from '../siInstanceScope'
import './FieldVisibilityControl.css'

type Props = {
  layerId: string
  fields: string[]
  hiddenFields: Set<string>
  onChangeHiddenFields: (next: Set<string>) => void
}

const storageKeyForLayer = (layerId: string, scopeKey: (base: string) => string) =>
  scopeKey(`gis:layer-table:hidden-fields:${layerId}`)

const readHiddenFields = (layerId: string, fields: string[], scopeKey: (base: string) => string) => {
  const key = storageKeyForLayer(layerId, scopeKey)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set<string>()
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed) ? parsed : []
    const fieldSet = new Set(fields.map(f => String(f)))
    const next = new Set<string>()
    for (const v of list) {
      const s = String(v)
      if (fieldSet.has(s)) next.add(s)
    }
    return next
  } catch {
    return new Set<string>()
  }
}

const writeHiddenFields = (layerId: string, hidden: Set<string>, scopeKey: (base: string) => string) => {
  const key = storageKeyForLayer(layerId, scopeKey)
  try {
    const list = Array.from(hidden.values())
    window.localStorage.setItem(key, JSON.stringify(list))
  } catch {}
}

const POPOVER_WIDTH = 360

export function FieldVisibilityControl({ layerId, fields, hiddenFields, onChangeHiddenFields }: Props) {
  const { scopedStorageKey } = useSiInstanceScope()
  const headingId = useId()
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<null | { top: number; left: number }>(null)
  const [query, setQuery] = useState('')
  const [sortAlpha, setSortAlpha] = useState(false)

  const fieldsSig = useMemo(() => fields.join('\u0000'), [fields])

  const filteredFields = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? fields.filter(f => f.toLowerCase().includes(q)) : [...fields]
    if (sortAlpha) base.sort((a, b) => a.localeCompare(b))
    return base
  }, [fields, query, sortAlpha])

  useEffect(() => {
    const next = readHiddenFields(layerId, fields, scopedStorageKey)
    onChangeHiddenFields(next)
  }, [layerId, fieldsSig, scopedStorageKey])

  useEffect(() => {
    writeHiddenFields(layerId, hiddenFields, scopedStorageKey)
  }, [layerId, hiddenFields, fieldsSig, scopedStorageKey])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const btn = btnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const margin = 8
      const maxH = Math.min(520, window.innerHeight * 0.72)
      let left = r.left
      if (left + POPOVER_WIDTH > window.innerWidth - margin) left = window.innerWidth - POPOVER_WIDTH - margin
      if (left < margin) left = margin
      let top = r.bottom + margin
      if (top + maxH > window.innerHeight - margin) {
        top = Math.max(margin, r.top - maxH - margin)
      }
      setPos({ left, top })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSortAlpha(false)
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Node)) return
      const pop = popRef.current
      const btnEl = btnRef.current
      if (btnEl?.contains(target)) return
      if (pop?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => searchRef.current?.focus?.(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  const toggleField = (field: string) => {
    const next = new Set(hiddenFields)
    if (next.has(field)) next.delete(field)
    else next.add(field)
    onChangeHiddenFields(next)
  }

  const selectAllVisible = () => {
    onChangeHiddenFields(new Set())
  }

  const popover =
    open && pos ? (
      <div
        ref={popRef}
        className="gis-fieldvis-popover"
        role="dialog"
        aria-modal="true"
        aria-label="Field visibility"
        style={{ left: `${pos.left}px`, top: `${pos.top}px`, width: `${POPOVER_WIDTH}px` }}
        dir="ltr"
      >
        <header className="gis-fieldvis-popover__header">
          <h2 className="gis-fieldvis-popover__title" id={headingId}>
            Field visibility
          </h2>
          <button
            type="button"
            className="gis-fieldvis-popover__close"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="gis-fieldvis-popover__toolbar">
          <div className="gis-fieldvis-popover__search-wrap">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              className="gis-fieldvis-popover__search"
              placeholder="Search fields"
              aria-label="Search fields"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            className={`gis-fieldvis-popover__filter${sortAlpha ? ' gis-fieldvis-popover__filter--on' : ''}`}
            aria-label={sortAlpha ? 'Restore layer field order' : 'Sort fields A–Z'}
            aria-pressed={sortAlpha}
            title={sortAlpha ? 'Original order' : 'Sort A–Z'}
            onClick={() => setSortAlpha(v => !v)}
          >
            <i className="fa-solid fa-filter" aria-hidden />
          </button>
        </div>

        <div className="gis-fieldvis-popover__select-row">
          <button type="button" className="gis-fieldvis-popover__select-all" onClick={selectAllVisible}>
            Select all
          </button>
        </div>

        <div className="gis-fieldvis-popover__list" role="list" aria-labelledby={headingId}>
          {filteredFields.length === 0 ? (
            <div className="gis-fieldvis-popover__empty">No fields match your search.</div>
          ) : (
            filteredFields.map(f => {
              const visible = !hiddenFields.has(f)
              return (
                <div className="gis-fieldvis-popover__row" role="listitem" key={f}>
                  <label className="gis-fieldvis-popover__check">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleField(f)}
                      aria-label={visible ? `Hide field ${f}` : `Show field ${f}`}
                    />
                    <span className="gis-fieldvis-popover__label" title={f}>
                      {f}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="gis-fieldvis-popover__info"
                    title={f}
                    aria-label={`Field name: ${f}`}
                    tabIndex={-1}
                  >
                    <i className="fa-regular fa-circle-info" aria-hidden />
                  </button>
                </div>
              )
            })
          )}
        </div>

        <footer className="gis-fieldvis-popover__footer">
          <button type="button" className="gis-fieldvis-popover__done" onClick={() => setOpen(false)}>
            Done
          </button>
        </footer>
      </div>
    ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`gis-fieldvis-trigger${open ? ' gis-fieldvis-trigger--open' : ''}`}
        aria-label="Field visibility"
        title="Field visibility"
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen(v => !v)}
      >
        <i className="fa-solid fa-gear" aria-hidden="true" />
      </button>
      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </>
  )
}

export const __test__ = {
  storageKeyForLayer,
  readHiddenFields,
  writeHiddenFields,
}
