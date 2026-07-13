import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CropAlertFieldResult } from '../../../lib/siCropAlertEngine'
import { resolveDchasOrbPresentation } from '../../../lib/siCropAlertEngine'
import { SiCropAlertMapPopup } from './SiCropAlertMapPopup'
import { SiCropAlertHvdIcon } from './SiCropAlertHvdIcon'
import './SiCropAlertMapMarker.css'
import './SiCropAlertHvdIcon.css'

type HvdIconSize = 'sm' | 'md' | 'lg'

type MapPinPlacement = {
  horizontal: 'center' | 'left' | 'right'
  vertical: 'above' | 'below'
}

function resolveMapPinPlacement(popup: HTMLElement): MapPinPlacement {
  const rect = popup.getBoundingClientRect()
  const pad = 12
  const topPad = 36
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  let horizontal: MapPinPlacement['horizontal'] = 'center'
  if (rect.right > viewportW - pad) horizontal = 'right'
  else if (rect.left < pad) horizontal = 'left'

  let vertical: MapPinPlacement['vertical'] = 'above'
  const clipsTop = rect.top < topPad
  const clipsBottom = rect.bottom > viewportH - pad
  if (clipsTop && !clipsBottom) {
    vertical = 'below'
  } else if (clipsTop && clipsBottom) {
    vertical = rect.top + rect.height / 2 < viewportH / 2 ? 'below' : 'above'
  }

  return { horizontal, vertical }
}

export type SiCropAlertMapMarkerProps = {
  result: CropAlertFieldResult
  selected: boolean
  popupOpen?: boolean
  dimmed?: boolean
  iconSize?: HvdIconSize
  popupVariant?: 'default' | 'mapPin'
  onSelect: (fieldKey: string) => void
  onClosePopup?: () => void
}

export const SiCropAlertMapMarker = memo(function SiCropAlertMapMarker({
  result,
  selected,
  popupOpen = false,
  dimmed = false,
  iconSize = 'md',
  popupVariant = 'default',
  onSelect,
  onClosePopup,
}: SiCropAlertMapMarkerProps) {
  const orb = useMemo(() => resolveDchasOrbPresentation(result), [result])
  const { tier, label, deltaChas, chasCurrent, pulse, color } = orb

  const deltaLabel =
    deltaChas != null ? `${deltaChas >= 0 ? '+' : ''}${deltaChas.toFixed(3)}` : '—'
  const title = `${result.farmName || result.farmCode || result.objectId}: ${label} · ΔCHAS ${deltaLabel} · CHAS ${chasCurrent.toFixed(3)}`

  const columnRef = useRef<HTMLDivElement>(null)
  const [mapPinPlacement, setMapPinPlacement] = useState<MapPinPlacement>({
    horizontal: 'center',
    vertical: 'above',
  })

  useLayoutEffect(() => {
    if (!popupOpen || popupVariant !== 'mapPin') {
      setMapPinPlacement({ horizontal: 'center', vertical: 'above' })
      return
    }

    let raf = 0
    let lastKey = ''

    const sync = () => {
      const popup = columnRef.current?.querySelector('.si-crop-alert-map-popup') as HTMLElement | null
      if (!popup) return
      const next = resolveMapPinPlacement(popup)
      const key = `${next.horizontal}:${next.vertical}`
      if (key === lastKey) return
      lastKey = key
      setMapPinPlacement(next)
    }

    const schedule = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        sync()
      })
    }

    schedule()
    window.addEventListener('resize', schedule)
    const ro = new ResizeObserver(schedule)
    if (columnRef.current) ro.observe(columnRef.current)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', schedule)
      ro.disconnect()
    }
  }, [popupOpen, popupVariant, result.fieldKey])

  return (
    <div
      className={[
        'si-crop-alert-beacon-root',
        popupOpen ? 'si-crop-alert-beacon-root--popup-open' : '',
        popupVariant === 'mapPin' ? 'si-crop-alert-beacon-root--map-pin' : '',
        popupVariant === 'mapPin' && mapPinPlacement.horizontal === 'left'
          ? 'si-crop-alert-beacon-root--pin-left'
          : '',
        popupVariant === 'mapPin' && mapPinPlacement.horizontal === 'right'
          ? 'si-crop-alert-beacon-root--pin-right'
          : '',
        popupVariant === 'mapPin' && mapPinPlacement.vertical === 'below'
          ? 'si-crop-alert-beacon-root--pin-below'
          : '',
        dimmed ? 'si-crop-alert-beacon-root--dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div ref={columnRef} className="si-crop-alert-beacon-root__column">
        {popupOpen && onClosePopup ? (
          <SiCropAlertMapPopup result={result} onClose={onClosePopup} variant={popupVariant} />
        ) : null}
        <div
          className={[
            'si-crop-alert-hvd-beacon',
            `si-crop-alert-hvd-beacon--tier-${tier}`,
            selected ? 'si-crop-alert-hvd-beacon--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ '--hvd-tone': color } as CSSProperties}
          role="button"
          tabIndex={0}
          title={title}
          aria-label={title}
          onClick={e => {
            e.stopPropagation()
            onSelect(result.fieldKey)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onSelect(result.fieldKey)
            }
          }}
        >
          <SiCropAlertHvdIcon
            tier={tier}
            selected={selected}
            enhanced
            pulseRings={pulse.ringCount}
            size={iconSize}
          />
          {selected && !popupOpen ? (
            <span className="si-crop-alert-hvd-beacon__label">
              {result.farmName || result.farmCode || `#${result.objectId}`}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
})
