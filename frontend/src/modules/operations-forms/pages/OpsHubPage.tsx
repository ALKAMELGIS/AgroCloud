import { FileBarChart2, Plus, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useOps, useOpsText } from '../opsContext'

export default function OpsHubPage() {
  const { schema, t } = useOps()
  const tx = useOpsText()
  if (!schema) return null
  return (
    <div className="ops">
      <div className="ops-head">
        <div>
          <h1>{tx('Operations forms', 'استمارات العمليات')}</h1>
          <p>{tx('Record, import, review and report the farm’s daily operations — one database for every form.', 'سجّل واستورد وراجع وأصدر تقارير العمليات اليومية — قاعدة بيانات واحدة لكل الاستمارات.')}</p>
        </div>
        <div className="ops-actions">
          <Link to="/ops/settings" className="ops-btn">
            <Settings2 aria-hidden /> {tx('Settings & lists', 'الإعدادات والقوائم')}
          </Link>
        </div>
      </div>
      <div className="ops-hub-grid">
        {schema.forms.map(form => {
          const c = schema.counts[form.id]
          return (
            <article key={form.id} className="ops-card">
              <div className="ops-card__top">
                <span className="ops-card__icon">
                  <i className={form.icon} aria-hidden />
                </span>
                <div>
                  <h2>{t(form.title)}</h2>
                  <div className="ops-card__meta">{schema.settings.forms?.[form.id]?.docCode || form.docCode}</div>
                </div>
              </div>
              <div className="ops-card__stats">
                <div>
                  <strong>{(c?.total ?? 0).toLocaleString()}</strong>
                  <span>{tx('records', 'سجل')}</span>
                </div>
                <div>
                  <strong>{c?.lastDate ?? '—'}</strong>
                  <span>{tx('latest entry', 'آخر إدخال')}</span>
                </div>
              </div>
              <div className="ops-actions">
                <Link to={`/ops/${form.id}`} className="ops-btn ops-btn--primary">
                  {tx('Open', 'فتح')}
                </Link>
                <Link to={`/ops/${form.id}?new=1`} className="ops-btn" aria-label={`${tx('New record', 'سجل جديد')} — ${t(form.title)}`}>
                  <Plus aria-hidden /> {tx('New', 'جديد')}
                </Link>
                <Link to={`/ops/${form.id}?report=1`} className="ops-btn ops-btn--ghost" aria-label={`${tx('Report', 'تقرير')} — ${t(form.title)}`}>
                  <FileBarChart2 aria-hidden /> {tx('Report', 'تقرير')}
                </Link>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
