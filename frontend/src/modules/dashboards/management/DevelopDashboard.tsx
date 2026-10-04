import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AgroCloudDashboardsGallery from './agrocloud/AgroCloudDashboardsGallery'

const AgroCloudDashboardCreate = lazy(() => import('./agrocloud/AgroCloudDashboardCreate'))
const AgroCloudDashboardBuilder = lazy(() => import('./agrocloud/AgroCloudDashboardBuilder'))
const AgroCloudDashboardWorkspace = lazy(() => import('./agrocloud/AgroCloudDashboardWorkspace'))

function DevelopSubRouteFallback() {
  return (
    <div className="develop-elite develop-elite__route-loading" role="status">
      Loading…
    </div>
  )
}

export default function DevelopDashboard() {
  return (
    <Routes>
      <Route index element={<AgroCloudDashboardsGallery />} />
      <Route
        path="create"
        element={
          <Suspense fallback={<DevelopSubRouteFallback />}>
            <AgroCloudDashboardCreate />
          </Suspense>
        }
      />
      <Route
        path="edit"
        element={
          <Suspense fallback={<DevelopSubRouteFallback />}>
            <AgroCloudDashboardBuilder />
          </Suspense>
        }
      />
      <Route
        path="edit/:dashboardId"
        element={
          <Suspense fallback={<DevelopSubRouteFallback />}>
            <AgroCloudDashboardBuilder />
          </Suspense>
        }
      />
      <Route
        path="workspace"
        element={
          <Suspense fallback={<DevelopSubRouteFallback />}>
            <AgroCloudDashboardWorkspace />
          </Suspense>
        }
      />
      <Route
        path="workspace/:dashboardId"
        element={
          <Suspense fallback={<DevelopSubRouteFallback />}>
            <AgroCloudDashboardWorkspace />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard/develop" replace />} />
    </Routes>
  )
}
