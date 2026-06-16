import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGisContentPortal } from '../../../lib/gisContentPortalStore'
import { isAgroCloudDashboardApp } from '../../master/gisContentPortalData'
import {
  AGROCLOUD_DASHBOARD_AUTHOR,
  AGROCLOUD_DASHBOARD_GALLERY_SEED,
  AGROCLOUD_DASHBOARD_ORG,
  AGROCLOUD_PRODUCT_NAME,
  type AgroCloudDashboardGalleryCard,
} from './agroCloudDashboardData'
import './agro-cloud-dashboards.css'

type GalleryTab = 'mine' | 'shared'

export default function AgroCloudDashboardsGallery() {
  const navigate = useNavigate()
  const portal = useGisContentPortal()
  const [tab, setTab] = useState<GalleryTab>('mine')
  const [scope, setScope] = useState('all')
  const [search, setSearch] = useState('')

  const savedApps = useMemo(
    () => portal.rows.filter(row => isAgroCloudDashboardApp(row, portal.getItemDetails(row.id))),
    [portal.rows, portal],
  )

  const cards = useMemo(() => {
    const userCards: AgroCloudDashboardGalleryCard[] = savedApps.map(r => ({
      id: r.id,
      title: r.title,
      author: r.owner ?? AGROCLOUD_DASHBOARD_AUTHOR,
      lastUpdate: r.modified,
      thumbnail: 'placeholder',
      portalAppId: r.id,
    }))
    const q = search.trim().toLowerCase()
    const base = tab === 'shared' ? [] : [...userCards, ...AGROCLOUD_DASHBOARD_GALLERY_SEED]
    return base.filter(c => {
      if (scope === 'saved' && !c.portalAppId) return false
      if (!q) return true
      return c.title.toLowerCase().includes(q)
    })
  }, [savedApps, search, scope, tab])

  const openEditor = useCallback(
    (id?: string) => {
      if (id && id.startsWith('app-')) {
        navigate(`/dashboard/develop/edit/${id}`)
        return
      }
      navigate('/dashboard/develop/edit')
    },
    [navigate],
  )

  const openCreate = useCallback(() => {
    navigate('/dashboard/develop/create')
  }, [navigate])

  return (
    <div className="agrocloud-dashboards page page-tight">
      <header className="agrocloud-dashboards__topnav">
        <div className="agrocloud-dashboards__brand">
          <span className="agrocloud-dashboards__brand-icon" aria-hidden>
            <i className="fa-solid fa-chart-column" />
          </span>
          <span className="agrocloud-dashboards__brand-text">{AGROCLOUD_PRODUCT_NAME}</span>
        </div>
      </header>

      <div className="agrocloud-dashboards__main">
        <h1 className="agrocloud-dashboards__org-title">{AGROCLOUD_DASHBOARD_ORG}</h1>

        <div className="agrocloud-dashboards__tabs-row">
          <div className="agrocloud-dashboards__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={`agrocloud-dashboards__tab${tab === 'mine' ? ' is-active' : ''}`}
              aria-selected={tab === 'mine'}
              onClick={() => setTab('mine')}
            >
              My dashboards
            </button>
            <button
              type="button"
              role="tab"
              className={`agrocloud-dashboards__tab${tab === 'shared' ? ' is-active' : ''}`}
              aria-selected={tab === 'shared'}
              onClick={() => setTab('shared')}
            >
              Shared dashboards
            </button>
          </div>
          <button type="button" className="agrocloud-dashboards__create-btn" onClick={openCreate}>
            Create dashboard
          </button>
        </div>

        <div className="agrocloud-dashboards__toolbar">
          <label className="agrocloud-dashboards__scope">
            <select value={scope} onChange={e => setScope(e.target.value)}>
              <option value="all">All my dashboards</option>
              <option value="saved">Saved apps only</option>
            </select>
            <i className="fa-solid fa-chevron-down" aria-hidden />
          </label>
          <label className="agrocloud-dashboards__search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input type="search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <button type="button" className="agrocloud-dashboards__tool-btn">
            <i className="fa-regular fa-clock" aria-hidden />
            Most Recent
          </button>
          <button type="button" className="agrocloud-dashboards__tool-btn">
            <i className="fa-solid fa-filter" aria-hidden />
            Filter by
          </button>
        </div>

        {tab === 'shared' ? (
          <div className="agrocloud-dashboards__empty-state">No shared dashboards yet.</div>
        ) : (
          <div className="agrocloud-dashboards__grid">
            {cards.map(card => (
              <article key={card.id} className="agrocloud-dashboards__card">
                <button
                  type="button"
                  className="agrocloud-dashboards__card-thumb-btn"
                  onClick={() => openEditor(card.portalAppId ?? card.id)}
                >
                  <div
                    className={[
                      'agrocloud-dashboards__card-thumb',
                      card.thumbnail === 'photo' ? 'agrocloud-dashboards__card-thumb--photo' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {card.thumbnail === 'placeholder' ? (
                      <div className="agrocloud-dashboards__thumb-placeholder" aria-hidden />
                    ) : null}
                  </div>
                </button>
                <h2 className="agrocloud-dashboards__card-title">{card.title}</h2>
                <p className="agrocloud-dashboards__card-meta">by {card.author}</p>
                <p className="agrocloud-dashboards__card-meta">Last update: {card.lastUpdate}</p>
                <div className="agrocloud-dashboards__card-footer">
                  <span className="agrocloud-dashboards__desktop-pill">
                    <i className="fa-solid fa-desktop" aria-hidden />
                    Desktop
                  </span>
                  <div className="agrocloud-dashboards__card-actions">
                    <button type="button" title="Share" aria-label="Share">
                      <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
                    </button>
                    <button
                      type="button"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() => openEditor(card.portalAppId ?? card.id)}
                    >
                      <i className="fa-solid fa-pen" aria-hidden />
                    </button>
                    <button type="button" title="Info" aria-label="Info">
                      <i className="fa-solid fa-circle-info" aria-hidden />
                    </button>
                    <button type="button" title="Delete" aria-label="Delete">
                      <i className="fa-solid fa-trash-can" aria-hidden />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
