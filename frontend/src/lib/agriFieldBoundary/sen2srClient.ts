/**
 * SEN2SRLite client — neural Sentinel-2 super-resolution (10 m → 2.5 m)
 * via `/api/sentinel2/super-resolution` (Node proxy → agri-field-boundary :8092).
 */

const BASE = '/api/sentinel2/super-resolution'

export type Sen2srProductMode = 'raw' | 'sen2sr' | 'basemap' | 'drone'

export type Sen2srStatus = {
  available: boolean
  model: string
  input?: string
  native_resolution?: string
  output_resolution?: string
  device?: string
  error?: string
}

export type Sen2srResult = {
  output_path: string
  resolution: string
  crs?: string | null
  bounds?: number[] | null
  cached: boolean
  bands?: string[]
  display_1m_path?: string
  display_label?: string
}

export class Sen2srServiceError extends Error {
  readonly offline: boolean
  readonly detail?: string
  readonly status?: number
  constructor(message: string, opts?: { offline?: boolean; detail?: string; status?: number }) {
    super(message)
    this.name = 'Sen2srServiceError'
    this.offline = Boolean(opts?.offline)
    this.detail = opts?.detail
    this.status = opts?.status
  }
}

export function isSentinel2L2ACollection(collection: string | null | undefined): boolean {
  return /sentinel-2[-_]?l2a/i.test(String(collection || '').trim())
}

export function formatSen2srStatusLabel(status: Sen2srStatus | null | undefined): string {
  if (!status) return 'SEN2SR ● Unavailable'
  return status.available ? 'SEN2SR ● Available' : 'SEN2SR ● Unavailable'
}

function offlineLike(raw: string | null | undefined): boolean {
  return /offline|ECONNREFUSED|Could not reach|fetch failed|network|timed out|TimeoutError/i.test(
    String(raw || ''),
  )
}

async function readErrorPayload(res: Response): Promise<{ error?: string; detail?: string }> {
  const json = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
  return json && typeof json === 'object' ? json : {}
}

export async function fetchSen2srStatus(signal?: AbortSignal): Promise<Sen2srStatus> {
  try {
    const res = await fetch(`${BASE}/status`, { signal })
    const json = (await res.json().catch(() => null)) as Sen2srStatus | null
    if (!json || typeof json !== 'object') {
      return {
        available: false,
        model: 'SEN2SRLite',
        error: `SEN2SR status unavailable (HTTP ${res.status}).`,
      }
    }
    return {
      available: Boolean(json.available),
      model: String(json.model || 'SEN2SRLite'),
      input: json.input != null ? String(json.input) : undefined,
      native_resolution: json.native_resolution != null ? String(json.native_resolution) : undefined,
      output_resolution: json.output_resolution != null ? String(json.output_resolution) : undefined,
      device: json.device != null ? String(json.device) : undefined,
      error: json.error != null ? String(json.error) : undefined,
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return {
      available: false,
      model: 'SEN2SRLite',
      error: 'Field-boundary service offline (port 8092).',
    }
  }
}

export type RunSen2srOptions = {
  /** Multipart GeoTIFF upload (preferred when the browser has the file). */
  file?: File | Blob | null
  /** Server-local path (only useful when the service can read that path). */
  inputPath?: string | null
  aoi?: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Feature | GeoJSON.FeatureCollection | null
  bands?: string[] | null
  outputPath?: string | null
  display1m?: boolean
  signal?: AbortSignal
  /** Filename hint when `file` is a Blob without a name. */
  fileName?: string | null
}

export async function runSen2srSuperResolution(opts: RunSen2srOptions): Promise<Sen2srResult> {
  const hasFile = Boolean(opts.file)
  const inputPath = String(opts.inputPath || '').trim()
  if (!hasFile && !inputPath) {
    throw new Sen2srServiceError('Provide a Sentinel-2 L2A GeoTIFF file or input_path.')
  }

  let res: Response
  try {
    if (hasFile) {
      const form = new FormData()
      const blob = opts.file as Blob
      const name =
        (opts.file instanceof File && opts.file.name) ||
        String(opts.fileName || '').trim() ||
        'sentinel2-l2a.tif'
      form.append('file', blob, name)
      if (inputPath) form.append('input_path', inputPath)
      if (opts.aoi != null) form.append('aoi', JSON.stringify(opts.aoi))
      if (opts.bands?.length) form.append('bands', opts.bands.join(','))
      if (opts.outputPath) form.append('output_path', String(opts.outputPath))
      form.append('display_1m', opts.display1m ? 'true' : 'false')
      res = await fetch(BASE, { method: 'POST', body: form, signal: opts.signal })
    } else {
      res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_path: inputPath,
          aoi: opts.aoi ?? null,
          bands: opts.bands ?? null,
          output_path: opts.outputPath ?? null,
          display_1m: Boolean(opts.display1m),
        }),
        signal: opts.signal,
      })
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new Sen2srServiceError('Could not reach the SEN2SR super-resolution service.', {
      offline: true,
    })
  }

  if (!res.ok) {
    const payload = await readErrorPayload(res)
    const raw = payload.detail || payload.error || `SEN2SR failed (HTTP ${res.status}).`
    throw new Sen2srServiceError(raw, {
      offline: offlineLike(raw) || res.status === 502 || res.status === 503 || res.status === 504,
      detail: payload.detail || payload.error,
      status: res.status,
    })
  }

  const json = (await res.json().catch(() => ({}))) as Partial<Sen2srResult> & {
    error?: string
    detail?: string
  }
  const outputPath = String(json.output_path || '').trim()
  if (!outputPath) {
    throw new Sen2srServiceError(json.detail || json.error || 'SEN2SR returned no output_path.')
  }
  return {
    output_path: outputPath,
    resolution: String(json.resolution || '2.5m'),
    crs: json.crs ?? null,
    bounds: Array.isArray(json.bounds) ? json.bounds.map(Number) : null,
    cached: Boolean(json.cached),
    bands: Array.isArray(json.bands) ? json.bands.map(String) : undefined,
    display_1m_path: json.display_1m_path != null ? String(json.display_1m_path) : undefined,
    display_label: json.display_label != null ? String(json.display_label) : undefined,
  }
}

/** Short notice for successful SEN2SR jobs (paths may be server-local). */
export function formatSen2srResultNotice(result: Sen2srResult): string {
  const base = result.cached
    ? `SEN2SR cache hit · ${result.resolution}`
    : `SEN2SR complete · ${result.resolution}`
  const display =
    result.display_1m_path && result.display_label
      ? ` · ${result.display_label}`
      : result.display_1m_path
        ? ' · AI Enhanced 1m Display'
        : ''
  return `${base}${display}`
}
