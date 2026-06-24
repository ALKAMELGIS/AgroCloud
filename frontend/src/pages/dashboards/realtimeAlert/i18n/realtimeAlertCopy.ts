import type { Language } from '../../../lib/i18n'

type Copy = {
  title: string
  sidebarHelp: string
  refresh: string
  settings: string
  emptyKpi: string
  emptyAlerts: string
  emptyChart: string
  syncWms: string
  syncing: string
  topIssues: string
  recommendations: string
  traceability: string
  reports: string
  diagnosis: string
  controlCenter: string
  farm: string
  crop: string
  location: string
  sowingDate: string
  analysisDate: string
}

const EN: Copy = {
  title: 'Realtime Alert Dashboard',
  sidebarHelp: 'Monitor crop health, alerts, and traceability in real time.',
  refresh: 'Refresh',
  settings: 'Settings',
  emptyKpi: 'No data — bind GIS layers in Control Center',
  emptyAlerts: 'No alerts for selected date',
  emptyChart: 'No time series — select AOI with Sentinel coverage',
  syncWms: 'Sync WMS',
  syncing: 'Syncing…',
  topIssues: 'Top Issues Today',
  recommendations: 'Recommendations',
  traceability: 'Traceability',
  reports: 'Reports',
  diagnosis: 'AI Crop Diagnosis',
  controlCenter: 'Control Center',
  farm: 'Farm',
  crop: 'Crop',
  location: 'Location',
  sowingDate: 'Sowing date',
  analysisDate: 'Analysis date',
}

const AR: Copy = {
  title: 'لوحة التنبيهات الفورية',
  sidebarHelp: 'راقب صحة المحصول والتنبيهات والتتبع في الوقت الفعلي.',
  refresh: 'تحديث',
  settings: 'الإعدادات',
  emptyKpi: 'لا توجد بيانات — اربط طبقات GIS من مركز التحكم',
  emptyAlerts: 'لا توجد تنبيهات للتاريخ المحدد',
  emptyChart: 'لا توجد سلسلة زمنية — اختر AOI بتغطية Sentinel',
  syncWms: 'مزامنة WMS',
  syncing: 'جاري المزامنة…',
  topIssues: 'أهم المشكلات اليوم',
  recommendations: 'التوصيات',
  traceability: 'التتبع',
  reports: 'التقارير',
  diagnosis: 'تشخيص المحصول بالذكاء الاصطناعي',
  controlCenter: 'مركز التحكم',
  farm: 'المزرعة',
  crop: 'المحصول',
  location: 'الموقع',
  sowingDate: 'تاريخ الزراعة',
  analysisDate: 'تاريخ التحليل',
}

export function realtimeAlertCopy(lang: Language): Copy {
  return lang === 'ar' ? AR : EN
}
