import React, { useRef, useState } from 'react'
import { GisUploadCloudSources } from '../../components/GisUploadCloudSources'
import type { CloudUploadSourceId } from '../../lib/cloudFilePickerConfig'
import { Create3dLayerWizard } from './Create3dLayerWizard'
import { CreateFeatureLayerWizard } from './CreateFeatureLayerWizard'
import { GIS_NEW_ITEM_TYPES } from './gisContentPortalData'
import type { FeatureLayerMethod } from './gisFeatureLayerWizardData'

import type { CreateFeatureLayerResult } from './CreateFeatureLayerWizard'
import type { Create3dLayerResult } from './Create3dLayerWizard'

export type GisContentNewItemCreatedPayload = {
  type: string
  title: string
  file?: File
  featureLayer?: CreateFeatureLayerResult
  threeDLayer?: Create3dLayerResult
}

export type NewItemModalProps = {
  open: boolean
  onClose: () => void
  onItemCreated?: (payload: GisContentNewItemCreatedPayload) => void | Promise<void>
}

type ActiveWizard = 'none' | 'feature-layer' | '3d-layer'

export function NewItemModal({ open, onClose, onItemCreated }: NewItemModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeWizard, setActiveWizard] = useState<ActiveWizard>('none')
  const [wizardMethod, setWizardMethod] = useState<FeatureLayerMethod>('define-own')
  const [wizardStartDetails, setWizardStartDetails] = useState(false)
  const [activeSource, setActiveSource] = useState<CloudUploadSourceId>('device')

  const reset = () => {
    setActiveWizard('none')
    setWizardMethod('define-own')
    setWizardStartDetails(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!open) return null

  if (activeWizard === 'feature-layer') {
    return (
      <div className="gis-portal-modal-backdrop gis-portal-modal-backdrop--light" role="presentation" onClick={handleClose}>
        <CreateFeatureLayerWizard
          onBack={() => setActiveWizard('none')}
          onClose={handleClose}
          initialMethod={wizardMethod}
          startOnDetails={wizardStartDetails}
          onComplete={result => {
            onItemCreated?.({ type: 'feature-layer', title: result.title, featureLayer: result })
            handleClose()
          }}
        />
      </div>
    )
  }

  if (activeWizard === '3d-layer') {
    return (
      <div className="gis-portal-modal-backdrop gis-portal-modal-backdrop--light" role="presentation" onClick={handleClose}>
        <Create3dLayerWizard
          onBack={() => setActiveWizard('none')}
          onClose={handleClose}
          onComplete={result => {
            onItemCreated?.({ type: '3d-layer', title: result.title, threeDLayer: result })
            handleClose()
          }}
        />
      </div>
    )
  }

  const handleGridClick = (itemId: string) => {
    if (itemId === 'feature-layer') {
      setWizardMethod('define-own')
      setWizardStartDetails(false)
      setActiveWizard('feature-layer')
      return
    }
    if (itemId === '3d-layer') {
      setActiveWizard('3d-layer')
      return
    }
    if (itemId === 'url') {
      setWizardMethod('arcgis-url')
      setWizardStartDetails(true)
      setActiveWizard('feature-layer')
      return
    }
    const item = GIS_NEW_ITEM_TYPES.find(t => t.id === itemId)
    onItemCreated?.({ type: itemId, title: item?.title ?? itemId })
    handleClose()
  }

  const ingestFile = (file: File) => {
    onItemCreated?.({
      type: 'upload',
      title: file.name.replace(/\.[^.]+$/, '') || 'Uploaded item',
      file,
    })
    handleClose()
  }

  return (
    <div className="gis-portal-modal-backdrop gis-portal-modal-backdrop--light" role="presentation" onClick={handleClose}>
      <div
        className="gis-portal-modal gis-portal-modal--new-item"
        role="dialog"
        aria-labelledby="gis-new-item-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="gis-portal-modal__header">
          <h2 id="gis-new-item-title" className="gis-portal-modal__title">
            New item
            <i className="fa-solid fa-circle-info" aria-hidden />
          </h2>
          <button type="button" className="gis-portal-icon-btn" aria-label="Close" onClick={handleClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </header>
        <div className="gis-portal-modal__body">
          <div
            className="gis-portal-dropzone gis-portal-dropzone--interactive"
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) ingestFile(file)
            }}
          >
            Drag and drop your file or choose an option
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="visually-hidden"
            accept=".csv,.xlsx,.xls,.zip,.shp,.geojson,.json,.kml,.kmz,.gpkg,.pdf"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) ingestFile(file)
            }}
          />
          <GisUploadCloudSources
            className="gis-upload-cloud-sources--four"
            includeDevice
            activeSource={activeSource}
            onActiveSourceChange={setActiveSource}
            onDeviceClick={() => fileInputRef.current?.click()}
            onFile={ingestFile}
          />
          <div className="gis-portal-new-grid">
            {GIS_NEW_ITEM_TYPES.map(item => (
              <button key={item.id} type="button" onClick={() => handleGridClick(item.id)}>
                <span className="gis-portal-new-grid__icon">
                  <i className={item.icon} aria-hidden />
                </span>
                <span className="gis-portal-new-grid__title">{item.title}</span>
                <span className="gis-portal-new-grid__desc">{item.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
