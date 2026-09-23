import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../lib/i18n'
import {
  disconnectJohnDeereOAuth,
  fetchJohnDeereMapEmbedHealth,
  fetchJohnDeereOAuthStatus,
  fetchJohnDeereSetup,
  startJohnDeereOAuthConnect,
  type JohnDeereSetup,
} from '../lib/johnDeereTrackingApi'

export default function JohnDeereOperationsSetupCard() {
  const { language } = useLanguage()
  const [setup, setSetup] = useState<JohnDeereSetup | null>(null)
  const [embedOk, setEmbedOk] = useState<boolean | null>(null)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const copy = useMemo(
    () =>
      language === 'ar'
        ? {
            title: 'John Deere — Operations Center',
            lead: 'تتبع الآليات على map.deere.com داخل التطبيق. اختياري: ربط Platform API للمؤسسة والآلات.',
            embedOk: 'بروكسي الخريطة يعمل على الخادم.',
            embedBad: 'بروكسي الخريطة غير متاح — شغّل backend على المنفذ 3011 مع npm run dev:clean.',
            oauthOn: 'OAuth مُعد على الخادم.',
            oauthOff: 'أضف JOHN_DEERE_CLIENT_ID و JOHN_DEERE_CLIENT_SECRET في ملف .env ثم أعد تشغيل الخادم.',
            redirect: 'Redirect URI (سجّله في developer.deere.com):',
            connected: 'متصل بـ John Deere API.',
            notConnected: 'غير متصل — اضغط «ربط الحساب» (اختياري للخريطة؛ مطلوب لـ API).',
            connect: 'ربط الحساب',
            disconnect: 'قطع الاتصال',
            disconnected: 'تم قطع الاتصال.',
          }
        : {
            title: 'John Deere — Operations Center',
            lead: 'Machine map tracking via map.deere.com in-app. Optional: link Platform API for org / machine data.',
            embedOk: 'Map embed proxy is reachable on the server.',
            embedBad: 'Map embed proxy unavailable — run the backend (port 3011), e.g. npm run dev:clean.',
            oauthOn: 'OAuth credentials are configured on the server.',
            oauthOff: 'Set JOHN_DEERE_CLIENT_ID and JOHN_DEERE_CLIENT_SECRET in .env, then restart the backend.',
            redirect: 'Redirect URI (register at developer.deere.com):',
            connected: 'Connected to John Deere Platform API.',
            notConnected: 'Not connected — use Connect (optional for map; needed for API).',
            connect: 'Connect account',
            disconnect: 'Disconnect',
            disconnected: 'Disconnected.',
          },
    [language],
  )

  const refresh = useCallback(async () => {
    try {
      const [s, st, eh] = await Promise.all([
        fetchJohnDeereSetup(),
        fetchJohnDeereOAuthStatus(),
        fetchJohnDeereMapEmbedHealth(),
      ])
      setSetup(s)
      setConnected(Boolean(st.connected))
      setEmbedOk(Boolean(eh.ok))
    } catch {
      setEmbedOk(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 4000)
    return () => window.clearTimeout(t)
  }, [flash])

  const onConnect = () => startJohnDeereOAuthConnect()

  const onDisconnect = async () => {
    setBusy(true)
    try {
      await disconnectJohnDeereOAuth()
      setConnected(false)
      setFlash(copy.disconnected)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dashboard-settings-card" aria-labelledby="jd-setup-heading">
      <h2 id="jd-setup-heading" className="dashboard-settings-card-heading">
        {copy.title}
      </h2>
      <p className="dashboard-settings-hint">{copy.lead}</p>
      <ul className="dashboard-settings-hint" style={{ marginTop: 8, paddingInlineStart: 18 }}>
        <li className={embedOk ? 'dashboard-settings-flash ok' : embedOk === false ? 'dashboard-settings-flash err' : ''}>
          {embedOk ? copy.embedOk : embedOk === false ? copy.embedBad : '…'}
        </li>
        <li className={setup?.oauthConfigured ? 'dashboard-settings-flash ok' : 'dashboard-settings-flash err'}>
          {setup?.oauthConfigured ? copy.oauthOn : copy.oauthOff}
        </li>
        {connected ? (
          <li className="dashboard-settings-flash ok">{copy.connected}</li>
        ) : (
          <li>{copy.notConnected}</li>
        )}
      </ul>
      {setup?.redirectUri ? (
        <p className="dashboard-settings-hint">
          {copy.redirect}{' '}
          <code dir="ltr" style={{ userSelect: 'all' }}>
            {setup.redirectUri}
          </code>
        </p>
      ) : null}
      <div className="dashboard-settings-actions">
        <button
          type="button"
          className="gis-btn gis-btn-primary"
          disabled={!setup?.oauthConfigured || busy}
          onClick={onConnect}
        >
          {copy.connect}
        </button>
        <button
          type="button"
          className="gis-btn gis-btn-outline"
          disabled={!connected || busy}
          onClick={() => void onDisconnect()}
        >
          {copy.disconnect}
        </button>
        {flash ? <span className="dashboard-settings-flash ok">{flash}</span> : null}
      </div>
    </section>
  )
}
