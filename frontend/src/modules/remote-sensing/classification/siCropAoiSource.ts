/** How Crop AI resolves its study AOI — independent from FTW / Tree tooling. */
export type CropAoiMode = 'draw' | 'layers' | 'viewport' | 'select'

export type CropAoiLayerOption = { id: string; label: string; featureCount?: number }

export const CROP_AOI_MODE_OPTIONS: Array<{ id: CropAoiMode; label: string }> = [
  { id: 'draw', label: 'Drawn AOI (map sketch)' },
  { id: 'layers', label: 'Layer from Layers panel' },
  { id: 'viewport', label: 'Current map extent' },
  { id: 'select', label: 'Select tool (rectangle / polygon / lasso)' },
]

export const CROP_AOI_MODE_HINT: Record<CropAoiMode, string> = {
  draw: 'Draw a polygon on the map (toolbox Draw), or reuse the existing sketch.',
  layers: 'Pick a vector layer added under Layers.',
  viewport: 'Uses the current map extent as the study area.',
  select: 'Use the Select rail tool (rectangle / polygon / lasso) on layer features.',
}
