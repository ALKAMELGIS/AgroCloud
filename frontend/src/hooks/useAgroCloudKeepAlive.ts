import { useEffect, useState } from 'react'
import {
  AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT,
  readAgroCloudKeepAlive,
} from '../lib/agroCloudDashboardStorage'

/** Reactive subscription to “pin dashboard / keep iframe mounted” preference. */
export function useAgroCloudKeepAlive(): boolean {
  const [enabled, setEnabled] = useState(readAgroCloudKeepAlive)

  useEffect(() => {
    const onChange = () => setEnabled(readAgroCloudKeepAlive())
    window.addEventListener(AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT, onChange)
  }, [])

  return enabled
}
