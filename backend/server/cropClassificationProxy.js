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
import { resolveSentinelHubWmsConfig, describeSentinelHubStatisticsConfig } from './sentinelHubStatisticsProxy.js'
import {
  fetchSentinelWmsTrueColorPng,
  fetchSentinelWmsBandsTiff,
  fetchSentinelWmsIndicesGrid,
  selectClearSceneDates,
  fetchPcSentinelSceneCloudCover,
  estimateAoiBboxFillRatio,
} from './sentinelHubWmsStatisticsEngine.js'
import { detectCountryFromAoi, cropProfileForCountry } from './cropCountryDatabase.js'
import { classifyCropFields } from './cropFieldClassifier.js'
import { fillBlackHolesInPngDataUrl } from './cropPngHoleFill.js'
import {
  deleteCropJobSnapshot,
  loadCropJobSnapshot,
  persistCropJobPredictionPng,
  persistCropJobSnapshot,
  pruneCropJobSnapshots,
  readCropJobPredictionPng,
} from './cropClassificationJobStore.js'

const HF_SPACE_ID =
  process.env.CROP_CLASSIFICATION_SPACE ||
  'ibm-nasa-geospatial/Prithvi-100M-multi-temporal-crop-classification-demo'
/** Optional self-hosted Prithvi inference service (FastAPI + GPU) for true AOI classification. */
const SELF_INFERENCE_URL = String(process.env.CROP_CLASSIFICATION_SELF_URL || '').trim()
const HF_TOKEN = String(process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN || '').trim()

/**
 * Max acceptable *granule-level* STAC cloud cover (%) when ranking Sentinel-2 candidates.
 * This is NOT AOI cloud — tile metadata often reports 15–40% even when the farm is clear.
 * AOI clarity is enforced via SCL clear-fraction after fetch. Override with CROP_MAX_CLOUD_PCT.
 */
const CROP_MAX_CLOUD = Math.max(
  5,
  Math.min(100, Number(process.env.CROP_MAX_CLOUD_PCT) || 40),
)
/** Preferred AOI clear fraction; below this we still accept best available down to the floor. */
const CROP_MIN_CLEAR_FRACTION = Math.max(
  0.2,
  Math.min(0.95, Number(process.env.CROP_MIN_CLEAR_FRACTION) || 0.45),
)
/** Absolute floor — reject only nearly empty / failed frames (AOI-normalized). */
const CROP_CLEAR_FLOOR = Math.max(
  0.05,
  Math.min(CROP_MIN_CLEAR_FRACTION, Number(process.env.CROP_CLEAR_FLOOR) || 0.08),
)
/** Target ground sampling for the classified output (m/px). 3 m sharpens farm / pivot edges. */
const CROP_TARGET_MPP = Math.max(
  2,
  Math.min(10, Number(process.env.CROP_TARGET_MPP) || 3),
)
/**
 * Optional external AI super-resolution service. When set, the {@link applySuperResolution}
 * seam POSTs imagery to it to enhance native Sentinel sampling → {@link CROP_TARGET_MPP} m
 * with a real SR model (not resampling). When unset, we fetch a high-resolution resampled grid.
 */
const CROP_SUPER_RESOLUTION_URL = String(process.env.CROP_SUPER_RESOLUTION_URL || '').trim()

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
    if (now - job.updatedAt > JOB_TTL_MS) {
      JOBS.delete(id)
      deleteCropJobSnapshot(id)
    }
  }
  pruneCropJobSnapshots(JOB_TTL_MS)
}

function resolveJob(jobId) {
  let job = JOBS.get(jobId)
  if (job) return job
  const disk = loadCropJobSnapshot(jobId)
  if (!disk) return null
  job = disk
  JOBS.set(jobId, job)
  return job
}

function materializePredictionAsset(job) {
  const url = job?.result?.prediction?.url
  if (typeof url !== 'string' || !url.startsWith('data:image/')) return
  const apiPath = persistCropJobPredictionPng(job.id, url)
  if (apiPath) {
    job.result.prediction.url = apiPath
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
  persistCropJobSnapshot(job)
  return job
}

function setJob(job, patch, broadcast) {
  Object.assign(job, patch, { updatedAt: Date.now() })
  if (job.status === 'done') materializePredictionAsset(job)
  persistCropJobSnapshot(job)
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

/** Fetch one true-color RGB preview (data URL) for the AOI around a target clear date. */
async function fetchAoiPreview(wmsConfig, geometry, isoDate, size) {
  const day = new Date(`${isoDate}T00:00:00Z`)
  // Narrow window around the chosen clear date so mosaicking cannot pull in cloudy neighbours.
  const timeStart = new Date(day.getTime() - 3 * 86400000).toISOString().slice(0, 10)
  const timeEnd = new Date(day.getTime() + 3 * 86400000).toISOString().slice(0, 10)
  const buf = await fetchSentinelWmsTrueColorPng({
    accessToken: wmsConfig.accessToken,
    instanceId: wmsConfig.instanceId,
    geometry,
    timeStart,
    timeEnd,
    cloudCoverage: CROP_MAX_CLOUD,
    size,
  })
  return `data:image/png;base64,${buf.toString('base64')}`
}

/**
 * AI super-resolution seam. When `CROP_SUPER_RESOLUTION_URL` is configured, POSTs the given
 * image (base64 PNG data URL) with the source/target GSD and returns the enhanced data URL
 * from a real SR model. When unset or on failure, returns null so callers fall back to the
 * high-resolution resampled grid (never a naive upscale of the classified output).
 * @param {string} dataUrl  base64 PNG data URL to enhance
 * @param {{ sourceMpp: number; targetMpp: number; bbox?: number[] }} opts
 * @returns {Promise<{ url: string; engine: 'ai' } | null>}
 */
async function applySuperResolution(dataUrl, opts) {
  if (!CROP_SUPER_RESOLUTION_URL || !dataUrl) return null
  try {
    const res = await fetch(CROP_SUPER_RESOLUTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        image: dataUrl,
        sourceMpp: opts.sourceMpp,
        targetMpp: opts.targetMpp,
        bbox: opts.bbox || null,
        scale: Math.max(1, Math.round((opts.sourceMpp || 10) / (opts.targetMpp || 5))),
      }),
    })
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    const url = json && (json.url || json.image || json.dataUrl)
    return typeof url === 'string' && url.length > 0 ? { url, engine: 'ai' } : null
  } catch {
    return null
  }
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

  setJob(job, { status: 'fetching', progress: 0.06, message: 'Detecting country from AOI…' }, broadcast)
  const country = await detectCountryFromAoi(input.aoi)
  const profile = cropProfileForCountry(country.code)

  // Pick clearest Sentinel-2 acquisitions (granule STAC ≤ CROP_MAX_CLOUD%; AOI clarity later).
  const STEPS = 5
  setJob(
    job,
    {
      status: 'fetching',
      progress: 0.09,
      message: `Selecting clearest scenes (granule cloud ≤ ${CROP_MAX_CLOUD}%, prefer clearest)…`,
    },
    broadcast,
  )
  let selected
  try {
    selected = await selectClearSceneDates(input.aoi, input.season, STEPS, CROP_MAX_CLOUD)
  } catch (selErr) {
    throw new Error(
      String(selErr?.message || selErr) ||
        `Not enough usable Sentinel-2 imagery for this AOI/season (granule cloud ≤ ${CROP_MAX_CLOUD}%).`,
    )
  }
  // Never keep a scene marked cloudy (selector already rejects them; belt-and-suspenders).
  selected = selected.filter(s => !s.cloudy && (s.cloudCover == null || s.cloudCover <= CROP_MAX_CLOUD))
  if (selected.length < 2) {
    throw new Error(
      `Not enough usable Sentinel-2 imagery for this AOI/season to classify (need ≥2 clear dates; granule cloud ≤ ${CROP_MAX_CLOUD}%). Try a wider season.`,
    )
  }

  // 3 m grid: sample at CROP_TARGET_MPP so field / pivot edges stay crisp.
  // Rank by AOI-normalized clear fraction (WMS GEOMETRY clip makes outside-AOI
  // transparent — never divide by full bbox pixel count). Prefer ≥ MIN_CLEAR but
  // fall back to best ≥ floor so arid / partially cloudy seasons still classify.
  const aoiFill = estimateAoiBboxFillRatio(input.aoi)
  const clearFractionOf = (g, clipped) => {
    if (!g?.valid?.length) return 0
    let ok = 0
    for (let p = 0; p < g.valid.length; p += 1) ok += g.valid[p] ? 1 : 0
    const denom = clipped
      ? Math.max(1, Math.round(g.valid.length * aoiFill))
      : g.valid.length
    return Math.min(1, ok / denom)
  }

  /** @type {Array<{ grid: any; clear: number; date: string; sel: any }>} */
  const scored = []
  const usedFetchDates = new Set()
  let lastFetchErr = null
  let skippedEmpty = 0

  const fetchScoreDate = async (sel, opts = {}) => {
    const date = sel.date
    if (usedFetchDates.has(date)) return
    usedFetchDates.add(date)
    const cloudNote = sel.cloudCover == null ? '' : ` · ${sel.cloudCover.toFixed(0)}% tile cloud`
    const clip = opts.clipToGeometry !== false
    setJob(
      job,
      {
        status: 'fetching',
        progress: 0.12 + Math.min(0.5, 0.08 * usedFetchDates.size),
        message: `Fetching scene ${usedFetchDates.size} (${date}${cloudNote}) — ${country.name}…`,
      },
      broadcast,
    )
    const day = new Date(`${date}T00:00:00Z`)
    const padDays = opts.padDays ?? 6
    const t0 = new Date(day.getTime() - padDays * 86400000).toISOString().slice(0, 10)
    const t1 = new Date(day.getTime() + padDays * 86400000).toISOString().slice(0, 10)
    try {
      const grid = await fetchSentinelWmsIndicesGrid({
        accessToken: wmsConfig.accessToken,
        instanceId: wmsConfig.instanceId,
        geometry: input.aoi,
        timeStart: t0,
        timeEnd: t1,
        cloudCoverage: opts.cloudCoverage ?? CROP_MAX_CLOUD,
        metersPerPixel: CROP_TARGET_MPP,
        maxSize: 2500,
        clipToGeometry: clip,
      })
      const clear = clearFractionOf(grid, clip)
      const floor = opts.clearFloor ?? CROP_CLEAR_FLOOR
      if (clear < floor) {
        skippedEmpty += 1
        return
      }
      scored.push({ grid, clear, date, sel: { ...sel, cloudy: false } })
    } catch (err) {
      lastFetchErr = err
      /* skip a failed date — classifier tolerates gaps */
    }
  }

  for (const sel of selected) {
    await fetchScoreDate(sel)
  }

  // Expand candidate pool from season-wide STAC if we still lack ≥2 clear grids.
  if (scored.length < 2 && input.season?.start && input.season?.end) {
    setJob(
      job,
      {
        status: 'fetching',
        progress: 0.45,
        message: 'Expanding search for clearer Sentinel-2 dates…',
      },
      broadcast,
    )
    let extras = []
    try {
      extras = await fetchPcSentinelSceneCloudCover(
        input.aoi,
        input.season.start,
        input.season.end,
        null,
      )
    } catch {
      extras = []
    }
    const ceiling = Math.max(CROP_MAX_CLOUD, 70)
    extras = extras
      .filter(s => Number.isFinite(s.cloudCover) && s.cloudCover <= ceiling)
      .sort((a, b) => a.cloudCover - b.cloudCover || a.date.localeCompare(b.date))
    for (const s of extras) {
      if (scored.length >= 4) break
      await fetchScoreDate(
        { date: s.date, cloudCover: s.cloudCover, cloudy: false },
        { padDays: 8, cloudCoverage: ceiling },
      )
    }
  }

  // Last resort: bbox-only fetch (no GEOMETRY clip) with a lower clear floor.
  if (scored.length < 2) {
    setJob(
      job,
      {
        status: 'fetching',
        progress: 0.55,
        message: 'Retrying imagery without AOI clip…',
      },
      broadcast,
    )
    const retryDates = [
      ...selected.map(s => s.date),
      ...evenlySpacedDates(input.season, 6),
    ]
    const seen = new Set()
    for (const date of retryDates) {
      if (scored.length >= 2) break
      if (seen.has(date)) continue
      seen.add(date)
      // Allow re-fetch of previously empty clipped dates without the clip.
      usedFetchDates.delete(date)
      await fetchScoreDate(
        { date, cloudCover: null, cloudy: false },
        { clipToGeometry: false, clearFloor: 0.05, padDays: 10, cloudCoverage: 80 },
      )
    }
  }

  scored.sort((a, b) => b.clear - a.clear || a.date.localeCompare(b.date))
  const preferred = scored.filter(s => s.clear >= CROP_MIN_CLEAR_FRACTION)
  const pool = preferred.length >= 2 ? preferred : scored
  // Keep temporal spread when possible.
  const picked = []
  const minGapMs = 5 * 86400000
  for (const s of pool) {
    if (picked.length >= Math.max(selected.length, 4)) break
    const t = new Date(`${s.date}T00:00:00Z`).getTime()
    if (picked.some(p => Math.abs(new Date(`${p.date}T00:00:00Z`).getTime() - t) < minGapMs)) continue
    picked.push(s)
  }
  for (const s of pool) {
    if (picked.length >= Math.min(Math.max(pool.length, 2), 4)) break
    if (picked.includes(s)) continue
    picked.push(s)
  }
  picked.sort((a, b) => a.date.localeCompare(b.date))
  const grids = picked.map(p => p.grid)
  const dates = picked.map(p => p.date)
  selected = picked.map(p => p.sel)
  if (grids.length < 2) {
    const best = scored[0]?.clear
    if (best == null && lastFetchErr) {
      throw new Error(
        `Could not fetch Sentinel-2 imagery for this AOI/season: ${String(lastFetchErr?.message || lastFetchErr).slice(0, 180)}`,
      )
    }
    throw new Error(
      best != null
        ? `Not enough usable Sentinel-2 scenes for this AOI/season (best AOI clear ${(best * 100).toFixed(0)}%, need ≥2 dates${skippedEmpty ? `; ${skippedEmpty} empty` : ''}). Try a wider season.`
        : 'Not enough usable Sentinel-2 imagery for this AOI/season to classify. Try a wider season or a clearer period.',
    )
  }

  setJob(job, { status: 'preprocessing', progress: 0.66, message: 'Building NDVI phenology signatures…' }, broadcast)
  setJob(job, { status: 'inferring', progress: 0.8, message: `Classifying crops (${profile.country})…` }, broadcast)
  const classified = classifyCropFields(grids, profile, {
    seasonStart: input.season?.start,
    seasonEnd: input.season?.end,
  })
  classified.pngDataUrl = fillBlackHolesInPngDataUrl(classified.pngDataUrl)

  // AI super-resolution seam: enhance toward CROP_TARGET_MPP when an external SR service
  // is configured; otherwise keep the high-resolution resampled grid.
  let predictionUrl = classified.pngDataUrl
  let superResolution = 'resample'
  setJob(job, { status: 'inferring', progress: 0.9, message: `Enhancing to ${CROP_TARGET_MPP} m…` }, broadcast)
  const sr = await applySuperResolution(classified.pngDataUrl, {
    sourceMpp: 10,
    targetMpp: CROP_TARGET_MPP,
    bbox,
  })
  if (sr) {
    predictionUrl = fillBlackHolesInPngDataUrl(sr.url)
    superResolution = 'ai'
  }

  // True-color previews for context (first / middle / last clear date only).
  const previewIdx = [0, Math.floor(dates.length / 2), dates.length - 1]
  const previews = []
  for (const idx of previewIdx) {
    const sel = selected[idx]
    if (!sel || sel.cloudy || (typeof sel.cloudCover === 'number' && sel.cloudCover > CROP_MAX_CLOUD)) {
      previews.push(null)
      continue
    }
    try {
      previews.push(await fetchAoiPreview(wmsConfig, input.aoi, dates[idx], 256))
    } catch {
      previews.push(null)
    }
  }

  const cloudCovers = selected.map(s => s.cloudCover).filter(c => typeof c === 'number')
  const maxSceneCloud = cloudCovers.length ? Math.max(...cloudCovers) : null
  setJob(
    job,
    {
      status: 'done',
      progress: 1,
      message: `Classification complete — ${profile.country} (${classified.classStats.length} classes${classified.pivots?.pixels ? `, ${classified.pivots.pctOfCropland}% pivot-irrigated` : ''}) at ${CROP_TARGET_MPP} m.`,
      result: {
        engine: 'country',
        country: { code: country.code, name: profile.country, source: country.source },
        legend: profile.classes,
        scenes: { t1: previews[0] || null, t2: previews[1] || null, t3: previews[2] || null },
        dates,
        sceneCloudCover: selected.map(s => ({ date: s.date, cloudCover: s.cloudCover, cloudy: s.cloudy })),
        maxSceneCloud,
        resolutionMeters: CROP_TARGET_MPP,
        superResolution,
        prediction: { url: predictionUrl, bounds: bbox },
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

    setJob(
      job,
      {
        status: 'fetching',
        progress: 0.08,
        message: `Selecting clearest scenes (granule cloud ≤ ${CROP_MAX_CLOUD}%)…`,
      },
      broadcast,
    )
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

    // Prithvi path: pick clearest scenes (granule STAC ≤ CROP_MAX_CLOUD%).
    let selectedP
    try {
      selectedP = await selectClearSceneDates(input.aoi, input.season, timesteps, CROP_MAX_CLOUD)
    } catch (selErr) {
      throw new Error(
        String(selErr?.message || selErr) ||
          `Not enough usable Sentinel-2 imagery for this AOI/season (granule cloud ≤ ${CROP_MAX_CLOUD}%).`,
      )
    }
    selectedP = selectedP.filter(s => !s.cloudy && (s.cloudCover == null || s.cloudCover <= CROP_MAX_CLOUD))
    if (!selectedP.length) {
      throw new Error(
        `Not enough usable Sentinel-2 imagery for this AOI/season to classify (granule cloud ≤ ${CROP_MAX_CLOUD}%). Try a wider season.`,
      )
    }
    const dates = selectedP.map(s => s.date)

    // Fetch 6-band (HLS-equivalent) tiffs per timestep for inference (cloud-masked in the evalscript).
    const CHIP_SIZE = 224
    const tiffs = []
    let bbox3857 = null
    for (let i = 0; i < selectedP.length; i += 1) {
      const sel = selectedP[i]
      const cloudNote = sel.cloudCover == null ? '' : ` · ${sel.cloudCover.toFixed(0)}% cloud`
      setJob(
        job,
        { status: 'fetching', progress: 0.1 + (0.45 * i) / selectedP.length, message: `Fetching clear scene T${i + 1} (${sel.date}${cloudNote})…` },
        broadcast,
      )
      // Narrow ± window centred on the chosen clear date.
      const day = new Date(`${sel.date}T00:00:00Z`)
      const t0 = new Date(day.getTime() - 6 * 86400000).toISOString().slice(0, 10)
      const t1 = new Date(day.getTime() + 6 * 86400000).toISOString().slice(0, 10)
      const out = await fetchSentinelWmsBandsTiff({
        accessToken: wmsConfig.accessToken,
        instanceId: wmsConfig.instanceId,
        geometry: input.aoi,
        timeStart: t0,
        timeEnd: t1,
        cloudCoverage: CROP_MAX_CLOUD,
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
      const predUrl = fillBlackHolesInPngDataUrl(inf.predictionUrl || inf.prediction)
      setJob(
        job,
        {
          status: 'done',
          progress: 1,
          message: 'Classification complete.',
          result: {
            dates,
            prediction: { url: predUrl, bounds: inf.bounds || bbox },
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
      const predUrl = fillBlackHolesInPngDataUrl(inf.prediction?.url)
      setJob(
        job,
        {
          status: 'done',
          progress: 1,
          message: 'Classification complete.',
          result: {
            scenes: inf.scenes,
            dates,
            prediction: { url: predUrl, bounds: bbox },
            classStats: null,
            inferenceAvailable: true,
          },
        },
        broadcast,
      )
    } catch (inferErr) {
      // Inference failed — still surface clear timestep imagery (never cloudy frames).
      const previews = []
      for (let i = 0; i < dates.length; i += 1) {
        const sel = selectedP[i]
        if (!sel || sel.cloudy || (typeof sel.cloudCover === 'number' && sel.cloudCover > CROP_MAX_CLOUD)) {
          previews.push(null)
          continue
        }
        try {
          previews.push(await fetchAoiPreview(wmsConfig, input.aoi, dates[i], 256))
        } catch {
          previews.push(null)
        }
      }
      const cloudCoversP = selectedP.map(s => s.cloudCover).filter(c => typeof c === 'number')
      const maxSceneCloudP = cloudCoversP.length ? Math.max(...cloudCoversP) : null
      setJob(
        job,
        {
          status: 'done',
          progress: 1,
          message: `Imagery ready, but inference failed: ${String(inferErr?.message || inferErr)}`,
          result: {
            scenes: { t1: previews[0] || null, t2: previews[1] || null, t3: previews[2] || null },
            dates,
            sceneCloudCover: selectedP.map(s => ({ date: s.date, cloudCover: s.cloudCover, cloudy: s.cloudy })),
            maxSceneCloud: maxSceneCloudP,
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
    const sh = describeSentinelHubStatisticsConfig(secretsFilePath)
    res.json({
      space: HF_SPACE_ID,
      selfInference: Boolean(SELF_INFERENCE_URL),
      classes: CROP_CLASSIFICATION_CLASSES,
      serverAoiReady: sh.wmsReady,
      wmsReady: sh.wmsReady,
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
    pruneJobs()
    const job = resolveJob(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'Job not found or expired.' })
    res.json(publicJob(job))
  })

  app.get('/api/crop-classification/jobs/:jobId/prediction.png', (req, res) => {
    const jobId = req.params.jobId
    const job = resolveJob(jobId)
    if (!job) return res.status(404).json({ error: 'Job not found or expired.' })
    let buf = readCropJobPredictionPng(jobId)
    if (!buf) {
      const inline = job?.result?.prediction?.url
      if (typeof inline === 'string' && inline.startsWith('data:image/')) {
        const apiPath = persistCropJobPredictionPng(jobId, inline)
        if (apiPath) {
          job.result.prediction.url = apiPath
          persistCropJobSnapshot(job)
          buf = readCropJobPredictionPng(jobId)
        }
      }
    }
    if (!buf?.length) return res.status(404).json({ error: 'Prediction image not available.' })
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(buf)
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
