import { useLanguage } from '../lib/i18n'
import { isInstallEligible, isIosInstallContext, openPwaInstallPrompt } from '../lib/pwaInstall'
import { usePwaInstallText } from '../lib/pwaInstallText'
import './pwa-install.css'

/** Always-visible install control on iPhone/iPad (Safari Add to Home Screen). */
export default function PwaInstallFab() {
  const { language, direction } = useLanguage()
  const t = usePwaInstallText(language)

  if (!import.meta.env.PROD) return null
  if (import.meta.env.VITE_ENABLE_PWA === 'false') return null
  if (!isInstallEligible() || !isIosInstallContext()) return null

  return (
    <button
      type="button"
      className="pwa-install-fab"
      dir={direction}
      aria-label={t.fabLabel}
      onClick={() => openPwaInstallPrompt()}
    >
      <i className="fa-solid fa-arrow-down-to-bracket" aria-hidden />
      <span className="pwa-install-fab__label">{t.fabLabel}</span>
    </button>
  )
}
