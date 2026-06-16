import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { useLanguage } from '../../lib/i18n'
import {
  TELEMATICS_PROVIDERS,
  type TelematicsProviderDef,
  type TelematicsProviderId,
  readTelematicsConnection,
  writeTelematicsConnection,
} from './gpsTelematicsProviders'
import './sensor-integration.css'
import './gps-vehicle-tracking.css'

const STORAGE_KEY = 'gps_vehicle_equipment_v1'

const VALID_TYPES = new Set<string>(['tractor', 'sprayer', 'harvester', 'drone', 'vehicle', 'other'])

export type EquipmentType = 'tractor' | 'sprayer' | 'harvester' | 'drone' | 'vehicle' | 'other'

export type EquipmentRecord = {
  id: string
  name: string
  type: EquipmentType
  createdAt: string
  /** OEM telematics profile used when syncing this asset (optional). */
  providerId?: TelematicsProviderId
}

const TYPE_META: Record<EquipmentType, { icon: string; color: string }> = {
  tractor: { icon: 'fa-tractor', color: '#047857' },
  sprayer: { icon: 'fa-spray-can-sparkles', color: '#0284c7' },
  harvester: { icon: 'fa-wheat-awn', color: '#ca8a04' },
  drone: { icon: 'fa-drone', color: '#059669' },
  vehicle: { icon: 'fa-car-side', color: '#dc2626' },
  other: { icon: 'fa-location-dot', color: '#db2777' },
}

function isProviderId(v: unknown): v is TelematicsProviderId {
  return typeof v === 'string' && TELEMATICS_PROVIDERS.some(p => p.id === v)
}

function readEquipment(): EquipmentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(row => {
        if (!row || typeof row !== 'object') return null
        const r = row as EquipmentRecord
        if (typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.createdAt !== 'string') return null
        if (!VALID_TYPES.has(String(r.type))) return null
        const providerId = isProviderId((r as any).providerId) ? (r as any).providerId : undefined
        return { ...r, providerId } as EquipmentRecord
      })
      .filter((x): x is EquipmentRecord => x !== null)
  } catch {
    return []
  }
}

function writeEquipment(rows: EquipmentRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

function copyUi(lang: 'en' | 'ar') {
  const en = {
    pageTitle: 'GPS Vehicle Tracking',
    lead: 'Register farm vehicles and machinery for GPS monitoring and fleet visibility.',
    equipment: 'Equipment',
    refresh: 'Refresh',
    addEquipment: 'Add Equipment',
    modalTitle: 'Add Equipment',
    name: 'Name',
    type: 'Type',
    oemProfile: 'Telematics profile',
    oemHint: 'Optional — defaults to your main connection below.',
    cancel: 'Cancel',
    add: 'Add',
    empty: 'No equipment registered',
    saved: 'Equipment added.',
    removed: 'Removed.',
    nameRequired: 'Enter a name.',
    remove: 'Remove',
    apiTitle: 'Telematics API connection',
    apiLead:
      'Choose your OEM or gateway, then set the base URL your backend will call (OAuth and secrets should never live in the browser in production).',
    apiBaseUrl: 'API / portal base URL',
    apiOrgId: 'Organization or fleet reference (optional)',
    apiSave: 'Save connection',
    apiSaved: 'Connection settings saved.',
    apiUseDefault: 'Use suggested URL',
    apiActive: 'Active profile',
    apiNone: 'Not configured',
    selectType: 'Select equipment type',
  }
  const ar: typeof en = {
    ...en,
    pageTitle: 'تتبع مركبات GPS',
    lead: 'سجّل المركبات والآلات لمتابعة GPS ورؤية الأسطول.',
    equipment: 'المعدات',
    refresh: 'تحديث',
    addEquipment: 'إضافة معدة',
    modalTitle: 'إضافة معدة',
    name: 'الاسم',
    type: 'النوع',
    oemProfile: 'ملف الاتصال',
    oemHint: 'اختياري — يعتمد الاتصال الرئيسي أدناه.',
    cancel: 'إلغاء',
    add: 'إضافة',
    empty: 'لا توجد معدات مسجلة',
    saved: 'تمت إضافة المعدة.',
    removed: 'تم الحذف.',
    nameRequired: 'أدخل اسماً.',
    remove: 'حذف',
    apiTitle: 'اتصال واجهة التليماتكس',
    apiLead:
      'اختر المصنّع أو البوابة ثم حدّد عنوان الأساس الذي يستدعيه خادمك (عرّف OAuth والأسرار على الخادم وليس في المتصفح).',
    apiBaseUrl: 'عنوان الأساس API / البوابة',
    apiOrgId: 'مرجع المؤسسة أو الأسطول (اختياري)',
    apiSave: 'حفظ الاتصال',
    apiSaved: 'تم حفظ إعدادات الاتصال.',
    apiUseDefault: 'اقتراح العنوان',
    apiActive: 'الملف النشط',
    apiNone: 'غير مضبوط',
    selectType: 'اختر نوع المعدة',
  }
  const types: Record<EquipmentType, { en: string; ar: string }> = {
    tractor: { en: 'Tractor', ar: 'جرار' },
    sprayer: { en: 'Sprayer', ar: 'مرشّة' },
    harvester: { en: 'Harvester', ar: 'حصادة' },
    drone: { en: 'Drone', ar: 'طائرة مسيّرة' },
    vehicle: { en: 'Vehicle', ar: 'مركبة' },
    other: { en: 'Other', ar: 'أخرى' },
  }
  return { ui: lang === 'ar' ? ar : en, types }
}

function EquipmentTypeMenu(props: {
  value: EquipmentType
  onChange: (v: EquipmentType) => void
  options: { value: EquipmentType; label: string }[]
  lang: 'en' | 'ar'
  uiSelectLabel: string
}) {
  const { value, onChange, options, lang, uiSelectLabel } = props
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const meta = TYPE_META[value]

  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const outside = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', close)
    document.addEventListener('mousedown', outside)
    return () => {
      window.removeEventListener('keydown', close)
      document.removeEventListener('mousedown', outside)
    }
  }, [open])

  return (
    <div className="gps-type-dd" ref={root}>
      <button
        type="button"
        className="gps-type-dd__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={uiSelectLabel}
        onClick={() => setOpen(o => !o)}
      >
        <span className="gps-type-dd__trigger-icon" style={{ color: meta.color }} aria-hidden>
          <i className={`fa-solid ${meta.icon}`} />
        </span>
        <span className="gps-type-dd__trigger-label">{options.find(o => o.value === value)?.label}</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} gps-type-dd__chev`} aria-hidden />
      </button>
      {open ? (
        <ul className="gps-type-dd__menu" role="listbox">
          {options.map(o => {
            const tm = TYPE_META[o.value]
            const active = o.value === value
            return (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`gps-type-dd__option${active ? ' gps-type-dd__option--active' : ''}`}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <span className="gps-type-dd__opt-icon" style={{ color: tm.color }} aria-hidden>
                    <i className={`fa-solid ${tm.icon}`} />
                  </span>
                  <span>{o.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function ProviderMenu(props: {
  value: TelematicsProviderId
  onChange: (v: TelematicsProviderId) => void
  lang: 'en' | 'ar'
}) {
  const { value, onChange, lang } = props
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const sel = TELEMATICS_PROVIDERS.find(p => p.id === value) ?? TELEMATICS_PROVIDERS[0]

  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const outside = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', close)
    document.addEventListener('mousedown', outside)
    return () => {
      window.removeEventListener('keydown', close)
      document.removeEventListener('mousedown', outside)
    }
  }, [open])

  return (
    <div className="gps-provider-dd" ref={root}>
      <button
        type="button"
        className="gps-provider-dd__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="gps-provider-dd__trigger-icon" style={{ color: sel.accent }} aria-hidden>
          <i className={`fa-solid ${sel.iconClass}`} />
        </span>
        <span className="gps-provider-dd__trigger-text">
          <span className="gps-provider-dd__name">{lang === 'ar' ? sel.nameAr : sel.nameEn}</span>
          <span className="gps-provider-dd__sub">{lang === 'ar' ? sel.shortAr : sel.shortEn}</span>
        </span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} gps-provider-dd__chev`} aria-hidden />
      </button>
      {open ? (
        <ul className="gps-provider-dd__menu" role="listbox">
          {TELEMATICS_PROVIDERS.map(p => {
            const active = p.id === value
            return (
              <li key={p.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`gps-provider-dd__option${active ? ' gps-provider-dd__option--active' : ''}`}
                  onClick={() => {
                    onChange(p.id)
                    setOpen(false)
                  }}
                >
                  <span className="gps-provider-dd__opt-icon" style={{ color: p.accent }} aria-hidden>
                    <i className={`fa-solid ${p.iconClass}`} />
                  </span>
                  <span className="gps-provider-dd__opt-body">
                    <span className="gps-provider-dd__opt-name">{lang === 'ar' ? p.nameAr : p.nameEn}</span>
                    <span className="gps-provider-dd__opt-desc">{lang === 'ar' ? p.shortAr : p.shortEn}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export default function GpsVehicleTracking() {
  const { language, direction } = useLanguage()
  const lang = language === 'ar' ? 'ar' : 'en'
  const { ui, types } = useMemo(() => copyUi(lang), [lang])

  const savedConn = useMemo(() => readTelematicsConnection(), [])
  const [connTick, setConnTick] = useState(0)
  const activeConn = useMemo(() => readTelematicsConnection(), [connTick])

  const [connProvider, setConnProvider] = useState<TelematicsProviderId>(
    () => savedConn?.providerId ?? TELEMATICS_PROVIDERS[0].id,
  )
  const [connBaseUrl, setConnBaseUrl] = useState(() => savedConn?.baseUrl ?? TELEMATICS_PROVIDERS[0].defaultBaseUrl)
  const [connOrgId, setConnOrgId] = useState(() => savedConn?.organizationId ?? '')

  const [rows, setRows] = useState<EquipmentRecord[]>(() => readEquipment())
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [eqType, setEqType] = useState<EquipmentType>('tractor')
  const [eqProvider, setEqProvider] = useState<TelematicsProviderId | 'inherit'>('inherit')
  const [flash, setFlash] = useState<null | { kind: 'ok' | 'err'; message: string }>(null)

  const reload = useCallback(() => {
    setRows(readEquipment())
    const c = readTelematicsConnection()
    if (c) {
      setConnProvider(c.providerId)
      setConnBaseUrl(c.baseUrl)
      setConnOrgId(c.organizationId)
    }
    setConnTick(t => t + 1)
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 3200)
    return () => window.clearTimeout(t)
  }, [flash])

  const typeOptions = useMemo(
    () =>
      (Object.keys(TYPE_META) as EquipmentType[]).map(value => ({
        value,
        label: types[value][lang],
      })),
    [lang, types],
  )

  const saveMainConnection = () => {
    const p = TELEMATICS_PROVIDERS.find(x => x.id === connProvider)
    const base = String(connBaseUrl || '').trim() || p?.defaultBaseUrl || ''
    writeTelematicsConnection({
      providerId: connProvider,
      baseUrl: base,
      organizationId: String(connOrgId || '').trim(),
      updatedAt: new Date().toISOString(),
    })
    setConnTick(t => t + 1)
    setFlash({ kind: 'ok', message: ui.apiSaved })
  }

  const applySuggestedUrl = () => {
    const p = TELEMATICS_PROVIDERS.find(x => x.id === connProvider)
    if (p) setConnBaseUrl(p.defaultBaseUrl)
  }

  const openModal = () => {
    const c = readTelematicsConnection()
    setName('')
    setEqType('tractor')
    setEqProvider('inherit')
    setModalOpen(true)
  }

  const submit = () => {
    const trimmed = String(name || '').trim()
    if (!trimmed) {
      setFlash({ kind: 'err', message: ui.nameRequired })
      return
    }
    const global = readTelematicsConnection()
    const providerId =
      eqProvider === 'inherit' ? global?.providerId : eqProvider
    const next: EquipmentRecord = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: trimmed,
      type: eqType,
      createdAt: new Date().toISOString(),
      ...(providerId ? { providerId } : {}),
    }
    const merged = [next, ...rows]
    writeEquipment(merged)
    setRows(merged)
    setModalOpen(false)
    setFlash({ kind: 'ok', message: ui.saved })
  }

  const remove = (id: string) => {
    const merged = rows.filter(r => r.id !== id)
    writeEquipment(merged)
    setRows(merged)
    setFlash({ kind: 'ok', message: ui.removed })
  }

  const meta = TYPE_META[eqType]
  const activeP: TelematicsProviderDef | undefined = activeConn
    ? TELEMATICS_PROVIDERS.find(p => p.id === activeConn.providerId)
    : undefined

  return (
    <div className="sensor-shell" dir={direction}>
      <main className="sensor-main">
        <header className="sensor-main-header">
          <div className="sensor-main-title-row">
            <span className="sensor-page-icon sensor-page-icon--emerald" aria-hidden>
              <i className="fa-solid fa-crosshairs" />
            </span>
            <div>
              <h1 className="sensor-main-title">{ui.pageTitle}</h1>
              <p className="sensor-main-lead">{ui.lead}</p>
            </div>
          </div>
          <div className="gps-page-actions">
            <button type="button" className="sensor-btn-outline" onClick={reload}>
              <i className="fa-solid fa-rotate-right" aria-hidden />
              {ui.refresh}
            </button>
            <button type="button" className="sensor-btn-primary" onClick={openModal}>
              <i className="fa-solid fa-plus" aria-hidden />
              {ui.addEquipment}
            </button>
          </div>
        </header>

        {flash ? (
          <div className={`sensor-flash ${flash.kind === 'ok' ? 'ok' : 'err'}`} role="status">
            {flash.message}
          </div>
        ) : null}

        <section className="gps-api-section" aria-labelledby="gps-api-title">
          <h2 id="gps-api-title" className="gps-equipment-heading">
            {ui.apiTitle}
          </h2>
          <p className="gps-api-lead">{ui.apiLead}</p>

          <div className="gps-api-card">
            <div className="gps-api-row">
              <div className="gps-api-field gps-api-field--grow">
                <span className="gps-api-label">{lang === 'ar' ? 'المزوّد' : 'Provider'}</span>
                <ProviderMenu value={connProvider} onChange={setConnProvider} lang={lang} />
              </div>
            </div>
            <div className="gps-api-row gps-api-row--2col">
              <label className="gps-api-field">
                <span className="gps-api-label">{ui.apiBaseUrl}</span>
                <input
                  className="gps-api-input"
                  type="url"
                  dir="ltr"
                  value={connBaseUrl}
                  onChange={e => setConnBaseUrl(e.target.value)}
                  placeholder={TELEMATICS_PROVIDERS.find(p => p.id === connProvider)?.defaultBaseUrl}
                />
              </label>
              <label className="gps-api-field">
                <span className="gps-api-label">{ui.apiOrgId}</span>
                <input
                  className="gps-api-input"
                  type="text"
                  value={connOrgId}
                  onChange={e => setConnOrgId(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="gps-api-actions">
              <button type="button" className="sensor-btn-outline" onClick={applySuggestedUrl}>
                {ui.apiUseDefault}
              </button>
              <button type="button" className="sensor-btn-primary" onClick={saveMainConnection}>
                {ui.apiSave}
              </button>
            </div>
            <div className="gps-api-status">
              <span className="gps-api-status-label">{ui.apiActive}:</span>{' '}
              {activeP ? (
                <>
                  <span className="gps-api-status-name" style={{ color: activeP.accent }}>
                    {lang === 'ar' ? activeP.nameAr : activeP.nameEn}
                  </span>
                  <span className="gps-api-status-url" dir="ltr">
                    {activeConn?.baseUrl || '—'}
                  </span>
                </>
              ) : (
                <span className="gps-api-status-none">{ui.apiNone}</span>
              )}
            </div>
          </div>
        </section>

        <section className="gps-equipment-panel" aria-labelledby="gps-equipment-heading">
          <h2 id="gps-equipment-heading" className="gps-equipment-heading">
            {ui.equipment}{' '}
            <span className="gps-equipment-count">({rows.length})</span>
          </h2>

          {rows.length === 0 ? (
            <div className="sensor-empty-card gps-equipment-empty">
              <p className="sensor-empty-text">{ui.empty}</p>
              <button type="button" className="sensor-btn-outline" onClick={openModal}>
                <i className="fa-solid fa-plus" aria-hidden />
                {ui.addEquipment}
              </button>
            </div>
          ) : (
            <ul className="sensor-integration-list gps-equipment-list">
              {rows.map(row => {
                const tm = TYPE_META[row.type]
                const label = types[row.type][lang]
                const pDef = row.providerId ? TELEMATICS_PROVIDERS.find(p => p.id === row.providerId) : null
                return (
                  <li key={row.id} className="sensor-integration-card gps-equipment-row">
                    <div className="sensor-integration-card-main">
                      <div className="gps-equipment-name-row">
                        <span className="gps-equipment-type-icon" style={{ color: tm.color }} aria-hidden>
                          <i className={`fa-solid ${tm.icon}`} />
                        </span>
                        <h3 className="sensor-integration-name">{row.name}</h3>
                      </div>
                      <p className="sensor-integration-meta">{label}</p>
                      {pDef ? (
                        <p className="gps-equipment-oem">
                          <span className="gps-equipment-oem-icon" style={{ color: pDef.accent }} aria-hidden>
                            <i className={`fa-solid ${pDef.iconClass}`} />
                          </span>
                          {lang === 'ar' ? pDef.nameAr : pDef.nameEn}
                        </p>
                      ) : null}
                    </div>
                    <div className="sensor-integration-card-aside">
                      <div className="sensor-integration-card-actions">
                        <button type="button" className="sensor-btn-ghost danger" onClick={() => remove(row.id)}>
                          <i className="fa-solid fa-trash-can" aria-hidden /> {ui.remove}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      <Modal
        isOpen={modalOpen}
        title={ui.modalTitle}
        onClose={() => setModalOpen(false)}
        actions={
          <>
            <button type="button" className="ds-btn" onClick={() => setModalOpen(false)}>
              {ui.cancel}
            </button>
            <button type="button" className="ds-btn ds-btn-primary" onClick={submit}>
              {ui.add}
            </button>
          </>
        }
      >
        <div className="gps-form-stack">
          <label className="gps-field-label">
            {ui.name}
            <input
              className="ds-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={ui.name}
              autoComplete="off"
            />
          </label>
          <div className="gps-field-label">
            {ui.type}
            <div className="gps-type-preview">
              <span className="gps-type-preview-icon" style={{ color: meta.color }} aria-hidden>
                <i className={`fa-solid ${meta.icon}`} />
              </span>
              <div className="gps-type-preview-dd">
                <EquipmentTypeMenu
                  value={eqType}
                  onChange={setEqType}
                  options={typeOptions}
                  lang={lang}
                  uiSelectLabel={ui.selectType}
                />
              </div>
            </div>
          </div>
          <div className="gps-field-label">
            {ui.oemProfile}
            <span className="gps-field-hint">{ui.oemHint}</span>
            <div className="gps-modal-oem">
              <select
                className="gps-modal-oem-inherit"
                value={eqProvider}
                onChange={e => setEqProvider(e.target.value as TelematicsProviderId | 'inherit')}
              >
                <option value="inherit">{lang === 'ar' ? 'نفس الاتصال الرئيسي' : 'Same as main connection'}</option>
                {TELEMATICS_PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>
                    {lang === 'ar' ? p.nameAr : p.nameEn}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
