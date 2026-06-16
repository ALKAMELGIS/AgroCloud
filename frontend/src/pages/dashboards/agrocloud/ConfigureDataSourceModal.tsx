import { useCallback, useEffect, useMemo, useState } from 'react'
import { getGisContentRowById } from '../../../lib/gisContentPortalStore'
import type { GisContentRow } from '../../master/gisContentPortalData'
import {
  areFieldTypesCompatible,
  buildAutoDataSourceMapping,
  dataSourceTypeBadge,
  fieldTypeIcon,
  fieldTypeLabel,
  resolveDataSourceLayers,
  resolveReplacementLayers,
  validateDataSourceMapping,
  type DashboardDataSourceLayer,
  type DataSourceMappingDraft,
} from './agroCloudDashboardDataSourceEngine'
import { SelectMapFromGisContentModal } from './SelectMapFromGisContentModal'

type ConfigureDataSourceModalProps = {
  open: boolean
  gisContentId: string | null
  onClose: () => void
  onApply: (replacementRow: GisContentRow, draft: DataSourceMappingDraft) => void
}

function LayerFieldsSection({
  layer,
  replacementLayer,
  fieldMapping,
  onFieldChange,
}: {
  layer: DashboardDataSourceLayer
  replacementLayer: DashboardDataSourceLayer | undefined
  fieldMapping: Record<string, string | null>
  onFieldChange: (originalField: string, replacementField: string | null) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const count = layer.fields.length

  return (
    <div className="agrocloud-configure-ds__fields-block">
      <button
        type="button"
        className="agrocloud-configure-ds__fields-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
      >
        <i className={`fa-solid fa-chevron-${expanded ? 'down' : 'right'}`} aria-hidden />
        <span>Fields ({count})</span>
      </button>
      {expanded ? (
        <div className="agrocloud-configure-ds__fields-rows">
          {layer.fields.map(field => {
            const mapped = fieldMapping[field.name] ?? null
            const targetField = replacementLayer?.fields.find(f => f.name === mapped)
            const typeMismatch =
              Boolean(mapped && targetField && !areFieldTypesCompatible(field.type, targetField.type))
            return (
              <div key={field.name} className="agrocloud-configure-ds__field-row">
                <div className="agrocloud-configure-ds__field-current">
                  <i className={fieldTypeIcon(field.type)} aria-hidden title={fieldTypeLabel(field.type)} />
                  <span>{field.name}</span>
                </div>
                <div className="agrocloud-configure-ds__field-replacement">
                  <select
                    className={`agrocloud-configure-ds__select${typeMismatch ? ' is-invalid' : ''}`}
                    value={mapped ?? ''}
                    aria-label={`Replacement for ${field.name}`}
                    onChange={e => onFieldChange(field.name, e.target.value || null)}
                    disabled={!replacementLayer}
                  >
                    <option value="">—</option>
                    {(replacementLayer?.fields ?? [])
                      .filter(f => areFieldTypesCompatible(field.type, f.type))
                      .map(f => (
                      <option key={f.name} value={f.name}>
                        {f.name} ({fieldTypeLabel(f.type)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function ConfigureDataSourceModal({ open, gisContentId, onClose, onApply }: ConfigureDataSourceModalProps) {
  const currentRow = gisContentId ? getGisContentRowById(gisContentId) : undefined
  const currentLayers = useMemo(
    () => (currentRow ? resolveDataSourceLayers(currentRow) : []),
    [currentRow, open],
  )

  const [pickerOpen, setPickerOpen] = useState(false)
  const [replacementRow, setReplacementRow] = useState<GisContentRow | null>(null)
  const [draft, setDraft] = useState<DataSourceMappingDraft>({
    replacementGisContentId: null,
    layerMapping: {},
    fieldMapping: {},
  })
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const replacementLayers = useMemo(
    () => (replacementRow ? resolveReplacementLayers(replacementRow) : []),
    [replacementRow],
  )

  const resetState = useCallback(() => {
    setReplacementRow(null)
    setDraft({ replacementGisContentId: null, layerMapping: {}, fieldMapping: {} })
    setValidationErrors([])
    setPickerOpen(false)
  }, [])

  useEffect(() => {
    if (!open) {
      resetState()
      return
    }
    resetState()
  }, [open, gisContentId, resetState])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pickerOpen) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, pickerOpen])

  const handleReplacementSelected = useCallback(
    (row: GisContentRow) => {
      setReplacementRow(row)
      setPickerOpen(false)
      const replLayers = resolveReplacementLayers(row)
      const auto = buildAutoDataSourceMapping(currentLayers, replLayers)
      setDraft({ ...auto, replacementGisContentId: row.id })
      setValidationErrors([])
    },
    [currentLayers],
  )

  const setLayerMapping = (originalLayer: string, replacementLayer: string | null) => {
    setDraft(prev => {
      const nextLayerMapping = { ...prev.layerMapping, [originalLayer]: replacementLayer }
      const replLayer = replacementLayers.find(l => l.name === replacementLayer)
      const origLayer = currentLayers.find(l => l.name === originalLayer)
      const nextFieldMapping = { ...prev.fieldMapping }
      if (origLayer && replLayer) {
        const used = new Set<string>()
        const fields: Record<string, string | null> = {}
        for (const f of origLayer.fields) {
          const match =
            replLayer.fields.find(
              rf => !used.has(rf.name) && rf.name.toLowerCase() === f.name.toLowerCase(),
            ) ?? replLayer.fields.find(rf => !used.has(rf.name)) ?? null
          if (match) {
            fields[f.name] = match.name
            used.add(match.name)
          } else {
            fields[f.name] = null
          }
        }
        nextFieldMapping[originalLayer] = fields
      }
      return { ...prev, layerMapping: nextLayerMapping, fieldMapping: nextFieldMapping }
    })
  }

  const setFieldMapping = (layerName: string, originalField: string, replacementField: string | null) => {
    setDraft(prev => ({
      ...prev,
      fieldMapping: {
        ...prev.fieldMapping,
        [layerName]: { ...prev.fieldMapping[layerName], [originalField]: replacementField },
      },
    }))
  }

  const handleDone = () => {
    if (!replacementRow) return
    const result = validateDataSourceMapping(currentLayers, replacementLayers, {
      ...draft,
      replacementGisContentId: replacementRow.id,
    })
    if (!result.valid) {
      setValidationErrors(result.errors)
      return
    }
    onApply(replacementRow, { ...draft, replacementGisContentId: replacementRow.id })
    onClose()
  }

  if (!open || !currentRow) return null

  return (
    <>
      <div className="agrocloud-configure-ds-backdrop" role="presentation" onClick={onClose}>
        <div
          className="agrocloud-configure-ds"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agrocloud-configure-ds-title"
          onClick={e => e.stopPropagation()}
        >
          <header className="agrocloud-configure-ds__header">
            <h2 id="agrocloud-configure-ds-title">Configure data source</h2>
            <button type="button" className="agrocloud-configure-ds__close" aria-label="Close" onClick={onClose}>
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </header>

          <div className="agrocloud-configure-ds__columns-head">
            <span>Current</span>
            <span>Replacement</span>
          </div>

          <div className="agrocloud-configure-ds__body">
            <div className="agrocloud-configure-ds__source-row">
              <div className="agrocloud-configure-ds__source-current">
                <strong>{currentRow.title}</strong>
              </div>
              <div className="agrocloud-configure-ds__source-replacement">
                <span className="agrocloud-configure-ds__replacement-name">
                  {replacementRow ? replacementRow.title : '—'}
                </span>
                <button type="button" className="agrocloud-configure-ds__change-btn" onClick={() => setPickerOpen(true)}>
                  Change
                </button>
              </div>
            </div>

            {currentLayers.map(layer => {
              const mappedLayerName = draft.layerMapping[layer.name] ?? null
              const replacementLayer = replacementLayers.find(l => l.name === mappedLayerName)
              return (
                <div key={layer.id} className="agrocloud-configure-ds__layer-block">
                  <div className="agrocloud-configure-ds__layer-row">
                    <div className="agrocloud-configure-ds__layer-current">
                      <i className="fa-solid fa-layer-group" aria-hidden />
                      <span>{layer.name}</span>
                    </div>
                    <div className="agrocloud-configure-ds__layer-replacement">
                      <select
                        className="agrocloud-configure-ds__select"
                        value={mappedLayerName ?? ''}
                        aria-label={`Replacement for ${layer.name}`}
                        onChange={e => setLayerMapping(layer.name, e.target.value || null)}
                        disabled={!replacementRow}
                      >
                        <option value="">—</option>
                        {replacementLayers.map(l => (
                          <option key={l.id} value={l.name}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <LayerFieldsSection
                    layer={layer}
                    replacementLayer={replacementLayer}
                    fieldMapping={draft.fieldMapping[layer.name] ?? {}}
                    onFieldChange={(field, repl) => setFieldMapping(layer.name, field, repl)}
                  />
                </div>
              )
            })}

            {validationErrors.length > 0 ? (
              <div className="agrocloud-configure-ds__errors" role="alert">
                {validationErrors.map(err => (
                  <p key={err}>{err}</p>
                ))}
              </div>
            ) : null}
          </div>

          <footer className="agrocloud-configure-ds__footer">
            <button type="button" className="agrocloud-configure-ds__cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="agrocloud-configure-ds__done"
              onClick={handleDone}
              disabled={!replacementRow}
            >
              Done
            </button>
          </footer>
        </div>
      </div>

      <SelectMapFromGisContentModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleReplacementSelected}
        title="Select replacement data source"
        excludeGisContentId={gisContentId}
      />
    </>
  )
}

export { dataSourceTypeBadge }
