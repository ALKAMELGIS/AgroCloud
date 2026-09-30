export type SensorKind = 'soil' | 'weather' | 'irrigation' | 'camera'

export type CameraVmsPreset =
  | 'generic_rest'
  | 'onvif'
  | 'rtsp_hls'
  | 'axis_vapix'
  | 'milestone_xprotect'
  | 'genetec'
  | 'hikvision_isapi'
  | 'dahua_http'
  | 'blueiris'
  | 'exacqvision'
  | 'hanwha_wisenet'

export type SensorApiConfig = {
  baseUrl: string
  apiKey: string
  authHeaderName: string
  authScheme: 'bearer' | 'api_key_header' | 'raw'
  extraHeaders: string
  notes: string
  camera?: {
    vmsPreset: CameraVmsPreset
    streamUrl: string
    secondaryUrl: string
  }
}

const STORAGE_PREFIX = 'sensor_api_integration_v1'

export const DEFAULT_SENSOR_CONFIG: SensorApiConfig = {
  baseUrl: '',
  apiKey: '',
  authHeaderName: 'Authorization',
  authScheme: 'bearer',
  extraHeaders: '',
  notes: '',
  camera: {
    vmsPreset: 'generic_rest',
    streamUrl: '',
    secondaryUrl: '',
  },
}

export function storageKeyFor(kind: SensorKind): string {
  return `${STORAGE_PREFIX}_${kind}`
}

export function loadSensorConfig(kind: SensorKind): SensorApiConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_SENSOR_CONFIG }
  try {
    const raw = localStorage.getItem(storageKeyFor(kind))
    if (!raw) return { ...DEFAULT_SENSOR_CONFIG, camera: { ...DEFAULT_SENSOR_CONFIG.camera! } }
    const parsed = JSON.parse(raw) as Partial<SensorApiConfig>
    return {
      ...DEFAULT_SENSOR_CONFIG,
      ...parsed,
      camera:
        kind === 'camera'
          ? {
              ...DEFAULT_SENSOR_CONFIG.camera!,
              ...(parsed.camera || {}),
            }
          : undefined,
    }
  } catch {
    return { ...DEFAULT_SENSOR_CONFIG, camera: kind === 'camera' ? { ...DEFAULT_SENSOR_CONFIG.camera! } : undefined }
  }
}

export function saveSensorConfig(kind: SensorKind, config: SensorApiConfig): void {
  const payload = kind === 'camera' ? config : { ...config, camera: undefined }
  localStorage.setItem(storageKeyFor(kind), JSON.stringify(payload))
}

/** Multi-integration storage (UI v2); legacy single-config key migrates once on read. */
const INTEGRATIONS_PREFIX = 'sensor_integrations_v2'

export type SensorIntegrationAuthUi = 'api_key' | 'bearer' | 'none'

export type SensorIntegrationRecord = {
  id: string
  name: string
  integrationType: string
  provider: string
  pollingMinutes: number
  baseUrl: string
  authType: SensorIntegrationAuthUi
  apiKey: string
  /** Header name for API key / Bearer context; helper text references api_key, key, token */
  credentialHeaderOrParamName: string
  dataMapping: Record<string, string>
  active: boolean
  notes: string
  extraHeaders: string
  camera?: NonNullable<SensorApiConfig['camera']>
}

export function integrationsStorageKey(kind: SensorKind): string {
  return `${INTEGRATIONS_PREFIX}_${kind}`
}

const defaultMappingKeys = (kind: SensorKind): Record<string, string> => {
  const fields = dataMappingFieldList(kind)
  const o: Record<string, string> = {}
  for (const f of fields) o[f.key] = ''
  return o
}

export function newEmptyIntegration(kind: SensorKind): SensorIntegrationRecord {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}`,
    name: '',
    integrationType: defaultIntegrationTypeLabel(kind),
    provider: '',
    pollingMinutes: 60,
    baseUrl: '',
    authType: 'api_key',
    apiKey: '',
    credentialHeaderOrParamName: 'api_key',
    dataMapping: defaultMappingKeys(kind),
    active: true,
    notes: '',
    extraHeaders: '',
    camera:
      kind === 'camera'
        ? { ...DEFAULT_SENSOR_CONFIG.camera! }
        : undefined,
  }
}

function defaultIntegrationTypeLabel(kind: SensorKind): string {
  switch (kind) {
    case 'soil':
      return 'Soil probe'
    case 'weather':
      return 'Weather station'
    case 'irrigation':
      return 'Flow meter'
    case 'camera':
      return 'Camera / VMS'
    default:
      return 'Device'
  }
}

export function integrationToConfig(r: SensorIntegrationRecord): SensorApiConfig {
  let authScheme: SensorApiConfig['authScheme'] = 'api_key_header'
  let authHeaderName = String(r.credentialHeaderOrParamName || '').trim() || 'X-API-Key'
  if (r.authType === 'bearer') {
    authScheme = 'bearer'
    authHeaderName = 'Authorization'
  } else if (r.authType === 'none') {
    authScheme = 'raw'
    authHeaderName = 'Authorization'
  } else {
    authScheme = 'api_key_header'
  }
  return {
    baseUrl: r.baseUrl,
    apiKey: r.apiKey,
    authHeaderName,
    authScheme,
    extraHeaders: r.extraHeaders,
    notes: r.notes,
    camera:
      r.camera
        ? { ...DEFAULT_SENSOR_CONFIG.camera!, ...r.camera }
        : undefined,
  }
}

function legacyConfigToRecord(kind: SensorKind, legacy: SensorApiConfig): SensorIntegrationRecord {
  const authType: SensorIntegrationAuthUi =
    legacy.authScheme === 'bearer' ? 'bearer' : legacy.authScheme === 'api_key_header' ? 'api_key' : 'none'
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `m_${Date.now()}`,
    name: kind === 'weather' ? 'Weather station' : 'Imported integration',
    integrationType: defaultIntegrationTypeLabel(kind),
    provider: '',
    pollingMinutes: 60,
    baseUrl: legacy.baseUrl,
    authType,
    apiKey: legacy.apiKey,
    credentialHeaderOrParamName:
      legacy.authScheme === 'bearer'
        ? 'Authorization'
        : String(legacy.authHeaderName || '').trim() || 'api_key',
    dataMapping: defaultMappingKeys(kind),
    active: true,
    notes: legacy.notes,
    extraHeaders: legacy.extraHeaders,
    camera:
      kind === 'camera'
        ? { ...(legacy.camera ?? DEFAULT_SENSOR_CONFIG.camera!) }
        : undefined,
  }
}

export function loadIntegrations(kind: SensorKind): SensorIntegrationRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(integrationsStorageKey(kind))
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map(normalizeIntegrationRecord(kind))
      }
    }
  } catch {
    //
  }
  const legacy = loadSensorConfig(kind)
  if (!String(legacy.baseUrl || '').trim()) return []
  const rec = legacyConfigToRecord(kind, legacy)
  saveIntegrations(kind, [rec])
  return [rec]
}

function normalizeIntegrationRecord(kind: SensorKind) {
  return (x: Partial<SensorIntegrationRecord> & { id?: string }): SensorIntegrationRecord => {
    const base = newEmptyIntegration(kind)
    const merged = { ...base, ...x, id: x.id || base.id, dataMapping: { ...base.dataMapping, ...(x.dataMapping || {}) } }
    if (kind === 'camera') {
      merged.camera = { ...DEFAULT_SENSOR_CONFIG.camera!, ...(x.camera || {}) }
    } else {
      merged.camera = undefined
    }
    return merged
  }
}

export function saveIntegrations(kind: SensorKind, list: SensorIntegrationRecord[]): void {
  localStorage.setItem(integrationsStorageKey(kind), JSON.stringify(list))
  try {
    localStorage.removeItem(storageKeyFor(kind))
  } catch {
    //
  }
}

export type DataMappingFieldDef = { key: string; labelEn: string; labelAr: string }

export function dataMappingFieldList(kind: SensorKind): DataMappingFieldDef[] {
  switch (kind) {
    case 'soil':
      return [
        { key: 'moistureLevel', labelEn: 'moistureLevel', labelAr: 'رطوبة' },
        { key: 'ec', labelEn: 'ec', labelAr: 'توصيل كهربائي' },
        { key: 'temperature', labelEn: 'temperature', labelAr: 'حرارة' },
        { key: 'ph', labelEn: 'ph', labelAr: 'الأس الهيدروجيني' },
        { key: 'salinity', labelEn: 'salinity', labelAr: 'ملوحة' },
        { key: 'nitrogen', labelEn: 'nitrogen', labelAr: 'نيتروجين' },
      ]
    case 'weather':
      return [
        { key: 'maxTemp', labelEn: 'maxTemp', labelAr: 'أقصى حرارة' },
        { key: 'minTemp', labelEn: 'minTemp', labelAr: 'أدنى حرارة' },
        { key: 'avgRH', labelEn: 'avgRH', labelAr: 'رطوبة' },
        { key: 'rainfall', labelEn: 'rainfall', labelAr: 'مطر' },
        { key: 'pressure', labelEn: 'pressure', labelAr: 'ضغط' },
        { key: 'windSpeed', labelEn: 'windSpeed', labelAr: 'سرعة رياح' },
        { key: 'windDirection', labelEn: 'windDirection', labelAr: 'اتجاه رياح' },
        { key: 'clouds', labelEn: 'clouds', labelAr: 'غيوم' },
      ]
    case 'irrigation':
      return [
        { key: 'flowRate', labelEn: 'flowRate', labelAr: 'تدفق' },
        { key: 'pressure', labelEn: 'pressure', labelAr: 'ضغط' },
        { key: 'valveState', labelEn: 'valveState', labelAr: 'حالة المحبس' },
        { key: 'volumeTotal', labelEn: 'volumeTotal', labelAr: 'حجم تراكمي' },
        { key: 'moistureLevel', labelEn: 'moistureLevel', labelAr: 'رطوبة' },
        { key: 'power', labelEn: 'power', labelAr: 'طاقة' },
      ]
    case 'camera':
      return [
        { key: 'streamUrl', labelEn: 'streamUrl', labelAr: 'رابط البث' },
        { key: 'snapshotUrl', labelEn: 'snapshotUrl', labelAr: 'صورة لقطة' },
        { key: 'deviceId', labelEn: 'deviceId', labelAr: 'معرّف الجهاز' },
        { key: 'status', labelEn: 'status', labelAr: 'الحالة' },
      ]
    default:
      return []
  }
}

export function integrationTypeOptions(kind: SensorKind): { value: string; en: string; ar: string }[] {
  switch (kind) {
    case 'soil':
      return [
        { value: 'Soil probe', en: 'Soil probe', ar: 'مجس تربة' },
        { value: 'Moisture station', en: 'Moisture station', ar: 'محطة رطوبة' },
        { value: 'EC probe', en: 'EC probe', ar: 'مجس توصيل' },
        { value: 'Multi-depth probe', en: 'Multi-depth probe', ar: 'مجس متعدد الأعماق' },
      ]
    case 'weather':
      return [
        { value: 'Weather station', en: 'Weather station', ar: 'محطة طقس' },
        { value: 'Rain gauge', en: 'Rain gauge', ar: 'مقياس مطر' },
        { value: 'Anemometer', en: 'Anemometer', ar: 'مقياس رياح' },
      ]
    case 'irrigation':
      return [
        { value: 'Flow meter', en: 'Flow meter', ar: 'عداد تدفق' },
        { value: 'Pressure sensor', en: 'Pressure sensor', ar: 'حساس ضغط' },
        { value: 'Valve controller', en: 'Valve controller', ar: 'تحكم بالمحبس' },
      ]
    case 'camera':
      return [
        { value: 'Camera / VMS', en: 'Camera / VMS', ar: 'كاميرا / VMS' },
        { value: 'NVR gateway', en: 'NVR gateway', ar: 'بوابة NVR' },
        { value: 'ONVIF device', en: 'ONVIF device', ar: 'جهاز ONVIF' },
      ]
    default:
      return []
  }
}

export function parseExtraHeaders(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = String(block || '').split(/\r?\n/)
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf(':')
    if (idx <= 0) continue
    const k = t.slice(0, idx).trim()
    const v = t.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

export function buildAuthHeaders(config: SensorApiConfig): Record<string, string> {
  const headers: Record<string, string> = { ...parseExtraHeaders(config.extraHeaders) }
  const key = String(config.apiKey || '').trim()
  if (!key) return headers

  const name = String(config.authHeaderName || 'Authorization').trim() || 'Authorization'
  if (config.authScheme === 'raw') {
    headers[name] = key
    return headers
  }
  if (config.authScheme === 'api_key_header') {
    headers[name] = key
    return headers
  }
  headers[name] = `Bearer ${key}`
  return headers
}

/** Probe connectivity from the browser (may fail on CORS; still useful on permissive APIs or same-origin proxies). */
export async function probeSensorBaseUrl(baseUrl: string, headers: Record<string, string>): Promise<{ ok: boolean; status?: number; detail: string }> {
  const root = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!root) return { ok: false, detail: 'empty_base_url' }

  const tries = [`${root}/health`, `${root}/api/health`, `${root}/status`, root]

  let lastErr = ''
  for (const url of tries) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...headers },
        mode: 'cors',
      })
      if (res.ok || res.status === 401 || res.status === 403) {
        return {
          ok: true,
          status: res.status,
          detail: res.ok ? 'reachable' : 'reachable_auth_required',
        }
      }
      lastErr = `HTTP ${res.status}`
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }

  return { ok: false, detail: lastErr || 'failed' }
}
