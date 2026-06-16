import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './GisContent.css'
import '../../styles/gisModalSystem.css'
import {
  GIS_COLLAPSED_FILTER_SECTIONS,
  GIS_CONTENT_DEFAULT_OWNER,
  GIS_CREATE_APP_OPTIONS,
  GIS_CONTENT_SHARING_OPTIONS,
  GIS_ITEM_TYPE_FILTERS,
  GIS_NEW_ITEM_TYPES,
  GIS_PORTAL_TOP_TABS,
  gisContentFolderColorHex,
  isGisContentPortalManageableFolderId,
  type GisCreateAppOption,
  type GisContentFolderColor,
  type GisContentRow,
  type GisContentSharing,
  type GisPortalTopTab,
  type GisRowMenuAction,
  agroCloudDashboardEditPath,
  agroCloudDashboardWorkspacePath,
  isAgroCloudDashboardApp,
  isGisPortalRowMapAddable,
} from './gisContentPortalData'
import {
  isGisContentRowInRecycle,
  registerGisContentMapLayer,
  useGisContentPortal,
} from '../../lib/gisContentPortalStore'
import {
  applyGisContentSortSelect,
  filterAndSortGisContentRows,
  gisContentSortSelectFromKey,
  listGisContentPortalTagSuggestions,
  type GisContentSortDir,
  type GisContentSortKey,
  type GisContentViewMode,
} from '../../lib/gisContentPortalTableUtils'
import { GisContentPortalTableView, GisContentPortalToolbar } from './GisContentPortalTableParts'
import { GisContentBulkToolbar } from './GisContentBulkToolbar'
import { CreateFolderModal, type FolderModalSavePayload } from './CreateFolderModal'
import { gisContentItemPath } from './GisContentItemPane'
import { GisPortalFolderOptionsMenu } from './GisPortalFolderOptionsMenu'
import { MoveItemsModal } from './MoveItemsModal'
import { NewItemModal } from './NewItemModal'
import { ShareItemsModal } from './ShareItemsModal'
import { appConfirm, appPrompt } from '../../lib/appDialog'
import { publishGisContentNewItem, ensureDefaultGisContentPortalHostedLayers } from '../../lib/gisContentPortalPublish'

const PAGE_SIZE = 20

type SortKey = GisContentSortKey
type SortDir = GisContentSortDir

export default function GisContent() {
  const navigate = useNavigate()
  const portal = useGisContentPortal()

  useEffect(() => {
    document.title = 'GIS Content — Settings — Elite AgroCloud'
    ensureDefaultGisContentPortalHostedLayers()
    return () => {
      document.title = 'Elite AgroCloud'
    }
  }, [])
  const [topTab, setTopTab] = useState<GisPortalTopTab>('my-content')
  const [folderId, setFolderId] = useState('all')
  const [folderFilter, setFolderFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('modified')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [sortSelect, setSortSelect] = useState('date-modified')
  const [viewMode, setViewMode] = useState<GisContentViewMode>('table')
  const [itemTypeFilters, setItemTypeFilters] = useState<Set<string>>(new Set())
  const [tagQuery, setTagQuery] = useState('')
  const [sharingFilters, setSharingFilters] = useState<Set<GisContentSharing>>(new Set())
  const [deleteProtectionOnly, setDeleteProtectionOnly] = useState(false)
  const [statusFilters, setStatusFilters] = useState<Set<'published' | 'draft' | 'archived'>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [newItemOpen, setNewItemOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'edit'>('create')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [createFolderError, setCreateFolderError] = useState<string | null>(null)
  const [createAppOpen, setCreateAppOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareInitialSharing, setShareInitialSharing] = useState<GisContentSharing>('organization')
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveFolderId, setMoveFolderId] = useState('all')
  const createAppRef = useRef<HTMLDivElement>(null)

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleItemTypeFilter = (id: string) => {
    setItemTypeFilters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSharingFilter = (sharing: GisContentSharing) => {
    setSharingFilters(prev => {
      const next = new Set(prev)
      if (next.has(sharing)) next.delete(sharing)
      else next.add(sharing)
      return next
    })
  }

  const toggleStatusFilter = (status: 'published' | 'draft' | 'archived') => {
    setStatusFilters(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const filteredFolders = useMemo(() => {
    const q = folderFilter.trim().toLowerCase()
    if (!q) return portal.folders
    return portal.folders.filter(f => f.name.toLowerCase().includes(q))
  }, [portal.folders, folderFilter])

  const itemDetailsMap = portal.itemDetailsMap

  const tagSuggestions = useMemo(
    () => listGisContentPortalTagSuggestions(portal.rows, itemDetailsMap),
    [portal.rows, itemDetailsMap],
  )

  const activeMapLayerCount = useMemo(
    () => portal.getMapRegistry().activeItemIds.length,
    [portal.version],
  )

  const filteredRows = useMemo(
    () =>
      filterAndSortGisContentRows({
        rows: portal.rows,
        folderId: topTab === 'favorites' ? 'all' : folderId,
        topTab,
        favoriteIds: portal.favorites,
        searchQuery,
        itemTypeFilters,
        sortKey,
        sortDir,
        itemDetails: itemDetailsMap,
        tagQuery,
        sharingFilters,
        deleteProtectionOnly,
        statusFilters,
      }),
    [
      portal.rows,
      portal.favorites,
      folderId,
      topTab,
      searchQuery,
      itemTypeFilters,
      sortKey,
      sortDir,
      itemDetailsMap,
      tagQuery,
      sharingFilters,
      deleteProtectionOnly,
      statusFilters,
    ],
  )

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(null), 4000)
  }, [])

  const moveRowToRecycle = useCallback(
    (row: GisContentRow) => {
      if (row.deleteProtected) {
        showToast(`"${row.title}" has delete protection — disable it first.`)
        return
      }
      const moved = portal.moveToRecycleBin(row.id)
      if (!moved) return
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
      setOpenRowMenuId(null)
      showToast(`"${row.title}" moved to Recycle bin`)
    },
    [portal, showToast],
  )

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const permanentlyDeleteRow = useCallback(
    async (row: GisContentRow) => {
      const ok = await appConfirm(
        `Permanently delete "${row.title}"? This cannot be undone.`,
        { title: 'Delete permanently', danger: true, confirmLabel: 'Delete' },
      )
      if (!ok) return
      const removed = portal.permanentlyDeleteRows([row.id])
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
      showToast(
        removed > 0 ? `"${row.title}" permanently deleted.` : 'Item could not be deleted.',
      )
    },
    [portal, showToast],
  )

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.id))

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filteredRows.forEach(r => next.delete(r.id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filteredRows.forEach(r => next.add(r.id))
        return next
      })
    }
  }

  const toggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'title' || key === 'type' ? 'asc' : 'desc')
      setSortSelect(gisContentSortSelectFromKey(key))
    }
  }

  const onSortSelectChange = (value: string) => {
    setSortSelect(value)
    const next = applyGisContentSortSelect(value)
    setSortKey(next.sortKey)
    setSortDir(next.sortDir)
  }

  const addRowsToMap = useCallback(
    (rows: GisContentRow[]) => {
      const addable = rows.filter(r => isGisPortalRowMapAddable(r.type) && !isGisContentRowInRecycle(r))
      if (!addable.length) {
        showToast('No map layers selected — choose feature layers, web maps, or scenes.')
        return
      }
      addable.forEach(row => registerGisContentMapLayer(row.id))
      const first = addable[0]
      navigate(`/satellite/gis?content=${encodeURIComponent(first.id)}`)
      showToast(
        addable.length === 1
          ? `"${first.title}" synced to the map and all dashboards.`
          : `${addable.length} layers synced to the map and all dashboards.`,
      )
    },
    [navigate, showToast],
  )

  const closeCreateApp = useCallback(() => setCreateAppOpen(false), [])

  const handleCreateAppSelect = useCallback(
    (opt: GisCreateAppOption) => {
      closeCreateApp()
      if (!opt.href) return
      if (opt.external) {
        window.open(opt.href, '_blank', 'noopener,noreferrer')
        return
      }
      navigate(opt.href)
    },
    [closeCreateApp, navigate],
  )

  const handleCreateFolderSave = useCallback(
    ({ name, color }: FolderModalSavePayload) => {
      if (folderModalMode === 'edit' && editingFolderId) {
        const result = portal.updateFolder(editingFolderId, { name, color })
        if ('error' in result) {
          setCreateFolderError(result.error)
          return
        }
        setCreateFolderOpen(false)
        setCreateFolderError(null)
        setEditingFolderId(null)
        setFolderModalMode('create')
        showToast(`Folder "${result.folder.name}" updated.`)
        return
      }

      const result = portal.createFolder(name, color)
      if ('error' in result) {
        setCreateFolderError(result.error)
        return
      }
      const { folder } = result
      const moved =
        selectedIds.size > 0
          ? portal.moveRowsToFolder(Array.from(selectedIds), folder.id)
          : 0
      setCreateFolderOpen(false)
      setCreateFolderError(null)
      setFolderId(folder.id)
      setSelectedIds(new Set())
      showToast(
        moved > 0
          ? `Folder "${folder.name}" created — ${moved} layer${moved === 1 ? '' : 's'} saved inside.`
          : `Folder "${folder.name}" created.`,
      )
    },
    [editingFolderId, folderModalMode, portal, selectedIds, showToast],
  )

  const openCreateFolderModal = useCallback(() => {
    setCreateFolderError(null)
    setFolderModalMode('create')
    setEditingFolderId(null)
    setCreateFolderOpen(true)
  }, [])

  const openEditFolderModal = useCallback(
    (targetFolderId: string) => {
      if (!isGisContentPortalManageableFolderId(targetFolderId)) return
      const folder = portal.folders.find(f => f.id === targetFolderId)
      if (!folder) return
      setCreateFolderError(null)
      setFolderModalMode('edit')
      setEditingFolderId(folder.id)
      setCreateFolderOpen(true)
    },
    [portal.folders],
  )

  const handleDeleteFolder = useCallback(
    async (targetFolderId: string) => {
      if (!isGisContentPortalManageableFolderId(targetFolderId)) {
        showToast('This folder cannot be deleted.')
        return
      }
      const folder = portal.folders.find(f => f.id === targetFolderId)
      if (!folder) return
      const ok = await appConfirm(`Delete folder "${folder.name}"? Items inside will move to All my content.`, {
        title: 'Delete folder',
        danger: true,
        confirmLabel: 'Delete',
      })
      if (!ok) return
      const result = portal.deleteFolder(targetFolderId)
      if ('error' in result) {
        showToast(result.error)
        return
      }
      setFolderId('all')
      showToast(`Folder "${folder.name}" deleted.`)
    },
    [portal, showToast],
  )

  const editingFolder = editingFolderId ? portal.folders.find(f => f.id === editingFolderId) : undefined

  useEffect(() => {
    if (!createAppOpen) return
    const onDoc = (e: MouseEvent) => {
      if (createAppRef.current && !createAppRef.current.contains(e.target as Node)) {
        closeCreateApp()
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [createAppOpen, closeCreateApp])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNewItemOpen(false)
        setCreateFolderOpen(false)
        setCreateFolderError(null)
        closeCreateApp()
        setOpenRowMenuId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeCreateApp])

  const handleRowMenuAction = useCallback(
    (action: GisRowMenuAction, row: GisContentRow) => {
      setOpenRowMenuId(null)
      if (
        isGisContentRowInRecycle(row) &&
        action.id !== 'restore-item' &&
        action.id !== 'delete-permanently' &&
        action.id !== 'view-details'
      ) {
        showToast(`"${row.title}" is in the Recycle bin — restore it to use this action.`)
        return
      }
      switch (action.id) {
        case 'view-details':
          navigate(gisContentItemPath(row.id))
          break
        case 'open-map-viewer':
        case 'preview-on-map':
        case 'open-attribute-table':
        case 'add-to-map':
          navigate(`/satellite/gis?content=${encodeURIComponent(row.id)}`)
          break
        case 'open-scene-viewer':
          navigate(`/satellite/indices?content=${encodeURIComponent(row.id)}`)
          break
        case 'open-field-maps':
          navigate(`/satellite/indices?content=${encodeURIComponent(row.id)}&mode=field-maps`)
          break
        case 'open-dashboard':
          if (isAgroCloudDashboardApp(row)) {
            navigate(agroCloudDashboardWorkspacePath(row.id))
          } else {
            navigate(`/satellite/indices?content=${encodeURIComponent(row.id)}`)
          }
          break
        case 'edit-dashboard':
          if (isAgroCloudDashboardApp(row)) {
            navigate(agroCloudDashboardEditPath(row.id))
          } else {
            navigate(gisContentItemPath(row.id))
            showToast(`"${row.title}" — ${action.label}`)
          }
          break
        case 'share': {
          const shareUrl =
            typeof window !== 'undefined'
              ? `${window.location.origin}${window.location.pathname}#${gisContentItemPath(row.id)}`
              : ''
          if (shareUrl && navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(shareUrl).then(
              () => showToast(`Share link copied for "${row.title}".`),
              () => showToast('Could not copy share link.'),
            )
          } else {
            showToast(`Share link: ${shareUrl || gisContentItemPath(row.id)}`)
          }
          break
        }
        case 'open-application':
        case 'configure-app':
        case 'open-notebook':
        case 'run-tool':
          navigate(`/satellite/indices?content=${encodeURIComponent(row.id)}`)
          break
        case 'download-file':
        case 'export-layer':
        case 'view-metadata':
        case 'edit-style':
        case 'manage-sharing':
          navigate(gisContentItemPath(row.id))
          showToast(`"${row.title}" — ${action.label}`)
          break
        case 'add-favorite':
          portal.setFavorite(row.id, true)
          showToast(`Added "${row.title}" to favorites`)
          break
        case 'remove-favorite':
          portal.setFavorite(row.id, false)
          showToast(`Removed "${row.title}" from favorites`)
          break
        case 'move-recycle':
        case 'delete-item':
          moveRowToRecycle(row)
          break
        case 'restore-item': {
          const restored = portal.restoreFromRecycleBin(row.id)
          if (restored) showToast(`"${row.title}" restored from Recycle bin`)
          break
        }
        case 'delete-permanently':
          void permanentlyDeleteRow(row)
          break
        default:
          break
      }
    },
    [moveRowToRecycle, navigate, permanentlyDeleteRow, portal, showToast],
  )

  const selectedRows = useMemo(
    () => filteredRows.filter(r => selectedIds.has(r.id)),
    [filteredRows, selectedIds],
  )

  const openBulkShare = useCallback(() => {
    const first = selectedRows[0]
    setShareInitialSharing(first?.sharing ?? 'organization')
    setShareModalOpen(true)
  }, [selectedRows])

  const applyBulkShare = useCallback(
    (sharing: GisContentSharing) => {
      const ids = Array.from(selectedIds)
      const updated = portal.bulkUpdateRows(ids, { sharing })
      setShareModalOpen(false)
      showToast(`Sharing updated for ${updated} item${updated === 1 ? '' : 's'}.`)
    },
    [portal, selectedIds, showToast],
  )

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return

    const allInRecycle = selectedRows.every(r => isGisContentRowInRecycle(r))
    if (allInRecycle) {
      const ok = await appConfirm(
        `Permanently delete ${ids.length} item${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
        { title: 'Delete permanently', danger: true, confirmLabel: 'Delete' },
      )
      if (!ok) return
      const removed = portal.permanentlyDeleteRows(ids)
      clearSelection()
      showToast(
        removed > 0
          ? `Permanently deleted ${removed} item${removed === 1 ? '' : 's'}.`
          : 'No items were deleted.',
      )
      return
    }

    const deletable = selectedRows.filter(r => !r.deleteProtected && !isGisContentRowInRecycle(r))
    if (!deletable.length) {
      showToast('Selected items have delete protection enabled.')
      return
    }

    const ok = await appConfirm(
      `Move ${deletable.length} item${deletable.length === 1 ? '' : 's'} to Recycle bin?`,
      { title: 'Delete items', danger: true, confirmLabel: 'Delete' },
    )
    if (!ok) return

    const { moved, skippedProtected } = portal.moveRowsToRecycleBin(ids)
    clearSelection()
    if (moved > 0 && skippedProtected > 0) {
      showToast(
        `${moved} item${moved === 1 ? '' : 's'} moved to Recycle bin. ${skippedProtected} skipped (delete protection).`,
      )
    } else if (moved > 0) {
      showToast(`${moved} item${moved === 1 ? '' : 's'} moved to Recycle bin.`)
    } else if (skippedProtected > 0) {
      showToast('Selected items have delete protection enabled.')
    }
  }, [clearSelection, portal, selectedIds, selectedRows, showToast])

  const openBulkMove = useCallback(() => {
    const firstMovable = portal.folders.find(f => f.id !== 'all' && f.id !== 'recycle')
    setMoveFolderId(firstMovable?.id ?? 'all')
    setMoveModalOpen(true)
  }, [portal.folders])

  const applyBulkMove = useCallback(() => {
    const ids = Array.from(selectedIds)
    const restoring = selectedRows.some(r => isGisContentRowInRecycle(r))
    const moved = portal.moveRowsToFolder(ids, moveFolderId)
    setMoveModalOpen(false)
    clearSelection()
    if (moved > 0) {
      if (!restoring) setFolderId(moveFolderId)
      const folderName = portal.folders.find(f => f.id === moveFolderId)?.name ?? 'folder'
      showToast(
        restoring
          ? `Restored ${moved} item${moved === 1 ? '' : 's'} to ${folderName}.`
          : `Moved ${moved} item${moved === 1 ? '' : 's'}.`,
      )
    } else {
      showToast(
        restoring ? 'No items were restored.' : 'No items were moved — check folder selection.',
      )
    }
  }, [clearSelection, moveFolderId, portal, selectedIds, selectedRows, showToast])

  const handleBulkRestore = useCallback(() => {
    const ids = Array.from(selectedIds)
    let restored = 0
    for (const id of ids) {
      if (portal.restoreFromRecycleBin(id)) restored += 1
    }
    clearSelection()
    showToast(
      restored > 0
        ? `Restored ${restored} item${restored === 1 ? '' : 's'} to their original folders.`
        : 'No items were restored.',
    )
  }, [clearSelection, portal, selectedIds, showToast])

  const handleBulkChangeOwner = useCallback(async () => {
    const defaultOwner = selectedRows[0]?.owner ?? GIS_CONTENT_DEFAULT_OWNER
    const next = await appPrompt('Enter the new owner name:', defaultOwner, { title: 'Change owner' })
    if (next === null) return
    const owner = next.trim()
    if (!owner) return
    const updated = portal.bulkUpdateRows(Array.from(selectedIds), { owner })
    showToast(`Owner updated for ${updated} item${updated === 1 ? '' : 's'}.`)
  }, [portal, selectedIds, selectedRows, showToast])

  const handleEnableDeleteProtection = useCallback(() => {
    const updated = portal.bulkUpdateRows(Array.from(selectedIds), { deleteProtected: true })
    showToast(`Delete protection enabled for ${updated} item${updated === 1 ? '' : 's'}.`)
  }, [portal, selectedIds, showToast])

  const handleDisableDeleteProtection = useCallback(() => {
    const updated = portal.bulkUpdateRows(Array.from(selectedIds), { deleteProtected: false })
    showToast(`Delete protection disabled for ${updated} item${updated === 1 ? '' : 's'}.`)
  }, [portal, selectedIds, showToast])

  const rangeLabel = selectedIds.size
    ? `${selectedIds.size} selected`
    : filteredRows.length
      ? `1–${Math.min(PAGE_SIZE, filteredRows.length)} of ${filteredRows.length}`
      : '0 of 0'

  const renderTable = () => (
    <>
      <GisContentPortalToolbar
        viewMode={viewMode}
        sortSelect={sortSelect}
        rangeLabel={rangeLabel}
        allVisibleSelected={allVisibleSelected}
        onViewModeChange={setViewMode}
        onSortSelectChange={onSortSelectChange}
        onToggleSelectAll={toggleSelectAll}
        bulkActions={
          selectedIds.size > 0 ? (
            <GisContentBulkToolbar
              selectedRows={selectedRows}
              folders={portal.folders}
              onShare={openBulkShare}
              onDelete={() => void handleBulkDelete()}
              onMove={openBulkMove}
              onRestore={handleBulkRestore}
              onChangeOwner={() => void handleBulkChangeOwner()}
              onEnableDeleteProtection={handleEnableDeleteProtection}
              onDisableDeleteProtection={handleDisableDeleteProtection}
              onAddToMap={() => addRowsToMap(selectedRows)}
            />
          ) : null
        }
      />
      <GisContentPortalTableView
        rows={filteredRows}
        viewMode={viewMode}
        sortKey={sortKey}
        sortDir={sortDir}
        selectedIds={selectedIds}
        favoriteIds={portal.favorites}
        openRowMenuId={openRowMenuId}
        isInRecycle={isGisContentRowInRecycle}
        onOpenItem={row => navigate(gisContentItemPath(row.id))}
        onToggleSort={toggleSort}
        onToggleRow={toggleRow}
        onOpenRowMenu={setOpenRowMenuId}
        onMenuAction={handleRowMenuAction}
      />
    </>
  )

  return (
    <main className="gis-portal-page" aria-label="GIS Content">
      <nav className="gis-portal-topnav" aria-label="Content navigation">
        <div className="gis-portal-topnav__brand">GIS Content</div>
        <div className="gis-portal-topnav__tabs" role="tablist">
          {GIS_PORTAL_TOP_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={topTab === tab.id}
              className={`gis-portal-topnav__tab${topTab === tab.id ? ' active' : ''}`}
              onClick={() => setTopTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="gis-portal-hub-banner" role="status">
        <div className="gis-portal-hub-banner__icon" aria-hidden>
          <i className="fa-solid fa-database" />
        </div>
        <div className="gis-portal-hub-banner__body">
          <strong>Central GIS Repository</strong>
          <p>
            Save, organize, and control all geographic layers here. Changes sync instantly to Map Canvas,
            Intelligence Dashboard, Satellite Intelligence, AOI tools, and remote sensing layers.
          </p>
        </div>
        <div className="gis-portal-hub-banner__stats">
          <span>{portal.rows.filter(r => !isGisContentRowInRecycle(r)).length} items</span>
          <span>{activeMapLayerCount} on map</span>
        </div>
      </div>

      <div className="gis-portal-actionbar">
        <div className="gis-portal-actionbar__left">
          <button
            type="button"
            className="gis-portal-btn"
            data-testid="gis-portal-new-item-btn"
            onClick={() => setNewItemOpen(true)}
          >
            <i className="fa-solid fa-plus" aria-hidden />
            <span>New item</span>
          </button>
          <div className="gis-portal-create-app-wrap" ref={createAppRef}>
            <button
              type="button"
              className={`gis-portal-btn${createAppOpen ? ' gis-portal-btn--menu-open' : ''}`}
              aria-expanded={createAppOpen}
              aria-haspopup="menu"
              aria-controls="gis-portal-create-app-menu"
              onClick={() => setCreateAppOpen(o => !o)}
            >
              <i className="fa-solid fa-table-cells" aria-hidden />
              Create app
            </button>
            {createAppOpen ? (
              <div className="gis-portal-create-menu" id="gis-portal-create-app-menu" role="menu">
                {GIS_CREATE_APP_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitem"
                    className="gis-portal-create-menu__item"
                    onClick={() => handleCreateAppSelect(opt)}
                  >
                    <span
                      className={[
                        'gis-portal-create-menu__icon',
                        opt.iconTone ? `gis-portal-create-menu__icon--${opt.iconTone}` : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <i className={opt.icon} aria-hidden />
                    </span>
                    <span className="gis-portal-create-menu__text">
                      <span className="gis-portal-create-menu__title">
                        {opt.title}
                        {opt.external ? (
                          <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden style={{ fontSize: 10 }} />
                        ) : null}
                      </span>
                      <span className="gis-portal-create-menu__desc">{opt.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <label className="gis-portal-actionbar__search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
          <input
            type="search"
            placeholder="Search all my content"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="gis-portal-body">
        <aside className="gis-portal-sidebar" aria-label="Folders and filters">
          <section className="gis-portal-sidebar__section">
            <div className="gis-portal-sidebar__head">
              <span>Folders</span>
              <div className="gis-portal-folder-head-actions">
                <button
                  type="button"
                  className="gis-portal-folder-add-btn"
                  title="Create folder"
                  aria-label="Create folder"
                  data-testid="gis-portal-create-folder-btn"
                  onClick={openCreateFolderModal}
                >
                  <i className="fa-solid fa-folder" aria-hidden />
                  <i className="fa-solid fa-plus gis-portal-folder-add-btn__plus" aria-hidden />
                </button>
              </div>
            </div>
            <input
              type="search"
              className="gis-portal-folder-search"
              placeholder="Filter folders"
              value={folderFilter}
              onChange={e => setFolderFilter(e.target.value)}
            />
            <ul className="gis-portal-folder-tree">
              {filteredFolders.map(folder => {
                const isManageableFolder = isGisContentPortalManageableFolderId(folder.id)
                return (
                  <li key={folder.id} className="gis-portal-folder-tree__row">
                    <button
                      type="button"
                      className={`gis-portal-folder-tree__folder-btn${folderId === folder.id ? ' active' : ''}`}
                      onClick={() => setFolderId(folder.id)}
                    >
                      {folder.id !== 'all' ? (
                        <i
                          className="fa-solid fa-folder"
                          aria-hidden
                          style={{
                            opacity: 0.85,
                            fontSize: 12,
                            color: gisContentFolderColorHex(folder.color),
                          }}
                        />
                      ) : null}
                      <span className="gis-portal-folder-tree__label">{folder.name}</span>
                    </button>
                    {isManageableFolder ? (
                      <GisPortalFolderOptionsMenu
                        canEditFolder
                        testId={`gis-portal-folder-options-${folder.id}`}
                        onEdit={() => openEditFolderModal(folder.id)}
                        onDelete={() => void handleDeleteFolder(folder.id)}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="gis-portal-sidebar__section">
            <div className="gis-portal-sidebar__head">
              <span>Filters</span>
            </div>

            <div className="gis-portal-filter-group">
              <button
                type="button"
                className="gis-portal-filter-group__toggle"
                aria-expanded={expandedSections['item-type']}
                onClick={() => toggleSection('item-type')}
              >
                <i
                  className={`fa-solid fa-chevron-${expandedSections['item-type'] ? 'down' : 'right'}`}
                  aria-hidden
                />
                Item type
              </button>
              {expandedSections['item-type'] ? (
                <ul className="gis-portal-filter-list">
                  {GIS_ITEM_TYPE_FILTERS.map(f => (
                    <li key={f.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={itemTypeFilters.has(f.id)}
                          onChange={() => toggleItemTypeFilter(f.id)}
                        />
                        {f.label}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="gis-portal-filter-group">
              <button
                type="button"
                className="gis-portal-filter-group__toggle"
                aria-expanded={expandedSections.categories}
                onClick={() => toggleSection('categories')}
              >
                <i
                  className={`fa-solid fa-chevron-${expandedSections.categories ? 'down' : 'right'}`}
                  aria-hidden
                />
                Categories
              </button>
              {expandedSections.categories ? (
                <>
                  <p className="gis-portal-categories-empty">No categories yet</p>
                  <button type="button" className="gis-portal-link-btn">
                    Set up content categories
                  </button>
                </>
              ) : null}
            </div>

            {GIS_COLLAPSED_FILTER_SECTIONS.map(section => (
              <div key={section.id} className="gis-portal-filter-group">
                <button
                  type="button"
                  className={`gis-portal-filter-group__toggle${
                    (section.id === 'date-modified' && sortSelect === 'date-modified') ||
                    (section.id === 'date-created' && sortSelect === 'date-created') ||
                    (section.id === 'tags' && tagQuery.trim()) ||
                    (section.id === 'sharing' && sharingFilters.size > 0) ||
                    (section.id === 'status' && statusFilters.size > 0) ||
                    (section.id === 'delete-protection' && deleteProtectionOnly)
                      ? ' gis-portal-filter-group__toggle--active'
                      : ''
                  }`}
                  aria-expanded={!!expandedSections[section.id]}
                  onClick={() => {
                    toggleSection(section.id)
                    if (section.id === 'date-modified') onSortSelectChange('date-modified')
                    else if (section.id === 'date-created') onSortSelectChange('date-created')
                  }}
                >
                  <i
                    className={`fa-solid fa-chevron-${expandedSections[section.id] ? 'down' : 'right'}`}
                    aria-hidden
                  />
                  {section.label}
                </button>
                {expandedSections[section.id] && section.id === 'tags' ? (
                  <div className="gis-portal-filter-panel">
                    <input
                      type="search"
                      className="gis-portal-filter-panel__input"
                      placeholder="Filter by tag"
                      value={tagQuery}
                      onChange={e => setTagQuery(e.target.value)}
                      aria-label="Filter by tag"
                    />
                    {tagSuggestions.length ? (
                      <ul className="gis-portal-filter-list gis-portal-filter-list--tags">
                        {tagSuggestions.slice(0, 12).map(tag => (
                          <li key={tag}>
                            <button
                              type="button"
                              className="gis-portal-tag-chip"
                              onClick={() => setTagQuery(tag)}
                            >
                              {tag}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="gis-portal-categories-empty">No tags yet</p>
                    )}
                  </div>
                ) : null}
                {expandedSections[section.id] && section.id === 'sharing' ? (
                  <ul className="gis-portal-filter-list">
                    {GIS_CONTENT_SHARING_OPTIONS.map(opt => (
                      <li key={opt.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={sharingFilters.has(opt.id)}
                            onChange={() => toggleSharingFilter(opt.id)}
                          />
                          {opt.label}
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {expandedSections[section.id] && section.id === 'status' ? (
                  <ul className="gis-portal-filter-list">
                    {(['published', 'draft', 'archived'] as const).map(status => (
                      <li key={status}>
                        <label>
                          <input
                            type="checkbox"
                            checked={statusFilters.has(status)}
                            onChange={() => toggleStatusFilter(status)}
                          />
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {expandedSections[section.id] && section.id === 'delete-protection' ? (
                  <label className="gis-portal-filter-panel__check">
                    <input
                      type="checkbox"
                      checked={deleteProtectionOnly}
                      onChange={e => setDeleteProtectionOnly(e.target.checked)}
                    />
                    Only items with delete protection
                  </label>
                ) : null}
              </div>
            ))}
          </section>
        </aside>

        <section className="gis-portal-main" aria-label="Content list">
          {topTab === 'my-content' || topTab === 'favorites' ? (
            renderTable()
          ) : (
            <div className="gis-portal-placeholder">
              <p>
                <strong>{GIS_PORTAL_TOP_TABS.find(t => t.id === topTab)?.label}</strong> — browse and
                manage items here (UI shell ready; connect your organization catalog when backend is
                available).
              </p>
            </div>
          )}
        </section>
      </div>

      <CreateFolderModal
        open={createFolderOpen}
        mode={folderModalMode}
        initialName={editingFolder?.name ?? ''}
        initialColor={(editingFolder?.color ?? 'default') as GisContentFolderColor}
        onClose={() => {
          setCreateFolderOpen(false)
          setCreateFolderError(null)
          setEditingFolderId(null)
          setFolderModalMode('create')
        }}
        onSave={handleCreateFolderSave}
        errorMessage={createFolderError}
      />
      <ShareItemsModal
        open={shareModalOpen}
        itemCount={selectedIds.size}
        initialSharing={shareInitialSharing}
        onClose={() => setShareModalOpen(false)}
        onApply={applyBulkShare}
      />
      <MoveItemsModal
        open={moveModalOpen}
        itemCount={selectedIds.size}
        folders={portal.folders}
        selectedFolderId={moveFolderId}
        onFolderChange={setMoveFolderId}
        onClose={() => setMoveModalOpen(false)}
        onMove={applyBulkMove}
      />
      <NewItemModal
        open={newItemOpen}
        onClose={() => setNewItemOpen(false)}
        onItemCreated={async payload => {
          try {
            const row = await publishGisContentNewItem(payload)
            showToast(`"${row.title}" saved to My content`)
          } catch (e) {
            showToast(e instanceof Error ? e.message : 'Could not save item to GIS Content.')
          }
        }}
      />
      {toastMessage ? (
        <div className="gis-portal-toast" role="status">
          {toastMessage}
        </div>
      ) : null}
    </main>
  )
}
