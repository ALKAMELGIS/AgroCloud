import { useMemo, useState } from 'react'
import { isExternalPageLink } from '../../routing/defaultPageLinks'
import type { CustomPageRecord } from '../../types/systemSettings'

type Props = {
  language: 'en' | 'ar'
  pages: CustomPageRecord[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<CustomPageRecord>) => void
  onRemove: (id: string) => void
}

type EditDraft = { name: string; externalUrl: string; path: string; nameAr: string }

function truncateUrl(url: string, max = 56): string {
  const t = url.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function EmbeddedPagesSettingsSection({ language, pages, onAdd, onUpdate, onRemove }: Props) {
  const isAr = language === 'ar'
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)

  const embeddedPages = useMemo(() => pages.filter(isExternalPageLink), [pages])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return embeddedPages
    return embeddedPages.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.nameAr ?? '').toLowerCase().includes(q) ||
        (p.externalUrl ?? '').toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q),
    )
  }, [embeddedPages, query])

  const startEdit = (link: CustomPageRecord) => {
    setEditingId(link.id)
    setDraft({
      name: link.name,
      nameAr: link.nameAr ?? '',
      externalUrl: link.externalUrl ?? '',
      path: link.path,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const saveEdit = () => {
    if (!editingId || !draft) return
    onUpdate(editingId, {
      name: draft.name.trim() || 'Embedded page',
      nameAr: draft.nameAr.trim(),
      externalUrl: draft.externalUrl.trim(),
      path: draft.path.trim(),
      bindTarget: 'external',
    })
    cancelEdit()
  }

  return (
    <section className="sys-embedded-pages" aria-labelledby="sys-embedded-pages-heading">
      <div className="sys-pages-head">
        <div>
          <h2 id="sys-embedded-pages-heading">Embedded pages</h2>
          <p>
            {isAr
              ? 'صفحة واحدة لكل سطر: الاسم، الرابط، تعديل، حذف.'
              : 'One row per page: name, URL, edit, and delete.'}
          </p>
        </div>
        <button type="button" className="gis-btn gis-btn-primary sys-pages-add" onClick={onAdd}>
          <i className="fa-solid fa-plus" aria-hidden />
          Add embedded page
        </button>
      </div>

      <div className="sys-pages-toolbar">
        <label className="sys-pages-toolbar__search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
          <input
            className="gis-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or URL…"
          />
        </label>
        <span className="sys-pages-toolbar__count">
          {rows.length} / {embeddedPages.length}
        </span>
      </div>

      {embeddedPages.length === 0 ? (
        <div className="sys-empty-state">
          <i className="fa-solid fa-window-maximize" aria-hidden />
          No embedded pages yet. Use <strong>Add embedded page</strong> to register a URL.
        </div>
      ) : rows.length === 0 ? (
        <div className="sys-empty-state">
          <i className="fa-solid fa-filter-circle-xmark" aria-hidden />
          No pages match your search.
        </div>
      ) : (
        <div className="sys-embedded-pages__table-wrap">
          <table className="sys-embedded-pages__table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">URL</th>
                <th scope="col" className="sys-embedded-pages__th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(link => {
                const editing = editingId === link.id && draft
                return (
                  <tr key={link.id} className={editing ? 'is-editing' : undefined}>
                    <td data-label="Name">
                      {editing ? (
                        <input
                          className="gis-input sys-embedded-pages__input"
                          value={draft.name}
                          onChange={e => setDraft(d => (d ? { ...d, name: e.target.value } : d))}
                          aria-label="Page name"
                        />
                      ) : (
                        <span className="sys-embedded-pages__name">{link.name}</span>
                      )}
                    </td>
                    <td data-label="URL">
                      {editing ? (
                        <input
                          className="gis-input sys-embedded-pages__input sys-embedded-pages__input--url"
                          dir="ltr"
                          type="url"
                          value={draft.externalUrl}
                          onChange={e => setDraft(d => (d ? { ...d, externalUrl: e.target.value } : d))}
                          placeholder="https://"
                          spellCheck={false}
                          aria-label="External URL"
                        />
                      ) : (
                        <a
                          className="sys-embedded-pages__url"
                          href={link.externalUrl?.trim() || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={link.externalUrl ?? ''}
                        >
                          {truncateUrl(link.externalUrl ?? '—')}
                        </a>
                      )}
                    </td>
                    <td className="sys-embedded-pages__actions" data-label="Actions">
                      {editing ? (
                        <div className="sys-embedded-pages__action-row">
                          <button
                            type="button"
                            className="sys-embedded-pages__icon-btn sys-embedded-pages__icon-btn--primary"
                            onClick={saveEdit}
                            title="Save"
                            aria-label="Save"
                          >
                            <i className="fa-solid fa-check" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="sys-embedded-pages__icon-btn"
                            onClick={cancelEdit}
                            title="Cancel"
                            aria-label="Cancel"
                          >
                            <i className="fa-solid fa-xmark" aria-hidden />
                          </button>
                        </div>
                      ) : (
                        <div className="sys-embedded-pages__action-row">
                          <button
                            type="button"
                            className="sys-embedded-pages__icon-btn"
                            onClick={() => startEdit(link)}
                            title="Edit"
                            aria-label={`Edit ${link.name}`}
                          >
                            <i className="fa-solid fa-pen" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="sys-embedded-pages__icon-btn sys-embedded-pages__icon-btn--danger"
                            onClick={() => onRemove(link.id)}
                            title="Delete"
                            aria-label={`Delete ${link.name}`}
                          >
                            <i className="fa-solid fa-trash" aria-hidden />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {editingId && draft ? (
            <p className="sys-embedded-pages__edit-hint">
              <label className="sys-embedded-pages__route-label">
                In-app route
                <input
                  className="gis-input sys-embedded-pages__input sys-embedded-pages__input--route"
                  dir="ltr"
                  value={draft.path}
                  onChange={e => setDraft(d => (d ? { ...d, path: e.target.value } : d))}
                  spellCheck={false}
                />
              </label>
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
