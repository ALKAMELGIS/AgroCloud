import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAgroCloudDashboardAppMenuItems } from './agroCloudDashboardData'

type AgroCloudDashboardAppMenuProps = {
  dashboardId?: string
}

/** ArcGIS-style hamburger app menu (Home, Content, Organization, …). */
export function AgroCloudDashboardAppMenu({ dashboardId }: AgroCloudDashboardAppMenuProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuItems = getAgroCloudDashboardAppMenuItems(dashboardId)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false)
      navigate(path)
    },
    [navigate],
  )

  return (
    <div className="agrocloud-dashboard-app-menu" ref={wrapRef}>
      <button
        type="button"
        className={`agrocloud-dashboard-app-menu__toggle${open ? ' is-open' : ''}`}
        title="App menu"
        aria-label="App menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="agrocloud-dashboard-app-menu__bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      {open ? (
        <div className="agrocloud-dashboard-app-menu__panel" role="menu">
          {menuItems.map(item => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="agrocloud-dashboard-app-menu__item"
              onClick={() => handleSelect(item.path)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
