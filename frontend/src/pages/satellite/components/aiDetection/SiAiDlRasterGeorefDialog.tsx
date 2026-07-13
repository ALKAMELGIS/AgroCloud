import type { AiDlRasterGeorefRequest } from '../../../../lib/aiDetection/siAiDlRasterPipeline'
import './SiAiDetectionGisPanel.css'

export type SiAiDlRasterGeorefDialogProps = {
  request: AiDlRasterGeorefRequest
  initialBounds?: unknown
  onCancel: () => void
  onConfirm?: (georef: unknown) => void
}

export function SiAiDlRasterGeorefDialog({ request, onCancel }: SiAiDlRasterGeorefDialogProps) {
  return (
    <div className="si-ai-dl-gp__georef-dialog" role="alert" aria-label="Raster georeferencing required">
      <div className="si-ai-dl-gp__georef-head">
        <strong>Georeferencing files required</strong>
        <span className="si-ai-dl-gp__georef-filename" title={request.file.name}>
          {request.file.name}
        </span>
      </div>
      <p className="si-ai-dl-gp__georef-message">
        No world file (.jgw / .pgw / .tfw / .wld) was found. Select the image together with its sidecar
        files from the satellite export folder, then import again.
      </p>
      <div className="si-ai-dl-gp__georef-actions">
        <button type="button" className="si-ai-dl-gp__georef-dismiss" onClick={onCancel}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
