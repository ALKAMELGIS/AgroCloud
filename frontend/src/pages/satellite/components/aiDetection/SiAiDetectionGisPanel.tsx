import { useState, type ChangeEvent, type RefObject } from 'react'
import type { AiDlProcessedRaster } from '../../../../lib/aiDetection/siAiDlRasterPipeline'
import { SiAiDlDetectObjectsPanel, type AiDlMapLayerRasterRef } from './SiAiDlDetectObjectsPanel'
import { SiAiDlTrainModelPanel } from './SiAiDlTrainModelPanel'
import './SiAiDetectionGisPanel.css'

export type NetfloraDetectionStats = {
  total: number
  avgConfidence: number
  byClass: Array<{ label: string; count: number; avgConfidence: number }>
}

export type SiAiDetectionGisPanelProps = {
  onClose: () => void
  layerOptions: Array<{ id: string; label: string }>
  outputLayerOptions?: Array<{ id: string; label: string }>
  onOpenLayersPanel?: () => void
  getMapBounds?: () => { west: number; south: number; east: number; north: number } | undefined
  resolveMapLayer?: (layerKey: string) => AiDlMapLayerRasterRef | null
  onRasterProcessed?: (raster: AiDlProcessedRaster) => void
  onExportDetectionToMap?: (geojson: GeoJSON.FeatureCollection, name: string) => void
  netfloraStats: NetfloraDetectionStats | null
  netfloraUploadInputRef: RefObject<HTMLInputElement | null>
  onNetfloraUploadChange: (e: ChangeEvent<HTMLInputElement>) => void
  netfloraStatus?: string
  onRunNetfloraDetection?: () => void
  netfloraBusy?: boolean
}

type AiDetTab = 'main' | 'options'

export function SiAiDetectionGisPanel({
  onClose,
  layerOptions,
  outputLayerOptions = [],
  onOpenLayersPanel,
  getMapBounds,
  resolveMapLayer,
  onRasterProcessed,
  onExportDetectionToMap,
  netfloraStats,
  netfloraUploadInputRef,
  onNetfloraUploadChange,
  netfloraStatus,
  onRunNetfloraDetection,
  netfloraBusy = false,
}: SiAiDetectionGisPanelProps) {
  const [tab, setTab] = useState<AiDetTab>('main')

  return (
    <div className="si-env-section-card si-field-analysis si-ai-det-gis">
      <div className="si-field-analysis-header">
        <h2 className="si-field-analysis-title">AI Detection in GIS</h2>
        <button type="button" className="si-field-analysis-close" onClick={onClose} aria-label="Close panel">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>

      <div className="si-ai-det-gis__tabs" role="tablist" aria-label="AI Detection tools">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'main'}
          className={`si-ai-det-gis__tab${tab === 'main' ? ' is-active' : ''}`}
          onClick={() => setTab('main')}
        >
          Main
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'options'}
          className={`si-ai-det-gis__tab${tab === 'options' ? ' is-active' : ''}`}
          onClick={() => setTab('options')}
        >
          Options
        </button>
      </div>

      <div className="si-ai-det-gis__scroll" data-agrocloud-map-wheel-scroll="">
        {tab === 'main' ? (
          <>
            <SiAiDlDetectObjectsPanel
              layerOptions={layerOptions}
              outputLayerOptions={outputLayerOptions}
              onOpenLayersPanel={onOpenLayersPanel}
              getMapBounds={getMapBounds}
              resolveMapLayer={resolveMapLayer}
              onRasterProcessed={onRasterProcessed}
              onExportDetectionToMap={onExportDetectionToMap}
              disabled={netfloraBusy}
              onStatus={() => undefined}
            />

            <div className="si-field-analysis-section si-ai-det-gis__stats">
              <div className="si-field-analysis-kicker">Detection results (GeoJSON)</div>
              <input
                ref={netfloraUploadInputRef}
                type="file"
                accept=".geojson,.json"
                className="si-ai-dl-gp__hidden-input"
                onChange={onNetfloraUploadChange}
              />
              <div className="si-ai-dl-gp__arg-actions">
                <button
                  type="button"
                  className="si-ai-dl-gp__mini-btn"
                  onClick={() => netfloraUploadInputRef.current?.click()}
                >
                  <i className="fa-solid fa-file-import" aria-hidden /> Import detections
                </button>
                {onRunNetfloraDetection ? (
                  <button
                    type="button"
                    className="si-ai-dl-gp__run-btn"
                    disabled={netfloraBusy}
                    onClick={onRunNetfloraDetection}
                  >
                    <i className={`fa-solid ${netfloraBusy ? 'fa-spinner fa-spin' : 'fa-filter'}`} aria-hidden />
                    Filter to AOI
                  </button>
                ) : null}
              </div>
              {netfloraStatus ? <p className="si-ai-dl-gp__status">{netfloraStatus}</p> : null}
              {netfloraStats ? (
                <>
                  <div className="si-netflora-stats-grid">
                    <div className="si-netflora-stat-card">
                      <span>Total detections</span>
                      <strong>{netfloraStats.total}</strong>
                    </div>
                    <div className="si-netflora-stat-card">
                      <span>Average confidence</span>
                      <strong>{(netfloraStats.avgConfidence * 100).toFixed(1)}%</strong>
                    </div>
                  </div>
                  <div className="si-netflora-class-list">
                    {netfloraStats.byClass.map(row => (
                      <div key={row.label} className="si-netflora-class-row">
                        <div className="si-netflora-class-meta">
                          <strong>{row.label}</strong>
                          <span>{row.count} detections</span>
                        </div>
                        <div className="si-netflora-class-bar">
                          <span
                            style={{
                              width: `${Math.max(8, (row.count / Math.max(1, netfloraStats.total)) * 100)}%`,
                            }}
                          />
                        </div>
                        <em>{(row.avgConfidence * 100).toFixed(1)}%</em>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <SiAiDlTrainModelPanel />
        )}
      </div>
    </div>
  )
}
