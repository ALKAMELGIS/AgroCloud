import { TrainingProgress } from './TrainingProgress'
import { TrainingModelSelector } from './TrainingModelSelector'
import { InferenceArgumentsPanel } from './InferenceArgumentsPanel'
import type { TrainingJobStatus } from '../../../../lib/trainingAi/trainingAiClient'
import type { AnalysisImageryKind } from '../../../../lib/trainingAi/modelRegistry'
import { getTrainingModelById, isTrainModelPickerEntry } from '../../../../lib/trainingAi/modelRegistry'
import type { InferenceArguments } from '../../../../lib/trainingAi/inferenceArguments'

export type ModelTrainingPanelProps = {
  sampleCount: number
  classCount: number
  modelId: string
  onModelIdChange: (id: string) => void
  analysisImagery: AnalysisImageryKind
  onAnalysisImageryChange: (v: AnalysisImageryKind) => void
  epochs: number
  onEpochsChange: (v: number) => void
  batchSize: number
  onBatchSizeChange: (v: number) => void
  learningRate: number
  onLearningRateChange: (v: number) => void
  valSplit: number
  onValSplitChange: (v: number) => void
  args: InferenceArguments
  onArgsChange: (v: InferenceArguments) => void
  busy: boolean
  job: TrainingJobStatus | null
  error: string | null
  onTrain: () => void
  onCancel: () => void
  canTrain: boolean
  trainDisabledReason: string | null
}

export function ModelTrainingPanel(props: ModelTrainingPanelProps) {
  const model = getTrainingModelById(props.modelId)
  const bands = model?.requiredBands?.length ? model.requiredBands : ['R', 'G', 'B']

  return (
    <div className="si-tai__section">
      <label className="si-tai__row">
        <span className="si-tai__label">Dataset</span>
        <input
          className="si-tai__input"
          readOnly
          value={`Training Samples (${props.sampleCount} samples · ${props.classCount} classes)`}
          title="Polygons drawn in Samples step — used as ground truth for fine-tune"
        />
      </label>

      <TrainingModelSelector
        modelId={props.modelId}
        onModelIdChange={props.onModelIdChange}
        imagery={props.analysisImagery}
        onImageryChange={props.onAnalysisImageryChange}
        disabled={props.busy}
        trainableOnly
      />

      {model && !model.trainableOnAgroCloud && isTrainModelPickerEntry(model) ? (
        <p className="si-tai__hint">
          {model.name} Infer uses the pretrained AgroCloud engine. TRAIN MODEL fine-tunes{' '}
          <strong>SegFormer-B2</strong> on your samples (epochs → Results dashboard).
        </p>
      ) : null}

      <div className="si-tai__row">
        <span className="si-tai__label">Model bands</span>
        <div className="si-tai__counts">
          {bands.map(b => (
            <span key={b} className="si-tai__chip">
              {b}
            </span>
          ))}
        </div>
      </div>

      <div className="si-tai__metrics">
        <label className="si-tai__row">
          <span className="si-tai__label">Epochs</span>
          <input
            className="si-tai__input"
            type="number"
            min={1}
            max={100}
            value={props.epochs}
            disabled={props.busy}
            onChange={e => props.onEpochsChange(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className="si-tai__row">
          <span className="si-tai__label">Batch Size</span>
          <input
            className="si-tai__input"
            type="number"
            min={1}
            max={16}
            value={props.batchSize}
            disabled={props.busy}
            onChange={e => props.onBatchSizeChange(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className="si-tai__row">
          <span className="si-tai__label">Learning Rate</span>
          <input
            className="si-tai__input"
            type="number"
            step="0.00001"
            min={0.000001}
            value={props.learningRate}
            disabled={props.busy}
            onChange={e => props.onLearningRateChange(Number(e.target.value) || 6e-5)}
          />
        </label>
        <label className="si-tai__row">
          <span className="si-tai__label">Validation Split</span>
          <input
            className="si-tai__input"
            type="number"
            step="0.05"
            min={0.1}
            max={0.5}
            value={props.valSplit}
            disabled={props.busy}
            onChange={e =>
              props.onValSplitChange(Math.min(0.5, Math.max(0.1, Number(e.target.value) || 0.2)))
            }
          />
        </label>
      </div>

      <InferenceArgumentsPanel
        value={props.args}
        onChange={props.onArgsChange}
        disabled={props.busy}
      />

      {props.trainDisabledReason && !props.busy ? (
        <p className="si-tai__hint">{props.trainDisabledReason}</p>
      ) : null}
      {props.error ? <p className="si-tai__error">{props.error}</p> : null}
      <div className="si-tai__toolbar">
        <button
          type="button"
          className="si-tai__btn si-tai__btn--primary"
          disabled={!props.canTrain || props.busy}
          onClick={props.onTrain}
        >
          {props.busy ? 'Training…' : 'TRAIN MODEL'}
        </button>
        {props.busy ? (
          <button type="button" className="si-tai__btn" onClick={props.onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      <TrainingProgress job={props.job} busy={props.busy} />
    </div>
  )
}
