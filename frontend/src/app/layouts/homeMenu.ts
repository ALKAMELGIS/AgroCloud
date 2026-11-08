/**
 * The app's main destinations: shown as cards on the home page and as the app-wide sidebar
 * (AppShellNav). Edit here to add, rename or reorder a destination everywhere.
 */
import { GPS_VEHICLE_TRACKING_SIGNIN_URL } from '@/core/routing/defaultPageLinks'
import type { HomeMenuItem } from './HomeNavigation'

export const menuItems: HomeMenuItem[] = [
  // Main apps open directly from the home page (they used to sit inside "Dashboard" and
  // "Satellite Imagery" groups, one extra click away).
  {
    id: 'develop-dashboard',
    label: { en: 'Develop Dashboard', ar: 'تطوير لوحة التحكم' },
    icon: 'fa-solid fa-grip',
    color: '#F97316',
    to: '/dashboard/develop',
  },
  {
    id: 'agro-cloud-dashboard',
    label: { en: 'Agro Cloud Dashboard', ar: 'لوحة Agro Cloud' },
    icon: 'fa-solid fa-chart-pie',
    color: '#F97316',
    to: '/dashboards/agro-cloud',
  },
  {
    id: 'satellite-intelligence',
    label: { en: 'Satellite Intelligence', ar: 'التحليل الفضائي الذكي' },
    icon: 'fa-solid fa-layer-group',
    color: '#8B5CF6', // Violet
    to: '/satellite/indices',
  },
  {
    id: 'application',
    label: { en: 'Application', ar: 'التطبيقات' },
    icon: 'fa-solid fa-cubes',
    color: '#0EA5E9',
    items: [
      {
        label: { en: 'AgroCloud Management', ar: 'إدارة AgroCloud' },
        icon: 'fa-solid fa-building-user',
        to: '/applications/agrocloud-management',
      },
      {
        label: { en: 'AgroCloud Platform', ar: 'منصة AgroCloud' },
        icon: 'fa-solid fa-seedling',
        to: '/dashboards/agro-cloud-platform',
      },
    ],
  },
  {
    id: 'data',
    label: { en: 'Operations', ar: 'العمليات' },
    icon: 'fa-solid fa-screwdriver-wrench',
    color: '#F59E0B', // Amber
    items: [
      { label: { en: 'Operations forms', ar: 'استمارات العمليات' }, icon: 'fa-solid fa-table-list', to: '/ops' },
      { label: { en: 'Harvest record', ar: 'سجل الحصاد' }, icon: 'fa-solid fa-tractor', to: '/ops/harvest' },
      { label: { en: 'EC / pH record', ar: 'سجل الملوحة والحموضة' }, icon: 'fa-solid fa-droplet', to: '/ops/ec_ph' },
      { label: { en: 'Plant protection (PPP)', ar: 'تطبيق المبيدات' }, icon: 'fa-solid fa-spray-can-sparkles', to: '/ops/ppp' },
      { label: { en: 'Irrigation & fertigation', ar: 'الري والتسميد' }, icon: 'fa-solid fa-water', to: '/ops/irrigation' },
      { label: { en: 'Fertigation worksheet', ar: 'ورقة عمل التسميد' }, icon: 'fa-solid fa-flask', to: '/ops/fertigation' },
      { label: { en: 'Fertilizer issue', ar: 'صرف الأسمدة' }, icon: 'fa-solid fa-boxes-stacked', to: '/ops/fertilizer_issue' },
      { label: { en: 'Forms settings', ar: 'إعدادات الاستمارات' }, icon: 'fa-solid fa-gear', to: '/ops/settings' },
      {
        label: { en: 'QHIS', ar: 'الجودة والسلامة' },
        icon: 'fa-solid fa-shield-halved',
        to: '/data/qhis',
      },
    ],
  },
  {
    id: 'sensors',
    label: { en: 'Sensors', ar: 'الحساسات' },
    icon: 'fa-solid fa-microchip',
    color: '#0EA5E9', // Sky
    items: [
      { label: { en: 'Soil Sensors', ar: 'حساسات التربة' }, icon: 'fa-solid fa-seedling', to: '/sensors/soil' },
      { label: { en: 'Weather Sensors', ar: 'حساسات الطقس' }, icon: 'fa-solid fa-cloud-sun', to: '/sensors/weather' },
      { label: { en: 'Irrigation Sensors', ar: 'حساسات الري' }, icon: 'fa-solid fa-faucet-drip', to: '/sensors/irrigation' },
      { label: { en: 'Camera', ar: 'الكاميرا' }, icon: 'fa-solid fa-camera', to: '/sensors/camera' },
      {
        label: { en: 'GPS Vehicle Tracking', ar: 'تتبع مركبات GPS' },
        icon: 'fa-solid fa-route',
        to: '/sensors/gps',
        externalUrl: GPS_VEHICLE_TRACKING_SIGNIN_URL,
      },
    ]
  },
  {
    id: 'weather',
    label: { en: 'Weather', ar: 'الطقس' },
    icon: 'fa-solid fa-cloud-sun',
    color: '#22D3EE',
    to: '/weather/intelligence',
  },
  {
    id: 'camera-direct',
    label: { en: 'Camera', ar: 'الكاميرا' },
    icon: 'fa-solid fa-camera',
    color: '#0EA5E9',
    to: '/sensors/camera'
  },
  {
    id: 'gps-direct',
    label: { en: 'GPS Vehicle Tracking', ar: 'تتبع مركبات GPS' },
    icon: 'fa-solid fa-route',
    color: '#10B981',
    to: '/sensors/gps',
    externalUrl: GPS_VEHICLE_TRACKING_SIGNIN_URL,
  },
  {
    id: 'master',
    label: { en: 'Master Data', ar: 'البيانات الرئيسية' },
    icon: 'fa-solid fa-gear',
    color: '#64748B',
    items: [
      { label: { en: 'Data Management', ar: 'إدارة البيانات' }, icon: 'fa-solid fa-database', to: '/master/workflow-settings' },
      { label: { en: 'Dashboard Settings', ar: 'إعدادات لوحة التحكم' }, icon: 'fa-solid fa-link', to: '/master/dashboard-settings' },
      { label: { en: 'GIS Content', ar: 'محتوى GIS' }, icon: 'fa-solid fa-map-location-dot', to: '/master/gis-content' },
    ]
  },
  {
    id: 'admin',
    label: { en: 'Settings', ar: 'الإعدادات' },
    icon: 'fa-solid fa-user-shield',
    color: '#6366F1',
    items: [
      { label: { en: 'User Management', ar: 'إدارة المستخدمين' }, icon: 'fa-solid fa-users', to: '/admin/users' },
      { label: { en: 'Manpower', ar: 'القوى العاملة' }, icon: 'fa-solid fa-people-group', to: '/admin/manpower' },
      { label: { en: 'Credits', ar: 'الرصيد' }, icon: 'fa-solid fa-coins', to: '/admin/credits' },
      { label: { en: 'Roles & Permissions', ar: 'الأدوار والصلاحيات' }, icon: 'fa-solid fa-shield-halved', to: '/admin/roles' },
      { label: { en: 'Hierarchy', ar: 'التسلسل الهرمي' }, icon: 'fa-solid fa-sitemap', to: '/admin/hierarchy' },
      { label: { en: 'GitHub Integration', ar: 'تكامل GitHub' }, icon: 'fa-brands fa-github', to: '/admin/github' },
      { label: { en: 'System Settings', ar: 'إعدادات النظام' }, icon: 'fa-solid fa-sliders', to: '/admin/system-settings' },
    ]
  },
  {
    id: 'account',
    label: { en: 'Account', ar: 'الحساب' },
    icon: 'fa-solid fa-circle-user',
    color: '#0EA5E9',
    items: [
      { label: { en: 'Settings', ar: 'الإعدادات' }, icon: 'fa-solid fa-gear', to: '/account/settings' },
      { label: { en: 'Logout', ar: 'تسجيل الخروج' }, icon: 'fa-solid fa-arrow-right-from-bracket', action: 'logout' },
    ]
  }
]
