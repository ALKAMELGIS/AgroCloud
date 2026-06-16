import type { ChangeEvent, RefObject } from 'react'
import type { GeoExplorerMessage } from '../../../lib/geoExplorerGemini'
import { GeoExplorerGeminiInputRow } from './GeoExplorerGeminiInputRow'
import { GeoExplorerGeminiMessageParts } from './GeoExplorerGeminiMessageParts'

export type GeoExplorerCssPrefix = 'gis-geo-explorer' | 'si-geo-explorer'

export type GeoExplorerGeminiChatBodyProps = {
  cssPrefix: GeoExplorerCssPrefix
  messages: GeoExplorerMessage[]
  busy: boolean
  error: string
  draft: string
  onDraftChange: (next: string) => void
  pendingImage: { mime: string; base64: string } | null
  onClearPendingImage: () => void
  fileInputRef: RefObject<HTMLInputElement | null>
  onAttachChange: (e: ChangeEvent<HTMLInputElement>) => void
  onSend: (voiceOverrideText?: string) => void
  textareaAriaLabel: string
}

function pfx(prefix: GeoExplorerCssPrefix, part: string): string {
  return `${prefix}-${part}`
}

/**
 * Shared Gemini Geo AI / Geo Explorer chat UI (messages, input, attach, footnote).
 * Parent supplies layout chrome (header, tabs, close) and `cssPrefix` for GIS vs Satellite stylesheets.
 */
export function GeoExplorerGeminiChatBody(props: GeoExplorerGeminiChatBodyProps) {
  const {
    cssPrefix,
    messages,
    busy,
    error,
    draft,
    onDraftChange,
    pendingImage,
    onClearPendingImage,
    fileInputRef,
    onAttachChange,
    onSend,
    textareaAriaLabel,
  } = props

  return (
    <>
      <div className={pfx(cssPrefix, 'messages')}>
        <div className={`${pfx(cssPrefix, 'row')} ${pfx(cssPrefix, 'row--model')}`}>
          <div className={pfx(cssPrefix, 'avatar')} aria-hidden>
            <i className="fa-solid fa-globe" />
          </div>
          <div className={`${pfx(cssPrefix, 'bubble')} ${pfx(cssPrefix, 'bubble--welcome')}`}>
            Hello! Im Agro Cloud - GeoAI - Describe a place, upload an image, or ask for directions. When a location is
            clear, the map will fly there
          </div>
        </div>
        {messages.map(msg => (
          <div key={msg.id} className={`${pfx(cssPrefix, 'row')} ${pfx(cssPrefix, `row--${msg.role}`)}`}>
            {msg.role === 'model' ? (
              <div className={pfx(cssPrefix, 'avatar')} aria-hidden>
                <i className="fa-solid fa-wand-magic-sparkles" />
              </div>
            ) : null}
            <div className={pfx(cssPrefix, 'bubble')}>
              <GeoExplorerGeminiMessageParts msg={msg} cssPrefix={cssPrefix} />
            </div>
          </div>
        ))}
        {busy ? (
          <div className={`${pfx(cssPrefix, 'row')} ${pfx(cssPrefix, 'row--model')}`} aria-busy="true">
            <div className={pfx(cssPrefix, 'avatar')} aria-hidden>
              <i className="fa-solid fa-wand-magic-sparkles" />
            </div>
            <div className={`${pfx(cssPrefix, 'bubble')} ${pfx(cssPrefix, 'bubble--typing')}`} role="status" aria-live="polite">
              <span className={pfx(cssPrefix, 'typing-dots')} aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span className={pfx(cssPrefix, 'typing-label')}>Thinking…</span>
            </div>
          </div>
        ) : null}
      </div>
      {error ? <p className={pfx(cssPrefix, 'error')}>{error}</p> : null}
      {pendingImage ? (
        <p className={pfx(cssPrefix, 'pending-img')}>
          <i className="fa-solid fa-image" aria-hidden /> Image ready to send
          <button type="button" className={pfx(cssPrefix, 'linkish')} onClick={onClearPendingImage}>
            Remove
          </button>
        </p>
      ) : null}
      <GeoExplorerGeminiInputRow
        cssPrefix={cssPrefix}
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={onSend}
        busy={busy}
        pendingImage={pendingImage}
        fileInputRef={fileInputRef}
        onAttachChange={onAttachChange}
        textareaAriaLabel={textareaAriaLabel}
      />
      <p className={pfx(cssPrefix, 'footnote')}>
        Powered by Google Gemini. Set <code>VITE_GEMINI_API_KEY</code> or save under System Settings → API Tokens → Gemini
        API. Do not commit keys.
      </p>
    </>
  )
}
