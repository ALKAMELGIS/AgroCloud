import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSystemSettings } from '../store/SystemSettingsContext'
import { SiInstanceScopeProvider } from '../pages/satellite/siInstanceScope'
import DynamicBindPage from '../pages/system/DynamicBindPage'
import AgroCloudDashboard from '../pages/dashboards/AgroCloudDashboard'
/** Eager-loaded: avoid full-route Suspense spinner on first paint / dashboard navigation */
import Home from '../pages/Home'
import Login from '../pages/Login'
const DashboardOverview = lazy(() => import('../pages/dashboards/Overview'))
const DevelopDashboard = lazy(() => import('../pages/dashboards/DevelopDashboard'))
const AgroCloudPlatformDashboard = lazy(
  () => import('../pages/dashboards/agroCloudPlatform/AgroCloudPlatformDashboard'),
)
const SatelliteIntelligence = lazy(() => import('../pages/satellite/SatelliteIntelligence'))
const SatelliteMultidimensional = lazy(() => import('../pages/satellite/Multidimensional'))
const GisMap = lazy(() => import('../pages/satellite/GisMap'))
const DataEntryFertigationRecords = lazy(() => import('../pages/data-entry/FertigationRecords'))
const DataEntryIrrigation = lazy(() => import('../pages/data-entry/Irrigation'))
const DataEntryHarvest = lazy(() => import('../pages/data-entry/Harvest'))
const DataEntryQHIS = lazy(() => import('../pages/data-entry/QHIS'))
const DataEntryECPH = lazy(() => import('../pages/data-entry/EC'))
const DataEntryRecipes = lazy(() => import('../pages/data-entry/Recipes'))
const AccountProfile = lazy(() => import('../pages/account/Profile'))
const AccountSettings = lazy(() => import('../pages/account/Settings'))
const MasterGisContent = lazy(() => import('../pages/master/GisContent'))
const MasterGisContentItem = lazy(() => import('../pages/master/GisContentItemPane'))
const DashboardSettings = lazy(() => import('../pages/master/DashboardSettings'))
const AdminUsers = lazy(() => import('../pages/admin/Users'))
const AdminGitHub = lazy(() => import('../pages/admin/GitHubIntegration'))
const DashboardAiChatbot = lazy(() => import('../pages/dashboards/AiChatbot'))
const DashboardModel = lazy(() => import('../pages/dashboards/Model'))
const AiAgroCloud = lazy(() => import('../pages/dashboards/AiAgroCloud'))
const AiAgroChat = lazy(() => import('../pages/dashboards/AiAgroChat'))
const StyleGuide = lazy(() => import('../pages/StyleGuide'))
const UsabilityTest = lazy(() => import('../pages/UsabilityTest'))
const SystemSettings = lazy(() => import('../pages/admin/SystemSettings'))
const SensorIntegrationPage = lazy(() => import('../pages/sensors/SensorIntegrationPage'))
const GpsVehicleTracking = lazy(() => import('../pages/sensors/GpsVehicleTracking'))
const AgroCloudManagement = lazy(() => import('../pages/applications/AgroCloudManagement'))

function RouteLoadingFallback({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="route-loading-fallback" role="status" aria-live="polite">
      {label}
    </div>
  )
}

export default function AppRoutes() {
  const { settings } = useSystemSettings()
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/satellite" element={<Navigate to="/satellite/indices" replace />} />
        <Route path="/data/fertigation" element={<Navigate to="/data/fertigation-records" replace />} />
        <Route path="/data/fertigation-records" element={<DataEntryFertigationRecords />} />
        <Route path="/data/irrigation" element={<DataEntryIrrigation />} />
        <Route path="/data/harvest" element={<DataEntryHarvest />} />
        <Route path="/data/qhis" element={<DataEntryQHIS />} />
        <Route path="/data/production" element={<DataEntryHarvest />} />
        <Route path="/data/ec-ph" element={<DataEntryECPH />} />
        <Route path="/data/recipes/:formSlug" element={<DataEntryRecipes />} />
        <Route
          path="/satellite/indices"
          element={
            <SiInstanceScopeProvider scope="standalone">
              <SatelliteIntelligence />
            </SiInstanceScopeProvider>
          }
        />
        <Route path="/satellite-intelligence-workspace" element={<Navigate to="/satellite/indices" replace />} />
        <Route path="/satellite-intelligence-workspace/*" element={<Navigate to="/satellite/indices" replace />} />
        <Route path="/satellite/multidimensional" element={<SatelliteMultidimensional />} />
        <Route path="/satellite/gis" element={<GisMap />} />
        <Route path="/dashboards/overview" element={<DashboardOverview />} />
        <Route path="/dashboards/plant-ai" element={<Navigate to="/dashboards/overview" replace />} />
        <Route path="/dashboards/ai-chatbot" element={<DashboardAiChatbot />} />
        <Route path="/dashboards/model" element={<DashboardModel />} />
        <Route path="/dashboards/agro-cloud" element={<AgroCloudDashboard />} />
        <Route
          path="/dashboards/agro-cloud-platform"
          element={
            <Suspense fallback={<RouteLoadingFallback label="Loading AgroCloud Platform…" />}>
              <AgroCloudPlatformDashboard />
            </Suspense>
          }
        />
        <Route path="/dashboards/agro-dashboard" element={<Navigate to="/dashboards/agro-cloud" replace />} />
        <Route path="/dashboards/ai-agro-cloud" element={<AiAgroCloud />} />
        <Route path="/dashboards/ai-agro-chat" element={<AiAgroChat />} />
        <Route
          path="/applications/agrocloud-management"
          element={
            <Suspense fallback={<RouteLoadingFallback label="Loading AgroCloud Management…" />}>
              <AgroCloudManagement />
            </Suspense>
          }
        />
        <Route path="/dashboards/esri-app" element={<Navigate to="/" replace />} />
        <Route path="/master/gis-content" element={<MasterGisContent />} />
        <Route path="/master/gis-content/item/:itemId" element={<MasterGisContentItem />} />
        <Route path="/master/dashboard-settings" element={<DashboardSettings />} />
        <Route path="/master/workflow-settings" element={<AccountSettings />} />
        <Route path="/account/profile" element={<AccountProfile />} />
        <Route path="/account/profile-user-management" element={<Navigate to="/account/profile" replace />} />
        <Route path="/account/settings" element={<AccountSettings />} />
        <Route path="/sensors/gps" element={<GpsVehicleTracking />} />
        <Route path="/sensors/:sensorKind" element={<SensorIntegrationPage />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/github" element={<AdminGitHub />} />
        <Route path="/admin/system-settings" element={<SystemSettings />} />
        <Route path="/style-guide" element={<StyleGuide />} />
        <Route path="/usability-test" element={<UsabilityTest />} />
        <Route
          path="/dashboard/develop/*"
          element={
            <Suspense fallback={<RouteLoadingFallback label="Loading dashboard builder…" />}>
              <DevelopDashboard />
            </Suspense>
          }
        />
        <Route path="/dashboards/geodash" element={<Navigate to="/dashboards/agro-cloud" replace />} />
        <Route path="/dashboard/design" element={<Navigate to="/dashboards/overview" replace />} />
        {settings.customPages
          .filter(p => p.visible && p.path.trim())
          .map(p => (
            <Route
              key={p.id}
              path={p.path.replace(/^\//, '')}
              element={
                <DynamicBindPage
                  bindTarget={p.bindTarget}
                  title={p.name}
                  externalUrl={p.externalUrl}
                />
              }
            />
          ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

