import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type GisContentRow,
  type GisRowMenuAction,
} from '@/pages/master/gisContentPortalData';
import { gisContentItemPath } from '@/pages/master/GisContentItemPane';
import {
  isGisContentRowInRecycle,
  useGisContentPortal,
} from '@/lib/gisContentPortalStore';
import {
  applyGisContentSortSelect,
  filterAndSortGisContentRows,
  gisContentSortSelectFromKey,
  type GisContentSortDir,
  type GisContentSortKey,
  type GisContentViewMode,
} from '@/lib/gisContentPortalTableUtils';
import {
  GisContentPortalTableView,
  GisContentPortalToolbar,
} from '@/pages/master/GisContentPortalTableParts';

export type GisPortalBrowseLayersPanelProps = {
  onAddRow: (row: GisContentRow) => void;
  addingRowId?: string | null;
  statusMessage?: string;
};

export function GisPortalBrowseLayersPanel({
  onAddRow,
  addingRowId = null,
  statusMessage,
}: GisPortalBrowseLayersPanelProps) {
  const navigate = useNavigate();
  const portal = useGisContentPortal();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<GisContentSortKey>('modified');
  const [sortDir, setSortDir] = useState<GisContentSortDir>('desc');
  const [sortSelect, setSortSelect] = useState('date-modified');
  const [viewMode, setViewMode] = useState<GisContentViewMode>('table');
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      filterAndSortGisContentRows({
        rows: portal.rows,
        folderId: 'all',
        topTab: 'my-content',
        favoriteIds: portal.favorites,
        searchQuery,
        itemTypeFilters: new Set(['layers']),
        sortKey,
        sortDir,
      }),
    [portal.rows, portal.favorites, searchQuery, sortKey, sortDir],
  );

  const rangeLabel = rows.length ? `1–${rows.length} of ${rows.length}` : '0 of 0';

  const allVisibleSelected = rows.length > 0 && rows.every(r => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        rows.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        rows.forEach(r => next.add(r.id));
        return next;
      });
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: GisContentSortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'title' || key === 'type' ? 'asc' : 'desc');
      setSortSelect(gisContentSortSelectFromKey(key));
    }
  };

  const onSortSelectChange = (value: string) => {
    setSortSelect(value);
    const next = applyGisContentSortSelect(value);
    setSortKey(next.sortKey);
    setSortDir(next.sortDir);
  };

  const handleMenuAction = useCallback(
    (action: GisRowMenuAction, row: GisContentRow) => {
      setOpenRowMenuId(null);
      if (isGisContentRowInRecycle(row)) return;

      if (action.id === 'view-details') {
        navigate(gisContentItemPath(row.id));
        return;
      }

      if (
        action.id === 'add-to-map' ||
        action.id === 'open-map-viewer' ||
        action.id === 'preview-on-map' ||
        action.id === 'open-attribute-table'
      ) {
        onAddRow(row);
        return;
      }

      if (action.id === 'open-scene-viewer') {
        navigate(`/satellite/indices?content=${encodeURIComponent(row.id)}`);
        return;
      }

      if (action.id === 'add-favorite') {
        portal.setFavorite(row.id, true);
        return;
      }
      if (action.id === 'remove-favorite') {
        portal.setFavorite(row.id, false);
      }
    },
    [navigate, onAddRow, portal],
  );

  const addSelectedToMap = () => {
    const picked = rows.filter(r => selectedIds.has(r.id));
    picked.forEach(r => onAddRow(r));
  };

  return (
    <div className="si-gis-portal-browse">
      <p className="si-gis-portal-browse__lead">
        Layers from <strong>GIS Content</strong> — same catalog and table actions as the Content portal.
      </p>
      <label className="si-gis-portal-browse__search">
        <i className="fa-solid fa-magnifying-glass" aria-hidden />
        <input
          type="search"
          placeholder="Search layers"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search GIS Content layers"
        />
      </label>
      <div className="si-gis-portal-browse__table-shell gis-portal-main">
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
              <button type="button" className="gis-portal-btn gis-portal-btn--compact" onClick={addSelectedToMap}>
                Add to map ({selectedIds.size})
              </button>
            ) : null
          }
        />
        <GisContentPortalTableView
          rows={rows}
          viewMode={viewMode}
          sortKey={sortKey}
          sortDir={sortDir}
          selectedIds={selectedIds}
          favoriteIds={portal.favorites}
          openRowMenuId={openRowMenuId}
          showSharing={false}
          isInRecycle={isGisContentRowInRecycle}
          primaryActionLabel={addingRowId ? 'Adding…' : 'Add'}
          onToggleSort={toggleSort}
          onToggleRow={toggleRow}
          onOpenRowMenu={setOpenRowMenuId}
          onOpenItem={row => navigate(gisContentItemPath(row.id))}
          onMenuAction={handleMenuAction}
        />
      </div>
      {statusMessage ? (
        <p className="si-gis-portal-browse__status" role="status">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}

export { gisPortalRowDemoGeoJson } from '@/pages/master/gisContentPortalData';
