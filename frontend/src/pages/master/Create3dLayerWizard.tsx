import React, { useMemo, useRef, useState } from 'react'
import { GisUploadCloudSources } from '../../components/GisUploadCloudSources'
import type { CloudUploadSourceId } from '../../lib/cloudFilePickerConfig'
import {
  GIS_3D_LAYER_CREATE_METHODS,
  GIS_3D_LAYER_LEARN_MORE_URL,
  GIS_3D_LAYER_TYPES,
  GIS_3D_UPLOAD_ACCEPT,
  threeDLayerDefaultName,
  type ThreeDLayerCreateMethod,
  type ThreeDLayerKind,
} from './gis3dLayerWizardData'

export type Create3dLayerResult = {
  layerKind: ThreeDLayerKind
  method: ThreeDLayerCreateMethod
  title: string
  fileName?: string
}

type WizardView = 'layer-type' | 'create-method' | 'finalize'

type Create3dLayerWizardProps = {
  onBack: () => void
  onClose: () => void
  onComplete: (result: Create3dLayerResult) => void
}

export function Create3dLayerWizard({ onBack, onClose, onComplete }: Create3dLayerWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<WizardView>('layer-type')
  const [layerKind, setLayerKind] = useState<ThreeDLayerKind>('3d-object')
  const [method, setMethod] = useState<ThreeDLayerCreateMethod>('define-own')
  const [layerName, setLayerName] = useState(() => threeDLayerDefaultName('3d-object'))
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadSource, setUploadSource] = useState<CloudUploadSourceId>('device')

  const layerTypeMeta = useMemo(
    () => GIS_3D_LAYER_TYPES.find(t => t.id === layerKind) ?? GIS_3D_LAYER_TYPES[0]!,
    [layerKind],
  )

  const canProceed = useMemo(() => {
    if (view === 'layer-type' || view === 'create-method') return true
    if (method === 'define-own') return layerName.trim().length > 0
    return uploadFile != null
  }, [view, method, layerName, uploadFile])

  const handleBack = () => {
    if (view === 'finalize') {
      setView('create-method')
      return
    }
    if (view === 'create-method') {
      setView('layer-type')
      return
    }
    onBack()
  }

  const handleNext = () => {
    if (view === 'layer-type') {
      setLayerName(threeDLayerDefaultName(layerKind))
      setView('create-method')
      return
    }
    if (view === 'create-method') {
      setView('finalize')
      return
    }

    onComplete({
      layerKind,
      method,
      title:
        method === 'define-own'
          ? layerName.trim()
          : uploadFile?.name.replace(/\.[^.]+$/, '') ?? layerTypeMeta.title,
      fileName: uploadFile?.name,
    })
  }

  const onFileChosen = (file: File | null) => {
    if (!file) return
    setUploadFile(file)
    setUploadSource('device')
  }

  return (
    <div
      className="gis-fl-wizard"
      role="dialog"
      aria-labelledby="gis-3d-wizard-title"
      onClick={e => e.stopPropagation()}
    >
      <header className="gis-fl-wizard__header">
        <h2 id="gis-3d-wizard-title" className="gis-fl-wizard__title">
          Create a 3D layer
        </h2>
        <button type="button" className="gis-fl-wizard__icon-btn" aria-label="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="gis-fl-wizard__body">
        {view === 'layer-type' ? (
          <>
            <p className="gis-fl-wizard__lead gis-fl-wizard__lead--with-link">
              Select the layer type to host, manage and visualize georeferenced 3D data.{' '}
              <a href={GIS_3D_LAYER_LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
                Learn more
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
              </a>
            </p>
            <ul className="gis-fl-wizard__method-list">
              {GIS_3D_LAYER_TYPES.map(opt => (
                <li key={opt.id}>
                  <label
                    className={`gis-fl-wizard__method${layerKind === opt.id ? ' gis-fl-wizard__method--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="3d-layer-kind"
                      value={opt.id}
                      checked={layerKind === opt.id}
                      onChange={() => {
                        setLayerKind(opt.id)
                        setLayerName(threeDLayerDefaultName(opt.id))
                      }}
                    />
                    <span className="gis-fl-wizard__method-text gis-fl-wizard__method-text--full">
                      <span className="gis-fl-wizard__method-title">{opt.title}</span>
                      <span className="gis-fl-wizard__method-desc">{opt.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {view === 'create-method' ? (
          <>
            <p className="gis-fl-wizard__lead">
              Select an option to create a {layerTypeMeta.title.toLowerCase()}.
            </p>
            <ul className="gis-fl-wizard__method-list">
              {GIS_3D_LAYER_CREATE_METHODS.map(opt => (
                <li key={opt.id}>
                  <label
                    className={`gis-fl-wizard__method${method === opt.id ? ' gis-fl-wizard__method--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="3d-create-method"
                      value={opt.id}
                      checked={method === opt.id}
                      onChange={() => setMethod(opt.id)}
                    />
                    <span className="gis-fl-wizard__method-text gis-fl-wizard__method-text--full">
                      <span className="gis-fl-wizard__method-title">{opt.title}</span>
                      <span className="gis-fl-wizard__method-desc">{opt.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {view === 'finalize' && method === 'define-own' ? (
          <section className="gis-fl-wizard__section">
            <h3 className="gis-fl-wizard__section-title">Layer name</h3>
            <p className="gis-fl-wizard__lead">
              Specify a name for your empty {layerTypeMeta.title.toLowerCase()}.
            </p>
            <label className="gis-fl-wizard__field gis-fl-wizard__field--block">
              <span className="visually-hidden">Layer name</span>
              <input
                type="text"
                value={layerName}
                onChange={e => setLayerName(e.target.value)}
                aria-label="Layer name"
              />
            </label>
          </section>
        ) : null}

        {view === 'finalize' && method === 'upload-data' ? (
          <section className="gis-fl-wizard__section gis-fl-wizard__section--upload">
            <p className="gis-fl-wizard__lead">
              Upload a package for your {layerTypeMeta.title.toLowerCase()}.
            </p>
            <div
              className="gis-fl-wizard__upload-zone"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) onFileChosen(file)
              }}
            >
              <i className="fa-regular fa-file-arrow-up gis-fl-wizard__upload-icon" aria-hidden />
              <p className="gis-fl-wizard__upload-title">Drag and drop your file or choose an option</p>
              <a
                className="gis-fl-wizard__upload-help"
                href={GIS_3D_LAYER_LEARN_MORE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn more about supported 3D formats
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
              </a>
              {uploadFile ? (
                <p className="gis-fl-wizard__upload-file">
                  <i className="fa-solid fa-file" aria-hidden /> {uploadFile.name}
                </p>
              ) : null}
              <GisUploadCloudSources
                className="gis-upload-cloud-sources--four gis-fl-wizard__upload-sources"
                includeDevice
                activeSource={uploadSource}
                onActiveSourceChange={setUploadSource}
                onDeviceClick={() => fileInputRef.current?.click()}
                onFile={file => onFileChosen(file)}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="visually-hidden"
              accept={GIS_3D_UPLOAD_ACCEPT}
              onChange={e => onFileChosen(e.target.files?.[0] ?? null)}
            />
          </section>
        ) : null}
      </div>

      <footer className="gis-fl-wizard__footer">
        <button type="button" className="gis-fl-wizard__btn gis-fl-wizard__btn--back" onClick={handleBack}>
          Back
        </button>
        <div className="gis-fl-wizard__footer-right">
          <button type="button" className="gis-fl-wizard__btn gis-fl-wizard__btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="gis-fl-wizard__btn gis-fl-wizard__btn--primary"
            disabled={!canProceed}
            onClick={handleNext}
          >
            Next
          </button>
        </div>
      </footer>
    </div>
  )
}
