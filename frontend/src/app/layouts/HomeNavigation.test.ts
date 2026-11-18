import { describe, expect, it } from 'vitest'
import { buildHomeNavigation, filterNavEntries, type HomeMenuItem } from './HomeNavigation'

const menu: HomeMenuItem[] = [
  { id: 'weather', label: { en: 'Weather Intelligence', ar: 'ذكاء الطقس' }, icon: 'fa-solid fa-cloud-sun', color: '#F97316', to: '/weather/intelligence' },
  {
    id: 'application',
    label: { en: 'Application', ar: 'التطبيقات' },
    icon: 'fa-solid fa-cubes',
    color: '#0EA5E9',
    items: [{ label: { en: 'Weather Sensors', ar: 'حساسات الطقس' }, icon: 'fa-solid fa-temperature-half', to: '/sensors/weather' }],
  },
  { id: 'gps', label: { en: 'GPS Vehicle Tracking', ar: 'تتبع مركبات GPS' }, icon: 'fa-solid fa-route', color: '#10B981', externalUrl: 'https://example.com/gps' },
  {
    id: 'admin',
    label: { en: 'Settings', ar: 'الإعدادات' },
    icon: 'fa-solid fa-user-shield',
    color: '#6366F1',
    items: [{ label: { en: 'Credits', ar: 'الرصيد' }, icon: 'fa-solid fa-coins', to: '/admin/credits' }],
  },
  {
    id: 'account',
    label: { en: 'Account', ar: 'الحساب' },
    icon: 'fa-solid fa-circle-user',
    color: '#0EA5E9',
    items: [
      { label: { en: 'Settings', ar: 'الإعدادات' }, icon: 'fa-solid fa-gear', to: '/account/settings' },
      { label: { en: 'Logout', ar: 'تسجيل الخروج' }, icon: 'fa-solid fa-arrow-right-from-bracket', action: 'logout' },
    ],
  },
]

describe('buildHomeNavigation', () => {
  it('puts direct apps under Apps, groups under Workspace, settings/account at the bottom', () => {
    const nav = buildHomeNavigation(menu, 'en')
    expect(nav.groups.map((g) => g.heading)).toEqual([undefined, 'Apps', 'Workspace'])
    expect(nav.groups[1]!.items.map((i) => i.title)).toEqual(['Weather Intelligence', 'GPS Vehicle Tracking'])
    expect(nav.groups[2]!.items[0]!.children!.map((c) => c.id)).toEqual(['/sensors/weather'])
    expect(nav.bottomItems.map((i) => i.title)).toEqual(['Settings', 'My account', 'Logout'])
  })

  it('maps every entry to what selecting it does', () => {
    const { actions } = buildHomeNavigation(menu, 'en')
    expect(actions.get('/weather/intelligence')).toEqual({ kind: 'route', to: '/weather/intelligence' })
    expect(actions.get('ext:https://example.com/gps')).toEqual({ kind: 'external', url: 'https://example.com/gps' })
    expect(actions.get('logout')).toEqual({ kind: 'logout' })
    expect(actions.get('search')).toEqual({ kind: 'search' })
  })

  it('uses Arabic titles in Arabic', () => {
    const nav = buildHomeNavigation(menu, 'ar')
    expect(nav.groups[1]!.heading).toBe('التطبيقات')
    expect(nav.bottomItems[1]!.title).toBe('حسابي')
  })
})

describe('filterNavEntries', () => {
  const { entries } = buildHomeNavigation(menu, 'en')

  it('matches every typed word, in either language, case-insensitively', () => {
    expect(filterNavEntries(entries, 'sensors').map((e) => e.id)).toEqual(['/sensors/weather'])
    expect(filterNavEntries(entries, 'حساسات').map((e) => e.id)).toEqual(['/sensors/weather'])
    expect(filterNavEntries(entries, 'SETTINGS credits').map((e) => e.id)).toEqual(['/admin/credits'])
    expect(filterNavEntries(entries, 'nothing like this')).toEqual([])
  })

  it('returns everything for an empty query', () => {
    expect(filterNavEntries(entries, '   ')).toHaveLength(entries.length)
  })
})
