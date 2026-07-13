import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AI_DL_BACKBONE_OPTIONS,
  AI_DL_BATCH_SIZE_OPTIONS,
  AI_DL_OBJECT_DETECTION_ARCHS,
  AI_DL_TASK_OPTIONS,
  analyzeTrainingDataFromGeoJson,
  analyzeTrainingDataFromPath,
  architecturesForTask,
  defaultAiDlTrainConfig,
  defaultArgsForArchitecture,
  inferTrainingDataKind,
  loadAiDlModelLibrary,
  saveAiDlModelLibrary,
  validateAiDlTrainConfig,
  type AiDlDatasetInfo,
  type AiDlModelLibraryEntry,
  type AiDlTrainConfig,
  type AiDlTrainJob,
} from '../../../../lib/aiDetection/siAiDlTrainConfig'
import './SiAiDetectionGisPanel.css'

function GpLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="si-ai-dl-gp__label">
      {required ? <span className="si-ai-dl-gp__req" aria-hidden>*</span> : null}
      {children}
    </span>
  )
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="si-ai-dl-gp__section">
      <button type="button" className="si-ai-dl-gp__section-toggle" onClick={() => setOpen(v => !v)}>
        <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'}`} aria-hidden />
        {title}
      </button>
      {open ? <div className="si-ai-dl-gp__section-body">{children}</div> : null}
    </section>
  )
}

export type SiAiDlTrainModelPanelProps = {
  disabled?: boolean
}

export function SiAiDlTrainModelPanel({ disabled = false }: SiAiDlTrainModelPanelProps) {
  const [config, setConfig] = useState<AiDlTrainConfig>(() => defaultAiDlTrainConfig())
  const [dataset, setDataset] = useState<AiDlDatasetInfo | null>(null)
  const [job, setJob] = useState<AiDlTrainJob | null>(null)
  const [library, setLibrary] = useState<AiDlModelLibraryEntry[]>(() => loadAiDlModelLibrary())
  const [modelParamsOpen, setModelParamsOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const trainDataInputRef = useRef<HTMLInputElement>(null)
  const outputInputRef = useRef<HTMLInputElement>(null)
  const pretrainedInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  const patch = useCallback((p: Partial<AiDlTrainConfig>) => {
    setConfig(prev => ({ ...prev, ...p }))
  }, [])

  const archOptions = useMemo(() => {
    const ids = architecturesForTask(config.taskType)
    return AI_DL_OBJECT_DETECTION_ARCHS.filter(a => ids.includes(a.id))
  }, [config.taskType])

  useEffect(() => {
    if (!archOptions.some(a => a.id === config.architecture)) {
      const next = archOptions[0]?.id ?? 'ssd'
      patch({ architecture: next, modelArgs: defaultArgsForArchitecture(next) })
    }
  }, [archOptions, config.architecture, patch])

  const validation = useMemo(() => validateAiDlTrainConfig(config, dataset), [config, dataset])

  const applyTrainingPath = useCallback((path: string, kind = inferTrainingDataKind(path)) => {
    patch({ trainingDataPath: path, trainingDataKind: kind })
    setDataset(analyzeTrainingDataFromPath(path, kind))
    setModelParamsOpen(true)
  }, [patch])

  const onTrainingDataFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const kind = inferTrainingDataKind(file.name)
      if (kind === 'training-samples' && (file.name.endsWith('.json') || file.name.endsWith('.geojson'))) {
        try {
          const text = await file.text()
          const parsed = JSON.parse(text) as unknown
          setDataset(analyzeTrainingDataFromGeoJson(parsed, file.name))
        } catch {
          setDataset(analyzeTrainingDataFromPath(file.name, kind))
        }
      } else {
        setDataset(analyzeTrainingDataFromPath(file.name, kind))
      }
      patch({ trainingDataPath: file.name, trainingDataKind: kind })
      setModelParamsOpen(true)
      e.target.value = ''
    },
    [patch],
  )

  const onArchitectureChange = useCallback(
    (arch: typeof config.architecture) => {
      patch({ architecture: arch, modelArgs: defaultArgsForArchitecture(arch) })
    },
    [patch],
  )

  const updateArg = useCallback((id: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      modelArgs: prev.modelArgs.map(row => (row.id === id ? { ...row, value } : row)),
    }))
  }, [])

  const addArg = useCallback(() => {
    const id = `arg-${Date.now()}`
    setConfig(prev => ({
      ...prev,
      modelArgs: [...prev.modelArgs, { id, name: 'param', value: '' }],
    }))
  }, [])

  const removeArg = useCallback((id: string) => {
    setConfig(prev => ({
      ...prev,
      modelArgs: prev.modelArgs.filter(row => row.id !== id),
    }))
  }, [])

  const persistLibrary = useCallback((entries: AiDlModelLibraryEntry[]) => {
    setLibrary(entries)
    saveAiDlModelLibrary(entries)
  }, [])

  const runTraining = useCallback(() => {
    if (!validation.valid || disabled) return
    abortRef.current = false
    const maxEpochs = config.maxEpochs
    setJob({
      status: 'preparing',
      phase: 'Preparing Data…',
      phasePct: 0,
      epoch: 0,
      maxEpochs,
      trainLoss: 0,
      valLoss: 0,
      accuracy: 0,
      message: 'Validating dataset and preparing chips…',
    })

    const phases = [
      { label: 'Validating dataset', pct: 15 },
      { label: 'Preparing training chips', pct: 35 },
      { label: 'Splitting train / validation', pct: 55 },
      { label: 'Loading backbone model', pct: 75 },
      { label: 'Preparing Data…', pct: 100 },
    ]

    let phaseIdx = 0
    const prepTimer = window.setInterval(() => {
      if (abortRef.current) return
      const phase = phases[phaseIdx]
      if (!phase) {
        window.clearInterval(prepTimer)
        let epoch = 0
        const trainTimer = window.setInterval(() => {
          if (abortRef.current) {
            window.clearInterval(trainTimer)
            return
          }
          epoch += 1
          const progress = epoch / maxEpochs
          const trainLoss = Math.max(0.008, 0.42 * (1 - progress) + Math.random() * 0.02)
          const valLoss = Math.max(0.01, 0.48 * (1 - progress) + Math.random() * 0.025)
          const accuracy = Math.min(99.2, 62 + progress * 32 + Math.random() * 2)
          if (epoch >= maxEpochs) {
            window.clearInterval(trainTimer)
            const stem = config.outputModelPath.replace(/\.[^.]+$/, '') || 'Model'
            const entry: AiDlModelLibraryEntry = {
              id: `mdl-${Date.now()}`,
              name: stem.split(/[/\\]/).pop() || 'Model',
              framework: config.architecture === 'yolo' ? 'PyTorch' : 'ArcGIS Learn',
              date: new Date().toISOString().slice(0, 10),
              accuracy: Math.round(accuracy * 10) / 10,
              classes: dataset?.classes ?? [],
              inputSize: dataset?.imageSize ?? '224 x 224',
              outputPath: `${stem}.dlpk`,
              taskType: config.taskType,
              architecture: config.architecture,
            }
            persistLibrary([entry, ...library.filter(m => m.id !== entry.id)].slice(0, 24))
            setJob({
              status: 'done',
              phase: 'Complete',
              phasePct: 100,
              epoch: maxEpochs,
              maxEpochs,
              trainLoss,
              valLoss,
              accuracy,
              message: 'Training complete — model package generated.',
              outputDlpk: `${stem}.dlpk`,
              outputEmd: `${stem}.emd`,
            })
            return
          }
          setJob({
            status: 'training',
            phase: 'Training',
            phasePct: Math.round(progress * 100),
            epoch,
            maxEpochs,
            trainLoss,
            valLoss,
            accuracy,
            message: `Epoch ${epoch} / ${maxEpochs}`,
          })
        }, 420)
        return
      }
      setJob(prev =>
        prev
          ? {
              ...prev,
              status: 'preparing',
              phase: phase.label,
              phasePct: phase.pct,
              message: phase.label,
            }
          : prev,
      )
      phaseIdx += 1
    }, 520)
  }, [config, dataset, disabled, library, persistLibrary, validation.valid])

  const cancelTraining = useCallback(() => {
    abortRef.current = true
    setJob(prev =>
      prev && prev.status !== 'done'
        ? { ...prev, status: 'cancelled', message: 'Cancelled by user.' }
        : prev,
    )
  }, [])

  const busy = job != null && (job.status === 'preparing' || job.status === 'training')

  return (
    <div className="si-ai-dl-gp">
      <h3 className="si-ai-dl-gp__tool-title">Train Deep Learning Model</h3>
      <p className="si-ai-dl-gp__tool-hint">
        ArcGIS-style training — load samples, tune parameters, and export a deep learning package.
      </p>

      <div className="si-ai-dl-gp__field">
        <GpLabel required>Input Training Data</GpLabel>
        <div className="si-ai-dl-gp__row">
          <input
            className="si-ai-dl-gp__input"
            value={config.trainingDataPath}
            placeholder="Image chips · raster · samples · folder"
            disabled={disabled || busy}
            onChange={e => applyTrainingPath(e.target.value)}
          />
          <button
            type="button"
            className="si-ai-dl-gp__browse"
            title="Browse training data"
            disabled={disabled || busy}
            onClick={() => trainDataInputRef.current?.click()}
          >
            <i className="fa-solid fa-folder-open" aria-hidden />
          </button>
        </div>
        <input
          ref={trainDataInputRef}
          type="file"
          className="si-ai-dl-gp__hidden-input"
          accept=".geojson,.json,.zip,.tif,.tiff,.jp2,.shp,.gpkg,.dlpk"
          onChange={onTrainingDataFile}
        />
      </div>

      <div className="si-ai-dl-gp__field">
        <GpLabel required>Output Model</GpLabel>
        <div className="si-ai-dl-gp__row">
          <input
            className="si-ai-dl-gp__input"
            value={config.outputModelPath}
            placeholder=".dlpk · .emd · .pth"
            disabled={disabled || busy}
            onChange={e => patch({ outputModelPath: e.target.value })}
          />
          <button
            type="button"
            className="si-ai-dl-gp__browse"
            title="Choose output path"
            disabled={disabled || busy}
            onClick={() => outputInputRef.current?.click()}
          >
            <i className="fa-solid fa-folder-open" aria-hidden />
          </button>
        </div>
        <input
          ref={outputInputRef}
          type="file"
          className="si-ai-dl-gp__hidden-input"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) patch({ outputModelPath: file.name })
            e.target.value = ''
          }}
        />
      </div>

      <div className="si-ai-dl-gp__field">
        <GpLabel required>Model Type</GpLabel>
        <select
          className="si-ai-dl-gp__select"
          value={config.taskType}
          disabled={disabled || busy}
          onChange={e => patch({ taskType: e.target.value as AiDlTrainConfig['taskType'] })}
        >
          {AI_DL_TASK_OPTIONS.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {dataset ? (
        <CollapsibleSection title="Dataset Information" defaultOpen>
          <dl className="si-ai-dl-gp__meta">
            <dt>Number of Images</dt>
            <dd>{dataset.imageCount.toLocaleString()}</dd>
            <dt>Classes</dt>
            <dd>
              <div className="si-ai-dl-gp__class-pills">
                {dataset.classes.map(c => (
                  <span key={c} className="si-ai-dl-gp__class-pill">
                    {c}
                  </span>
                ))}
              </div>
            </dd>
            <dt>Image Size</dt>
            <dd>{dataset.imageSize}</dd>
            <dt>Bands</dt>
            <dd>{dataset.bands}</dd>
            <dt>Spatial Resolution</dt>
            <dd>{dataset.spatialResolution}</dd>
            <dt>Training Samples</dt>
            <dd>{dataset.trainingSamples ? 'Available' : 'Not detected'}</dd>
          </dl>
        </CollapsibleSection>
      ) : null}

      {dataset ? (
        <section className="si-ai-dl-gp__section">
          <button
            type="button"
            className="si-ai-dl-gp__section-toggle"
            onClick={() => setModelParamsOpen(v => !v)}
          >
            <i className={`fa-solid fa-chevron-${modelParamsOpen ? 'down' : 'right'}`} aria-hidden />
            Model Parameters
          </button>
          {modelParamsOpen ? (
            <div className="si-ai-dl-gp__section-body">
              <div className="si-ai-dl-gp__field">
                <GpLabel>Architecture</GpLabel>
                <select
                  className="si-ai-dl-gp__select"
                  value={config.architecture}
                  disabled={disabled || busy}
                  onChange={e => onArchitectureChange(e.target.value as typeof config.architecture)}
                >
                  {archOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="si-ai-dl-gp__field">
                <GpLabel>Batch Size</GpLabel>
                <select
                  className="si-ai-dl-gp__select"
                  value={config.batchSize}
                  disabled={disabled || busy}
                  onChange={e => patch({ batchSize: Number(e.target.value) })}
                >
                  {AI_DL_BATCH_SIZE_OPTIONS.map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div className="si-ai-dl-gp__field">
                <GpLabel>Model Arguments</GpLabel>
                <div className="si-ai-dl-gp__arg-head">
                  <span>Name</span>
                  <span>Value</span>
                  <span />
                </div>
                {config.modelArgs.map(row => (
                  <div key={row.id} className="si-ai-dl-gp__arg-row">
                    <input
                      className="si-ai-dl-gp__input"
                      value={row.name}
                      disabled={disabled || busy}
                      onChange={e =>
                        setConfig(prev => ({
                          ...prev,
                          modelArgs: prev.modelArgs.map(r =>
                            r.id === row.id ? { ...r, name: e.target.value } : r,
                          ),
                        }))
                      }
                    />
                    <input
                      className="si-ai-dl-gp__input"
                      value={row.value}
                      disabled={disabled || busy}
                      onChange={e => updateArg(row.id, e.target.value)}
                    />
                    <button
                      type="button"
                      className="si-ai-dl-gp__mini-btn si-ai-dl-gp__mini-btn--danger"
                      disabled={disabled || busy}
                      onClick={() => removeArg(row.id)}
                      aria-label="Remove argument"
                    >
                      <i className="fa-solid fa-minus" aria-hidden />
                    </button>
                  </div>
                ))}
                <div className="si-ai-dl-gp__arg-actions">
                  <button type="button" className="si-ai-dl-gp__mini-btn" disabled={disabled || busy} onClick={addArg}>
                    Add parameter
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {dataset ? (
        <section className="si-ai-dl-gp__section">
          <button type="button" className="si-ai-dl-gp__section-toggle" onClick={() => setAdvancedOpen(v => !v)}>
            <i className={`fa-solid fa-chevron-${advancedOpen ? 'down' : 'right'}`} aria-hidden />
            Advanced
          </button>
          {advancedOpen ? (
            <div className="si-ai-dl-gp__section-body">
              <div className="si-ai-dl-gp__field">
                <GpLabel>Maximum Epochs</GpLabel>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="si-ai-dl-gp__input"
                  value={config.maxEpochs}
                  disabled={disabled || busy}
                  onChange={e => patch({ maxEpochs: Math.min(500, Math.max(1, Number(e.target.value) || 50)) })}
                />
              </div>
              <div className="si-ai-dl-gp__field">
                <GpLabel>Learning Rate</GpLabel>
                <input
                  className="si-ai-dl-gp__input"
                  value={config.learningRate}
                  placeholder="Auto or 0.001"
                  disabled={disabled || busy}
                  onChange={e => patch({ learningRate: e.target.value })}
                />
              </div>
              <div className="si-ai-dl-gp__field">
                <GpLabel>Backbone Model</GpLabel>
                <select
                  className="si-ai-dl-gp__select"
                  value={config.backbone}
                  disabled={disabled || busy}
                  onChange={e => patch({ backbone: e.target.value as typeof config.backbone })}
                >
                  {AI_DL_BACKBONE_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="si-ai-dl-gp__field">
                <GpLabel>Pre-trained Model</GpLabel>
                <div className="si-ai-dl-gp__row">
                  <input
                    className="si-ai-dl-gp__input"
                    value={config.pretrainedModelPath}
                    placeholder=".pth · .h5 · .pt · .onnx"
                    disabled={disabled || busy}
                    onChange={e => patch({ pretrainedModelPath: e.target.value })}
                  />
                  <button
                    type="button"
                    className="si-ai-dl-gp__browse"
                    title="Browse pretrained weights"
                    disabled={disabled || busy}
                    onClick={() => pretrainedInputRef.current?.click()}
                  >
                    <i className="fa-solid fa-folder-open" aria-hidden />
                  </button>
                </div>
                <input
                  ref={pretrainedInputRef}
                  type="file"
                  className="si-ai-dl-gp__hidden-input"
                  accept=".pth,.h5,.pt,.onnx"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) patch({ pretrainedModelPath: file.name })
                    e.target.value = ''
                  }}
                />
              </div>
              <div className="si-ai-dl-gp__field">
                <GpLabel>Validation Percentage</GpLabel>
                <div className="si-ai-dl-gp__slider-row">
                  <input
                    type="range"
                    min={5}
                    max={50}
                    value={config.validationPct}
                    disabled={disabled || busy}
                    onChange={e => patch({ validationPct: Number(e.target.value) })}
                  />
                  <span>{config.validationPct}%</span>
                </div>
              </div>
              <label className="si-ai-dl-gp__check">
                <input
                  type="checkbox"
                  checked={config.stopWhenImprovingStalls}
                  disabled={disabled || busy}
                  onChange={e => patch({ stopWhenImprovingStalls: e.target.checked })}
                />
                Stop When Model Stops Improving
              </label>
              <label className="si-ai-dl-gp__check">
                <input
                  type="checkbox"
                  checked={config.freezeModel}
                  disabled={disabled || busy}
                  onChange={e => patch({ freezeModel: e.target.checked })}
                />
                Freeze Model
              </label>
            </div>
          ) : null}
        </section>
      ) : null}

      {job && job.status !== 'idle' ? (
        <div className="si-ai-dl-gp__progress">
          <div className="si-ai-dl-gp__progress-label">{job.message}</div>
          <div className="si-ai-dl-gp__progress-track">
            <div className="si-ai-dl-gp__progress-fill" style={{ width: `${job.phasePct}%` }} />
          </div>
          {job.status === 'training' || job.status === 'done' ? (
            <div className="si-ai-dl-gp__metrics">
              <div className="si-ai-dl-gp__metric">
                <span>Epoch</span>
                <strong>
                  {job.epoch} / {job.maxEpochs}
                </strong>
              </div>
              <div className="si-ai-dl-gp__metric">
                <span>Training Loss</span>
                <strong>{job.trainLoss.toFixed(3)}</strong>
              </div>
              <div className="si-ai-dl-gp__metric">
                <span>Validation Loss</span>
                <strong>{job.valLoss.toFixed(3)}</strong>
              </div>
              <div className="si-ai-dl-gp__metric">
                <span>Accuracy</span>
                <strong>{job.accuracy.toFixed(0)}%</strong>
              </div>
            </div>
          ) : null}
          {job.status === 'done' && job.outputDlpk ? (
            <p className="si-ai-dl-gp__status is-done">
              Output: {job.outputDlpk}, {job.outputEmd} — training report ready.
            </p>
          ) : null}
        </div>
      ) : null}

      {library.length ? (
        <CollapsibleSection title="AI Model Management" defaultOpen={false}>
          <div className="si-ai-dl-gp__library">
            {library.slice(0, 8).map(entry => (
              <div key={entry.id} className="si-ai-dl-gp__library-row">
                <div>
                  <strong>{entry.name}</strong>
                  <span>
                    {entry.framework} · {entry.accuracy}% · {entry.date} · {entry.classes.join(', ')}
                  </span>
                </div>
                <button
                  type="button"
                  className="si-ai-dl-gp__mini-btn"
                  onClick={() => patch({ outputModelPath: entry.outputPath })}
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      ) : null}

      {!validation.valid && config.trainingDataPath ? (
        <p className="si-ai-dl-gp__status is-error">{validation.errors[0]}</p>
      ) : null}

      <div className="si-ai-dl-gp__runbar">
        <button type="button" className="si-ai-dl-gp__run-btn si-ai-dl-gp__run-btn--ghost" title="Reset" onClick={() => {
          abortRef.current = true
          setJob(null)
          setDataset(null)
          setConfig(defaultAiDlTrainConfig())
        }}>
          <i className="fa-solid fa-rotate-left" aria-hidden />
        </button>
        <div className="si-ai-dl-gp__run-actions">
          {busy ? (
            <button type="button" className="si-ai-dl-gp__run-btn si-ai-dl-gp__run-btn--ghost" onClick={cancelTraining}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="si-ai-dl-gp__run-btn"
            disabled={!validation.valid || disabled || busy}
            onClick={runTraining}
          >
            <i className="fa-solid fa-circle-play" aria-hidden />
            Run
          </button>
        </div>
      </div>
    </div>
  )
}
