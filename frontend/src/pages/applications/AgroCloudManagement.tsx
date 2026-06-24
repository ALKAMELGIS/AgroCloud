import {
  AGROCLOUD_MANAGEMENT_EXTERNAL_URL,
  AGROCLOUD_MANAGEMENT_PAGE_PATH,
  findPageLinkByPath,
} from '../../lib/defaultPageLinks'
import { useSystemSettings } from '../../store/SystemSettingsContext'
import ExternalPageLink from '../system/ExternalPageLink'

/** AgroCloud Management — opens the configured external URL from Link Management settings. */
export default function AgroCloudManagement() {
  const { settings } = useSystemSettings()
  const pageLink =
    findPageLinkByPath(settings.customPages, AGROCLOUD_MANAGEMENT_PAGE_PATH) ??
    settings.customPages.find(
      p => p.bindTarget === 'external' && p.path === AGROCLOUD_MANAGEMENT_PAGE_PATH,
    )
  const url = pageLink?.externalUrl?.trim() || AGROCLOUD_MANAGEMENT_EXTERNAL_URL
  const title = pageLink?.name?.trim() || 'AgroCloud Management'

  return <ExternalPageLink url={url} title={title} />
}
