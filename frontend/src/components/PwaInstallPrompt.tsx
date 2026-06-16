import { useCallback, useEffect, useRef, useState } from 'react'
import { AgroCloudMark } from './AgroCloudMark'
import { useLanguage } from '../lib/i18n'
import {
  dismissInstallPrompt,
  isInstallEligible,
  isInstallPromptDismissed,
  isPwaStandalone,
  PWA_INSTALL_OPEN_EVENT,
  resolvePwaInstallMode,
  type BeforeInstallPromptEvent,
} from '../lib/pwaInstall'
import { usePwaInstallText } from '../lib/pwaInstallText'
import './pwa-install.css'

type InstallMode = ReturnType<typeof resolvePwaInstallMode>

const FALLBACK_DELAY_MS = 900

export default function PwaInstallPrompt() {
  const { language, direction } = useLanguage()
  const t = usePwaInstallText(language)
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<InstallMode>('native')
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)

  const showPrompt = useCallback((forced = false) => {
    if (!forced && isInstallPromptDismissed()) return
    setMode(resolvePwaInstallMode())
    setVisible(true)
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD) return
    if (import.meta.env.VITE_ENABLE_PWA === 'false') return
    if (!isInstallEligible()) return

    const onOpen = () => showPrompt(true)
    window.addEventListener(PWA_INSTALL_OPEN_EVENT, onOpen)

    const onBip = (e: Event) => {
      e.preventDefault()
      const ev = e as BeforeInstallPromptEvent
      deferredRef.current = ev
      setDeferred(ev)
      setMode('native')
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBip)

    let fallbackTimer: number | undefined
    if (!isPwaStandalone() && !isInstallPromptDismissed()) {
      fallbackTimer = window.setTimeout(() => {
        if (deferredRef.current || isInstallPromptDismissed()) return
        showPrompt(false)
      }, FALLBACK_DELAY_MS)
    }

    return () => {
      window.removeEventListener(PWA_INSTALL_OPEN_EVENT, onOpen)
      window.removeEventListener('beforeinstallprompt', onBip)
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
    }
  }, [showPrompt])

  const close = useCallback((remember = true) => {
    if (remember) dismissInstallPrompt()
    setVisible(false)
    setDeferred(null)
    deferredRef.current = null
    setMode('native')
    setCopied(false)
  }, [])

  const onInstall = useCallback(async () => {
    if (!deferred) return
    setBusy(true)
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      // ignore
    } finally {
      setBusy(false)
      close(true)
    }
  }, [close, deferred])

  const onCopyLink = useCallback(async () => {
    const url = window.location.href
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      // ignore
    }
  }, [])

  if (!visible) return null

  const title =
    mode === 'ios-safari' ? t.iosSafariTitle : t.title
  const subtitle =
    mode === 'ios-safari' ? t.iosSafariSubtitle : t.subtitle

  return (
    <div
      className="pwa-install-root"
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-modal="true"
      dir={direction}
    >
      <div className="pwa-install-card">
        <div className="pwa-install-card__head">
          <AgroCloudMark size={40} className="pwa-install-card__mark" title="AgroCloud" />
          <div>
            <h2 id="pwa-install-title" className="pwa-install-card__title">
              {title}
            </h2>
            <p className="pwa-install-card__sub">{subtitle}</p>
          </div>
          <button type="button" className="pwa-install-card__close" onClick={() => close(true)} aria-label={t.notNow}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>

        {mode === 'ios-ipad' ? (
          <ol className="pwa-install-steps">
            <li>
              {t.ipadStep1} <i className="fa-solid fa-arrow-up-from-bracket" aria-hidden />
            </li>
            <li>
              {t.ipadStep2} <i className="fa-solid fa-plus-square" aria-hidden />
            </li>
            <li>{t.ipadStep3}</li>
          </ol>
        ) : mode === 'ios' ? (
          <ol className="pwa-install-steps">
            <li>
              {t.iosStep1} <i className="fa-solid fa-arrow-up-from-bracket" aria-hidden />
            </li>
            <li>
              {t.iosStep2} <i className="fa-solid fa-plus-square" aria-hidden />
            </li>
            <li>{t.iosStep3}</li>
          </ol>
        ) : mode === 'ios-safari' ? (
          <ol className="pwa-install-steps">
            <li>{t.iosSafariStep1}</li>
            <li>{t.iosSafariStep2}</li>
            <li>
              {t.iosSafariStep3} <i className="fa-solid fa-plus-square" aria-hidden />
            </li>
          </ol>
        ) : mode === 'android' ? (
          <ol className="pwa-install-steps">
            <li>
              {t.androidStep1} <i className="fa-solid fa-ellipsis-vertical" aria-hidden />
            </li>
            <li>
              {t.androidStep2} <i className="fa-solid fa-download" aria-hidden />
            </li>
            <li>{t.androidStep3}</li>
          </ol>
        ) : (
          <ul className="pwa-install-features">
            <li>
              <i className="fa-solid fa-bolt" aria-hidden /> {t.featureFast}
            </li>
            <li>
              <i className="fa-solid fa-expand" aria-hidden /> {t.featureFullscreen}
            </li>
            <li>
              <i className="fa-solid fa-leaf" aria-hidden /> {t.featureSame}
            </li>
          </ul>
        )}

        <div className="pwa-install-actions">
          {mode === 'ios-safari' ? (
            <button type="button" className="pwa-install-btn pwa-install-btn--primary" onClick={() => void onCopyLink()}>
              {copied ? t.copied : t.copyLink}
            </button>
          ) : null}
          {mode === 'native' && deferred ? (
            <button
              type="button"
              className="pwa-install-btn pwa-install-btn--primary"
              onClick={() => void onInstall()}
              disabled={busy}
            >
              {busy ? t.installing : t.install}
            </button>
          ) : null}
          <button type="button" className="pwa-install-btn pwa-install-btn--ghost" onClick={() => close(true)}>
            {t.notNow}
          </button>
        </div>
      </div>
    </div>
  )
}
