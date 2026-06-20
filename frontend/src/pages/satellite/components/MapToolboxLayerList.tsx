import type { ReactNode } from 'react'
import { SiCopyTextButton } from './SiCopyTextButton'
import './MapToolboxLayerList.css'

export type MapToolboxLayerListItem = {
  id: string
  label: string
  meta?: string
  visible: boolean
  toggleable: boolean
  onToggle: () => void
  actions?: ReactNode
}

type MapToolboxLayerRowProps = {
  label: string
  meta?: string
  visible: boolean
  toggleable: boolean
  onToggle: () => void
  actions?: ReactNode
}

export function MapToolboxLayerRow({
  label,
  visible,
  toggleable,
  onToggle,
  actions,
}: MapToolboxLayerRowProps) {
  return (
    <div className={`si-mt-layer${visible ? ' si-mt-layer--on' : ''}${!toggleable ? ' si-mt-layer--static' : ''}`}>
      <div className="si-mt-layer__accent" aria-hidden />
      <div className="si-mt-layer__main">
        <div className="si-mt-layer__text">
          <span className="si-mt-layer__name" title={label}>
            {label}
          </span>
        </div>
        <div className="si-mt-layer__controls">
          <SiCopyTextButton
            text={label}
            className="si-mt-layer__copy"
            title="Copy layer name"
            ariaLabel={`Copy ${label}`}
            variant="compact"
          />
          {toggleable ? (
            <label className="si-mt-layer__switch" title={visible ? 'Display on' : 'Display off'}>
              <input
                type="checkbox"
                className="si-mt-layer__switch-input"
                checked={visible}
                onChange={() => onToggle()}
                aria-label={`${visible ? 'Turn off' : 'Turn on'} ${label}`}
              />
              <span className="si-mt-layer__switch-ui" aria-hidden />
            </label>
          ) : (
            <span className="si-mt-layer__always">Always on</span>
          )}
        </div>
      </div>
      {actions ? <div className="si-mt-layer__actions">{actions}</div> : null}
    </div>
  )
}

export function MapToolboxLayerList({
  layers,
  emptyMessage = 'No layers on map.',
}: {
  layers: MapToolboxLayerListItem[]
  emptyMessage?: string
}) {
  if (!layers.length) {
    return <p className="si-mt-layer-list__empty">{emptyMessage}</p>
  }
  return (
    <div className="si-mt-layer-list" role="list" aria-label="Map layers">
      {layers.map(layer => (
        <MapToolboxLayerRow
          key={layer.id}
          label={layer.label}
          visible={layer.visible}
          toggleable={layer.toggleable}
          onToggle={layer.onToggle}
          actions={layer.actions}
        />
      ))}
    </div>
  )
}
