import { useLanguage } from '@/core/localization/i18n'
import './sensor-integration.css'
import './gps-vehicle-tracking.css'

/** GPS Vehicle Tracking route — intentionally blank placeholder. */
export default function GpsVehicleTracking() {
  const { direction } = useLanguage()

  return (
    <div className="sensor-shell sensor-shell--blank" dir={direction}>
      <main className="sensor-main sensor-main--blank" />
    </div>
  )
}
