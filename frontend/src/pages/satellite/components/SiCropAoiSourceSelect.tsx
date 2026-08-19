import {
  CROP_AOI_MODE_HINT,
  CROP_AOI_MODE_OPTIONS,
  type CropAoiLayerOption,
  type CropAoiMode,
} from '../../../lib/siCropAoiSource'

export type SiCropAoiSourceSelectProps = {
  aoiMode: CropAoiMode
  onAoiModeChange: (mode: CropAoiMode) => void
  aoiLayerOptions?: CropAoiLayerOption[]
  aoiLayerId?: string
  onAoiLayerIdChange?: (layerId: string) => void
  hasAoi: boolean
  disabled?: boolean
}

/** Crop AI — independent AOI source picker (not shared with FTW / Tree panels). */
export function SiCropAoiSourceSelect(props: SiCropAoiSourceSelectProps) {
  const {
    aoiMode,
    onAoiModeChange,
    aoiLayerOptions = [],
    aoiLayerId = '',
    onAoiLayerIdChange,
    hasAoi,
    disabled = false,
  } = props

  return (
    <div className="prithvi-tool__aoi">
      <label className="prithvi-tool__aoi-row">
        <span className="prithvi-tool__aoi-label">Select AOI</span>
        <select
          className="prithvi-tool__aoi-select"
          value={aoiMode}
          disabled={disabled}
          aria-label="Select AOI source for Crop AI"
          title={CROP_AOI_MODE_HINT[aoiMode]}
          onChange={e => onAoiModeChange(e.target.value as CropAoiMode)}
        >
          {CROP_AOI_MODE_OPTIONS.map(o => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {aoiMode === 'layers' && onAoiLayerIdChange ? (
        <label className="prithvi-tool__aoi-row">
          <span className="prithvi-tool__aoi-label">AOI layer</span>
          <select
            className="prithvi-tool__aoi-select"
            value={aoiLayerId}
            disabled={disabled || aoiLayerOptions.length === 0}
            aria-label="AOI layer from Layers for Crop AI"
            onChange={e => onAoiLayerIdChange(e.target.value)}
          >
            {aoiLayerOptions.length === 0 ? (
              <option value="">Add a vector layer from Layers</option>
            ) : (
              aoiLayerOptions.map(l => (
                <option key={l.id} value={l.id}>
                  {l.label}
                  {typeof l.featureCount === 'number' && l.featureCount > 0 ? ` (${l.featureCount})` : ''}
                </option>
              ))
            )}
          </select>
        </label>
      ) : null}

      {!hasAoi ? <p className="prithvi-tool__aoi-hint">{CROP_AOI_MODE_HINT[aoiMode]}</p> : null}
    </div>
  )
}
