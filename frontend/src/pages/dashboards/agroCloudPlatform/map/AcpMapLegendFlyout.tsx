import { useMemo } from 'react'
import { LayerLiveLegendPanel } from '../../../satellite/components/LayerLiveLegendPanel'
import { SiCropAlertMapLegend } from '../../../satellite/components/SiCropAlertMapLegend'
import {
  buildImageryTimeSeriesLayerGroups,
  flattenImageryTimeSeriesLayerOptions,
} from '../acpImageryTimeSeries'
import { useAcpPlatform } from '../acpPlatformContext'
import { AcpMapPanel } from './AcpMapPanel'

type Props = { onClose: () => void }

export function AcpMapLegendFlyout({ onClose }: Props) {
  const acp = useAcpPlatform()
  const layerGroups = useMemo(() => buildImageryTimeSeriesLayerGroups(), [])
  const layerOptions = useMemo(() => flattenImageryTimeSeriesLayerOptions(), [])
  const showChasLegend =
    acp.alertSettings.enabled &&
    acp.alertSettings.showLegend &&
    acp.layerVisibility.liveChas

  return (
    <AcpMapPanel title="Legend" onClose={onClose} className="acp-map-panel--legend">
      <div className="acp-map-legend">
        <LayerLiveLegendPanel
          layerOptions={layerOptions}
          layerGroups={layerGroups}
          activeLayerId={acp.selectedWmsLayer}
        />

        {showChasLegend ? (
          <section className="acp-map-legend__section" aria-label="Live CHAS field markers">
            <h3 className="acp-map-legend__section-title">Live CHAS markers</h3>
            <SiCropAlertMapLegend />
          </section>
        ) : null}

        {acp.layerVisibility.weatherAlerts ? (
          <section className="acp-map-legend__section" aria-label="Weather alert levels">
            <h3 className="acp-map-legend__section-title">Weather Alerts (AOI)</h3>
            <ul className="acp-map-legend__weather-levels">
              <li><span className="acp-map-legend__swatch acp-map-legend__swatch--weather-red" /> Red warning</li>
              <li><span className="acp-map-legend__swatch acp-map-legend__swatch--weather-orange" /> Orange warning</li>
              <li><span className="acp-map-legend__swatch acp-map-legend__swatch--weather-yellow" /> Yellow warning</li>
              <li><span className="acp-map-legend__swatch acp-map-legend__swatch--weather-none" /> No active warning</li>
            </ul>
          </section>
        ) : null}
      </div>
    </AcpMapPanel>
  )
}
