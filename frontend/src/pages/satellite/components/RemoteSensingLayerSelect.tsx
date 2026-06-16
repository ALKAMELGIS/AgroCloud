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
    for (const opt of group.options) {
      if (opt.id.toUpperCase() === u) return opt
    }
  }
  return null
}

function layerOptionTitle(opt: { label: string; scientificName?: string }): string {
  return opt.scientificName ? `${opt.label} — ${opt.scientificName}` : opt.label
}

export function RemoteSensingLayerSelect({
  groups,
  value,
  onChange,
  disabled = false,
  loading = false,
  loadingLabel = 'Loading Sentinel Hub layers…',
  emptyLabel = 'No Sentinel Hub WMS layers — check API tokens / instance ID.',
  'aria-label': ariaLabel = 'Layer',
}: RemoteSensingLayerSelectProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = useMemo(() => findSelectedOption(groups, value), [groups, value])
  const selectedLabel = selected?.label ?? value

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
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

  if (!groups.length) {
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
          {groups.map(group => (
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
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
