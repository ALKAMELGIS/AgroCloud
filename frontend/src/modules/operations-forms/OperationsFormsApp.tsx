import { Navigate, Route, Routes } from 'react-router-dom'

import './ops.css'
import { OpsProvider, useOps } from './opsContext'
import OpsFormPage from './pages/OpsFormPage'
import OpsHubPage from './pages/OpsHubPage'
import OpsSettingsPage from './pages/OpsSettingsPage'

function Gate({ children }: { children: React.ReactNode }) {
  const { schema, error, loading, reload, lang } = useOps()
  if (schema) return <>{children}</>
  return (
    <div className="ops">
      {loading ? (
        <p className="ops-field__hint">{lang === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : (
        <div className="ops-alert" role="alert">
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" className="ops-btn ops-btn--sm" onClick={() => void reload()}>
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}
    </div>
  )
}

/** /ops/* — operations forms (hub, one page per form, settings). */
export default function OperationsFormsApp() {
  return (
    <OpsProvider>
      <Gate>
        <Routes>
          <Route index element={<OpsHubPage />} />
          <Route path="settings" element={<OpsSettingsPage />} />
          <Route path=":formId" element={<OpsFormPage />} />
          <Route path="*" element={<Navigate to="/ops" replace />} />
        </Routes>
      </Gate>
    </OpsProvider>
  )
}
