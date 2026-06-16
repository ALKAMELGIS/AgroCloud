import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useParams } from 'react-router-dom'
import { appConfirm } from '../../lib/appDialog'
import { useLanguage } from '../../lib/i18n'
import {
  type CameraVmsPreset,
  type SensorIntegrationRecord,
  type SensorKind,
  buildAuthHeaders,
  dataMappingFieldList,
  integrationToConfig,
  integrationTypeOptions,
  loadIntegrations,
  newEmptyIntegration,
  probeSensorBaseUrl,
  saveIntegrations,
  DEFAULT_SENSOR_CONFIG,
} from '../../lib/sensorApiIntegration'
import './sensor-integration.css'

const VALID_KINDS: SensorKind[] = ['soil', 'weather', 'irrigation', 'camera']

/** Squircle accents + glyphs aligned with Operations page headers */
const KIND_HEAD: Record<SensorKind, { icon: string; tone: 'emerald' | 'sky' | 'cyan' | 'violet' }> = {
  soil: { icon: 'fa-seedling', tone: 'emerald' },
  weather: { icon: 'fa-cloud-sun', tone: 'sky' },
  irrigation: { icon: 'fa-faucet-drip', tone: 'cyan' },
  camera: { icon: 'fa-video', tone: 'violet' },
}

const VMS_DOC: Record<
  CameraVmsPreset,
  { url: string; labelEn: string; labelAr: string }
> = {
  generic_rest: {
    url: '',
    labelEn: 'Use HTTPS REST endpoints documented by your vendor.',
    labelAr: 'استخدم نقاط REST عبر HTTPS كما يحددها المورد.',
  },
  onvif: {
    url: 'https://www.onvif.org/specs/',
    labelEn: 'ONVIF specifications (profiles S/T for streaming & analytics)',
    labelAr: 'مواصفات ONVIF (ملفات S/T للبث والتحليلات)',
  },
  rtsp_hls: {
    url: '',
    labelEn: 'Paste RTSP or HLS URLs from your NVR/VMS or gateway.',
    labelAr: 'ألصق روابط RTSP أو HLS من مسجل الفيديو أو البوابة.',
  },
  axis_vapix: {
    url: 'https://developer.axis.com/vapix-library/',
    labelEn: 'Axis VAPIX HTTP API',
    labelAr: 'واجهة Axis VAPIX',
  },
  milestone_xprotect: {
    url: 'https://doc.developer.milestonesys.com/',
    labelEn: 'Milestone Developer documentation (Mobile/Web gateway APIs)',
    labelAr: 'توثيق Milestone للمطورين',
  },
  genetec: {
    url: 'https://developer.genetec.com/',
    labelEn: 'Genetec Developer Portal',
    labelAr: 'بوابة مطوري Genetec',
  },
  hikvision_isapi: {
    url: 'https://www.hikvision.com/en/support/',
    labelEn: 'Hikvision ISAPI — refer to device SDK / API guides for your model.',
    labelAr: 'Hikvision ISAPI — راجع دليل الطراز',
  },
  dahua_http: {
    url: 'https://open.dahuatech.com/',
    labelEn: 'Dahua Open Platform / HTTP API',
    labelAr: 'منصة Dahua المفتوحة',
  },
  blueiris: {
    url: 'https://wiki.blueirissoftware.com/',
    labelEn: 'Blue Iris JSON API (wiki)',
    labelAr: 'Blue Iris JSON API',
  },
  exacqvision: {
    url: 'https://www.exacq.com/support/',
    labelEn: 'ExacqVision Web Service API — check vendor docs for version.',
    labelAr: 'ExacqVision — راجع التوثيق حسب الإصدار',
  },
  hanwha_wisenet: {
    url: 'https://developer.hanwhavision.com/',
    labelEn: 'Hanwha Vision OPEN API / SUNAPI',
    labelAr: 'Hanwha OPEN API',
  },
}

function copyUi(language: 'en' | 'ar') {
  const en = {
    pageTitleSoil: 'Soil Sensors API',
    pageTitleWeather: 'Weather Sensors API',
    pageTitleIrrigation: 'Irrigation Sensors API',
    pageTitleCamera: 'Camera API integration',
    leadSoil: 'Connect soil moisture, EC, temperature probes via your vendor HTTPS API.',
    leadWeather: 'Connect weather stations (rain, wind, radiation) via REST or MQTT gateway.',
    leadIrrigation: 'Connect flow meters, pressure, valve controllers via API.',
    leadCamera:
      'Choose your video platform (VMS/NVR). Store base URL and credentials; RTSP/HLS can be used for live preview where supported.',
    addIntegration: 'Add Integration',
    addFirstSensor: 'Add Your First Integration',
    emptySoil: 'No soil sensors configured yet',
    emptyWeather: 'No weather sensors configured yet',
    emptyIrrigation: 'No irrigation sensors configured yet',
    emptyCamera: 'No cameras configured yet',
    modalAdd: 'Add API Integration',
    modalEdit: 'Edit API Integration',
    name: 'Name',
    required: '*',
    type: 'Type',
    provider: 'Provider',
    polling: 'Polling Interval (min)',
    baseUrl: 'Base URL',
    authHeading: 'Authentication',
    authType: 'Auth Type',
    apiKey: 'API Key',
    queryParamHint: 'e.g. api_key, key, token',
    credentialLabel: 'Header / query param name',
    mappingHeadingSoil: 'Data mapping (API response path → soil log field)',
    mappingHeadingWeather: 'Data mapping (API response path → weather log field)',
    mappingHeadingIrrigation: 'Data mapping (API response path → irrigation log field)',
    mappingHeadingCamera: 'Data mapping (API response path → camera log field)',
    mappingHelp:
      "Use dot-notation to map fields from the API response. e.g. 'data.temperature.max' extracts the value at response.data.temperature.max",
    activePolling: 'Active (enable automatic polling)',
    testConnection: 'Test Connection',
    cancel: 'Cancel',
    create: 'Create',
    saveChanges: 'Save',
    savedList: 'Integration saved.',
    deleted: 'Removed.',
    authOptApiKey: 'API Key',
    authOptBearer: 'Bearer token',
    authOptNone: 'None',
    sectionCam: 'Surveillance software / protocol',
    vmsPreset: 'Integration preset',
    streamUrl: 'Stream URL (RTSP / HLS)',
    secondaryUrl: 'Secondary URL (gateway / webhook)',
    docTitle: 'Documentation',
    presets: {
      generic_rest: 'Generic HTTPS REST',
      onvif: 'ONVIF device',
      rtsp_hls: 'Direct RTSP / HLS stream',
      axis_vapix: 'Axis (VAPIX)',
      milestone_xprotect: 'Milestone XProtect',
      genetec: 'Genetec Security Center',
      hikvision_isapi: 'Hikvision (ISAPI)',
      dahua_http: 'Dahua HTTP API',
      blueiris: 'Blue Iris',
      exacqvision: 'ExacqVision',
      hanwha_wisenet: 'Hanwha / Wisenet',
    } satisfies Record<CameraVmsPreset, string>,
    edit: 'Edit',
    remove: 'Remove',
    active: 'Active',
    inactive: 'Inactive',
    corsHint:
      'If requests fail due to CORS, expose the API via your backend proxy or enable CORS on the API gateway.',
    testing: 'Testing…',
    testOk: 'Reachable (check auth if 401).',
    testFail: 'Could not verify from browser.',
  }
  const ar: typeof en = {
    ...en,
    pageTitleSoil: 'واجهة حساسات التربة',
    pageTitleWeather: 'واجهة حساسات الطقس',
    pageTitleIrrigation: 'واجهة حساسات الري',
    pageTitleCamera: 'تكامل كاميرات API',
    leadSoil: 'اربط قراءات الرطوبة والملوحة وحرارة التربة عبر واجهة HTTPS لمورد المعدات.',
    leadWeather: 'اربط محطات الطقس (مطر، رياح، إشعاع) عبر REST أو بوابة MQTT.',
    leadIrrigation: 'اربط عدادات التدفق والضغط والمحابس عبر الواجهة البرمجية.',
    leadCamera:
      'اختر منصة الفيديو (VMS/NVR). احفظ عنوان الأساس وبيانات الدخيل؛ يمكن استخدام RTSP/HLS للمعاينة حيث يتوفر الدعم.',
    addIntegration: 'إضافة تكامل',
    addFirstSensor: 'أضف أول تكامل',
    emptySoil: 'لم يتم ضبط حساسات تربة بعد',
    emptyWeather: 'لم يتم ضبط حساسات طقس بعد',
    emptyIrrigation: 'لم يتم ضبط حساسات ري بعد',
    emptyCamera: 'لم تُضبط كاميرات بعد',
    modalAdd: 'إضافة تكامل API',
    modalEdit: 'تعديل تكامل API',
    name: 'الاسم',
    required: '*',
    type: 'النوع',
    provider: 'المزوّد',
    polling: 'فترة الاستطلاع (دقيقة)',
    baseUrl: 'العنوان الأساسي',
    authHeading: 'المصادقة',
    authType: 'نوع المصادقة',
    apiKey: 'مفتاح API',
    queryParamHint: 'مثل api_key أو token',
    credentialLabel: 'اسم الرأس أو المعامل',
    mappingHeadingSoil: 'ربط البيانات (مسار JSON → حقل سجل التربة)',
    mappingHeadingWeather: 'ربط البيانات (مسار JSON → حقل سجل الطقس)',
    mappingHeadingIrrigation: 'ربط البيانات (مسار JSON → حقل سجل الري)',
    mappingHeadingCamera: 'ربط البيانات (مسار JSON → حقل سجل الكاميرا)',
    mappingHelp:
      'استخدم النقطة لمطابقة الحقول، مثل data.temperature.max للقيمة في المسار المقابل.',
    activePolling: 'نشط (تمكين الاستطلاع التلقائي)',
    testConnection: 'اختبار الاتصال',
    cancel: 'إلغاء',
    create: 'إنشاء',
    saveChanges: 'حفظ',
    savedList: 'تم حفظ التكامل.',
    deleted: 'تم الحذف.',
    authOptApiKey: 'مفتاح API',
    authOptBearer: 'رمز Bearer',
    authOptNone: 'بدون',
    sectionCam: 'برنامج المراقبة / البروتوكول',
    vmsPreset: 'نوع التكامل',
    streamUrl: 'رابط البث (RTSP / HLS)',
    secondaryUrl: 'رابط ثانٍ (بوابة / webhook)',
    docTitle: 'التوثيق',
    presets: {
      generic_rest: 'REST عام عبر HTTPS',
      onvif: 'جهاز ONVIF',
      rtsp_hls: 'بث RTSP / HLS مباشر',
      axis_vapix: 'Axis (VAPIX)',
      milestone_xprotect: 'Milestone XProtect',
      genetec: 'Genetec Security Center',
      hikvision_isapi: 'Hikvision (ISAPI)',
      dahua_http: 'Dahua HTTP API',
      blueiris: 'Blue Iris',
      exacqvision: 'ExacqVision',
      hanwha_wisenet: 'Hanwha / Wisenet',
    },
    edit: 'تعديل',
    remove: 'حذف',
    active: 'نشط',
    inactive: 'غير نشط',
    corsHint: 'إذا فشل الطلب بسبب CORS، استخدم وسيطاً على الخادم أو فعّل CORS على البوابة.',
    testing: 'جار الاختبار…',
    testOk: 'تم الوصول (تحقق من المصادقة إذا ظهر 401).',
    testFail: 'تعذّر التحقق من المتصفح.',
  }
  return language === 'ar' ? ar : en
}

function titleForKind(kind: SensorKind, c: ReturnType<typeof copyUi>): { title: string; lead: string; empty: string } {
  switch (kind) {
    case 'soil':
      return { title: c.pageTitleSoil, lead: c.leadSoil, empty: c.emptySoil }
    case 'weather':
      return { title: c.pageTitleWeather, lead: c.leadWeather, empty: c.emptyWeather }
    case 'irrigation':
      return { title: c.pageTitleIrrigation, lead: c.leadIrrigation, empty: c.emptyIrrigation }
    case 'camera':
      return { title: c.pageTitleCamera, lead: c.leadCamera, empty: c.emptyCamera }
    default:
      return { title: '', lead: '', empty: '' }
  }
}

function mappingHeading(kind: SensorKind, c: ReturnType<typeof copyUi>): string {
  switch (kind) {
    case 'soil':
      return c.mappingHeadingSoil
    case 'weather':
      return c.mappingHeadingWeather
    case 'irrigation':
      return c.mappingHeadingIrrigation
    case 'camera':
      return c.mappingHeadingCamera
    default:
      return c.mappingHeadingWeather
  }
}

export default function SensorIntegrationPage() {
  const { sensorKind } = useParams<{ sensorKind: string }>()
  const { language, direction } = useLanguage()
  const c = useMemo(() => copyUi(language), [language])

  const kind = useMemo((): SensorKind | null => {
    const k = String(sensorKind || '').toLowerCase()
    return VALID_KINDS.includes(k as SensorKind) ? (k as SensorKind) : null
  }, [sensorKind])

  const [integrations, setIntegrations] = useState<SensorIntegrationRecord[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<SensorIntegrationRecord | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [flash, setFlash] = useState<null | { kind: 'ok' | 'err'; message: string }>(null)

  const reload = useCallback(() => {
    if (!kind) return
    setIntegrations(loadIntegrations(kind))
  }, [kind])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 3800)
    return () => window.clearTimeout(id)
  }, [flash])

  useEffect(() => {
    if (!modalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [modalOpen])

  const head = kind ? titleForKind(kind, c) : { title: '', lead: '', empty: '' }
  const headVisual = kind ? KIND_HEAD[kind] : null

  const openCreate = () => {
    if (!kind) return
    setEditingId(null)
    setDraft(newEmptyIntegration(kind))
    setModalOpen(true)
  }

  const openEdit = (id: string) => {
    if (!kind) return
    const row = integrations.find(x => x.id === id)
    if (!row) return
    setEditingId(id)
    setDraft({ ...row, dataMapping: { ...row.dataMapping } })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setDraft(null)
  }

  const persist = (next: SensorIntegrationRecord[]) => {
    if (!kind) return
    saveIntegrations(kind, next)
    setIntegrations(next)
  }

  const handleSaveDraft = () => {
    if (!kind || !draft) return
    const nameOk = draft.name.trim().length > 0
    const urlOk = draft.baseUrl.trim().length > 0
    if (!nameOk || !urlOk) {
      setFlash({ kind: 'err', message: language === 'ar' ? 'أدخل الاسم والعنوان.' : 'Name and Base URL are required.' })
      return
    }
    setBusy('save')
    try {
      if (editingId) {
        persist(integrations.map(x => (x.id === editingId ? { ...draft, id: editingId } : x)))
      } else {
        persist([...integrations, draft])
      }
      setFlash({ kind: 'ok', message: c.savedList })
      closeModal()
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!kind) return
    const ok = await appConfirm(language === 'ar' ? 'حذف هذا التكامل؟' : 'Remove this integration?', {
      title: language === 'ar' ? 'حذف التكامل' : 'Remove integration',
      danger: true,
      confirmLabel: language === 'ar' ? 'حذف' : 'Remove',
      cancelLabel: language === 'ar' ? 'إلغاء' : 'Cancel',
    })
    if (!ok) return
    persist(integrations.filter(x => x.id !== id))
    setFlash({ kind: 'ok', message: c.deleted })
  }

  const handleTest = async () => {
    if (!draft) return
    setBusy('test')
    try {
      const cfg = integrationToConfig(draft)
      const headers = buildAuthHeaders(cfg)
      const result = await probeSensorBaseUrl(cfg.baseUrl, headers)
      if (result.ok) {
        setFlash({
          kind: 'ok',
          message: `${c.testOk}${result.status != null ? ` (${result.status})` : ''}`,
        })
      } else {
        setFlash({
          kind: 'err',
          message: `${c.testFail} (${result.detail}). ${c.corsHint}`,
        })
      }
    } finally {
      setBusy(null)
    }
  }

  const updateDraft = (patch: Partial<SensorIntegrationRecord>) => {
    setDraft(d => (d ? { ...d, ...patch } : d))
  }

  const updateMapping = (key: string, value: string) => {
    setDraft(d => {
      if (!d) return d
      return { ...d, dataMapping: { ...d.dataMapping, [key]: value } }
    })
  }

  const cam = draft?.camera ?? { ...DEFAULT_SENSOR_CONFIG.camera! }
  const presetMeta = draft && kind === 'camera' && cam.vmsPreset ? VMS_DOC[cam.vmsPreset] : null

  const typeOpts = kind ? integrationTypeOptions(kind) : []
  const mappingFields = kind ? dataMappingFieldList(kind) : []

  const createDisabled =
    busy !== null ||
    !draft?.name.trim() ||
    !draft?.baseUrl.trim() ||
    !/^https?:\/\//i.test(String(draft?.baseUrl || '').trim())

  if (!kind) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="sensor-shell" dir={direction}>
      <main className="sensor-main">
        <header className="sensor-main-header">
          <div className="sensor-main-title-row">
            <span
              className={`sensor-page-icon sensor-page-icon--${headVisual?.tone ?? 'emerald'}`}
              aria-hidden
            >
              <i className={`fa-solid ${headVisual?.icon ?? 'fa-circle'}`} />
            </span>
            <div>
              <h1 className="sensor-main-title">{head.title}</h1>
              <p className="sensor-main-lead">{head.lead}</p>
            </div>
          </div>
          <button type="button" className="sensor-btn-primary" onClick={openCreate}>
            <i className="fa-solid fa-plus" aria-hidden />
            {c.addIntegration}
          </button>
        </header>

        {flash ? (
          <div className={`sensor-flash ${flash.kind === 'ok' ? 'ok' : 'err'}`} role="status">
            {flash.message}
          </div>
        ) : null}

        {integrations.length === 0 ? (
          <div className="sensor-empty-card">
            <p className="sensor-empty-text">{head.empty}</p>
            <button type="button" className="sensor-btn-outline" onClick={openCreate}>
              <i className="fa-solid fa-plus" aria-hidden />
              {c.addFirstSensor}
            </button>
          </div>
        ) : (
          <ul className="sensor-integration-list">
            {integrations.map(row => (
              <li key={row.id} className="sensor-integration-card">
                <div className="sensor-integration-card-main">
                  <h2 className="sensor-integration-name">{row.name}</h2>
                  <p className="sensor-integration-meta">
                    {row.integrationType}
                    {row.provider ? ` · ${row.provider}` : ''}
                  </p>
                  <p className="sensor-integration-url" dir="ltr">
                    {row.baseUrl || '—'}
                  </p>
                </div>
                <div className="sensor-integration-card-aside">
                  <span className={row.active ? 'sensor-badge sensor-badge-active' : 'sensor-badge'}>
                    {row.active ? c.active : c.inactive}
                  </span>
                  <div className="sensor-integration-card-actions">
                    <button type="button" className="sensor-btn-ghost" onClick={() => openEdit(row.id)}>
                      {c.edit}
                    </button>
                    <button type="button" className="sensor-btn-ghost danger" onClick={() => void handleDelete(row.id)}>
                      {c.remove}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {modalOpen && draft
        ? createPortal(
            <div className="sensor-modal-backdrop" role="presentation" onClick={closeModal}>
              <div
                className="sensor-modal"
                role="dialog"
                aria-modal
                aria-labelledby="sensor-modal-title"
                onClick={e => e.stopPropagation()}
              >
                <header className="sensor-modal-header">
                  <h2 id="sensor-modal-title" className="sensor-modal-title">
                    {editingId ? c.modalEdit : c.modalAdd}
                  </h2>
                </header>

                <div className="sensor-modal-body">
              <div className="sensor-form-grid sensor-form-grid-2">
                <label className="sensor-field outlined">
                  <span className="sensor-field-label">
                    {c.name} {c.required}
                  </span>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={e => updateDraft({ name: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label className="sensor-field outlined">
                  <span className="sensor-field-label">{c.type}</span>
                  <select
                    value={draft.integrationType}
                    onChange={e => updateDraft({ integrationType: e.target.value })}
                  >
                    {typeOpts.map(o => (
                      <option key={o.value} value={o.value}>
                        {language === 'ar' ? o.ar : o.en}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sensor-field outlined">
                  <span className="sensor-field-label">{c.provider}</span>
                  <input
                    type="text"
                    value={draft.provider}
                    onChange={e => updateDraft({ provider: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label className="sensor-field outlined">
                  <span className="sensor-field-label">{c.polling}</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.pollingMinutes}
                    onChange={e => updateDraft({ pollingMinutes: Number(e.target.value) || 60 })}
                  />
                </label>
              </div>

              <label className="sensor-field outlined sensor-field-full">
                <span className="sensor-field-label">
                  {c.baseUrl} {c.required}
                </span>
                <input
                  type="url"
                  dir="ltr"
                  placeholder="https://"
                  value={draft.baseUrl}
                  onChange={e => updateDraft({ baseUrl: e.target.value })}
                  autoComplete="off"
                />
              </label>

              <p className="sensor-section-cap">{c.authHeading}</p>
              <div className="sensor-form-grid sensor-form-grid-2">
                <label className="sensor-field outlined">
                  <span className="sensor-field-label">{c.authType}</span>
                  <select
                    value={draft.authType}
                    onChange={e =>
                      updateDraft({ authType: e.target.value as SensorIntegrationRecord['authType'] })
                    }
                  >
                    <option value="api_key">{c.authOptApiKey}</option>
                    <option value="bearer">{c.authOptBearer}</option>
                    <option value="none">{c.authOptNone}</option>
                  </select>
                </label>
              </div>
              <div className="sensor-form-grid sensor-form-grid-2">
                <label className="sensor-field outlined">
                  <span className="sensor-field-label">{c.apiKey}</span>
                  <input
                    type="password"
                    value={draft.apiKey}
                    onChange={e => updateDraft({ apiKey: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label className="sensor-field outlined">
                  <span className="sensor-field-label">{c.credentialLabel}</span>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="api_key"
                    value={draft.credentialHeaderOrParamName}
                    onChange={e => updateDraft({ credentialHeaderOrParamName: e.target.value })}
                    autoComplete="off"
                  />
                  <span className="sensor-field-hint">{c.queryParamHint}</span>
                </label>
              </div>

              <p className="sensor-section-cap">{mappingHeading(kind, c)}</p>
              <p className="sensor-mapping-intro">{c.mappingHelp}</p>
              <div className="sensor-mapping-grid">
                {mappingFields.map(f => (
                  <label key={f.key} className="sensor-field outlined">
                    <span className="sensor-field-label">{language === 'ar' ? f.labelAr : f.labelEn}</span>
                    <input
                      type="text"
                      dir="ltr"
                      spellCheck={false}
                      placeholder={`response.${f.key}`}
                      value={draft.dataMapping[f.key] ?? ''}
                      onChange={e => updateMapping(f.key, e.target.value)}
                    />
                  </label>
                ))}
              </div>

              {kind === 'camera' ? (
                <>
                  <p className="sensor-section-cap">{c.sectionCam}</p>
                  <label className="sensor-field outlined sensor-field-full">
                    <span className="sensor-field-label">{c.vmsPreset}</span>
                    <select
                      value={cam.vmsPreset}
                      onChange={e =>
                        updateDraft({
                          camera: {
                            ...cam,
                            vmsPreset: e.target.value as CameraVmsPreset,
                          },
                        })
                      }
                    >
                      {(Object.keys(c.presets) as CameraVmsPreset[]).map(id => (
                        <option key={id} value={id}>
                          {c.presets[id]}
                        </option>
                      ))}
                    </select>
                  </label>

                  {presetMeta ? (
                    <div className="sensor-field sensor-camera-doc">
                      <span className="sensor-field-label">{c.docTitle}</span>
                      <p>{language === 'ar' ? presetMeta.labelAr : presetMeta.labelEn}</p>
                      {presetMeta.url ? (
                        <a href={presetMeta.url} target="_blank" rel="noreferrer">
                          {presetMeta.url}
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  <label className="sensor-field outlined sensor-field-full">
                    <span className="sensor-field-label">{c.streamUrl}</span>
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="rtsp:// or https://…"
                      value={cam.streamUrl}
                      onChange={e =>
                        updateDraft({
                          camera: { ...cam, streamUrl: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="sensor-field outlined sensor-field-full">
                    <span className="sensor-field-label">{c.secondaryUrl}</span>
                    <input
                      type="text"
                      dir="ltr"
                      value={cam.secondaryUrl}
                      onChange={e =>
                        updateDraft({
                          camera: { ...cam, secondaryUrl: e.target.value },
                        })
                      }
                    />
                  </label>
                </>
              ) : null}

              <label className="sensor-active-row">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={draft.active}
                  className="sensor-switch-input"
                  checked={draft.active}
                  onChange={e => updateDraft({ active: e.target.checked })}
                />
                <span className="sensor-switch-track" aria-hidden="true">
                  <span className="sensor-switch-thumb" />
                </span>
                <span className="sensor-active-label">{c.activePolling}</span>
              </label>
            </div>

            <footer className="sensor-modal-footer">
              <button
                type="button"
                className="sensor-btn-secondary"
                disabled={busy !== null || !draft.baseUrl.trim()}
                onClick={() => void handleTest()}
              >
                <i className="fa-solid fa-play" aria-hidden /> {busy === 'test' ? c.testing : c.testConnection}
              </button>
              <div className="sensor-modal-footer-right">
                <button type="button" className="sensor-btn-text" onClick={closeModal}>
                  {c.cancel}
                </button>
                <button
                  type="button"
                  className="sensor-btn-primary"
                  disabled={createDisabled}
                  onClick={handleSaveDraft}
                >
                  {busy === 'save' ? '…' : editingId ? c.saveChanges : c.create}
                </button>
              </div>
            </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
