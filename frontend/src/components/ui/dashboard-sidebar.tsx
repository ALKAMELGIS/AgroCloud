/**
 * Dashboard sidebar (shadcn-style, Tailwind + lucide-react).
 *
 * Adapted from the 21st.dev "dashboard-sidebar" component:
 * - data-driven: pass `groups`, `bottomItems` and `workspaces` (the demo data is the default)
 * - real <button>s with aria-expanded / aria-current, so it works with the keyboard
 * - logical spacing (ps-/border-s) so it mirrors correctly in Arabic (RTL)
 * - a badge of 0 no longer renders a stray "0"
 * - named Tailwind groups (`group/nav`): the app's nav CSS styles a global `.group` class as a column
 */
import { useState, type ElementType } from 'react'
import {
  Activity,
  Blocks,
  Calendar,
  ChevronDown,
  ChevronRight,
  Command,
  CreditCard,
  FolderKanban,
  Globe,
  Hash,
  Inbox,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Terminal,
  Users,
  X,
} from 'lucide-react'

export type NavItemData = {
  id: string
  title: string
  icon: ElementType
  badge?: number | string
  shortcut?: string
  children?: NavItemData[]
}

export type NavGroupData = {
  heading?: string
  items: NavItemData[]
}

export type WorkspaceOption = {
  name: string
  subtitle?: string
  /** Logo shown instead of the first letter. */
  logoSrc?: string
}

const mockNavGroups: NavGroupData[] = [
  {
    items: [
      { id: 'search', title: 'Search', icon: Search, shortcut: '⌘K' },
      { id: 'home', title: 'Home', icon: LayoutDashboard },
      { id: 'inbox', title: 'Inbox', icon: Inbox, badge: 12 },
      { id: 'analytics', title: 'Analytics', icon: Activity },
    ],
  },
  {
    heading: 'Workspace',
    items: [
      {
        id: 'projects',
        title: 'Projects',
        icon: FolderKanban,
        children: [
          { id: 'p-active', title: 'Active', icon: Hash },
          { id: 'p-archived', title: 'Archived', icon: Hash },
        ],
      },
      { id: 'calendar', title: 'Calendar', icon: Calendar },
      {
        id: 'team',
        title: 'Team',
        icon: Users,
        children: [
          { id: 't-design', title: 'Designers', icon: Hash },
          { id: 't-eng', title: 'Engineering', icon: Hash },
          { id: 't-product', title: 'Product', icon: Hash },
        ],
      },
      {
        id: 'customers',
        title: 'Customers',
        icon: Globe,
        children: [
          { id: 'c-enterprise', title: 'Enterprise', icon: Hash },
          { id: 'c-smb', title: 'SMB', icon: Hash },
        ],
      },
      { id: 'finance', title: 'Finance', icon: CreditCard },
    ],
  },
  {
    heading: 'Developers',
    items: [
      { id: 'api', title: 'API Keys', icon: Terminal },
      { id: 'webhooks', title: 'Webhooks', icon: Blocks },
    ],
  },
]

const mockBottomItems: NavItemData[] = [
  { id: 'settings', title: 'Settings', icon: Settings, shortcut: '⌘,' },
  { id: 'logout', title: 'Log out', icon: LogOut },
]

const mockWorkspaces: WorkspaceOption[] = [
  { name: 'Acme Corp', subtitle: 'Pro Plan' },
  { name: 'Personal Workspace', subtitle: 'Free' },
  { name: 'Client Sandbox', subtitle: 'Trial' },
]

function WorkspaceSwitcher({
  workspaces,
  selected,
  onSelect,
}: {
  workspaces: WorkspaceOption[]
  selected?: string
  onSelect?: (ws: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [internalSelected, setInternalSelected] = useState(workspaces[0]?.name ?? '')

  const currentName = selected || internalSelected
  const current = workspaces.find((w) => w.name === currentName) ?? { name: currentName }
  const handleSelect = onSelect || setInternalSelected
  const canSwitch = workspaces.length > 1

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => canSwitch && setIsOpen(!isOpen)}
        aria-haspopup={canSwitch ? 'listbox' : undefined}
        aria-expanded={canSwitch ? isOpen : undefined}
        className={`group/nav mb-4 flex w-full items-center justify-between rounded-lg border-0 bg-transparent px-2 py-2 text-start transition-colors select-none ${
          canSwitch ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5' : 'cursor-default'
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          {'logoSrc' in current && current.logoSrc ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-primary/10 ring-1 ring-primary/20">
              <img src={current.logoSrc} alt="" className="h-7 w-7 object-contain" />
            </span>
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-primary text-[13px] font-semibold text-primary-foreground shadow-sm">
              {current.name.charAt(0)}
            </span>
          )}
          <span className="flex min-w-0 flex-col overflow-hidden">
            <span className="mb-1 max-w-[150px] truncate text-[13px] font-medium leading-none text-foreground">
              {current.name}
            </span>
            {current.subtitle ? (
              <span className="truncate text-[11px] leading-none text-muted-foreground">{current.subtitle}</span>
            ) : null}
          </span>
        </span>
        {canSwitch ? (
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover/nav:text-foreground/70"
            strokeWidth={1.5}
            aria-hidden
          />
        ) : null}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden />
          <div
            role="listbox"
            className="absolute start-0 top-[52px] z-50 flex w-full flex-col gap-0.5 rounded-lg border border-border/50 bg-card py-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          >
            {workspaces.map((ws) => (
              <button
                key={ws.name}
                type="button"
                role="option"
                aria-selected={current.name === ws.name}
                onClick={() => {
                  handleSelect(ws.name)
                  setIsOpen(false)
                }}
                className={`mx-1 cursor-pointer rounded-md border-0 px-3 py-2 text-start text-[13px] transition-colors ${
                  current.name === ws.name
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'bg-transparent text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {ws.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function NavItem({
  item,
  activeId,
  onSelect,
  level = 0,
}: {
  item: NavItemData
  activeId: string
  onSelect: (id: string) => void
  level?: number
}) {
  const isActive = activeId === item.id
  const hasChildren = !!item.children?.length
  const containsActive = hasChildren && item.children!.some((c) => c.id === activeId)
  const [isOpen, setIsOpen] = useState(containsActive)

  const handleClick = () => {
    if (hasChildren) setIsOpen(!isOpen)
    else onSelect(item.id)
  }

  const hasBadge = item.badge !== undefined && item.badge !== null && item.badge !== '' && item.badge !== 0

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        className={`group/nav flex w-full cursor-pointer items-center justify-between rounded-[6px] border-0 py-[7px] pe-2.5 text-start transition-all duration-200 select-none ${
          isActive
            ? // Active page: brand tint plus an accent bar on the leading edge.
              'relative bg-primary/10 font-medium text-primary before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-primary before:content-[""]'
            : 'bg-transparent text-muted-foreground hover:bg-black/5 hover:text-foreground/90 dark:hover:bg-white/5'
        }`}
        style={{ paddingInlineStart: `${level * 12 + 10}px` }}
        onClick={handleClick}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <item.icon
            className={`h-[16px] w-[16px] shrink-0 transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover/nav:text-foreground/70'
            }`}
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="truncate text-[13px] tracking-wide">{item.title}</span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {item.shortcut && (
            <kbd className="hidden h-5 items-center justify-center rounded-[4px] border border-border/50 bg-background/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/60 shadow-sm group-hover/nav:inline-flex">
              {item.shortcut}
            </kbd>
          )}
          {hasBadge && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
              {item.badge}
            </span>
          )}
          {hasChildren && (
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 rtl:-scale-x-100 ${
                isOpen ? 'rotate-90 rtl:-rotate-90' : ''
              }`}
              strokeWidth={2}
              aria-hidden
            />
          )}
        </span>
      </button>

      {hasChildren && (
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          // Collapsed sub-items are skipped by Tab/screen readers (React 18 has no typed `inert` prop).
          {...((!isOpen ? { inert: '' } : {}) as Record<string, string>)}
        >
          <div className="relative mt-0.5 flex min-h-0 flex-col gap-0.5 overflow-hidden">
            <div
              className="absolute bottom-0 top-0 border-s border-black/5 dark:border-white/5"
              style={{ insetInlineStart: `${level * 12 + 17.5}px` }}
              aria-hidden
            />
            {item.children!.map((child) => (
              <NavItem key={child.id} item={child} activeId={activeId} onSelect={onSelect} level={level + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function SidebarNav({
  className = '',
  groups = mockNavGroups,
  bottomItems = mockBottomItems,
  workspaces = mockWorkspaces,
  activeId,
  onSelect,
  activeWorkspace,
  onWorkspaceSelect,
  ariaLabel = 'Main navigation',
}: {
  className?: string
  groups?: NavGroupData[]
  bottomItems?: NavItemData[]
  workspaces?: WorkspaceOption[]
  activeId?: string
  onSelect?: (id: string) => void
  activeWorkspace?: string
  onWorkspaceSelect?: (ws: string) => void
  ariaLabel?: string
}) {
  const [internalId, setInternalId] = useState('home')
  const currentId = activeId !== undefined ? activeId : internalId
  const handleSelect = onSelect || setInternalId

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex h-full w-[260px] flex-col border-e border-border/50 bg-card/50 p-3 font-sans ${className}`}
    >
      <WorkspaceSwitcher workspaces={workspaces} selected={activeWorkspace} onSelect={onWorkspaceSelect} />

      <div className="mt-2 flex flex-1 flex-col gap-4 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((group, idx) => (
          <div key={group.heading ?? idx} className="flex flex-col gap-0.5">
            {group.heading && (
              <span className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {group.heading}
              </span>
            )}
            {group.items.map((item) => (
              <NavItem key={item.id} item={item} activeId={currentId} onSelect={handleSelect} />
            ))}
          </div>
        ))}
      </div>

      {bottomItems.length ? (
        <div className="mt-auto flex flex-col gap-0.5 border-t border-border/50 pt-4">
          {bottomItems.map((item) => (
            <NavItem key={item.id} item={item} activeId={currentId} onSelect={handleSelect} />
          ))}
        </div>
      ) : null}
    </nav>
  )
}

const flattenItems = (items: NavItemData[]): NavItemData[] =>
  items.reduce((acc, item) => {
    acc.push(item)
    if (item.children) acc.push(...flattenItems(item.children))
    return acc
  }, [] as NavItemData[])

/** Demo of the full layout (sidebar + header + search palette) with the sample data. */
export default function SidebarNavPreview() {
  const [isOpen, setIsOpen] = useState(true)
  const [activeId, setActiveId] = useState('home')
  const [activeWorkspace, setActiveWorkspace] = useState('Acme Corp')
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const flat = flattenItems([...mockNavGroups.flatMap((g) => g.items), ...mockBottomItems])
  const activeTitle = flat.find((i) => i.id === activeId)?.title ?? 'Dashboard'

  const handleSelect = (id: string) => {
    if (id === 'search') {
      setIsSearchOpen(true)
      return
    }
    setActiveId(id)
  }

  return (
    <div className="flex min-h-[700px] w-full flex-col items-center justify-center bg-background p-4 md:p-8">
      <div className="relative flex h-[700px] w-full max-w-4xl overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/5">
        <div
          className={`h-full shrink-0 overflow-hidden border-e border-border/50 bg-card/50 transition-all duration-300 ease-in-out ${
            isOpen ? 'w-[260px] opacity-100' : 'w-0 border-none opacity-0'
          }`}
        >
          <SidebarNav
            className="w-[260px] border-none bg-transparent"
            activeId={activeId}
            onSelect={handleSelect}
            activeWorkspace={activeWorkspace}
            onWorkspaceSelect={setActiveWorkspace}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-black/[0.02] transition-all duration-300 dark:bg-white/[0.02]">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 bg-card px-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-label={isOpen ? 'Hide sidebar' : 'Show sidebar'}
                className="rounded-md border-0 bg-transparent p-1.5 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
              >
                {isOpen ? (
                  <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.5} />
                ) : (
                  <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.5} />
                )}
              </button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{activeWorkspace}</span>
                <span>/</span>
                <span className="truncate font-medium text-foreground">{activeTitle}</span>
              </div>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="h-32 rounded-xl border border-border/50 bg-card shadow-sm" />
              <div className="h-32 rounded-xl border border-border/50 bg-card shadow-sm" />
            </div>
          </div>
        </div>

        {isSearchOpen && (
          <div className="absolute inset-0 z-50 flex items-start justify-center bg-background/40 px-4 pt-[15vh] backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setIsSearchOpen(false)} aria-hidden />
            <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border/50 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center border-b border-border/50 px-4">
                <Search className="me-3 h-[18px] w-[18px] shrink-0 text-muted-foreground/70" strokeWidth={1.5} />
                <input
                  autoFocus
                  className="flex-1 border-0 bg-transparent py-4 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/50"
                  placeholder="Search projects, docs, or actions..."
                />
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(false)}
                  aria-label="Close search"
                  className="ms-3 rounded-md border-0 bg-transparent p-1 text-muted-foreground/70 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                >
                  <X className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </button>
              </div>
              <div className="flex flex-col items-center justify-center p-2 py-8">
                <Command className="mb-2 h-6 w-6 text-muted-foreground/30" strokeWidth={1.5} />
                <p className="text-[13px] font-medium text-muted-foreground">Type a command or search...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
