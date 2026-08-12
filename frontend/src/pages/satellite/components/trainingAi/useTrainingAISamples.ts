import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_TRAINING_CLASSES,
  TRAINING_CLASS_COLORS,
  countByClass,
  distinctClassCount,
  exportTrainingGeoJson,
  exportTrainingGeoPackageCompanion,
  exportTrainingPointsCsv,
  geometryTypeOf,
  importTrainingSamplesFromFile,
  nextSampleId,
  publishLiveTrainingSamples,
  saveTrainingSamplesPackage,
  samplesBbox,
  samplesToFeatureCollection,
  type TrainingClass,
  type TrainingDrawTool,
  type TrainingImportResult,
  type TrainingSample,
} from '../../../../lib/trainingAi/trainingSampleStore'

export type UseTrainingAISamplesOptions = {
  /** Current Sentinel scene / imagery id stamped onto each sample. */
  resolveImageId?: () => string
}

export function useTrainingAISamples(opts: UseTrainingAISamplesOptions = {}) {
  const [classes, setClasses] = useState<TrainingClass[]>(() => [...DEFAULT_TRAINING_CLASSES])
  const [activeClassId, setActiveClassId] = useState<number>(DEFAULT_TRAINING_CLASSES[0]!.class_id)
  const [samples, setSamples] = useState<TrainingSample[]>([])
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null)
  const [drawTool, setDrawTool] = useState<TrainingDrawTool>('polygon')

  const activeClass = useMemo(
    () => classes.find(c => c.class_id === activeClassId) ?? classes[0] ?? null,
    [classes, activeClassId],
  )

  const addClass = useCallback((name?: string) => {
    setClasses(prev => {
      const nextId = Math.max(0, ...prev.map(c => c.class_id)) + 1
      const cls: TrainingClass = {
        class_id: nextId,
        class_name: name?.trim() || `Class ${nextId}`,
        color: TRAINING_CLASS_COLORS[prev.length % TRAINING_CLASS_COLORS.length],
      }
      setActiveClassId(cls.class_id)
      return [...prev, cls]
    })
  }, [])

  const removeClass = useCallback((classId: number) => {
    setClasses(prev => {
      if (prev.length <= 1) return prev
      return prev.filter(c => c.class_id !== classId)
    })
    setSamples(prev => prev.filter(s => s.class_id !== classId))
    setActiveClassId(prev => (prev === classId ? DEFAULT_TRAINING_CLASSES[0]!.class_id : prev))
  }, [])

  const renameClass = useCallback((classId: number, name: string) => {
    const n = name.trim()
    if (!n) return
    setClasses(prev => prev.map(c => (c.class_id === classId ? { ...c, class_name: n } : c)))
    setSamples(prev =>
      prev.map(s => (s.class_id === classId ? { ...s, class_name: n } : s)),
    )
  }, [])

  const addSample = useCallback(
    (geometry: GeoJSON.Geometry, classId?: number) => {
      const cls =
        classes.find(c => c.class_id === (classId ?? activeClassId)) ?? activeClass
      if (!cls || !geometry) return null
      const sample: TrainingSample = {
        sample_id: nextSampleId(),
        class_id: cls.class_id,
        class_name: cls.class_name,
        geometry,
        geometry_type: geometryTypeOf(geometry),
        image_id: opts.resolveImageId?.() || 'sentinel-2',
        source: 'sentinel-2',
        created_at: new Date().toISOString(),
      }
      setSamples(prev => [...prev, sample])
      setSelectedSampleId(sample.sample_id)
      return sample
    },
    [activeClass, activeClassId, classes, opts],
  )

  const removeSample = useCallback((sampleId: string) => {
    setSamples(prev => prev.filter(s => s.sample_id !== sampleId))
    setSelectedSampleId(prev => (prev === sampleId ? null : prev))
  }, [])

  const changeSampleClass = useCallback(
    (sampleId: string, classId: number) => {
      const cls = classes.find(c => c.class_id === classId)
      if (!cls) return
      setSamples(prev =>
        prev.map(s =>
          s.sample_id === sampleId
            ? { ...s, class_id: cls.class_id, class_name: cls.class_name }
            : s,
        ),
      )
    },
    [classes],
  )

  const clearSamples = useCallback(() => {
    setSamples([])
    setSelectedSampleId(null)
  }, [])

  const classCounts = useMemo(() => countByClass(samples, classes), [samples, classes])

  const samplesGeojson = useMemo(() => {
    const selected = selectedSampleId ? new Set([selectedSampleId]) : new Set<string>()
    return samplesToFeatureCollection(samples, classes, selected)
  }, [samples, classes, selectedSampleId])

  const exportGeojson = useCallback(() => {
    exportTrainingGeoJson(samples, classes)
  }, [samples, classes])

  const exportGpkgCompanion = useCallback(() => {
    exportTrainingGeoPackageCompanion(samples, classes)
  }, [samples, classes])

  const exportCsv = useCallback(() => {
    exportTrainingPointsCsv(samples)
  }, [samples])

  const saveSamples = useCallback(() => {
    if (!samples.length) throw new Error('No samples to save.')
    saveTrainingSamplesPackage(samples, classes)
  }, [samples, classes])

  const applyImportResult = useCallback((result: TrainingImportResult, mode: 'replace' | 'merge') => {
    setClasses(result.classes)
    if (mode === 'replace') {
      setSamples(result.samples)
    } else {
      setSamples(prev => {
        const seen = new Set(prev.map(s => s.sample_id))
        const incoming = result.samples.map(s =>
          seen.has(s.sample_id) ? { ...s, sample_id: nextSampleId() } : s,
        )
        return [...prev, ...incoming]
      })
    }
    setSelectedSampleId(result.samples[0]?.sample_id ?? null)
    if (result.classes[0]) setActiveClassId(result.classes[0].class_id)
    return result
  }, [])

  const importSamplesFromFile = useCallback(
    async (file: File, mode: 'replace' | 'merge' = 'merge') => {
      const result = await importTrainingSamplesFromFile(file, classes)
      return applyImportResult(result, mode)
    },
    [applyImportResult, classes],
  )

  const bbox = useMemo(() => samplesBbox(samples), [samples])

  useEffect(() => {
    publishLiveTrainingSamples(samples, classes)
  }, [samples, classes])

  return {
    classes,
    activeClassId,
    setActiveClassId,
    activeClass,
    addClass,
    removeClass,
    renameClass,
    samples,
    selectedSampleId,
    setSelectedSampleId,
    drawTool,
    setDrawTool,
    addSample,
    removeSample,
    changeSampleClass,
    clearSamples,
    classCounts,
    samplesGeojson,
    distinctClassCount: distinctClassCount(samples),
    bbox,
    exportGeojson,
    exportGpkgCompanion,
    exportCsv,
    saveSamples,
    importSamplesFromFile,
  }
}
