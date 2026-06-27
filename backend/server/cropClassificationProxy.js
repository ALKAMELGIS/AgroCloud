/**
 * Prithvi multi-temporal crop classification — server-side orchestrator.
 *
 * Pipeline (mirrors the IBM-NASA Prithvi demo flow):
 *   AOI → Sentinel Hub Process API (3 timesteps) → preprocessing → Prithvi inference
 *   → classification layer → returned to the map.
 *
 * Two run modes:
 *   - 'chip': classify a prebuilt HLS GeoTIFF (URL) via the hosted HF Gradio Space (`/partial`).
 *             This is exactly what the public demo supports and works out of the box.
 *   - 'aoi' : fetch 3 cloud-light Sentinel-2 L2A composites for the drawn AOI, return RGB
 *             previews (T1/T2/T3), then run inference through a self-hosted Prithvi service
 *             (CROP_CLASSIFICATION_SELF_URL) when configured. Without that service the job
 *             completes with imagery + a clear note (full AOI inference needs the GPU backend).
 *
 * @see https://huggingface.co/spaces/ibm-nasa-geospatial/Prithvi-100M-multi-temporal-crop-classification-demo
 */

import { randomUUID } from 'crypto'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { fromArrayBuffer } from 'geotiff'
import { encodeChunkyInt16GeoTiff } from './geoTiffEncoder.js'
import { resolveSentinelHubWmsConfig } from './sentinelHubStatisticsProxy.js'
import {
  fetchSentinelWmsTrueColorPng,
  fetchSentinelWmsBandsTiff,
  fetchSentinelWmsIndicesGrid,
} from './sentinelHubWmsStatisticsEngine.js'
import { detectCountryFromAoi, cropProfileForCountry } from './cropCountryDatabase.js'
import { classifyCropFields } from './cropFieldClassifier.js'

const HF_SPACE_ID =
  process.env.CROP_CLASSIFICATION_SPACE ||
  'ibm-nasa-geospatial/Prithvi-100M-multi-temporal-crop-classification-demo'
/** Optional self-hosted Prithvi inference service (FastAPI + GPU) for true AOI classification. */
const SELF_INFERENCE_URL = String(process.env.CROP_CLASSIFICATION_SELF_URL || '').trim()
const HF_TOKEN = String(process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN || '').trim()

/** Prithvi prediction palette (USDA CDL-style classes shown in the demo legend). */
export const CROP_CLASSIFICATION_CLASSES = [
  { id: 1, name: 'Natural vegetation', color: '#f5b6c9' },
  { id: 2, name: 'Forest', color: '#a4d08c' },
  { id: 3, name: 'Corn', color: '#f6e700' },
  { id: 4, name: 'Soybeans', color: '#1f7a1f' },
  { id: 5, name: 'Wetlands', color: '#9fd4cf' },
  { id: 6, name: 'Developed/Barren', color: '#9a9a9a' },
  { id: 7, name: 'Open Water', color: '#4b5aa7' },
  { id: 8, name: 'Winter Wheat', color: '#7a5a1e' },
  { id: 9, name: 'Alfalfa', color: '#ff66d1' },
  { id: 10, name: 'Fallow/Idle cropland', color: '#d9d98c' },
  { id: 11, name: 'Cotton', color: '#e30613' },
  { id: 12, name: 'Sorghum', color: '#f5a000' },
]

/** @typedef {'queued'|'fetching'|'preprocessing'|'inferring'|'done'|'error'} JobStatus */

/** @type {Map<string, any>} */
const JOBS = new Map()
const JOB_TTL_MS = 30 * 60 * 1000

function pruneJobs() {
  const now = Date.now()
  for (const [id, job] of JOBS) {
    if (now - job.updatedAt > JOB_TTL_MS) JOBS.delete(id)
  }
}

function newJob(input) {
  const id = randomUUID()
  const job = {
    id,
    mode: input.mode,
    status: /** @type {JobStatus} */ ('queued'),
    progress: 0,
    message: 'Queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    result: null,
    error: null,
  }
  JOBS.set(id, job)
  return job
}

function setJob(job, patch, broadcast) {
  Object.assign(job, patch, { updatedAt: Date.now() })
  if (typeof broadcast === 'function') {
    broadcast({ topic: 'crop-classification/job', payload: publicJob(job) })
  }
}

function publicJob(job) {
  return {
    id: job.id,
    mode: job.mode,
    status: job.status,
    progress: job.progress,
    message: job.message,
    result: job.result,
    error: job.error,
  }
}

/** Polygon ring → [west, south, east, north] bbox (EPSG:4326). */
function polygonBbox(geometry) {
  const rings = geometry?.type === 'Polygon' ? geometry.coordinates : geometry?.coordinates?.[0]
  const coords = (rings || []).flat().filter(p => Array.isArray(p) && p.length >= 2)
  if (!coords.length) throw new Error('AOI polygon has no coordinates')
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lng, lat] of coords) {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

/** Evenly spaced ISO dates across the season (timesteps points, inclusive of end). */
function resolveTimestepDates(season, timesteps) {
  const start = new Date(`${season.start}T00:00:00Z`).getTime()
  const end = new Date(`${season.end}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Invalid season range')
  }
  const out = []
  for (let i = 0; i < timesteps; i += 1) {
    const t = start + ((end - start) * i) / Math.max(1, timesteps - 1)
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/** Fetch one true-color RGB preview (data URL) for the AOI around a target date via OGC WMS. */
async function fetchAoiPreview(wmsConfig, geometry, isoDate, size) {
  const day = new Date(`${isoDate}T00:00:00Z`)
  const timeStart = new Date(day.getTime() - 20 * 86400000).toISOString().slice(0, 10)
  const timeEnd = new Date(day.getTime() + 10 * 86400000).toISOString().slice(0, 10)
  const buf = await fetchSentinelWmsTrueColorPng({
    accessToken: wmsConfig.accessToken,
    instanceId: wmsConfig.instanceId,
    geometry,
    timeStart,
    timeEnd,
    cloudCoverage: 60,
    size,
  })
  return `data:image/png;base64,${buf.toString('base64')}`
}

function normalizeHfOutputs(out) {
  const data = Array.isArray(out?.data) ? out.data : []
  const url = v => (v && typeof v === 'object' && typeof v.url === 'string' ? v.url : v)
  const [t1, t2, t3, prediction] = data
  return {
    scenes: { t1: url(t1), t2: url(t2), t3: url(t3) },
    prediction: { url: url(prediction), bounds: null },
  }
}

/** Classify a prebuilt HLS chip (URL) via the hosted HF Gradio Space (`/partial`). */
async function inferViaHfSpace(imageUrl) {
  const { Client, handle_file } = await import('@gradio/client')
  const client = await Client.connect(HF_SPACE_ID, HF_TOKEN ? { hf_token: HF_TOKEN } : undefined)
  const out = await client.predict('/partial', { target_image: handle_file(imageUrl) })
  return normalizeHfOutputs(out)
}

/**
 * Classify an in-memory 18-band HLS GeoTIFF (AOI build) via the HF Gradio Space.
 * Writes a temp `.tif` so the Space receives a proper GeoTIFF filename for rasterio.
 */
async function inferBufferViaHfSpace(arrayBuffer) {
  const tmpPath = join(tmpdir(), `aoi_merged_${randomUUID()}.tif`)
  await writeFile(tmpPath, Buffer.from(arrayBuffer))
  try {
    return await inferViaHfSpace(tmpPath)
  } finally {
    unlink(tmpPath).catch(() => {})
  }
}

/**
 * Stack three 6-band UINT16 GeoTIFFs into one interleaved 18-band HLS GeoTIFF
 * (Prithvi input: [Blue, Green, Red, Narrow NIR, SWIR1, SWIR2] × T1,T2,T3).
 * @param {Buffer[]} tiffBuffers
 * @param {number[]} bbox3857
 * @param {number} size
 * @returns {Promise<Buffer>}
 */
async function buildEighteenBandTiff(tiffBuffers, bbox3857, size) {
  const bands = []
  let width = size
  let height = size
  for (const buf of tiffBuffers) {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const tiff = await fromArrayBuffer(ab)
    const image = await tiff.getImage()
    width = image.getWidth()
    height = image.getHeight()
    const rasters = await image.readRasters() // interleave:false → array of 6 band arrays
    for (let b = 0; b < 6; b += 1) bands.push(rasters[b])
  }
  if (bands.length !== 18) throw new Error(`Expected 18 bands, built ${bands.length}.`)

  // HLS chips are signed Int16 (SampleFormat 2) with NoData -9999 — match exactly.
  const pixels = width * height
  const interleaved = new Int16Array(pixels * 18)
  for (let p = 0; p < pixels; p += 1) {
    const base = p * 18
    for (let b = 0; b < 18; b += 1) {
      const v = bands[b][p]
      interleaved[base + b] = Number.isFinite(v) && v > 0 ? Math.min(32767, v) : -9999
    }
  }

  return encodeChunkyInt16GeoTiff(interleaved, width, height, 18, bbox3857)
}

/** Run inference against a self-hosted Prithvi service (true AOI classification). */
async function inferViaSelfService(payload) {
  const res = await fetch(`${SELF_INFERENCE_URL.replace(/\/$/, '')}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Self inference service ${res.status}: ${text.slice(0, 160)}`)
  }
  return res.json()
}

/** Evenly spaced ISO dates across the season (count points, inclusive of ends). */
function evenlySpacedDates(season, count) {
  const start = new Date(`${season.start}T00:00:00Z`).getTime()
  const end = new Date(`${season.end}T00:00:00Z`).getTime()
  const out = []
  const k = Math.max(2, count)
  for (let i = 0; i < k; i += 1) {
    const t = start + ((end - start) * i) / (k - 1)
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/**
 * Country-aware, multi-temporal crop classifier path (default AOI engine).
 * Detects the AOI's country, restricts classes to that country's crops, fetches
 * an NDVI time-series, classifies per field, and returns a colored layer.
 */
async function runCountryAwarePipeline(job, input, deps) {
  const { wmsConfig, bbox, broadcast } = deps

  setJob(job, { status: 'fetching', progress: 0.08, message: 'Detecting country from AOI…' }, broadcast)
  const country = await detectCountryFromAoi(input.aoi)
  const profile = cropProfileForCountry(country.code)

  const STEPS = 5
  const dates = evenlySpacedDates(input.season, STEPS)
  const SIZE = 224
  const grids = []
  for (let i = 0; i < dates.length; i += 1) {
    setJob(
      job,
      {
        status: 'fetching',
        progress: 0.12 + (0.5 * i) / dates.length,
        message: `Fetching spectral series ${i + 1}/${dates.length} (${dates[i]}) — ${country.name}…`,
      },
      broadcast,
    )
    const day = new Date(`${dates[i]}T00:00:00Z`)
    const t0 = new Date(day.getTime() - 25 * 86400000).toISOString().slice(0, 10)
    const t1 = new Date(day.getTime() + 15 * 86400000).toISOString().slice(0, 10)
    try {
      const grid = await fetchSentinelWmsIndicesGrid({
        accessToken: wmsConfig.accessToken,
        instanceId: wmsConfig.instanceId,
        geometry: input.aoi,
        timeStart: t0,
        timeEnd: t1,
        cloudCoverage: 60,
        size: SIZE,
      })
      grids.push(grid)
    } catch {
      /* skip a failed date — classifier tolerates gaps */
    }
  }
  if (grids.length < 2) {
    throw new Error('Not enough cloud-free Sentinel-2 imagery for this AOI/season to classify.')
  }

  setJob(job, { status: 'preprocessing', progress: 0.66, message: 'Building NDVI phenology signatures…' }, broadcast)

  setJob(job, { status: 'inferring', progress: 0.8, message: `Classifying crops (${profile.country})…` }, broadcast)
  const classified = classifyCropFields(grids, profile)

  // True-color previews for context (first / middle / last date).
  const previewIdx = [0, Math.floor(dates.length / 2), dates.length - 1]
  const previews = []
  for (const idx of previewIdx) {
    try {
      previews.push(await fetchAoiPreview(wmsConfig, input.aoi, dates[idx], 256))
    } catch {
      previews.push(null)
    }
  }

  setJob(
    job,
    {
      status: 'done',
      progress: 1,
      message: `Classification complete — ${profile.country} (${classified.classStats.length} classes${classified.pivots?.pixels ? `, ${classified.pivots.pctOfCropland}% pivot-irrigated` : ''}).`,
      result: {
        engine: 'country',
        country: { code: country.code, name: profile.country, source: country.source },
        legend: profile.classes,
        scenes: { t1: previews[0] || null, t2: previews[1] || null, t3: previews[2] || null },
        dates,
        prediction: { url: classified.pngDataUrl, bounds: bbox },
        classStats: classified.classStats,
        pivots: classified.pivots,
        inferenceAvailable: true,
      },
    },
    broadcast,
  )
}

async function runPipeline(job, input, deps) {
  const { secretsFilePath, broadcast } = deps
  try {
    if (job.mode === 'chip') {
      setJob(job, { status: 'inferring', progress: 0.4, message: 'Running Prithvi inference on chip…' }, broadcast)
      const result = await inferViaHfSpace(input.imageUrl)
      setJob(job, { status: 'done', progress: 1, message: 'Classification complete.', result }, broadcast)
      return
    }

    // AOI mode
    const bbox = polygonBbox(input.aoi)
    const timesteps = Math.max(1, Math.min(3, Number(input.timesteps) || 3))
    const dates = resolveTimestepDates(input.season, timesteps)

    setJob(job, { status: 'fetching', progress: 0.1, message: `Selecting ${timesteps} scenes…` }, broadcast)
    const wmsConfig = resolveSentinelHubWmsConfig(secretsFilePath)
    if (!wmsConfig.instanceId) {
      throw new Error(
        'Sentinel Hub WMS not configured. Set SENTINEL_HUB_WMS_INSTANCE_ID (+ SENTINEL_HUB_ACCESS_TOKEN) for AOI imagery.',
      )
    }

    const engine = input.engine === 'prithvi' ? 'prithvi' : 'country'
    if (engine === 'country') {
      await runCountryAwarePipeline(job, input, { wmsConfig, bbox, broadcast })
      return
    }

    // Fetch 6-band (HLS-equivalent) tiffs per timestep for inference.
    const CHIP_SIZE = 224
    const tiffs = []
    let bbox3857 = null
    for (let i = 0; i < dates.length; i += 1) {
      setJob(
        job,
        { status: 'fetching', progress: 0.1 + (0.45 * i) / dates.length, message: `Fetching imagery T${i + 1} (${dates[i]})…` },
        broadcast,
      )
      const day = new Date(`${dates[i]}T00:00:00Z`)
      const t0 = new Date(day.getTime() - 20 * 86400000).toISOString().slice(0, 10)
      const t1 = new Date(day.getTime() + 10 * 86400000).toISOString().slice(0, 10)
      const out = await fetchSentinelWmsBandsTiff({
        accessToken: wmsConfig.accessToken,
        instanceId: wmsConfig.instanceId,
        geometry: input.aoi,
        timeStart: t0,
        timeEnd: t1,
        cloudCoverage: 60,
        size: CHIP_SIZE,
      })
      tiffs.push(out.buffer)
      bbox3857 = out.bbox3857
    }

    setJob(job, { status: 'preprocessing', progress: 0.6, message: 'Building 18-band multi-temporal stack…' }, broadcast)
    const mergedTiff = await buildEighteenBandTiff(tiffs, bbox3857 || [0, 0, 0, 0], CHIP_SIZE)

    // Self-hosted Prithvi service takes priority when configured.
    if (SELF_INFERENCE_URL) {
      setJob(job, { status: 'inferring', progress: 0.8, message: 'Running Prithvi inference…' }, broadcast)
      const inf = await inferViaSelfService({ bbox, dates, aoi: input.aoi })
      setJob(
        job,
        {
          status: 'done',
          progress: 1,
          message: 'Classification complete.',
          result: {
            dates,
            prediction: { url: inf.predictionUrl || inf.prediction, bounds: inf.bounds || bbox },
            classStats: inf.classStats || null,
          },
        },
        broadcast,
      )
      return
    }

    // Hosted HF Space inference on the AOI-built chip.
    setJob(job, { status: 'inferring', progress: 0.8, message: 'Running Prithvi inference (HF Space)…' }, broadcast)
    try {
      const inf = await inferBufferViaHfSpace(mergedTiff)
      setJob(
        job,
        {
          status: 'done',
          progress: 1,
          message: 'Classification complete.',
          result: {
            scenes: inf.scenes,
            dates,
            prediction: { url: inf.prediction.url, bounds: bbox },
            classStats: null,
            inferenceAvailable: true,
          },
        },
        broadcast,
      )
    } catch (inferErr) {
      // Inference failed — still surface the timestep imagery so the AOI isn't a dead end.
      const previews = []
      for (let i = 0; i < dates.length; i += 1) {
        try {
          previews.push(await fetchAoiPreview(wmsConfig, input.aoi, dates[i], 256))
        } catch {
          previews.push(null)
        }
      }
      setJob(
        job,
        {
          status: 'done',
          progress: 1,
          message: `Imagery ready, but inference failed: ${String(inferErr?.message || inferErr)}`,
          result: {
            scenes: { t1: previews[0] || null, t2: previews[1] || null, t3: previews[2] || null },
            dates,
            prediction: { url: null, bounds: bbox },
            classStats: null,
            inferenceAvailable: false,
          },
        },
        broadcast,
      )
    }
  } catch (err) {
    setJob(
      job,
      { status: 'error', progress: 1, message: 'Pipeline failed.', error: String(err?.message || err) },
      broadcast,
    )
  }
}

/**
 * @param {import('express').Express} app
 * @param {{ secretsFilePath: string, broadcast?: (obj: any) => void }} options
 */
export function registerCropClassificationRoutes(app, { secretsFilePath, broadcast } = {}) {
  app.get('/api/crop-classification/config', (_req, res) => {
    res.json({
      space: HF_SPACE_ID,
      selfInference: Boolean(SELF_INFERENCE_URL),
      classes: CROP_CLASSIFICATION_CLASSES,
    })
  })

  app.post('/api/crop-classification/run', (req, res) => {
    pruneJobs()
    const body = req.body || {}
    const mode = body.mode === 'chip' ? 'chip' : 'aoi'

    if (mode === 'chip') {
      const imageUrl = String(body.imageUrl || '').trim()
      if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required for chip mode.' })
      const job = newJob({ mode })
      res.status(202).json({ jobId: job.id })
      void runPipeline(job, { mode, imageUrl }, { secretsFilePath, broadcast })
      return
    }

    const aoi = body.aoi
    if (!aoi || (aoi.type !== 'Polygon' && aoi.type !== 'MultiPolygon')) {
      return res.status(400).json({ error: 'aoi (GeoJSON Polygon) is required for AOI mode.' })
    }
    const season = body.season
    if (!season?.start || !season?.end) {
      return res.status(400).json({ error: 'season { start, end } (YYYY-MM-DD) is required.' })
    }
    const job = newJob({ mode })
    res.status(202).json({ jobId: job.id })
    void runPipeline(
      job,
      { mode, aoi, season, timesteps: body.timesteps, engine: body.engine },
      { secretsFilePath, broadcast },
    )
  })

  app.get('/api/crop-classification/jobs/:jobId', (req, res) => {
    const job = JOBS.get(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'Job not found or expired.' })
    res.json(publicJob(job))
  })

  // CORS-friendly proxy so the Mapbox/MapLibre image layer can load the HF Space
  // prediction (its file endpoint doesn't send CORS headers). Restricted to hf.space.
  app.get('/api/crop-classification/proxy-image', async (req, res) => {
    try {
      const target = String(req.query.url || '').trim()
      let host = ''
      try {
        host = new URL(target).hostname
      } catch {
        return res.status(400).json({ error: 'Invalid url.' })
      }
      if (!/(^|\.)hf\.space$/i.test(host) && !/(^|\.)huggingface\.co$/i.test(host)) {
        return res.status(403).json({ error: 'Only Hugging Face Space images may be proxied.' })
      }
      const upstream = await fetch(target)
      if (!upstream.ok) {
        return res.status(upstream.status).json({ error: `Upstream image failed (${upstream.status}).` })
      }
      const buf = Buffer.from(await upstream.arrayBuffer())
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.send(buf)
    } catch (err) {
      res.status(502).json({ error: String(err?.message || err) })
    }
  })
}
