/**
 * Build Agricultural Object Intelligence model from layer attributes + Sentinel-2 zonal series.
 * Fills report fields with Sentinel-2 / Open-Meteo estimates (clearly labeled) when layer attrs are absent.
 */

import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { fetchOpenMeteoHistoryRange } from '../../../../lib/openMeteoWeather'
import { fetchPlotTimeSeriesDailyByField } from './fetchPlotTimeSeriesAnalytics'
import {
  AGRI_OBJECT_FIELD_DEFS,
  NOT_AVAILABLE,
  type AgriObjectCapabilityStatus,
  type AgriObjectFieldKey,
  type AgriObjectGapRow,
  type AgriObjectMethodRow,
} from './agriculturalObjectIntelligenceSchema'
import { aggregateAoiIndexTimeSeries, type FieldDashIndexTimeSeries } from '../../components/fieldAttributesDashboardTimeSeries'
import {
  activeStatusFromTemporal,
  agriculturalStatusFromEvidence,
  classifyInspectionPriority,
  classifyNdviChange,
  cropConfidenceFromEvidence,
  cropGrowthStageFromNdvi,
  cropHealthFromNdvi,
  cropTypeSpectralProxy,
  estimateActualEtMm,
  estimatePhenologyDates,
  estimateVegetationCoveragePct,
  estimateYieldTHa,
  irrigationPerformanceFromNdmi,
  kcFormula,
  landCoverFromSpectralIndices,
  landCropSuitabilityFromEvidence,
  mapLayerAttributesToAgriFields,
  mappedFieldsToRecord,
  soilMoistureProxyFromNdmi,
  soilSalinityProxyFromIndices,
  waterStressFromNdmi,
  yieldTHaFormula,
} from './agriculturalObjectIntelligenceMapper'

export type AgriObjectSourceFeature = {
  fieldKey: string
  feature: GeoJSON.Feature
}

export type AgriObjectIntelProgressStage =
  | 'reading_layer'
  | 'extracting_objects'
  | 'loading_sentinel2'
  | 'object_analysis'
  | 'eo_indicators'
  | 'temporal_analysis'
  | 'building_excel'
  | 'completed'

export type AgriObjectIntelProgress = {
  stage: AgriObjectIntelProgressStage
  label: string
  done: number
  total: number
}

export type AgriObjectReportRow = Record<AgriObjectFieldKey, string | number> & {
  fieldKey: string
}

export type AgriObjectGeometryRow = {
  objectId: string
  objectType: string
  objectName: string
  geometryType: string
  centroidLatitude: string | number
  centroidLongitude: string | number
  areaHa: string | number
  geojson: string
}

export type AgriObjectS2AnalysisRow = {
  objectId: string
  imageDate: string
  satellite: string
  processingLevel: string
  cloudCover: string
  ndvi: string | number
  evi: string | number
  savi: string | number
  msavi: string | number
  ndre: string | number
  ndmi: string | number
  ndwi: string | number
  nbr: string | number
  vegetationCoverage: string | number
  waterStress: string
  soilMoistureProxy: string
}

export type AgriObjectTimeSeriesRow = {
  objectId: string
  date: string
  ndvi: string | number
  ndmi: string | number
  ndre: string | number
  evi: string | number
  vegetationCondition: string
  changeFromPreviousPeriod: string
}

export type AgriObjectEquationRow = {
  field: string
  equation: string
  inputs: string
  layerIndex: string
  resultExample: string
}

export type AgriculturalObjectIntelligenceModel = {
  meta: {
    title: string
    exportedAt: string
    layerName: string
    fromDate: string
    toDate: string
    acquisitionDate: string
    satellite: string
    objectCount: number
    analysisLayers: string[]
    /** Human label for selected Time Series layer index (e.g. NDVI). */
    layerIndexLabel: string
  }
  objects: AgriObjectReportRow[]
  geometry: AgriObjectGeometryRow[]
  sentinel2: AgriObjectS2AnalysisRow[]
  timeSeries: AgriObjectTimeSeriesRow[]
  methods: AgriObjectMethodRow[]
  gaps: AgriObjectGapRow[]
  equations: AgriObjectEquationRow[]
  /** AOI-mean spectral index time series for the attributes dashboard. */
  dashboardTimeSeries?: FieldDashIndexTimeSeries | null
}

function numOrNa(v: number | null | undefined, digits = 4): string | number {
  if (v == null || !Number.isFinite(v)) return NOT_AVAILABLE
  return Number(v.toFixed(digits))
}

function meanOf(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!xs.length) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function splitWindowMeans(daily: SentinelHubDailyIndexMeans[]): {
  earlyNdvi: number | null
  lateNdvi: number | null
  lateNdmi: number | null
  lateNdre: number | null
  lateEvi: number | null
  lateSavi: number | null
  lateMsavi: number | null
  lateNdwi: number | null
  lateNbr: number | null
  lateNdsi: number | null
  lateSsi: number | null
  lastDate: string
  count: number
} {
  const withNdvi = daily.filter(d => d.ndvi != null && Number.isFinite(d.ndvi))
  const n = withNdvi.length
  if (!n) {
    return {
      earlyNdvi: null,
      lateNdvi: null,
      lateNdmi: null,
      lateNdre: null,
      lateEvi: null,
      lateSavi: null,
      lateMsavi: null,
      lateNdwi: null,
      lateNbr: null,
      lateNdsi: null,
      lateSsi: null,
      lastDate: '',
      count: 0,
    }
  }
  const mid = Math.max(1, Math.floor(n / 2))
  const early = withNdvi.slice(0, mid)
  const late = withNdvi.slice(mid)
  const lateRows = late.length ? late : withNdvi
  const last = withNdvi[withNdvi.length - 1]!
  return {
    earlyNdvi: meanOf(early.map(d => d.ndvi)),
    lateNdvi: meanOf(lateRows.map(d => d.ndvi)),
    lateNdmi: meanOf(lateRows.map(d => d.ndmi)),
    lateNdre: meanOf(lateRows.map(d => d.ndre)),
    lateEvi: meanOf(lateRows.map(d => d.evi)),
    lateSavi: meanOf(lateRows.map(d => d.savi)),
    lateMsavi: meanOf(lateRows.map(d => d.msavi)),
    lateNdwi: meanOf(lateRows.map(d => d.ndwi)),
    lateNbr: meanOf(lateRows.map(d => d.nbr)),
    lateNdsi: meanOf(lateRows.map(d => d.ndsi)),
    lateSsi: meanOf(lateRows.map(d => d.ssi)),
    lastDate: last.date,
    count: n,
  }
}

function setIfMissing(
  row: AgriObjectReportRow,
  key: AgriObjectFieldKey,
  value: string | number,
  fromLayer: boolean,
): boolean {
  if (fromLayer && row[key] !== NOT_AVAILABLE) return false
  if (value === NOT_AVAILABLE) return false
  row[key] = value
  return true
}

function addGap(
  gaps: AgriObjectGapRow[],
  objectId: string,
  field: string,
  reason: string,
  requiredDataset: string,
  recommendedSolution: string,
) {
  gaps.push({ objectId, field, reason, requiredDataset, recommendedSolution })
}

function addMethod(
  methods: AgriObjectMethodRow[],
  row: Omit<AgriObjectMethodRow, never>,
) {
  methods.push(row)
}

export type BuildAgriculturalObjectIntelligenceInput = {
  plots: CropAlertFieldInput[]
  features?: AgriObjectSourceFeature[]
  layerName: string
  fromDate: string
  toDate: string
  acquisitionDate?: string
  layerIds?: string[]
  /** Reuse already-fetched zonal series keyed by fieldKey. */
  dailyByFieldKey?: Map<string, SentinelHubDailyIndexMeans[]>
  /** Prithvi / country phenology crop typing keyed by fieldKey (field-boundary path). */
  cropByFieldKey?: Map<string, { cropType: string; confidencePct: number; engine: string }>
  cropEngineLabel?: string
  signal?: AbortSignal
  onProgress?: (p: AgriObjectIntelProgress) => void
}

export async function buildAgriculturalObjectIntelligenceModel(
  input: BuildAgriculturalObjectIntelligenceInput,
): Promise<AgriculturalObjectIntelligenceModel> {
  const {
    plots,
    features = [],
    layerName,
    fromDate,
    toDate,
    acquisitionDate,
    layerIds = ['NDVI'],
    dailyByFieldKey: reuseDaily,
    cropByFieldKey,
    cropEngineLabel,
    signal,
    onProgress,
  } = input

  const emit = (stage: AgriObjectIntelProgressStage, label: string, done: number, total: number) => {
    onProgress?.({ stage, label, done, total })
  }

  emit('reading_layer', 'Reading selected layer', 0, 1)
  const featureByKey = new Map(features.map(f => [f.fieldKey, f.feature]))
  const usable = plots.filter(p => p.geometry)
  emit('extracting_objects', 'Extracting objects', usable.length, usable.length)

  emit('loading_sentinel2', 'Loading Sentinel-2 imagery', 0, Math.max(1, usable.length))
  let dailyByFieldKey = reuseDaily
  if (!dailyByFieldKey || ![...dailyByFieldKey.values()].some(rows => rows?.length)) {
    const fetched = await fetchPlotTimeSeriesDailyByField(
      usable,
      layerIds.length ? layerIds : ['NDVI'],
      fromDate,
      toDate,
      {
        signal,
        onProgress: (done, total) => emit('loading_sentinel2', 'Loading Sentinel-2 imagery', done, total),
      },
    )
    dailyByFieldKey = fetched.dailyByFieldKey
  } else {
    emit('loading_sentinel2', 'Loading Sentinel-2 imagery', usable.length, usable.length)
  }

  // One Open-Meteo archive pull for ET₀ / rain (AOI centroid) — enables water answers.
  emit('eo_indicators', 'Loading Open-Meteo ET₀ / weather', 0, 1)
  let weatherEt0TotalMm: number | null = null
  let weatherRainTotalMm: number | null = null
  let weatherNote = 'Open-Meteo unavailable'
  {
    const anchor = usable.find(p => {
      const c = p.centroid
      return Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])
    })
    const lat = anchor?.centroid?.[1]
    const lon = anchor?.centroid?.[0]
    if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
      try {
        const hist = await fetchOpenMeteoHistoryRange(lat, lon, fromDate, toDate)
        let et0 = 0
        let rain = 0
        let nEt = 0
        for (const p of hist.points) {
          if (p.et0Mm != null && Number.isFinite(p.et0Mm)) {
            et0 += p.et0Mm
            nEt++
          }
          if (p.precipitationMm != null && Number.isFinite(p.precipitationMm)) {
            rain += p.precipitationMm
          }
        }
        if (nEt > 0) {
          weatherEt0TotalMm = Number(et0.toFixed(1))
          weatherRainTotalMm = Number(rain.toFixed(1))
          weatherNote = `Open-Meteo ERA5 ET₀=${weatherEt0TotalMm} mm, rain=${weatherRainTotalMm} mm (${fromDate}→${toDate})`
        }
      } catch {
        weatherNote = 'Open-Meteo archive request failed — using NDVI-only water proxies'
      }
    }
  }
  emit('eo_indicators', 'Calculating EO indicators', 0, usable.length)

  emit('object_analysis', 'Running object-level analysis', 0, usable.length)

  const objects: AgriObjectReportRow[] = []
  const geometry: AgriObjectGeometryRow[] = []
  const sentinel2: AgriObjectS2AnalysisRow[] = []
  const timeSeries: AgriObjectTimeSeriesRow[] = []
  const methods: AgriObjectMethodRow[] = []
  const gaps: AgriObjectGapRow[] = []
  const equations: AgriObjectEquationRow[] = []
  const methodsSeen = new Set<string>()
  const equationsSeen = new Set<string>()

  const acq = String(acquisitionDate || toDate || '').slice(0, 10)
  const layerIndexLabel = (layerIds.length ? layerIds : ['NDVI']).join(', ')
  const satellite = `Layer index: ${layerIndexLabel} · Sentinel-2 zonal + Open-Meteo`

  const pushEquation = (row: AgriObjectEquationRow) => {
    const key = `${row.field}|${row.equation}`
    if (equationsSeen.has(key)) return
    equationsSeen.add(key)
    equations.push(row)
  }

  for (let i = 0; i < usable.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const plot = usable[i]!
    const feat = featureByKey.get(plot.fieldKey)
    const props = (feat?.properties ?? {}) as Record<string, unknown>
    const mapped = mapLayerAttributesToAgriFields({
      props,
      geometry: plot.geometry ?? feat?.geometry ?? null,
      fallbackObjectId: plot.objectId || plot.fieldKey,
      fallbackName: plot.farmName,
    })
    const fromLayer = new Map(mapped.map(m => [m.key, m.source === 'layer' || m.source === 'geometry']))
    const row = {
      ...mappedFieldsToRecord(mapped),
      fieldKey: plot.fieldKey,
    } as AgriObjectReportRow

    const objectId = String(row.objectId)
    const daily = dailyByFieldKey.get(plot.fieldKey) ?? []
    const win = splitWindowMeans(daily)

    emit('eo_indicators', 'Calculating EO indicators', i, usable.length)

    // Vegetation indices from zonal S2 (EXAMPLE columns: NDVI / NDRE / NDMI)
    setIfMissing(row, 'ndvi', numOrNa(win.lateNdvi, 2), fromLayer.get('ndvi') === true)
    setIfMissing(row, 'ndre', numOrNa(win.lateNdre, 2), fromLayer.get('ndre') === true)
    setIfMissing(row, 'ndmi', numOrNa(win.lateNdmi, 2), fromLayer.get('ndmi') === true)
    const vegParts = [
      win.lateNdvi != null ? `NDVI=${win.lateNdvi.toFixed(3)}` : null,
      win.lateEvi != null ? `EVI=${win.lateEvi.toFixed(3)}` : null,
      win.lateSavi != null ? `SAVI=${win.lateSavi.toFixed(3)}` : null,
      win.lateMsavi != null ? `MSAVI=${win.lateMsavi.toFixed(3)}` : null,
      win.lateNdre != null ? `NDRE=${win.lateNdre.toFixed(3)}` : null,
    ].filter(Boolean)
    if (vegParts.length) {
      setIfMissing(row, 'vegetationIndex', vegParts.join('; '), fromLayer.get('vegetationIndex') === true)
    } else if (row.vegetationIndex === NOT_AVAILABLE && row.ndvi === NOT_AVAILABLE) {
      addGap(
        gaps,
        objectId,
        'NDVI',
        'No valid Sentinel-2 zonal NDVI observations in the selected date range',
        'Cloud-free Sentinel-2 L2A for the AOI date range',
        'Widen the date range or reduce cloud cover threshold and re-run Time Series',
      )
    }

    const vegCover = estimateVegetationCoveragePct(win.lateNdvi)
    if (vegCover != null) {
      setIfMissing(
        row,
        'treeVegetationCoveragePct',
        vegCover,
        fromLayer.get('treeVegetationCoveragePct') === true,
      )
    }

    const waterStress = waterStressFromNdmi(win.lateNdmi)
    if (waterStress !== NOT_AVAILABLE) {
      setIfMissing(row, 'waterStressIndicator', waterStress, fromLayer.get('waterStressIndicator') === true)
    }
    const soilMoist = soilMoistureProxyFromNdmi(win.lateNdmi)
    if (soilMoist !== NOT_AVAILABLE) {
      setIfMissing(row, 'soilMoistureIndicator', soilMoist, fromLayer.get('soilMoistureIndicator') === true)
    }

    // Salinity proxy from NDSI/SSI or NDVI/NDMI fallback (labeled estimate)
    {
      const sal = soilSalinityProxyFromIndices({
        ndsi: win.lateNdsi,
        ssi: win.lateSsi,
        ndvi: win.lateNdvi,
        ndmi: win.lateNdmi,
      })
      if (sal !== NOT_AVAILABLE) {
        setIfMissing(row, 'soilSalinityIndicator', sal, fromLayer.get('soilSalinityIndicator') === true)
      }
    }

    // Crop health from NDVI if not on layer
    const health = cropHealthFromNdvi(win.lateNdvi)
    if (health !== NOT_AVAILABLE) {
      setIfMissing(row, 'cropHealthStatus', health, fromLayer.get('cropHealthStatus') === true)
    }

    // Land-cover / agricultural status from S2 when not on the layer
    const landCover = landCoverFromSpectralIndices({
      ndvi: win.lateNdvi,
      ndwi: win.lateNdwi,
    })
    if (landCover !== NOT_AVAILABLE) {
      setIfMissing(row, 'landCoverType', landCover, fromLayer.get('landCoverType') === true)
    }

    const agriStatus = agriculturalStatusFromEvidence({
      ndvi: win.lateNdvi,
      ndwi: win.lateNdwi,
      objectType: row.objectType !== NOT_AVAILABLE ? row.objectType : props.Structure_Type ?? props.structure_type,
    })
    if (agriStatus !== NOT_AVAILABLE) {
      setIfMissing(row, 'agriculturalStatus', agriStatus, fromLayer.get('agriculturalStatus') === true)
    }

    // Crop type — layer wins; Prithvi/country per parcel when provided; spectral proxy only outside field-boundary path
    const parcelCrop = cropByFieldKey?.get(plot.fieldKey)
    const hlsCropAttempted = cropByFieldKey != null
    const realCropOnly = hlsCropAttempted && (cropByFieldKey?.size ?? 0) > 0
    let hadLayerCrop = fromLayer.get('cropType') === true && row.cropType !== NOT_AVAILABLE
    if (row.cropType === NOT_AVAILABLE && parcelCrop?.cropType) {
      row.cropType = parcelCrop.cropType
      hadLayerCrop = true
    }
    if (row.cropType === NOT_AVAILABLE) {
      if (!hlsCropAttempted || !parcelCrop) {
        if (!realCropOnly) {
          const proxyCrop = cropTypeSpectralProxy({ ndvi: win.lateNdvi, ndwi: win.lateNdwi })
          if (proxyCrop !== NOT_AVAILABLE) {
            row.cropType = proxyCrop
          } else if (!hlsCropAttempted) {
            row.cropType = 'Unknown cover (insufficient Sentinel-2 signal)'
          }
        }
      }
    }
    if (row.cropTypeConfidencePct === NOT_AVAILABLE || row.cropTypeConfidencePct === '--') {
      if (parcelCrop?.cropType && Number.isFinite(parcelCrop.confidencePct)) {
        row.cropTypeConfidencePct = Math.round(parcelCrop.confidencePct)
      } else if (!realCropOnly) {
        const conf = cropConfidenceFromEvidence({
          ndvi: win.lateNdvi,
          observationCount: win.count,
          fromLayerCrop: hadLayerCrop,
        })
        if (conf !== NOT_AVAILABLE) row.cropTypeConfidencePct = conf
      }
    }
    const growthProxy = cropGrowthStageFromNdvi({
      lateNdvi: win.lateNdvi,
      earlyNdvi: win.earlyNdvi,
      observationCount: win.count,
    })
    if (row.cropGrowthStage === NOT_AVAILABLE) {
      row.cropGrowthStage =
        growthProxy !== NOT_AVAILABLE ? growthProxy : 'Insufficient NDVI for phenology stage'
    }

    // Cultivated area ≈ geometry area when object looks agricultural
    if (row.cultivatedAreaByCropHa === NOT_AVAILABLE) {
      const areaNum = typeof row.estimatedAreaHa === 'number' ? row.estimatedAreaHa : Number(row.estimatedAreaHa)
      if (Number.isFinite(areaNum) && areaNum > 0) {
        row.cultivatedAreaByCropHa = Number(areaNum.toFixed(4))
      }
    }

    const pheno = estimatePhenologyDates(daily)
    if (row.estimatedPlantingDate === NOT_AVAILABLE) {
      row.estimatedPlantingDate = pheno?.planting || fromDate
    }
    if (row.estimatedHarvestDate === NOT_AVAILABLE) {
      row.estimatedHarvestDate = pheno?.harvest || toDate
    }
    if (pheno) {
      pushEquation({
        field: 'Estimated Planting / Harvest Date',
        equation:
          'Planting ≈ first green-up where NDVI crosses <0.28 → ≥0.32; Harvest ≈ first date after peak with ΔNDVI ≤ −0.08',
        inputs: `daily NDVI series (${win.count} scenes)`,
        layerIndex: layerIndexLabel,
        resultExample: `${pheno.planting} → ${pheno.harvest}`,
      })
    }

    // Water / ET — Open-Meteo ET₀ × Kc(NDVI); report cells = clean numbers only
    const periodDays = Math.max(
      1,
      Math.round((Date.parse(toDate) - Date.parse(fromDate)) / (24 * 3600 * 1000)) + 1,
    )
    const etEst = estimateActualEtMm({
      et0TotalMm: weatherEt0TotalMm,
      ndvi: win.lateNdvi,
      periodDays,
    })
    if (row.actualEt === NOT_AVAILABLE && etEst) {
      row.actualEt = etEst.etaMm
      pushEquation({
        field: 'Actual ET (mm)',
        equation: etEst.formula,
        inputs:
          etEst.et0Mm != null
            ? `ET₀=${etEst.et0Mm} mm (Open-Meteo), NDVI=${win.lateNdvi?.toFixed(3) ?? '—'}, Kc=${etEst.kc}`
            : `NDVI=${win.lateNdvi?.toFixed(3) ?? '—'}, days=${periodDays}, Kc=${etEst.kc}`,
        layerIndex: layerIndexLabel,
        resultExample: String(etEst.etaMm),
      })
      if (win.lateNdvi != null) {
        pushEquation({
          field: 'Kc (crop coefficient)',
          equation: kcFormula(win.lateNdvi),
          inputs: `NDVI late-window mean`,
          layerIndex: layerIndexLabel,
          resultExample: String(etEst.kc),
        })
      }
    } else if (fromLayer.get('actualEt') && row.actualEt !== NOT_AVAILABLE) {
      const raw = String(row.actualEt)
      if (/^\d+(\.\d+)?$/.test(raw)) {
        row.actualEt = Number(raw)
      }
    }
    if (row.cropWaterRequirement === NOT_AVAILABLE && etEst) {
      row.cropWaterRequirement = etEst.etaMm
      pushEquation({
        field: 'Crop Water Requirement (mm)',
        equation: 'CWR ≈ ETc ≈ ETa (period total mm)',
        inputs: `ETa=${etEst.etaMm} mm`,
        layerIndex: layerIndexLabel,
        resultExample: String(etEst.etaMm),
      })
    }
    if (row.irrigationPerformance === NOT_AVAILABLE) {
      const irr = irrigationPerformanceFromNdmi(win.lateNdmi)
      row.irrigationPerformance = irr !== NOT_AVAILABLE ? irr : 'Unknown'
      pushEquation({
        field: 'Irrigation Performance',
        equation: 'NDMI < −0.05 → Under-irrigated; < 0.12 → Adequately irrigated; else Well supplied',
        inputs: `NDMI=${win.lateNdmi?.toFixed(3) ?? '—'}`,
        layerIndex: layerIndexLabel,
        resultExample: String(row.irrigationPerformance),
      })
    }
    const areaHaNum =
      typeof row.estimatedAreaHa === 'number'
        ? row.estimatedAreaHa
        : Number(String(row.estimatedAreaHa).replace(/[^\d.-]/g, ''))
    if (row.estimatedWaterUse === NOT_AVAILABLE && etEst && Number.isFinite(areaHaNum) && areaHaNum > 0) {
      const m3 = Number((etEst.etaMm * areaHaNum * 10).toFixed(0)) // 1 mm · 1 ha = 10 m³
      row.estimatedWaterUse = m3
      pushEquation({
        field: 'Estimated Water Use (m³)',
        equation: 'Volume_m³ = ETa_mm × Area_ha × 10',
        inputs: `ETa=${etEst.etaMm} mm, Area=${areaHaNum} ha`,
        layerIndex: layerIndexLabel,
        resultExample: String(m3),
      })
    } else if (row.estimatedWaterUse === NOT_AVAILABLE && etEst) {
      row.estimatedWaterUse = etEst.etaMm
    }

    const yieldTHa =
      typeof row.estimatedYield === 'number'
        ? row.estimatedYield
        : estimateYieldTHa(win.lateNdvi)
    if (row.estimatedYield === NOT_AVAILABLE && yieldTHa != null) {
      row.estimatedYield = yieldTHa
      if (win.lateNdvi != null) {
        pushEquation({
          field: 'Estimated Yield (t/ha)',
          equation: yieldTHaFormula(win.lateNdvi),
          inputs: `NDVI=${win.lateNdvi.toFixed(3)} (cereal-equivalent proxy)`,
          layerIndex: layerIndexLabel,
          resultExample: String(yieldTHa),
        })
      }
    }
    if (
      row.estimatedTotalProduction === NOT_AVAILABLE &&
      yieldTHa != null &&
      Number.isFinite(areaHaNum) &&
      areaHaNum > 0
    ) {
      const tons = Number((yieldTHa * areaHaNum).toFixed(2))
      row.estimatedTotalProduction = tons
      pushEquation({
        field: 'Estimated Total Production (t)',
        equation: 'Production_t = Yield_t/ha × Area_ha',
        inputs: `Yield=${yieldTHa} t/ha, Area=${areaHaNum} ha`,
        layerIndex: layerIndexLabel,
        resultExample: String(tons),
      })
    } else if (row.estimatedTotalProduction === NOT_AVAILABLE && yieldTHa != null) {
      row.estimatedTotalProduction = yieldTHa
    }
    if (row.yieldProductionConfidence === NOT_AVAILABLE) {
      const yConf = Math.min(
        70,
        30 + Math.min(25, win.count * 4) + (hadLayerCrop ? 15 : 0) + (weatherEt0TotalMm != null ? 5 : 0),
      )
      row.yieldProductionConfidence = yConf
    }
    if (row.waterProductivity === NOT_AVAILABLE && etEst && yieldTHa != null && etEst.etaMm > 0) {
      const wp = Number(((100 * yieldTHa) / etEst.etaMm).toFixed(2))
      row.waterProductivity = wp
      pushEquation({
        field: 'Water Productivity (kg/m³)',
        equation: 'WP = 100 × Yield_t/ha / ETa_mm',
        inputs: `Yield=${yieldTHa}, ETa=${etEst.etaMm}`,
        layerIndex: layerIndexLabel,
        resultExample: String(wp),
      })
    }

    if (row.landCropSuitability === NOT_AVAILABLE) {
      const suit = landCropSuitabilityFromEvidence({
        ndvi: win.lateNdvi,
        waterStress: String(row.waterStressIndicator),
        agriculturalStatus: String(row.agriculturalStatus),
      })
      row.landCropSuitability = suit !== NOT_AVAILABLE ? suit : 'Unknown'
      pushEquation({
        field: 'Land / Crop Suitability',
        equation:
          'NDVI≥0.5 & low stress → Highly suitable; ≥0.35 → Moderately; ≥0.2 → Marginally; else Poorly suited',
        inputs: `NDVI=${win.lateNdvi?.toFixed(3) ?? '—'}, water stress=${row.waterStressIndicator}`,
        layerIndex: layerIndexLabel,
        resultExample: String(row.landCropSuitability),
      })
    }

    if (row.landDegradationIndicator === NOT_AVAILABLE) {
      row.landDegradationIndicator = 'Pending assessment'
    }

    if (row.objectType === NOT_AVAILABLE) {
      const st = plot.structureType || props.Structure_Type || props.structure_type || props.type
      row.objectType = st != null && String(st).trim() ? String(st) : 'Agricultural object'
    }
    if (row.objectName === NOT_AVAILABLE) {
      row.objectName = plot.farmName || `Object ${objectId}`
    }

    // Index-layer derived notes
    if (win.lateNdvi != null) {
      pushEquation({
        field: 'NDVI / vigor metrics',
        equation: 'Late-window mean of zonal daily means for selected Layer index dates',
        inputs: `scenes=${win.count}, late NDVI=${win.lateNdvi.toFixed(3)}`,
        layerIndex: layerIndexLabel,
        resultExample: String(Number(win.lateNdvi.toFixed(2))),
      })
    }

    emit('temporal_analysis', 'Running temporal analysis', i, usable.length)
    const change = classifyNdviChange(win.earlyNdvi, win.lateNdvi, win.count)
    const ndviDelta =
      win.earlyNdvi != null && win.lateNdvi != null ? win.lateNdvi - win.earlyNdvi : null

    if (
      row.landDegradationIndicator === NOT_AVAILABLE ||
      row.landDegradationIndicator === 'Pending assessment' ||
      row.landDegradationIndicator === 'Pending multi-date NDVI assessment'
    ) {
      if (win.count >= 2 && ndviDelta != null && win.lateNdvi != null) {
        if (ndviDelta <= -0.12 && win.lateNdvi < 0.28) {
          row.landDegradationIndicator = 'Possible degradation'
        } else if (ndviDelta >= 0.08 && win.lateNdvi >= 0.35) {
          row.landDegradationIndicator = 'Improving / no degradation'
        } else {
          row.landDegradationIndicator = 'No strong signal'
        }
        pushEquation({
          field: 'Land-Degradation Indicator',
          equation:
            'ΔNDVI = late − early; if Δ≤−0.12 & late NDVI<0.28 → Possible degradation; if Δ≥0.08 & late≥0.35 → Improving',
          inputs: `early=${win.earlyNdvi?.toFixed(3)}, late=${win.lateNdvi?.toFixed(3)}, Δ=${ndviDelta.toFixed(3)}`,
          layerIndex: layerIndexLabel,
          resultExample: String(row.landDegradationIndicator),
        })
      } else if (win.lateNdvi != null) {
        row.landDegradationIndicator = win.lateNdvi < 0.2 ? 'Low vigor risk' : 'Insufficient multi-date'
      } else {
        row.landDegradationIndicator = 'Unknown'
      }
    }

    if (change === 'Insufficient historical data') {
      row.changeFromPreviousPeriod = daily.length <= 1 ? 'Stable / single-date' : 'Stable / low contrast'
      row.newlyCultivatedAbandoned =
        win.lateNdvi != null && win.lateNdvi >= 0.25 ? 'Cultivated signal' : 'No clear change'
    } else {
      row.changeFromPreviousPeriod = change
      row.newlyCultivatedAbandoned =
        change === 'Newly cultivated' || change === 'Potentially abandoned'
          ? change
          : 'Stable cultivation'
    }
    const activeStatus = activeStatusFromTemporal({ change, lateNdvi: win.lateNdvi })
    if (activeStatus !== NOT_AVAILABLE) {
      setIfMissing(row, 'activeStatus', activeStatus, fromLayer.get('activeStatus') === true)
    } else if (row.activeStatus === NOT_AVAILABLE) {
      row.activeStatus = win.lateNdvi != null && win.lateNdvi >= 0.2 ? 'Active' : 'Inactive'
    }
    const insp = classifyInspectionPriority({
      change,
      lateNdvi: win.lateNdvi,
      lateNdmi: win.lateNdmi,
      ndviDelta,
    })
    const anomalyYes =
      insp.priority === 'HIGH' ||
      insp.priority === 'MEDIUM' ||
      change === 'Potentially abandoned' ||
      change === 'Declining'
    row.anomalyDetected = anomalyYes ? `Yes — ${insp.anomaly}` : 'No'
    row.priorityForFieldInspection =
      insp.priority === 'HIGH'
        ? 'High'
        : insp.priority === 'MEDIUM'
          ? 'Medium'
          : 'Low / Not Required'
    row.recommendedActionInsight =
      insp.priority === 'HIGH'
        ? `Prioritize field inspection — ${insp.anomaly}`
        : insp.priority === 'MEDIUM'
          ? `Investigate vegetation / moisture stress — ${insp.anomaly}`
          : anomalyYes
            ? 'Continue monitoring; minor vegetation change detected'
            : 'Continue routine monitoring'

    row.timeSeriesDataAvailable =
      daily.length > 1
        ? `Yes (${daily.length})`
        : daily.length === 1
          ? 'Limited (1)'
          : 'No'
    row.satelliteDataUsed = `Sentinel-2 L2A · ${layerIndexLabel} · ${fromDate}→${toDate}`
    row.aiAnalyticalMethodUsed = cropEngineLabel
      ? `Sentinel-2 zonal + ${cropEngineLabel} crop typing + Open-Meteo ET₀×Kc`
      : 'Layer-index zonal stats + spectral rules + Open-Meteo ET₀×Kc'

    row.capabilityStatus = (
      daily.length > 0
        ? 'Available — filled from Layer index analysis'
        : 'AVAILABLE – ADDITIONAL DATA REQUIRED'
    ) as AgriObjectCapabilityStatus

    row.requiredGroundTruthData = hadLayerCrop
      ? 'Optional yield / soil lab for calibration'
      : 'Optional field crop type / yield samples'
    row.additionalDatasetRequired =
      weatherEt0TotalMm != null ? 'Optional irrigation logs / SoilGrids' : 'Open-Meteo retry / soil survey'
    const accPct = Math.min(
      75,
      40 + Math.min(20, win.count * 3) + (weatherEt0TotalMm != null ? 10 : 0) + (hadLayerCrop ? 10 : 0),
    )
    row.expectedAccuracy = `±${Math.max(15, 100 - accPct)}%`
    row.technicalLimitations =
      '10–20 m S2; ETa=Kc×ET₀ proxy; yield cereal-eq.; see Equations sheet'
    row.additionalEoAiOutputs = 'NDVI trend · SAR moisture · high-res crop ID'
    const filledS2 = [
      row.ndvi !== NOT_AVAILABLE ? 'NDVI' : null,
      row.ndre !== NOT_AVAILABLE ? 'NDRE' : null,
      row.ndmi !== NOT_AVAILABLE ? 'NDMI' : null,
      row.landCoverType !== NOT_AVAILABLE ? 'land-cover' : null,
      row.cropHealthStatus !== NOT_AVAILABLE ? 'crop-health' : null,
      etEst ? 'ETa' : null,
      yieldTHa != null ? 'yield' : null,
    ].filter(Boolean)
    row.additionalObservationsRecommendations = filledS2.length
      ? `Filled from ${layerIndexLabel}: ${filledS2.join(', ')}. See Equations & Methods sheet.`
      : `Widen date range for ${layerIndexLabel}; ${weatherNote}`

    // Soft validation tips (not "Not Available")
    if (!hadLayerCrop) {
      addGap(
        gaps,
        objectId,
        'Crop Type',
        realCropOnly
          ? 'Prithvi / country phenology did not classify this parcel'
          : 'Crop type filled from spectral class — not a named cultivar',
        realCropOnly
          ? 'Widen season window or verify Sentinel Hub + Prithvi credentials'
          : 'Ground-truth crop labels or trained classifier on the layer',
        realCropOnly
          ? 'Retry with a longer HLS window or join farm crop attributes'
          : 'Join farm crop attributes to raise confidence above spectral estimate',
      )
    }
    if (weatherEt0TotalMm == null) {
      addGap(
        gaps,
        objectId,
        'Actual ET',
        'ETa used NDVI period proxy because Open-Meteo ET₀ was unavailable for this AOI/period',
        'Open-Meteo ERA5 archive at object centroid',
        'Retry export with network access to archive-api.open-meteo.com',
      )
    }

    // Geometry sheet
    geometry.push({
      objectId,
      objectType: String(row.objectType),
      objectName: String(row.objectName),
      geometryType: plot.geometry?.type || feat?.geometry?.type || NOT_AVAILABLE,
      centroidLatitude: row.centroidLatitude,
      centroidLongitude: row.centroidLongitude,
      areaHa: row.estimatedAreaHa,
      geojson: plot.geometry
        ? JSON.stringify(plot.geometry)
        : feat?.geometry
          ? JSON.stringify(feat.geometry)
          : NOT_AVAILABLE,
    })

    // S2 analysis sheet (latest valid scene / late window)
    sentinel2.push({
      objectId,
      imageDate: win.lastDate || acq || NOT_AVAILABLE,
      satellite: 'Sentinel-2',
      processingLevel: 'L2A (Sentinel Hub)',
      cloudCover: NOT_AVAILABLE,
      ndvi: numOrNa(win.lateNdvi),
      evi: numOrNa(win.lateEvi),
      savi: numOrNa(win.lateSavi),
      msavi: numOrNa(win.lateMsavi),
      ndre: numOrNa(win.lateNdre),
      ndmi: numOrNa(win.lateNdmi),
      ndwi: numOrNa(win.lateNdwi),
      nbr: numOrNa(win.lateNbr),
      vegetationCoverage: vegCover ?? NOT_AVAILABLE,
      waterStress,
      soilMoistureProxy: soilMoist,
    })
    if (win.lateMsavi == null && daily.length > 0) {
      addGap(
        gaps,
        objectId,
        'MSAVI',
        'MSAVI not present in returned zonal series for this object/date range',
        'Sentinel-2 B04/B08 via Statistical API MSAVI band',
        'Re-run analysis after MSAVI-enabled evalscript deploy; confirm Statistical API path (not WMS-only fallback)',
      )
    }
    if (win.lateNbr == null && daily.length > 0) {
      addGap(
        gaps,
        objectId,
        'NBR',
        'NBR not present in returned zonal series for this object/date range',
        'Sentinel-2 B08/B12 via Statistical API NBR band',
        'Re-run analysis with NBR-enabled evalscript / Statistical API',
      )
    }
    if (!win.lastDate) {
      addGap(
        gaps,
        objectId,
        'Cloud Cover / Processing metadata',
        'Scene cloud cover % is not returned by the current zonal API payload',
        'Scene metadata from Sentinel Hub catalog',
        'Extend stats response to include catalog cloudCover when available',
      )
    }

    // Time series rows
    let prevNdvi: number | null = null
    for (const d of daily) {
      const ch =
        prevNdvi != null && d.ndvi != null
          ? classifyNdviChange(prevNdvi, d.ndvi, 2)
          : 'Insufficient historical data'
      timeSeries.push({
        objectId,
        date: d.date,
        ndvi: numOrNa(d.ndvi),
        ndmi: numOrNa(d.ndmi),
        ndre: numOrNa(d.ndre),
        evi: numOrNa(d.evi),
        vegetationCondition: cropHealthFromNdvi(d.ndvi),
        changeFromPreviousPeriod: ch,
      })
      if (d.ndvi != null) prevNdvi = d.ndvi
    }

    objects.push(row)
    emit('object_analysis', 'Running object-level analysis', i + 1, usable.length)
  }

  // Shared methods sheet (one row per dictionary field describing source strategy)
  for (const def of AGRI_OBJECT_FIELD_DEFS) {
    const key = `global:${def.key}`
    if (methodsSeen.has(key)) continue
    methodsSeen.add(key)
    let capability: AgriObjectCapabilityStatus = 'AVAILABLE – ADDITIONAL DATA REQUIRED'
    let source = 'Layer attribute or Not Available'
    let method = 'Attribute mapper (aliases)'
    let limitations = ''
    if (
      [
        'vegetationIndex',
        'ndvi',
        'ndre',
        'ndmi',
        'treeVegetationCoveragePct',
        'waterStressIndicator',
        'soilMoistureIndicator',
        'cropHealthStatus',
        'cropGrowthStage',
        'agriculturalStatus',
        'activeStatus',
        'landCoverType',
        'changeFromPreviousPeriod',
        'anomalyDetected',
        'priorityForFieldInspection',
      ].includes(def.key)
    ) {
      capability = 'AVAILABLE – CALCULATED FROM SENTINEL-2'
      source = 'Sentinel Hub Statistical / WMS zonal API'
      method =
        def.key === 'landCoverType' || def.key === 'agriculturalStatus'
          ? 'Coarse NDVI/NDWI decision rules (proxy, not trained LULC)'
          : def.key === 'activeStatus'
            ? 'Multi-temporal NDVI change + late-window vigor rules'
            : 'Object-based zonal mean indices + temporal rules'
      limitations =
        def.key === 'landCoverType' || def.key === 'agriculturalStatus' || def.key === 'activeStatus'
          ? 'Indicative spectral proxy only; layer attributes override when present'
          : 'Clouds, sparse dates; moisture/stress are proxies'
    } else if (
      ['actualEt', 'cropWaterRequirement', 'irrigationPerformance', 'estimatedWaterUse', 'waterProductivity'].includes(
        def.key,
      )
    ) {
      capability = 'AVAILABLE – CALCULATED FROM SENTINEL-2'
      source = 'Open-Meteo ET₀ × Kc(NDVI) and NDMI irrigation proxy'
      method = 'FAO-style Kc(NDVI)×ET₀; NDMI irrigation performance; yield÷water WP'
      limitations = 'Indicative water balance — not field energy-balance ETₐ'
    } else if (
      ['cropType', 'estimatedPlantingDate', 'estimatedHarvestDate', 'cropTypeConfidencePct', 'estimatedYield', 'estimatedTotalProduction', 'landCropSuitability'].includes(
        def.key,
      )
    ) {
      capability = 'AVAILABLE – CALCULATED FROM SENTINEL-2'
      source = 'Layer attributes when present; else Sentinel-2 spectral / phenology proxies'
      method = 'NDVI/NDWI class rules + green-up / senescence dates + cereal-equivalent yield curve'
      limitations = 'Not a named crop cultivar or calibrated yield model without ground truth'
    } else if (['centroidLatitude', 'centroidLongitude', 'estimatedAreaHa', 'boundaryCoordinates'].includes(def.key)) {
      capability = 'AVAILABLE'
      source = 'Feature geometry (geodesic area / centroid)'
      method = 'GIS geometry derivation'
    } else if (def.aliases.length) {
      capability = 'AVAILABLE'
      source = 'Selected agricultural/object layer properties'
      method = 'Dynamic property alias match'
    }
    addMethod(methods, {
      field: def.label,
      source,
      dataset: source,
      satellite: capability.includes('SENTINEL') ? 'Sentinel-2' : '—',
      resolution: capability.includes('SENTINEL') ? '10–20 m' : '—',
      acquisitionDate: acq || `${fromDate} → ${toDate}`,
      method,
      confidence: capability.includes('PROXY') || limitations.includes('proxy') ? 'Indicative' : 'As-measured / as-stored',
      capabilityStatus: capability,
      limitations,
    })
  }

  emit('building_excel', 'Building Excel report', 1, 1)

  return {
    meta: {
      title: 'Agricultural Object Intelligence Report',
      exportedAt: new Date().toISOString(),
      layerName: layerName || 'Selected layer',
      fromDate,
      toDate,
      acquisitionDate: acq,
      satellite,
      objectCount: objects.length,
      analysisLayers: layerIds.length ? layerIds : ['NDVI'],
      layerIndexLabel,
    },
    objects,
    geometry,
    sentinel2,
    timeSeries,
    methods,
    gaps,
    equations,
    dashboardTimeSeries: aggregateAoiIndexTimeSeries(dailyByFieldKey),
  }
}

/** Human labels for export progress stages. */
export const AGRI_OBJECT_INTEL_STAGE_LABELS: Record<AgriObjectIntelProgressStage, string> = {
  reading_layer: 'Reading selected layer',
  extracting_objects: 'Extracting objects',
  loading_sentinel2: 'Loading Sentinel-2 imagery',
  object_analysis: 'Running object-level analysis',
  eo_indicators: 'Calculating EO indicators',
  temporal_analysis: 'Running temporal analysis',
  building_excel: 'Building Excel report',
  completed: 'Export completed',
}
