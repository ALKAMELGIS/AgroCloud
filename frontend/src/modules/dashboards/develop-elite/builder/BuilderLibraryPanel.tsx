import { useMemo, useState } from 'react'

import { DEVELOP_ELITE_LIBRARY_DRAG_MIME, setDevelopEliteLibraryDrag } from '../DevelopEliteDashboardGrid'
import { BUILDER_ELEMENT_KINDS, type BuilderElementType } from './builderTypes'

type Props = {
  onAdd: (type: BuilderElementType) => void
  hiddenBuiltIns: { id: string; label: string }[]
  onRestoreBuiltIn: (id: string) => void
  onClose: () => void
}

const GROUP_ORDER = ['Indicators', 'Charts', 'Lists & tables', 'Selectors', 'Content'] as const

/** Element library: drag an element onto the grid, or click it to add it at the end. */
export function BuilderLibraryPanel({ onAdd, hiddenBuiltIns, onRestoreBuiltIn, onClose }: Props) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const kinds = BUILDER_ELEMENT_KINDS.filter(k => !q || `${k.label} ${k.description}`.toLowerCase().includes(q))
    return GROUP_ORDER.map(g => ({ group: g, kinds: kinds.filter(k => k.group === g) })).filter(g => g.kinds.length)
  }, [query])

  return (
    <aside className="deb-panel deb-panel--library" aria-label="Element library">
      <header className="deb-panel__head">
        <h2>Add elements</h2>
        <button type="button" className="deb-icon-btn" onClick={onClose} aria-label="Hide element library" title="Hide">
          <i className="fa-solid fa-angles-left" aria-hidden />
        </button>
      </header>
      <p className="deb-panel__hint">Drag onto the dashboard, or click to add at the end.</p>
      <div className="deb-panel__search">
        <i className="fa-solid fa-magnifying-glass" aria-hidden />
        <input type="search" placeholder="Search elements" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search elements" />
      </div>
      <div className="deb-panel__scroll">
        {groups.map(({ group, kinds }) => (
          <section key={group} className="deb-lib-group">
            <h3>{group}</h3>
            <ul>
              {kinds.map(k => (
                <li key={k.type}>
                  <button
                    type="button"
                    className="deb-lib-item"
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'copy'
                      e.dataTransfer.setData(DEVELOP_ELITE_LIBRARY_DRAG_MIME, JSON.stringify({ type: k.type }))
                      e.dataTransfer.setData('text/plain', k.label)
                      setDevelopEliteLibraryDrag({ type: k.type, w: k.w, h: k.h })
                    }}
                    onDragEnd={() => setDevelopEliteLibraryDrag(null)}
                    onClick={() => onAdd(k.type)}
                    title={`${k.description} — drag to place, or click to add`}
                  >
                    <span className="deb-lib-item__icon">
                      <i className={k.icon} aria-hidden />
                    </span>
                    <span className="deb-lib-item__text">
                      <strong>{k.label}</strong>
                      <span>{k.description}</span>
                    </span>
                    <i className="fa-solid fa-grip-vertical deb-lib-item__grip" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length ? <p className="deb-panel__empty">No element matches “{query}”.</p> : null}
        {hiddenBuiltIns.length ? (
          <section className="deb-lib-group">
            <h3>Removed built-in widgets</h3>
            <ul>
              {hiddenBuiltIns.map(w => (
                <li key={w.id}>
                  <button type="button" className="deb-lib-item deb-lib-item--restore" onClick={() => onRestoreBuiltIn(w.id)}>
                    <span className="deb-lib-item__icon">
                      <i className="fa-solid fa-rotate-left" aria-hidden />
                    </span>
                    <span className="deb-lib-item__text">
                      <strong>{w.label}</strong>
                      <span>Put back on the dashboard</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  )
}
