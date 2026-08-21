import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import {
  cancelTrainingJob,
  fetchInferenceJob,
  fetchLatestTrainingModel,
  fetchTrainingHealth,
  fetchTrainingModel,
  pollInferenceJob,
  pollTrainingJob,
  startInferenceJob,
  startTrainingJob,
  TrainingAiServiceError,
  type InferenceResult,
  type TrainingJobStatus,
  type TrainingModelInfo,
} from '../../../../lib/trainingAi/trainingAiClient'
import {
  loadPersistedTrainingModel,
  savePersistedTrainingModel,
  savePersistedEpochHistory,
  clearPersistedTrainingModel,
} from '../../../../lib/trainingAi/trainingModelPersistence'
import {
  extractModeForOutputType,
  isDelineateFieldsMode,
  isParcelExtractMode,
  parcelLayerTitle,
  runDelineateFieldsExtract,
  runFieldsTreesExtract,
} from '../../../../lib/trainingAi/extractFieldsTrees'
import { samplesBbox, type TrainingDrawTool } from '../../../../lib/trainingAi/trainingSampleStore'
import {
  DEFAULT_INFERENCE_ARGUMENTS,
  serializeInferenceArguments,
  type InferenceArguments,
} from '../../../../lib/trainingAi/inferenceArguments'
import { TrainingDataPanel } from './TrainingDataPanel'
import { ModelTrainingPanel } from './ModelTrainingPanel'
import { ModelValidationPanel } from './ModelValidationPanel'
import { ValidationQuickDashboard } from './ValidationQuickDashboard'
import { InferencePanel, isInferenceFileImagery, type InferenceImagerySource, type TrainingOutputType } from './InferencePanel'
import { InferenceResults } from './InferenceResults'
import type { useTrainingAISamples } from './useTrainingAISamples'
import {
  DEFAULT_TRAINING_MODEL_ID,
  captureSourceForAnalysisImagery,
  getTrainingModelById,
  isTrainModelPickerEntry,
  resolveTrainJobModel,
  type AnalysisImageryKind,
} from '../../../../lib/trainingAi/modelRegistry'
import { autoSelectModelId, evaluateModelCompatibility } from '../../../../lib/trainingAi/modelCompatibility'
import './TrainingAITool.css'

export type TrainingAIStep = 1 | 2 | 3 | 4

export type TrainingAIToolProps = {
  samplesApi: ReturnType<typeof useTrainingAISamples>
  digitizing: boolean
  onDigitizingChange: (active: boolean) => void
  /** Map host for floating Quick Dashboard portal. */
  mapContainerRef?: RefObject<HTMLElement | null>
  captureTrainingView: (
    bbox: [number, number, number, number],
    opts?: { imagery?: string },
  ) => Promise<{
    image: string
    bbox: [number, number, number, number]
  } | null>
  captureMapExtent: (opts?: { imagery?: InferenceImagerySource }) => Promise<{
    image: string
    bbox: [number, number, number, number]
  } | null>
  /** Human-readable AOI source for Infer step (Edit / Layers / map extent). */
  inferAreaLabel?: string
  /** Active AOI FeatureCollection (draw / layers / agro) — optional field clip. */
  activeAoi?: GeoJSON.FeatureCollection | null
  onInferenceResult: (result: InferenceResult, layerName: string) => string | null
  inferenceLayerId: string | null
  inferenceLayerName: string | null
  inferenceVisible: boolean
  inferenceOpacity: number
  inferenceFeatureCount: number
  onInferenceToggle: (visible: boolean) => void
  onInferenceOpacity: (opacity: number) => void
  onInferenceZoom: () => void
  onInferenceRemove: () => void
  /** True when samples changed after the last inference layer was produced. */
  inferenceStaleBySamples?: boolean
  onZoomToLiveSamples?: () => void
}

const STEPS: Array<{ id: TrainingAIStep; title: string; hint: string }> = [
  { id: 1, title: 'Samples', hint: 'Generate Training Data' },
  { id: 2, title: 'Train', hint: 'Train Model' },
  { id: 3, title: 'Validate', hint: 'Validate Model' },
  { id: 4, title: 'Infer', hint: 'Run Inference' },
]

export function TrainingAITool({
  samplesApi,
  digitizing,
  onDigitizingChange,
  mapContainerRef,
  captureTrainingView,
  captureMapExtent,
  inferAreaLabel = 'Current map extent',
  activeAoi = null,
  onInferenceResult,
  inferenceLayerId,
  inferenceLayerName,
  inferenceVisible,
  inferenceOpacity,
  inferenceFeatureCount,
  onInferenceToggle,
  onInferenceOpacity,
  onInferenceZoom,
  onInferenceRemove,
  inferenceStaleBySamples = false,
  onZoomToLiveSamples,
}: TrainingAIToolProps) {
  const [step, setStep] = useState<TrainingAIStep>(1)
  const [validationDashOpen, setValidationDashOpen] = useState(false)
  const [epochs, setEpochs] = useState(10)
  const [batchSize, setBatchSize] = useState(2)
  const [learningRate, setLearningRate] = useState(6e-5)
  const [valSplit, setValSplit] = useState(0.2)
  const [inferArgs, setInferArgs] = useState<InferenceArguments>(DEFAULT_INFERENCE_ARGUMENTS)
  const [trainBusy, setTrainBusy] = useState(false)
  const [trainJob, setTrainJob] = useState<TrainingJobStatus | null>(null)
  const [trainError, setTrainError] = useState<string | null>(null)
  const [trainJobId, setTrainJobId] = useState<string | null>(null)
  const [modelId, setModelId] = useState<string | null>(null)
  const [modelInfo, setModelInfo] = useState<TrainingModelInfo | null>(null)
  const [confidence, setConfidence] = useState(0.4)
  const [outputType, setOutputType] = useState<TrainingOutputType>('fields')
  const [imagerySource, setImagerySource] = useState<InferenceImagerySource>('basemap')
  const [trainModelId, setTrainModelId] = useState(DEFAULT_TRAINING_MODEL_ID)
  const [analysisImagery, setAnalysisImagery] = useState<AnalysisImageryKind>('sentinel2')
  const [inferUploaded, setInferUploaded] = useState<{
    name: string
    dataUrl: string
  } | null>(null)
  const handleOutputTypeChange = (next: TrainingOutputType) => {
    setOutputType(next)
    // Delineate Anything on Sentinel mosaics needs a lower floor than SegFormer.
    if (next === 'fields_fbis') setConfidence(0.25)
    // YOLO trees: lower score finds more crowns on satellite RGB.
    if (next === 'trees' || next === 'object_detection') setConfidence(0.2)
  }
  const handleAnalysisImageryChange = (next: AnalysisImageryKind) => {
    setAnalysisImagery(next)
    const cur = getTrainingModelById(trainModelId)
    // Keep any Train-picker selection (Delineate / SegFormer) — TRAIN always
    // resolves to a SegFormer encoder. Only auto-switch catalog models that cannot train.
    if (cur && isTrainModelPickerEntry(cur)) return
    if (!cur || evaluateModelCompatibility(cur, next).status === 'not_compatible') {
      setTrainModelId(autoSelectModelId(next, { preferTrainable: true }))
    }
  }
  const handleTrainModelIdChange = (id: string) => {
    setTrainModelId(id)
    const m = getTrainingModelById(id)
    if (!m?.inferEngine || m.trainableOnAgroCloud) return
    if (m.inferEngine === 'delineate-fbis') setOutputType('fields_fbis')
    else if (m.inferEngine === 'yolo-trees') setOutputType('trees')
  }
  const handleImagerySourceChange = (next: InferenceImagerySource) => {
    setImagerySource(next)
    if (!isInferenceFileImagery(next)) setInferUploaded(null)
  }
  const uploadInferImagery = useCallback(async (file: File | null) => {
    if (!file) {
      setInferUploaded(null)
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Failed to read image file.'))
      reader.readAsDataURL(file)
    })
    setInferUploaded({ name: file.name, dataUrl })
  }, [])
  const [inferBusy, setInferBusy] = useState(false)
  const [inferError, setInferError] = useState<string | null>(null)
  const [inferProgress, setInferProgress] = useState(0)
  const [inferStage, setInferStage] = useState<string | null>(null)
  const [healthNote, setHealthNote] = useState<string | null>(null)
  const [trainingReady, setTrainingReady] = useState(false)

  // Restore last trained model so Infer works after remount / refresh.
  useEffect(() => {
    const ac = new AbortController()
    const apply = (live: TrainingModelInfo) => {
      setModelId(live.model_id)
      setModelInfo(live)
      savePersistedTrainingModel(live)
    }
    const clear = () => {
      setModelId(null)
      setModelInfo(null)
      clearPersistedTrainingModel()
    }
    const saved = loadPersistedTrainingModel()
    if (saved?.model_id) {
      // Optimistic restore; verify checkpoint still exists on :8095.
      setModelId(saved.model_id)
      setModelInfo({
        model_id: saved.model_id,
        model_name: saved.model_name,
        model_version: saved.model_version,
        training_date: saved.training_date,
        epochs: saved.epochs,
        sample_count: saved.sample_count,
        class_count: saved.class_count,
      })
      void fetchTrainingModel(saved.model_id, ac.signal).then(live => {
        if (ac.signal.aborted) return
        if (live) {
          apply(live)
          return
        }
        // Fall back to newest checkpoint on disk.
        void fetchLatestTrainingModel(ac.signal).then(latest => {
          if (ac.signal.aborted) return
          if (latest) apply(latest)
          else clear()
        })
      })
      return () => ac.abort()
    }
    void fetchLatestTrainingModel(ac.signal).then(latest => {
      if (ac.signal.aborted || !latest) return
      apply(latest)
    })
    return () => ac.abort()
  }, [])

  // Re-probe while deps/service recover â do not leave a sticky transformers / offline banner.
  useEffect(() => {
    const ac = new AbortController()
    let cancelled = false
    const apply = (h: Awaited<ReturnType<typeof fetchTrainingHealth>>) => {
      if (cancelled || ac.signal.aborted) return
      setTrainingReady(Boolean(h.training))
      if (!h.training) {
        setHealthNote(h.error || 'Training service is not ready on the AgroCloud API.')
        return
      }
      setHealthNote(null)
      // Clear stale transport errors once the training API is healthy again.
      setTrainError(prev =>
        prev &&
        /fetch failed|offline|Could not reach|transformers|ModuleNotFound|Failed to fetch|service offline|port 8095/i.test(
          prev,
        )
          ? null
          : prev,
      )
    }
    const probe = () => {
      void fetchTrainingHealth(ac.signal)
        .then(apply)
        .catch(err => {
          if ((err as Error)?.name === 'AbortError' || cancelled) return
          setTrainingReady(false)
          setHealthNote('Training is unavailable. Confirm the AgroCloud API is running.')
        })
    }
    probe()
    const id = window.setInterval(probe, trainingReady ? 30_000 : 5_000)
    return () => {
      cancelled = true
      ac.abort()
      window.clearInterval(id)
    }
  }, [trainingReady])

  const trainDisabledReason = useMemo(() => {
    const selected = getTrainingModelById(trainModelId)
    if (selected && !isTrainModelPickerEntry(selected)) {
      return 'This model is not available for TRAIN MODEL. Choose SegFormer or Delineate Anything.'
    }
    if (!resolveTrainJobModel(trainModelId)) {
      return 'No fine-tune encoder available for this selection.'
    }
    const n = samplesApi.samples.length
    if (n < 5) {
      return n === 0
        ? 'Create training samples on the map before training a model.'
        : `Add at least 5 samples to train (currently ${n}).`
    }
    if (samplesApi.distinctClassCount < 1) {
      return 'Assign each sample to a class before training.'
    }
    return null
  }, [samplesApi.samples.length, samplesApi.distinctClassCount, trainModelId])

  const handleTrain = useCallback(async () => {
    if (trainDisabledReason) {
      setTrainError(trainDisabledReason)
      return
    }
    const selected = resolveTrainJobModel(trainModelId)
    if (!selected?.trainableOnAgroCloud || !selected.trainEncoder) {
      setTrainError('Select a model that can train on AgroCloud.')
      return
    }
    const bbox = samplesApi.bbox || samplesBbox(samplesApi.samples)
    if (!bbox) {
      setTrainError('Training samples have no valid spatial extent.')
      return
    }
    setTrainBusy(true)
    setTrainError(null)
    setTrainJob(null)
    try {
      let capture = await captureTrainingView(bbox, {
        imagery: captureSourceForAnalysisImagery(analysisImagery),
      })
      if (!capture?.image) {
        // Selected source had no pixels yet — fall back to the live map canvas.
        await new Promise(r => setTimeout(r, 400))
        capture = await captureTrainingView(bbox, { imagery: 'basemap' })
      }
      if (!capture?.image) {
        throw new TrainingAiServiceError(
          'Could not capture analysis imagery for training. Wait for the map / Sentinel-2 layer to finish loading, then retry.',
        )
      }
      const { jobId } = await startTrainingJob({
        samples: samplesApi.samples,
        classes: samplesApi.classes,
        imageDataUrl: capture.image,
        bbox: capture.bbox,
        epochs,
        batch_size: batchSize,
        learning_rate: learningRate,
        val_split: valSplit,
        model: selected.trainEncoder,
        encoder: selected.trainEncoder,
        bands: selected.requiredBands,
        image_id: samplesApi.samples[0]?.image_id,
        arguments: serializeInferenceArguments(inferArgs),
      })
      setTrainJobId(jobId)
      const done = await pollTrainingJob(jobId, {
        onProgress: j => {
          setTrainJob(j)
          if (j.loss_history?.length) savePersistedEpochHistory(j.loss_history)
        },
      })
      setTrainJob(done)
      if (done.status === 'error') {
        const raw = done.error || 'Training failed.'
        setTrainError(
          /ModuleNotFoundError:\s*No module named 'transformers'/i.test(raw)
            ? 'Training dependencies are missing on the training service. Retry, or contact an administrator.'
            : /ECONNREFUSED|port 8095/i.test(raw)
              ? 'Training is unavailable. Confirm the AgroCloud API is running.'
              : raw,
        )
      } else if (done.model?.model_id) {
        setModelId(done.model.model_id)
        setModelInfo(done.model)
        savePersistedTrainingModel(done.model)
        savePersistedEpochHistory(done.loss_history)
        setStep(3)
      } else if (done.loss_history?.length) {
        savePersistedEpochHistory(done.loss_history)
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const raw = (err as Error)?.message || 'Training failed.'
      const offline =
        (err as TrainingAiServiceError)?.offline === true || /ECONNREFUSED/i.test(raw)
      setTrainError(
        offline
          ? 'Training is unavailable. Confirm the AgroCloud API is running.'
          : raw,
      )
    } finally {
      setTrainBusy(false)
    }
  }, [
    analysisImagery,
    batchSize,
    captureTrainingView,
    epochs,
    inferArgs,
    learningRate,
    samplesApi.bbox,
    samplesApi.classes,
    samplesApi.samples,
    trainDisabledReason,
    trainModelId,
    valSplit,
  ])

  const handleCancelTrain = useCallback(() => {
    if (trainJobId) void cancelTrainingJob(trainJobId)
  }, [trainJobId])

  const handleInfer = useCallback(async () => {
    if (!isParcelExtractMode(outputType) && !modelId) {
      setInferError('Train a model before running inference.')
      return
    }
    setInferBusy(true)
    setInferError(null)
    setInferProgress(0)
    setInferStage('preparing')
    try {
      if (isParcelExtractMode(outputType)) {
        setInferStage('capturing extent')
        let capture: { image: string; bbox: [number, number, number, number] } | null = null
        if (isInferenceFileImagery(imagerySource)) {
          if (!inferUploaded?.dataUrl) {
            throw new TrainingAiServiceError(
              'Choose an image file (Drone / GeoTIFF / PNG / JPEG) before running Infer.',
            )
          }
          const bbox =
            samplesApi.bbox ||
            samplesBbox(samplesApi.samples) ||
            (await captureMapExtent({ imagery: 'basemap' }))?.bbox
          if (!bbox) {
            throw new TrainingAiServiceError(
              'Could not resolve AOI/map extent for the uploaded image. Draw an AOI or zoom to the area, then retry.',
            )
          }
          capture = { image: inferUploaded.dataUrl, bbox }
        } else {
          capture = await captureMapExtent({ imagery: imagerySource })
          if (!capture?.image) {
            await new Promise(r => setTimeout(r, 400))
            capture = await captureMapExtent({ imagery: imagerySource })
          }
        }
        const bbox = capture?.bbox || samplesApi.bbox || samplesBbox(samplesApi.samples)
        if (!bbox) {
          throw new TrainingAiServiceError(
            'Could not resolve map extent / AOI for extraction. Zoom to the training area and retry.',
          )
        }

        if (isDelineateFieldsMode(outputType)) {
          if (!capture?.image) {
            throw new TrainingAiServiceError(
              'Could not capture map imagery for FBIS extract. Wait for Sentinel-2 / basemap to load, then retry.',
            )
          }
          const extracted = await runDelineateFieldsExtract({
            bbox,
            imageDataUrl: capture.image,
            confidence,
            model: 'v2',
            minAreaM2: 50,
            onProgress: (p, stage) => {
              setInferProgress(p)
              setInferStage(stage)
            },
          })
          if (!extracted.stats.total) {
            onInferenceRemove()
            throw new TrainingAiServiceError(
              'No parcels from Delineate Anything. Zoom to cropland, set confidence â¤ 0.25, ensure :8096 is running, then retry.',
            )
          }
          const result: InferenceResult = {
            geojson: extracted.geojson,
            count: extracted.stats.total,
            primary_class: extracted.primary_class,
            output_type: 'fields_fbis',
            model_id: modelId || undefined,
            class_names: ['Field'],
          }
          const layerId = onInferenceResult(
            result,
            parcelLayerTitle(outputType, extracted.stats.fields, extracted.stats.trees),
          )
          if (!layerId) {
            throw new TrainingAiServiceError(
              `Extracted ${extracted.stats.total} feature(s) but none could be shown (AOI clip). Widen Area / clear AOI and retry.`,
            )
          }
          setInferProgress(100)
          setInferStage('done')
          return
        }

        const extractMode = extractModeForOutputType(outputType)
        const extracted = await runFieldsTreesExtract({
          bbox,
          imageDataUrl: capture?.image || null,
          aoi: activeAoi?.features?.length ? activeAoi : undefined,
          confidence,
          samples: samplesApi.samples,
          mode: extractMode,
          requireYolo: extractMode === 'trees',
          onProgress: (p, stage) => {
            setInferProgress(p)
            setInferStage(stage)
          },
        })

        if (!extracted.stats.total) {
          onInferenceRemove()
          throw new TrainingAiServiceError(
            extractMode === 'trees'
              ? 'No trees detected by YOLO. Zoom in, lower confidence, ensure tree-detection is running, then retry.'
              : 'No parcels detected. Zoom to cropland, ensure agri-field-boundary (:8092) is running, then retry.',
          )
        }

        const result: InferenceResult = {
          geojson: extracted.geojson,
          count: extracted.stats.total,
          primary_class: extracted.primary_class,
          output_type: extractMode === 'trees' ? 'trees' : 'fields',
          model_id: modelId || undefined,
          class_names: extractMode === 'trees' ? ['Tree'] : ['Field'],
        }
        const layerId = onInferenceResult(
          result,
          parcelLayerTitle(outputType, extracted.stats.fields, extracted.stats.trees),
        )
        if (!layerId) {
          throw new TrainingAiServiceError(
            `Extracted ${extracted.stats.total} feature(s) but none could be shown (AOI clip). Widen Area / clear AOI and retry.`,
          )
        }
        setInferProgress(100)
        setInferStage('done')
        return
      }

      // Classification only (classic SegFormer)
      setInferStage('capturing')
      let capture: { image: string; bbox: [number, number, number, number] } | null = null
      if (isInferenceFileImagery(imagerySource)) {
        if (!inferUploaded?.dataUrl) {
          throw new TrainingAiServiceError(
            'Choose an image file (Drone / GeoTIFF / PNG / JPEG) before running Infer.',
          )
        }
        const bbox =
          samplesApi.bbox ||
          samplesBbox(samplesApi.samples) ||
          (await captureMapExtent({ imagery: 'basemap' }))?.bbox
        if (!bbox) {
          throw new TrainingAiServiceError(
            'Could not resolve AOI/map extent for the uploaded image. Draw an AOI or zoom to the area, then retry.',
          )
        }
        capture = { image: inferUploaded.dataUrl, bbox }
      } else {
        capture = await captureMapExtent({ imagery: imagerySource })
        if (!capture?.image) {
          await new Promise(r => setTimeout(r, 400))
          capture = await captureMapExtent({ imagery: imagerySource })
        }
      }
      if (!capture?.image) {
        throw new TrainingAiServiceError(
          'Could not capture map imagery for inference. Wait for Basemap / Sentinel-2 tiles to load, then retry.',
        )
      }
      const { jobId } = await startInferenceJob({
        model_id: modelId!,
        imageDataUrl: capture.image,
        bbox: capture.bbox,
        confidence,
        output_type: 'classification',
        classes: samplesApi.classes,
        arguments: serializeInferenceArguments(inferArgs),
      })
      const done = await pollInferenceJob(jobId, {
        onProgress: j => {
          setInferProgress(j.progress)
          setInferStage(j.stage || j.status)
        },
      })
      let finalJob = done
      if (finalJob.status === 'done' && !finalJob.result) {
        await new Promise(r => setTimeout(r, 500))
        finalJob = await fetchInferenceJob(jobId)
      }
      if (finalJob.status === 'error' || !finalJob.result) {
        const err = finalJob.error || 'Unable to run inference. Check the model and imagery.'
        if (/not found|unknown model|no such|missing model/i.test(err)) {
          setModelId(null)
          setModelInfo(null)
          clearPersistedTrainingModel()
        }
        throw new TrainingAiServiceError(err)
      }
      const featureCount = Array.isArray(finalJob.result.geojson?.features)
        ? finalJob.result.geojson.features.length
        : Number(finalJob.result.count || 0)
      if (!featureCount) {
        onInferenceRemove()
        throw new TrainingAiServiceError(
          `No class above confidence ${confidence.toFixed(2)}. Lower the threshold (try 0.20â0.35), then RUN INFERENCE again.`,
        )
      }
      const primary =
        finalJob.result.primary_class || samplesApi.classes[0]?.class_name || 'Result'
      const layerId = onInferenceResult(finalJob.result, `AI Classification â ${primary}`)
      if (!layerId) {
        throw new TrainingAiServiceError(
          `Inference returned ${featureCount} feature(s) but none could be shown (possibly clipped by AOI). Widen the Area or clear AOI clip, then retry.`,
        )
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setInferError((err as Error)?.message || 'Unable to run inference. Check the model and imagery.')
    } finally {
      setInferBusy(false)
    }
  }, [
    activeAoi,
    captureMapExtent,
    confidence,
    imagerySource,
    inferArgs,
    inferUploaded,
    modelId,
    onInferenceRemove,
    onInferenceResult,
    outputType,
    samplesApi.bbox,
    samplesApi.classes,
    samplesApi.samples,
  ])

  const onDrawToolChange = (tool: TrainingDrawTool) => {
    samplesApi.setDrawTool(tool)
  }

  const modelLabel =
    modelInfo?.model_name && modelId
      ? `${modelInfo.model_name}${modelInfo.model_version ? ` Â· ${modelInfo.model_version}` : ''}`
      : modelId
  const staleResults = Boolean(inferenceLayerId && (!modelId || inferenceStaleBySamples))

  return (
    <div className="si-tai si-env-section-card si-rs-panel--glass">
      <div className="si-tai__stepper" role="tablist" aria-label="Training & AI workflow">
        {STEPS.map((s, index) => {
          const done =
            (s.id === 3 && trainJob?.status === 'done') ||
            (s.id === 4 && Boolean(modelId)) ||
            s.id < step
          const active = step === s.id
          return (
            <div key={s.id} className="si-tai__step-cell">
              <button
                type="button"
                role="tab"
                className={`si-tai__step${active ? ' is-active' : ''}${done && !active ? ' is-done' : ''}`}
                aria-selected={active}
                onClick={() => setStep(s.id)}
                title={s.hint}
              >
                <span className="si-tai__step-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="si-tai__step-label">{s.title}</span>
                <span className="si-tai__step-glow" aria-hidden="true" />
              </button>
              {s.id === 3 && mapContainerRef ? (
                <button
                  type="button"
                  className="si-tai__step-tool"
                  title="Open Validation Quick Dashboard"
                  aria-label="Open Validation Quick Dashboard"
                  onClick={() => {
                    setStep(3)
                    setValidationDashOpen(true)
                  }}
                >
                  <i className="fa-solid fa-chart-pie" aria-hidden />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      {healthNote ? <p className="si-tai__warn">{healthNote}</p> : null}

      {step === 1 ? (
        <TrainingDataPanel
          classes={samplesApi.classes}
          activeClassId={samplesApi.activeClassId}
          onActiveClassChange={samplesApi.setActiveClassId}
          onAddClass={() => samplesApi.addClass()}
          onRemoveClass={samplesApi.removeClass}
          counts={samplesApi.classCounts}
          samples={samplesApi.samples}
          selectedSampleId={samplesApi.selectedSampleId}
          onSelectSample={samplesApi.setSelectedSampleId}
          onChangeSampleClass={samplesApi.changeSampleClass}
          onDeleteSample={samplesApi.removeSample}
          drawTool={samplesApi.drawTool}
          onDrawToolChange={onDrawToolChange}
          digitizing={digitizing}
          onDigitizingChange={onDigitizingChange}
          onExportGeojson={samplesApi.exportGeojson}
          onExportGpkg={samplesApi.exportGpkgCompanion}
          onExportCsv={samplesApi.exportCsv}
          onSaveSamples={samplesApi.saveSamples}
          onImportSamplesFile={samplesApi.importSamplesFromFile}
          onZoomToLiveSamples={onZoomToLiveSamples}
          disabled={trainBusy || inferBusy}
        />
      ) : null}

      {step === 2 ? (
        <ModelTrainingPanel
          sampleCount={samplesApi.samples.length}
          classCount={samplesApi.distinctClassCount}
          modelId={trainModelId}
          onModelIdChange={handleTrainModelIdChange}
          analysisImagery={analysisImagery}
          onAnalysisImageryChange={handleAnalysisImageryChange}
          epochs={epochs}
          onEpochsChange={setEpochs}
          batchSize={batchSize}
          onBatchSizeChange={setBatchSize}
          learningRate={learningRate}
          onLearningRateChange={setLearningRate}
          valSplit={valSplit}
          onValSplitChange={setValSplit}
          args={inferArgs}
          onArgsChange={setInferArgs}
          busy={trainBusy}
          job={trainJob}
          error={trainError}
          onTrain={() => void handleTrain()}
          onCancel={handleCancelTrain}
          canTrain={!trainDisabledReason}
          trainDisabledReason={trainDisabledReason}
        />
      ) : null}

      {step === 3 ? (
        <ModelValidationPanel
          job={trainJob}
          onOpenQuickDashboard={
            mapContainerRef ? () => setValidationDashOpen(true) : undefined
          }
        />
      ) : null}
      {mapContainerRef ? (
        <ValidationQuickDashboard
          open={validationDashOpen}
          onClose={() => setValidationDashOpen(false)}
          mapContainerRef={mapContainerRef}
          job={trainJob}
        />
      ) : null}

      {step === 4 ? (
        <>
          <InferencePanel
            modelId={modelId}
            modelLabel={modelLabel}
            confidence={confidence}
            onConfidenceChange={setConfidence}
            outputType={outputType}
            onOutputTypeChange={handleOutputTypeChange}
            imagerySource={imagerySource}
            onImagerySourceChange={handleImagerySourceChange}
            uploadedFileName={inferUploaded?.name ?? null}
            onUploadImageryFile={file => void uploadInferImagery(file)}
            onClearUploadedImagery={() => setInferUploaded(null)}
            busy={inferBusy}
            error={inferError}
            progress={inferProgress}
            stage={inferStage}
            onRun={() => void handleInfer()}
            canRun={
              (isParcelExtractMode(outputType) || Boolean(modelId)) &&
              (!isInferenceFileImagery(imagerySource) || Boolean(inferUploaded?.dataUrl))
            }
            areaLabel={inferAreaLabel}
            staleResults={staleResults}
            onClearStaleResults={onInferenceRemove}
          />
          {inferenceLayerId && inferenceLayerName ? (
            <InferenceResults
              layerName={inferenceLayerName}
              visible={inferenceVisible}
              opacity={inferenceOpacity}
              featureCount={inferenceFeatureCount}
              onToggle={onInferenceToggle}
              onOpacityChange={onInferenceOpacity}
              onZoomTo={onInferenceZoom}
              onRemove={onInferenceRemove}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
