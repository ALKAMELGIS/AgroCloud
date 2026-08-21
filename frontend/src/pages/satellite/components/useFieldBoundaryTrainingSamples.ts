/**
 * Field Boundaries Training Samples — draft / approve / save (approved only).
 */

import { useCallback, useMemo, useState } from 'react'
import {
  approvedFieldTrainingFeatureCollection,
  countFieldTrainingByStatus,
  downloadApprovedFieldTrainingSamples,
  fieldTrainingSamplesToFeatureCollection,
  predictionsToDraftSamples,
  type FieldTrainingGenerateMeta,
  type FieldTrainingSample,
  type FieldTrainingSampleStatus,
} from '../../../lib/agriFieldBoundary/fieldBoundaryTrainingSamples'

export function useFieldBoundaryTrainingSamples() {
  const [samples, setSamples] = useState<FieldTrainingSample[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const counts = useMemo(() => countFieldTrainingByStatus(samples), [samples])

  const samplesGeojson = useMemo(
    () => fieldTrainingSamplesToFeatureCollection(samples, { selectedId }),
    [samples, selectedId],
  )

  const approvedGeojson = useMemo(
    () => approvedFieldTrainingFeatureCollection(samples),
    [samples],
  )

  const selected = useMemo(
    () => samples.find(s => s.sample_id === selectedId) ?? null,
    [samples, selectedId],
  )

  const clearNotice = useCallback(() => {
    setNotice(null)
    setError(null)
  }, [])

  /** Predicted → draft only. Never marks approved. */
  const generateFromPredictions = useCallback(
    (fc: GeoJSON.FeatureCollection | null | undefined, meta?: FieldTrainingGenerateMeta) => {
      clearNotice()
      const drafts = predictionsToDraftSamples(fc, meta)
      if (!drafts.length) {
        setError('No predicted field polygons to generate drafts from. Run Detect Fields first.')
        return 0
      }
      setSamples(prev => [...drafts, ...prev])
      setSelectedId(drafts[0]!.sample_id)
      setNotice(
        `Generated ${drafts.length} draft sample${drafts.length === 1 ? '' : 's'} — review and Accept before Save.`,
      )
      return drafts.length
    },
    [clearNotice],
  )

  const selectSample = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  const acceptSample = useCallback((id: string) => {
    const now = new Date().toISOString()
    setSamples(prev =>
      prev.map(s =>
        s.sample_id === id
          ? { ...s, status: 'approved' as const, updated_at: now, approved_at: now }
          : s,
      ),
    )
    setNotice('Sample approved for training.')
    setError(null)
  }, [])

  const acceptAllDrafts = useCallback(() => {
    const now = new Date().toISOString()
    let n = 0
    setSamples(prev =>
      prev.map(s => {
        if (s.status !== 'draft') return s
        n += 1
        return { ...s, status: 'approved' as const, updated_at: now, approved_at: now }
      }),
    )
    if (!n) {
      setError('No draft samples to accept.')
      return 0
    }
    setNotice(`Approved ${n} draft sample${n === 1 ? '' : 's'}.`)
    setError(null)
    return n
  }, [])

  const rejectSample = useCallback((id: string) => {
    const now = new Date().toISOString()
    setSamples(prev =>
      prev.map(s =>
        s.sample_id === id
          ? {
              ...s,
              status: 'rejected' as const,
              updated_at: now,
              approved_at: undefined,
            }
          : s,
      ),
    )
    setNotice('Sample rejected — excluded from training export.')
    setError(null)
  }, [])

  /** Return approved → draft for further edit. */
  const unapproveSample = useCallback((id: string) => {
    const now = new Date().toISOString()
    setSamples(prev =>
      prev.map(s =>
        s.sample_id === id
          ? { ...s, status: 'draft' as const, updated_at: now, approved_at: undefined }
          : s,
      ),
    )
    setNotice('Sample returned to draft for editing.')
    setError(null)
  }, [])

  const deleteSample = useCallback((id: string) => {
    setSamples(prev => prev.filter(s => s.sample_id !== id))
    setSelectedId(prev => (prev === id ? null : prev))
    setNotice('Sample deleted.')
    setError(null)
  }, [])

  const setSampleNote = useCallback((id: string, note: string) => {
    const now = new Date().toISOString()
    setSamples(prev =>
      prev.map(s => (s.sample_id === id ? { ...s, note: note.trim() || undefined, updated_at: now } : s)),
    )
  }, [])

  const updateSampleGeometry = useCallback(
    (id: string, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) => {
      const now = new Date().toISOString()
      setSamples(prev =>
        prev.map(s =>
          s.sample_id === id
            ? {
                ...s,
                geometry,
                // Geometry change invalidates prior approval.
                status: s.status === 'approved' ? ('draft' as const) : s.status,
                approved_at: s.status === 'approved' ? undefined : s.approved_at,
                updated_at: now,
              }
            : s,
        ),
      )
      setNotice('Geometry updated — re-Accept before Save if it was approved.')
      setError(null)
    },
    [],
  )

  const clearAll = useCallback(() => {
    setSamples([])
    setSelectedId(null)
    setNotice('All training samples cleared.')
    setError(null)
  }, [])

  const clearByStatus = useCallback((status: FieldTrainingSampleStatus) => {
    setSamples(prev => {
      const next = prev.filter(s => s.status !== status)
      setSelectedId(cur => {
        if (!cur) return null
        return next.some(s => s.sample_id === cur) ? cur : null
      })
      return next
    })
  }, [])

  /** Save downloads approved-only GeoJSON — never drafts/rejected. */
  const saveApproved = useCallback(() => {
    clearNotice()
    const result = downloadApprovedFieldTrainingSamples(samples)
    if (!result.ok) {
      setError(result.reason)
      return false
    }
    setNotice(`Saved ${result.count} approved training sample${result.count === 1 ? '' : 's'}.`)
    return true
  }, [clearNotice, samples])

  return {
    samples,
    selectedId,
    selected,
    counts,
    samplesGeojson,
    approvedGeojson,
    notice,
    error,
    clearNotice,
    generateFromPredictions,
    selectSample,
    acceptSample,
    acceptAllDrafts,
    rejectSample,
    unapproveSample,
    deleteSample,
    setSampleNote,
    updateSampleGeometry,
    clearAll,
    clearByStatus,
    saveApproved,
  }
}

export type FieldBoundaryTrainingSamplesApi = ReturnType<typeof useFieldBoundaryTrainingSamples>
