import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import {
  LAYER_LIVE_STATS_QUICK_ACCESS_IDS,
  resolveLayerLiveStatsQuickAccessMeta,
  toggleLayerLiveStatsLayerId,
  type LayerLiveStatsLayerId,
} from '../utils/staticAoiMultiChartData'

type LayerLiveStatsLayerDropdownProps = {
  groups: RemoteSensingLayerSelectGroup[]
  selectedIds: LayerLiveStatsLayerId[]
  onSelectedIdsChange: (ids: LayerLiveStatsLayerId[]) => void
  /** Active WMS / Layer Live map layer — always included in charts. */
  primaryLayerId?: string
  compact?: boolean
  'aria-label'?: string
}

function findOptionLabel(groups: RemoteSensingLayerSelectGroup[], layerId: string): string {
  const u = layerId.trim().toUpperCase()
  for (const group of groups) {
    for (const opt of group.options) {
      if (opt.id.toUpperCase() === u) return opt.label
    }
  }
  return layerId
}

function isSelected(selectedIds: LayerLiveStatsLayerId[], layerId: string): boolean {
  const u = layerId.trim().toUpperCase()
  return selectedIds.some(id => id.toUpperCase() === u)
}

export function LayerLiveStatsLayerDropdown({
  groups,
  selectedIds,
  onSelectedIdsChange,
  primaryLayerId,
  compact = false,
  'aria-label': ariaLabel = 'Statistical analysis layers',
}: LayerLiveStatsLayerDropdownProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const primaryU = primaryLayerId?.trim().toUpperCase() ?? ''
  const primaryLabel = primaryLayerId ? findOptionLabel(groups, primaryLayerId) : ''

  const selectedSummary = useMemo(() => {
    if (!selectedIds.length) return 'Select layers'
    const labels = selectedIds.map(id => findOptionLabel(groups, id))
    if (labels.length <= 3) return labels.join(', ')
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
  }, [groups, selectedIds])

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

  const onToggleLayer = (layerId: string) => {
    if (primaryU && layerId.trim().toUpperCase() === primaryU) return
    onSelectedIdsChange(toggleLayerLiveStatsLayerId(selectedIds, layerId, groups))
  }

  const onQuickChipClick = (layerId: string) => {
    const u = layerId.trim().toUpperCase()
    const on = isSelected(selectedIds, layerId)
    const isPrimary = primaryU === u
    if (on && (selectedIds.length <= 1 || isPrimary)) return
    onSelectedIdsChange(toggleLayerLiveStatsLayerId(selectedIds, layerId, groups))
  }

  if (!groups.length) {
    return (
      <div className="si-layer-live-stats-select si-layer-live-stats-select--disabled">
        <button type="button" className="si-layer-live-stats-select__trigger" disabled>
          <span className="si-layer-live-stats-select__abbr">Load Sentinel Hub layers…</span>
        </button>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={`si-layer-live-stats-select${open ? ' is-open' : ''}${compact ? ' si-layer-live-stats-select--compact' : ''}`}
    >
      <div className="si-layer-live-stats-select__head">
        <span className="si-layer-live-stats-select__kicker">Statistical analysis</span>
        {primaryLayerId ? (
          <span className="si-layer-live-stats-select__primary" title="Primary map layer (unchanged)">
            Primary: <strong>{primaryLabel}</strong>
          </span>
        ) : null}
      </div>
      <div className="si-layer-live-stats-select__quick" role="group" aria-label="Core index quick access">
        {LAYER_LIVE_STATS_QUICK_ACCESS_IDS.map(id => {
          const meta = resolveLayerLiveStatsQuickAccessMeta(id)
          const on = isSelected(selectedIds, id)
          const isPrimary = primaryU === id
          const onlyOne = selectedIds.length <= 1
          const disabled = on && (onlyOne || isPrimary)
          return (
            <button
              key={id}
              type="button"
              className={`si-map-analysis-layer-chip${on ? ' si-map-analysis-layer-chip--on' : ''}${isPrimary ? ' si-map-analysis-layer-chip--primary' : ''}`}
              title={isPrimary ? `${meta.subtitle} · Primary map layer` : meta.subtitle}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onQuickChipClick(id)}
            >
              {meta.label}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className="si-layer-live-stats-select__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="si-layer-live-stats-select__trigger-row">
          <span className="si-layer-live-stats-select__abbr">{selectedSummary}</span>
          <span className="si-layer-live-stats-select__count">
            {selectedIds.length} layer{selectedIds.length === 1 ? '' : 's'}
          </span>
        </span>
        <span className="si-layer-live-stats-select__chevron" aria-hidden />
      </button>

      {open ? (
        <div id={listboxId} className="si-layer-live-stats-select__menu" role="listbox" aria-label={ariaLabel} aria-multiselectable="true">
          <p className="si-layer-live-stats-select__hint">
            Check layers for AOI charts. Primary map layer stays active on the map.
          </p>
          {groups.map(group => (
            <div key={group.id} className="si-layer-live-stats-select__group">
              <div className="si-layer-live-stats-select__group-label">{group.label}</div>
              {group.options.map(opt => {
                const isPrimary = primaryU === opt.id.toUpperCase()
                const checked = isPrimary || isSelected(selectedIds, opt.id)
                const onlyOne = selectedIds.length <= 1
                const disableUncheck = checked && onlyOne && !isPrimary
                return (
                  <label
                    key={opt.id}
                    className={`si-layer-live-stats-select__option${checked ? ' is-checked' : ''}${isPrimary ? ' is-primary' : ''}`}
                    title={
                      opt.scientificName
                        ? `${opt.label} — ${opt.scientificName}${isPrimary ? ' · Primary map layer' : ''}`
                        : isPrimary
                          ? `${opt.label} · Primary map layer`
                          : opt.label
                    }
                  >
                    <input
                      type="checkbox"
                      className="si-layer-live-stats-select__checkbox"
                      checked={checked}
                      disabled={isPrimary || disableUncheck}
                      onChange={() => onToggleLayer(opt.id)}
                    />
                    <span className="si-layer-live-stats-select__option-text">
                      <span className="si-layer-live-stats-select__option-abbr">{opt.label}</span>
                      {opt.scientificName ? (
                        <span className="si-layer-live-stats-select__option-science">{opt.scientificName}</span>
                      ) : null}
                    </span>
                    {isPrimary ? (
                      <span className="si-layer-live-stats-select__primary-badge">Primary</span>
                    ) : null}
                  </label>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
