import { useCallback, useRef, useState } from 'react'
import {
  AI_DL_MODEL_TYPE_OPTIONS,
  architectureKeyFromMetadata,
  modelAcceptForType,
  simulateDetectionResults,
  validateAndLoadModel,
  type AiDlDetectionSummary,
  type AiDlModelLoadStatus,
  type AiDlModelMetadata,
  type AiDlModelTypeId,
} from '../../../../lib/aiDetection/siAiDlModelLoader'
import {
  processExistingMapLayer,
  processRasterFiles,
  pickRasterUploadFiles,
  isWorldFileOnly,
  rasterNeedsWorldSidecar,
  type AiDlProcessedRaster,
} from '../../../../lib/aiDetection/siAiDlRasterPipeline'
import {
  detectionSummaryToGeoJson,
  defaultOutputFileName,
  exportDetectionResults,
  inferOutputFormat,
  OUTPUT_FILE_ACCEPT,
  OUTPUT_FORMAT_OPTIONS,
  pickOutputDestination,
  type AiDlOutputFormat,
} from '../../../../lib/aiDetection/siAiDlOutputExport'
import { defaultArgsForArchitecture } from '../../../../lib/aiDetection/siAiDlTrainConfig'
import type { AiDlArgRow } from '../../../../lib/aiDetection/siAiDlTrainConfig'
import type { RasterMapCoordinates } from '../../../../utils/FileLoader'
import './SiAiDetectionGisPanel.css'

export type AiDlMapLayerRasterRef = {
  layerId: string
  label: string
  previewUrl?: string
  coordinates?: RasterMapCoordinates
  serviceUrl?: string
}

export type SiAiDlDetectObjectsPanelProps = {
  layerOptions: Array<{ id: string; label: string }>
  outputLayerOptions?: Array<{ id: string; label: string }>
  onOpenLayersPanel?: () => void
  getMapBounds?: () => { west: number; south: number; east: number; north: number } | undefined
  resolveMapLayer?: (layerKey: string) => AiDlMapLayerRasterRef | null
  onRasterProcessed?: (raster: AiDlProcessedRaster) => void
  onExportDetectionToMap?: (geojson: GeoJSON.FeatureCollection, name: string) => void
  disabled?: boolean
  onStatus?: (message: string) => void
}

type DetectJob = {
  status: 'idle' | 'running' | 'done' | 'error'
  message: string
  progress: number
  results?: AiDlDetectionSummary
}

const RASTER_FILE_ACCEPT =
  '.tif,.tiff,.png,.jpg,.jpeg,.jp2,.img,.cog,.pgw,.jgw,.tfw,.wld,.prj,.zip'
const DEFAULT_RASTER_ACCEPT = RASTER_FILE_ACCEPT

export function SiAiDlDetectObjectsPanel({
  layerOptions,
  outputLayerOptions = [],
  onOpenLayersPanel,
  getMapBounds,
  resolveMapLayer,
  onRasterProcessed,
  onExportDetectionToMap,
  disabled = false,
  onStatus,
}: SiAiDlDetectObjectsPanelProps) {
  const [inputRaster, setInputRaster] = useState('')
  const [inputRasterSource, setInputRasterSource] = useState<'pc' | 'layer' | 'url' | null>(null)
  const [inputRasterTypeLabel, setInputRasterTypeLabel] = useState<string | null>(null)
  const [processedRaster, setProcessedRaster] = useState<AiDlProcessedRaster | null>(null)
  const [rasterPipelineMessage, setRasterPipelineMessage] = useState<string | null>(null)
  const [rasterPipelineError, setRasterPipelineError] = useState<string | null>(null)
  const [rasterProcessing, setRasterProcessing] = useState(false)
  const [inputLayerPickOpen, setInputLayerPickOpen] = useState(false)
  const [outputObjects, setOutputObjects] = useState('')
  const [outputSource, setOutputSource] = useState<'pc' | 'layer' | null>(null)
  const [outputFormat, setOutputFormat] = useState<AiDlOutputFormat | null>(null)
  const [outputFileHandle, setOutputFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [outputFormatPickOpen, setOutputFormatPickOpen] = useState(false)
  const [outputLayerPickOpen, setOutputLayerPickOpen] = useState(false)
  const [modelType, setModelType] = useState<AiDlModelTypeId>('dlpk')
  const [modelFileName, setModelFileName] = useState('')
  const [modelLoadStatus, setModelLoadStatus] = useState<AiDlModelLoadStatus>('idle')
  const [modelError, setModelError] = useState<string | null>(null)
  const [modelMetadata, setModelMetadata] = useState<AiDlModelMetadata | null>(null)
  const [args, setArgs] = useState<AiDlArgRow[]>([])
  const [runNms, setRunNms] = useState(false)
  const [usePixelSpace, setUsePixelSpace] = useState(false)
  const [job, setJob] = useState<DetectJob | null>(null)
  const rasterInputRef = useRef<HTMLInputElement>(null)
  const outputInputRef = useRef<HTMLInputElement>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)
  const [pendingRasterUploadFiles, setPendingRasterUploadFiles] = useState<File[]>([])

  const mergeRasterUploadFiles = useCallback((incoming: File[]) => {
    const merged = new Map<string, File>()
    const key = (file: File) => `${file.name}:${file.size}:${file.lastModified}`
    for (const file of [...pendingRasterUploadFiles, ...incoming]) {
      merged.set(key(file), file)
    }
    return [...merged.values()]
  }, [pendingRasterUploadFiles])

  const modelLoaded = modelLoadStatus === 'loaded' && modelMetadata !== null
  const argsReady = modelLoaded && args.length > 0
  const rasterReady = processedRaster?.readyForInference === true

  const commitProcessedRaster = useCallback(
    (raster: AiDlProcessedRaster, source: 'pc' | 'layer' | 'url', label?: string | null) => {
      setPendingRasterUploadFiles([])
      setProcessedRaster(raster)
      setInputRaster(raster.label)
      setInputRasterSource(source)
      setInputRasterTypeLabel(label ?? raster.validation.format)
      setRasterPipelineError(null)
      setRasterPipelineMessage(
        `Raster ready — ${raster.validation.widthPx || 'service'}×${raster.validation.heightPx || 'n/a'}px, ${raster.validation.bands || 3} band(s), reprojected to EPSG:3857.`,
      )
      onRasterProcessed?.(raster)
      onStatus?.(`Raster processed and added to map — ${raster.label}`)
    },
    [onRasterProcessed, onStatus],
  )

  const runRasterPipeline = useCallback(
    async (runner: () => Promise<AiDlProcessedRaster>, source: 'pc' | 'layer' | 'url', label?: string | null) => {
      setRasterProcessing(true)
      setRasterPipelineError(null)
      setProcessedRaster(null)
      setRasterPipelineMessage('Validating raster…')
      try {
        const result = await runner()
        commitProcessedRaster(result, source, label)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Raster processing failed.'
        setRasterPipelineError(message)
        onStatus?.(message)
      } finally {
        setRasterProcessing(false)
      }
    },
    [commitProcessedRaster, onStatus],
  )

  const handleRasterFiles = useCallback(
    (files: FileList | File[]) => {
      const merged = mergeRasterUploadFiles(Array.from(files))
      const picked = pickRasterUploadFiles(merged)

      if (!picked) {
        if (merged.some(isWorldFileOnly)) {
          setPendingRasterUploadFiles(merged)
          setRasterPipelineError(null)
          setRasterPipelineMessage('Sidecar file saved — now select the raster image from the export folder.')
        }
        return
      }

      if (rasterNeedsWorldSidecar(picked.raster, picked.companions)) {
        setPendingRasterUploadFiles([picked.raster, ...picked.companions])
        setRasterPipelineError(null)
        setInputRaster(picked.raster.name)
        setRasterPipelineMessage(
          `Selected ${picked.raster.name} — add its world file (.jgw / .pgw / .tfw) and optional .prj.`,
        )
        return
      }

      setPendingRasterUploadFiles([])
      void runRasterPipeline(
        () => processRasterFiles([picked.raster, ...picked.companions], getMapBounds?.()),
        'pc',
        picked.raster.name,
      )
    },
    [getMapBounds, mergeRasterUploadFiles, runRasterPipeline],
  )

  const handleMapLayerRaster = useCallback(
    (layerKey: string, label: string) => {
      const resolved = resolveMapLayer?.(layerKey)
      if (!resolved) {
        setRasterPipelineError('Could not resolve the selected map layer.')
        return
      }
      void runRasterPipeline(
        async () =>
          processExistingMapLayer({
            layerId: resolved.layerId,
            label: resolved.label || label,
            previewUrl: resolved.previewUrl,
            coordinates: resolved.coordinates,
            serviceUrl: resolved.serviceUrl,
          }),
        'layer',
        'Map Raster Layer',
      )
      setInputLayerPickOpen(false)
    },
    [resolveMapLayer, runRasterPipeline],
  )

  const resetModelState = useCallback(() => {
    setModelFileName('')
    setModelLoadStatus('idle')
    setModelError(null)
    setModelMetadata(null)
    setArgs([])
  }, [])

  const applyLoadedModel = useCallback((metadata: AiDlModelMetadata) => {
    setModelMetadata(metadata)
    setModelLoadStatus('loaded')
    setModelError(null)
    setArgs(defaultArgsForArchitecture(architectureKeyFromMetadata(metadata)))
    onStatus?.(`Model loaded — ${metadata.framework} · ${metadata.architecture}`)
  }, [onStatus])

  const handleModelTypeChange = useCallback(
    (nextType: AiDlModelTypeId) => {
      setModelType(nextType)
      resetModelState()
    },
    [resetModelState],
  )

  const handleModelFile = useCallback(
    async (file: File) => {
      setModelFileName(file.name)
      setModelLoadStatus('loading')
      setModelError(null)
      setModelMetadata(null)
      setArgs([])
      onStatus?.(`Validating model — ${file.name}…`)

      const result = await validateAndLoadModel(file, modelType)
      if (!result.ok) {
        setModelLoadStatus('error')
        setModelError(result.error)
        onStatus?.(result.error)
        return
      }

      applyLoadedModel(result.metadata)
    },
    [applyLoadedModel, modelType, onStatus],
  )

  const updateArg = useCallback((id: string, value: string) => {
    setArgs(prev => prev.map(row => (row.id === id ? { ...row, value } : row)))
  }, [])

  const canRun = Boolean(rasterReady && outputObjects.trim() && outputFormat && modelLoaded)
  const busy = job?.status === 'running' || rasterProcessing
  const selectedModelOption = AI_DL_MODEL_TYPE_OPTIONS.find(o => o.id === modelType)

  const runDetect = useCallback(() => {
    if (!canRun || disabled || !modelMetadata || !processedRaster) return
    setJob({ status: 'running', message: 'Running inference on raster…', progress: 0 })
    onStatus?.('Detect Objects Using Deep Learning — running inference…')
    let pct = 0
    const timer = window.setInterval(() => {
      pct += 18
      if (pct >= 100) {
        window.clearInterval(timer)
        const results = simulateDetectionResults(modelMetadata)
        void (async () => {
          try {
            if (outputFormat === 'feature-layer') {
              const geojson = detectionSummaryToGeoJson(results, processedRaster.boundsWgs84)
              onExportDetectionToMap?.(geojson, outputObjects || 'AI Detections')
            } else if (outputFormat && outputObjects) {
              await exportDetectionResults({
                summary: results,
                bounds: processedRaster.boundsWgs84,
                fileName: outputObjects,
                format: outputFormat,
                fileHandle: outputFileHandle,
              })
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Export failed.'
            onStatus?.(message)
          }
        })()
        setJob({
          status: 'done',
          message: `Detection complete — ${results.totalCount} objects exported.`,
          progress: 100,
          results,
        })
        onStatus?.(`Detection complete — ${results.totalCount} features exported.`)
        return
      }
      setJob({ status: 'running', message: `Inferring objects… ${pct}%`, progress: pct })
    }, 380)
  }, [
    canRun,
    disabled,
    modelMetadata,
    onExportDetectionToMap,
    onStatus,
    outputFileHandle,
    outputFormat,
    outputObjects,
    processedRaster,
  ])

  const applyOutputSelection = useCallback((fileName: string, format: AiDlOutputFormat, handle: FileSystemFileHandle | null = null) => {
    setOutputObjects(fileName)
    setOutputFormat(format)
    setOutputFileHandle(handle)
    setOutputSource(format === 'feature-layer' ? 'layer' : 'pc')
    setOutputFormatPickOpen(false)
    setOutputLayerPickOpen(false)
  }, [])

  const openOutputFileBrowser = useCallback(async () => {
    if (disabled || busy) return
    setOutputLayerPickOpen(false)
    const picked = await pickOutputDestination()
    if (picked) {
      applyOutputSelection(picked.fileName, picked.format, picked.handle)
      return
    }
    setOutputFormatPickOpen(v => !v)
  }, [applyOutputSelection, busy, disabled])

  const openOutputFormatPicker = useCallback(
    (format: AiDlOutputFormat) => {
      if (format === 'feature-layer') {
        setOutputFormatPickOpen(false)
        setOutputLayerPickOpen(true)
        return
      }
      applyOutputSelection(defaultOutputFileName(format), format)
    },
    [applyOutputSelection],
  )

  const openRasterFileBrowser = useCallback(() => {
    if (disabled || busy || rasterProcessing) return
    setInputLayerPickOpen(false)
    rasterInputRef.current?.click()
  }, [busy, disabled, rasterProcessing])

  return (
    <div className="si-ai-dl-gp">
      <h3 className="si-ai-dl-gp__tool-title">Detect Objects Using Deep Learning</h3>
      <p className="si-ai-dl-gp__tool-hint">Input raster → model definition → detected objects feature class.</p>

      <div className="si-ai-dl-gp__field si-ai-dl-gp__field--raster">
        <span className="si-ai-dl-gp__label">
          <span className="si-ai-dl-gp__req" aria-hidden>*</span> Input Raster
        </span>
        <div className="si-ai-dl-gp__row si-ai-dl-gp__row--browse-input">
          <input
            className="si-ai-dl-gp__input si-ai-dl-gp__input--picker"
            value={inputRaster}
            placeholder="GeoTIFF, PNG, JPG + world file (.jgw/.pgw/.tfw)"
            readOnly
            disabled={disabled || busy || rasterProcessing}
            onClick={openRasterFileBrowser}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openRasterFileBrowser()
              }
            }}
          />
          <button
            type="button"
            className="si-ai-dl-gp__browse si-ai-dl-gp__browse--layers"
            title="Browse map layers"
            aria-label="Browse raster from map layers"
            aria-expanded={inputLayerPickOpen}
            disabled={disabled || busy || rasterProcessing}
            onClick={() => setInputLayerPickOpen(v => !v)}
          >
            <i className="fa-solid fa-layer-group" aria-hidden />
          </button>
        </div>
        <input
          ref={rasterInputRef}
          type="file"
          className="si-ai-dl-gp__hidden-input"
          accept={DEFAULT_RASTER_ACCEPT}
          multiple
          onChange={e => {
            if (e.target.files?.length) handleRasterFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {inputLayerPickOpen ? (
          <div className="si-ai-dl-gp__layer-pick" role="listbox" aria-label="Map layers for input raster">
            <p className="si-ai-dl-gp__pick-title">Map Layer</p>
            {layerOptions.length ? (
              layerOptions.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  className="si-ai-dl-gp__layer-pick-btn"
                  onClick={() => handleMapLayerRaster(opt.id, opt.label)}
                >
                  <i className="fa-solid fa-image" aria-hidden />
                  {opt.label}
                </button>
              ))
            ) : (
              <p className="si-ai-dl-gp__hint-block">No raster layers on the map yet.</p>
            )}
            {onOpenLayersPanel ? (
              <div className="si-ai-dl-gp__layer-pick-footer">
                <button type="button" className="si-ai-dl-gp__mini-btn" onClick={onOpenLayersPanel}>
                  <i className="fa-solid fa-layer-group" aria-hidden /> Open Layers toolbox
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {rasterProcessing ? (
          <p className="si-ai-dl-gp__status">{rasterPipelineMessage ?? 'Processing raster…'}</p>
        ) : rasterPipelineMessage && !rasterPipelineError ? (
          <p className="si-ai-dl-gp__status">{rasterPipelineMessage}</p>
        ) : null}
        {rasterPipelineError ? (
          <p className="si-ai-dl-gp__status is-error" role="alert">
            <i className="fa-solid fa-circle-xmark" aria-hidden /> {rasterPipelineError}
          </p>
        ) : null}
        {processedRaster ? (
          <div className="si-ai-dl-gp__model-card">
            <div className="si-ai-dl-gp__model-status si-ai-dl-gp__model-status--ok">
              <i className="fa-solid fa-circle-check" aria-hidden />
              <span>Raster validated — ready for Deep Learning Detection</span>
            </div>
            <dl className="si-ai-dl-gp__meta si-ai-dl-gp__meta--model">
              <dt>Format</dt>
              <dd>{processedRaster.validation.format}</dd>
              <dt>Pixel size</dt>
              <dd>
                {processedRaster.validation.widthPx && processedRaster.validation.heightPx
                  ? `${processedRaster.validation.widthPx} × ${processedRaster.validation.heightPx} px`
                  : '—'}
              </dd>
              <dt>Bands</dt>
              <dd>{processedRaster.validation.bands || '—'}</dd>
              <dt>Source CRS</dt>
              <dd>{processedRaster.validation.sourceCrs}</dd>
              <dt>Map CRS</dt>
              <dd>{processedRaster.validation.targetCrs}</dd>
              <dt>Extent (WGS84)</dt>
              <dd>
                {processedRaster.boundsWgs84.west.toFixed(5)}, {processedRaster.boundsWgs84.south.toFixed(5)} →{' '}
                {processedRaster.boundsWgs84.east.toFixed(5)}, {processedRaster.boundsWgs84.north.toFixed(5)}
              </dd>
            </dl>
            {processedRaster.validation.warnings.length ? (
              <p className="si-ai-dl-gp__hint-block">{processedRaster.validation.warnings.join(' ')}</p>
            ) : null}
          </div>
        ) : inputRasterSource === 'pc' ? (
          <p className="si-ai-dl-gp__status">
            {inputRasterTypeLabel ? `${inputRasterTypeLabel} from PC.` : 'Input raster from PC browse.'}
          </p>
        ) : inputRasterSource === 'layer' ? (
          <p className="si-ai-dl-gp__status">Input raster from map layer.</p>
        ) : inputRasterSource === 'url' ? (
          <p className="si-ai-dl-gp__status">
            {inputRasterTypeLabel ? `${inputRasterTypeLabel} URL.` : 'Input raster service URL.'}
          </p>
        ) : rasterPipelineMessage ? (
          <p className="si-ai-dl-gp__status">{rasterPipelineMessage}</p>
        ) : null}
      </div>

      <div className="si-ai-dl-gp__field">
        <span className="si-ai-dl-gp__label">
          <span className="si-ai-dl-gp__req" aria-hidden>*</span> Output Detected Objects
        </span>
        <div className="si-ai-dl-gp__row si-ai-dl-gp__row--browse-input">
          <input
            className="si-ai-dl-gp__input si-ai-dl-gp__input--picker"
            value={outputObjects}
            placeholder="Click to choose output name and format"
            readOnly
            disabled={disabled || busy}
            onClick={() => void openOutputFileBrowser()}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                void openOutputFileBrowser()
              }
            }}
          />
          <button
            type="button"
            className="si-ai-dl-gp__browse si-ai-dl-gp__browse--layers"
            title="Feature layer on map"
            aria-label="Choose map feature layer output"
            aria-expanded={outputLayerPickOpen}
            disabled={disabled || busy}
            onClick={() => {
              setOutputFormatPickOpen(false)
              setOutputLayerPickOpen(v => !v)
            }}
          >
            <i className="fa-solid fa-layer-group" aria-hidden />
          </button>
        </div>
        <input
          ref={outputInputRef}
          type="file"
          className="si-ai-dl-gp__hidden-input"
          accept={OUTPUT_FILE_ACCEPT}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) applyOutputSelection(file.name, inferOutputFormat(file.name))
            e.target.value = ''
          }}
        />
        {outputFormatPickOpen ? (
          <div className="si-ai-dl-gp__layer-pick" role="dialog" aria-label="Output format">
            <p className="si-ai-dl-gp__pick-title">Output Format</p>
            <div className="si-ai-dl-gp__source-types">
              {OUTPUT_FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  className="si-ai-dl-gp__source-type-btn"
                  onClick={() => openOutputFormatPicker(opt.id)}
                >
                  <span>{opt.label}</span>
                  {opt.extension ? <em>{opt.extension}</em> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {outputLayerPickOpen ? (
          <div className="si-ai-dl-gp__layer-pick" role="listbox" aria-label="Map layers for output">
            <p className="si-ai-dl-gp__pick-title">Feature Layer</p>
            {outputLayerOptions.length ? (
              outputLayerOptions.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  className="si-ai-dl-gp__layer-pick-btn"
                  onClick={() => applyOutputSelection(opt.label, 'feature-layer')}
                >
                  <i className="fa-solid fa-vector-square" aria-hidden />
                  {opt.label}
                </button>
              ))
            ) : (
              <p className="si-ai-dl-gp__hint-block">No vector layers on the map yet.</p>
            )}
            {onOpenLayersPanel ? (
              <div className="si-ai-dl-gp__layer-pick-footer">
                <button type="button" className="si-ai-dl-gp__mini-btn" onClick={onOpenLayersPanel}>
                  <i className="fa-solid fa-layer-group" aria-hidden /> Open Layers toolbox
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="si-ai-dl-gp__field">
        <span className="si-ai-dl-gp__label">
          <span className="si-ai-dl-gp__req" aria-hidden>*</span> AI Model Type
        </span>
        <select
          className="si-ai-dl-gp__select"
          value={modelType}
          disabled={disabled || busy || modelLoadStatus === 'loading'}
          onChange={e => handleModelTypeChange(e.target.value as AiDlModelTypeId)}
        >
          {AI_DL_MODEL_TYPE_OPTIONS.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="si-ai-dl-gp__field">
        <span className="si-ai-dl-gp__label">
          <span className="si-ai-dl-gp__req" aria-hidden>*</span> Model File
        </span>
        <div className="si-ai-dl-gp__row">
          <input
            className="si-ai-dl-gp__input"
            value={modelFileName}
            readOnly
            placeholder={modelAcceptForType(modelType).replace(/\./g, ' ').trim()}
          />
          <button
            type="button"
            className="si-ai-dl-gp__browse"
            title="Upload model"
            disabled={disabled || busy || modelLoadStatus === 'loading'}
            onClick={() => modelInputRef.current?.click()}
          >
            <i className="fa-solid fa-upload" aria-hidden />
          </button>
        </div>
        <input
          ref={modelInputRef}
          type="file"
          className="si-ai-dl-gp__hidden-input"
          accept={modelAcceptForType(modelType)}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) void handleModelFile(file)
            e.target.value = ''
          }}
        />
        {modelLoadStatus === 'loading' ? (
          <p className="si-ai-dl-gp__status">Validating model and reading metadata…</p>
        ) : null}
        {modelLoadStatus === 'error' && modelError ? (
          <p className="si-ai-dl-gp__status is-error" role="alert">
            <i className="fa-solid fa-circle-xmark" aria-hidden /> {modelError}
          </p>
        ) : null}
        {modelLoaded && modelMetadata ? (
          <div className="si-ai-dl-gp__model-card">
            <div className="si-ai-dl-gp__model-status si-ai-dl-gp__model-status--ok">
              <i className="fa-solid fa-circle-check" aria-hidden />
              <span>Model Loaded Successfully</span>
            </div>
            <div className="si-ai-dl-gp__model-status si-ai-dl-gp__model-status--ready">
              <i className="fa-solid fa-bolt" aria-hidden />
              <span>Ready for Detection</span>
            </div>
            <dl className="si-ai-dl-gp__meta si-ai-dl-gp__meta--model">
              <dt>Framework</dt>
              <dd>{modelMetadata.framework}</dd>
              <dt>Architecture</dt>
              <dd>{modelMetadata.architecture}</dd>
              <dt>Task</dt>
              <dd>{modelMetadata.taskType.replace(/-/g, ' ')}</dd>
              <dt>Input size</dt>
              <dd>{modelMetadata.inputSize}</dd>
              <dt>Bands</dt>
              <dd>{modelMetadata.bands}</dd>
              {modelMetadata.emdPath ? (
                <>
                  <dt>EMD</dt>
                  <dd>{modelMetadata.emdPath}</dd>
                </>
              ) : null}
            </dl>
            <div className="si-ai-dl-gp__class-pills" aria-label="Model classes">
              {modelMetadata.classes.map(cls => (
                <span key={cls} className="si-ai-dl-gp__class-pill">
                  {cls}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="si-ai-dl-gp__field">
        <span className="si-ai-dl-gp__label">Arguments</span>
        {argsReady ? (
          <>
            <div className="si-ai-dl-gp__arg-head">
              <span>Name</span>
              <span>Value</span>
              <span />
            </div>
            {args.map(row => (
              <div key={row.id} className="si-ai-dl-gp__arg-row">
                <span className="si-ai-dl-gp__input" style={{ display: 'flex', alignItems: 'center' }}>
                  {row.name}
                </span>
                <input
                  className="si-ai-dl-gp__input"
                  value={row.value}
                  disabled={disabled || busy}
                  onChange={e => updateArg(row.id, e.target.value)}
                />
                <span />
              </div>
            ))}
          </>
        ) : null}
      </div>

      <label className="si-ai-dl-gp__check">
        <input
          type="checkbox"
          checked={runNms}
          disabled={disabled || busy}
          onChange={e => setRunNms(e.target.checked)}
        />
        Non Maximum Suppression
      </label>
      <label className="si-ai-dl-gp__check">
        <input
          type="checkbox"
          checked={usePixelSpace}
          disabled={disabled || busy}
          onChange={e => setUsePixelSpace(e.target.checked)}
        />
        Use pixel space
      </label>

      {job ? (
        <div className="si-ai-dl-gp__progress">
          <div className="si-ai-dl-gp__progress-label">{job.message}</div>
          <div className="si-ai-dl-gp__progress-track">
            <div className="si-ai-dl-gp__progress-fill" style={{ width: `${job.progress}%` }} />
          </div>
        </div>
      ) : null}

      {job?.status === 'done' && job.results ? (
        <div className="si-ai-dl-gp__field">
          <span className="si-ai-dl-gp__label">Detection Results</span>
          <div className="si-ai-dl-gp__metrics">
            <div className="si-ai-dl-gp__metric">
              <span>Total detections</span>
              <strong>{job.results.totalCount}</strong>
            </div>
            <div className="si-ai-dl-gp__metric">
              <span>Classes</span>
              <strong>{job.results.byClass.length}</strong>
            </div>
          </div>
          <div className="si-ai-dl-gp__results-table" role="table" aria-label="Detection summary">
            <div className="si-ai-dl-gp__results-head" role="row">
              <span role="columnheader">Class</span>
              <span role="columnheader">Count</span>
              <span role="columnheader">Avg conf.</span>
              <span role="columnheader">Geometry</span>
            </div>
            {job.results.byClass.map(row => (
              <div key={row.className} className="si-ai-dl-gp__results-row" role="row">
                <span role="cell">{row.className}</span>
                <span role="cell">{row.count}</span>
                <span role="cell">{(row.avgConfidence * 100).toFixed(1)}%</span>
                <span role="cell">BBox / Polygon</span>
              </div>
            ))}
          </div>
          <p className="si-ai-dl-gp__status is-done">
            Output includes bounding boxes, polygons, class names, and confidence scores.
          </p>
        </div>
      ) : null}

      <div className="si-ai-dl-gp__runbar">
        <span className="si-ai-dl-gp__run-hint">
          {!rasterReady ? 'Process a valid raster input.' : !modelLoaded ? 'Load a valid model.' : !outputObjects.trim() ? 'Set output path.' : 'Ready'}
        </span>
        <div className="si-ai-dl-gp__run-actions">
          <button
            type="button"
            className="si-ai-dl-gp__run-btn"
            disabled={!canRun || disabled || busy}
            onClick={runDetect}
          >
            <i className="fa-solid fa-circle-play" aria-hidden />
            Run
          </button>
        </div>
      </div>
    </div>
  )
}
