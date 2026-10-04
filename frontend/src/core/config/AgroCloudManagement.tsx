import {
  AGROCLOUD_MANAGEMENT_PAGE_PATH,
  findPageLinkByPath,
  resolveAgroCloudManagementUrl,
} from '../routing/defaultPageLinks'
import { useSystemSettings } from '../state/SystemSettingsContext'
import ExternalEmbeddedPage from '../routing/ExternalEmbeddedPage'

/** AgroCloud Management — in-app iframe (default: Al Maha Farm on Railway). */
export default function AgroCloudManagement() {
  const { settings } = useSystemSettings()
  const pageLink = findPageLinkByPath(settings.customPages, AGROCLOUD_MANAGEMENT_PAGE_PATH)
  const url = resolveAgroCloudManagementUrl(settings.customPages)
  const title = pageLink?.name?.trim() || 'AgroCloud Management'

  return <ExternalEmbeddedPage title={title} externalUrl={url} />
}
