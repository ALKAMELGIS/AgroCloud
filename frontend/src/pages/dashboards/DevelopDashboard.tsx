import { Navigate, Route, Routes } from 'react-router-dom'
import AgroCloudDashboardsGallery from './agrocloud/AgroCloudDashboardsGallery'
import AgroCloudDashboardCreate from './agrocloud/AgroCloudDashboardCreate'
import AgroCloudDashboardBuilder from './agrocloud/AgroCloudDashboardBuilder'
import AgroCloudDashboardWorkspace from './agrocloud/AgroCloudDashboardWorkspace'

export default function DevelopDashboard() {
  return (
    <Routes>
      <Route index element={<AgroCloudDashboardsGallery />} />
      <Route path="create" element={<AgroCloudDashboardCreate />} />
      <Route path="edit" element={<AgroCloudDashboardBuilder />} />
      <Route path="edit/:dashboardId" element={<AgroCloudDashboardBuilder />} />
      <Route path="workspace" element={<AgroCloudDashboardWorkspace />} />
      <Route path="workspace/:dashboardId" element={<AgroCloudDashboardWorkspace />} />
      <Route path="*" element={<Navigate to="/dashboard/develop" replace />} />
    </Routes>
  )
}
