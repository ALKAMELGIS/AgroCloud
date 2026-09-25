import {
  AGROCLOUD_MANAGEMENT_PAGE_PATH,
  findPageLinkByPath,
  resolveAgroCloudManagementUrl,
} from '../../lib/defaultPageLinks'
import { useSystemSettings } from '../../store/SystemSettingsContext'
import ExternalPageLink from '../system/ExternalPageLink'
import '../sensors/gps-in-app-browser.css'

/** AgroCloud Management — in-app iframe (default: Al Maha Farm on Railway). */
export default function AgroCloudManagement() {
  const { settings } = useSystemSettings()
  const pageLink = findPageLinkByPath(settings.customPages, AGROCLOUD_MANAGEMENT_PAGE_PATH)
  const url = resolveAgroCloudManagementUrl(settings.customPages)
  const title = pageLink?.name?.trim() || 'AgroCloud Management'

  return (
    <main className="sensor-shell gps-in-app-browser agrocloud-management-page" aria-label={title}>
      <ExternalPageLink url={url} title={title} />
    </main>
  )
}
