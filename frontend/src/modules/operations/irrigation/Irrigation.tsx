import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataSourceFieldsPanel, type DataSourceFormState } from '@/modules/forms/components/datasourcefieldspanel'
import { canManageDataSourceSettings } from '@/core/auth/auth'
import { Modal } from '@/components/ui/Modal'
import { useLanguage } from '@/core/localization/i18n'
import { WorkflowHeroStepper } from '@/modules/forms/components/WorkflowHeroStepper'
import { EntryActionBar, EntryFlash, EntryFormCardHeader, EntryValidationAlert } from '@/modules/operations/shared/DataEntryChrome'
import { getWorkflowShellMeta, stepLabels } from '@/modules/forms/templates/workflowMeta'
import '../fertigation/EC.css'
import { GIS_MAP_STORE_NAME, openGisMapDb } from '../../gis/map/gisMapLayerStore'

type FieldConfig = { name: string; enabled: boolean; required?: boolean }
type FormBinding = {
  sourceIds?: string[]
  fieldConfigsBySource?: Record<string, FieldConfig[]>
  managementLayer?: { sourceId: string; selectedFields: string[]; availableFields?: string[] }
}
type FormBindings = Record<string, FormBinding>

type FieldSchema = { name: string; type: 'text' | 'number' | 'date' | 'boolean' }
type LayerFields = Record<string, FieldSchema[]>

type SaveRecord = {
  id: string
  tsUtc: string
  formKey: 'Irrigation'
  kind?: 'draft' | 'submitted'
  state: DataSourceFormState
}

const STORE_NAME = GIS_MAP_STORE_NAME

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value))
}

const STORAGE_KEY = 'irrigation_scheduling_records_v1'

/** Map flat validation strings from validate() into per-layer / per-field messages for inline display */
function validationErrorsToLayerFieldMap(errors: string[]): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {}
  for (const raw of errors) {
    const line = String(raw ?? '').trim()
    if (!line) continue

    let m = /^([^:]+):\s*(.+?)\s+is required\.?\s*$/i.exec(line)
    if (m) {
      const layer = m[1].trim()
      const field = m[2].trim()
      if (!map[layer]) map[layer] = {}
      map[layer][field] = 'This field is required.'
      continue
    }

    m = /^([^:]+):\s*(.+?)\s+must be a valid number\.?\s*$/i.exec(line)
    if (m) {
      const layer = m[1].trim()
      const field = m[2].trim()
      if (!map[layer]) map[layer] = {}
      map[layer][field] = 'Enter a valid number.'
      continue
    }

    m = /^([^:]+):\s*(.+?)\s+must be a valid date\.?\s*$/i.exec(line)
    if (m) {
      const layer = m[1].trim()
      const field = m[2].trim()
      if (!map[layer]) map[layer] = {}
      map[layer][field] = 'Use a valid date (YYYY-MM-DD).'
      continue
    }

    m = /^([^:]+):\s*(.+?)\s+must be a valid boolean/i.exec(line)
    if (m) {
      const layer = m[1].trim()
      const field = m[2].trim()
      if (!map[layer]) map[layer] = {}
      map[layer][field] = 'Choose Yes or No.'
      continue
    }
  }
  return map
}
const BINDINGS_KEY = 'form_data_source_bindings_v1'
const GIS_FIELDS_KEY = 'gisContent.layerFields.v1'

const getRealSourceId = (sourceId: string) => (sourceId.startsWith('management:') ? sourceId.slice('management:'.length) : sourceId)

export default function Irrigation() {
  const navigate = useNavigate()
  const { language } = useLanguage()
  const uiLang = language === 'ar' ? 'ar' : 'en'
  const shell = useMemo(() => getWorkflowShellMeta('irrigation', uiLang), [uiLang])
  const steps = useMemo(() => stepLabels(uiLang), [uiLang])
  const canManageSettings = useMemo(() => canManageDataSourceSettings(), [])
  const [panelKey, setPanelKey] = useState(0)
  const [formState, setFormState] = useState<DataSourceFormState>({ sourceIds: [], selectedFieldsBySource: {}, valuesBySource: {} })
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [liveValidationErrors, setLiveValidationErrors] = useState<string[]>([])
  /** After Save/Submit fails once, keep revalidating as the user edits */
  const [validationAfterAttempt, setValidationAfterAttempt] = useState(false)
  const [busy, setBusy] = useState<null | 'saveAdd' | 'submit'>(null)
  const [modal, setModal] = useState<null | { kind: 'confirmClear' } | { kind: 'confirmDiscard'; nextPath?: string }>(null)
  const [flash, setFlash] = useState<null | { kind: 'success' | 'error'; message: string }>(null)
  const [layerNameById, setLayerNameById] = useState<Record<string, string>>({})
  const [quickFillApplyKey, setQuickFillApplyKey] = useState(0)
  const [quickFillValuesBySource, setQuickFillValuesBySource] = useState<Record<string, Record<string, string>> | null>(null)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const db = await openGisMapDb()
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get('savedLayers')
        const layers = await new Promise<any[]>((resolve) => {
          req.onsuccess = () => resolve(req.result || [])
          req.onerror = () => resolve([])
        })
        if (cancelled) return
        const next: Record<string, string> = {}
        ;(Array.isArray(layers) ? layers : []).forEach((l: any) => {
          const id = String(l?.id ?? '').trim()
          const name = String(l?.name ?? '').trim()
          if (id && name) next[id] = name
        })
        setLayerNameById(next)
      } catch {
        if (!cancelled) setLayerNameById({})
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const getLayerDisplayName = (sourceId: string) => {
    const real = String(getRealSourceId(sourceId) ?? '')
    const candidates: string[] = [real]
    const lower = real.toLowerCase()
    const normalizeArcUrl = (value: string) =>
      String(value ?? '')
        .trim()
        .replace(/^arcgis:/i, '')
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '')
        .toLowerCase()
    const agroStructures21Url =
      'https://services1.arcgis.com/jz3ndhbYv5k9nwi8/arcgis/rest/services/agro_structures/featureserver/21'
    if (lower.startsWith('arcgis:')) candidates.push(real.slice('arcgis:'.length))
    if (lower.startsWith('geojson:')) candidates.push(real.slice('geojson:'.length))
    if (lower.startsWith('url:')) candidates.push(real.slice('url:'.length))
    if (/^https?:\/\//i.test(real)) {
      candidates.push(`arcgis:${real}`)
      candidates.push(`url:${real}`)
      candidates.push(`geojson:${real}`)
    }
    for (const id of candidates) {
      if (normalizeArcUrl(id) === agroStructures21Url) return 'Agro_Structures'
      const name = layerNameById[id]
      if (name && name.trim()) return name
    }
    return sourceId
  }

  const isDirty = useMemo(() => {
    const values = formState.valuesBySource || {}
    for (const sourceValues of Object.values(values)) {
      for (const v of Object.values(sourceValues || {})) {
        if (String(v ?? '').trim()) return true
      }
    }
    return false
  }, [formState.valuesBySource])

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 2500)
    return () => window.clearTimeout(t)
  }, [flash])

  useEffect(() => {
    if (!validationAfterAttempt) {
      setLiveValidationErrors([])
      return
    }
    const id = window.setTimeout(() => setLiveValidationErrors(validate(formState)), 320)
    return () => window.clearTimeout(id)
  }, [formState, validationAfterAttempt])

  const mergedValidationMessages = useMemo(() => {
    const set = new Set<string>([...validationErrors, ...(validationAfterAttempt ? liveValidationErrors : [])])
    return Array.from(set)
  }, [validationErrors, liveValidationErrors, validationAfterAttempt])

  const layerFieldErrors = useMemo(() => validationErrorsToLayerFieldMap(mergedValidationMessages), [mergedValidationMessages])

  const validate = (state: DataSourceFormState): string[] => {
    const bindings = readJson<FormBindings>(BINDINGS_KEY, {})
    const b = bindings.Irrigation || {}
    const requiredBySource: Record<string, string[]> = {}
    for (const [sourceId, cfgs] of Object.entries(b.fieldConfigsBySource || {})) {
      const required = (Array.isArray(cfgs) ? cfgs : [])
        .filter(c => c && (c as any).required)
        .map(c => String((c as any).name ?? '').trim())
        .filter(Boolean)
      if (required.length) requiredBySource[sourceId] = required
    }

    const layerFields = readJson<LayerFields>(GIS_FIELDS_KEY, {})
    const getFieldType = (sourceId: string, fieldName: string) => {
      const realId = getRealSourceId(sourceId)
      const list = Array.isArray(layerFields[realId]) ? layerFields[realId] : []
      const found = list.find(f => String((f as any)?.name ?? '') === fieldName)
      const t = String((found as any)?.type ?? '').toLowerCase()
      if (t === 'date') return 'date'
      if (t === 'number') return 'number'
      if (t === 'boolean') return 'boolean'
      return 'text'
    }

    const errors: string[] = []
    for (const sourceId of state.sourceIds) {
      const realId = getRealSourceId(sourceId)
      const displayName = getLayerDisplayName(sourceId)
      const requiredFields = requiredBySource[realId] ?? requiredBySource[sourceId] ?? []
      const values = state.valuesBySource[sourceId] ?? {}
      for (const field of requiredFields) {
        const v = String(values[field] ?? '').trim()
        if (!v) errors.push(`${displayName}: ${field} is required.`)
      }

      const selected = state.selectedFieldsBySource[sourceId] ?? []
      for (const field of selected) {
        const raw = String(values[field] ?? '').trim()
        if (!raw) continue
        const type = getFieldType(sourceId, field)
        if (type === 'number') {
          const n = Number(raw)
          if (!Number.isFinite(n)) errors.push(`${displayName}: ${field} must be a valid number.`)
        }
        if (type === 'date') {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) errors.push(`${displayName}: ${field} must be a valid date.`)
        }
        if (type === 'boolean') {
          const v = raw.toLowerCase()
          if (!(v === 'true' || v === 'false' || v === '1' || v === '0' || v === 'yes' || v === 'no')) {
            errors.push(`${displayName}: ${field} must be a valid boolean value.`)
          }
        }
      }
    }
    return errors
  }

  const clearForm = () => {
    setValidationErrors([])
    setValidationAfterAttempt(false)
    setLiveValidationErrors([])
    setFormState({ sourceIds: [], selectedFieldsBySource: {}, valuesBySource: {} })
    setPanelKey(k => k + 1)
    setQuickFillValuesBySource(null)
  }

  const attemptNavigate = (path: string) => {
    if (!isDirty) {
      navigate(path)
      return
    }
    setModal({ kind: 'confirmDiscard', nextPath: path })
  }

  const persistLocal = (kind: 'draft' | 'submitted') => {
    try {
      const record: SaveRecord = {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        tsUtc: new Date().toISOString(),
        formKey: 'Irrigation',
        kind,
        state: formState,
      }
      const existing = readJson<SaveRecord[]>(STORAGE_KEY, [])
      const next = [record, ...existing].slice(0, 2000)
      writeJson(STORAGE_KEY, next)
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'Failed to save. Please try again.'
      throw new Error(msg)
    }
  }

  const onQuickFill = () => {
    if (busy) return
    setFlash(null)
    try {
      const existing = readJson<SaveRecord[]>(STORAGE_KEY, [])
      const latest = Array.isArray(existing) ? existing[0] : null
      const vb = latest && typeof latest === 'object' ? (latest as any).state?.valuesBySource : null
      if (!vb || typeof vb !== 'object') throw new Error('No previous entry found for Quick Fill.')
      setQuickFillValuesBySource(vb)
      setQuickFillApplyKey(k => k + 1)
      setFlash({ kind: 'success', message: 'Quick Fill applied from latest saved entry.' })
    } catch (e: any) {
      setFlash({ kind: 'error', message: typeof e?.message === 'string' ? e.message : 'Quick Fill failed.' })
    }
  }

  const onSaveAddAnother = async () => {
    if (busy) return
    setFlash(null)
    const errors = validate(formState)
    setValidationErrors(errors)
    if (errors.length) {
      setValidationAfterAttempt(true)
      setFlash({ kind: 'error', message: 'Please fix the highlighted issues before saving.' })
      return
    }
    if (!isDirty) {
      setFlash({ kind: 'error', message: 'Nothing to save.' })
      return
    }
    setBusy('saveAdd')
    try {
      persistLocal('draft')
      setFlash({ kind: 'success', message: 'Saved. Ready for next entry.' })
      clearForm()
    } catch (e: any) {
      setFlash({ kind: 'error', message: typeof e?.message === 'string' ? e.message : 'Failed to save.' })
    } finally {
      setBusy(null)
    }
  }

  const onSubmit = async () => {
    if (busy) return
    setFlash(null)
    const errors = validate(formState)
    setValidationErrors(errors)
    if (errors.length) {
      setValidationAfterAttempt(true)
      setFlash({ kind: 'error', message: 'Please fix the highlighted issues before submitting.' })
      return
    }
    if (!isDirty) {
      setFlash({ kind: 'error', message: 'Nothing to submit.' })
      return
    }
    setBusy('submit')
    try {
      persistLocal('submitted')
      setFlash({ kind: 'success', message: 'Submitted successfully.' })
      clearForm()
    } catch (e: any) {
      setFlash({ kind: 'error', message: typeof e?.message === 'string' ? e.message : 'Failed to submit.' })
    } finally {
      setBusy(null)
    }
  }

  const onClear = () => {
    if (busy) return
    if (!isDirty) {
      clearForm()
      setFlash({ kind: 'success', message: 'Cleared.' })
      return
    }
    setModal({ kind: 'confirmClear' })
  }

  const recipesPath = '/data/recipes/irrigation'

  const onNext = () => {
    if (!isDirty) {
      navigate(recipesPath)
      return
    }
    setModal({ kind: 'confirmDiscard', nextPath: recipesPath })
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = String(e.key || '').toLowerCase()
      if ((e.ctrlKey || (e as any).metaKey) && key === 's') {
        e.preventDefault()
        void onSaveAddAnother()
        return
      }
      if (key === 'escape') {
        if (busy) return
        attemptNavigate('/')
      }
    }
    window.addEventListener('keydown', onKeyDown as any)
    return () => window.removeEventListener('keydown', onKeyDown as any)
  }, [busy, isDirty, formState])

  return (
    <div className="ec-page irrigation-scheduling-modern workflow-shell-page">
      <div className="ec-container ec-animate-in">
        <WorkflowHeroStepper
          phase="data-entry"
          iconClass={shell.iconClass}
          title={shell.title}
          tagline={shell.tagline}
          dataEntryPath="/data/irrigation"
          recipesPath={recipesPath}
          labelDataEntry={steps.dataEntry}
          labelRecipes={steps.recipes}
          onNavigateToRecipes={() => attemptNavigate(recipesPath)}
        />

        <EntryFlash flash={flash} />

        <div className="ec-card entry-form-card">
          <EntryFormCardHeader
            title="Data Entry Form"
            settingsAriaLabel="Open workflow settings"
            onOpenSettings={canManageSettings ? () => attemptNavigate('/master/workflow-settings?form=Irrigation') : undefined}
          />
          <div className="ec-card-body">
            <DataSourceFieldsPanel
              key={panelKey}
              formKey="Irrigation"
              mode="fill"
              variant="embedded"
              fillPresentation="modern"
              layerFieldErrors={layerFieldErrors}
              onChange={setFormState}
              externalValuesBySource={quickFillValuesBySource}
              externalApplyKey={quickFillApplyKey}
            />
            <EntryValidationAlert messages={mergedValidationMessages} />

            <EntryActionBar
              busy={busy}
              onQuickFill={() => void onQuickFill()}
              onClear={onClear}
              onSaveAddAnother={() => void onSaveAddAnother()}
              onSubmit={() => void onSubmit()}
              onNext={onNext}
            />
          </div>
        </div>
      </div>

      <Modal
        isOpen={modal?.kind === 'confirmClear'}
        title="Clear all fields?"
        onClose={() => (busy ? null : setModal(null))}
        actions={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="ds-btn ds-btn-ghost" type="button" onClick={() => setModal(null)} disabled={Boolean(busy)}>
              Cancel
            </button>
            <button
              className="ds-btn ds-btn-danger"
              type="button"
              onClick={() => {
                setModal(null)
                clearForm()
                setFlash({ kind: 'success', message: 'Cleared.' })
              }}
              disabled={Boolean(busy)}
            >
              Clear
            </button>
          </div>
        }
      >
        This will reset all form fields to an empty state.
      </Modal>

      <Modal
        isOpen={modal?.kind === 'confirmDiscard'}
        title="Discard changes?"
        onClose={() => setModal(null)}
        actions={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="ds-btn ds-btn-ghost" type="button" onClick={() => setModal(null)}>
              Keep editing
            </button>
            <button
              className="ds-btn ds-btn-danger"
              type="button"
              onClick={() => {
                const nextPath = modal?.kind === 'confirmDiscard' ? modal.nextPath : undefined
                setModal(null)
                clearForm()
                if (nextPath) navigate(nextPath)
              }}
            >
              Discard
            </button>
          </div>
        }
      >
        You have unsaved changes. Leaving this page will discard them.
      </Modal>
    </div>
  )
}
