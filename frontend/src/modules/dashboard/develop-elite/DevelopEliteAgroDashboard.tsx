import { lazy, Suspense, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { DevelopEliteHeaderDateTime } from './DevelopEliteHeaderDateTime'
import { DevelopEliteHeaderDigitalClock } from './DevelopEliteHeaderDigitalClock'
import { DevelopEliteAgroGridSection } from './DevelopEliteAgroGridSection'
import { useDevelopEliteDashboardData } from './useDevelopEliteDashboardData'
import { useDevelopEliteLiveLayout } from './useDevelopEliteLiveLayout'
import { DashboardRefreshButton } from '@/modules/dashboards/components/DashboardRefreshButton'
import { sortDevelopEliteListBySearch } from './developEliteListSearch'
import { sortDevelopEliteZoneListByMapView } from './developEliteKpiEngine'
import { useDevelopEliteCompactViewport } from './developEliteCompactViewport'
import { DevelopEliteListsDrawer } from './DevelopEliteListsDrawer'
import { developEliteAccent } from '@/theme/dashboardTokens'
import '../styles/dashboard.css'

type SettingsTabId = 'data' | 'kpi' | 'charts' | 'map' | 'appearance'

const DevelopEliteSettingsModal = lazy(() =>
  import('./DevelopEliteSettingsModal').then(m => ({ default: m.DevelopEliteSettingsModal })),
)

export default function DevelopEliteAgroDashboard() {
  const data = useDevelopEliteDashboardData()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('data')
  const [countrySearch, setCountrySearch] = useState('')
  const [zoneSearch, setZoneSearch] = useState('')
  const [countryMenuOpen, setCountryMenuOpen] = useState(false)
  const [layoutEditMode, setLayoutEditMode] = useState(false)
  const [listsDrawerOpen, setListsDrawerOpen] = useState(false)
  const compactViewport = useDevelopEliteCompactViewport()
  const countryMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!countryMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const root = countryMenuRef.current
      if (root && !root.contains(event.target as Node)) setCountryMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [countryMenuOpen])

  const pickCountry = useCallback(
    (code: string) => {
      data.selectCountry(code)
      setCountryMenuOpen(false)
    },
    [data.selectCountry],
  )

  const zoneNameSort = useCallback(
    (a: { label: string }, b: { label: string }) =>
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }),
    [],
  )

  const filteredZones = useMemo(() => {
    const ordered = sortDevelopEliteZoneListByMapView(
      data.zoneList,
      data.mapView,
      data.zoneListMapSortFeatures,
      zoneNameSort,
    )
    return sortDevelopEliteListBySearch(
      ordered,
      zoneSearch,
      z => `${z.label} ${z.zoneId}`,
      zoneNameSort,
    )
  }, [data.mapView, data.zoneList, data.zoneListMapSortFeatures, zoneNameSort, zoneSearch])

  const filteredCountries = useMemo(() => {
    return sortDevelopEliteListBySearch(
      data.countryList,
      countrySearch,
      c => `${c.label} ${c.code}`,
      (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }),
    )
  }, [data.countryList, countrySearch])

  const formatHeroArea = useCallback((n: number) => {
    return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
  }, [])

  const { layout, layoutStyle, nudgeLayout, commitLayoutPatch, persistLayout, undoLayout } =
    useDevelopEliteLiveLayout(
    data.config.layout,
    data.patchConfig,
  )

  useEffect(() => {
    if (!layoutEditMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.key.toLowerCase() !== 'z') return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) {
        return
      }
      event.preventDefault()
      undoLayout()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [layoutEditMode, undoLayout])

  const openSettings = useCallback((tab: SettingsTabId) => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [])

  const toggleLayoutEditMode = useCallback(() => {
    setLayoutEditMode(on => !on)
  }, [])

  const visibleKpiCards = useMemo(
    () => [...data.config.kpiCards].filter(c => c.visible).sort((a, b) => a.order - b.order),
    [data.config.kpiCards],
  )

  return (
    <div
      className={`develop-elite-dashboard develop-elite page page-tight develop-elite--grid-dashboard${layoutEditMode ? ' develop-elite--layout-edit' : ''}${layout.themeIconsUnified ? ' develop-elite--theme-icons-unified' : ''}${compactViewport ? ' develop-elite--compact-viewport' : ''}`}
      style={{ ...layoutStyle, ['--de-accent' as string]: developEliteAccent }}
    >
      <header className="develop-elite__header develop-elite__header--compact">
        <div className="develop-elite__header-top">
          <div className="develop-elite__brand">
            <span className="develop-elite__brand-icon" aria-hidden>
              <i className="fa-solid fa-leaf" />
            </span>
            <span className="develop-elite__brand-text">Agro Cloud</span>
          </div>
          <div className="develop-elite__logo-center">
            <DevelopEliteHeaderDigitalClock />
          </div>
          <div className="develop-elite__header-meta">
            <div className="develop-elite__header-meta-info">
              <DevelopEliteHeaderDateTime />
              <div
                className="develop-elite__meta-block develop-elite__meta-block--country"
                ref={countryMenuRef}
              >
                <span className="develop-elite__meta-label" id="develop-elite-country-label">COUNTRY:</span>
                <button
                  type="button"
                  className="develop-elite__country-trigger"
                  aria-labelledby="develop-elite-country-label"
                  aria-haspopup="listbox"
                  aria-expanded={countryMenuOpen}
                  onClick={() => setCountryMenuOpen(open => !open)}
                >
                  <i className="fa-solid fa-earth-americas develop-elite__country-trigger-icon" aria-hidden />
                  <span className="develop-elite__country-trigger-label">{data.activeCountryLabel}</span>
                  <i className="fa-solid fa-chevron-down" aria-hidden />
                </button>
                {countryMenuOpen ? (
                  <ul className="develop-elite__country-menu" role="listbox" aria-label="Countries">
                    <li role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={data.filters.country === 'all'}
                        className={`develop-elite__country-option${data.filters.country === 'all' ? ' is-active' : ''}`}
                        onClick={() => pickCountry('all')}
                      >
                        All countries
                      </button>
                    </li>
                    {data.countryList.map(c => (
                      <li key={c.code} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={data.filters.country === c.code}
                          className={`develop-elite__country-option${data.filters.country === c.code ? ' is-active' : ''}`}
                          onClick={() => pickCountry(c.code)}
                        >
                          {c.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
            <div className="develop-elite__header-meta-actions">
              <button
                type="button"
                className={`develop-elite__layout-edit-btn${layoutEditMode ? ' is-active' : ''}`}
                aria-pressed={layoutEditMode}
                title={layoutEditMode ? 'Finish editing layout' : 'Edit dashboard layout'}
                onClick={toggleLayoutEditMode}
              >
                <i className={`fa-solid ${layoutEditMode ? 'fa-check' : 'fa-table-columns'}`} aria-hidden />
                <span>{layoutEditMode ? 'Done' : 'Edit layout'}</span>
              </button>
              <DashboardRefreshButton
                className="develop-elite__refresh-btn"
                busy={data.refreshing}
                lastUpdated={data.lastRefreshedAt}
                onClick={data.refresh}
              />
              {compactViewport ? (
                <>
                  <button
                    type="button"
                    className={`develop-elite__lists-drawer-btn${listsDrawerOpen ? ' is-active' : ''}`}
                    aria-label="Browse farms, zones and countries"
                    aria-expanded={listsDrawerOpen}
                    onClick={() => setListsDrawerOpen(open => !open)}
                  >
                    <i className="fa-solid fa-bars" aria-hidden />
                    <span className="develop-elite__lists-drawer-btn-label">Lists</span>
                  </button>
                  <button
                    type="button"
                    className="develop-elite__menu-btn"
                    aria-label="Dashboard settings"
                    onClick={() => openSettings('data')}
                  >
                    <i className="fa-solid fa-gear" aria-hidden />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="develop-elite__menu-btn"
                  aria-label="Menu and settings"
                  onClick={() => openSettings('data')}
                >
                  <i className="fa-solid fa-bars" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="develop-elite__scroll-main">
      {data.error ? (
        <div className="develop-elite__error" role="alert">
          {data.error}
          <button type="button" onClick={data.refresh}>Retry</button>
        </div>
      ) : null}
      <DevelopEliteAgroGridSection
        layout={layout}
        visibleKpiCards={visibleKpiCards}
        formatHeroArea={formatHeroArea}
        data={data}
        filteredCountries={filteredCountries}
        filteredZones={filteredZones}
        countrySearch={countrySearch}
        setCountrySearch={setCountrySearch}
        zoneSearch={zoneSearch}
        setZoneSearch={setZoneSearch}
        nudgeLayout={nudgeLayout}
        persistLayout={persistLayout}
        commitLayoutPatch={commitLayoutPatch}
        layoutEditMode={layoutEditMode}
        onWidgetConfigure={(_, tab) => openSettings(tab)}
      />
      </div>

      {compactViewport ? (
        <DevelopEliteListsDrawer
          open={listsDrawerOpen}
          onClose={() => setListsDrawerOpen(false)}
          data={data}
          filteredCountries={filteredCountries}
          filteredZones={filteredZones}
          countrySearch={countrySearch}
          setCountrySearch={setCountrySearch}
          zoneSearch={zoneSearch}
          setZoneSearch={setZoneSearch}
          onOpenSettings={() => {
            setListsDrawerOpen(false)
            openSettings('data')
          }}
        />
      ) : null}

      {settingsOpen ? (
        <Suspense fallback={null}>
          <DevelopEliteSettingsModal
            open={settingsOpen}
            initialTab={settingsTab}
            config={data.config}
            onClose={() => setSettingsOpen(false)}
            onSave={data.persistConfig}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
