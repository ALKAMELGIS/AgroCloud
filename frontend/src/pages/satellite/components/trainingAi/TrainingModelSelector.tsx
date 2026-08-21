import { useEffect, useMemo } from 'react'
import {
  filterModels,
  recommendModelsForImagery,
} from '../../../../lib/trainingAi/modelCompatibility'
import {
  ANALYSIS_IMAGERY_OPTIONS,
  DEFAULT_TRAINING_MODEL_ID,
  TRAINING_MODEL_REGISTRY,
  getTrainingModelById,
  isTrainModelPickerEntry,
  type AnalysisImageryKind,
} from '../../../../lib/trainingAi/modelRegistry'

export type TrainingModelSelectorProps = {
  modelId: string
  onModelIdChange: (id: string) => void
  imagery: AnalysisImageryKind
  onImageryChange: (v: AnalysisImageryKind) => void
  disabled?: boolean
  /** When true, only models that fine-tune on AgroCloud (:8095). Default false — show full registry. */
  trainableOnly?: boolean
}

export function TrainingModelSelector(props: TrainingModelSelectorProps) {
  const trainableOnly = props.trainableOnly === true

  const recommendedIds = useMemo(
    () => new Set(recommendModelsForImagery(props.imagery, 6).map(m => m.id)),
    [props.imagery],
  )

  const models = useMemo(() => {
    // Train step: always expose every picker model (SegFormer + Delineate)
    // regardless of imagery compatibility — TRAIN resolves to a SegFormer encoder.
    const list = trainableOnly
      ? TRAINING_MODEL_REGISTRY.filter(isTrainModelPickerEntry)
      : filterModels({ imagery: props.imagery })
    return [...list].sort((a, b) => {
      const ar = recommendedIds.has(a.id) ? 0 : 1
      const br = recommendedIds.has(b.id) ? 0 : 1
      if (ar !== br) return ar - br
      // Fine-tune SegFormers first, then field engines, then alpha.
      const at = a.trainableOnAgroCloud ? 0 : 1
      const bt = b.trainableOnAgroCloud ? 0 : 1
      if (at !== bt) return at - bt
      if (a.id === DEFAULT_TRAINING_MODEL_ID) return -1
      if (b.id === DEFAULT_TRAINING_MODEL_ID) return 1
      return a.name.localeCompare(b.name)
    })
  }, [props.imagery, recommendedIds, trainableOnly])

  // Keep selection valid when imagery / filter changes.
  useEffect(() => {
    if (!models.length) return
    const cur = getTrainingModelById(props.modelId)
    if (cur && (!trainableOnly || isTrainModelPickerEntry(cur)) && models.some(m => m.id === cur.id)) {
      return
    }
    const next =
      models.find(m => m.id === DEFAULT_TRAINING_MODEL_ID)?.id ||
      models[0]?.id ||
      DEFAULT_TRAINING_MODEL_ID
    if (next !== props.modelId) props.onModelIdChange(next)
  }, [models, props.modelId, props.onModelIdChange, trainableOnly])

  const selectedId = models.some(m => m.id === props.modelId)
    ? props.modelId
    : models.find(m => m.id === DEFAULT_TRAINING_MODEL_ID)?.id ||
      models[0]?.id ||
      props.modelId

  return (
    <div className="si-tai-ms">
      <label className="si-tai__row">
        <span className="si-tai__label">AI input imagery</span>
        <select
          className="si-tai__input si-tai__select si-tai-ms__select"
          value={props.imagery}
          disabled={props.disabled}
          aria-label="AI input imagery"
          onChange={e => props.onImageryChange(e.target.value as AnalysisImageryKind)}
        >
          {ANALYSIS_IMAGERY_OPTIONS.map(o => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="si-tai__row">
        <span className="si-tai__label">Model</span>
        <select
          className="si-tai__input si-tai__select si-tai-ms__select"
          value={selectedId}
          disabled={props.disabled || models.length === 0}
          aria-label="Training model"
          title={
            trainableOnly
              ? 'SegFormer / Delineate — TRAIN fine-tunes on the AgroCloud API'
              : 'Full Training AI model registry'
          }
          onChange={e => props.onModelIdChange(e.target.value)}
        >
          {models.map(m => (
            <option key={m.id} value={m.id}>
              {recommendedIds.has(m.id) ? `★ ${m.name}` : m.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
