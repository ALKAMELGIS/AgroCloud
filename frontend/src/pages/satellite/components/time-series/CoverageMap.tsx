import { useCallback, useEffect, useRef, useState } from 'react'
import type { VegetationCoverageClass } from '../../../../lib/vegetationCoverageEngine'
import { fetchFieldMapSnapshot } from '../../lib/timeSeriesReport/timeSeriesMapSnapshot'

export type CoverageMapProps = {
  geometry: GeoJSON.Geometry | null | undefined
  classes: VegetationCoverageClass[]
  sceneDate: string
}

function formatSceneDate(iso: string): string {
  const d = new Date(`${iso.trim().slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function CoverageMap({ geometry, classes, sceneDate }: CoverageMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [mapUrl, setMapUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!geometry) {
      setMapUrl(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchFieldMapSnapshot(geometry, 720, 400).then(url => {
      if (!cancelled) {
        setMapUrl(url)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [geometry])

  const handleExportPng = useCallback(() => {
    if (!mapUrl) return
    const link = document.createElement('a')
    link.href = mapUrl
    link.download = `vegetation-coverage-map-${sceneDate.slice(0, 10)}.png`
    link.click()
  }, [mapUrl, sceneDate])

  const handleFullscreen = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.()
      setFullscreen(true)
    } else {
      void document.exitFullscreen?.()
      setFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const legendClasses = classes.filter(c => c.pct > 0.3)

  return (
    <div
      ref={wrapRef}
      className={'acp-ts__coverage-map' + (fullscreen ? ' acp-ts__coverage-map--fs' : '')}
    >
      <div className="acp-ts__coverage-map-head">
        <h4 className="acp-ts__coverage-section-title">Coverage Map · {formatSceneDate(sceneDate)}</h4>
        <div className="acp-ts__coverage-map-actions">
          <button type="button" className="acp-ts__coverage-map-btn" onClick={handleFullscreen} title="Full screen">
            <i className={'fa-solid ' + (fullscreen ? 'fa-compress' : 'fa-expand')} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="acp-ts__coverage-map-btn"
            onClick={handleExportPng}
            disabled={!mapUrl}
            title="Export PNG"
          >
            <i className="fa-solid fa-download" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="acp-ts__coverage-map-body">
        {loading ? (
          <div className="acp-ts__coverage-map-placeholder" role="status">
            Loading map…
          </div>
        ) : mapUrl ? (
          <img src={mapUrl} alt="Satellite basemap clipped to AOI" className="acp-ts__coverage-map-img" />
        ) : (
          <div className="acp-ts__coverage-map-placeholder">Map preview unavailable — check Mapbox token.</div>
        )}
        <div className="acp-ts__coverage-map-legend">
          <span className="acp-ts__coverage-map-legend-title">Vegetation Classes</span>
          {legendClasses.map(c => (
            <span key={c.id} className="acp-ts__coverage-map-legend-item">
              <span className="acp-ts__coverage-swatch" style={{ background: c.color }} aria-hidden="true" />
              {c.label} ({c.pct.toFixed(0)}%)
            </span>
          ))}
          <span className="acp-ts__coverage-map-meta">
            <i className="fa-solid fa-location-crosshairs" aria-hidden="true" /> AOI boundary
          </span>
          <span className="acp-ts__coverage-map-meta">
            <i className="fa-solid fa-compass" aria-hidden="true" /> N ↑
          </span>
        </div>
      </div>
    </div>
  )
}
