import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AGROCLOUD_DASHBOARD_AUTHOR } from './agroCloudDashboardData'
import { createAgroCloudDashboardFromForm } from './agroCloudDashboardSave'
import './agro-cloud-dashboards.css'

const TAG_OPTIONS = ['agriculture', 'monitoring', 'NDVI', 'irrigation', 'field-ops']

export default function AgroCloudDashboardCreate() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [tag, setTag] = useState('')
  const [summary, setSummary] = useState('')
  const [folder, setFolder] = useState(AGROCLOUD_DASHBOARD_AUTHOR)
  const [titleError, setTitleError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setTitleError('Title is required.')
      return
    }
    setTitleError(null)
    const tags = tag && tag !== 'add-tag' ? [tag] : undefined
    const row = createAgroCloudDashboardFromForm({
      title: trimmed,
      tags,
      summary: summary.trim() || undefined,
      folderId: 'all',
    })
    navigate(`/dashboard/develop/edit/${row.id}`, { replace: true })
  }

  return (
    <div className="agrocloud-dashboard-create page page-tight">
      <header className="agrocloud-dashboard-create__head">
        <h1>Create new dashboard</h1>
      </header>

      <div className="agrocloud-dashboard-create__body">
        <form className="agrocloud-dashboard-create__form" id="agrocloud-dashboard-create-form" onSubmit={handleSubmit}>
          <div className="agrocloud-dashboard-create__field">
            <label htmlFor="agrocloud-dashboard-title">
              Title<span className="agrocloud-dashboard-create__req" aria-hidden>
                *
              </span>
            </label>
            <input
              id="agrocloud-dashboard-title"
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value)
                if (titleError) setTitleError(null)
              }}
              aria-required
              aria-invalid={titleError ? true : undefined}
            />
            {titleError ? <p className="agrocloud-dashboard-create__error">{titleError}</p> : null}
          </div>

          <div className="agrocloud-dashboard-create__field">
            <label htmlFor="agrocloud-dashboard-tags">Tags</label>
            <div className="agrocloud-dashboard-create__select-wrap">
              <select
                id="agrocloud-dashboard-tags"
                value={tag}
                onChange={e => setTag(e.target.value)}
              >
                <option value="">Add tag</option>
                {TAG_OPTIONS.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <i className="fa-solid fa-chevron-down" aria-hidden />
            </div>
          </div>

          <div className="agrocloud-dashboard-create__field">
            <label htmlFor="agrocloud-dashboard-summary">Summary</label>
            <textarea
              id="agrocloud-dashboard-summary"
              rows={5}
              value={summary}
              onChange={e => setSummary(e.target.value)}
            />
          </div>

          <div className="agrocloud-dashboard-create__field">
            <label htmlFor="agrocloud-dashboard-folder">Folder</label>
            <div className="agrocloud-dashboard-create__select-wrap">
              <select id="agrocloud-dashboard-folder" value={folder} onChange={e => setFolder(e.target.value)}>
                <option value={AGROCLOUD_DASHBOARD_AUTHOR}>{AGROCLOUD_DASHBOARD_AUTHOR}</option>
              </select>
              <i className="fa-solid fa-chevron-down" aria-hidden />
            </div>
          </div>
        </form>
      </div>

      <footer className="agrocloud-dashboard-create__foot">
        <button type="button" className="agrocloud-dashboard-create__cancel" onClick={() => navigate('/dashboard/develop')}>
          Cancel
        </button>
        <button type="submit" form="agrocloud-dashboard-create-form" className="agrocloud-dashboard-create__submit">
          Create dashboard
        </button>
      </footer>
    </div>
  )
}
