import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { DevelopEliteListPanels, type DevelopEliteListPanelTab } from './DevelopEliteListPanels'
import type { useDevelopEliteDashboardData } from './useDevelopEliteDashboardData'

type DashboardData = ReturnType<typeof useDevelopEliteDashboardData>

const TABS: Array<{ id: DevelopEliteListPanelTab; label: string; icon: string }> = [
  { id: 'farms', label: 'Farms', icon: 'fa-location-dot' },
  { id: 'zones', label: 'Zones', icon: 'fa-map' },
  { id: 'countries', label: 'Countries', icon: 'fa-earth-americas' },
  { id: 'structures', label: 'Structures', icon: 'fa-warehouse' },
]

type Props = {
  open: boolean
  onClose: () => void
  data: DashboardData
  filteredCountries: Array<{ code: string; label: string }>
  filteredZones: Array<{ zoneId: string; label: string }>
  countrySearch: string
  setCountrySearch: Dispatch<SetStateAction<string>>
  zoneSearch: string
  setZoneSearch: Dispatch<SetStateAction<string>>
  onOpenSettings?: () => void
}

export function DevelopEliteListsDrawer({
  open,
  onClose,
  data,
  filteredCountries,
  filteredZones,
  countrySearch,
  setCountrySearch,
  zoneSearch,
  setZoneSearch,
  onOpenSettings,
}: Props) {
  const [tab, setTab] = useState<DevelopEliteListPanelTab>('farms')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  useEffect(() => {
    document.body.classList.toggle('develop-elite--lists-drawer-open', open)
    return () => document.body.classList.remove('develop-elite--lists-drawer-open')
  }, [open])

  return (
    <div
      className={`develop-elite-lists-drawer${open ? ' is-open' : ''}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="develop-elite-lists-drawer__backdrop"
        aria-label="Close lists"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        className="develop-elite-lists-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Browse farms and filters"
      >
        <header className="develop-elite-lists-drawer__head">
          <h2 className="develop-elite-lists-drawer__title">Browse</h2>
          <button type="button" className="develop-elite-lists-drawer__close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>
        <nav className="develop-elite-lists-drawer__tabs" role="tablist" aria-label="List sections">
          {TABS.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`develop-elite-lists-drawer__tab${tab === item.id ? ' is-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <i className={`fa-solid ${item.icon}`} aria-hidden />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="develop-elite-lists-drawer__body" role="tabpanel">
          <DevelopEliteListPanels
            tab={tab}
            data={data}
            filteredCountries={filteredCountries}
            filteredZones={filteredZones}
            countrySearch={countrySearch}
            setCountrySearch={setCountrySearch}
            zoneSearch={zoneSearch}
            setZoneSearch={setZoneSearch}
          />
        </div>
        {onOpenSettings ? (
          <footer className="develop-elite-lists-drawer__foot">
            <button type="button" className="develop-elite-lists-drawer__settings" onClick={onOpenSettings}>
              <i className="fa-solid fa-gear" aria-hidden />
              Dashboard settings
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  )
}
