import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import './Profile.css'
import {
  normalizeEmail,
  normalizeRole,
  readCurrentUser,
  startSession,
  type CurrentUser,
  type Role,
} from '../../lib/auth'
import { useLanguage } from '../../lib/i18n'
import {
  hydrateProfileFromServer,
  readProfileExtra,
  writeProfileExtra,
  type ProfileExtra,
} from '../../lib/userProfilePersistence'

type ManagementRecord = {
  id: number
  name: string
  email: string
  role: string
  scope?: string
  status: string
  lastLogin: string
  managedById?: number
  emailVerified?: boolean
}

/** Snapshot staged by Apply; committed to storage only on Save when it still matches the form. */
type StagedProfileCommit = {
  personal?: {
    firstName: string
    lastName: string
    phone: string
    dateOfBirth: string
  }
  address?: {
    country: string
    city: string
    postalCode: string
  }
  /** Present only when a cover change is pending (`null` = remove cover). */
  cover?: string | null
}

function stagedProfileFingerprint(s: StagedProfileCommit): string {
  return JSON.stringify(s)
}

/** Downscale cover image for localStorage; keeps banner readable */
async function fileToCoverDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const maxW = 1600
      const maxH = 520
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (!w || !h) {
        resolve(raw)
        return
      }
      const scale = Math.min(maxW / w, maxH / h, 1)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(raw)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    img.onerror = () => resolve(raw)
    img.src = raw
  })
}

function splitDisplayName(full: string): { first: string; last: string } {
  const t = full.trim()
  if (!t) return { first: '', last: '' }
  const parts = t.split(/\s+/)
  if (parts.length === 1) return { first: parts[0]!, last: '' }
  return { first: parts[0]!, last: parts.slice(1).join(' ') }
}

function shouldPersistSession(): boolean {
  try {
    return !sessionStorage.getItem('currentUser')
  } catch {
    return true
  }
}

function toDateInputValue(raw: string | undefined): string {
  if (!raw?.trim()) return ''
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

function formatDobDisplay(iso: string | undefined, locale: string): string {
  if (!iso || !iso.trim()) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'AC'
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? ''
  return `${first}${second}`.toUpperCase()
}

function gradientFromSeed(seed: string): [string, string] {
  const src = seed || 'agro-cloud'
  let hash = 0
  for (let i = 0; i < src.length; i++) hash = (hash * 31 + src.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return [`hsl(${hue} 72% 46%)`, `hsl(${(hue + 48) % 360} 74% 54%)`]
}

const profileCopy = {
  en: {
    myProfile: 'My Profile',
    subtitle: 'Manage your profile and view directory details.',
    personalInformation: 'Personal Information',
    address: 'Address',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    changePhoto: 'Change profile photo',
    changeCoverPhoto: 'Change cover photo',
    removeCoverPhoto: 'Remove cover',
    applyCoverPhoto: 'Apply cover changes',
    apply: 'Apply',
    firstName: 'First Name',
    lastName: 'Last Name',
    emailAddress: 'Email Address',
    phoneNumber: 'Phone Number',
    dateOfBirth: 'Date of Birth',
    userRole: 'User Role',
    country: 'Country',
    city: 'City',
    postalCode: 'Postal Code',
    sessionCard: 'Signed-in session',
    sessionHint: 'Active login snapshot.',
    mgmtCard: 'User Management record',
    mgmtHint: 'Admin directory (local).',
    notInDirectory:
      'No directory entry yet. Your admin can add your account under User Management.',
    userId: 'User ID',
    fullName: 'Full name',
    email: 'Email',
    role: 'Role',
    scope: 'Scope / region',
    status: 'Status',
    lastLogin: 'Last login',
    emailVerified: 'Email verified',
    managedBy: 'Managed by',
    profileSettings: 'Profile Settings',
    avatarManagement: 'Avatar management',
    coverCustomization: 'Cover customization',
    themePersonalization: 'Theme personalization',
    privacyAccount: 'Privacy & account',
    dragDropCover: 'Drag & drop cover image here',
    smartFallback: 'Smart fallback avatar',
    profileTheme: 'Profile theme',
    autoTheme: 'Auto',
    lightTheme: 'Light',
    darkTheme: 'Dark',
    accountPrivate: 'Private profile mode',
    hideEmail: 'Hide email in profile',
    hidePhone: 'Hide phone in profile',
    activityStatus: 'Show activity status',
    yes: 'Yes',
    no: 'No',
    none: '—',
    openUserManagement: 'User Management',
    settingsWorkflow: 'Workflow data sources',
    roleLine: 'Role',
    locationLine: 'Location',
    roles: {
      Admin: 'Admin',
      Manager: 'Manager',
      'Admin Manager': 'Admin Manager',
      Editor: 'Editor',
      Viewer: 'Viewer',
    } as Record<string, string>,
  },
  ar: {
    myProfile: 'ملفي الشخصي',
    subtitle: 'إدارة ملفك وعرض تفاصيل الدليل.',
    personalInformation: 'المعلومات الشخصية',
    address: 'العنوان',
    edit: 'تعديل',
    save: 'حفظ',
    cancel: 'إلغاء',
    changePhoto: 'تغيير صورة الملف',
    changeCoverPhoto: 'تغيير صورة الغلاف',
    removeCoverPhoto: 'إزالة الغلاف',
    applyCoverPhoto: 'تطبيق تغييرات الغلاف',
    apply: 'تطبيق',
    firstName: 'الاسم الأول',
    lastName: 'اسم العائلة',
    emailAddress: 'البريد الإلكتروني',
    phoneNumber: 'رقم الهاتف',
    dateOfBirth: 'تاريخ الميلاد',
    userRole: 'دور المستخدم',
    country: 'الدولة',
    city: 'المدينة',
    postalCode: 'الرمز البريدي',
    sessionCard: 'جلسة الدخول',
    sessionHint: 'لقطة من الجلسة النشطة.',
    mgmtCard: 'سجل إدارة المستخدمين',
    mgmtHint: 'دليل المسؤول (محلي).',
    notInDirectory: 'لا يوجد سجل بعد. يمكن للمسؤول إضافة حسابك من إدارة المستخدمين.',
    userId: 'معرف المستخدم',
    fullName: 'الاسم الكامل',
    email: 'البريد',
    role: 'الدور',
    scope: 'النطاق',
    status: 'الحالة',
    lastLogin: 'آخر دخول',
    emailVerified: 'البريد مُفعَّل',
    managedBy: 'يُدار بواسطة',
    profileSettings: 'إعدادات الملف الشخصي',
    avatarManagement: 'إدارة الصورة الشخصية',
    coverCustomization: 'تخصيص الغلاف',
    themePersonalization: 'تخصيص المظهر',
    privacyAccount: 'الخصوصية والحساب',
    dragDropCover: 'اسحب وأفلت صورة الغلاف هنا',
    smartFallback: 'صورة افتراضية ذكية',
    profileTheme: 'نسق الملف الشخصي',
    autoTheme: 'تلقائي',
    lightTheme: 'فاتح',
    darkTheme: 'داكن',
    accountPrivate: 'وضع الملف الخاص',
    hideEmail: 'إخفاء البريد في الملف',
    hidePhone: 'إخفاء الهاتف في الملف',
    activityStatus: 'إظهار حالة النشاط',
    yes: 'نعم',
    no: 'لا',
    none: '—',
    openUserManagement: 'إدارة المستخدمين',
    settingsWorkflow: 'مصادر بيانات سير العمل',
    roleLine: 'الدور',
    locationLine: 'الموقع',
    roles: {
      Admin: 'مدير النظام',
      Manager: 'مدير',
      'Admin Manager': 'مدير إداري',
      Editor: 'محرر',
      Viewer: 'مشاهد',
    } as Record<string, string>,
  },
} as const

function parseManagementUsers(): ManagementRecord[] {
  try {
    const raw = localStorage.getItem('adminUsers')
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: ManagementRecord[] = []
    for (const rawRow of parsed) {
      if (!rawRow || typeof rawRow !== 'object') continue
      const r = rawRow as Record<string, unknown>
      const email = String(r.email || '').trim()
      if (!email) continue
      const id = typeof r.id === 'number' ? r.id : Number(r.id || 0)
      out.push({
        id: Number.isFinite(id) && id > 0 ? id : Date.now(),
        name: String(r.name || email),
        email,
        role: normalizeRole(r.role),
        scope: r.scope ? String(r.scope).trim() || undefined : undefined,
        status: String(r.status || 'Active'),
        lastLogin: String(r.lastLogin || 'Never'),
        managedById: typeof r.managedById === 'number' ? r.managedById : undefined,
        emailVerified: typeof r.emailVerified === 'boolean' ? r.emailVerified : undefined,
      })
    }
    return out
  } catch {
    return []
  }
}

function resolveManagerName(users: ManagementRecord[], managedById?: number): string | null {
  if (typeof managedById !== 'number') return null
  const m = users.find(u => u.id === managedById)
  return m ? m.name : null
}

function roleLabel(role: string, lang: 'en' | 'ar'): string {
  const map = profileCopy[lang].roles as Record<string, string>
  return map[role] ?? role
}

export default function Profile() {
  const { language } = useLanguage()
  const text = profileCopy[language]
  const dir = language === 'ar' ? 'rtl' : 'ltr'
  const locale = language === 'ar' ? 'ar-AE' : 'en-GB'

  const [me, setMe] = useState<CurrentUser | null>(() => readCurrentUser())
  const [extra, setExtra] = useState<ProfileExtra>({})
  const [avatarTick, setAvatarTick] = useState(0)
  const [coverDraft, setCoverDraft] = useState<string | null | undefined>(undefined)
  const [avatarDropActive, setAvatarDropActive] = useState(false)
  const [coverDropActive, setCoverDropActive] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const coverFileRef = useRef<HTMLInputElement | null>(null)

  const [editingPersonal, setEditingPersonal] = useState(false)
  const [editingAddress, setEditingAddress] = useState(false)
  const [draftP, setDraftP] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    dateOfBirth: '',
  })
  const [draftA, setDraftA] = useState({
    country: '',
    city: '',
    postalCode: '',
  })
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const saveResetRef = useRef<number | null>(null)
  const [stagedGate, setStagedGate] = useState<StagedProfileCommit | null>(null)
  const profileHydratedEmailRef = useRef<string | null>(null)
  /** Bumps when another tab updates `adminUsers` so directory-backed fields re-render. */
  const [directoryRev, setDirectoryRev] = useState(0)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      setMe(readCurrentUser())
      if (e.key == null || e.key === 'adminUsers' || e.key === 'currentUser') {
        setDirectoryRev(v => v + 1)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!me?.email) {
      profileHydratedEmailRef.current = null
      setExtra({})
      setCoverDraft(undefined)
      setStagedGate(null)
      return undefined
    }
    const email = me.email
    const emailChanged = profileHydratedEmailRef.current !== email
    profileHydratedEmailRef.current = email

    let cancelled = false
    const refreshLocal = () => {
      if (!cancelled) {
        setExtra(readProfileExtra(email))
        setCoverDraft(undefined)
        setStagedGate(null)
      }
    }

    if (emailChanged) {
      void (async () => {
        await hydrateProfileFromServer(email)
        refreshLocal()
      })()
    } else {
      refreshLocal()
    }

    return () => {
      cancelled = true
    }
  }, [me?.email, avatarTick])

  const records = useMemo(() => parseManagementUsers(), [directoryRev])

  const mgmt =
    me?.email != null
      ? records.find(u => normalizeEmail(u.email) === normalizeEmail(me.email)) ?? null
      : null

  /** Canonical role from User Management when listed in admin directory; else session role. */
  const displayRole: Role = mgmt != null ? normalizeRole(mgmt.role) : normalizeRole(me?.role)
  const managerLabel = mgmt?.managedById != null ? resolveManagerName(records, mgmt.managedById) : null

  const split = me ? splitDisplayName(me.name) : { first: '', last: '' }
  const firstName = extra.firstName?.trim() || split.first
  const lastName = extra.lastName?.trim() || split.last
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || me?.name || ''
  const heroDisplayName = (mgmt?.name?.trim() || displayName).trim() || me?.name || ''

  const locationLine =
    mgmt?.scope?.trim() ||
    [extra.city?.trim(), extra.country?.trim()].filter(Boolean).join(', ') ||
    me?.scope?.trim() ||
    text.none

  useEffect(() => {
    if (!me?.email || !mgmt) return
    const nextRole = normalizeRole(mgmt.role)
    const nextScope = mgmt.scope?.trim() || undefined
    if (normalizeRole(me.role) === nextRole && (me.scope?.trim() || '') === (nextScope || '')) return
    startSession({ ...me, role: nextRole, scope: nextScope }, { persist: shouldPersistSession() })
    setMe(readCurrentUser())
  }, [me?.email, me?.role, me?.scope, mgmt?.role, mgmt?.scope])

  const avatarSrc = useMemo(() => {
    if (!me?.email) return ''
    const bundle = readProfileExtra(me.email)
    if (bundle.avatarDataUrl?.trim()) return bundle.avatarDataUrl
    return ''
  }, [me?.email, avatarTick])
  const avatarInitials = useMemo(() => initialsFromName(heroDisplayName || me?.name || ''), [heroDisplayName, me?.name])
  const avatarGradient = useMemo(
    () => gradientFromSeed(`${me?.email || ''}:${heroDisplayName || me?.name || ''}`),
    [me?.email, me?.name, heroDisplayName],
  )

  useEffect(() => {
    document.title = `${text.myProfile} · Agro Cloud`
  }, [text.myProfile])

  const openPersonalEdit = () => {
    if (!me) return
    const ex = readProfileExtra(me.email)
    const sp = splitDisplayName(me.name)
    setDraftP({
      firstName: ex.firstName?.trim() || sp.first,
      lastName: ex.lastName?.trim() || sp.last,
      phone: ex.phone?.trim() || '',
      dateOfBirth: toDateInputValue(ex.dateOfBirth),
    })
    setEditingPersonal(true)
  }

  const savePersonal = () => {
    if (!me?.email) return
    writeProfileExtra(me.email, {
      firstName: draftP.firstName.trim(),
      lastName: draftP.lastName.trim(),
      phone: draftP.phone.trim() || undefined,
      dateOfBirth: draftP.dateOfBirth.trim() || undefined,
    })
    const combined = [draftP.firstName.trim(), draftP.lastName.trim()].filter(Boolean).join(' ').trim()
    if (combined && combined !== me.name.trim()) {
      startSession({ ...me, name: combined }, { persist: shouldPersistSession() })
      setMe(readCurrentUser())
    }
    setExtra(readProfileExtra(me.email))
    setEditingPersonal(false)
    setStagedGate(null)
  }

  const openAddressEdit = () => {
    if (!me) return
    const ex = readProfileExtra(me.email)
    setDraftA({
      country: ex.country?.trim() || '',
      city: ex.city?.trim() || '',
      postalCode: ex.postalCode?.trim() || '',
    })
    setEditingAddress(true)
  }

  const saveAddress = () => {
    if (!me?.email) return
    writeProfileExtra(me.email, {
      country: draftA.country.trim() || undefined,
      city: draftA.city.trim() || undefined,
      postalCode: draftA.postalCode.trim() || undefined,
    })
    setExtra(readProfileExtra(me.email))
    setEditingAddress(false)
    setStagedGate(null)
  }

  const applyAvatarFile = (file: File) => {
    if (!me?.email) return
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      if (url.startsWith('data:')) {
        writeProfileExtra(me.email, { avatarDataUrl: url })
        setAvatarTick(x => x + 1)
      }
    }
    reader.readAsDataURL(file)
  }

  const onAvatarFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    applyAvatarFile(file)
    e.target.value = ''
  }

  const applyCoverFile = async (file: File) => {
    if (!me?.email) return
    if (!file.type.startsWith('image/')) {
      return
    }
    try {
      const dataUrl = await fileToCoverDataUrl(file)
      setCoverDraft(dataUrl)
    } catch {
      /* ignore */
    }
  }

  const onCoverFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await applyCoverFile(file)
    e.target.value = ''
  }

  const removeCoverPhoto = () => {
    setCoverDraft(null)
  }

  const onAvatarDrop = (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    applyAvatarFile(f)
  }

  const onCoverDrop = (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    void applyCoverFile(f)
  }

  const updateProfileFlags = (patch: Partial<ProfileExtra>) => {
    if (!me?.email) return
    writeProfileExtra(me.email, patch)
    setExtra(readProfileExtra(me.email))
  }

  const stageablePayload = useMemo((): StagedProfileCommit | null => {
    if (!me?.email) return null
    const out: StagedProfileCommit = {}
    if (editingPersonal) {
      out.personal = {
        firstName: draftP.firstName,
        lastName: draftP.lastName,
        phone: draftP.phone,
        dateOfBirth: draftP.dateOfBirth,
      }
    }
    if (editingAddress) {
      out.address = {
        country: draftA.country,
        city: draftA.city,
        postalCode: draftA.postalCode,
      }
    }
    if (coverDraft !== undefined) {
      out.cover = coverDraft
    }
    return Object.keys(out).length > 0 ? out : null
  }, [me?.email, editingPersonal, editingAddress, draftP, draftA, coverDraft])

  const canApplyChanges = stageablePayload !== null
  const canConfirmSave =
    stagedGate !== null &&
    stageablePayload !== null &&
    stagedProfileFingerprint(stagedGate) === stagedProfileFingerprint(stageablePayload)

  const stagePendingChanges = () => {
    if (!stageablePayload) return
    try {
      setStagedGate(structuredClone(stageablePayload))
    } catch {
      setStagedGate(JSON.parse(JSON.stringify(stageablePayload)) as StagedProfileCommit)
    }
  }

  const confirmSaveStaged = () => {
    if (!me?.email || !stagedGate || !stageablePayload) return
    if (stagedProfileFingerprint(stagedGate) !== stagedProfileFingerprint(stageablePayload)) return

    const staged = stagedGate
    const patch: Partial<ProfileExtra> = {}
    if (staged.personal) {
      patch.firstName = staged.personal.firstName.trim()
      patch.lastName = staged.personal.lastName.trim()
      patch.phone = staged.personal.phone.trim() || undefined
      patch.dateOfBirth = staged.personal.dateOfBirth.trim() || undefined
    }
    if (staged.address) {
      patch.country = staged.address.country.trim() || undefined
      patch.city = staged.address.city.trim() || undefined
      patch.postalCode = staged.address.postalCode.trim() || undefined
    }
    if (Object.prototype.hasOwnProperty.call(staged, 'cover')) {
      patch.coverDataUrl = staged.cover === null ? undefined : staged.cover?.trim() || undefined
    }
    if (Object.keys(patch).length > 0) {
      writeProfileExtra(me.email, patch)
    }
    if (staged.personal) {
      const combined = [staged.personal.firstName.trim(), staged.personal.lastName.trim()].filter(Boolean).join(' ').trim()
      if (combined && combined !== me.name.trim()) {
        startSession({ ...me, name: combined }, { persist: shouldPersistSession() })
      }
      setEditingPersonal(false)
    }
    if (staged.address) {
      setEditingAddress(false)
    }
    if (Object.prototype.hasOwnProperty.call(staged, 'cover')) {
      setCoverDraft(undefined)
    }
    setMe(readCurrentUser())
    setExtra(readProfileExtra(me.email))
    setStagedGate(null)
    setSaveState('saved')
    if (saveResetRef.current) window.clearTimeout(saveResetRef.current)
    saveResetRef.current = window.setTimeout(() => setSaveState('idle'), 1600)
  }

  useEffect(() => {
    return () => {
      if (saveResetRef.current) window.clearTimeout(saveResetRef.current)
    }
  }, [])

  const coverSrc = (coverDraft === undefined ? extra.coverDataUrl : coverDraft)?.trim?.() || ''
  const hasPendingCoverChange = coverDraft !== undefined

  return (
    <div className={`profile-page-v2 profile-page-v2--theme-${extra.profileTheme || 'auto'}`} dir={dir}>
      <div className="profile-page-v2-inner">
        <header className="profile-page-header">
          <div className="profile-page-header-top">
          </div>
        </header>

        {!me ? (
          <div className="profile-card">
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
              {language === 'ar' ? 'يرجى تسجيل الدخول لعرض الملف الشخصي.' : 'Please sign in to view your profile.'}
            </p>
          </div>
        ) : (
          <>
            {/* Summary — optional LinkedIn-style cover behind hero */}
            <section
              className={`profile-card profile-card--hero profile-hero-row${coverSrc ? ' profile-card--hero-cover' : ''}${coverDropActive ? ' profile-card--cover-drop-active' : ''}`}
              style={
                coverSrc
                  ? {
                      backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.25) 0%, rgba(15, 23, 42, 0.72) 100%), url(${coverSrc})`,
                    }
                  : undefined
              }
              onDragOver={e => {
                e.preventDefault()
                setCoverDropActive(true)
              }}
              onDragLeave={() => setCoverDropActive(false)}
              onDrop={e => {
                e.preventDefault()
                setCoverDropActive(false)
                onCoverDrop(e.dataTransfer.files)
              }}
            >
              <div className="profile-hero-cover-toolbar">
                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onCoverFile}
                  tabIndex={-1}
                  aria-hidden
                />
                <button
                  type="button"
                  className="profile-hero-cover-btn profile-hero-cover-btn--icon"
                  onClick={() => coverFileRef.current?.click()}
                  aria-label={text.changeCoverPhoto}
                  title={text.changeCoverPhoto}
                >
                  <i className="fa-solid fa-image" aria-hidden />
                </button>
                {coverSrc ? (
                  <button type="button" className="profile-hero-cover-btn profile-hero-cover-btn--ghost profile-hero-cover-btn--icon" onClick={removeCoverPhoto} aria-label={text.removeCoverPhoto} title={text.removeCoverPhoto}>
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                ) : null}
                {hasPendingCoverChange ? (
                  <button
                    type="button"
                    className="profile-hero-cover-btn profile-hero-cover-btn--apply profile-hero-cover-btn--icon"
                    onClick={stagePendingChanges}
                    aria-label={text.applyCoverPhoto}
                    title={text.applyCoverPhoto}
                  >
                    <i className="fa-solid fa-check" aria-hidden />
                  </button>
                ) : null}
              </div>
              <div className="profile-hero-cover-body">
              {coverDropActive ? <div className="profile-cover-drop-hint">{text.dragDropCover}</div> : null}
              <div
                className={`profile-avatar-wrap${avatarDropActive ? ' profile-avatar-wrap--drop-active' : ''}`}
                onDragOver={e => {
                  e.preventDefault()
                  setAvatarDropActive(true)
                }}
                onDragLeave={() => setAvatarDropActive(false)}
                onDrop={e => {
                  e.preventDefault()
                  setAvatarDropActive(false)
                  onAvatarDrop(e.dataTransfer.files)
                }}
                title={text.changePhoto}
              >
                <div className="profile-avatar-ring" aria-hidden>
                  {avatarSrc ? (
                    <img className="profile-avatar-img" src={avatarSrc} alt="" width={152} height={152} decoding="async" />
                  ) : (
                    <div
                      className="profile-avatar-empty"
                      style={{ background: `linear-gradient(145deg, ${avatarGradient[0]}, ${avatarGradient[1]})` }}
                    >
                      <span className="profile-avatar-empty__initials">{avatarInitials}</span>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onAvatarFile} aria-hidden />
                <button type="button" className="profile-avatar-camera" onClick={() => fileRef.current?.click()} aria-label={text.changePhoto}>
                  <i className="fa-solid fa-camera" aria-hidden />
                </button>
              </div>
              <div className="profile-hero-text">
                <h2 className="profile-hero-name">{heroDisplayName}</h2>
                <p className="profile-hero-meta">
                  <span className="profile-hero-label">{text.roleLine}</span>
                  <span className="profile-hero-value">{roleLabel(displayRole, language)}</span>
                </p>
                <p className="profile-hero-meta">
                  <span className="profile-hero-label">{text.locationLine}</span>
                  <span className="profile-hero-value profile-hero-value--muted">{locationLine}</span>
                </p>
              </div>
              </div>
            </section>

            {/* Personal Information */}
            <section className="profile-card profile-card--panel">
              <div className="profile-card-head">
                <h3 className="profile-card-title">{text.personalInformation}</h3>
                {!editingPersonal ? (
                  <button type="button" className="profile-btn-edit-primary" onClick={openPersonalEdit}>
                    <i className="fa-solid fa-pencil" aria-hidden />
                    {text.edit}
                  </button>
                ) : null}
              </div>

              {!editingPersonal ? (
                <div className="profile-field-grid">
                  <FieldCell label={text.firstName} value={firstName || text.none} />
                  <FieldCell label={text.lastName} value={lastName || text.none} />
                  <FieldCell label={text.dateOfBirth} value={formatDobDisplay(extra.dateOfBirth, locale) || text.none} />
                  <FieldCell label={text.emailAddress} value={extra.hideEmailOnProfile ? '••••••' : me.email} />
                  <FieldCell label={text.phoneNumber} value={extra.hidePhoneOnProfile ? '••••••' : extra.phone?.trim() || text.none} />
                  <FieldCell label={text.userRole} value={roleLabel(displayRole, language)} muted />
                </div>
              ) : (
                <>
                  <div className="profile-field-grid">
                    <div>
                      <div className="profile-field-label">{text.firstName}</div>
                      <input
                        className="profile-input"
                        value={draftP.firstName}
                        onChange={e => setDraftP(d => ({ ...d, firstName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.lastName}</div>
                      <input
                        className="profile-input"
                        value={draftP.lastName}
                        onChange={e => setDraftP(d => ({ ...d, lastName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.dateOfBirth}</div>
                      <input
                        className="profile-input"
                        type="date"
                        value={toDateInputValue(draftP.dateOfBirth)}
                        onChange={e => setDraftP(d => ({ ...d, dateOfBirth: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.emailAddress}</div>
                      <input className="profile-input" value={me.email} disabled />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.phoneNumber}</div>
                      <input
                        className="profile-input"
                        value={draftP.phone}
                        onChange={e => setDraftP(d => ({ ...d, phone: e.target.value }))}
                        placeholder="+971 …"
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.userRole}</div>
                      <input className="profile-input" value={roleLabel(displayRole, language)} disabled />
                    </div>
                  </div>
                  <div className="profile-edit-actions">
                    <button type="button" className="profile-btn-save" onClick={savePersonal}>
                      {text.save}
                    </button>
                    <button
                      type="button"
                      className="profile-btn-cancel"
                      onClick={() => {
                        setEditingPersonal(false)
                        setStagedGate(null)
                      }}
                    >
                      {text.cancel}
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Address */}
            <section className="profile-card profile-card--panel">
              <div className="profile-card-head">
                <h3 className="profile-card-title">{text.address}</h3>
                {!editingAddress ? (
                  <button type="button" className="profile-btn-edit-secondary" onClick={openAddressEdit}>
                    <i className="fa-solid fa-pencil" aria-hidden />
                    {text.edit}
                  </button>
                ) : null}
              </div>

              {!editingAddress ? (
                <div className="profile-field-grid">
                  <FieldCell label={text.country} value={extra.country?.trim() || text.none} />
                  <FieldCell label={text.city} value={extra.city?.trim() || text.none} />
                  <FieldCell label={text.postalCode} value={extra.postalCode?.trim() || text.none} />
                </div>
              ) : (
                <>
                  <div className="profile-field-grid">
                    <div>
                      <div className="profile-field-label">{text.country}</div>
                      <input
                        className="profile-input"
                        value={draftA.country}
                        onChange={e => setDraftA(d => ({ ...d, country: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.city}</div>
                      <input className="profile-input" value={draftA.city} onChange={e => setDraftA(d => ({ ...d, city: e.target.value }))} />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.postalCode}</div>
                      <input
                        className="profile-input"
                        value={draftA.postalCode}
                        onChange={e => setDraftA(d => ({ ...d, postalCode: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="profile-edit-actions">
                    <button type="button" className="profile-btn-save" onClick={saveAddress}>
                      {text.save}
                    </button>
                    <button
                      type="button"
                      className="profile-btn-cancel"
                      onClick={() => {
                        setEditingAddress(false)
                        setStagedGate(null)
                      }}
                    >
                      {text.cancel}
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* User Management */}
            <div className="profile-mgmt-grid">
              <section className="profile-card profile-card--mgmt">
                <div className="profile-card-head profile-card-head--stack">
                  <div>
                    <h3 className="profile-card-title">{text.sessionCard}</h3>
                    <p className="profile-card-hint">{text.sessionHint}</p>
                  </div>
                </div>
                <ProfileRows
                  rows={
                    mgmt
                      ? [
                          [text.userId, String(mgmt.id)],
                          [text.fullName, mgmt.name],
                          [text.email, extra.hideEmailOnProfile ? '••••••' : mgmt.email],
                          [text.role, roleLabel(displayRole, language)],
                          [text.scope, mgmt.scope?.trim() ? mgmt.scope : text.none],
                        ]
                      : [
                          [text.userId, String(me.id)],
                          [text.fullName, me.name],
                          [text.email, extra.hideEmailOnProfile ? '••••••' : me.email],
                          [text.role, roleLabel(displayRole, language)],
                          [text.scope, me.scope?.trim() ? me.scope : text.none],
                        ]
                  }
                  dir={dir}
                />
              </section>

              <section className="profile-card profile-card--mgmt">
                <div className="profile-card-head profile-card-head--stack">
                  <div>
                    <h3 className="profile-card-title">{text.mgmtCard}</h3>
                    <p className="profile-card-hint">{text.mgmtHint}</p>
                  </div>
                </div>
                {!mgmt ? (
                  <p className="profile-empty-hint">{text.notInDirectory}</p>
                ) : (
                  <ProfileRows
                    rows={[
                      [text.userId, String(mgmt.id)],
                      [text.fullName, mgmt.name],
                      [text.email, extra.hideEmailOnProfile ? '••••••' : mgmt.email],
                      [text.role, roleLabel(displayRole, language)],
                      [text.scope, mgmt.scope?.trim() ? mgmt.scope : text.none],
                      [text.status, extra.allowActivityStatus === false ? text.none : <StatusPill key="st" status={mgmt.status} />],
                      [text.lastLogin, mgmt.lastLogin],
                      [
                        text.emailVerified,
                        mgmt.emailVerified === true ? text.yes : mgmt.emailVerified === false ? text.no : text.none,
                      ],
                      [text.managedBy, managerLabel ?? text.none],
                    ]}
                    dir={dir}
                  />
                )}
              </section>
            </div>

            <section className="profile-card profile-card--panel">
              <div className="profile-card-head">
                <h3 className="profile-card-title">{text.profileSettings}</h3>
              </div>
              <div className="profile-mgmt-grid">
                <div className="profile-field-cell">
                  <div className="profile-field-label">{text.avatarManagement}</div>
                  <div className="profile-settings-actions">
                    <button type="button" className="profile-btn-edit-primary" onClick={() => fileRef.current?.click()}>
                      <i className="fa-solid fa-camera" aria-hidden /> {text.changePhoto}
                    </button>
                    {!avatarSrc ? <small>{text.smartFallback}</small> : null}
                  </div>
                </div>
                <div className="profile-field-cell">
                  <div className="profile-field-label">{text.coverCustomization}</div>
                  <div className="profile-settings-actions">
                    <button type="button" className="profile-btn-edit-secondary" onClick={() => coverFileRef.current?.click()}>
                      <i className="fa-solid fa-image" aria-hidden /> {text.changeCoverPhoto}
                    </button>
                    {coverSrc ? (
                      <button type="button" className="profile-btn-cancel" onClick={removeCoverPhoto}>
                        {text.removeCoverPhoto}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="profile-field-cell">
                  <div className="profile-field-label">{text.themePersonalization}</div>
                  <div className="profile-theme-toggle">
                    {([
                      ['auto', text.autoTheme],
                      ['light', text.lightTheme],
                      ['dark', text.darkTheme],
                    ] as const).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        className={`profile-theme-chip${(extra.profileTheme || 'auto') === v ? ' is-active' : ''}`}
                        onClick={() => updateProfileFlags({ profileTheme: v })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="profile-field-cell">
                  <div className="profile-field-label">{text.privacyAccount}</div>
                  <div className="profile-privacy-list">
                    <label><input type="checkbox" checked={extra.profileIsPrivate === true} onChange={e => updateProfileFlags({ profileIsPrivate: e.target.checked })} /> {text.accountPrivate}</label>
                    <label><input type="checkbox" checked={extra.hideEmailOnProfile === true} onChange={e => updateProfileFlags({ hideEmailOnProfile: e.target.checked })} /> {text.hideEmail}</label>
                    <label><input type="checkbox" checked={extra.hidePhoneOnProfile === true} onChange={e => updateProfileFlags({ hidePhoneOnProfile: e.target.checked })} /> {text.hidePhone}</label>
                    <label><input type="checkbox" checked={extra.allowActivityStatus !== false} onChange={e => updateProfileFlags({ allowActivityStatus: e.target.checked })} /> {text.activityStatus}</label>
                  </div>
                </div>
              </div>
            </section>

            <div
              className="profile-page-bottom-actions"
              role="group"
              aria-label={language === 'ar' ? 'طبّق ثم احفظ للتأكيد' : 'Apply then Save to confirm'}
            >
              <button
                type="button"
                className="profile-page-action-btn profile-page-action-btn--secondary"
                onClick={stagePendingChanges}
                disabled={!canApplyChanges}
              >
                <i className="fa-solid fa-check" aria-hidden />
                {text.apply}
              </button>
              <button
                type="button"
                className="profile-page-action-btn profile-page-action-btn--primary"
                onClick={confirmSaveStaged}
                disabled={!canConfirmSave}
              >
                <i className={`fa-solid ${saveState === 'saved' ? 'fa-circle-check' : 'fa-floppy-disk'}`} aria-hidden />
                {saveState === 'saved' ? (language === 'ar' ? 'تم الحفظ' : 'Saved') : text.save}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FieldCell({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="profile-field-cell">
      <div className="profile-field-label">{label}</div>
      <div className={muted ? 'profile-field-value profile-field-value-muted' : 'profile-field-value'}>{value}</div>
    </div>
  )
}

function ProfileRows({
  rows,
  dir,
}: {
  rows: [string, ReactNode][]
  dir: 'ltr' | 'rtl'
}) {
  return (
    <dl className="profile-rows-dl" style={{ direction: dir }}>
      {rows.map(([label, value]) => (
        <div key={String(label)}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function StatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase()
  let variant: 'neutral' | 'active' | 'danger' | 'info' = 'neutral'
  if (lower === 'active') variant = 'active'
  else if (lower === 'inactive' || lower === 'suspended' || lower === 'deleted') variant = 'danger'
  else if (lower === 'invited') variant = 'info'

  return (
    <span className={`profile-pill profile-pill--${variant}`}>{status}</span>
  )
}
