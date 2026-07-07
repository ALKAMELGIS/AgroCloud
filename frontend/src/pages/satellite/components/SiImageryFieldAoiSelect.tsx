import {
  buildSiImageryFieldAoiOptionGroups,
  isImageryFieldAoiActionKey,
  SI_IMAGERY_DRAW_AOI_ACTION_KEY,
  type ImageryFieldAoiOptionGroups,
} from '../utils/siImageryTimeSeriesAoi';
import { SI_IMAGERY_COMMITTED_AOI_KEY } from '../utils/siImageryTimeSeriesFields';

export type SiImageryFieldAoiSelectProps = {
  groups: ImageryFieldAoiOptionGroups;
  value: string;
  onChange: (fieldKey: string) => void;
  onRequestDrawAoi?: () => void;
  disabled?: boolean;
};

export function SiImageryFieldAoiSelect({
  groups,
  value,
  onChange,
  onRequestDrawAoi,
  disabled,
}: SiImageryFieldAoiSelectProps) {
  const hasFields = groups.fields.length > 0;
  const selectableCount =
    groups.fields.length +
    groups.aoi.filter(o => o.kind !== 'action' && !o.disabled).length;

  return (
    <label className="acp-ts__field acp-ts__field--grow">
      <span>Field / AOI</span>
      <select
        value={value}
        disabled={disabled}
        onChange={e => {
          const key = e.target.value;
          if (key === SI_IMAGERY_DRAW_AOI_ACTION_KEY) {
            onRequestDrawAoi?.();
            return;
          }
          onChange(key);
        }}
      >
        {!hasFields && selectableCount === 0 ? (
          <option value="">No fields or AOI — draw on map</option>
        ) : null}

        {hasFields ? (
          <optgroup label="Fields">
            {groups.fields.map(opt => (
              <option key={opt.fieldKey} value={opt.fieldKey}>
                {opt.displayName}
              </option>
            ))}
          </optgroup>
        ) : null}

        <optgroup label="Area of interest">
          {groups.aoi.map(opt => (
            <option
              key={opt.fieldKey}
              value={opt.fieldKey}
              disabled={opt.disabled}
            >
              {opt.displayName}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

export {
  buildSiImageryFieldAoiOptionGroups,
  isImageryFieldAoiActionKey,
  SI_IMAGERY_COMMITTED_AOI_KEY,
  SI_IMAGERY_DRAW_AOI_ACTION_KEY,
};
