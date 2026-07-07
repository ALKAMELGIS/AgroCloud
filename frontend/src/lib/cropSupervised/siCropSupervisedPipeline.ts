/**
 * Supervised crop classification pipeline (browser).
 * Training samples → spectral features → Random Forest → classified + confidence maps.
 */

import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsEvalscriptProxyLayerName,
} from '../sentinelHubWmsLayers'
import { getSentinelHubWmsBaseUrl } from '../sentinelHubWmsInstance'
import type {
  CropClassificationJob,
  CropClassificationJobStatus,
} from '../siPrithviCropPipeline'
import { buildAccuracyReport } from './accuracyMetrics'
import { assertCropPanelProvider } from './cropDataProvider'
import { resolveCropPipelineProfile } from './cropProviderPipelineProfile'
import {
  bbox3857From4326,
  buildClassDefs,
  classIndexByName,
  extractAllSampleFeatures,
  geometryBbox4326,
  pixelFeatureVector,
  type IndexGrid,
} from './spectralFeatures'
import { meanFeaturesByClass, renderClassificationMaps } from './supervisedRenderer'
import { predictBatch, predictRandomForest, stratifiedSplit, trainRandomForest } from './randomForest'
import type { RunSupervisedInput, SupervisedClassificationOutput } from './types'

const INDEX_GRID_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B08", "B11", "SCL", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var scl = s.SCL;
  var cloud = (scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11);
  if (!s.dataMask || cloud) return [0, 0, 0, 0];
  var dNdvi = s.B08 + s.B04;
  var ndvi = dNdvi > 1e-6 ? (s.B08 - s.B04) / dNdvi : 0;
  var dNdwi = s.B03 + s.B08;
  var ndwi = dNdwi > 1e-6 ? (s.B03 - s.B08) / dNdwi : 0;
  var dNdmi = s.B08 + s.B11;
  var ndmi = dNdmi > 1e-6 ? (s.B08 - s.B11) / dNdmi : 0;
  function enc(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round((v + 1) * 127)));
  }
  return [enc(ndvi), enc(ndwi), enc(ndmi), 255];
}`

function toBase64(text: string): string {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(text)))
  return text
}

function evenlySpacedDates(season: { start: string; end: string }, count: number): string[] {
  const start = new Date(`${season.start}T00:00:00Z`).getTime()
  const end = new Date(`${season.end}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Invalid season range.')
  }
  const out: string[] = []
  const k = Math.max(2, count)
  for (let i = 0; i < k; i += 1) {
    const t = start + ((end - start) * i) / (k - 1)
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

async function fetchWmsImageData(
  url: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8ClampedArray> {
  const res = await fetch(url, { headers: { Accept: 'image/png' }, signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Sentinel Hub WMS GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height).data
  } finally {
    bitmap.close?.()
  }
}

async function fetchIndexGrid(
  opts: {
    bbox3857: [number, number, number, number]
    timeStart: string
    timeEnd: string
    cloudCoverage: number
    size: number
    layer: string
    evalscriptB64: string
  },
  signal?: AbortSignal,
): Promise<IndexGrid> {
  const [minX, minY, maxX, maxY] = opts.bbox3857
  const base = getSentinelHubWmsBaseUrl()
  let url =
    `${base}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(opts.layer)}` +
    `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${opts.size}&HEIGHT=${opts.size}` +
    `&TIME=${opts.timeStart}/${opts.timeEnd}` +
    `&MAXCC=${opts.cloudCoverage}` +
    `&SHOWLOGO=false&WARNINGS=false` +
    `&EVALSCRIPT=${encodeURIComponent(opts.evalscriptB64)}`
  url = appendSentinelHubWmsAccessToken(url)

  const data = await fetchWmsImageData(url, opts.size, opts.size, signal)
  const n = opts.size * opts.size
  const ndvi = new Float32Array(n)
  const ndwi = new Float32Array(n)
  const ndmi = new Float32Array(n)
  const valid = new Uint8Array(n)
  for (let p = 0; p < n; p += 1) {
    const i = p * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 128 || (r === 0 && g === 0 && b === 0)) {
      valid[p] = 0
      continue
    }
    ndvi[p] = r / 127 - 1
    ndwi[p] = g / 127 - 1
    ndmi[p] = b / 127 - 1
    valid[p] = 1
  }
  return { ndvi, ndwi, ndmi, valid, width: opts.size, height: opts.size }
}

function snapshot(
  jobId: string,
  status: CropClassificationJobStatus,
  progress: number,
  message: string,
  extra?: Partial<CropClassificationJob>,
): CropClassificationJob {
  return {
    id: jobId,
    mode: 'aoi',
    status,
    progress,
    message,
    result: null,
    error: null,
    ...extra,
  }
}

export async function runSupervisedCropClassification(
  jobId: string,
  input: RunSupervisedInput,
  onUpdate: (job: CropClassificationJob) => void,
  signal?: AbortSignal,
): Promise<CropClassificationJob> {
  const fail = (message: string): CropClassificationJob => {
    const job = snapshot(jobId, 'error', 1, 'Supervised classification failed.', { error: message })
    onUpdate(job)
    return job
  }

  try {
    if (!input.samples.length) return fail('Upload training samples with class labels first.')
    try {
      assertCropPanelProvider(input.dataProvider ?? 'satellite')
    } catch (err) {
      return fail(String((err as Error)?.message || err))
    }
    const pipelineProfile = resolveCropPipelineProfile(
      input.dataProvider ?? 'satellite',
      'supervised-ground-truth',
    )
    if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
      return fail('Supervised classification requires a browser environment.')
    }

    const classNames = [...new Set(input.samples.map(s => s.className))]
    const classDefs = buildClassDefs(classNames)
    const classMap = classIndexByName(classDefs)
    const holdout = input.holdoutFraction ?? 0.2

    const bbox4326 = geometryBbox4326(input.aoi)
    const bbox3857 = bbox3857From4326(bbox4326)
    const layer = resolveSentinelHubWmsEvalscriptProxyLayerName(getSentinelHubWmsLayerCatalog())
    const evalscriptB64 = toBase64(INDEX_GRID_EVALSCRIPT)
    const STEPS = input.timesteps ?? pipelineProfile.timestepsDefault
    const SIZE = 224
    const dates = evenlySpacedDates(input.season, STEPS)
    const grids: IndexGrid[] = []

    onUpdate(snapshot(jobId, 'fetching', 0.08, 'Fetching multi-date spectral imagery…'))
    for (let i = 0; i < dates.length; i += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      onUpdate(
        snapshot(
          jobId,
          'fetching',
          0.1 + (0.45 * i) / dates.length,
          `Fetching spectral series ${i + 1}/${dates.length} (${dates[i]})…`,
        ),
      )
      const day = new Date(`${dates[i]}T00:00:00Z`)
      const t0 = new Date(day.getTime() - 25 * 86400000).toISOString().slice(0, 10)
      const t1 = new Date(day.getTime() + 15 * 86400000).toISOString().slice(0, 10)
      try {
        grids.push(
          await fetchIndexGrid(
            { bbox3857, timeStart: t0, timeEnd: t1, cloudCoverage: 60, size: SIZE, layer, evalscriptB64 },
            signal,
          ),
        )
      } catch (gridErr) {
        if (gridErr instanceof DOMException && gridErr.name === 'AbortError') throw gridErr
      }
    }
    if (grids.length < 2) {
      return fail('Not enough cloud-free imagery for this AOI/season. Try a wider date range.')
    }

    onUpdate(snapshot(jobId, 'preprocessing', 0.58, 'Extracting spectral signatures from training samples…'))
    const signatures = extractAllSampleFeatures(input.samples, grids, bbox4326)
    if (signatures.length < classNames.length * 2) {
      return fail(
        `Only ${signatures.length} training signature(s) extracted — ensure samples overlap valid imagery inside the AOI.`,
      )
    }

    const X = signatures.map(s => s.features)
    const y = signatures.map(s => classMap.get(s.className.toLowerCase()) ?? 0)
    const labelNames = classDefs.map(d => d.name)

    const { train, test } = stratifiedSplit(y, holdout)
    if (!train.length || !test.length) {
      return fail('Not enough labelled samples per class for hold-out validation.')
    }

    onUpdate(snapshot(jobId, 'inferring', 0.72, 'Training Random Forest classifier…'))
    const trainX = train.map(i => X[i]!)
    const trainY = train.map(i => y[i]!)
    const model = trainRandomForest(trainX, trainY, { nTrees: 45, maxDepth: 10, seed: 7 })

    const testX = test.map(i => X[i]!)
    const testPred = predictBatch(model, testX)
    const yTrue = test.map(i => y[i]!)
    const yPred = testPred.map(p => p.classIndex)
    const accuracy = buildAccuracyReport(
      yTrue,
      yPred,
      labelNames,
      holdout,
      train.length,
      test.length,
    )

    onUpdate(snapshot(jobId, 'inferring', 0.88, 'Classifying AOI pixels…'))
    const { width, height } = grids[0]!
    const n = width * height
    const combinedValid = new Uint8Array(n)
    for (let p = 0; p < n; p += 1) {
      let ok = 1
      for (const g of grids) {
        if (!g.valid[p]) {
          ok = 0
          break
        }
      }
      combinedValid[p] = ok
    }

    const labels = new Int16Array(n).fill(-1)
    const confidence = new Float32Array(n)
    for (let p = 0; p < n; p += 1) {
      if (!combinedValid[p]) continue
      const feat = pixelFeatureVector(p, grids)
      if (!feat) continue
      const pred = predictRandomForest(model, feat)
      labels[p] = pred.classIndex
      confidence[p] = pred.confidence
    }

    const rendered = renderClassificationMaps(labels, confidence, combinedValid, width, height, classDefs)
    const signatureSummary = meanFeaturesByClass(signatures)

    const supervised: SupervisedClassificationOutput = {
      legend: classDefs.map(d => ({ id: d.index, name: d.name, color: d.color })),
      prediction: { url: rendered.predictionUrl, bounds: bbox4326 },
      confidence: { url: rendered.confidenceUrl, bounds: bbox4326 },
      classStats: rendered.classStats,
      accuracy,
      signatures: signatureSummary,
    }

    const done: CropClassificationJob = {
      id: jobId,
      mode: 'aoi',
      status: 'done',
      progress: 1,
      message: `Supervised classification complete — OA ${(accuracy.overallAccuracy * 100).toFixed(1)}% (${accuracy.testSamples} hold-out samples).`,
      error: null,
      result: {
        engine: 'supervised',
        dataProvider: input.dataProvider ?? 'satellite',
        pipelineProfile: pipelineProfile.id,
        legend: supervised.legend,
        dates,
        prediction: supervised.prediction,
        confidence: supervised.confidence,
        classStats: supervised.classStats,
        accuracy: supervised.accuracy,
        signatures: supervised.signatures,
        inferenceAvailable: true,
      },
    }
    onUpdate(done)
    return done
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return snapshot(jobId, 'error', 1, 'Cancelled.', { error: 'Aborted' })
    }
    return fail(String((err as Error)?.message || err))
  }
}
