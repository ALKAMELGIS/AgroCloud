import { useEffect, useRef, useState } from 'react'
import { BrandLogoOrbit } from './BrandLogoOrbit'
import { isPwaStandalone, isTouchDevice } from '../lib/pwaInstall'
import './brand-logo-orbit.css'
import './splash.css'

const SPLASH_VIDEO_SRC =
  'https://www.esri.com/content/dam/esrisites/en-us/parallax-gis/wigis-scene-3-0614-large.mp4'
const SPLASH_VIDEO_POSTER =
  'https://www.esri.com/content/dam/esrisites/en-us/parallax-gis/scene-poster.jpg'

const TOUCH_SPLASH_MS = 700
const DESKTOP_SPLASH_MS = 3400

type SplashScreenProps = {
  durationMs?: number
  sessionKey?: string
  tagline?: string
}

/**
 * AgroCloud splash — Esri GIS video background + Elite Agro Projects white logo.
 * On iPhone/iPad: poster only (no multi-MB video), shorter duration, skip when installed PWA.
 */
export default function SplashScreen({
  durationMs,
  sessionKey = 'agroSplashShown',
  tagline = 'Spatial Intelligence for Smart Agriculture',
}: SplashScreenProps) {
  const touch = isTouchDevice()
  const effectiveDurationMs = durationMs ?? (touch ? TOUCH_SPLASH_MS : DESKTOP_SPLASH_MS)
  const useVideo = !touch
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      if (sessionStorage.getItem(sessionKey) === '1') return false
      if (isPwaStandalone() && touch) return false
      return true
    } catch {
      return true
    }
  })
  const [exiting, setExiting] = useState(false)
  const reducedMotion = useRef(false)

  useEffect(() => {
    if (!visible || !useVideo) return
    const v = videoRef.current
    if (v) {
      v.muted = true
      void v.play().catch(() => {})
    }
  }, [visible, useVideo])

  useEffect(() => {
    if (!visible) return
    if (typeof window !== 'undefined') {
      reducedMotion.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    }

    const total = reducedMotion.current ? 400 : effectiveDurationMs
    const exitDelay = total
    const removeDelay = total + 320

    const exitTimer = window.setTimeout(() => setExiting(true), exitDelay)
    const removeTimer = window.setTimeout(() => {
      setVisible(false)
      try {
        sessionStorage.setItem(sessionKey, '1')
      } catch {
        /* ignore */
      }
    }, removeDelay)

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExiting(true)
        window.setTimeout(() => setVisible(false), 240)
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(removeTimer)
      window.removeEventListener('keydown', onKey)
    }
  }, [visible, effectiveDurationMs, sessionKey])

  if (!visible) return null

  return (
    <div
      className={['agro-splash', exiting ? 'agro-splash--exit' : ''].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-label="AgroCloud loading"
    >
      <div className="agro-splash__bg" aria-hidden="true">
        <div className="agro-splash__video-wrap">
          {useVideo ? (
            <video
              ref={videoRef}
              className="agro-splash__video"
              poster={SPLASH_VIDEO_POSTER}
              muted
              playsInline
              autoPlay
              loop
              preload="metadata"
            >
              <source src={SPLASH_VIDEO_SRC} type="video/mp4" />
            </video>
          ) : (
            <img
              className="agro-splash__video agro-splash__poster"
              src={SPLASH_VIDEO_POSTER}
              alt=""
              decoding="async"
              fetchPriority="high"
            />
          )}
        </div>
        <div className="agro-splash__overlay" />
      </div>

      <div className="agro-splash__stage" aria-hidden="true">
        <BrandLogoOrbit
          className="agro-splash__logo-orbit agro-splash__logo-orbit--elite"
          size={240}
          title="Elite Agro Projects"
        />

        <div className="agro-splash__brand">
          <span className="agro-splash__brand-text">AgroCloud</span>
          <span className="agro-splash__tagline">{tagline}</span>
        </div>

        <div className="agro-splash__loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
