import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import './GisContentItemPane.css'
import {
  defaultGisContentItemDescription,
  defaultGisContentItemTags,
  agroCloudDashboardEditPath,
  agroCloudDashboardWorkspacePath,
  gisContentLayerSubtypeLabel,
  gisContentTypeIcon,
  gisContentTypeTone,
  gisSharingIcon,
  gisSharingLabel,
  isAgroCloudDashboardApp,
  isGisPortalRowMapAddable,
  type GisContentSharing,
} from './gisContentPortalData'
import {
  isGisContentRowInRecycle,
  useGisContentPortal,
} from '../../lib/gisContentPortalStore'
import { gisContentPortalLayerUrl } from '../../lib/gisContentPortalTableUtils'
import { readGisHostedFeatureLayerSnapshot } from '../../lib/gisHostedFeatureLayerPortal'
import { CreateThumbnailModal } from './CreateThumbnailModal'
import { GisContentMapLayerPanel } from '../../components/gisContent/GisContentMapLayerPanel'

export const GIS_CONTENT_ITEM_PATH = '/master/gis-content/item'

export function gisContentItemPath(itemId: string): string {
  return `${GIS_CONTENT_ITEM_PATH}/${encodeURIComponent(itemId)}`
}

type ItemTab = 'overview' | 'data' | 'visualization' | 'usage' | 'settings'

const ITEM_TABS: { id: ItemTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'data', label: 'Data' },
  { id: 'visualization', label: 'Visualization' },
  { id: 'usage', label: 'Usage' },
  { id: 'settings', label: 'Settings' },
]

const SHARING_OPTIONS: GisContentSharing[] = ['private', 'shared', 'organization', 'public']

function CollapsibleSection({
  title,
  defaultOpen = true,
  editLabel,
  onEdit,
  children,
}: {
  title: string
  defaultOpen?: boolean
  editLabel?: string
  onEdit?: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="item-pane-section">
      <div className="item-pane-section__head">
        <div className="item-pane-section__head-left">
          <button
            type="button"
            className="item-pane-section__toggle"
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
          >
            <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'}`} aria-hidden />
          </button>
          <span>{title}</span>
        </div>
        {editLabel && onEdit ? (
          <button type="button" className="item-pane-section__edit-btn" onClick={onEdit}>
            <i className="fa-solid fa-pencil" aria-hidden />
            {editLabel}
          </button>
        ) : null}
      </div>
      {open ? <div className="item-pane-section__body">{children}</div> : null}
    </section>
  )
}

export default function GisContentItemPane() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const portal = useGisContentPortal()
  const [tab, setTab] = useState<ItemTab>('overview')
  const [toast, setToast] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [editingTags, setEditingTags] = useState(false)
  const [tagsDraft, setTagsDraft] = useState('')
  const [editingTerms, setEditingTerms] = useState(false)
  const [termsDraft, setTermsDraft] = useState('')
  const [editingAck, setEditingAck] = useState(false)
  const [ackDraft, setAckDraft] = useState('')
  const [moveFolderOpen, setMoveFolderOpen] = useState(false)
  const [viewCounted, setViewCounted] = useState(false)
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false)

  const row = itemId ? portal.getRowById(itemId) : undefined
  const details = itemId ? portal.getItemDetails(itemId) : {}
  const inRecycle = row ? isGisContentRowInRecycle(row) : false
  const isFavorite = itemId ? portal.favorites.has(itemId) : false

  const folderName = useMemo(() => {
    if (!row) return ''
    return portal.folders.find(f => f.id === row.folderId)?.name ?? row.folderId
  }, [portal.folders, row])

  const description = details.description ?? (row ? defaultGisContentItemDescription(row) : '')
  const tags = details.tags ?? (row ? defaultGisContentItemTags(row) : [])
  const viewCount =
    details.viewCount ?? (row ? 1200 + Number.parseInt(row.id, 10) * 47 : 0)
  const schemaUpdated = details.schemaUpdated ?? row?.modified ?? '—'
  const termsOfUse =
    details.termsOfUse ?? 'See Resource Constraints > legal constraints.'
  const acknowledgments = details.acknowledgments ?? 'No source acknowledged.'
  const hostedLayer = readGisHostedFeatureLayerSnapshot(details)
  const layerUrl = hostedLayer?.featureServiceUrl ?? (itemId ? gisContentPortalLayerUrl(itemId) : '')
  const operationalLayerUrl = hostedLayer?.layerUrl ?? layerUrl
  const thumbnailUrl = details.thumbnailDataUrl
  const sharePageUrl =
    typeof window !== 'undefined' && itemId
      ? `${window.location.origin}${window.location.pathname}#${gisContentItemPath(itemId)}`
      : ''

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    if (!itemId || viewCounted) return
    portal.incrementViewCount(itemId)
    setViewCounted(true)
  }, [itemId, portal, viewCounted])

  useEffect(() => {
    if (!row) return
    setTitleDraft(row.title)
    setDescriptionDraft(description)
    setTagsDraft(tags.join(', '))
    setTermsDraft(termsOfUse)
    setAckDraft(acknowledgments)
  }, [row?.id, row?.title, description, tags, termsOfUse, acknowledgments])

  if (!itemId) {
    return <Navigate to="/master/gis-content" replace />
  }

  if (!row) {
    return (
      <div className="item-pane-container w-full">
        <div className="item-pane-not-found">
          <p>Item not found.</p>
          <Link to="/master/gis-content" className="item-pane-btn item-pane-btn--green">
            Back to Content
          </Link>
        </div>
      </div>
    )
  }

  const saveTitle = () => {
    const trimmed = titleDraft.trim()
    if (!trimmed) {
      showToast('Title cannot be empty.')
      return
    }
    portal.updateRow(row.id, { title: trimmed })
    setEditingTitle(false)
    showToast('Title updated.')
  }

  const saveDescription = () => {
    portal.updateItemDetails(row.id, { description: descriptionDraft.trim() })
    setEditingDescription(false)
    showToast('Description saved.')
  }

  const saveTags = () => {
    const next = tagsDraft
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
    portal.updateItemDetails(row.id, { tags: next })
    setEditingTags(false)
    showToast('Tags updated.')
  }

  const saveTerms = () => {
    portal.updateItemDetails(row.id, { termsOfUse: termsDraft.trim() })
    setEditingTerms(false)
    showToast('Terms of use updated.')
  }

  const saveAck = () => {
    portal.updateItemDetails(row.id, { acknowledgments: ackDraft.trim() })
    setEditingAck(false)
    showToast('Acknowledgments updated.')
  }

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${label} copied.`)
    } catch {
      showToast(`Could not copy ${label.toLowerCase()}.`)
    }
  }

  const openMapViewer = () => {
    if (inRecycle) {
      showToast('Restore this item from Recycle bin first.')
      return
    }
    navigate(`/satellite/gis?content=${encodeURIComponent(row.id)}`)
  }

  const openSceneViewer = () => {
    if (inRecycle) {
      showToast('Restore this item from Recycle bin first.')
      return
    }
    navigate(`/satellite/indices?content=${encodeURIComponent(row.id)}`)
  }

  const isAppDashboard = isAgroCloudDashboardApp(row)

  const openDashboard = () => {
    if (inRecycle) {
      showToast('Restore this item from Recycle bin first.')
      return
    }
    navigate(agroCloudDashboardWorkspacePath(row.id))
  }

  const openEditDashboard = () => {
    if (inRecycle) {
      showToast('Restore this item from Recycle bin first.')
      return
    }
    navigate(agroCloudDashboardEditPath(row.id))
  }

  const viewMetadata = () => {
    document.getElementById('item-pane-metadata')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const openSatellite = () => {
    navigate(`/satellite/indices?content=${encodeURIComponent(row.id)}`)
  }

  const submitComment = () => {
    const added = portal.addItemComment(row.id, commentDraft)
    if (!added) return
    setCommentDraft('')
    showToast('Comment added.')
  }

  const moveToFolder = (folderId: string) => {
    const moved = portal.moveRowsToFolder([row.id], folderId)
    if (moved) {
      showToast(`Moved to "${portal.folders.find(f => f.id === folderId)?.name ?? folderId}".`)
      setMoveFolderOpen(false)
    }
  }

  const updateSharing = (sharing: GisContentSharing) => {
    portal.updateRow(row.id, { sharing })
    showToast(`Sharing set to ${gisSharingLabel(sharing)}.`)
  }

  const toggleFavorite = () => {
    portal.setFavorite(row.id, !isFavorite)
    showToast(isFavorite ? 'Removed from favorites.' : 'Added to favorites.')
  }

  const moveToRecycle = () => {
    const moved = portal.moveToRecycleBin(row.id)
    if (moved) {
      showToast(`"${row.title}" moved to Recycle bin.`)
      navigate('/master/gis-content')
    }
  }

  const restoreItem = () => {
    const restored = portal.restoreFromRecycleBin(row.id)
    if (restored) showToast('Item restored from Recycle bin.')
  }

  const renderOverview = () => (
    <div className="item-pane-main-panel">
      <section className="item-pane-hero-block">
        <div className="item-pane-hero">
          <div className="item-pane-hero__thumb-wrap">
            <button
              type="button"
              className="item-pane-hero__thumb-edit"
              aria-label="Edit thumbnail"
              title="Edit thumbnail"
              onClick={e => {
                e.stopPropagation()
                setThumbnailModalOpen(true)
              }}
            >
              <i className="fa-solid fa-pencil" aria-hidden />
            </button>
            <button
              type="button"
              className="item-pane-hero__thumb thumbnail-open-action"
              title={isAppDashboard ? 'Open dashboard' : 'Open in Map Viewer'}
              aria-label={isAppDashboard ? 'Open dashboard' : 'Open in Map Viewer'}
              disabled={inRecycle}
              onClick={isAppDashboard ? openDashboard : openMapViewer}
            >
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" className="item-pane-hero__thumb-img" />
              ) : (
                <i className={isAppDashboard ? 'fa-solid fa-chart-column' : 'fa-solid fa-map'} aria-hidden />
              )}
            </button>
          </div>
          <div className="item-pane-hero__content">
            <div className="item-pane-hero__title-row">
              <h2 className="item-pane-hero__title">{row.title}</h2>
              <button
                type="button"
                className="item-pane-section__edit-btn"
                aria-label="Edit title"
                onClick={() => setEditingTitle(true)}
              >
                <i className="fa-solid fa-pencil" aria-hidden />
              </button>
            </div>
            <p className="item-pane-hero__summary">{description}</p>
            <div className="item-pane-hero__meta">
              <span>
                <i className={gisContentTypeIcon(row.type)} aria-hidden />
                {row.typeLabel}
              </span>
              <span>
                Schema updated: {schemaUpdated}
                <i className="fa-solid fa-chevron-down" aria-hidden style={{ marginLeft: 4, fontSize: 10 }} />
              </span>
            </div>
          </div>
          <button
            type="button"
            className="item-pane-section__edit-btn"
            onClick={() => setEditingDescription(true)}
          >
            <i className="fa-solid fa-pencil" aria-hidden />
            Edit
          </button>
        </div>
      </section>

      <CollapsibleSection
        title="Description"
        editLabel="Edit"
        onEdit={() => setEditingDescription(true)}
      >
        {editingDescription ? (
          <div className="item-pane-inline-edit">
            <textarea value={descriptionDraft} onChange={e => setDescriptionDraft(e.target.value)} rows={4} />
            <div className="item-pane-inline-edit__actions">
              <button type="button" className="item-pane-btn" onClick={() => setEditingDescription(false)}>
                Cancel
              </button>
              <button type="button" className="item-pane-btn item-pane-btn--primary" onClick={saveDescription}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <p>{description}</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Layers">
        <button
          type="button"
          className="item-pane-layer-row"
          onClick={openMapViewer}
          disabled={inRecycle || !isGisPortalRowMapAddable(row.type)}
        >
          <span className={`item-pane-layer-row__icon ${gisContentTypeTone(row.type)}`}>
            <i className={gisContentTypeIcon(row.type)} aria-hidden />
          </span>
          <span className="item-pane-layer-row__text">
            <strong>{row.title}</strong>
            <span>{gisContentLayerSubtypeLabel(row.type)}</span>
          </span>
          <i className="fa-solid fa-chevron-right item-pane-layer-row__chev" aria-hidden />
        </button>
      </CollapsibleSection>

      <CollapsibleSection
        title="Terms of use"
        editLabel="Edit"
        onEdit={() => setEditingTerms(true)}
      >
        {editingTerms ? (
          <div className="item-pane-inline-edit">
            <textarea value={termsDraft} onChange={e => setTermsDraft(e.target.value)} rows={3} />
            <div className="item-pane-inline-edit__actions">
              <button type="button" className="item-pane-btn" onClick={() => setEditingTerms(false)}>
                Cancel
              </button>
              <button type="button" className="item-pane-btn item-pane-btn--primary" onClick={saveTerms}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="item-pane-section__edit-btn" onClick={() => setEditingTerms(true)}>
            {termsOfUse}
          </button>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Comments">
        <textarea
          className="item-pane-comment-box"
          placeholder="Leave a comment"
          value={commentDraft}
          onChange={e => setCommentDraft(e.target.value)}
        />
        <div className="item-pane-comment-actions">
          <button
            type="button"
            className="item-pane-btn item-pane-btn--primary"
            disabled={!commentDraft.trim()}
            onClick={submitComment}
          >
            Comment
          </button>
        </div>
        {(details.comments?.length ?? 0) > 0 ? (
          <ul className="item-pane-comment-list">
            {details.comments!.map(c => (
              <li key={c.id}>
                <time>{c.at}</time>
                {c.text}
              </li>
            ))}
          </ul>
        ) : null}
      </CollapsibleSection>
    </div>
  )

  const renderData = () => (
    <div className="item-pane-main-panel item-pane-tab-panel">
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Data</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--item-pane-muted)' }}>
        Source: {row.typeLabel} · Modified {row.modified}
      </p>
      <div className="item-pane-stat-grid">
        <div className="item-pane-stat">
          <strong>1</strong>
          <span>Layer</span>
        </div>
        <div className="item-pane-stat">
          <strong>{row.type === 'feature-layer' ? 'Polygon' : row.typeLabel}</strong>
          <span>Geometry type</span>
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="item-pane-btn item-pane-btn--primary" onClick={openMapViewer}>
          Open attribute table on map
        </button>
        <button type="button" className="item-pane-btn" onClick={() => copyText(layerUrl, 'Layer URL')}>
          Copy service URL
        </button>
      </div>
    </div>
  )

  const renderVisualization = () => (
    <div className="item-pane-main-panel item-pane-tab-panel">
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Map layer controls</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--item-pane-muted)' }}>
        Visibility, opacity, symbology, and scale range sync to Map Canvas and all dashboards from this
        central repository.
      </p>
      <GisContentMapLayerPanel
        itemId={row.id}
        title={row.title}
        mapAddable={isGisPortalRowMapAddable(row.type)}
        onToast={showToast}
      />
      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="item-pane-btn item-pane-btn--primary" onClick={openMapViewer}>
          Open in Map Viewer
        </button>
        <button type="button" className="item-pane-btn" onClick={openSatellite}>
          Open on Satellite page
        </button>
      </div>
    </div>
  )

  const renderUsage = () => (
    <div className="item-pane-main-panel item-pane-tab-panel">
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Usage</h3>
      <div className="item-pane-stat-grid">
        <div className="item-pane-stat">
          <strong>{viewCount.toLocaleString()}</strong>
          <span>Views</span>
        </div>
        <div className="item-pane-stat">
          <strong>{isFavorite ? 'Yes' : 'No'}</strong>
          <span>In favorites</span>
        </div>
      </div>
      <p style={{ marginTop: 16, color: 'var(--item-pane-muted)' }}>
        Last modified {row.modified}. Open on satellite or GIS map to track operational usage.
      </p>
      <button type="button" className="item-pane-btn item-pane-btn--green" style={{ marginTop: 12 }} onClick={openSatellite}>
        Open on Satellite page
      </button>
    </div>
  )

  const renderSettings = () => (
    <div className="item-pane-main-panel item-pane-tab-panel">
      <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Settings</h3>
      <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Sharing</label>
      <select
        className="item-pane-select"
        value={row.sharing}
        onChange={e => updateSharing(e.target.value as GisContentSharing)}
        style={{ marginBottom: 16 }}
      >
        {SHARING_OPTIONS.map(s => (
          <option key={s} value={s}>
            {gisSharingLabel(s)}
          </option>
        ))}
      </select>
      <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Folder</label>
      <select
        className="item-pane-select"
        value={row.folderId}
        onChange={e => moveToFolder(e.target.value)}
        style={{ marginBottom: 16 }}
      >
        {portal.folders
          .filter(f => f.id !== 'all' && f.id !== 'recycle')
          .map(f => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
      </select>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="item-pane-btn" onClick={toggleFavorite}>
          {isFavorite ? 'Remove favorite' : 'Add to favorites'}
        </button>
        {inRecycle ? (
          <button type="button" className="item-pane-btn item-pane-btn--green" onClick={restoreItem}>
            Restore from Recycle bin
          </button>
        ) : (
          <button type="button" className="item-pane-btn" onClick={moveToRecycle}>
            Move to Recycle bin
          </button>
        )}
      </div>
    </div>
  )

  const renderMain = () => {
    switch (tab) {
      case 'data':
        return renderData()
      case 'visualization':
        return renderVisualization()
      case 'usage':
        return renderUsage()
      case 'settings':
        return renderSettings()
      default:
        return renderOverview()
    }
  }

  const movableFolders = portal.folders.filter(f => f.id !== 'all' && f.id !== 'recycle')

  return (
    <div className="item-pane-container w-full" aria-label={`Item: ${row.title}`}>
      <header className="item-pane-header">
        <div className="item-pane-header__left">
          <button
            type="button"
            className="item-pane-header__back"
            aria-label="Back to Content"
            onClick={() => navigate('/master/gis-content')}
          >
            <i className="fa-solid fa-arrow-left" aria-hidden />
          </button>
          {editingTitle ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 0 }}>
              <input
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)' }}
              />
              <button type="button" className="item-pane-btn item-pane-btn--primary" onClick={saveTitle}>
                Save
              </button>
              <button type="button" className="item-pane-btn" onClick={() => setEditingTitle(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <h1 className="item-pane-header__title">{row.title}</h1>
              <button
                type="button"
                className="item-pane-header__edit"
                aria-label="Edit title"
                onClick={() => setEditingTitle(true)}
              >
                <i className="fa-solid fa-pencil" aria-hidden />
              </button>
            </>
          )}
        </div>
        <nav className="item-pane-header__tabs" role="tablist" aria-label="Item sections">
          {ITEM_TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`item-pane-header__tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="item-pane-body">
        <div className="item-pane-main">{renderMain()}</div>

        <aside className="item-pane-sidebar" aria-label="Item actions">
          <div className="item-pane-sidebar__actions">
            {isAppDashboard ? (
              <>
                <button
                  type="button"
                  className="item-pane-sidebar__action item-pane-sidebar__action--primary"
                  onClick={openDashboard}
                  disabled={inRecycle}
                >
                  Open dashboard
                </button>
                <button
                  type="button"
                  className="item-pane-sidebar__action"
                  onClick={openEditDashboard}
                  disabled={inRecycle}
                >
                  Edit dashboard
                </button>
                <button
                  type="button"
                  className="item-pane-sidebar__action"
                  onClick={() => copyText(sharePageUrl, 'Share link')}
                >
                  Share
                </button>
                <button type="button" className="item-pane-sidebar__action" onClick={viewMetadata}>
                  View metadata
                </button>
                <button type="button" className="item-pane-sidebar__action" onClick={toggleFavorite}>
                  <i className={`fa-${isFavorite ? 'solid' : 'regular'} fa-star`} aria-hidden />
                  {isFavorite ? 'Remove favorite' : 'Add to favorites'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="item-pane-sidebar__action item-pane-sidebar__action--primary"
                  onClick={openMapViewer}
                  disabled={inRecycle}
                >
                  Open in Map Viewer
                </button>
                <button
                  type="button"
                  className="item-pane-sidebar__action"
                  onClick={openSceneViewer}
                  disabled={inRecycle}
                >
                  Open in Scene Viewer
                </button>
                <button
                  type="button"
                  className="item-pane-sidebar__action"
                  onClick={() => copyText(sharePageUrl, 'Share link')}
                >
                  <i className="fa-solid fa-share-nodes" aria-hidden />
                  Share
                </button>
                {isGisPortalRowMapAddable(row.type) && !inRecycle ? (
                  <button type="button" className="item-pane-sidebar__action" onClick={openMapViewer}>
                    Add to current map
                  </button>
                ) : null}
              </>
            )}
          </div>

          <div className="item-pane-sidebar__block">
            <div className="item-pane-sidebar__label">
              <span>Owner</span>
              <button type="button" className="item-pane-section__edit-btn" onClick={() => showToast('Owner managed by organization admin.')}>
                Edit
              </button>
            </div>
            <div className="item-pane-sidebar__owner">
              <span className="item-pane-sidebar__owner-avatar">
                <i className="fa-solid fa-user" aria-hidden />
              </span>
              <span className="item-pane-sidebar__owner-text">
                <strong>Elite Agro Projects LLC</strong>
                <span>agrocloud@eliteagro.com</span>
              </span>
            </div>
          </div>

          <div className="item-pane-sidebar__block" id="item-pane-metadata">
            <div className="item-pane-sidebar__label">
              <span>Details</span>
            </div>
            <p style={{ margin: '0 0 4px', fontSize: 12 }}>
              View count: {viewCount.toLocaleString()}
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--item-pane-muted)' }}>
              Source: {hostedLayer ? 'Hosted feature layer' : row.typeLabel}
            </p>
            <label style={{ fontSize: 11, color: 'var(--item-pane-muted)' }}>
              {hostedLayer ? 'Feature service (REST)' : 'URL'}
            </label>
            <div className="item-pane-url-field">
              <input readOnly value={layerUrl} aria-label="Feature service URL" />
              <button type="button" aria-label="Copy URL" onClick={() => copyText(layerUrl, 'URL')}>
                <i className="fa-solid fa-copy" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Open external"
                onClick={() => {
                  if (hostedLayer) window.open(layerUrl, '_blank', 'noopener,noreferrer')
                  else showToast('Live ArcGIS REST URL will be wired when backend is connected.')
                }}
              >
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
              </button>
            </div>
            {hostedLayer ? (
              <>
                <label style={{ fontSize: 11, color: 'var(--item-pane-muted)', marginTop: 8, display: 'block' }}>
                  Operational layer URL
                </label>
                <div className="item-pane-url-field">
                  <input readOnly value={operationalLayerUrl} aria-label="Operational layer URL" />
                  <button type="button" aria-label="Copy operational URL" onClick={() => copyText(operationalLayerUrl, 'Operational URL')}>
                    <i className="fa-solid fa-copy" aria-hidden />
                  </button>
                </div>
              </>
            ) : null}
          </div>

          <div className="item-pane-sidebar__block">
            <div className="item-pane-sidebar__label">
              <span>
                Item information
                <i className="fa-solid fa-circle-info" aria-hidden style={{ marginLeft: 4, fontSize: 11 }} />
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--item-pane-muted)' }}>
              <span>Low</span>
              <span>High</span>
            </div>
            <div className="item-pane-info-bar">
              <div className="item-pane-info-bar__fill" />
            </div>
            <p style={{ margin: '8px 0', fontSize: 12 }}>
              <i className="fa-solid fa-lightbulb" aria-hidden style={{ color: '#f59e0b', marginRight: 6 }} />
              Top improvement:{' '}
              <button type="button" className="item-pane-section__edit-btn" onClick={() => setEditingDescription(true)}>
                Add a longer description
              </button>
            </p>
          </div>

          <div className="item-pane-sidebar__block">
            <div className="item-pane-sidebar__label">
              <span>Tags</span>
              <button type="button" className="item-pane-section__edit-btn" onClick={() => setEditingTags(true)}>
                Edit
              </button>
            </div>
            {editingTags ? (
              <div className="item-pane-inline-edit">
                <input
                  value={tagsDraft}
                  onChange={e => setTagsDraft(e.target.value)}
                  placeholder="Comma-separated tags"
                />
                <div className="item-pane-inline-edit__actions">
                  <button type="button" className="item-pane-btn" onClick={() => setEditingTags(false)}>
                    Cancel
                  </button>
                  <button type="button" className="item-pane-btn item-pane-btn--primary" onClick={saveTags}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="item-pane-tags">
                {tags.map(tag => (
                  <button key={tag} type="button" className="item-pane-tag" onClick={() => setEditingTags(true)}>
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="item-pane-sidebar__block">
            <div className="item-pane-sidebar__label">
              <span>Sharing</span>
              <button type="button" className="item-pane-section__edit-btn" onClick={() => setTab('settings')}>
                Edit
              </button>
            </div>
            <span className="item-pane-sharing-badge">
              <i className={gisSharingIcon(row.sharing)} aria-hidden />
              {gisSharingLabel(row.sharing)}
              {row.sharing === 'public' ? ' (public)' : ''}
            </span>
          </div>

          <div className="item-pane-sidebar__block">
            <div className="item-pane-sidebar__label">
              <span>Folder</span>
              <button type="button" className="item-pane-section__edit-btn" onClick={() => setMoveFolderOpen(o => !o)}>
                Move
              </button>
            </div>
            <span className="item-pane-folder-row">
              <i className="fa-solid fa-folder" aria-hidden />
              {folderName}
            </span>
            {moveFolderOpen ? (
              <select
                className="item-pane-select"
                style={{ marginTop: 8 }}
                value={row.folderId}
                onChange={e => moveToFolder(e.target.value)}
              >
                {movableFolders.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="item-pane-sidebar__block">
            <div className="item-pane-sidebar__label">
              <span>Acknowledgments</span>
              <button type="button" className="item-pane-section__edit-btn" onClick={() => setEditingAck(true)}>
                Edit
              </button>
            </div>
            {editingAck ? (
              <div className="item-pane-inline-edit">
                <input value={ackDraft} onChange={e => setAckDraft(e.target.value)} />
                <div className="item-pane-inline-edit__actions">
                  <button type="button" className="item-pane-btn" onClick={() => setEditingAck(false)}>
                    Cancel
                  </button>
                  <button type="button" className="item-pane-btn item-pane-btn--primary" onClick={saveAck}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12 }}>{acknowledgments}</p>
            )}
          </div>

          <div className="item-pane-sidebar__block">
            <div className="item-pane-sidebar__label">
              <span>Help</span>
            </div>
            <a
              href="https://doc.arcgis.com/en/arcgis-online/manage-data/host-feature-layers.htm"
              target="_blank"
              rel="noopener noreferrer"
              className="item-pane-section__edit-btn"
              style={{ display: 'block', marginBottom: 6 }}
            >
              Feature layers
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden style={{ marginLeft: 4 }} />
            </a>
            <a
              href="https://developers.arcgis.com/rest/services-reference/enterprise/feature-service/"
              target="_blank"
              rel="noopener noreferrer"
              className="item-pane-section__edit-btn"
            >
              Feature layers (developer)
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden style={{ marginLeft: 4 }} />
            </a>
          </div>
        </aside>
      </div>

      {toast ? (
        <div className="item-pane-toast" role="status">
          {toast}
        </div>
      ) : null}

      <CreateThumbnailModal
        open={thumbnailModalOpen}
        initialThumbnail={thumbnailUrl}
        onClose={() => setThumbnailModalOpen(false)}
        onSave={dataUrl => {
          portal.updateItemDetails(row.id, { thumbnailDataUrl: dataUrl })
          setThumbnailModalOpen(false)
          showToast('Thumbnail saved.')
        }}
        onCreateFromMap={() => {
          setThumbnailModalOpen(false)
          openMapViewer()
          showToast('Set map extent and zoom, then capture a thumbnail from layer properties.')
        }}
      />
    </div>
  )
}
