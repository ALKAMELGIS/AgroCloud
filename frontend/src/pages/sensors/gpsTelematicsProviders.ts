/** OEM / telematics platforms commonly used for fleet & GPS integration (UI + local config). */

export type TelematicsProviderId =
  | 'john_deere'
  | 'cnh'
  | 'agco'
  | 'claas'
  | 'trimble'
  | 'raven'
  | 'topcon'
  | 'generic_rest'

export type TelematicsProviderDef = {
  id: TelematicsProviderId
  /** Font Awesome 6 solid icon (no brand pack required for OEMs without official FA brand) */
  iconClass: string
  accent: string
  nameEn: string
  nameAr: string
  /** Suggested API / portal base for user reference (not called automatically). */
  defaultBaseUrl: string
  shortEn: string
  shortAr: string
}

export const TELEMATICS_PROVIDERS: TelematicsProviderDef[] = [
  {
    id: 'john_deere',
    iconClass: 'fa-tractor',
    accent: '#367C2B',
    nameEn: 'John Deere',
    nameAr: 'جون دير',
    defaultBaseUrl: 'https://developer.deere.com',
    shortEn: 'Operations Center / JDLink APIs (OAuth — use your app credentials behind a trusted backend).',
    shortAr: 'مركز العمليات وواجهات JDLink (OAuth عبر خادم موثوق).',
  },
  {
    id: 'cnh',
    iconClass: 'fa-truck-field',
    accent: '#C41230',
    nameEn: 'CNH Industrial',
    nameAr: 'سي إن إتش',
    defaultBaseUrl: 'https://www.cnhindustrial.com',
    shortEn: 'New Holland / Case IH AFS & fleet portals; integrate via licensed partner APIs.',
    shortAr: 'منصات AFS وأساطيل نيو هولاند / كيس عبر واجهات الشريك المرخّص.',
  },
  {
    id: 'agco',
    iconClass: 'fa-warehouse',
    accent: '#E4002B',
    nameEn: 'AGCO (Fuse)',
    nameAr: 'إيه جي سي أو',
    defaultBaseUrl: 'https://www.agcocorp.com',
    shortEn: 'Fuse connected services & partner APIs per region and equipment line.',
    shortAr: 'خدمات Fuse والربط حسب المنطقة وخط المعدات.',
  },
  {
    id: 'claas',
    iconClass: 'fa-wheat-awn',
    accent: '#005A31',
    nameEn: 'Claas',
    nameAr: 'كلاس',
    defaultBaseUrl: 'https://www.claas.com',
    shortEn: 'CLAAS telematics & fleet data through OEM-approved channels.',
    shortAr: 'تليماتكس كلاس عبر القنوات المعتمدة.',
  },
  {
    id: 'trimble',
    iconClass: 'fa-satellite',
    accent: '#0066B3',
    nameEn: 'Trimble Agriculture',
    nameAr: 'تريمبل الزراعية',
    defaultBaseUrl: 'https://agriculture.trimble.com',
    shortEn: 'Trimble Ag hardware & cloud; APIs typically via reseller / SDK agreements.',
    shortAr: 'أجهزة تريمبل والسحابة؛ الواجهات غالباً عبر الموزّع.',
  },
  {
    id: 'raven',
    iconClass: 'fa-satellite-dish',
    accent: '#0072CE',
    nameEn: 'Raven / CNHi precision',
    nameAr: 'راڤن',
    defaultBaseUrl: 'https://www.ravenind.com',
    shortEn: 'Application control & steering telemetry; connect per OEM partnership.',
    shortAr: 'تحكم وتوجيه؛ الربط حسب شراكة المورّد.',
  },
  {
    id: 'topcon',
    iconClass: 'fa-ruler-combined',
    accent: '#E31837',
    nameEn: 'Topcon Agriculture',
    nameAr: 'توبكون',
    defaultBaseUrl: 'https://www.topconpositioning.com',
    shortEn: 'Machine guidance & fleet APIs where contractually available.',
    shortAr: 'توجيه الآلات والأساطيل حسب العقود.',
  },
  {
    id: 'generic_rest',
    iconClass: 'fa-plug',
    accent: '#475569',
    nameEn: 'Custom REST / MQTT',
    nameAr: 'REST / MQTT مخصص',
    defaultBaseUrl: 'https://',
    shortEn: 'Your own gateway, ISOXML bridge, or third-party telematics JSON API.',
    shortAr: 'بوابتك أو جسر ISOXML أو واجهة JSON لطرف ثالث.',
  },
]

export const TELEMATICS_STORAGE_KEY = 'gps_telematics_connection_v1'

export type TelematicsConnectionPersisted = {
  providerId: TelematicsProviderId
  baseUrl: string
  /** Non-secret fleet / org reference (optional). */
  organizationId: string
  updatedAt: string
}

export function readTelematicsConnection(): TelematicsConnectionPersisted | null {
  try {
    const raw = localStorage.getItem(TELEMATICS_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as TelematicsConnectionPersisted & { apiKeyHint?: string }
    if (!p || typeof p !== 'object') return null
    if (!TELEMATICS_PROVIDERS.some(x => x.id === p.providerId)) return null
    if (typeof p.baseUrl !== 'string') return null
    if (typeof p.updatedAt !== 'string') return null
    const organizationId =
      typeof p.organizationId === 'string'
        ? p.organizationId
        : typeof p.apiKeyHint === 'string'
          ? p.apiKeyHint
          : ''
    return {
      providerId: p.providerId,
      baseUrl: p.baseUrl,
      organizationId,
      updatedAt: p.updatedAt,
    }
  } catch {
    return null
  }
}

export function writeTelematicsConnection(next: TelematicsConnectionPersisted) {
  localStorage.setItem(TELEMATICS_STORAGE_KEY, JSON.stringify(next))
}
