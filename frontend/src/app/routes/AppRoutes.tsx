import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSystemSettings } from '@/core/state/SystemSettingsContext'
import { SiInstanceScopeProvider } from '../providers/siInstanceScope'
import DynamicBindPage from '@/core/routing/DynamicBindPage'
import AgroCloudDashboard from '@/modules/dashboards/management/AgroCloudDashboard'
import { lazyWithRetry } from '@/core/routing/lazyWithRetry'
/** Eager-loaded: avoid full-route Suspense spinner on first paint / dashboard navigation */
import Home from '../layouts/Home'
import Login from '@/core/auth/Login'
const DashboardOverview = lazyWithRetry(() => import('@/modules/dashboards/operational/Overview'), 'DashboardOverview')
const DevelopDashboard = lazyWithRetry(() => import('@/modules/dashboards/management/DevelopDashboard'), 'DevelopDashboard')
const AgroCloudPlatformDashboard = lazyWithRetry(
  () => import('@/modules/dashboards/gis/agroCloudPlatform/AgroCloudPlatformDashboard'),
  'AgroCloudPlatformDashboard',
)
const SatelliteIntelligence = lazyWithRetry(() => import('@/modules/remote-sensing/imagery/SatelliteIntelligence'), 'SatelliteIntelligence')
const SatelliteMultidimensional = lazyWithRetry(() => import('@/modules/remote-sensing/imagery/Multidimensional'), 'SatelliteMultidimensional')
const GisMap = lazyWithRetry(() => import('@/modules/gis/map/GisMap'), 'GisMap')
const DataEntryFertigationRecords = lazyWithRetry(() => import('@/modules/operations/fertigation/FertigationRecords'), 'DataEntryFertigationRecords')
const DataEntryIrrigation = lazyWithRetry(() => import('@/modules/operations/irrigation/Irrigation'), 'DataEntryIrrigation')
const DataEntryHarvest = lazyWithRetry(() => import('@/modules/operations/harvest/Harvest'), 'DataEntryHarvest')
const DataEntryQHIS = lazyWithRetry(() => import('@/modules/operations/other/QHIS'), 'DataEntryQHIS')
const DataEntryECPH = lazyWithRetry(() => import('@/modules/operations/fertigation/EC'), 'DataEntryECPH')
const DataEntryRecipes = lazyWithRetry(() => import('@/modules/operations/fertigation/Recipes'), 'DataEntryRecipes')
const AccountProfile = lazyWithRetry(() => import('@/core/auth/account/Profile'), 'AccountProfile')
const AccountSettings = lazyWithRetry(() => import('@/core/auth/account/Settings'), 'AccountSettings')
const MasterGisContent = lazyWithRetry(() => import('@/modules/gis/layers/content-portal/GisContent'), 'MasterGisContent')
const MasterGisContentItem = lazyWithRetry(() => import('@/modules/gis/layers/content-portal/GisContentItemPane'), 'MasterGisContentItem')
const DashboardSettings = lazyWithRetry(() => import('@/modules/dashboards/management/DashboardSettings'), 'DashboardSettings')
const AdminUsers = lazyWithRetry(() => import('@/core/authorization/Users'), 'AdminUsers')
const AdminGitHub = lazyWithRetry(() => import('@/core/config/GitHubIntegration'), 'AdminGitHub')
const DashboardAiChatbot = lazyWithRetry(() => import('@/modules/dashboards/ai/AiChatbot'), 'DashboardAiChatbot')
const DashboardModel = lazyWithRetry(() => import('@/modules/dashboards/ai/Model'), 'DashboardModel')
const AiAgroCloud = lazyWithRetry(() => import('@/modules/dashboards/ai/AiAgroCloud'), 'AiAgroCloud')
const AiAgroChat = lazyWithRetry(() => import('@/modules/dashboards/ai/AiAgroChat'), 'AiAgroChat')
const StyleGuide = lazyWithRetry(() => import('./StyleGuide'), 'StyleGuide')
const UsabilityTest = lazyWithRetry(() => import('./UsabilityTest'), 'UsabilityTest')
const SystemSettings = lazyWithRetry(() => import('@/core/config/SystemSettings'), 'SystemSettings')
const SensorIntegrationPage = lazyWithRetry(() => import('@/modules/operations/other/sensors/SensorIntegrationPage'), 'SensorIntegrationPage')
const GpsVehicleTracking = lazyWithRetry(() => import('@/modules/operations/other/sensors/GpsVehicleTracking'), 'GpsVehicleTracking')
const AgroCloudManagement = lazyWithRetry(() => import('@/core/config/AgroCloudManagement'), 'AgroCloudManagement')

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

