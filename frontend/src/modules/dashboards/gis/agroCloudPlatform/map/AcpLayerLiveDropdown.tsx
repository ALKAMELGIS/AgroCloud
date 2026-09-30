import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAcpPlatform } from '../acpPlatformContext'
import {
  buildAcpLayerLiveGroups,
  layerLiveOptionTitle,
  resolveAcpLayerLiveLetter,
} from '../acpLayerLiveCatalog'
import { normalizeAcpWmsLayerId } from '../acpWmsLayerCatalog'

function isLayerActive(activeLayers: string[], layerId: string): boolean {
  const id = normalizeAcpWmsLayerId(layerId)
  return activeLayers.some(l => normalizeAcpWmsLayerId(l) === id)
}

type LayerLiveListProps = {
  listId: string
  layerGroups: ReturnType<typeof buildAcpLayerLiveGroups>
  primary: string
  activeWmsLayers: string[]
  onPickLayer: (layerId: string) => void
  onPickKeyDown: (layerId: string) => (event: React.KeyboardEvent<HTMLButtonElement>) => void
  onToggleVisibility: (layerId: string) => (event: React.MouseEvent<HTMLButtonElement>) => void
  activeWmsLayerCount: number
}

function LayerLiveList({
  listId,
  layerGroups,
  primary,
  activeWmsLayers,
  onPickLayer,
  onPickKeyDown,
  onToggleVisibility,
  activeWmsLayerCount,
}: LayerLiveListProps) {
  return (
    <ul
      id={listId}
      className="acp-layer-live__menu"
      role="listbox"
      aria-label="Layer Live indices"
      aria-multiselectable="true"
    >
      {layerGroups.map(group => (
        <li key={group.id} className="acp-layer-live__group" role="presentation">
          <p className="acp-layer-live__group-label">{group.label}</p>
          <ul className="acp-layer-live__group-list" role="presentation">
            {group.options.map(opt => {
              const id = opt.id
              const active = isLayerActive(activeWmsLayers, id)
              const isPrimary = primary === normalizeAcpWmsLayerId(id)
              return (
                <li key={`${group.id}-${id}`} className="acp-layer-live__item" role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isPrimary}
                    className={[
                      'acp-layer-live__option',
                      active ? ' is-active' : '',
                      isPrimary ? ' is-primary' : '',
                    ].join('')}
                    onClick={() => onPickLayer(id)}
                    onKeyDown={onPickKeyDown(id)}
                    title={layerLiveOptionTitle(id, opt.scientificName)}
                  >
                    <span className={`acp-layer-live__badge${active ? ' is-on' : ''}`} aria-hidden>
                      {resolveAcpLayerLiveLetter(id)}
                    </span>
                    <span className="acp-layer-live__label">{opt.label}</span>
                    {isPrimary ? <span className="acp-layer-live__primary-dot" aria-hidden /> : null}
                  </button>
                  <button
                    type="button"
                    className={`acp-layer-live__vis${active ? ' is-on' : ''}`}
                    aria-label={active ? `Hide ${opt.label}` : `Show ${opt.label}`}
                    aria-pressed={active}
                    disabled={active && activeWmsLayerCount <= 1}
                    onClick={onToggleVisibility(id)}
                  >
                    <i className={`fa-solid ${active ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export function AcpLayerLiveDropdown({ variant = 'overlay' }: { variant?: 'overlay' | 'panel' }) {
  const acp = useAcpPlatform()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const isPanel = variant === 'panel'
  const [open, setOpen] = useState(isPanel)

  const layerGroups = useMemo(() => buildAcpLayerLiveGroups(), [])
  const primary = normalizeAcpWmsLayerId(acp.selectedWmsLayer)
  const activeCount = acp.activeWmsLayers.length
  const activeSummary = activeCount > 1 ? `${primary} · ${activeCount} live` : primary
  const listExpanded = isPanel || open

  useEffect(() => {
    if (!open || isPanel) return
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
  }, [open, isPanel])

  const ensureSentinelVisible = useCallback(() => {
    if (!acp.layerVisibility.sentinelWms) {
      acp.setCoreLayerVisible('sentinelWms', true)
    }
  }, [acp])

  const onPickLayer = useCallback(
    (layerId: string) => {
      const id = normalizeAcpWmsLayerId(layerId)
      ensureSentinelVisible()
      if (isLayerActive(acp.activeWmsLayers, id)) {
        acp.setPrimaryWmsLayer(id)
      } else {
        acp.setSelectedWmsLayer(id)
      }
      if (!isPanel) setOpen(false)
    },
    [acp, ensureSentinelVisible, isPanel],
  )

  const onPickKeyDown = useCallback(
    (layerId: string) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        onPickLayer(layerId)
      }
    },
    [onPickLayer],
  )

  const onToggleVisibility = useCallback(
    (layerId: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      ensureSentinelVisible()
      acp.toggleActiveWmsLayer(layerId)
    },
    [acp, ensureSentinelVisible],
  )

  if (!acp.config.mapToolbar.layers) return null

  const listProps: LayerLiveListProps = {
    listId,
    layerGroups,
    primary,
    activeWmsLayers: acp.activeWmsLayers,
    onPickLayer,
    onPickKeyDown,
    onToggleVisibility,
    activeWmsLayerCount: acp.activeWmsLayers.length,
  }

  return (
    <div
      ref={rootRef}
      className={[
        'acp-layer-live',
        listExpanded ? ' acp-layer-live--open' : '',
        isPanel ? ' acp-layer-live--panel acp-layer-live--panel-expanded' : '',
        ' acp-layer-live--dropdown',
      ].join('')}
      data-loading={acp.sentinelLoading ? 'true' : undefined}
    >
      {!isPanel ? (
        <span className="acp-layer-live__kicker" id={`${listId}-label`}>
          Layer Live
        </span>
      ) : null}

      <div className="acp-layer-live__drop">
        {!isPanel ? (
          <button
            type="button"
            className="acp-layer-live__trigger"
            aria-expanded={listExpanded}
            aria-haspopup="listbox"
            aria-controls={listId}
            aria-label="Layer Live"
            onClick={() => setOpen(v => !v)}
          >
            <span className="acp-layer-live__value">{activeSummary}</span>
            <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden />
          </button>
        ) : (
          <div className="acp-layer-live__panel-primary" aria-live="polite">
            <span className="acp-layer-live__panel-primary-label">Primary</span>
            <strong>{activeSummary}</strong>
          </div>
        )}

        {listExpanded ? <LayerLiveList {...listProps} /> : null}
      </div>
    </div>
  )
}
