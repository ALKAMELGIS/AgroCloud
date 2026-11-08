/**
 * Home navigation: turns the home menu (Home.tsx) into the dashboard sidebar's data and provides the
 * ⌘K / Ctrl+K command palette that searches every destination (English and Arabic labels).
 */
import { useEffect, useMemo, useRef, useState, type ElementType } from 'react'
import {
  Boxes,
  Building2,
  Camera,
  ChartLine,
  CircleUser,
  ClipboardList,
  CloudLightning,
  CloudSun,
  Coins,
  Command,
  CornerDownLeft,
  Cpu,
  Database,
  Droplet,
  Droplets,
  FlaskConical,
  Github,
  Hash,
  House,
  Layers,
  LayoutGrid,
  Link,
  LogOut,
  MapPinned,
  Network,
  Package,
  PieChart,
  Route,
  SatelliteDish,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  SprayCan,
  Sprout,
  Tractor,
  UserCog,
  Users,
  UsersRound,
  Waves,
  Wrench,
  X,
} from 'lucide-react'
import type { AppLanguage } from '@/core/localization/i18n'
import type { NavGroupData, NavItemData } from '@/components/ui/dashboard-sidebar'

export interface HomeSubMenuItem {
  label: Record<AppLanguage, string>
  icon: string
  to?: string
  action?: 'logout'
  externalUrl?: string
}

export interface HomeMenuItem {
  id: string
  label: Record<AppLanguage, string>
  icon: string
  color: string
  items?: HomeSubMenuItem[]
  to?: string
  externalUrl?: string
}

/** Font Awesome classes used by the home menu → lucide icons for the sidebar. */
const ICONS: Record<string, ElementType> = {
  'fa-chart-line': ChartLine,
  'fa-grip': LayoutGrid,
  'fa-chart-pie': PieChart,
  'fa-seedling': Sprout,
  'fa-cubes': Boxes,
  'fa-building-user': Building2,
  'fa-satellite-dish': SatelliteDish,
  'fa-layer-group': Layers,
  'fa-screwdriver-wrench': Wrench,
  'fa-droplet': Droplet,
  'fa-table-list': ClipboardList,
  'fa-flask': FlaskConical,
  'fa-spray-can-sparkles': SprayCan,
  'fa-water': Waves,
  'fa-tractor': Tractor,
  'fa-shield-halved': ShieldCheck,
  'fa-boxes-stacked': Package,
  'fa-microchip': Cpu,
  'fa-cloud-sun': CloudSun,
  'fa-faucet-drip': Droplets,
  'fa-camera': Camera,
  'fa-route': Route,
  'fa-cloud-bolt': CloudLightning,
  'fa-gear': SlidersHorizontal,
  'fa-database': Database,
  'fa-link': Link,
  'fa-map-location-dot': MapPinned,
  'fa-user-shield': UserCog,
  'fa-users': Users,
  'fa-people-group': UsersRound,
  'fa-coins': Coins,
  'fa-sitemap': Network,
  'fa-github': Github,
  'fa-sliders': SlidersHorizontal,
  'fa-circle-user': CircleUser,
  'fa-arrow-right-from-bracket': LogOut,
}

function iconFor(faClass: string): ElementType {
  const key = faClass.split(/\s+/).find((c) => c.startsWith('fa-') && c !== 'fa-solid' && c !== 'fa-brands')
  return (key && ICONS[key]) || Hash
}

/** The lucide icon for a home-menu Font Awesome class (home cards, sidebar and palette share one set). */
export function HomeMenuIcon({ faClass, className, strokeWidth = 1.75 }: { faClass: string; className?: string; strokeWidth?: number }) {
  const Icon = iconFor(faClass)
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />
}

/** What selecting a sidebar/palette entry does. */
export type HomeNavAction =
  | { kind: 'route'; to: string }
  | { kind: 'external'; url: string }
  | { kind: 'logout' }
  | { kind: 'search' }

export type HomeNavEntry = {
  id: string
  title: string
  /** Both languages, so search finds a page whichever language the user types in. */
  keywords: string
  group?: string
  icon: ElementType
  action: HomeNavAction
}

const T = {
  search: { en: 'Search', ar: 'بحث' },
  home: { en: 'Home', ar: 'الرئيسية' },
  apps: { en: 'Apps', ar: 'التطبيقات' },
  workspace: { en: 'Workspace', ar: 'مساحة العمل' },
} as const

function actionOf(item: { to?: string; externalUrl?: string; action?: 'logout' }): HomeNavAction | null {
  if (item.action === 'logout') return { kind: 'logout' }
  if (item.externalUrl) return { kind: 'external', url: item.externalUrl }
  if (item.to) return { kind: 'route', to: item.to }
  return null
}

const idOf = (action: HomeNavAction, fallback: string) =>
  action.kind === 'route' ? action.to : action.kind === 'external' ? `ext:${action.url}` : action.kind === 'logout' ? 'logout' : fallback

/** Groups for <SidebarNav>, the bottom items, and a flat, searchable entry list. */
export function buildHomeNavigation(menu: HomeMenuItem[], language: AppLanguage) {
  const entries = new Map<string, HomeNavEntry>()
  const add = (entry: HomeNavEntry) => {
    if (!entries.has(entry.id)) entries.set(entry.id, entry)
  }

  const appItems: NavItemData[] = []
  const workspaceItems: NavItemData[] = []
  const bottomItems: NavItemData[] = []
  const BOTTOM_GROUPS = new Set(['admin', 'account'])

  for (const group of menu) {
    const groupTitle = group.label[language]
    if (group.items?.length) {
      const children: NavItemData[] = []
      for (const sub of group.items) {
        const action = actionOf(sub)
        if (!action) continue
        const id = idOf(action, `${group.id}:${sub.label.en}`)
        const icon = iconFor(sub.icon)
        children.push({ id, title: sub.label[language], icon })
        add({
          id,
          title: sub.label[language],
          keywords: `${sub.label.en} ${sub.label.ar} ${group.label.en} ${group.label.ar}`.toLowerCase(),
          group: groupTitle,
          icon,
          action,
        })
      }
      const node: NavItemData = { id: `group:${group.id}`, title: groupTitle, icon: iconFor(group.icon), children }
      if (group.id === 'account') {
        // Account settings and log out sit at the bottom as plain items, like the original design.
        // "Settings" would clash with the admin Settings group right above it.
        bottomItems.push(
          ...children.map((c) =>
            c.id === 'logout' ? c : { ...c, title: language === 'ar' ? 'حسابي' : 'My account', icon: CircleUser },
          ),
        )
      } else if (BOTTOM_GROUPS.has(group.id)) {
        bottomItems.unshift(node)
      } else {
        workspaceItems.push(node)
      }
    } else {
      const action = actionOf(group)
      if (!action) continue
      const id = idOf(action, group.id)
      const icon = iconFor(group.icon)
      appItems.push({ id, title: groupTitle, icon })
      add({
        id,
        title: groupTitle,
        keywords: `${group.label.en} ${group.label.ar}`.toLowerCase(),
        icon,
        action,
      })
    }
  }

  const groups: NavGroupData[] = [
    {
      items: [
        { id: 'search', title: T.search[language], icon: Search, shortcut: '⌘K' },
        { id: '/', title: T.home[language], icon: House },
      ],
    },
    { heading: T.apps[language], items: appItems },
    { heading: T.workspace[language], items: workspaceItems },
  ].filter((g) => g.items.length)

  const actions = new Map<string, HomeNavAction>([['search', { kind: 'search' }], ['/', { kind: 'route', to: '/' }]])
  for (const e of entries.values()) actions.set(e.id, e.action)

  return { groups, bottomItems, entries: [...entries.values()], actions }
}

/** Case-insensitive match on every word typed, against both languages. */
export function filterNavEntries(entries: HomeNavEntry[], query: string): HomeNavEntry[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) return entries
  return entries.filter((e) => words.every((w) => e.keywords.includes(w)))
}

export function HomeCommandPalette({
  open,
  entries,
  language,
  onClose,
  onPick,
}: {
  open: boolean
  entries: HomeNavEntry[]
  language: AppLanguage
  onClose: () => void
  onPick: (entry: HomeNavEntry) => void
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const results = useMemo(() => filterNavEntries(entries, query), [entries, query])
  const ar = language === 'ar'

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
    }
  }, [open])

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const pick = (entry: HomeNavEntry | undefined) => {
    if (!entry) return
    onClose()
    onPick(entry)
  }

  return (
    <div
      className="fixed inset-0 z-[12010] flex items-start justify-center bg-background/40 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={ar ? 'بحث في التطبيق' : 'Search AgroCloud'}
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border/50 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center border-b border-border/50 px-4">
          <Search className="me-3 h-[18px] w-[18px] shrink-0 text-muted-foreground/70" strokeWidth={1.5} aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(c + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                pick(results[cursor])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="home-palette-results"
            aria-activedescendant={results[cursor] ? `home-palette-${cursor}` : undefined}
            // `!`: the app styles every <input> globally (border, padding, background, focus ring).
            className="min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !px-0 !py-4 text-[14px] text-foreground !shadow-none !outline-none placeholder:text-muted-foreground/50"
            placeholder={ar ? 'ابحث عن صفحة أو تطبيق…' : 'Search pages and apps…'}
          />
          <kbd className="ms-2 hidden h-5 items-center justify-center rounded-[4px] border border-black/10 bg-black/5 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70 dark:border-white/10 dark:bg-white/10 sm:inline-flex">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label={ar ? 'إغلاق' : 'Close'}
            className="ms-3 rounded-md border-0 bg-transparent p-1 text-muted-foreground/70 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
        </div>

        {results.length ? (
          <ul id="home-palette-results" ref={listRef} role="listbox" className="m-0 max-h-[50vh] list-none overflow-y-auto p-2">
            {results.map((entry, i) => (
              <li key={entry.id} id={`home-palette-${i}`} data-index={i} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  onMouseMove={() => setCursor(i)}
                  onClick={() => pick(entry)}
                  className={`flex w-full items-center gap-3 rounded-md border-0 px-3 py-2.5 text-start text-[13px] transition-colors ${
                    i === cursor ? 'bg-primary/10 text-foreground' : 'bg-transparent text-foreground/80'
                  }`}
                >
                  <entry.icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
                  {entry.group ? <span className="shrink-0 truncate text-[12px] text-muted-foreground">{entry.group}</span> : null}
                  {i === cursor ? (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 rtl:-scale-x-100" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center p-2 py-8">
            <Command className="mb-2 h-6 w-6 text-muted-foreground/30" strokeWidth={1.5} aria-hidden />
            <p className="m-0 text-[13px] font-medium text-muted-foreground">
              {ar ? `لا نتائج لـ "${query}"` : `No pages match "${query}"`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
