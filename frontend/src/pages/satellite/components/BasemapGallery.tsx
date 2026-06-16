import React, { useMemo } from 'react'
import { TileLayer } from 'react-leaflet'
import {
  buildBasemapCatalog,
  catalogEntryById,
  DEFAULT_BASEMAP_ID,
  getBasemapThumbnail,
  resolveBasemapId,
} from '../basemapCatalog'
import { TOPOGRAPHIC_3D_BASEMAP_ID } from '../../../lib/agroCloudMapTerrain'

export type BasemapType = string

interface BasemapGalleryProps {
  selectedBasemap: BasemapType
  onSelectBasemap: (basemap: BasemapType) => void
}

export const BasemapGallery: React.FC<BasemapGalleryProps> = ({ selectedBasemap, onSelectBasemap }) => {
  const catalog = useMemo(() => buildBasemapCatalog(''), [])
  const activeBasemapId = resolveBasemapId(selectedBasemap)

  return (
    <div className="tool-panel">
      <div className="tool-section">
        <div className="tool-section-header">BaseMap List</div>
        <div
          className="basemap-gallery"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            maxHeight: 'min(480px, 55vh)',
            overflowY: 'auto',
            paddingRight: '4px',
          }}
        >
          {catalog.map(entry => {
            const thumb = getBasemapThumbnail(entry, '')
            return (
              <div
                key={entry.id}
                className={`sentinel-item-card ${activeBasemapId === entry.id ? 'selected' : ''}`}
                onClick={() => onSelectBasemap(entry.id)}
                style={{
                  cursor: 'pointer',
                  border: activeBasemapId === entry.id ? '2px solid #2196f3' : '1px solid #eee',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                  background: 'white',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ height: '80px', background: '#f0f0f0', position: 'relative', overflow: 'hidden' }}>
                  <img
                    src={thumb}
                    alt={entry.label}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {entry.id === 'esri-imagery-hybrid' && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.2)',
                      }}
                    >
                      <span
                        style={{
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '12px',
                          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                        }}
                      >
                        Labels
                      </span>
                    </div>
                  )}
                  {entry.id === TOPOGRAPHIC_3D_BASEMAP_ID && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.25)',
                      }}
                    >
                      <span
                        style={{
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '12px',
                          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                        }}
                      >
                        3D
                      </span>
                    </div>
                  )}
                  {activeBasemapId === entry.id && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        background: '#2196f3',
                        color: 'white',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                      }}
                    >
                      <i className="fa-solid fa-check"></i>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: '11px',
                    padding: '8px 4px',
                    fontWeight: 500,
                    color: activeBasemapId === entry.id ? '#1976d2' : '#333',
                    lineHeight: 1.25,
                  }}
                >
                  {entry.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const BasemapLayer: React.FC<{
  selectedBasemap: BasemapType
  pane?: string
  stableDuringInteraction?: boolean
}> = ({
  selectedBasemap,
  pane,
  stableDuringInteraction = false,
}) => {
  const catalog = useMemo(() => buildBasemapCatalog(''), [])
  const resolvedId = resolveBasemapId(selectedBasemap)
  const entry =
    catalogEntryById(catalog, resolvedId) ??
    catalogEntryById(catalog, DEFAULT_BASEMAP_ID)
  const layers = entry?.leafletLayers ?? []

  return (
    <>
      {layers.map((L, i) => (
        <TileLayer
          key={`${resolvedId}-${i}-${L.url.slice(0, 48)}`}
          url={L.url}
          attribution={L.attribution}
          opacity={L.opacity ?? 1}
          maxZoom={19}
          {...(pane ? { pane } : {})}
          {...(stableDuringInteraction
            ? { updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 4 }
            : {})}
          {...(L.url.includes('google.com/vt') ? { subdomains: ['0', '1', '2', '3'] } : {})}
        />
      ))}
    </>
  )
}
