import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../lib/i18n'
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey'
import { useDeepseekApiKey } from '../../hooks/useDeepseekApiKey'
import { buildGisContentLayersContext } from '../../lib/geoAiChatClaude'
import { AGRO_AI_CHAT_SYSTEM, agroChatWithDeepSeek, agroChatWithGemini, type AgroChatTurn } from '../../lib/agroAiChat'
import './AiAgroChat.css'

type Msg = { id: string; role: 'user' | 'assistant'; text: string }

type Provider = 'gemini' | 'deepseek'

const INTRO_EN =
  "Hello! I'm AgriCloud AI Agro-Chat. For your saved GIS layers I prioritize GIS Content in this browser; for general topics (e.g. broad weather or definitions) I add clear, labeled general knowledge when your layers don't hold the answer."
const INTRO_AR =
  'مرحباً! أنا محادثة AgriCloud الذكية. أبحث أولاً في بيانات طبقاتك المحفوظة (GIS Content)؛ وإن لم تكفِ، أضيف إجابة عامة من المعرفة العامة مع تصنيف واضح لرفع الدقة وتقليل اللبس.'

export default function AiAgroChat() {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const geminiKey = useGeminiApiKey()
  const deepseekKey = useDeepseekApiKey()

  const [provider, setProvider] = useState<Provider>('gemini')
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [inputMode, setInputMode] = useState<'text' | 'attachment' | 'image' | 'voice'>('text')
  const [pickedAssetName, setPickedAssetName] = useState('')
  const inFlight = useRef(false)
  const attachmentRef = useRef<HTMLInputElement | null>(null)
  const imageRef = useRef<HTMLInputElement | null>(null)

  const introText = ar ? INTRO_AR : INTRO_EN

  const clearChat = useCallback(() => {
    inFlight.current = false
    setBusy(false)
    setMessages([])
    setDraft('')
    setError('')
    setPickedAssetName('')
    setInputMode('text')
  }, [])

  const onPickAttachment = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPickedAssetName(f.name)
    setInputMode('attachment')
    e.target.value = ''
  }, [])

  const onPickImage = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPickedAssetName(f.name)
    setInputMode('image')
    e.target.value = ''
  }, [])

  const toggleVoiceUi = useCallback(() => {
    setInputMode(prev => (prev === 'voice' ? 'text' : 'voice'))
  }, [])

  const send = useCallback(() => {
    const trimmed = draft.trim()
    if (inFlight.current || !trimmed) return

    const key = provider === 'gemini' ? geminiKey.trim() : deepseekKey.trim()
    if (!key) {
      setError(
        ar
          ? 'أضف مفتاح API من إعدادات النظام → رموز API (Gemini أو DeepSeek) أو عيّن متغير البيئة المناسب.'
          : provider === 'gemini'
            ? 'Add a Gemini API key: System Settings → API Tokens → Google Gemini (Cloud AI), or set VITE_GEMINI_API_KEY.'
            : 'Add a DeepSeek API key: System Settings → API Tokens → DeepSeek, or set VITE_DEEPSEEK_API_KEY.',
      )
      return
    }

    const userId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `u-${Date.now()}`
    setDraft('')
    setError('')
    inFlight.current = true
    setBusy(true)

    setMessages(prev => {
      const priorTurns: AgroChatTurn[] = prev.map(m => ({ role: m.role, text: m.text }))
      const historyWithUser: Msg[] = [...prev, { id: userId, role: 'user', text: trimmed }]

      queueMicrotask(async () => {
        try {
          const gisCtx = await buildGisContentLayersContext()
          const uiLangLine = ar
            ? 'UI locale — reply language: **Arabic** for every assistant message (headings, bullets, and labels such as «من المعرفة العامة» where relevant).'
            : 'UI locale — reply language: **English** for every assistant message (headings, bullets, and labels such as "General:" where relevant).'
          const system = `${AGRO_AI_CHAT_SYSTEM}\n\n${uiLangLine}\n\n---\nGIS CONTENT (browser snapshot — use first for layer-specific questions):\n${gisCtx}`

          let reply: string
          if (provider === 'gemini') {
            reply = await agroChatWithGemini({
              apiKey: key,
              systemInstruction: system,
              turns: priorTurns,
              userMessage: trimmed,
            })
          } else {
            reply = await agroChatWithDeepSeek({
              apiKey: key,
              system,
              turns: priorTurns,
              userMessage: trimmed,
            })
          }

          const aid =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `a-${Date.now()}`
          setMessages(h => [...h, { id: aid, role: 'assistant', text: reply }])
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          inFlight.current = false
          setBusy(false)
        }
      })

      return historyWithUser
    })
  }, [ar, draft, provider, geminiKey, deepseekKey])

  const displayRows: Msg[] = messages.length === 0 ? [{ id: 'intro', role: 'assistant', text: introText }] : messages

  return (
    <div className="page aagc-page">
      <div className="aagc-shell">
        <header className="aagc-header">
          <div className="aagc-brand">
            <div className="aagc-bot-icon" aria-hidden>
              <i className="fa-solid fa-seedling" />
            </div>
            <div className="aagc-titles">
              <h1 className="aagc-title">{ar ? 'محادثة Agro الذكية' : 'AI Agro-Chat'}</h1>
              <p className="aagc-sub">
                <Link to="/dashboards/ai-agro-cloud">AI AgroCloud</Link>
                {' · '}
                {ar ? 'محتوى GIS' : 'GIS Content'}
              </p>
            </div>
          </div>
          <div className="aagc-toolbar">
            <div className="aagc-provider" role="group" aria-label={ar ? 'محرك الذكاء' : 'AI provider'}>
              <button
                type="button"
                aria-pressed={provider === 'gemini'}
                onClick={() => setProvider('gemini')}
                disabled={busy}
              >
                {ar ? 'Gemini (سحابة)' : 'Gemini (Cloud AI)'}
              </button>
              <button
                type="button"
                aria-pressed={provider === 'deepseek'}
                onClick={() => setProvider('deepseek')}
                disabled={busy}
              >
                DeepSeek
              </button>
            </div>
            <button type="button" className="aagc-clear" onClick={clearChat} title={ar ? 'مسح' : 'Clear'} aria-label={ar ? 'مسح المحادثة' : 'Clear chat'}>
              <i className="fa-solid fa-trash-can" aria-hidden />
            </button>
          </div>
        </header>

        <div className="aagc-messages" role="log" aria-live="polite" aria-relevant="additions">
          {displayRows.map(m => (
            <div key={m.id} className={`aagc-row aagc-row--${m.role === 'user' ? 'user' : 'bot'}`}>
              <div className="aagc-bubble">
                <p>{m.text}</p>
              </div>
            </div>
          ))}
          {busy ? (
            <div className="aagc-row aagc-row--bot">
              <div className="aagc-bubble">
                <span className="aagc-typing">
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                  {ar ? 'جارٍ التفكير…' : 'Thinking…'}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <p className="aagc-error">{error}</p> : null}

        <footer className="aagc-footer">
          <input ref={attachmentRef} type="file" hidden onChange={onPickAttachment} />
          <input ref={imageRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          {pickedAssetName ? (
            <div className="aagc-picked-asset" role="status">
                <i className={inputMode === 'image' ? 'fa-solid fa-image' : 'fa-solid fa-paperclip'} aria-hidden />
              <span>{pickedAssetName}</span>
              <button
                type="button"
                className="aagc-picked-asset__clear"
                onClick={() => {
                  setPickedAssetName('')
                  setInputMode('text')
                }}
                aria-label={ar ? 'إزالة المرفق' : 'Remove selected asset'}
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </div>
          ) : null}
          <div className="aagc-input-row">
            <textarea
              className="aagc-input"
              rows={2}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={ar ? 'اكتب سؤالك…' : 'Type your question…'}
              disabled={busy}
              aria-label={ar ? 'رسالة' : 'Message'}
            />
            <button type="button" className="aagc-send" onClick={() => void send()} disabled={busy || !draft.trim()}>
              {ar ? 'إرسال' : 'Send'}
            </button>
            <div className="aagc-input-tools" role="group" aria-label={ar ? 'أدوات الإدخال' : 'Input tools'}>
              <button
                type="button"
                className={`aagc-tool-btn${inputMode === 'attachment' ? ' is-active' : ''}`}
                onClick={() => attachmentRef.current?.click()}
                title={ar ? 'إرفاق ملف' : 'Attachment file'}
                aria-label={ar ? 'إرفاق ملف' : 'Attachment file'}
                disabled={busy}
              >
                <i className="fa-solid fa-paperclip" aria-hidden />
              </button>
              <button
                type="button"
                className={`aagc-tool-btn${inputMode === 'image' ? ' is-active' : ''}`}
                onClick={() => imageRef.current?.click()}
                title={ar ? 'إرفاق صورة' : 'Image attachment'}
                aria-label={ar ? 'إرفاق صورة' : 'Image attachment'}
                disabled={busy}
              >
                <i className="fa-solid fa-image" aria-hidden />
              </button>
              <button
                type="button"
                className={`aagc-tool-btn${inputMode === 'voice' ? ' is-active is-recording' : ''}`}
                onClick={toggleVoiceUi}
                title={ar ? 'تسجيل صوت' : 'Voice recording'}
                aria-label={ar ? 'تسجيل صوت' : 'Voice recording'}
                aria-pressed={inputMode === 'voice'}
                disabled={busy}
              >
                <i className="fa-solid fa-microphone" aria-hidden />
              </button>
            </div>
          </div>
          <p className="aagc-hint">
            {ar
              ? 'الأولوية لطبقات GIS المحفوظة؛ للأسئلة العامة يُذكر المصدر (GIS مقابل معرفة عامة). المفاتيح: إعدادات API أو VITE_GEMINI_API_KEY / VITE_DEEPSEEK_API_KEY.'
              : 'GIS Content first for your layers; general answers labeled when not from your data. Keys: System Settings → API Tokens, or VITE_GEMINI_API_KEY / VITE_DEEPSEEK_API_KEY.'}
          </p>
        </footer>
      </div>
    </div>
  )
}
