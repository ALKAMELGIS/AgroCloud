import type { ReactNode } from 'react'
import {
  ARGUMENT_HELP,
  DEFAULT_INFERENCE_ARGUMENTS,
  NMS_FIELD_HELP,
  TILE_SIZE_CHOICES,
  maxPaddingForTile,
  normalizeInferenceArguments,
  summarizeInferenceArguments,
  type InferenceArguments,
  type MergePolicy,
} from '../../../../lib/trainingAi/inferenceArguments'

export type InferenceArgumentsPanelProps = {
  value: InferenceArguments
  onChange: (next: InferenceArguments) => void
  disabled?: boolean
  /** Section starts expanded when the user has changed something. */
  defaultOpen?: boolean
}

function ArgRow(props: { name: string; help: string; children: ReactNode }) {
  return (
    <label className="si-tai__arg-row" title={props.help}>
      <span className="si-tai__arg-name">{props.name}</span>
      <span className="si-tai__arg-value">{props.children}</span>
    </label>
  )
}

export function InferenceArgumentsPanel({
  value,
  onChange,
  disabled = false,
  defaultOpen = false,
}: InferenceArgumentsPanelProps) {
  const set = (patch: Partial<InferenceArguments>) =>
    onChange(normalizeInferenceArguments({ ...value, ...patch }))
  const setNms = (patch: Partial<InferenceArguments['nms']>) =>
    onChange(normalizeInferenceArguments({ ...value, nms: { ...value.nms, ...patch } }))

  const padMax = maxPaddingForTile(value.tileSize)
  const badge = summarizeInferenceArguments(value)

  return (
    <details className="si-tai__args" open={defaultOpen}>
      <summary className="si-tai__args-summary" title={badge}>
        <span>Arguments</span>
        <em>{badge}</em>
      </summary>

      <p className="si-tai__hint">Change the values of the arguments if required.</p>

      <div className="si-tai__args-grid">
        <div className="si-tai__arg-head">
          <span>Name</span>
          <span>Value</span>
        </div>

        <ArgRow name="padding" help={ARGUMENT_HELP.padding}>
          <input
            className="si-tai__input"
            type="number"
            min={0}
            max={padMax}
            step={4}
            value={value.padding}
            disabled={disabled}
            onChange={e => set({ padding: Number(e.target.value) })}
          />
        </ArgRow>

        <ArgRow name="batch_size" help={ARGUMENT_HELP.batchSize}>
          <input
            className="si-tai__input"
            type="number"
            min={1}
            max={64}
            value={value.batchSize}
            disabled={disabled}
            onChange={e => set({ batchSize: Number(e.target.value) })}
          />
        </ArgRow>

        <ArgRow name="return_bboxes" help={ARGUMENT_HELP.returnBboxes}>
          <select
            className="si-tai__input si-tai__select"
            value={value.returnBboxes ? 'true' : 'false'}
            disabled={disabled}
            onChange={e => set({ returnBboxes: e.target.value === 'true' })}
          >
            <option value="false">False</option>
            <option value="true">True</option>
          </select>
        </ArgRow>

        <ArgRow name="merge_policy" help={ARGUMENT_HELP.mergePolicy}>
          <select
            className="si-tai__input si-tai__select"
            value={value.mergePolicy}
            disabled={disabled || !value.testTimeAugmentation}
            onChange={e => set({ mergePolicy: e.target.value as MergePolicy })}
          >
            <option value="mean">mean</option>
            <option value="nms">nms</option>
          </select>
        </ArgRow>

        <ArgRow name="tile_size" help={ARGUMENT_HELP.tileSize}>
          <select
            className="si-tai__input si-tai__select"
            value={String(value.tileSize)}
            disabled={disabled}
            onChange={e => set({ tileSize: Number(e.target.value) })}
          >
            {TILE_SIZE_CHOICES.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </ArgRow>

        <ArgRow name="radiometric_offset_correction" help={ARGUMENT_HELP.radiometricOffsetCorrection}>
          <select
            className="si-tai__input si-tai__select"
            value={value.radiometricOffsetCorrection ? 'true' : 'false'}
            disabled={disabled}
            onChange={e => set({ radiometricOffsetCorrection: e.target.value === 'true' })}
          >
            <option value="false">False</option>
            <option value="true">True</option>
          </select>
        </ArgRow>

        <ArgRow name="threshold" help={ARGUMENT_HELP.threshold}>
          <input
            className="si-tai__input"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={value.threshold}
            disabled={disabled}
            onChange={e => set({ threshold: Number(e.target.value) })}
          />
        </ArgRow>

        <ArgRow name="test_time_augmentation" help={ARGUMENT_HELP.testTimeAugmentation}>
          <select
            className="si-tai__input si-tai__select"
            value={value.testTimeAugmentation ? 'true' : 'false'}
            disabled={disabled}
            onChange={e => set({ testTimeAugmentation: e.target.value === 'true' })}
          >
            <option value="false">False</option>
            <option value="true">True</option>
          </select>
        </ArgRow>
      </div>

      <label className="si-tai__args-check" title={ARGUMENT_HELP.nms}>
        <input
          type="checkbox"
          checked={value.nms.enabled}
          disabled={disabled}
          onChange={e => setNms({ enabled: e.target.checked })}
        />
        Non Maximum Suppression
      </label>

      {value.nms.enabled ? (
        <div className="si-tai__args-nms">
          <label className="si-tai__row" title={NMS_FIELD_HELP.confidenceScoreField}>
            <span className="si-tai__label">Confidence Score Field</span>
            <input
              className="si-tai__input"
              value={value.nms.confidenceScoreField}
              disabled={disabled}
              onChange={e => setNms({ confidenceScoreField: e.target.value })}
            />
          </label>
          <label className="si-tai__row" title={NMS_FIELD_HELP.classValueField}>
            <span className="si-tai__label">Class Value Field</span>
            <input
              className="si-tai__input"
              value={value.nms.classValueField}
              disabled={disabled}
              onChange={e => setNms({ classValueField: e.target.value })}
            />
          </label>
          <label className="si-tai__row si-tai__row--h" title={NMS_FIELD_HELP.maxOverlapRatio}>
            <span className="si-tai__label">Max Overlap Ratio</span>
            <input
              className="si-tai__input si-tai__input--narrow"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={value.nms.maxOverlapRatio}
              disabled={disabled}
              onChange={e => setNms({ maxOverlapRatio: Number(e.target.value) })}
            />
          </label>
        </div>
      ) : null}

      <button
        type="button"
        className="si-tai__btn si-tai__args-reset"
        disabled={disabled}
        onClick={() => onChange({ ...DEFAULT_INFERENCE_ARGUMENTS })}
      >
        Reset arguments
      </button>
    </details>
  )
}
