import { useMemo, useState } from 'react'
import type { NavGroupDef } from '../../../nav/navManifest'
import type { SystemSettingsPersistedV1 } from '../../../types/systemSettings'

type Props = {
  groupDef: NavGroupDef
  draft: SystemSettingsPersistedV1
  updateNavOverride: (id: string, patch: Partial<SystemSettingsPersistedV1['navOverrides'][string]>) => void
  reorderItem: (groupId: string, from: number, to: number) => void
}

export function NavGroupEditor({ groupDef, draft, updateNavOverride, reorderItem }: Props) {
  const [itemQuery, setItemQuery] = useState('')
  const itemIds = draft.navItemOrders[groupDef.id]?.length
    ? draft.navItemOrders[groupDef.id]
    : groupDef.children.map(c => c.id)
  const q = itemQuery.trim().toLowerCase()
  const visibleItemIds = useMemo(() => {
    if (!q) return itemIds
    return itemIds.filter(cid => {
      const leaf = groupDef.children.find(c => c.id === cid)
      if (!leaf) return false
      const ov = draft.navOverrides[leaf.id]
      return [
        leaf.id,
        leaf.path,
        leaf.i18nKey,
        ov?.labelEn ?? '',
        ov?.labelAr ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [draft.navOverrides, groupDef.children, itemIds, q])

  return (
    <div className="sys-nav-group-editor">
      <div className="sys-page-card__grid" style={{ marginBottom: 14 }}>
        <div className="sys-page-field">
          <label htmlFor={`nav-${groupDef.id}-en`}>Label EN override</label>
          <input
            id={`nav-${groupDef.id}-en`}
            className="gis-input"
            placeholder="Leave empty to use default translation"
            value={draft.navOverrides[groupDef.id]?.labelEn ?? ''}
            onChange={e => updateNavOverride(groupDef.id, { labelEn: e.target.value })}
          />
        </div>
        <div className="sys-page-field">
          <label htmlFor={`nav-${groupDef.id}-ar`}>Label AR override</label>
          <input
            id={`nav-${groupDef.id}-ar`}
            className="gis-input"
            placeholder="Leave empty to use default translation"
            value={draft.navOverrides[groupDef.id]?.labelAr ?? ''}
            onChange={e => updateNavOverride(groupDef.id, { labelAr: e.target.value })}
          />
        </div>
        <div className="sys-page-field">
          <label htmlFor={`nav-${groupDef.id}-icon`}>Group icon (Font Awesome)</label>
          <input
            id={`nav-${groupDef.id}-icon`}
            className="gis-input"
            placeholder="e.g. fa-solid fa-screwdriver-wrench"
            value={draft.navOverrides[groupDef.id]?.iconClass ?? ''}
            onChange={e => updateNavOverride(groupDef.id, { iconClass: e.target.value })}
          />
        </div>
      </div>
      <label className="sys-page-visible" style={{ marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={draft.navOverrides[groupDef.id]?.hidden === true}
          onChange={e => updateNavOverride(groupDef.id, { hidden: e.target.checked })}
        />
        Hide entire group in sidebar
      </label>

      <div className="sys-nav-items-head">
        <p
          style={{
            fontSize: '0.82rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ds-color-text-muted)',
            margin: 0,
          }}
        >
          Subitems (nav-item labels)
        </p>
        <span className="sys-nav-items-count">
          {visibleItemIds.length} / {itemIds.length}
        </span>
      </div>
      <label className="sys-nav-item-search" htmlFor={`nav-${groupDef.id}-item-search`}>
        <i className="fa-solid fa-magnifying-glass" aria-hidden />
        <input
          id={`nav-${groupDef.id}-item-search`}
          className="gis-input"
          placeholder="Search subitem by id, path, or label…"
          value={itemQuery}
          onChange={e => setItemQuery(e.target.value)}
        />
      </label>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {visibleItemIds.map(cid => {
          const ix = itemIds.indexOf(cid)
          const leaf = groupDef.children.find(c => c.id === cid)
          if (!leaf) return null
          const ov = draft.navOverrides[leaf.id]
          return (
            <li
              key={leaf.id}
              className="sys-nav-leaf-card"
              draggable
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/nav-item', String(ix))
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const from = Number(e.dataTransfer.getData('text/nav-item'))
                if (!Number.isFinite(from)) return
                reorderItem(groupDef.id, from, ix)
              }}
            >
              <div className="sys-nav-leaf-head">
                <div className="sys-nav-leaf-head__left">
                  <span className="sys-nav-leaf-handle" aria-hidden title="Drag to reorder">
                    <i className="fa-solid fa-grip-vertical" />
                  </span>
                  <div className="sys-nav-leaf-title-wrap">
                    <div className="sys-nav-leaf-title">{ov?.labelEn?.trim() || leaf.i18nKey}</div>
                    <div className="sys-nav-leaf-path">{leaf.path}</div>
                  </div>
                </div>
                <div className="sys-nav-leaf-actions">
                  <button
                    type="button"
                    className="gis-btn gis-btn-outline"
                    onClick={() => reorderItem(groupDef.id, ix, Math.max(0, ix - 1))}
                    disabled={ix <= 0}
                    title="Move up"
                    aria-label="Move item up"
                  >
                    <i className="fa-solid fa-arrow-up" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="gis-btn gis-btn-outline"
                    onClick={() => reorderItem(groupDef.id, ix, Math.min(itemIds.length - 1, ix + 1))}
                    disabled={ix >= itemIds.length - 1}
                    title="Move down"
                    aria-label="Move item down"
                  >
                    <i className="fa-solid fa-arrow-down" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="gis-btn gis-btn-outline"
                    onClick={() => updateNavOverride(leaf.id, { labelEn: '', labelAr: '' })}
                    title="Reset labels to default"
                    aria-label="Reset labels to default"
                  >
                    <i className="fa-solid fa-rotate-left" aria-hidden />
                  </button>
                </div>
              </div>
              <div className="sys-page-card__grid">
                <div className="sys-page-field">
                  <label htmlFor={`nav-leaf-${leaf.id}-en`}>Label EN</label>
                  <input
                    id={`nav-leaf-${leaf.id}-en`}
                    className="gis-input"
                    value={ov?.labelEn ?? ''}
                    onChange={e => updateNavOverride(leaf.id, { labelEn: e.target.value })}
                  />
                </div>
                <div className="sys-page-field">
                  <label htmlFor={`nav-leaf-${leaf.id}-ar`}>Label AR</label>
                  <input
                    id={`nav-leaf-${leaf.id}-ar`}
                    className="gis-input"
                    value={ov?.labelAr ?? ''}
                    onChange={e => updateNavOverride(leaf.id, { labelAr: e.target.value })}
                  />
                </div>
                <div className="sys-page-field">
                  <label htmlFor={`nav-leaf-${leaf.id}-icon`}>Icon class</label>
                  <div className="sys-page-iconrow">
                    <span className="sys-page-icon-preview" aria-hidden>
                      <i className={(ov?.iconClass?.trim() || leaf.defaultIcon) as string} />
                    </span>
                    <input
                      id={`nav-leaf-${leaf.id}-icon`}
                      className="gis-input"
                      style={{ flex: 1, minWidth: 120 }}
                      value={ov?.iconClass ?? ''}
                      onChange={e => updateNavOverride(leaf.id, { iconClass: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <label className="sys-page-visible" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={ov?.hidden === true}
                  onChange={e => updateNavOverride(leaf.id, { hidden: e.target.checked })}
                />
                Hidden
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
