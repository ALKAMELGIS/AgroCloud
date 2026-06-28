import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSystemSettings } from '../store/SystemSettingsContext'
import { SiInstanceScopeProvider } from '../pages/satellite/siInstanceScope'
import DynamicBindPage from '../pages/system/DynamicBindPage'
import AgroCloudDashboard from '../pages/dashboards/AgroCloudDashboard'
import { lazyWithRetry } from '../lib/lazyWithRetry'
/** Eager-loaded: avoid full-route Suspense spinner on first paint / dashboard navigation */
import Home from '../pages/Home'
import Login from '../pages/Login'
const DashboardOverview = lazyWithRetry(() => import('../pages/dashboards/Overview'), 'DashboardOverview')
const DevelopDashboard = lazyWithRetry(() => import('../pages/dashboards/DevelopDashboard'), 'DevelopDashboard')
const AgroCloudPlatformDashboard = lazyWithRetry(
  () => import('../pages/dashboards/agroCloudPlatform/AgroCloudPlatformDashboard'),
  'AgroCloudPlatformDashboard',
)
const SatelliteIntelligence = lazyWithRetry(() => import('../pages/satellite/SatelliteIntelligence'), 'SatelliteIntelligence')
const SatelliteMultidimensional = lazyWithRetry(() => import('../pages/satellite/Multidimensional'), 'SatelliteMultidimensional')
const GisMap = lazyWithRetry(() => import('../pages/satellite/GisMap'), 'GisMap')
const DataEntryFertigationRecords = lazyWithRetry(() => import('../pages/data-entry/FertigationRecords'), 'DataEntryFertigationRecords')
const DataEntryIrrigation = lazyWithRetry(() => import('../pages/data-entry/Irrigation'), 'DataEntryIrrigation')
const DataEntryHarvest = lazyWithRetry(() => import('../pages/data-entry/Harvest'), 'DataEntryHarvest')
const DataEntryQHIS = lazyWithRetry(() => import('../pages/data-entry/QHIS'), 'DataEntryQHIS')
const DataEntryECPH = lazyWithRetry(() => import('../pages/data-entry/EC'), 'DataEntryECPH')
const DataEntryRecipes = lazyWithRetry(() => import('../pages/data-entry/Recipes'), 'DataEntryRecipes')
const AccountProfile = lazyWithRetry(() => import('../pages/account/Profile'), 'AccountProfile')
const AccountSettings = lazyWithRetry(() => import('../pages/account/Settings'), 'AccountSettings')
const MasterGisContent = lazyWithRetry(() => import('../pages/master/GisContent'), 'MasterGisContent')
const MasterGisContentItem = lazyWithRetry(() => import('../pages/master/GisContentItemPane'), 'MasterGisContentItem')
const DashboardSettings = lazyWithRetry(() => import('../pages/master/DashboardSettings'), 'DashboardSettings')
const AdminUsers = lazyWithRetry(() => import('../pages/admin/Users'), 'AdminUsers')
const AdminGitHub = lazyWithRetry(() => import('../pages/admin/GitHubIntegration'), 'AdminGitHub')
const DashboardAiChatbot = lazyWithRetry(() => import('../pages/dashboards/AiChatbot'), 'DashboardAiChatbot')
const DashboardModel = lazyWithRetry(() => import('../pages/dashboards/Model'), 'DashboardModel')
const AiAgroCloud = lazyWithRetry(() => import('../pages/dashboards/AiAgroCloud'), 'AiAgroCloud')
const AiAgroChat = lazyWithRetry(() => import('../pages/dashboards/AiAgroChat'), 'AiAgroChat')
const StyleGuide = lazyWithRetry(() => import('../pages/StyleGuide'), 'StyleGuide')
const UsabilityTest = lazyWithRetry(() => import('../pages/UsabilityTest'), 'UsabilityTest')
const SystemSettings = lazyWithRetry(() => import('../pages/admin/SystemSettings'), 'SystemSettings')
const SensorIntegrationPage = lazyWithRetry(() => import('../pages/sensors/SensorIntegrationPage'), 'SensorIntegrationPage')
const GpsVehicleTracking = lazyWithRetry(() => import('../pages/sensors/GpsVehicleTracking'), 'GpsVehicleTracking')
const AgroCloudManagement = lazyWithRetry(() => import('../pages/applications/AgroCloudManagement'), 'AgroCloudManagement')

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

