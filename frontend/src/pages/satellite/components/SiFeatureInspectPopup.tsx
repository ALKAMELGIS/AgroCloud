import type { SiPopupInspectPayload } from '../../../lib/siLayerPopupInspect'
import { FeatureIdentifyPopupCard } from './FeatureIdentifyPopupCard'
import { SiGeoAiInspectPopupBody } from './SiGeoAiInspectPopupBody'
import './layer-attribute-popup.css'

type SiInspectPopupLike = {
  title: string
  rows: { label: string; value: string }[]
  inspect?: SiPopupInspectPayload | null
  lng: number
  lat: number
  areaName?: string | null
  collapsed: boolean
}

export type SiFeatureInspectPopupProps = {
  pop: SiInspectPopupLike
  featureIndex: number
  featureTotal: number
  onToggleCollapse: () => void
  onClose: () => void
  onZoomTo: () => void
  onPrevFeature?: () => void
  onNextFeature?: () => void
  anchored?: boolean
  className?: string
}

export function SiFeatureInspectPopup({
  pop,
  featureIndex,
  featureTotal,
  onToggleCollapse,
  onClose,
  onZoomTo,
  onPrevFeature,
  onNextFeature,
  anchored = false,
  className = '',
}: SiFeatureInspectPopupProps) {
  const inspect: SiPopupInspectPayload | null =
    pop.inspect ??
    (pop.rows.length
      ? {
          presentation: 'compact',
          viewMode: 'table',
          sections: [
            {
              id: 'all',
              title: 'Attributes',
              rows: pop.rows.map(r => ({ key: r.label, label: r.label, value: r.value })),
            },
          ],
          flatRows: pop.rows,
          relationRows: [],
          mediaRows: [],
        }
      : null)

  return (
    <FeatureIdentifyPopupCard
      title={pop.title}
      collapsed={pop.collapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClose}
      onZoomTo={onZoomTo}
      featureIndex={featureIndex}
      featureTotal={featureTotal}
      onPrevFeature={onPrevFeature}
      onNextFeature={onNextFeature}
      anchored={anchored}
      className={className}
      aria-label="Feature identify — attributes at click location"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {inspect ? (
        <SiGeoAiInspectPopupBody
          rows={pop.rows}
          inspect={inspect}
          layout={pop.inspect?.viewMode}
          coords={{ lat: pop.lat, lng: pop.lng }}
          aoiName={pop.areaName}
        />
      ) : null}
    </FeatureIdentifyPopupCard>
  )
}
