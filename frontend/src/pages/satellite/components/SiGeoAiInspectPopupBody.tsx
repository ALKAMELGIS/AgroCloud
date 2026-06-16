import type { SiPopupInspectPayload } from '../../../lib/siLayerPopupInspect'
import { LayerAttributePopupBody } from './LayerAttributePopupBody'

export type SiGeoAiInspectPopupBodyProps = {
  rows: { label: string; value: string }[]
  inspect?: SiPopupInspectPayload | null
  layout?: 'table' | 'card' | 'compact'
  coords?: { lat: number; lng: number }
  aoiName?: string | null
  spatialAnalysis?: Array<{ label: string; value: string }>
  relatedRecords?: Array<{ table: string; rows: { label: string; value: string }[] }>
}

/** @deprecated Use layout prop on LayerAttributePopupBody — kept for SatelliteIntelligence callers. */
export function SiGeoAiInspectPopupBody({
  rows,
  inspect,
  coords,
  aoiName,
  spatialAnalysis,
  relatedRecords,
}: SiGeoAiInspectPopupBodyProps) {
  const payload: SiPopupInspectPayload =
    inspect ??
    ({
      presentation: 'compact',
      viewMode: 'table',
      sections: [{ id: 'all', title: 'Attributes', rows: rows.map(r => ({ key: r.label, label: r.label, value: r.value })) }],
      flatRows: rows,
      relationRows: [],
      mediaRows: [],
    } satisfies SiPopupInspectPayload)

  return (
    <LayerAttributePopupBody
      inspect={payload}
      variant="arcgis"
      rtl={false}
      hideEmpty
      coords={coords}
      aoiName={aoiName}
      spatialAnalysis={spatialAnalysis}
      relatedRecords={relatedRecords}
    />
  )
}
